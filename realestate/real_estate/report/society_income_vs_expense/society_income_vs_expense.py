"""Monthly society account from the GL: charges billed (income) vs guards, sweepers, electricity and repairs (expense)."""

import frappe
from frappe import _
from frappe.utils import flt, getdate


def execute(filters=None):
	filters = filters or {}
	cc = frappe.get_all("Cost Center", {"cost_center_name": "ZG Society Operations"}, pluck="name")
	rows = frappe.db.sql("""select date_format(g.posting_date, '%%Y-%%m') m, a.root_type, sum(g.credit - g.debit) income, sum(g.debit - g.credit) expense
		from `tabGL Entry` g join `tabAccount` a on a.name = g.account
		where g.is_cancelled = 0 and g.cost_center in %s and a.root_type in ('Income', 'Expense') and g.posting_date between %s and %s
		group by m, a.root_type order by m""", (cc or [""], filters.get("from_date") or "2000-01-01", filters.get("to_date") or "2100-01-01"), as_dict=True)
	months = {}
	for r in rows:
		d = months.setdefault(r.m, {"month": getdate(r.m + "-01").strftime("%b %Y"), "income": 0, "expense": 0})
		if r.root_type == "Income":
			d["income"] += flt(r.income)
		else:
			d["expense"] += flt(r.expense)
	data = [months[k] for k in sorted(months)]
	for d in data:
		d["net"] = d["income"] - d["expense"]
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 140}
	columns = [{"fieldname": "month", "label": _("Month"), "fieldtype": "Data", "width": 110}, {"fieldname": "income", "label": _("Charges Billed"), **cur},
			   {"fieldname": "expense", "label": _("Society Expenses"), **cur}, {"fieldname": "net", "label": _("Surplus / (Deficit)"), **cur}]
	chart = {"data": {"labels": [d["month"] for d in data], "datasets": [{"name": _("Income"), "values": [d["income"] for d in data]},
																		 {"name": _("Expense"), "values": [d["expense"] for d in data]}]},
			 "type": "bar", "colors": ["#16a34a", "#dc2626"]}
	summary = [{"label": _("Income"), "value": sum(d["income"] for d in data), "datatype": "Currency", "currency": "PKR", "indicator": "Green"},
			   {"label": _("Expense"), "value": sum(d["expense"] for d in data), "datatype": "Currency", "currency": "PKR", "indicator": "Red"}]
	return columns, data, None, chart, summary
