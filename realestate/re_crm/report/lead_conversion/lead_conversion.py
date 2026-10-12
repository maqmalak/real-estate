import frappe

from realestate import scope
from frappe import _
from frappe.utils import add_days, get_fullname


def execute(filters=None):
	filters = filters or {}
	rng = [filters.get("from_date") or "2000-01-01", add_days(filters.get("to_date") or "2100-01-01", 1)]
	by_agent = (filters.get("group_by") or "Agent") == "Agent"
	leads = frappe.get_all("CRM Lead", {"creation": ("between", rng), **scope.filters("CRM Lead")}, ["name", "lead_owner", "source", "status"], limit=0)
	deals = {d.lead: d for d in frappe.get_all("CRM Deal", {"lead": ("in", [l.name for l in leads] or [""])}, ["name", "lead", "status", "deal_owner"], limit=0)}
	visited = set(frappe.get_all("RE Site Visit", {"status": "Completed"}, pluck="party", limit=0))
	data = {}
	for l in leads:
		deal = deals.get(l.name)
		key = ((deal and deal.deal_owner) or l.lead_owner or _("Unassigned")) if by_agent else (l.source or _("Not Set"))
		d = data.setdefault(key, {"group": get_fullname(key) if by_agent and "@" in key else key, "leads": 0, "opportunities": 0, "site_visits": 0,
								  "negotiation": 0, "bookings": 0, "lost": 0})
		d["leads"] += 1
		if deal:
			d["opportunities"] += 1
			d["site_visits"] += deal.name in visited or l.name in visited or deal.status in ("Site Visit", "Negotiation", "Booking")
			d["negotiation"] += deal.status in ("Negotiation", "Booking")
			d["bookings"] += deal.status == "Booking"
			d["lost"] += deal.status == "Lost"
	out = sorted(data.values(), key=lambda d: -d["bookings"])
	for d in out:
		d["lead_to_opp"] = round(d["opportunities"] * 100 / d["leads"], 1) if d["leads"] else 0
		d["opp_to_booking"] = round(d["bookings"] * 100 / d["opportunities"], 1) if d["opportunities"] else 0
		d["conversion"] = round(d["bookings"] * 100 / d["leads"], 1) if d["leads"] else 0
	columns = [{"fieldname": "group", "label": _("Agent") if by_agent else _("Source"), "fieldtype": "Data", "width": 160}]
	columns += [{"fieldname": f, "label": _(l), "fieldtype": "Int", "width": 100} for f, l in
				(("leads", "Leads"), ("opportunities", "Opportunities"), ("site_visits", "Site Visits"), ("negotiation", "Negotiation"),
				 ("bookings", "Bookings"), ("lost", "Lost"))]
	columns += [{"fieldname": "lead_to_opp", "label": _("Lead → Opp %"), "fieldtype": "Percent", "width": 110},
				{"fieldname": "opp_to_booking", "label": _("Opp → Booking %"), "fieldtype": "Percent", "width": 120},
				{"fieldname": "conversion", "label": _("Conversion %"), "fieldtype": "Percent", "width": 110}]
	totals = {k: sum(d[k] for d in out) for k in ("leads", "opportunities", "site_visits", "negotiation", "bookings")}
	chart = {"data": {"labels": [_("Leads"), _("Opportunities"), _("Site Visits"), _("Negotiation"), _("Bookings")],
					  "datasets": [{"name": _("Pipeline"), "values": list(totals.values())}]}, "type": "bar", "colors": ["#0f766e"]}
	summary = [{"label": _("Leads"), "value": totals["leads"], "indicator": "Blue"},
			   {"label": _("Bookings"), "value": totals["bookings"], "indicator": "Green"},
			   {"label": _("Conversion"), "value": f"{round(totals['bookings'] * 100 / totals['leads'], 1) if totals['leads'] else 0}%", "indicator": "Green"}]
	return columns, out, None, chart, summary
