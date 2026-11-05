"""Data for the React land screens: /re/land (land bank, khasra map, pipeline), /re/land/payments (sellers, schedules,
receipts, plot adjustments) and /re/land/legal (due diligence, documents, court cases). Plus the map layer, the
"plots planned over land not yet acquired" check and merging acquired khasras into the project boundary."""

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from realestate import land
from realestate import land_calc as L

ACQUIRED = ("Registry / Mutation Done", "Possession Taken", "Acquired")
IN_PROCESS = ("Under Negotiation", "Due Diligence", "Token Paid", "Agreement Signed", "Payment in Progress")
LAYER_COLORS = {"Acquired": "#16a34a", "Payment in Progress": "#0ea5e9", "Agreement": "#8b5cf6", "Negotiation": "#f59e0b",
				"Disputed": "#dc2626", "Dropped": "#94a3b8"}
OPEN_CASES = ("Pending", "Under Hearing", "Stay Order")


def _kanal(sqft: float) -> float:
	return round(L.in_unit(sqft, "Kanal", land.marla_sqft()), 2)


def _geo(value):
	try:
		return json.loads(value) if value else None
	except ValueError:
		return None


def _project() -> str | None:
	return frappe.db.get_single_value("RE Settings", "default_project") or frappe.db.get_value("RE Project", {}, "name")


def parcels_for_map(project: str | None = None) -> list[dict]:
	"""Khasra outlines coloured by acquisition stage — the society map's "Land acquisition" layer."""
	if not frappe.has_permission("RE Land Parcel", "read"):
		return []
	filters = {"geojson": ("is", "set")}
	if project:
		filters["project"] = ("in", [project, "", None])
	rows = frappe.get_all("RE Land Parcel", filters, ["name", "title", "khasra_nos", "area_display", "stage", "geojson"], limit=0)
	for r in rows:
		r.geojson = _geo(r.geojson)
		r.layer = land.LAYER.get(r.stage, "Negotiation")
		r.color = LAYER_COLORS.get(r.layer, "#94a3b8")
	return [r for r in rows if r.geojson]


# ---------------------------------------------------------------- geometry: planned land vs acquired land
def _shapes(rows):
	"""(row, shapely geometry) in lng / lat. Only area ratios are compared (outside / total), and those do not change under
	one common scaling, so no projection is needed."""
	from shapely.geometry import shape

	out = []
	for r in rows:
		g = _geo(r.get("geojson")) if isinstance(r.get("geojson"), str) else r.get("geojson")
		if not g:
			continue
		try:
			s = shape(g.get("geometry", g) if g.get("type") == "Feature" else g).buffer(0)
		except Exception:
			continue
		if not s.is_empty:
			out.append((r, s))
	return out


def _acquired_union(project):
	from shapely.ops import unary_union

	rows = frappe.get_all("RE Land Parcel", {"stage": ("in", ACQUIRED), "geojson": ("is", "set"), "project": ("in", [project, "", None])},
						  ["name", "geojson"], limit=0)
	shapes = [s for _r, s in _shapes(rows)]
	return unary_union(shapes) if shapes else None


def planning_conflicts(project: str | None = None, limit: int = 40) -> dict:
	"""Blocks and plots whose outline is not on acquired land (more than 2% outside the acquired khasras)."""
	project = project or _project()
	if not frappe.db.exists("RE Land Parcel", {"geojson": ("is", "set")}):
		return {"checked": False, "blocks": [], "plots": [], "plot_count": 0}
	acquired = _acquired_union(project)
	out = {"checked": True, "blocks": [], "plots": [], "plot_count": 0}
	for doctype, key, fields in (("RE Block", "blocks", ["name", "geojson"]), ("RE Plot", "plots", ["name", "geojson", "block", "status"])):
		rows = frappe.get_all(doctype, {"project": project, "geojson": ("is", "set"), **({"merged_into": ("is", "not set")} if doctype == "RE Plot" else {})},
							  fields, limit=0)
		for r, s in _shapes(rows):
			outside = s.area if acquired is None else s.difference(acquired).area
			if s.area and outside / s.area > 0.02:
				item = {"name": r["name"], "outside_pct": round(outside / s.area * 100, 1), **({"block": r.get("block"), "status": r.get("status")} if key == "plots" else {})}
				if key == "plots":
					out["plot_count"] += 1
					if len(out["plots"]) < limit:
						out["plots"].append(item)
				else:
					out["blocks"].append(item)
	return out


@frappe.whitelist()
def merge_into_boundary(project: str | None = None) -> dict:
	"""Admin: replace the project's boundary with the union of the acquired khasras."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only an Admin can change the project boundary"), frappe.PermissionError)
	from shapely.geometry import mapping
	from shapely.ops import unary_union

	project = project or _project()
	rows = frappe.get_all("RE Land Parcel", {"stage": ("in", ACQUIRED), "geojson": ("is", "set"), "project": ("in", [project, "", None])},
						  ["name", "geojson"], limit=0)
	from shapely.geometry import shape

	shapes = []
	for r in rows:
		g = _geo(r.geojson)
		if g:
			shapes.append(shape(g.get("geometry", g) if g.get("type") == "Feature" else g).buffer(0))
	if not shapes:
		frappe.throw(_("No acquired khasra has an outline yet"))
	union = unary_union(shapes).buffer(0)
	geom = mapping(union)
	p = frappe.get_doc("RE Project", project)
	old = p.boundary_area_kanal
	p.boundary_geojson = json.dumps(geom)
	p.flags.ignore_permissions = True
	p.save()
	p.add_comment("Info", _("Boundary replaced by the union of {0} acquired khasras").format(len(shapes)))
	return {"parcels": len(shapes), "old_area_kanal": old, "new_area_kanal": frappe.db.get_value("RE Project", project, "boundary_area_kanal")}


# ---------------------------------------------------------------- /re/land
@frappe.whitelist(methods=["GET"])
def overview() -> dict:
	land.guard()
	project = _project()
	target = flt(frappe.db.get_value("RE Project", project, "total_area_kanal")) if project else 0
	parcels = frappe.get_all("RE Land Parcel", {}, ["name", "title", "mauza", "khasra_nos", "khewat_no", "area_sqft", "area_display", "stage", "land_type",
													"diligence_clear", "diligence_override", "responsible", "geojson", "modified"], order_by="khasra_nos", limit=0)
	owners = {}
	for o in frappe.get_all("RE Parcel Owner", {"parenttype": "RE Land Parcel"}, ["parent", "owner_name"], limit=0):
		owners.setdefault(o.parent, []).append(o.owner_name)
	pending = {}
	for c in frappe.get_all("RE Parcel Check", {"parenttype": "RE Land Parcel", "mandatory": 1, "status": ("!=", "Verified")}, ["parent"], limit=0):
		pending[c.parent] = pending.get(c.parent, 0) + 1
	cases = {}
	for c in frappe.db.sql("""select cp.parcel, c.name from `tabRE Land Case Parcel` cp join `tabRE Land Case` c on c.name=cp.parent
			where c.status in %(open)s""", {"open": OPEN_CASES}, as_dict=True):
		cases.setdefault(c.parcel, []).append(c.name)
	deals_of = {}
	for l in frappe.db.sql("""select distinct l.parcel, d.name, d.status from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent
			where l.parcel is not null""", as_dict=True):
		deals_of.setdefault(l.parcel, []).append({"name": l.name, "status": l.status})
	for p in parcels:
		p.kanal = _kanal(p.area_sqft)
		p.geojson = _geo(p.geojson)
		p.layer = land.LAYER.get(p.stage, "Negotiation")
		p.color = LAYER_COLORS.get(p.layer)
		p.owners = owners.get(p.name, [])
		p.pending_checks = pending.get(p.name, 0)
		p.open_cases = cases.get(p.name, [])
		p.deals = deals_of.get(p.name, [])

	bank = {}
	for p in parcels:
		b = bank.setdefault(p.layer, {"layer": p.layer, "kanal": 0.0, "parcels": 0, "color": LAYER_COLORS.get(p.layer)})
		b["kanal"] += p.kanal
		b["parcels"] += 1
	pipeline = []
	for stage in land.STAGES:
		rows = [p for p in parcels if p.stage == stage]
		pipeline.append({"stage": stage, "parcels": len(rows), "kanal": round(sum(p.kanal for p in rows), 2), "layer": land.LAYER.get(stage)})

	deals = frappe.get_all("RE Land Deal", {"status": ("!=", "Cancelled")}, ["name", "description", "deal_date", "land_for", "land_owners_type", "status",
							"workflow_state", "deal_area_sqft", "deal_area_display", "net_due_amount", "paid_amount", "adjusted_amount", "balance_amount",
							"overdue_lines", "signed_count"], order_by="deal_date desc", limit=0)
	net = sum(flt(d.net_due_amount) for d in deals)
	deal_kanal = sum(_kanal(d.deal_area_sqft) for d in deals)
	money = {"net_due": net, "paid": sum(flt(d.paid_amount) for d in deals), "adjusted": sum(flt(d.adjusted_amount) for d in deals),
			 "balance": sum(flt(d.balance_amount) for d in deals),
			 "per_kanal": round(net / deal_kanal, 0) if deal_kanal else 0, "per_marla": round(net / deal_kanal / 20, 0) if deal_kanal else 0}

	today = getdate(nowdate())
	lines = frappe.db.sql("""select d.name deal, d.description, l.ser, l.owner_name, l.balance, l.mature_date, l.date_ext, l.overdue, l.status
		from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent where d.status not in ('Cancelled','Closed')
		and l.status!='Cancelled' and l.balance>0.5""", as_dict=True)
	for r in lines:
		r.due = r.date_ext or r.mature_date
	overdue = sorted([r for r in lines if r.due and getdate(r.due) < today], key=lambda r: getdate(r.due))
	maturing = sorted([r for r in lines if r.due and today <= getdate(r.due) <= add_days(today, 30)], key=lambda r: getdate(r.due))
	hearings = frappe.get_all("RE Land Case", {"status": ("in", OPEN_CASES), "next_hearing": ("between", [today, add_days(today, 21)])},
							  ["name", "case_title", "court", "next_hearing", "status", "lawyer"], order_by="next_hearing")
	deadlines = frappe.get_all("RE Land Deal", {"status": ("in", ["Executed", "In Payment", "Partially Signed"]),
												"registry_deadline": ("between", [add_days(today, -60), add_days(today, 45)])},
							   ["name", "description", "registry_deadline", "possession_date", "status"], order_by="registry_deadline")
	recent = frappe.get_all("RE Land Payment", {"docstatus": 1}, ["name", "deal", "owner_name", "payment_kind", "posting_date", "amount", "mode_of_payment"],
							order_by="posting_date desc, creation desc", limit=8)
	total_k = round(sum(p.kanal for p in parcels), 2)
	return {
		"project": project, "project_kanal": target, "target_kanal": max(target, total_k), "parcels": parcels, "bank": list(bank.values()), "pipeline": pipeline,
		"acquired_kanal": round(sum(p.kanal for p in parcels if p.stage in ACQUIRED), 2),
		"process_kanal": round(sum(p.kanal for p in parcels if p.stage in IN_PROCESS), 2),
		"disputed_kanal": round(sum(p.kanal for p in parcels if p.stage == "Disputed"), 2),
		"total_kanal": round(sum(p.kanal for p in parcels), 2),
		"money": money, "deals": deals, "overdue": overdue[:30], "maturing": maturing[:30], "hearings": hearings, "deadlines": deadlines,
		"recent_payments": recent, "conflicts": planning_conflicts(project), "layer_colors": LAYER_COLORS, "stages": land.STAGES,
		"can_merge": "System Manager" in frappe.get_roles(),
	}


@frappe.whitelist(methods=["GET"])
def parcel(name: str) -> dict:
	"""Everything about one khasra for the slide-over: owners, deals and payments, checklist, documents, cases, history."""
	land.guard()
	p = frappe.get_doc("RE Land Parcel", name)
	p.check_permission("read")
	lines = frappe.db.sql("""select d.name deal, d.description, d.status deal_status, d.workflow_state, l.ser, l.owner_name, l.kanal, l.marla, l.sqft,
		l.unit, l.rate, l.due_amount, l.extra_amount, l.net_due, l.paid_amount, l.adjusted_amount, l.balance, l.status, l.overdue, l.signed,
		l.mature_date, l.date_ext from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent where l.parcel=%s order by d.deal_date""",
						  name, as_dict=True)
	deals = list({r.deal for r in lines})
	payments = frappe.get_all("RE Land Payment", {"deal": ("in", deals or [""]), "docstatus": 1},
							  ["name", "deal", "ser", "owner_name", "payment_kind", "posting_date", "amount", "wht_amount", "mode_of_payment", "instrument_no"],
							  order_by="posting_date desc", limit=50)
	docs = frappe.get_all("RE Vault Document", {"land_parcel": name}, ["name", "title", "document_type", "issue_date", "expiry_date", "status", "file"],
						  order_by="issue_date desc")
	cases = frappe.db.sql("""select c.name, c.case_title, c.court, c.case_no, c.status, c.next_hearing, c.lawyer from `tabRE Land Case Parcel` cp
		join `tabRE Land Case` c on c.name=cp.parent where cp.parcel=%s order by c.modified desc""", name, as_dict=True)
	return {
		"name": p.name, "title": p.title, "stage": p.stage, "mauza": p.mauza, "tehsil": p.tehsil, "district": p.district, "khewat_no": p.khewat_no,
		"khatooni_no": p.khatooni_no, "square_no": p.square_no, "killa_nos": p.killa_nos, "khasra_nos": p.khasra_nos, "area_display": p.area_display,
		"area_acre": p.area_acre, "kanal": _kanal(p.area_sqft), "land_type": p.land_type, "current_use": p.current_use, "access_road": p.access_road,
		"responsible": p.responsible, "diligence_clear": p.diligence_clear, "diligence_override": p.diligence_override, "override_reason": p.override_reason,
		"owners": [{"owner": o.land_owner, "name": o.owner_name, "share": L.fmt_area(o.share_sqft_total, land.marla_sqft()), "pct": o.share_pct} for o in p.owners],
		"checks": [{"item": c.item, "mandatory": c.mandatory, "status": c.status, "verified_by": c.verified_by, "verified_on": c.verified_on, "document": c.document}
				   for c in p.checks],
		"history": [{"stage": s.stage, "date": s.stage_date, "by": s.responsible, "notes": s.notes} for s in p.stages],
		"lines": lines, "payments": payments, "documents": docs, "cases": cases, "geojson": _geo(p.geojson),
	}


@frappe.whitelist()
def move_parcel(name: str, stage: str, notes: str | None = None) -> dict:
	"""Pipeline board: move a khasra to another stage (the agreement gate still applies)."""
	land.guard(("System Manager", "Land Manager"))
	p = frappe.get_doc("RE Land Parcel", name)
	p.check_permission("write")
	p.set_stage(stage, notes)
	return {"name": p.name, "stage": p.stage}


# ---------------------------------------------------------------- /re/land/payments
@frappe.whitelist(methods=["GET"])
def payments() -> dict:
	land.guard()
	today = getdate(nowdate())
	lines = frappe.db.sql("""select d.name deal, d.description, d.status deal_status, l.ser, l.land_owner, l.owner_name, l.supplier, l.area_sqft,
		l.net_due, l.paid_amount, l.adjusted_amount, l.balance, l.mature_date, l.date_ext, l.status, l.share_pct, l.parcel
		from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent where d.status!='Cancelled'""", as_dict=True)
	owners = {o.name: o for o in frappe.get_all("RE Land Owner", {}, ["name", "display_name", "cnic", "mobile_no", "customer", "bank_name", "iban"], limit=0)}
	sellers: dict[str, dict] = {}
	aging = {"Not due": 0.0, "0–30 days": 0.0, "31–90 days": 0.0, "Over 90 days": 0.0}
	for r in lines:
		o = owners.get(r.land_owner, {})
		s = sellers.setdefault(r.land_owner, {"owner": r.land_owner, "name": o.get("display_name") or r.owner_name, "cnic": o.get("cnic"),
											  "mobile": o.get("mobile_no"), "customer": o.get("customer"), "bank": " ".join(x for x in (o.get("bank_name"), o.get("iban")) if x),
											  "supplier": r.supplier, "deals": [], "kanal": 0.0, "net_due": 0.0, "paid": 0.0, "adjusted": 0.0, "balance": 0.0,
											  "overdue": 0.0, "next_due": None, "cancelled": 0})
		if r.deal not in s["deals"]:
			s["deals"].append(r.deal)
		if r.status == "Cancelled":
			s["cancelled"] += 1
		else:
			s["kanal"] += _kanal(r.area_sqft)
			s["net_due"] += flt(r.net_due)
		s["paid"] += flt(r.paid_amount)
		s["adjusted"] += flt(r.adjusted_amount)
		s["balance"] += flt(r.balance)
		due = r.date_ext or r.mature_date
		if flt(r.balance) > 0.5:
			days = (today - getdate(due)).days if due else -1
			bucket = "Not due" if days < 0 else "0–30 days" if days <= 30 else "31–90 days" if days <= 90 else "Over 90 days"
			aging[bucket] += flt(r.balance)
			if days >= 0:
				s["overdue"] += flt(r.balance)
			elif not s["next_due"] or getdate(due) < getdate(s["next_due"]):
				s["next_due"] = due
	schedule = frappe.db.sql("""select d.name deal, d.description, s.ser, l.owner_name, s.label, s.due_date, s.amount, s.paid, s.status
		from `tabRE Land Deal Schedule` s join `tabRE Land Deal` d on d.name=s.parent
		left join `tabRE Land Deal Line` l on l.parent=d.name and l.ser=s.ser
		where d.status not in ('Cancelled','Closed') and s.status not in ('Paid') and s.due_date<=%s order by s.due_date""",
							 add_days(today, 31), as_dict=True)
	recent = frappe.get_all("RE Land Payment", {"docstatus": ("<", 2)}, ["name", "deal", "ser", "owner_name", "payment_kind", "posting_date", "amount",
							"wht_amount", "net_paid", "mode_of_payment", "instrument_no", "workflow_state", "docstatus", "received_by_seller"],
							order_by="posting_date desc, creation desc", limit=40)
	adjustments = frappe.get_all("RE Plot Adjustment", {"docstatus": ("<", 2)}, ["name", "deal", "owner_name", "posting_date", "total_value", "applied_amount",
								 "excess_receivable", "workflow_state", "docstatus"], order_by="posting_date desc", limit=30)
	for a in adjustments:
		a.plots = frappe.get_all("RE Plot Adjustment Plot", {"parent": a.name}, ["plot", "agreed_value", "booking"], order_by="idx")
	pending = frappe.get_all("RE Land Payment", {"workflow_state": "Pending Approval"}, ["name", "owner_name", "amount", "deal"])
	rows = sorted(sellers.values(), key=lambda s: -s["balance"])
	return {"sellers": rows, "aging": [{"bucket": k, "amount": round(v, 2)} for k, v in aging.items()], "schedule": schedule, "recent": recent,
			"adjustments": adjustments, "pending": pending,
			"totals": {k: round(sum(s[k] for s in rows), 2) for k in ("net_due", "paid", "adjusted", "balance", "overdue")},
			"reconciliation": _safe_reconciliation()}


def _safe_reconciliation():
	try:
		from realestate.land_accounts import reconciliation

		return reconciliation()
	except Exception:
		return None


# ---------------------------------------------------------------- /re/land/legal
@frappe.whitelist(methods=["GET"])
def legal() -> dict:
	land.guard()
	items = [i for i, _m in land.CHECKLIST]
	mandatory = {i for i, m in land.CHECKLIST if m}
	parcels = frappe.get_all("RE Land Parcel", {}, ["name", "title", "khasra_nos", "stage", "diligence_clear", "diligence_override", "area_display"],
							 order_by="khasra_nos", limit=0)
	checks = {}
	for c in frappe.get_all("RE Parcel Check", {"parenttype": "RE Land Parcel"}, ["parent", "item", "status", "verified_by", "verified_on", "document"], limit=0):
		checks.setdefault(c.parent, {})[c.item] = {"status": c.status, "by": c.verified_by, "on": c.verified_on, "doc": bool(c.document)}
	for p in parcels:
		p.cells = checks.get(p.name, {})
		p.pending = sum(1 for i in mandatory if (p.cells.get(i) or {}).get("status") != "Verified")
	cases = frappe.get_all("RE Land Case", {}, ["name", "case_title", "court", "case_no", "status", "next_hearing", "lawyer", "affected_area", "deal", "filed_on"],
						   limit=0)
	cases.sort(key=lambda c: (c.status not in OPEN_CASES, str(c.next_hearing or "9999")))  # open cases first, next hearing soonest
	for c in cases:
		c.parcels = frappe.get_all("RE Land Case Parcel", {"parent": c.name}, pluck="khasra_nos")
	docs = frappe.get_all("RE Vault Document", {"land_parcel": ("is", "set")}, ["name", "title", "document_type", "land_parcel", "issue_date",
						  "expiry_date", "status", "file"], order_by="issue_date desc", limit=200)
	by_type = {}
	for d in docs:
		by_type[d.document_type] = by_type.get(d.document_type, 0) + 1
	return {"items": items, "mandatory": sorted(mandatory), "parcels": parcels, "cases": cases, "documents": docs,
			"doc_types": [{"type": k, "n": v} for k, v in sorted(by_type.items(), key=lambda x: -x[1])],
			"summary": {"clear": sum(1 for p in parcels if p.diligence_clear), "overridden": sum(1 for p in parcels if p.diligence_override and not p.diligence_clear),
						"pending": sum(1 for p in parcels if not p.diligence_clear and not p.diligence_override),
						"open_cases": sum(1 for c in cases if c.status in OPEN_CASES)}}


# ---------------------------------------------------------------- daily reminders
def daily_reminders():
	"""Seller payments due / overdue, registry deadlines, possession dates and court hearings -> the responsible person's
	bell (Land Managers when nobody is set). Each item once a day at most."""
	today = getdate(nowdate())
	managers = [u for u in frappe.get_all("Has Role", {"role": "Land Manager", "parenttype": "User"}, pluck="parent") if u not in ("Administrator", "Guest")]

	def notify(users, doctype, name, subject):
		for user in set(filter(None, users)) or set(managers):
			if frappe.db.exists("Notification Log", {"for_user": user, "document_name": name, "subject": subject, "creation": (">=", today)}):
				continue
			frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "document_type": doctype, "document_name": name,
							"subject": subject}).insert(ignore_permissions=True)

	for d in frappe.get_all("RE Land Deal", {"status": ("not in", ["Cancelled", "Closed", "Draft"])}, ["name", "owner", "registry_deadline", "possession_date"]):
		doc = frappe.get_doc("RE Land Deal", d.name)
		before = {r.ser: r.overdue for r in doc.lines}
		doc.refresh_ledger()  # recomputes the Overdue flags as the calendar moves
		for r in doc.lines:
			due = r.date_ext or r.mature_date
			if r.status == "Cancelled" or flt(r.balance) <= 0.5 or not due:
				continue
			days = (getdate(due) - today).days
			if r.overdue and (not before.get(r.ser) or -days % 7 == 0):  # when it falls overdue, then weekly
				notify([d.owner], "RE Land Deal", d.name, _("{0}: Rs {1} to {2} overdue since {3}").format(
					d.name, frappe.utils.fmt_money(r.balance, 0), r.owner_name, frappe.utils.formatdate(due)))
			elif days in (7, 3, 1):
				notify([d.owner], "RE Land Deal", d.name, _("{0}: Rs {1} due to {2} in {3} days").format(d.name, frappe.utils.fmt_money(r.balance, 0), r.owner_name, days))
		for field, label in (("registry_deadline", _("registry deadline")), ("possession_date", _("possession date"))):
			if d.get(field) and (getdate(d.get(field)) - today).days in (14, 7, 1):
				notify([d.owner], "RE Land Deal", d.name, _("{0}: {1} on {2}").format(d.name, label, frappe.utils.formatdate(d.get(field))))
	for c in frappe.get_all("RE Land Case", {"status": ("in", OPEN_CASES), "next_hearing": ("between", [today, add_days(today, 7)])},
							["name", "case_title", "court", "next_hearing", "responsible"]):
		days = (getdate(c.next_hearing) - today).days
		if days in (7, 3, 1, 0):
			notify([c.responsible], "RE Land Case", c.name, _("Hearing {0}: {1} at {2}").format(
				_("today") if days == 0 else _("in {0} days").format(days), c.case_title, c.court or ""))
	frappe.db.commit()
