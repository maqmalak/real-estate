"""Payment promises taken on calls against what the customer actually paid by the promised date (+3 days grace)."""

import frappe

from realestate import scope
from frappe import _
from frappe.utils import add_days, flt, get_fullname, getdate, today

GRACE_DAYS = 3


def _customer(doctype, name):
	if doctype == "Customer":
		return name
	if doctype == "CRM Deal" and frappe.get_meta("CRM Deal").has_field("erpnext_customer"):
		return frappe.db.get_value("CRM Deal", name, "erpnext_customer")
	return None


def execute(filters=None):
	filters = filters or {}
	if scope.agent():  # an agent sees only their own promises
		filters["agent"] = scope.agent()
	conds = {"re_outcome": "Promised to Pay", "creation": ("between", [filters.get("from_date") or "2000-01-01", add_days(filters.get("to_date") or "2100-01-01", 1)])}
	calls = frappe.get_all("CRM Call Log", conds, ["name", "reference_doctype", "reference_docname", "caller", "receiver", "start_time", "creation",
												   "re_promised_amount", "re_promised_date", "re_notes"], order_by="creation desc", limit=0)
	data, per_agent = [], {}
	for c in calls:
		agent = c.caller or c.receiver
		if filters.get("agent") and agent != filters["agent"]:
			continue
		customer = _customer(c.reference_doctype, c.reference_docname)
		since = getdate(c.start_time or c.creation)
		until = add_days(c.re_promised_date or since, GRACE_DAYS)
		received = flt(frappe.db.sql("""select sum(amount) from `tabRE Payment` where docstatus = 1 and customer = %s
			and posting_date between %s and %s""", (customer, since, until))[0][0]) if customer else 0
		promised = flt(c.re_promised_amount)
		if received >= promised - 1:
			status = "Kept"
		elif getdate(until) >= getdate(today()):
			status = "Pending"
		else:
			status = "Partly Kept" if received else "Broken"
		data.append({"call": c.name, "customer": customer or c.reference_docname, "customer_name": frappe.db.get_value("Customer", customer, "customer_name") if customer else c.reference_docname,
					 "agent_name": get_fullname(agent) if agent else "", "call_date": since, "promised_amount": promised, "promised_date": c.re_promised_date,
					 "received": received, "gap": max(promised - received, 0), "status": status, "notes": c.re_notes})
		a = per_agent.setdefault(get_fullname(agent) if agent else _("Unknown"), [0, 0])
		a[0] += promised
		a[1] += min(received, promised)
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 120}
	columns = [{"fieldname": "call", "label": _("Call"), "fieldtype": "Link", "options": "CRM Call Log", "width": 110},
			   {"fieldname": "customer_name", "label": _("Customer"), "fieldtype": "Data", "width": 160},
			   {"fieldname": "agent_name", "label": _("Agent"), "fieldtype": "Data", "width": 130},
			   {"fieldname": "call_date", "label": _("Call Date"), "fieldtype": "Date", "width": 100},
			   {"fieldname": "promised_amount", "label": _("Promised"), **cur},
			   {"fieldname": "promised_date", "label": _("Promised By"), "fieldtype": "Date", "width": 100},
			   {"fieldname": "received", "label": _("Received"), **cur}, {"fieldname": "gap", "label": _("Shortfall"), **cur},
			   {"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 100},
			   {"fieldname": "notes", "label": _("Notes"), "fieldtype": "Data", "width": 200}]
	chart = {"data": {"labels": list(per_agent), "datasets": [{"name": _("Promised"), "values": [v[0] for v in per_agent.values()]},
															  {"name": _("Received"), "values": [v[1] for v in per_agent.values()]}]},
			 "type": "bar", "colors": ["#f59e0b", "#0f766e"]}
	promised = sum(d["promised_amount"] for d in data)
	received = sum(min(d["received"], d["promised_amount"]) for d in data)
	summary = [{"label": _("Promised"), "value": promised, "datatype": "Currency", "currency": "PKR", "indicator": "Orange"},
			   {"label": _("Received"), "value": received, "datatype": "Currency", "currency": "PKR", "indicator": "Green"},
			   {"label": _("Recovery"), "value": f"{round(received * 100 / promised, 1) if promised else 0}%", "indicator": "Blue"},
			   {"label": _("Broken Promises"), "value": sum(1 for d in data if d["status"] == "Broken"), "indicator": "Red"}]
	return columns, data, None, chart, summary
