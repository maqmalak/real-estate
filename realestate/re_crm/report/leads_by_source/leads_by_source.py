import frappe

from realestate import scope
from frappe import _
from frappe.utils import add_days


def _range(filters):
	return [filters.get("from_date") or "2000-01-01", add_days(filters.get("to_date") or "2100-01-01", 1)]


def execute(filters=None):
	filters = filters or {}
	leads = frappe.get_all("CRM Lead", {"creation": ("between", _range(filters)), **scope.filters("CRM Lead")}, ["name", "source", "status", "converted"], limit=0)
	deals = {d.lead: d for d in frappe.get_all("CRM Deal", {"lead": ("in", [l.name for l in leads] or [""])}, ["lead", "status"], limit=0)}
	data = {}
	for l in leads:
		src = l.source or _("Not Set")
		d = data.setdefault(src, {"source": src, "leads": 0, "contacted": 0, "deals": 0, "bookings": 0, "lost": 0})
		d["leads"] += 1
		d["contacted"] += l.status != "New"
		deal = deals.get(l.name)
		if deal:
			d["deals"] += 1
			d["bookings"] += deal.status == "Booking"
			d["lost"] += deal.status == "Lost"
		elif l.status in ("Junk", "Unqualified"):
			d["lost"] += 1
	out = sorted(data.values(), key=lambda d: -d["leads"])
	for d in out:
		d["conversion"] = round(d["bookings"] * 100 / d["leads"], 1) if d["leads"] else 0
		d["deal_rate"] = round(d["deals"] * 100 / d["leads"], 1) if d["leads"] else 0
	columns = [{"fieldname": "source", "label": _("Source"), "fieldtype": "Data", "width": 140},
			   {"fieldname": "leads", "label": _("Leads"), "fieldtype": "Int", "width": 80},
			   {"fieldname": "contacted", "label": _("Contacted"), "fieldtype": "Int", "width": 90},
			   {"fieldname": "deals", "label": _("Opportunities"), "fieldtype": "Int", "width": 110},
			   {"fieldname": "bookings", "label": _("Bookings"), "fieldtype": "Int", "width": 90},
			   {"fieldname": "lost", "label": _("Lost / Junk"), "fieldtype": "Int", "width": 90},
			   {"fieldname": "deal_rate", "label": _("Lead → Opportunity %"), "fieldtype": "Percent", "width": 150},
			   {"fieldname": "conversion", "label": _("Lead → Booking %"), "fieldtype": "Percent", "width": 140}]
	chart = {"data": {"labels": [d["source"] for d in out], "datasets": [{"name": _("Leads"), "values": [d["leads"] for d in out]},
																		 {"name": _("Bookings"), "values": [d["bookings"] for d in out]}]},
			 "type": "bar", "colors": ["#8b5cf6", "#16a34a"]}
	return columns, out, None, chart
