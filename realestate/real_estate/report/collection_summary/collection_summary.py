import frappe
from frappe import _
from frappe.utils import getdate


def execute(filters=None):
	filters = filters or {}
	conds = {"docstatus": 1, "posting_date": ("between", [filters.get("from_date") or "2000-01-01", filters.get("to_date") or "2100-01-01"])}
	if filters.get("payment_against"):
		conds["payment_against"] = filters["payment_against"]
	rows = frappe.get_list("RE Payment", filters=conds,  # get_list: an agent only gets their own receipts
						  fields= ["posting_date", "amount", "mode_of_payment", "payment_against"], limit=0)
	modes = sorted({r.mode_of_payment for r in rows})
	months = {}
	for r in rows:
		key = getdate(r.posting_date).strftime("%Y-%m")
		m = months.setdefault(key, {"month": getdate(r.posting_date).strftime("%b %Y"), "key": key, "count": 0, "total": 0,
									"installments": 0, "bills": 0, **{frappe.scrub(x): 0 for x in modes}})
		m["count"] += 1
		m["total"] += r.amount
		m[frappe.scrub(r.mode_of_payment)] += r.amount
		m["installments" if r.payment_against == "Booking" else "bills"] += r.amount
	data = sorted(months.values(), key=lambda m: m["key"])
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 130}
	columns = [{"fieldname": "month", "label": _("Month"), "fieldtype": "Data", "width": 100},
			   {"fieldname": "count", "label": _("Receipts"), "fieldtype": "Int", "width": 80},
			   {"fieldname": "installments", "label": _("Installments"), **cur}, {"fieldname": "bills", "label": _("Society Bills"), **cur}]
	columns += [{"fieldname": frappe.scrub(x), "label": x, **cur} for x in modes]
	columns += [{"fieldname": "total", "label": _("Total"), **cur}]
	chart = {"data": {"labels": [d["month"] for d in data], "datasets": [
		{"name": _("Installments"), "values": [d["installments"] for d in data]}, {"name": _("Society Bills"), "values": [d["bills"] for d in data]}]},
		"type": "bar", "barOptions": {"stacked": 1}, "colors": ["#0f766e", "#f59e0b"]}
	summary = [{"label": _("Collected"), "value": sum(d["total"] for d in data), "datatype": "Currency", "currency": "PKR", "indicator": "Green"},
			   {"label": _("Receipts"), "value": sum(d["count"] for d in data), "indicator": "Blue"}]
	return columns, data, None, chart, summary
