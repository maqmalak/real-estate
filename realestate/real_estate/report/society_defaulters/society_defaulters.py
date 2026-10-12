"""Owners with unpaid society bills: months unpaid, amount, by block and by charge head."""

import frappe
from frappe import _
from frappe.utils import cint, flt


def execute(filters=None):
	filters = filters or {}
	conds = {"outstanding_amount": (">", 0)}
	if filters.get("block"):
		conds["block"] = filters["block"]
	bills = frappe.get_all("RE Society Bill", conds, ["name", "plot", "block", "customer", "customer_name", "outstanding_amount", "billing_month"], limit=0)
	heads = frappe.db.sql("""select c.charge, sum(c.amount * (b.outstanding_amount / b.total_amount)) from `tabRE Bill Charge` c
		join `tabRE Society Bill` b on b.name = c.parent where b.outstanding_amount > 0 and b.total_amount > 0 group by c.charge""")
	data = {}
	for b in bills:
		d = data.setdefault(b.plot, {"plot": b.plot, "block": b.block, "customer": b.customer, "customer_name": b.customer_name, "months": 0,
									 "outstanding": 0, "oldest": b.billing_month, "mobile_no": frappe.db.get_value("Customer", b.customer, "mobile_no")})
		d["months"] += 1
		d["outstanding"] += flt(b.outstanding_amount)
		d["oldest"] = min(d["oldest"], b.billing_month)
	out = sorted((d for d in data.values() if d["months"] >= cint(filters.get("min_months") or 1)), key=lambda d: -d["outstanding"])
	columns = [{"fieldname": "plot", "label": _("Plot"), "fieldtype": "Link", "options": "RE Plot", "width": 80},
			   {"fieldname": "block", "label": _("Block"), "fieldtype": "Data", "width": 90},
			   {"fieldname": "customer_name", "label": _("Owner"), "fieldtype": "Data", "width": 170},
			   {"fieldname": "mobile_no", "label": _("Mobile"), "fieldtype": "Data", "width": 130},
			   {"fieldname": "months", "label": _("Months Unpaid"), "fieldtype": "Int", "width": 110},
			   {"fieldname": "oldest", "label": _("Unpaid Since"), "fieldtype": "Date", "width": 110},
			   {"fieldname": "outstanding", "label": _("Outstanding"), "fieldtype": "Currency", "options": "PKR", "width": 130}]
	by_block = {}
	for d in out:
		by_block[d["block"]] = by_block.get(d["block"], 0) + d["outstanding"]
	chart = {"data": {"labels": list(by_block), "datasets": [{"name": _("Outstanding"), "values": list(by_block.values())}]}, "type": "bar", "colors": ["#dc2626"]}
	summary = [{"label": _("Defaulters"), "value": len(out), "indicator": "Red"},
			   {"label": _("Outstanding"), "value": sum(d["outstanding"] for d in out), "datatype": "Currency", "currency": "PKR", "indicator": "Red"}]
	summary += [{"label": h, "value": flt(v), "datatype": "Currency", "currency": "PKR"} for h, v in heads]
	return columns, out, None, chart, summary
