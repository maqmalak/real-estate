"""Endpoints for the React app (/estate): session boot, dashboard, plot search and plot detail."""

import math

import frappe
from frappe import _
from frappe.utils import add_days, add_months, add_to_date, flt, get_first_day, getdate, now_datetime, nowdate

from realestate.geo import centroid, load_geometry

OPEN_TASK = ("Open", "Working", "Pending Review", "Overdue")
STAFF_ROLES = ("System Manager", "Sales Manager", "Sales User", "Accounts User", "Accounts Manager", "Projects User", "Projects Manager",
			   "Recovery Officer", "Society Manager")


@frappe.whitelist(methods=["GET"])
def boot() -> dict:
	"""Who is logged in, the CSRF token for POSTs, and app settings (works for Guest too)."""
	user = frappe.session.user
	if user == "Guest":
		return {"user": None}
	roles = frappe.get_roles()
	settings = frappe.get_cached_doc("RE Settings")
	return {
		"user": user, "full_name": frappe.utils.get_fullname(user), "user_image": frappe.db.get_value("User", user, "user_image"),
		"roles": roles, "is_staff": bool(set(roles) & set(STAFF_ROLES)), "csrf_token": frappe.sessions.get_csrf_token(),
		"default_project": settings.default_project, "mock_mode": bool(settings.mock_mode),
		"company": settings.company, "currency": "PKR",
	}


def _staff():
	if not set(frappe.get_roles()) & set(STAFF_ROLES):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# ---------------------------------------------------------------- dashboard
@frappe.whitelist(methods=["GET"])
def dashboard(granularity: str = "week", kind: str = "installments") -> dict:
	_staff()
	today = getdate(nowdate())
	month_start = get_first_day(today)
	sql = lambda q, *a: flt(frappe.db.sql(q, a)[0][0])  # noqa: E731
	from realestate import scope

	# managers see the scheme; an agent sees their own bookings, receipts, customers' bills, visits, follow-ups, chats
	P, B, S = scope.payment(), scope.booking(), scope.bill()
	plots_total = frappe.db.count("RE Plot")
	plots_sold = frappe.db.count("RE Plot", {"status": ("in", ["Booked", "Sold", "Possession Given"])})
	kpis = {
		"collected_month": sql(f"select sum(amount) from `tabRE Payment` where docstatus=1 and posting_date >= %s{P}", month_start),
		"collected_prev_month": sql(f"select sum(amount) from `tabRE Payment` where docstatus=1 and posting_date >= %s and posting_date < %s{P}",
									get_first_day(add_days(month_start, -1)), month_start),
		"plots_sold": plots_sold, "plots_total": plots_total,
		"overdue_installments": sql(f"select sum(overdue_amount) from `tabRE Booking` where docstatus=1{B}"),
		"overdue_bookings": frappe.db.count("RE Booking", {"docstatus": 1, "status": "Overdue", **scope.filters("RE Booking")}),
		"society_overdue": sql(f"select sum(outstanding_amount) from `tabRE Society Bill` where status in ('Overdue','Partly Paid','Unpaid','Due') and due_date < %s{S}", today),
		"visits_today": frappe.db.count("RE Site Visit", {"visit_on": ("between", [f"{today} 00:00:00", f"{today} 23:59:59"]),
														  "status": ("!=", "Cancelled"), **scope.filters("RE Site Visit")}),
		"follow_ups_today": frappe.db.count("CRM Task", {"status": ("in", ["Backlog", "Todo", "In Progress"]),
														 "due_date": ("<=", f"{today} 23:59:59"), **scope.filters("CRM Task")}),
		"unread_chats": frappe.db.count("RE Conversation", {"unread_count": (">", 0), **scope.filters("RE Conversation")}),
	}
	from realestate.analytics import dashboard_extra

	return {"kpis": kpis, "collection": collection_series(granularity, kind), "visits": visit_pipeline(),
			"schedule": todays_schedule(), "urgent": urgent_queue(), "analytics": dashboard_extra(),
			"expiring": expiring_documents(), "approvals": pending_approvals(), "scope": scope.info()}


def _buckets(granularity):
	today = getdate(nowdate())
	if granularity == "month":
		starts = [get_first_day(add_months(today, -i)) for i in range(5, -1, -1)]
		ends = [add_days(add_months(s, 1), -1) for s in starts]
		labels = [s.strftime("%b %Y") for s in starts]
	else:
		monday = add_days(today, -today.weekday())
		starts = [add_days(monday, -7 * i) for i in range(7, -1, -1)]
		ends = [add_days(s, 6) for s in starts]
		labels = [s.strftime("%d %b") for s in starts]
	return list(zip(labels, starts, ends))


@frappe.whitelist(methods=["GET"])
def collection_series(granularity: str = "week", kind: str = "installments") -> list[dict]:
	"""Per week / month: collected, still pending (due in the period, not paid, not yet late) and overdue."""
	_staff()
	from realestate import scope

	P, B, S = scope.payment(), scope.booking("b"), scope.bill()
	today = getdate(nowdate())
	out = []
	for label, start, end in _buckets(granularity):
		if kind == "society":
			collected = frappe.db.sql(f"""select sum(amount) from `tabRE Payment` where docstatus=1 and payment_against='Society Bill'
				and posting_date between %s and %s{P}""", (start, end))[0][0]
			due = frappe.db.sql(f"""select sum(outstanding_amount), sum(case when due_date < %s then outstanding_amount else 0 end)
				from `tabRE Society Bill` where due_date between %s and %s{S}""", (today, start, end))[0]
		else:
			collected = frappe.db.sql(f"""select sum(amount) from `tabRE Payment` where docstatus=1 and payment_against='Booking'
				and posting_date between %s and %s{P}""", (start, end))[0][0]
			due = frappe.db.sql(f"""select sum(i.amount - i.paid_amount), sum(case when i.due_date < %s then i.amount - i.paid_amount else 0 end)
				from `tabRE Installment` i join `tabRE Booking` b on b.name = i.parent
				where b.docstatus = 1 and i.due_date between %s and %s{B}""", (today, start, end))[0]
		outstanding, overdue = flt(due[0]), flt(due[1])
		out.append({"label": label, "collected": flt(collected), "pending": max(outstanding - overdue, 0), "overdue": overdue})
	return out


def visit_pipeline():
	"""Contacted (scheduled) -> Confirmed -> Completed -> Booked, plus cancelled / no-show, last 90 days."""
	since = add_days(nowdate(), -90)
	from realestate import scope

	rows = frappe.get_all("RE Site Visit", {"visit_on": (">=", since), **scope.filters("RE Site Visit")}, ["status", "outcome", "party_type", "party"], limit=0)
	booked = 0
	for r in rows:
		if r.status == "Completed" and r.party_type == "CRM Deal" and frappe.db.get_value("CRM Deal", r.party, "status") == "Booking":
			booked += 1
	scheduled = sum(1 for r in rows if r.status == "Scheduled")
	completed = sum(1 for r in rows if r.status == "Completed")
	cancelled = sum(1 for r in rows if r.status in ("Cancelled", "No Show"))
	contacted = len(rows)
	confirmed = scheduled + completed
	pct = lambda a, b: round(a * 100 / b, 1) if b else 0  # noqa: E731
	return [
		{"stage": "Contacted", "count": contacted, "rate": 100},
		{"stage": "Confirmed", "count": confirmed, "rate": pct(confirmed, contacted)},
		{"stage": "Completed", "count": completed, "rate": pct(completed, confirmed)},
		{"stage": "Booked", "count": booked, "rate": pct(booked, completed)},
		{"stage": "Cancelled", "count": cancelled, "rate": pct(cancelled, contacted)},
	]


def todays_schedule():
	start = now_datetime().replace(hour=0, minute=0, second=0, microsecond=0)
	from realestate import scope

	visits = frappe.get_all("RE Site Visit", {"visit_on": ("between", [start, add_to_date(start, days=2)]), "status": "Scheduled", **scope.filters("RE Site Visit")},
							["name", "party_type", "party", "party_name", "mobile_no", "visit_on", "interested_plot", "agent"], order_by="visit_on", limit=10)
	tasks = frappe.get_all("CRM Task", {"status": ("in", ["Backlog", "Todo", "In Progress"]), "due_date": ("<=", add_to_date(start, days=1)), **scope.filters("CRM Task")},
						   ["name", "title", "due_date", "reference_doctype", "reference_docname", "assigned_to", "priority"], order_by="due_date", limit=10)
	for t in tasks:
		t.mobile_no = frappe.db.get_value(t.reference_doctype, t.reference_docname, "mobile_no") if t.reference_doctype else None
	return {"visits": visits, "follow_ups": tasks}


def expiring_documents():
	"""Vault documents (NOCs, approvals, registry papers) that are expired or due for renewal."""
	return frappe.get_all("RE Vault Document", {"status": ("in", ["Expired", "Expiring Soon"])},
						  ["name", "title", "document_type", "authority", "expiry_date", "status", "responsible"], order_by="expiry_date asc", limit=10)


def pending_approvals():
	"""Approvals waiting for a manager (transfers, cancellations & refunds, re-allotments, merges, waivers, discounts)."""
	from realestate.operations import approvals

	try:
		rows = approvals()
	except frappe.PermissionError:
		return {"count": 0, "rows": []}
	return {"count": len(rows), "rows": [{"doctype": r.get("doctype"), "name": r.get("name"), "state": r.get("workflow_state"),
										  "who": r.get("customer_name") or r.get("to_customer_name") or r.get("new_customer_name") or r.get("plot"),
										  "modified": r.get("modified"), "can_act": bool(r.get("actions"))} for r in rows[:8]]}


def urgent_queue():
	tasks = frappe.get_all("Task", {"re_project": ("is", "set"), "status": ("in", OPEN_TASK), "priority": ("in", ["Urgent", "High"])},
						   ["name", "subject", "priority", "re_priority", "status", "re_plot", "re_block", "type", "exp_end_date", "creation"],
						   order_by="exp_end_date asc", limit=50)
	tasks.sort(key=lambda t: (t.priority != "Urgent", str(t.exp_end_date or "")))
	return tasks[:12]


# ---------------------------------------------------------------- plots
@frappe.whitelist(methods=["GET"])
def plot_filters() -> dict:
	_staff()
	return {"blocks": frappe.get_all("RE Block", ["name", "block_code", "color", "block_type"], order_by="block_code"),
			"sizes": frappe.get_all("RE Plot Size", ["name", "area_marla", "plot_type"], order_by="plot_type desc, area_marla")}


@frappe.whitelist(methods=["GET"])
def plot_detail(plot: str) -> dict:
	_staff()
	p = frappe.get_doc("RE Plot", plot)
	p.check_permission("read")
	out = {"plot": p.as_dict(no_default_fields=True), "booking": None, "installments": [], "bills": [], "payments": [], "files": [],
		   "tasks": [], "owner": None, "agent": None, "nearby": _nearby(p)}
	if p.booking:
		b = frappe.get_doc("RE Booking", p.booking)
		out["booking"] = {k: b.get(k) for k in ("name", "booking_date", "status", "payment_plan", "net_price", "paid_amount", "outstanding_amount",
												 "overdue_amount", "next_due_date", "next_due_amount", "discount", "total_price",
												 "possession_date", "possession_given_by", "customer_cnic", "nominee_name")}
		out["installments"] = [{k: r.get(k) for k in ("label", "due_date", "amount", "paid_amount", "status")} for r in b.installments]
		out["agent"] = {"user": b.agent, "name": frappe.utils.get_fullname(b.agent), "mobile_no": frappe.db.get_value("User", b.agent, "mobile_no")} if b.agent else None
	if p.customer:
		c = frappe.db.get_value("Customer", p.customer, ["name", "customer_name", "mobile_no", "email_id"], as_dict=True)
		out["owner"] = c
		out["bills"] = frappe.get_all("RE Society Bill", {"plot": plot}, ["name", "bill_month_label", "total_amount", "outstanding_amount", "status", "due_date"],
									  order_by="billing_month desc", limit=12)
		out["payments"] = frappe.get_all("RE Payment", {"plot": plot, "docstatus": 1}, ["name", "posting_date", "amount", "mode_of_payment", "payment_against"],
										 order_by="posting_date desc", limit=50)
	out["files"] = frappe.get_all("File", {"attached_to_doctype": ("in", ["RE Plot", "RE Booking"]), "attached_to_name": ("in", [plot, p.booking or ""])},
								  ["name", "file_name", "file_url", "creation"], order_by="creation desc")
	from realestate.documents import plot_svg

	out["photos"] = [f for f in frappe.get_all("File", {"attached_to_doctype": "RE Plot", "attached_to_name": plot},
											   ["name", "file_name", "file_url", "creation"], order_by="creation desc")
					 if (f.file_name or "").lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp", "gif", "heic")]
	out["site_plan_svg"] = plot_svg(plot)
	out["tasks"] = frappe.get_all("Task", {"re_plot": plot}, ["name", "subject", "status", "priority", "creation"], order_by="creation desc", limit=20)
	return out


def _nearby(p):
	"""Distance from the plot to the nearest gate, park, masjid, school, graveyard and boulevard."""
	if not p.centre_lat:
		return []
	wanted = ["Main Gate", "Back Gate", "Central Park", "Park", "Masjid", "School", "Graveyard", "Boulevard"]
	feats = frappe.get_all("RE Map Feature", {"project": p.project, "feature_type": ("in", wanted)}, ["feature_name", "feature_type", "geojson"], limit=0)
	best = {}
	for f in feats:
		geom = load_geometry(f.geojson)
		pts = _points(geom)
		if not pts:
			continue
		d = min(_metres(p.centre_lat, p.centre_lng, lat, lng) for lng, lat in pts)
		key = f.feature_type
		if key not in best or d < best[key]["metres"]:
			best[key] = {"type": key, "name": f.feature_name, "metres": round(d)}
	return sorted(best.values(), key=lambda x: x["metres"])


def _points(geom):
	if not geom:
		return []
	t, c = geom["type"], geom["coordinates"]
	if t == "Point":
		return [c]
	if t == "LineString":
		return c
	if t == "Polygon":
		return c[0]
	if t == "MultiPolygon":
		return [pt for poly in c for pt in poly[0]]
	return []


def _metres(lat1, lng1, lat2, lng2):
	k = math.pi / 180
	x = (lng2 - lng1) * k * math.cos((lat1 + lat2) / 2 * k)
	y = (lat2 - lat1) * k
	return math.sqrt(x * x + y * y) * 6371000


# ---------------------------------------------------------------- generic React forms
SKIP_TYPES = {"HTML", "Button", "Image", "Fold", "Heading", "Geolocation", "Table MultiSelect", "Signature", "Barcode"}
FIELD_KEYS = ("fieldname", "fieldtype", "label", "options", "reqd", "read_only", "hidden", "depends_on", "mandatory_depends_on",
			  "fetch_from", "fetch_if_empty", "default", "precision", "description", "in_list_view", "in_standard_filter", "bold", "collapsible")


def _fields(meta):
	out = []
	for df in meta.fields:
		if df.fieldtype in SKIP_TYPES:
			continue
		row = {k: df.get(k) for k in FIELD_KEYS if df.get(k) not in (None, "", 0)}
		row["fieldname"], row["fieldtype"] = df.fieldname, df.fieldtype
		out.append(row)
	return out


@frappe.whitelist(methods=["GET"])
def form_meta(doctype: str) -> dict:
	"""DocType definition shaped for the React generic list / form (custom fields included)."""
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	meta = frappe.get_meta(doctype)
	children = {df.fieldname: {"doctype": df.options, "fields": _fields(frappe.get_meta(df.options))} for df in meta.get_table_fields()}
	return {
		"doctype": doctype, "issingle": meta.issingle, "is_submittable": meta.is_submittable, "title_field": meta.title_field,
		"search_fields": [f.strip() for f in (meta.search_fields or "").split(",") if f.strip()], "sort_field": meta.sort_field,
		"sort_order": meta.sort_order, "fields": _fields(meta), "children": children, "module": meta.module,
		"can_create": frappe.has_permission(doctype, "create"),
	}


# ---------------------------------------------------------------- insights & development
def _sql(q, *a, as_dict=True):
	return frappe.db.sql(q, a, as_dict=as_dict)


@frappe.whitelist(methods=["GET"])
def insights() -> dict:
	"""Management analytics in one call: sales, collections, receivables, CRM, agents, cost vs revenue, society."""
	_staff()
	from realestate import scope

	if scope.agent():
		frappe.throw(_("Insights cover the whole scheme and are for managers — your own figures are on the dashboard."), frappe.PermissionError)
	today = getdate(nowdate())
	start = get_first_day(add_months(today, -11))
	months = [get_first_day(add_months(start, i)) for i in range(12)]
	by_month = lambda rows, key="m": {r[key]: r for r in rows}  # noqa: E731

	sales = by_month(_sql("""select date_format(booking_date, '%%Y-%%m') m, count(*) n, sum(net_price) v from `tabRE Booking`
		where docstatus=1 and booking_date >= %s group by m""", start))
	coll = by_month(_sql("""select date_format(posting_date, '%%Y-%%m') m, sum(case when payment_against='Booking' then amount else 0 end) inst,
		sum(case when payment_against='Society Bill' then amount else 0 end) soc from `tabRE Payment` where docstatus=1 and posting_date >= %s group by m""", start))
	monthly = [{"month": m.strftime("%b %y"), "bookings": (sales.get(m.strftime("%Y-%m")) or {}).get("n", 0),
				"booked": flt((sales.get(m.strftime("%Y-%m")) or {}).get("v")), "installments": flt((coll.get(m.strftime("%Y-%m")) or {}).get("inst")),
				"society": flt((coll.get(m.strftime("%Y-%m")) or {}).get("soc"))} for m in months]

	blocks = _sql("""select p.block, count(*) plots, sum(p.status in ('Booked','Sold','Possession Given')) sold, sum(p.status='Available') available,
		sum(case when p.status='Available' then p.list_price else 0 end) unsold_value from `tabRE Plot` p group by p.block order by p.block""")
	for b in blocks:
		row = _sql("select sum(net_price) v, sum(paid_amount) r, sum(overdue_amount) o from `tabRE Booking` where docstatus=1 and block=%s", b.block)[0]
		b.update({"booked": flt(row.v), "received": flt(row.r), "overdue": flt(row.o)})

	aging = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
	for r in _sql("select overdue_amount a, datediff(%s, overdue_since) d from `tabRE Booking` where docstatus=1 and overdue_amount > 0", today):
		key = "0-30" if r.d <= 30 else "31-60" if r.d <= 60 else "61-90" if r.d <= 90 else "90+"
		aging[key] += flt(r.a)

	modes = _sql("""select mode_of_payment mode, sum(amount) amount from `tabRE Payment` where docstatus=1 and posting_date >= %s
		group by mode_of_payment order by amount desc""", start)

	agents = _sql("""select agent, count(*) bookings, sum(net_price) booked, sum(paid_amount) collected, sum(overdue_amount) overdue
		from `tabRE Booking` where docstatus=1 and agent is not null group by agent order by booked desc""")
	for a in agents:
		a["name"] = frappe.utils.get_fullname(a.agent)
		a["leads"] = frappe.db.count("CRM Lead", {"lead_owner": a.agent})
		a["calls"] = frappe.db.count("CRM Call Log", {"caller": a.agent})
		a["messages"] = frappe.db.count("WhatsApp Message", {"owner": a.agent, "direction": "Outgoing"})

	sources = _sql("""select l.source, count(*) leads, sum(d.status='Booking') bookings from `tabCRM Lead` l
		left join `tabCRM Deal` d on d.lead = l.name group by l.source order by leads desc""")
	# each stage counts deals that reached it or a later stage, so the funnel always narrows
	funnel = [
		{"stage": "Leads", "count": frappe.db.count("CRM Lead")},
		{"stage": "Opportunities", "count": frappe.db.count("CRM Deal")},
		{"stage": "Site visits", "count": frappe.db.count("CRM Deal", {"status": ("in", ["Site Visit", "Negotiation", "Booking"])})},
		{"stage": "Negotiation", "count": frappe.db.count("CRM Deal", {"status": ("in", ["Negotiation", "Booking"])})},
		{"stage": "Bookings", "count": frappe.db.count("CRM Deal", {"status": "Booking"})},
	]
	defaulters = _sql("""select customer, customer_name, count(*) plots, sum(overdue_amount) overdue, min(overdue_since) since from `tabRE Booking`
		where docstatus=1 and overdue_amount > 0 group by customer, customer_name order by overdue desc limit 10""")

	gl = lambda cond, *a: flt(frappe.db.sql(f"select sum(debit - credit) from `tabGL Entry` g join `tabAccount` ac on ac.name=g.account where g.is_cancelled=0 and {cond}", a)[0][0])  # noqa: E731
	dev_cost = gl("ac.root_type='Expense' and g.project in (select name from `tabProject` where re_cost_head is not null)")
	land = flt(frappe.db.sql("select sum(net_purchase_amount) from `tabAsset` where docstatus=1 and asset_category='Land'")[0][0])
	infra = flt(frappe.db.sql("select sum(net_purchase_amount) from `tabAsset` where docstatus=1 and asset_category!='Land'")[0][0])
	booked = flt(frappe.db.sql("select sum(net_price) from `tabRE Booking` where docstatus=1")[0][0])
	received = flt(frappe.db.sql("select sum(paid_amount) from `tabRE Booking` where docstatus=1")[0][0])
	unsold = flt(frappe.db.sql("select sum(list_price) from `tabRE Plot` where status='Available'")[0][0])

	soc_cc = frappe.get_all("Cost Center", {"cost_center_name": "ZG Society Operations"}, pluck="name") or [""]
	society = []
	for m in months[-6:]:
		end = add_days(add_months(m, 1), -1)
		inc = -gl("ac.root_type='Income' and g.cost_center in %s and g.posting_date between %s and %s", soc_cc, m, end)
		exp = gl("ac.root_type='Expense' and g.cost_center in %s and g.posting_date between %s and %s", soc_cc, m, end)
		society.append({"month": m.strftime("%b %y"), "income": inc, "expense": exp})

	from realestate.analytics import insights_extra

	return {
		"extra": insights_extra(),
		"monthly": monthly, "blocks": blocks, "aging": [{"bucket": k, "amount": v} for k, v in aging.items()], "modes": modes,
		"agents": agents, "sources": sources, "funnel": funnel, "defaulters": defaulters, "society": society,
		"economics": {"land": land, "development": dev_cost, "infrastructure": infra, "booked": booked, "received": received, "unsold": unsold,
					  "receivable": booked - received, "projected_margin": booked + unsold - land - dev_cost - infra},
	}


@frappe.whitelist(methods=["GET"])
def development() -> dict:
	"""Development cost heads with budget, actual, committed, paid and payable, plus asset and stock summaries."""
	_staff()
	from realestate.real_estate.report.development_budget_vs_actual.development_budget_vs_actual import execute

	_cols, heads, _m, _chart, summary = execute({})
	assets = _sql("""select asset_category category, count(*) n, sum(net_purchase_amount) value from `tabAsset` where docstatus=1 group by asset_category""")
	stock = _sql("""select b.item_code, i.item_name, i.item_group, b.actual_qty, b.stock_value, i.stock_uom from `tabBin` b join `tabItem` i on i.name=b.item_code
		where b.warehouse like 'Zarmeen Site Store%%' and b.actual_qty > 0 order by b.stock_value desc""")
	open_mr = frappe.db.count("Material Request", {"docstatus": ("<", 2), "status": ("not in", ["Ordered", "Stopped", "Cancelled", "Received"])})
	open_po = frappe.db.count("Purchase Order", {"docstatus": 1, "status": ("in", ["To Receive and Bill", "To Bill", "To Receive"])})
	payable = flt(frappe.db.sql("select sum(outstanding_amount) from `tabPurchase Invoice` where docstatus=1")[0][0])
	features = _sql("""select feature_type, count(*) n, avg(completion_pct) pct, sum(asset_status='Completed') done from `tabRE Map Feature`
		where asset_status is not null and asset_status != '' group by feature_type order by feature_type""")
	return {"heads": heads, "summary": summary, "assets": assets, "stock": stock, "open_mr": open_mr, "open_po": open_po, "payable": payable,
			"progress": features}


@frappe.whitelist(methods=["GET"])
def map_config() -> dict:
	"""Map provider for the React map. The Google key is a browser key by nature (it ships to the browser) — restrict it by
	HTTP referrer in Google Cloud; it is stored encrypted and only handed to signed-in users."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	s = frappe.get_cached_doc("RE Settings")
	key = s.get_password("google_maps_api_key", raise_exception=False) if s.google_maps_api_key else None
	google = s.map_provider == "Google Maps" and bool(key)
	return {"provider": "google" if google else "maplibre", "google_key": key if google else None, "google_map_id": s.google_map_id if google else None,
			"google_available": bool(key)}
