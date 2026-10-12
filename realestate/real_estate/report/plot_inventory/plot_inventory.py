import frappe
from frappe import _

STATUSES = ["Available", "Hold", "Reserved", "Booked", "Sold", "Possession Given", "Blocked"]


def execute(filters=None):
	filters = filters or {}
	group = "plot_size" if filters.get("group_by") == "Plot Size" else "block"
	conds = {"block": filters["block"]} if filters.get("block") else {}
	rows = frappe.get_all("RE Plot", conds, [group, "status", "payment_status", "list_price"], limit=0)
	data = {}
	for r in rows:
		d = data.setdefault(r[group], {"group": r[group], "total": 0, "value": 0, "overdue": 0, **{frappe.scrub(s): 0 for s in STATUSES}})
		d["total"] += 1
		d[frappe.scrub(r.status)] = d.get(frappe.scrub(r.status), 0) + 1
		d["value"] += r.list_price or 0
		d["overdue"] += r.payment_status == "Overdue"
	out = sorted(data.values(), key=lambda d: d["group"])
	for d in out:
		d["sold_pct"] = round((d["booked"] + d["sold"] + d["possession_given"]) * 100 / d["total"], 1) if d["total"] else 0
	columns = [{"fieldname": "group", "label": _(filters.get("group_by") or "Block"), "fieldtype": "Data", "width": 160},
			   {"fieldname": "total", "label": _("Plots"), "fieldtype": "Int", "width": 80}]
	columns += [{"fieldname": frappe.scrub(s), "label": _(s), "fieldtype": "Int", "width": 95} for s in STATUSES]
	columns += [{"fieldname": "overdue", "label": _("Overdue"), "fieldtype": "Int", "width": 85},
				{"fieldname": "sold_pct", "label": _("Booked / Sold %"), "fieldtype": "Percent", "width": 120},
				{"fieldname": "value", "label": _("List Value"), "fieldtype": "Currency", "options": "PKR", "width": 150}]
	chart = {"data": {"labels": [d["group"] for d in out],
					  "datasets": [{"name": _(s), "values": [d[frappe.scrub(s)] for d in out]} for s in ("Available", "Booked", "Sold")]},
			 "type": "bar", "barOptions": {"stacked": 1}, "colors": ["#22c55e", "#3b82f6", "#6366f1"]}
	total = sum(d["total"] for d in out)
	summary = [{"label": _("Plots"), "value": total, "indicator": "Blue"},
			   {"label": _("Available"), "value": sum(d["available"] for d in out), "indicator": "Green"},
			   {"label": _("Booked / Sold"), "value": sum(d["booked"] + d["sold"] for d in out), "indicator": "Blue"},
			   {"label": _("Overdue Plots"), "value": sum(d["overdue"] for d in out), "indicator": "Red"}]
	return columns, out, None, chart, summary
