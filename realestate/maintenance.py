"""Society maintenance on ERPNext Projects: one Project per scheme, a Task per job, ToDos for the assignees.

Tasks carry where the job is (plot / block / map asset) and who raised it (customer, WhatsApp chat),
so they show on the site map, on the customer's timeline, and the customer hears back when it is done.
Recurring work comes from RE Maintenance Plan (daily job creates the task when it falls due).
"""

import frappe
from frappe import _
from frappe.desk.form.assign_to import _add as assign, close_all_assignments
from frappe.utils import add_days, add_months, add_to_date, cint, getdate, now_datetime, nowdate

from realestate.geo import centroid, load_geometry

TYPES = ["Roads", "Water Supply", "Sewerage", "Electricity", "Street Lights", "Internet", "Parks & Horticulture",
		 "Security", "Garbage Collection", "Building / Plot", "Other"]
STEP = {"Daily": (0, 1), "Weekly": (0, 7), "Monthly": (1, 0), "Quarterly": (3, 0), "Half-Yearly": (6, 0), "Yearly": (12, 0)}
OPEN = ("Open", "Working", "Pending Review", "Overdue")


def custom_fields():
	return {
		"Task": [
			{"fieldname": "re_section", "fieldtype": "Section Break", "label": "Site & Complaint", "insert_after": "description", "collapsible": 0},
			{"fieldname": "re_project", "fieldtype": "Link", "options": "RE Project", "label": "Scheme", "insert_after": "re_section"},
			{"fieldname": "re_block", "fieldtype": "Link", "options": "RE Block", "label": "Block", "insert_after": "re_project"},
			{"fieldname": "re_plot", "fieldtype": "Link", "options": "RE Plot", "label": "Plot", "insert_after": "re_block"},
			{"fieldname": "re_map_feature", "fieldtype": "Link", "options": "RE Map Feature", "label": "Asset / Map Feature", "insert_after": "re_plot"},
			{"fieldname": "re_cb", "fieldtype": "Column Break", "insert_after": "re_map_feature"},
			{"fieldname": "re_source", "fieldtype": "Select", "label": "Source", "insert_after": "re_cb", "in_standard_filter": 1,
			 "options": "\nPlanned Maintenance\nCustomer Complaint\nWhatsApp\nInspection"},
			{"fieldname": "re_priority", "fieldtype": "Select", "label": "Complaint Priority", "insert_after": "re_source", "in_list_view": 1,
			 "in_standard_filter": 1, "options": "\nCritical\nHigh\nNormal", "description": "Kept in step with Priority (Critical = Urgent, Normal = Medium)"},
			{"fieldname": "re_customer", "fieldtype": "Link", "options": "Customer", "label": "Reported By", "insert_after": "re_priority"},
			{"fieldname": "re_conversation", "fieldtype": "Link", "options": "RE Conversation", "label": "WhatsApp Chat", "insert_after": "re_customer"},
			{"fieldname": "re_maintenance_plan", "fieldtype": "Link", "options": "RE Maintenance Plan", "label": "Maintenance Plan",
			 "insert_after": "re_conversation", "read_only": 1},
			{"fieldname": "re_customer_notified", "fieldtype": "Check", "label": "Customer Notified", "insert_after": "re_maintenance_plan", "read_only": 1},
		],
		"Project": [
			{"fieldname": "re_project", "fieldtype": "Link", "options": "RE Project", "label": "Housing Scheme", "insert_after": "project_type"},
		],
	}


def setup():
	for t in TYPES:
		if not frappe.db.exists("Task Type", t):
			frappe.get_doc({"doctype": "Task Type", "name": t, "description": f"Society maintenance: {t}"}).insert(ignore_permissions=True)
	if not frappe.db.exists("Project Type", "Society Maintenance"):
		frappe.get_doc({"doctype": "Project Type", "project_type": "Society Maintenance"}).insert(ignore_permissions=True)


def maintenance_project(re_project):
	"""The ERPNext Project that collects a scheme's maintenance tasks (created on first use)."""
	name = frappe.db.get_value("Project", {"re_project": re_project, "project_type": "Society Maintenance"})
	if name:
		return name
	company = frappe.db.get_value("RE Project", re_project, "company") or frappe.db.get_single_value("Global Defaults", "default_company")
	doc = frappe.get_doc({"doctype": "Project", "project_name": f"{re_project} - Society Maintenance", "project_type": "Society Maintenance",
						  "re_project": re_project, "company": company, "status": "Open", "is_active": "Yes",
						  "percent_complete_method": "Task Completion"})
	doc.insert(ignore_permissions=True)
	return doc.name


# complaint priority (spec) <-> ERPNext Task priority
TO_TASK = {"Critical": "Urgent", "High": "High", "Normal": "Medium"}
FROM_TASK = {"Urgent": "Critical", "High": "High", "Medium": "Normal", "Low": "Normal"}


def task_priority(value):
	"""Accept either vocabulary; return the ERPNext Task priority."""
	return TO_TASK.get(value, value if value in FROM_TASK else "Medium")


def sync_priority(doc, method=None):
	"""Task.validate: whichever of the two priority fields was changed wins."""
	before = doc.get_doc_before_save() if not doc.is_new() else None
	if doc.re_priority and (doc.is_new() and doc.re_priority or before and before.re_priority != doc.re_priority):
		doc.priority = TO_TASK[doc.re_priority]
	else:
		doc.re_priority = FROM_TASK.get(doc.priority or "Medium", "Normal")


def create_task(subject, maintenance_type, re_project, assign_to=None, due=None, priority="Medium", description="", source="Inspection",
				plot=None, block=None, map_feature=None, customer=None, conversation=None, plan=None, start=None):
	if plot and not block:
		block = frappe.db.get_value("RE Plot", plot, "block")
	task = frappe.get_doc({
		"doctype": "Task", "subject": subject, "type": maintenance_type, "project": maintenance_project(re_project), "status": "Open",
		"priority": task_priority(priority), "re_priority": FROM_TASK.get(task_priority(priority)), "exp_start_date": start or now_datetime(), "exp_end_date": due, "description": description,
		"re_project": re_project, "re_block": block, "re_plot": plot, "re_map_feature": map_feature, "re_source": source,
		"re_customer": customer, "re_conversation": conversation, "re_maintenance_plan": plan,
	})
	task.insert(ignore_permissions=True)
	if assign_to:
		assign({"assign_to": [assign_to], "doctype": "Task", "name": task.name, "description": subject,
				"date": getdate(due) if due else None, "priority": priority if priority in ("Low", "Medium", "High") else "High"},
			   ignore_permissions=True)
	return task.name


@frappe.whitelist()
def raise_complaint(doctype: str, name: str, subject: str, maintenance_type: str, description: str | None = None,
					priority: str = "Medium", plot: str | None = None) -> str:
	"""From a chat panel, a plot or a customer: log the complaint as a maintenance task and assign it."""
	from realestate.whatsapp.api import _party_of

	party_type, party, phone = _party_of(doctype, name)
	customer = party if party_type == "Customer" else None
	if doctype == "RE Plot":
		plot = name
	if not plot and customer:
		plot = frappe.db.get_value("RE Plot", {"customer": customer}, "name")
	re_project = (frappe.db.get_value("RE Plot", plot, "project") if plot else None) or frappe.db.get_single_value("RE Settings", "default_project")
	settings = frappe.get_cached_doc("RE Settings")
	conversation = name if doctype == "RE Conversation" else frappe.db.get_value("RE Conversation", {"party": party}, "name") if party else None
	return create_task(subject, maintenance_type, re_project, settings.maintenance_assignee, add_days(nowdate(), cint(settings.complaint_due_days) or 2),
					   priority, description or "", "WhatsApp" if conversation else "Customer Complaint", plot=plot, customer=customer,
					   conversation=conversation)


def on_task_update(doc, method=None):
	"""Close the ToDos when a job is done, and tell the customer who reported it."""
	if doc.status not in ("Completed", "Cancelled") or not doc.has_value_changed("status"):
		return
	close_all_assignments("Task", doc.name)
	if doc.status == "Completed" and doc.re_customer and not doc.re_customer_notified \
			and frappe.db.get_single_value("RE Settings", "notify_customer_on_completion"):
		frappe.enqueue(_tell_customer, enqueue_after_commit=True, task=doc.name)


def _tell_customer(task):
	from realestate.whatsapp.channel import send_text

	t = frappe.get_doc("Task", task)
	phone = frappe.db.get_value("Customer", t.re_customer, "mobile_no")
	if not phone:
		return
	text = _("Dear customer, your complaint \"{0}\"{1} has been resolved. Reply here if anything is still wrong. — Zarmeen Gardens Maintenance").format(
		t.subject, _(" for plot {0}").format(t.re_plot) if t.re_plot else "")
	try:
		send_text(text=text, phone=phone, reference_doctype="Customer", reference_name=t.re_customer)
		frappe.db.set_value("Task", task, "re_customer_notified", 1)
	except Exception:
		frappe.log_error(title=f"Maintenance completion message for {task}")


def generate_planned_tasks(as_of=None):
	"""Daily: one task per maintenance plan that falls due (plus its ToDo)."""
	today = getdate(as_of or nowdate())
	for p in frappe.get_all("RE Maintenance Plan", {"enabled": 1}, ["name", "next_due", "lead_days"]):
		plan = frappe.get_doc("RE Maintenance Plan", p.name)
		while getdate(plan.next_due) <= add_days(today, cint(plan.lead_days)):
			if not frappe.db.exists("Task", {"re_maintenance_plan": plan.name, "exp_end_date": ("like", f"{plan.next_due}%")}):
				checklist = "".join(f"<li>{frappe.utils.escape_html(s)}</li>" for s in (plan.checklist or "").splitlines() if s.strip())
				plan.last_task = create_task(f"{plan.title} ({frappe.utils.formatdate(plan.next_due, 'dd MMM')})", plan.maintenance_type, plan.project,
											 plan.assign_to, f"{plan.next_due} 17:00:00", plan.priority, f"<ul>{checklist}</ul>" if checklist else "",
											 "Planned Maintenance", block=plan.block, map_feature=plan.map_feature, plan=plan.name,
											 start=f"{add_days(plan.next_due, -cint(plan.lead_days))} 09:00:00")
			months, days = STEP[plan.frequency]
			plan.next_due = add_days(add_months(plan.next_due, months), days)
		plan.save(ignore_permissions=True)
	frappe.db.commit()


def mark_overdue():
	frappe.db.sql("""update `tabTask` set status = 'Overdue' where status in ('Open', 'Working') and re_project is not null
		and exp_end_date < %s""", now_datetime())


@frappe.whitelist()
def get_map_tasks(project: str) -> list[dict]:
	"""Open maintenance tasks with a map position (plot centre, asset or block centroid)."""
	tasks = frappe.get_list("Task", {"re_project": project, "status": ("in", OPEN)},
							["name", "subject", "type", "status", "priority", "re_plot", "re_block", "re_map_feature", "re_source", "exp_end_date"], limit=500)
	for t in tasks:
		if t.re_plot:
			t.lat, t.lng = frappe.db.get_value("RE Plot", t.re_plot, ["centre_lat", "centre_lng"])
		else:
			geo = frappe.db.get_value("RE Map Feature", t.re_map_feature, "geojson") if t.re_map_feature else \
				frappe.db.get_value("RE Block", t.re_block, "geojson") if t.re_block else None
			t.lat, t.lng = centroid(load_geometry(geo)) if geo else (None, None)
		t.assigned = frappe.get_all("ToDo", {"reference_type": "Task", "reference_name": t.name, "status": "Open"}, pluck="allocated_to")
	return [t for t in tasks if t.lat]
