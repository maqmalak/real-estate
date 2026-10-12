import frappe

from realestate import scope
from frappe import _
from frappe.utils import get_first_day


def execute(filters=None):
	filters = filters or {}
	conds = {}
	if filters.get("block"):
		conds["block"] = filters["block"]
	if filters.get("billing_month"):
		conds["billing_month"] = get_first_day(filters["billing_month"])
	if scope.agent():  # an agent sees their own customers' bills
		conds["customer"] = ("in", scope.customers() or [""])
	rows = frappe.get_all("RE Society Bill", conds, ["billing_month", "bill_month_label", "status", "total_amount", "paid_amount", "outstanding_amount"], limit=0)
	months = {}
	for r in rows:
		m = months.setdefault(r.billing_month, {"month": r.bill_month_label, "bills": 0, "billed": 0, "collected": 0, "outstanding": 0,
												"paid": 0, "unpaid": 0, "overdue": 0})
		m["bills"] += 1
		m["billed"] += r.total_amount
		m["collected"] += r.paid_amount
		m["outstanding"] += r.outstanding_amount
		m["paid" if r.status == "Paid" else "overdue" if r.status == "Overdue" else "unpaid"] += 1
	data = [months[k] for k in sorted(months)]
	for d in data:
		d["recovery"] = round(d["collected"] * 100 / d["billed"], 1) if d["billed"] else 0
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 130}
	columns = [{"fieldname": "month", "label": _("Month"), "fieldtype": "Data", "width": 120},
			   {"fieldname": "bills", "label": _("Bills"), "fieldtype": "Int", "width": 70},
			   {"fieldname": "billed", "label": _("Billed"), **cur}, {"fieldname": "collected", "label": _("Collected"), **cur},
			   {"fieldname": "outstanding", "label": _("Outstanding"), **cur},
			   {"fieldname": "recovery", "label": _("Recovery %"), "fieldtype": "Percent", "width": 100},
			   {"fieldname": "paid", "label": _("Paid"), "fieldtype": "Int", "width": 70},
			   {"fieldname": "unpaid", "label": _("Unpaid"), "fieldtype": "Int", "width": 70},
			   {"fieldname": "overdue", "label": _("Overdue"), "fieldtype": "Int", "width": 80}]
	chart = {"data": {"labels": [d["month"] for d in data], "datasets": [{"name": _("Billed"), "values": [d["billed"] for d in data]},
																		 {"name": _("Collected"), "values": [d["collected"] for d in data]}]},
			 "type": "bar", "colors": ["#94a3b8", "#0f766e"]}
	return columns, data, None, chart
