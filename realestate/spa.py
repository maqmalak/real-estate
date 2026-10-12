"""Endpoints for the React app (/estate): session boot, dashboard, plot search and plot detail."""

import math

import frappe
from frappe import _
from frappe.utils import add_days, add_months, add_to_date, cint, flt, get_first_day, getdate, now_datetime, nowdate

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
			  "fetch_from", "fetch_if_empty", "default", "precision", "description", "in_list_view", "in_standard_filter", "bold", "collapsible",
			  "columns")


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
	# payable on development heads only (matches the heads); other supplier bills (security, utilities …) reported apart
	payable = sum(flt(h["payable"]) for h in heads)
	payable_other = flt(frappe.db.sql("""select sum(outstanding_amount) from `tabPurchase Invoice` where docstatus=1 and outstanding_amount > 0
		and ifnull(project, '') not in (select name from `tabProject` where re_cost_head is not null)""")[0][0])
	features = _sql("""select feature_type, count(*) n, avg(completion_pct) pct, sum(asset_status='Completed') done from `tabRE Map Feature`
		where asset_status is not null and asset_status != '' group by feature_type order by feature_type""")
	# physical progress per cost head: map features linked to the head's ERPNext Project
	phys = {r.erp_project: r for r in _sql("""select erp_project, count(*) n, avg(ifnull(completion_pct,0)) pct, sum(asset_status='Completed') done,
		sum(asset_status='In Progress') wip from `tabRE Map Feature` where erp_project is not null and ifnull(asset_status,'') != '' group by erp_project""")}
	for h in heads:
		f = phys.get(h["project"])
		h.update({"progress": flt(f.pct) if f else None, "features": int(f.n) if f else 0, "features_done": int(f.done or 0) if f else 0,
				  "features_wip": int(f.wip or 0) if f else 0})
	projects = [h["project"] for h in heads] or [""]
	start = get_first_day(add_months(nowdate(), -11))
	spend = {r.m: r for r in _sql("""select date_format(posting_date, '%%Y-%%m') m, sum(debit - credit) amount from `tabGL Entry`
		where is_cancelled=0 and project in %s and posting_date >= %s and account in (select name from `tabAccount` where root_type='Expense')
		group by m""", projects, start)}
	billed = {r.m: r for r in _sql("""select date_format(posting_date, '%%Y-%%m') m, sum(base_grand_total) billed, sum(base_grand_total - outstanding_amount) paid
		from `tabPurchase Invoice` where docstatus=1 and project in %s and posting_date >= %s group by m""", projects, start)}
	months = []
	for i in range(12):
		key = str(add_months(start, i))[:7]
		months.append({"month": key, "spent": flt(spend[key].amount) if key in spend else 0,
					   "billed": flt(billed[key].billed) if key in billed else 0, "paid": flt(billed[key].paid) if key in billed else 0})
	suppliers = _sql("""select supplier, count(*) invoices, sum(base_grand_total) billed, sum(outstanding_amount) outstanding,
			min(case when outstanding_amount > 0 then due_date end) oldest_due
		from `tabPurchase Invoice` where docstatus=1 and project in %s group by supplier order by billed desc limit 8""", projects)
	contractors = _sql("""select contractor, count(*) n, avg(ifnull(completion_pct,0)) pct, sum(asset_status='Completed') done
		from `tabRE Map Feature` where contractor is not null and ifnull(asset_status,'') != '' group by contractor order by n desc""")
	categories = _sql("""select category, count(*) n, avg(ifnull(completion_pct,0)) pct, sum(asset_status='Completed') done,
			sum(asset_status='In Progress') wip, sum(asset_status='Planned') planned
		from `tabRE Map Feature` where ifnull(asset_status,'') != '' group by category order by category""")
	requests = _sql("""select mr.name, mr.status, mr.transaction_date, mr.schedule_date, mr.material_request_type,
			count(i.name) items, sum(i.qty * ifnull(i.rate, 0)) amount, max(i.project) project
		from `tabMaterial Request` mr left join `tabMaterial Request Item` i on i.parent = mr.name
		where mr.docstatus < 2 and mr.status not in ('Ordered', 'Stopped', 'Cancelled', 'Received', 'Transferred', 'Issued')
		group by mr.name order by mr.schedule_date limit 8""")
	orders = _sql("""select name, supplier, status, transaction_date, schedule_date, base_grand_total amount, per_received, per_billed, project
		from `tabPurchase Order` where docstatus=1 and status in ('To Receive and Bill', 'To Bill', 'To Receive') order by schedule_date limit 8""")
	return {"heads": heads, "summary": summary, "assets": assets, "stock": stock, "open_mr": open_mr, "open_po": open_po, "payable": payable,
			"payable_other": payable_other, "progress": features, "months": months, "suppliers": suppliers, "contractors": contractors, "categories": categories,
			"requests": requests, "orders": orders}


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


# ---------------------------------------------------------------- project profile (React: /re/d/re-project/<name>)
SOLD = ("Booked", "Sold", "Possession Given")


@frappe.whitelist(methods=["GET"])
def project_profile(project: str) -> dict:
	"""One scheme at a glance: land, inventory by status and block, sales and collections (scoped for agents), and development
	progress from infrastructure features and ERPNext Projects."""
	_staff()
	from realestate import scope

	p = frappe.get_doc("RE Project", project)
	p.check_permission("read")
	plots = _sql("""select status, count(*) n, sum(list_price) value, sum(area_marla) marla from `tabRE Plot`
		where project=%s and ifnull(merged_into,'')='' group by status""", project)
	blocks = _sql("""select b.name, b.block_name, b.block_type, b.planned_plots, b.color, b.area_kanal,
			count(p.name) plots, sum(p.status in ('Booked','Sold','Possession Given')) sold, sum(p.status='Available') available,
			sum(p.status in ('Hold','Reserved','Blocked')) held, sum(case when p.status='Available' then p.list_price else 0 end) stock_value
		from `tabRE Block` b left join `tabRE Plot` p on p.block=b.name and ifnull(p.merged_into,'')=''
		where b.project=%s group by b.name order by b.block_name""", project)
	bk = scope.booking("b")
	sales = _sql(f"""select count(*) bookings, sum(b.net_price) net_sales, sum(b.paid_amount) paid, sum(b.outstanding_amount) outstanding,
			sum(b.overdue_amount) overdue, sum(b.overdue_amount > 0) overdue_count, sum(b.possession_date is not null) possessions,
			sum(b.discount) discount
		from `tabRE Booking` b where b.project=%s and b.docstatus=1 and b.status != 'Cancelled'{bk}""", project)[0]
	start = get_first_day(add_months(nowdate(), -11))
	booked = _sql(f"""select date_format(b.booking_date, '%%Y-%%m') m, count(*) n, sum(b.net_price) value from `tabRE Booking` b
		where b.project=%s and b.docstatus=1 and b.booking_date >= %s{bk} group by m""", project, start)
	paid = _sql(f"""select date_format(r.posting_date, '%%Y-%%m') m, sum(r.amount) amount from `tabRE Payment` r
		join `tabRE Booking` b on b.name = r.booking
		where b.project=%s and r.docstatus=1 and r.posting_date >= %s{scope.payment("r")} group by m""", project, start)
	months, by_b, by_p = [], {r.m: r for r in booked}, {r.m: r.amount for r in paid}
	for i in range(12):
		key = str(add_months(start, i))[:7]
		months.append({"month": key, "bookings": int(by_b[key].n) if key in by_b else 0,
					   "sales": flt(by_b[key].value) if key in by_b else 0, "collected": flt(by_p.get(key))})
	features = _sql("""select category, count(*) n, avg(ifnull(completion_pct,0)) pct, sum(asset_status='Completed') done,
			sum(asset_status='In Progress') wip, sum(estimated_cost) cost
		from `tabRE Map Feature` where project=%s and ifnull(asset_status,'') != '' group by category order by category""", project)
	works = []
	if frappe.db.has_column("Project", "re_project"):
		works = _sql("""select name, project_name, status, percent_complete, expected_end_date from `tabProject`
			where re_project=%s order by status='Completed', modified desc limit 8""", project)
	n_feat = sum(f.n for f in features)
	return {
		"project": {"name": p.name, "project_name": p.project_name, "location": p.location, "company": p.company,
					"total_area_kanal": p.total_area_kanal, "boundary_area_kanal": p.boundary_area_kanal,
					"land_use": [{"category": r.category, "label": r.label, "percent": r.percent, "area_kanal": r.area_kanal} for r in p.land_use]},
		"plots": plots, "blocks": blocks, "sales": sales, "months": months, "features": features, "works": works,
		"development_pct": (sum(f.pct * f.n for f in features) / n_feat) if n_feat else None,
		"scope": scope.info(),
	}


def _months(project_or_block_sql, args, bk, pay):
	"""12 monthly buckets of bookings value and receipts for bookings matching `project_or_block_sql` (on alias b)."""
	start = get_first_day(add_months(nowdate(), -11))
	booked = _sql(f"""select date_format(b.booking_date, '%%Y-%%m') m, count(*) n, sum(b.net_price) value from `tabRE Booking` b
		where {project_or_block_sql} and b.docstatus=1 and b.booking_date >= %s{bk} group by m""", *args, start)
	paid = _sql(f"""select date_format(r.posting_date, '%%Y-%%m') m, sum(r.amount) amount from `tabRE Payment` r
		join `tabRE Booking` b on b.name = r.booking
		where {project_or_block_sql} and r.docstatus=1 and r.posting_date >= %s{pay} group by m""", *args, start)
	by_b, by_p, out = {r.m: r for r in booked}, {r.m: r.amount for r in paid}, []
	for i in range(12):
		key = str(add_months(start, i))[:7]
		out.append({"month": key, "bookings": int(by_b[key].n) if key in by_b else 0,
					"sales": flt(by_b[key].value) if key in by_b else 0, "collected": flt(by_p.get(key))})
	return out


@frappe.whitelist(methods=["GET"])
def block_profile(block: str) -> dict:
	"""One block at a glance: inventory by status, size and street, premium plots, pricing, sales and collections (scoped for
	agents), overdue bookings, society bills and open maintenance."""
	_staff()
	from realestate import scope

	b = frappe.get_doc("RE Block", block)
	b.check_permission("read")
	live = "block=%s and ifnull(merged_into,'')=''"
	plots = _sql(f"select status, count(*) n, sum(list_price) value, sum(area_marla) marla from `tabRE Plot` where {live} group by status", block)
	sizes = _sql(f"""select ifnull(plot_size,'—') plot_size, count(*) n, sum(status in {SOLD}) sold, sum(status='Available') available,
			avg(list_price) avg_price, sum(area_marla) marla from `tabRE Plot` where {live} group by plot_size order by avg_price""", block)
	streets = _sql(f"""select ifnull(nullif(street,''),'—') street, count(*) n, sum(status in {SOLD}) sold from `tabRE Plot`
		where {live} group by street order by street""", block)
	premium = _sql(f"""select sum(is_corner) corner, sum(is_corner and status in {SOLD}) corner_sold,
			sum(is_park_facing) park, sum(is_park_facing and status in {SOLD}) park_sold,
			sum(is_boulevard_facing) boulevard, sum(is_boulevard_facing and status in {SOLD}) boulevard_sold,
			min(case when status='Available' then list_price end) min_price, max(case when status='Available' then list_price end) max_price,
			avg(case when status='Available' then list_price end) avg_price
		from `tabRE Plot` where {live}""", block)[0]
	bk = scope.booking("b")
	sales = _sql(f"""select count(*) bookings, sum(b.net_price) net_sales, sum(b.paid_amount) paid, sum(b.outstanding_amount) outstanding,
			sum(b.overdue_amount) overdue, sum(b.overdue_amount > 0) overdue_count, sum(b.possession_date is not null) possessions,
			sum(b.discount) discount
		from `tabRE Booking` b where b.block=%s and b.docstatus=1 and b.status != 'Cancelled'{bk}""", block)[0]
	overdue = _sql(f"""select b.name, b.customer_name, b.plot, b.overdue_amount, b.overdue_since from `tabRE Booking` b
		where b.block=%s and b.docstatus=1 and b.overdue_amount > 0{bk} order by b.overdue_amount desc limit 6""", block)
	bills = _sql(f"""select count(*) n, sum(total_payable) payable, sum(paid_amount) paid, sum(outstanding_amount) outstanding,
			sum(status='Overdue') overdue from `tabRE Society Bill` sb where sb.block=%s and sb.docstatus < 2{scope.bill("sb")}""", block)[0]
	tasks = []
	if frappe.db.has_column("Task", "re_block"):
		tasks = _sql("select status, count(*) n from `tabTask` where re_block=%s and status in %s group by status", block, OPEN_TASK)
	return {
		"block": {"name": b.name, "block_name": b.block_name, "block_type": b.block_type, "project": b.project, "plot_size": b.plot_size,
				  "planned_plots": b.planned_plots, "area_kanal": b.area_kanal, "land_use_percent": b.land_use_percent, "color": b.color},
		"plots": plots, "sizes": sizes, "streets": streets, "premium": premium, "sales": sales, "overdue": overdue, "bills": bills,
		"tasks": tasks, "months": _months("b.block=%s", [block], bk, scope.payment("r")), "scope": scope.info(),
	}


@frappe.whitelist(methods=["GET"])
def plot_overview(block: str | None = None, plot_size: str | None = None, status: str | None = None) -> dict:
	"""Scheme-wide plot inventory at a glance for the React plot list: value, sell-through, sales pace and months of stock,
	block × status, size mix with price per marla, premium plots, payment health of sold plots and plots on hold.
	Availability is scheme-wide (agents need it to sell); sales pace is scoped for agents."""
	_staff()
	from realestate import scope

	# optional filters from the plot list's top bar; every block / size / status query below honours them
	conds = ["ifnull(merged_into,'')=''"]
	if block:
		conds.append(f"block = {frappe.db.escape(block)}")
	if plot_size:
		conds.append(f"plot_size = {frappe.db.escape(plot_size)}")
	if status:
		conds.append(f"status = {frappe.db.escape(status)}")
	live = " and ".join(conds)
	bfil = (f" and b.block = {frappe.db.escape(block)}" if block else "") + (f" and b.plot_size = {frappe.db.escape(plot_size)}" if plot_size else "")
	status = _sql(f"select status, count(*) n, sum(list_price) value, sum(area_marla) marla from `tabRE Plot` where {live} group by status")
	blocks = _sql(f"""select p.block, b.color, b.block_type, count(*) n, sum(p.status='Available') available, sum(p.status in {SOLD}) sold,
			sum(p.status in ('Hold','Reserved','Blocked')) held, sum(case when p.status='Available' then p.list_price else 0 end) stock_value
		from `tabRE Plot` p left join `tabRE Block` b on b.name=p.block where {' and '.join(c.replace('merged_into', 'p.merged_into').replace('block =', 'p.block =').replace('plot_size =', 'p.plot_size =').replace('status =', 'p.status =') for c in conds)}
		group by p.block order by p.block""")
	sizes = _sql(f"""select ifnull(plot_size,'—') plot_size, count(*) n, sum(status='Available') available, sum(status in {SOLD}) sold,
			avg(list_price) avg_price, min(list_price) min_price, max(list_price) max_price,
			sum(list_price) / nullif(sum(area_marla), 0) per_marla
		from `tabRE Plot` where {live} group by plot_size order by avg_price""")
	premium = _sql(f"""select 'Corner' kind, sum(is_corner) n, sum(is_corner and status='Available') available, sum(is_corner and status in {SOLD}) sold,
			avg(case when is_corner then list_price end) avg_price from `tabRE Plot` where {live}
		union all select 'Park facing', sum(is_park_facing), sum(is_park_facing and status='Available'), sum(is_park_facing and status in {SOLD}),
			avg(case when is_park_facing then list_price end) from `tabRE Plot` where {live}
		union all select 'Boulevard facing', sum(is_boulevard_facing), sum(is_boulevard_facing and status='Available'),
			sum(is_boulevard_facing and status in {SOLD}), avg(case when is_boulevard_facing then list_price end) from `tabRE Plot` where {live}
		union all select 'Standard', sum(not (is_corner or is_park_facing or is_boulevard_facing)),
			sum(not (is_corner or is_park_facing or is_boulevard_facing) and status='Available'),
			sum(not (is_corner or is_park_facing or is_boulevard_facing) and status in {SOLD}),
			avg(case when not (is_corner or is_park_facing or is_boulevard_facing) then list_price end) from `tabRE Plot` where {live}""")
	payment = _sql(f"""select b.status, count(*) n, sum(b.outstanding_amount) outstanding, sum(b.overdue_amount) overdue
		from `tabRE Booking` b where b.docstatus=1 and b.status in ('Paid', 'Due', 'Overdue'){scope.booking("b")}{bfil} group by b.status""")
	holds = _sql(f"""select name, block, plot_size, status, hold_reason, list_price, modified from `tabRE Plot`
		where {live} and status in ('Hold','Reserved','Blocked') order by modified desc limit 8""")
	bk = scope.booking("b") + bfil
	pace = _sql(f"""select sum(b.booking_date >= %s) d30, sum(b.booking_date >= %s) d90, sum(b.booking_date >= %s and b.booking_date < %s) prev30,
			sum(case when b.booking_date >= %s then b.net_price else 0 end) v30
		from `tabRE Booking` b where b.docstatus=1 and b.status != 'Cancelled'{bk}""",
		add_days(nowdate(), -30), add_days(nowdate(), -90), add_days(nowdate(), -60), add_days(nowdate(), -30), add_days(nowdate(), -30))[0]
	top = _sql(f"""select b.plot, b.block, b.plot_size, b.customer_name, b.net_price, b.booking_date from `tabRE Booking` b
		where b.docstatus=1 and b.status != 'Cancelled'{bk} order by b.booking_date desc, b.creation desc limit 5""")
	merged = frappe.db.count("RE Plot", {"merged_into": ("is", "set"), **({"block": block} if block else {}), **({"plot_size": plot_size} if plot_size else {})})
	return {"filters": {"block": block, "plot_size": plot_size, "status": status}, "merged": merged, "status": status, "blocks": blocks, "sizes": sizes, "premium": premium, "payment": payment, "holds": holds,
			"pace": pace, "recent": top, "scope": scope.info()}


@frappe.whitelist(methods=["GET"])
def plot_profile(plot: str) -> dict:
	"""One plot at a glance (React plot page): price vs its size and block, the current booking's payment progress and
	installment timeline, ownership and price history, society bills, interest (visits / deals), documents, open tasks and
	neighbours on the same street. Booking money is shown only if the user may read that booking."""
	_staff()
	p = frappe.get_doc("RE Plot", plot)
	p.check_permission("read")
	block = frappe.db.get_value("RE Block", p.block, ["block_name", "block_type", "color"], as_dict=True) or {}
	live = "ifnull(merged_into,'')=''"
	size = _sql(f"""select avg(list_price) avg_price, min(list_price) min_price, max(list_price) max_price, count(*) n,
			sum(status='Available') available, sum(status in {SOLD}) sold from `tabRE Plot` where plot_size=%s and {live}""", p.plot_size)[0]
	blk = _sql(f"""select sum(list_price) / nullif(sum(area_marla), 0) per_marla, count(*) n, sum(status in {SOLD}) sold,
			sum(status='Available') available, sum(plot_size != %s) other_sizes from `tabRE Plot` where block=%s and {live}""", p.plot_size, p.block)[0]
	street = _sql(f"""select status, count(*) n from `tabRE Plot` where block=%s and ifnull(street,'')=%s and {live} group by status""",
		p.block, p.street or "")
	booking = None
	if p.booking and frappe.db.exists("RE Booking", p.booking) and frappe.has_permission("RE Booking", "read", doc=p.booking):
		b = frappe.get_doc("RE Booking", p.booking)
		rows = [{"label": r.label, "due_date": cstr_date(r.due_date), "amount": flt(r.amount), "paid": flt(r.paid_amount), "status": r.status}
				for r in b.installments]
		last = _sql("""select posting_date, amount, name from `tabRE Payment` where booking=%s and docstatus=1 order by posting_date desc limit 1""", b.name)
		booking = {
			"name": b.name, "customer": b.customer, "customer_name": b.customer_name, "mobile_no": b.mobile_no, "status": b.status,
			"booking_date": cstr_date(b.booking_date), "net_price": flt(b.net_price), "discount": flt(b.discount), "paid": flt(b.paid_amount),
			"outstanding": flt(b.outstanding_amount), "overdue": flt(b.overdue_amount), "overdue_since": cstr_date(b.overdue_since),
			"next_due_date": cstr_date(b.next_due_date), "next_due_amount": flt(b.next_due_amount), "payment_plan": b.payment_plan,
			"agent": frappe.utils.get_fullname(b.agent) if b.agent else None, "possession_date": cstr_date(b.possession_date),
			"installments": rows, "receipts": frappe.db.count("RE Payment", {"booking": b.name, "docstatus": 1}),
			"last_receipt": last[0] if last else None,
		}
	transfers = _sql("""select name, transfer_date, from_customer, to_customer, workflow_state, transfer_fee from `tabRE Plot Transfer`
		where plot=%s and docstatus < 2 order by transfer_date""", plot) if frappe.has_permission("RE Plot Transfer", "read") else []
	bills = _sql("""select count(*) n, sum(outstanding_amount) outstanding, sum(status='Overdue') overdue, max(billing_month) last_month
		from `tabRE Society Bill` where plot=%s and docstatus < 2""", plot)[0]
	interest = {
		"visits": frappe.db.count("RE Site Visit", {"interested_plot": plot}),
		"deals": frappe.db.count("CRM Deal", {"re_interested_plot": plot}) if frappe.get_meta("CRM Deal").has_field("re_interested_plot") else 0,
		"last_visit": frappe.db.get_value("RE Site Visit", {"interested_plot": plot}, "modified", order_by="modified desc"),
	}
	docs = _sql("""select document_type, max(creation) at, count(*) n from `tabRE Generated Document` where plot=%s group by document_type
		order by at desc limit 8""", plot)
	tasks = _sql("select name, subject, status, priority from `tabTask` where re_plot=%s and status in %s order by modified desc limit 5",
		plot, OPEN_TASK) if frappe.db.has_column("Task", "re_plot") else []
	return {
		"plot": {"name": p.name, "plot_no": p.plot_no, "block": p.block, "block_name": block.get("block_name"), "block_type": block.get("block_type"),
				 "color": block.get("color"), "plot_size": p.plot_size, "plot_type": p.plot_type, "area_marla": flt(p.area_marla),
				 "area_sqft": flt(p.area_sqft), "status": p.status, "payment_status": p.payment_status, "list_price": flt(p.list_price),
				 "street": p.street, "is_corner": p.is_corner, "is_park_facing": p.is_park_facing, "is_boulevard_facing": p.is_boulevard_facing,
				 "hold_reason": p.hold_reason, "possession_date": cstr_date(p.possession_date), "project": p.project},
		"size": size, "block_stats": blk, "street": street, "booking": booking, "transfers": transfers, "bills": bills, "interest": interest,
		"price_history": [{"on": cstr_date(r.changed_on), "old": flt(r.old_price), "new": flt(r.new_price), "reason": r.reason} for r in p.price_history],
		"documents": docs, "tasks": tasks,
	}


def cstr_date(d):
	return str(d) if d else None


@frappe.whitelist(methods=["GET"])
def size_overview() -> dict:
	"""Every plot size side by side (React plot-size list and form): dimensions and base price, stock and sell-through,
	list price vs base, price per marla, sales pace and months of stock, collections and overdue, block split, 12-month
	bookings trend and the latest bookings. Bookings are scoped for agents."""
	_staff()
	from realestate import scope

	live = "ifnull(merged_into,'')=''"
	sizes = frappe.get_all("RE Plot Size", ["name", "plot_type", "area_marla", "width_ft", "depth_ft", "base_price", "monthly_maintenance"], order_by="area_marla")
	plots = {r.plot_size: r for r in _sql(f"""select plot_size, count(*) n, sum(status='Available') available, sum(status in {SOLD}) sold,
			sum(status in ('Hold','Reserved','Blocked')) held, sum(status='Possession Given') possessed,
			avg(list_price) avg_price, min(list_price) min_price, max(list_price) max_price, sum(list_price) value,
			sum(case when status='Available' then list_price else 0 end) stock_value, sum(area_marla) marla,
			sum(is_corner) corner, sum(is_park_facing) park, sum(is_boulevard_facing) boulevard
		from `tabRE Plot` where {live} group by plot_size""")}
	bk = scope.booking("b")
	d30, d90 = add_days(nowdate(), -30), add_days(nowdate(), -90)
	sales = {r.plot_size: r for r in _sql(f"""select b.plot_size, count(*) bookings, sum(b.net_price) net, sum(b.paid_amount) paid,
			sum(b.outstanding_amount) outstanding, sum(b.overdue_amount) overdue, sum(b.overdue_amount > 0) overdue_count,
			sum(b.discount) discount, sum(b.total_price) gross, sum(b.booking_date >= %s) d30, sum(b.booking_date >= %s) d90
		from `tabRE Booking` b where b.docstatus=1 and b.status != 'Cancelled'{bk} group by b.plot_size""", d30, d90)}
	blocks = _sql(f"""select plot_size, block, count(*) n, sum(status in {SOLD}) sold, sum(status='Available') available
		from `tabRE Plot` where {live} group by plot_size, block order by block""")
	start = get_first_day(add_months(nowdate(), -11))
	trend = _sql(f"""select b.plot_size, date_format(b.booking_date, '%%Y-%%m') m, count(*) n from `tabRE Booking` b
		where b.docstatus=1 and b.status != 'Cancelled' and b.booking_date >= %s{bk} group by b.plot_size, m""", start)
	months = [str(add_months(start, i))[:7] for i in range(12)]
	recent = _sql(f"""select b.plot_size, b.plot, b.customer_name, b.net_price, b.booking_date from `tabRE Booking` b
		where b.docstatus=1 and b.status != 'Cancelled'{bk} order by b.booking_date desc, b.creation desc limit 60""")
	out = []
	for s in sizes:
		p = plots.get(s.name) or frappe._dict()
		b = sales.get(s.name) or frappe._dict()
		per_month = flt(b.d90) / 3
		out.append({
			**s, "plots": {k: flt(v) if k not in ("plot_size",) else v for k, v in p.items()} if p else {},
			"sales": {k: flt(v) for k, v in b.items() if k != "plot_size"} if b else {},
			"per_month": per_month, "months_left": (flt(p.available) / per_month) if per_month else None,
			"blocks": [r for r in blocks if r.plot_size == s.name],
			"trend": [next((int(t.n) for t in trend if t.plot_size == s.name and t.m == m), 0) for m in months],
			"recent": [r for r in recent if r.plot_size == s.name][:4],
		})
	return {"sizes": out, "months": months, "scope": scope.info()}


@frappe.whitelist(methods=["GET"])
def plan_overview() -> dict:
	"""Every payment plan with its terms and how it performs (React payment-plan list and form): bookings, value, collected,
	overdue rate, average discount, recent use, plus a sample schedule shape (upfront %, tenure, monthly share).
	Bookings are scoped for agents; sample prices come from the plot sizes."""
	_staff()
	from realestate import scope

	plans = frappe.get_all("RE Payment Plan", ["name", "plan_name", "booking_percent", "down_payment_percent", "down_payment_days", "installments",
											   "frequency", "balloon_percent", "balloon_frequency", "development_percent", "development_due_month",
											   "possession_percent", "description"], order_by="installments")
	bk = scope.booking("b")
	use = {r.payment_plan: r for r in _sql(f"""select b.payment_plan, count(*) bookings, sum(b.net_price) net, sum(b.paid_amount) paid,
			sum(b.outstanding_amount) outstanding, sum(b.overdue_amount) overdue, sum(b.overdue_amount > 0) overdue_count,
			sum(b.status='Paid') fully_paid, sum(b.discount) discount, sum(b.total_price) gross, max(b.booking_date) last_used,
			sum(b.booking_date >= %s) d90
		from `tabRE Booking` b where b.docstatus=1 and b.status != 'Cancelled'{bk} group by b.payment_plan""", add_days(nowdate(), -90))}
	months = {"Monthly": 1, "Quarterly": 3, "Half-Yearly": 6}
	out = []
	for p in plans:
		u = use.get(p.name) or {}
		tenure = cint(p.installments) * months.get(p.frequency, 1)
		fixed = sum(flt(p.get(f)) for f in ("booking_percent", "down_payment_percent", "balloon_percent", "development_percent", "possession_percent"))
		out.append({**p, "tenure_months": tenure, "upfront_pct": flt(p.booking_percent) + flt(p.down_payment_percent),
					"installment_pct": max(0, 100 - fixed), "usage": {k: flt(v) if k not in ("payment_plan", "last_used") else v for k, v in dict(u).items()}})
	prices = [{"name": r.name, "price": flt(r.base_price)} for r in frappe.get_all("RE Plot Size", ["name", "base_price"], order_by="base_price")]
	unplanned = frappe.db.count("RE Booking", {"docstatus": 1, "status": ("!=", "Cancelled"), "payment_plan": ("is", "not set")})
	return {"plans": out, "prices": prices, "unplanned": unplanned, "scope": scope.info()}


QUICK_DENY = {"User", "Company", "Account", "Role", "Role Profile", "DocType", "Module Def", "Currency", "Fiscal Year", "Cost Center", "Warehouse",
			  "Workflow State", "Print Format", "Letter Head"}
QUICK_EXTRA = {"Customer": ("re_cnic", "customer_group", "territory"), "Supplier": ("supplier_group",), "Sales Partner": ("partner_type",)}
QUICK_DEFAULTS = {"Customer": {"customer_type": "Individual"}}  # plot buyers are people
QUICK_TYPES = {"Data", "Link", "Select", "Int", "Float", "Currency", "Percent", "Date", "Check", "Small Text", "Text", "Phone", "Dynamic Link"}


@frappe.whitelist(methods=["GET"])
def quick_entry_meta(doctype: str) -> dict:
	"""Fields for an inline "New <doctype>" dialog from a Link field's "+" (React): the required and quick-entry fields,
	or `eligible: false` with the reason when inline creation makes no sense (no create right, submittable, single,
	child table, required child rows)."""
	meta = frappe.get_meta(doctype)
	reason = None
	if doctype in QUICK_DENY:
		reason = "create on its own page"
	elif not frappe.has_permission(doctype, "create"):
		reason = "no permission"
	elif meta.is_submittable or meta.issingle or meta.istable or meta.is_virtual:
		reason = "not a master"
	elif any(df.reqd for df in meta.get_table_fields()):
		reason = "needs child rows"
	name_field = (meta.autoname or "").split(":", 1)[1] if (meta.autoname or "").startswith("field:") else None
	fields = []
	for df in meta.fields:
		if df.fieldtype not in QUICK_TYPES or df.hidden or df.read_only or df.fetch_from and df.read_only:
			continue
		if not (df.reqd or df.allow_in_quick_entry or df.fieldname == name_field or df.fieldname == meta.title_field
				or df.fieldname in QUICK_EXTRA.get(doctype, ())):
			continue
		row = {k: df.get(k) for k in FIELD_KEYS if df.get(k) not in (None, "", 0)}
		row["fieldname"], row["fieldtype"] = df.fieldname, df.fieldtype
		if df.fieldname in QUICK_DEFAULTS.get(doctype, {}):
			row["default"] = QUICK_DEFAULTS[doctype][df.fieldname]
		fields.append(row)
	first = name_field or meta.title_field
	fields.sort(key=lambda f: 0 if f["fieldname"] == first else 1)
	if not fields and not reason:
		reason = "no quick-entry fields"
	return {"doctype": doctype, "eligible": reason is None, "reason": reason, "label": _(doctype.replace("RE ", "")), "fields": fields[:12]}
