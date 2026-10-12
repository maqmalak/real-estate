"""Installment receivables per booking: not yet due, and overdue by age (0-30, 31-60, 61-90, 90+ days)."""

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

BUCKETS = (("b0_30", 30), ("b31_60", 60), ("b61_90", 90), ("b90", 10**6))


def execute(filters=None):
	filters = filters or {}
	as_of = getdate(filters.get("as_of") or nowdate())
	cond = "b.docstatus = 1 and b.status != 'Cancelled'"
	args = {"as_of": as_of}
	if filters.get("block"):
		cond += " and b.block = %(block)s"
		args["block"] = filters["block"]
	rows = frappe.db.sql(f"""select b.name booking, b.plot, b.block, b.customer, b.customer_name, b.agent, i.due_date, i.amount - i.paid_amount pending
		from `tabRE Booking` b join `tabRE Installment` i on i.parent = b.name and i.parenttype = 'RE Booking'
		where {cond} and i.amount - i.paid_amount > 0.5""", args, as_dict=True)
	data = {}
	for r in rows:
		d = data.setdefault(r.booking, {"booking": r.booking, "plot": r.plot, "block": r.block, "customer_name": r.customer_name, "agent": r.agent,
										"not_due": 0, "b0_30": 0, "b31_60": 0, "b61_90": 0, "b90": 0, "total": 0, "overdue": 0, "oldest": None})
		age = date_diff(as_of, r.due_date)
		if age <= 0:
			d["not_due"] += flt(r.pending)
		else:
			key = next(k for k, limit in BUCKETS if age <= limit)
			d[key] += flt(r.pending)
			d["overdue"] += flt(r.pending)
			d["oldest"] = min(filter(None, [d["oldest"], r.due_date]))
		d["total"] += flt(r.pending)
	out = sorted(data.values(), key=lambda d: -d["overdue"])
	if filters.get("overdue_only"):
		out = [d for d in out if d["overdue"] > 0]
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 120}
	columns = [{"fieldname": "booking", "label": _("Booking"), "fieldtype": "Link", "options": "RE Booking", "width": 150},
			   {"fieldname": "plot", "label": _("Plot"), "fieldtype": "Link", "options": "RE Plot", "width": 80},
			   {"fieldname": "block", "label": _("Block"), "fieldtype": "Data", "width": 90},
			   {"fieldname": "customer_name", "label": _("Customer"), "fieldtype": "Data", "width": 150},
			   {"fieldname": "not_due", "label": _("Not Yet Due"), **cur}, {"fieldname": "b0_30", "label": _("0-30 Days"), **cur},
			   {"fieldname": "b31_60", "label": _("31-60 Days"), **cur}, {"fieldname": "b61_90", "label": _("61-90 Days"), **cur},
			   {"fieldname": "b90", "label": _("90+ Days"), **cur}, {"fieldname": "overdue", "label": _("Overdue"), **cur},
			   {"fieldname": "total", "label": _("Total Receivable"), **cur},
			   {"fieldname": "oldest", "label": _("Overdue Since"), "fieldtype": "Date", "width": 110}]
	keys = ("b0_30", "b31_60", "b61_90", "b90")
	chart = {"data": {"labels": ["0-30", "31-60", "61-90", "90+"], "datasets": [{"name": _("Overdue"), "values": [sum(d[k] for d in out) for k in keys]}]},
			 "type": "bar", "colors": ["#ef4444"]}
	summary = [{"label": _("Not yet due"), "value": sum(d["not_due"] for d in out), "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Overdue"), "value": sum(d["overdue"] for d in out), "datatype": "Currency", "currency": "PKR", "indicator": "Red"},
			   {"label": _("Over 90 days"), "value": sum(d["b90"] for d in out), "datatype": "Currency", "currency": "PKR", "indicator": "Red"}]
	return columns, out, None, chart, summary
