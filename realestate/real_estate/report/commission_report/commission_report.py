"""Agent and dealer commission: accrued, payable (customer has paid the set share), paid and cancelled, per beneficiary."""

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	cond = {}
	if filters.get("beneficiary_type"):
		cond["beneficiary_type"] = filters["beneficiary_type"]
	if filters.get("status"):
		cond["status"] = filters["status"]
	rows = frappe.get_all("RE Commission", cond, ["beneficiary", "beneficiary_type", "status", "amount", "base_amount", "booking"], limit=0)
	data = {}
	for r in rows:
		d = data.setdefault(r.beneficiary or "—", {"beneficiary": r.beneficiary, "type": r.beneficiary_type, "bookings": set(), "sales": 0,
												   "accrued": 0, "payable": 0, "paid": 0, "cancelled": 0})
		d["bookings"].add(r.booking)
		d["sales"] += flt(r.base_amount)
		d[(r.status or "Accrued").lower()] = d.get((r.status or "Accrued").lower(), 0) + flt(r.amount)
	out = []
	for d in sorted(data.values(), key=lambda x: -(x["payable"] + x["accrued"])):
		d["bookings"] = len(d["bookings"])
		d["outstanding"] = d["accrued"] + d["payable"]
		out.append(d)
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 130}
	columns = [{"fieldname": "beneficiary", "label": _("Beneficiary"), "fieldtype": "Data", "width": 200},
			   {"fieldname": "type", "label": _("Type"), "fieldtype": "Data", "width": 110},
			   {"fieldname": "bookings", "label": _("Bookings"), "fieldtype": "Int", "width": 90},
			   {"fieldname": "sales", "label": _("Sales Base"), **cur}, {"fieldname": "accrued", "label": _("Accrued"), **cur},
			   {"fieldname": "payable", "label": _("Payable Now"), **cur}, {"fieldname": "paid", "label": _("Paid"), **cur},
			   {"fieldname": "cancelled", "label": _("Cancelled"), **cur}, {"fieldname": "outstanding", "label": _("Still Owed"), **cur}]
	chart = {"data": {"labels": [d["beneficiary"] for d in out[:12]], "datasets": [
		{"name": _("Paid"), "values": [d["paid"] for d in out[:12]]}, {"name": _("Payable"), "values": [d["payable"] for d in out[:12]]},
		{"name": _("Accrued"), "values": [d["accrued"] for d in out[:12]]}]}, "type": "bar", "barOptions": {"stacked": 1},
		"colors": ["#16a34a", "#f59e0b", "#94a3b8"]}
	summary = [{"label": _(k.title()), "value": sum(d[k] for d in out), "datatype": "Currency", "currency": "PKR"} for k in ("accrued", "payable", "paid")]
	return columns, out, None, chart, summary
