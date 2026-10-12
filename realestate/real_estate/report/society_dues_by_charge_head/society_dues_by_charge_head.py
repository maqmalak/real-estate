"""Society defaulters by charge head and block: how much of the unpaid society money is garbage, security, sweeper, park,
street light… Unpaid is apportioned to each head in proportion to its share of the bill."""

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	cond, args = "b.outstanding_amount > 0.5", {}
	if filters.get("block"):
		cond += " and p.block = %(block)s"
		args["block"] = filters["block"]
	rows = frappe.db.sql(f"""select p.block, c.charge_head, sum(c.amount) billed,
		sum(c.amount * b.outstanding_amount / nullif(b.total_amount, 0)) unpaid, count(distinct b.plot) plots, count(distinct b.name) bills
		from `tabRE Society Bill` b join `tabRE Bill Charge` c on c.parent = b.name join `tabRE Plot` p on p.name = b.plot
		where {cond} group by p.block, c.charge_head order by p.block, unpaid desc""", args, as_dict=True)
	heads = sorted({r.charge_head or "Other" for r in rows})
	data = {}
	for r in rows:
		d = data.setdefault(r.block, {"block": r.block, "plots": 0, "total": 0})
		d[frappe.scrub(r.charge_head or "Other")] = flt(r.unpaid)
		d["plots"] = max(d["plots"], r.plots)
		d["total"] += flt(r.unpaid)
	out = list(data.values())
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 130}
	columns = [{"fieldname": "block", "label": _("Block"), "fieldtype": "Link", "options": "RE Block", "width": 100},
			   {"fieldname": "plots", "label": _("Defaulting Plots"), "fieldtype": "Int", "width": 120}]
	columns += [{"fieldname": frappe.scrub(h), "label": _(h), **cur} for h in heads]
	columns.append({"fieldname": "total", "label": _("Total Unpaid"), **cur})
	chart = {"data": {"labels": heads, "datasets": [{"name": _("Unpaid"), "values": [sum(d.get(frappe.scrub(h), 0) for d in out) for h in heads]}]},
			 "type": "pie"}
	return columns, out, None, chart
