import frappe

from realestate import scope
from frappe import _
from frappe.utils import get_fullname, now_datetime, time_diff_in_hours

OPEN = ["Backlog", "Todo", "In Progress"]


def execute(filters=None):
	filters = filters or {}
	conds = {"status": ("in", OPEN), "due_date": ("<", now_datetime()), **scope.filters("CRM Task")}
	if filters.get("agent"):
		conds["assigned_to"] = filters["agent"]
	tasks = frappe.get_all("CRM Task", conds, ["name", "title", "assigned_to", "due_date", "priority", "status", "reference_doctype", "reference_docname"],
						   order_by="due_date asc", limit=0)
	now = now_datetime()
	per_agent = {}
	for t in tasks:
		t.hours_overdue = round(time_diff_in_hours(now, t.due_date), 1)
		t.agent_name = get_fullname(t.assigned_to) if t.assigned_to else _("Unassigned")
		per_agent[t.agent_name] = per_agent.get(t.agent_name, 0) + 1
	columns = [{"fieldname": "name", "label": _("Task"), "fieldtype": "Link", "options": "CRM Task", "width": 80},
			   {"fieldname": "title", "label": _("Follow-up"), "fieldtype": "Data", "width": 260},
			   {"fieldname": "reference_doctype", "label": _("For"), "fieldtype": "Link", "options": "DocType", "width": 100},
			   {"fieldname": "reference_docname", "label": _("Record"), "fieldtype": "Dynamic Link", "options": "reference_doctype", "width": 160},
			   {"fieldname": "agent_name", "label": _("Agent"), "fieldtype": "Data", "width": 140},
			   {"fieldname": "due_date", "label": _("Was Due"), "fieldtype": "Datetime", "width": 160},
			   {"fieldname": "hours_overdue", "label": _("Hours Late"), "fieldtype": "Float", "precision": 1, "width": 100},
			   {"fieldname": "priority", "label": _("Priority"), "fieldtype": "Data", "width": 80}]
	chart = {"data": {"labels": list(per_agent), "datasets": [{"name": _("Missed"), "values": list(per_agent.values())}]}, "type": "bar", "colors": ["#dc2626"]}
	total_open = frappe.db.count("CRM Task", {"status": ("in", OPEN)})
	summary = [{"label": _("Missed Follow-ups"), "value": len(tasks), "indicator": "Red"},
			   {"label": _("Open Follow-ups"), "value": total_open, "indicator": "Blue"}]
	return columns, tasks, None, chart, summary
