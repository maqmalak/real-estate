import frappe

from realestate import scope
from frappe import _
from frappe.utils import add_days, get_fullname

SYSTEM = ("Administrator", "Guest", None, "")


def execute(filters=None):
	filters = filters or {}
	rng = [filters.get("from_date") or "2000-01-01", add_days(filters.get("to_date") or "2100-01-01", 1)]
	data = {}

	def row(user):
		return data.setdefault(user, {"agent": user, "agent_name": get_fullname(user), "calls_out": 0, "calls_in": 0, "answered": 0,
									  "missed": 0, "talk_min": 0, "promises": 0, "messages": 0, "visits": 0, "tasks_done": 0, "bookings": 0})

	for c in frappe.get_all("CRM Call Log", {"creation": ("between", rng)}, ["type", "caller", "receiver", "duration", "status", "re_outcome"], limit=0):
		user = c.caller if c.type == "Outgoing" else c.receiver
		if user in SYSTEM:
			continue
		r = row(user)
		r["calls_out" if c.type == "Outgoing" else "calls_in"] += 1
		r["answered"] += c.status == "Completed"
		r["missed"] += c.re_outcome == "Missed"
		r["talk_min"] += round((c.duration or 0) / 60, 1)
		r["promises"] += c.re_outcome == "Promised to Pay"
	for owner, n in frappe.db.sql("""select owner, count(*) from `tabWhatsApp Message` where direction = 'Outgoing'
		and creation between %s and %s group by owner""", rng):
		if owner not in SYSTEM:
			row(owner)["messages"] += n
	for v in frappe.get_all("RE Site Visit", {"visit_on": ("between", rng), "status": "Completed"}, ["agent"], limit=0):
		if v.agent not in SYSTEM:
			row(v.agent)["visits"] += 1
	for t in frappe.get_all("CRM Task", {"modified": ("between", rng), "status": "Done"}, ["assigned_to"], limit=0):
		if t.assigned_to not in SYSTEM:
			row(t.assigned_to)["tasks_done"] += 1
	for b in frappe.get_all("RE Booking", {"booking_date": ("between", rng), "docstatus": 1}, ["agent"], limit=0):
		if b.agent not in SYSTEM:
			row(b.agent)["bookings"] += 1
	out = sorted(data.values(), key=lambda d: -(d["calls_out"] + d["calls_in"] + d["messages"]))
	if scope.agent():  # an agent sees only their own row
		out = [d for d in out if d["agent"] == scope.agent()]
	for d in out:
		d["talk_min"] = round(d["talk_min"], 1)
	columns = [{"fieldname": "agent_name", "label": _("Agent"), "fieldtype": "Data", "width": 150}]
	columns += [{"fieldname": f, "label": _(l), "fieldtype": "Float" if f == "talk_min" else "Int", "width": 105} for f, l in (
		("calls_out", "Calls Made"), ("calls_in", "Calls Received"), ("answered", "Answered"), ("missed", "Missed"), ("talk_min", "Talk Time (min)"),
		("promises", "Payment Promises"), ("messages", "WhatsApp Sent"), ("visits", "Site Visits"), ("tasks_done", "Follow-ups Done"), ("bookings", "Bookings"))]
	chart = {"data": {"labels": [d["agent_name"] for d in out], "datasets": [
		{"name": _("Calls"), "values": [d["calls_out"] + d["calls_in"] for d in out]}, {"name": _("WhatsApp"), "values": [d["messages"] for d in out]}]},
		"type": "bar", "colors": ["#3b82f6", "#16a34a"]}
	return columns, out, None, chart
