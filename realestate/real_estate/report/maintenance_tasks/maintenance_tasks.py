"""Society maintenance: open / overdue / done per type, block, assignee or source, with resolution time."""

import frappe
from frappe import _
from frappe.utils import add_days, date_diff, get_fullname, getdate, now_datetime

OPEN = ("Open", "Working", "Pending Review", "Overdue")


def execute(filters=None):
	filters = filters or {}
	rng = [filters.get("from_date") or "2000-01-01", add_days(filters.get("to_date") or "2100-01-01", 1)]
	group = filters.get("group_by") or "Type"
	tasks = frappe.get_all("Task", {"re_project": ("is", "set"), "creation": ("between", rng)},
						   ["name", "type", "status", "re_block", "re_source", "exp_end_date", "completed_on", "creation", "_assign"], limit=0)
	now = now_datetime()
	data = {}
	for t in tasks:
		assignees = frappe.parse_json(t._assign or "[]") or [None]
		keys = {"Type": [t.type], "Block": [t.re_block], "Source": [t.re_source], "Assignee": assignees}[group]
		for k in keys:
			label = (get_fullname(k) if group == "Assignee" and k else k) or _("Not set")
			d = data.setdefault(label, {"group": label, "total": 0, "open": 0, "overdue": 0, "completed": 0, "cancelled": 0, "days": []})
			d["total"] += 1
			if t.status in OPEN:
				d["open"] += 1
				d["overdue"] += bool(t.exp_end_date and t.exp_end_date < now)
			elif t.status == "Completed":
				d["completed"] += 1
				if t.completed_on:
					d["days"].append(max(date_diff(t.completed_on, getdate(t.creation)), 0))
			else:
				d["cancelled"] += 1
	out = sorted(data.values(), key=lambda d: -d["open"])
	for d in out:
		days = d.pop("days")
		d["avg_days"] = round(sum(days) / len(days), 1) if days else None
		d["done_pct"] = round(d["completed"] * 100 / d["total"], 1) if d["total"] else 0
	columns = [{"fieldname": "group", "label": _(group), "fieldtype": "Data", "width": 180}]
	columns += [{"fieldname": f, "label": _(l), "fieldtype": "Int", "width": 95} for f, l in
				(("total", "Tasks"), ("open", "Open"), ("overdue", "Overdue"), ("completed", "Completed"), ("cancelled", "Cancelled"))]
	columns += [{"fieldname": "done_pct", "label": _("Completed %"), "fieldtype": "Percent", "width": 110},
				{"fieldname": "avg_days", "label": _("Avg Days to Resolve"), "fieldtype": "Float", "precision": 1, "width": 150}]
	chart = {"data": {"labels": [d["group"] for d in out], "datasets": [{"name": _("Open"), "values": [d["open"] for d in out]},
																		{"name": _("Completed"), "values": [d["completed"] for d in out]}]},
			 "type": "bar", "barOptions": {"stacked": 1}, "colors": ["#ea580c", "#16a34a"]}
	summary = [{"label": _("Open"), "value": sum(d["open"] for d in out), "indicator": "Orange"},
			   {"label": _("Overdue"), "value": sum(d["overdue"] for d in out), "indicator": "Red"},
			   {"label": _("Completed"), "value": sum(d["completed"] for d in out), "indicator": "Green"}]
	return columns, out, None, chart, summary
