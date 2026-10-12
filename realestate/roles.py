"""Roles (Admin = System Manager, Accounts = Accounts User/Manager, Sales Manager, Sales Agent, Recovery Officer,
Society Manager, Customer) and the approval workflows for transfers, cancellations, merges and surcharge waivers."""

import frappe
from frappe.permissions import add_permission, update_permission_property

R, W, C, S, D = "read", "write", "create", "submit", "delete"

GRANTS = {
	"Sales Agent": {
		"RE Booking": (R, W, C), "RE Payment": (R, C), "RE Plot": (R,), "RE Site Visit": (R, W, C), "RE Conversation": (R, W),
		"RE Plot Transfer": (R, W, C), "RE Booking Cancellation": (R, W, C), "RE Commission": (R,), "RE Surcharge": (R,),
		"RE Society Bill": (R,), "RE Generated Document": (R, C), "Customer": (R, W, C), "Sales Invoice": (R,), "Payment Entry": (R,),
		"Dunning": (R,), "Task": (R, W, C),
	},
	"Recovery Officer": {
		"RE Booking": (R,), "RE Payment": (R, W, C, S), "RE Plot": (R,), "RE Surcharge": (R, W), "RE Surcharge Waiver": (R, W, C),
		"RE Society Bill": (R,), "RE Reminder Log": (R,), "RE Conversation": (R, W), "RE Generated Document": (R, C),
		"Dunning": (R, W, C, S), "Sales Invoice": (R,), "Payment Entry": (R, W, C, S), "Customer": (R,), "CRM Call Log": (R, W, C), "CRM Task": (R, W, C),
	},
	"Society Manager": {
		"RE Society Bill": (R, W, C, D), "RE Charge Head": (R, W, C), "RE Maintenance Plan": (R, W, C, D), "RE Vault Document": (R, W, C),
		"RE Map Feature": (R, W), "RE Plot": (R,), "RE Payment": (R, C, S), "RE Generated Document": (R, C), "Task": (R, W, C, D),
		"Project": (R,), "Customer": (R,), "Sales Invoice": (R,), "Purchase Invoice": (R,), "Asset": (R,),
	},
}

WORKFLOWS = {
	# doctype: initiator roles
	"RE Plot Transfer": ("Sales User", "Sales Agent"),
	"RE Booking Cancellation": ("Sales User", "Sales Agent", "Recovery Officer"),
	"RE Plot Merge": ("Sales User", "Society Manager"),
	"RE Surcharge Waiver": ("Recovery Officer", "Accounts User"),
	"RE Re-allotment": ("Sales User", "Sales Agent"),
}


def setup():
	for role in GRANTS:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(ignore_permissions=True)
	for role, docs in GRANTS.items():
		for doctype, rights in docs.items():
			if not frappe.db.exists("DocType", doctype):
				continue
			if not frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0}) and \
					not frappe.db.exists("DocPerm", {"parent": doctype, "role": role, "permlevel": 0}):
				add_permission(doctype, role, 0)
			for right in rights:
				if right == S and not frappe.get_meta(doctype).is_submittable:
					continue
				update_permission_property(doctype, role, 0, right, 1, validate=False)
			update_permission_property(doctype, role, 0, "report", 1, validate=False)
	for state, style in (("Draft", ""), ("Pending Approval", "Warning"), ("Approved", "Success"), ("Rejected", "Danger")):
		if not frappe.db.exists("Workflow State", state):
			frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": state, "style": style}).insert(ignore_permissions=True)
	for action in ("Submit for Approval", "Approve", "Reject", "Revise"):
		if not frappe.db.exists("Workflow Action Master", action):
			frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": action}).insert(ignore_permissions=True)
	for doctype, initiators in WORKFLOWS.items():
		_workflow(doctype, initiators)


def _workflow(doctype, initiators):
	name = f"{doctype} Approval"
	if frappe.db.exists("Workflow", name):
		return
	transitions = [{"state": "Draft", "action": "Submit for Approval", "next_state": "Pending Approval", "allowed": r} for r in initiators]
	transitions += [{"state": "Pending Approval", "action": "Approve", "next_state": "Approved", "allowed": "Sales Manager"},
					{"state": "Pending Approval", "action": "Reject", "next_state": "Rejected", "allowed": "Sales Manager"}]
	transitions += [{"state": "Rejected", "action": "Revise", "next_state": "Draft", "allowed": r} for r in initiators]
	frappe.get_doc({
		"doctype": "Workflow", "workflow_name": name, "document_type": doctype, "is_active": 1, "workflow_state_field": "workflow_state",
		"send_email_alert": 0, "override_status": 0,
		"states": [{"state": "Draft", "doc_status": "0", "allow_edit": initiators[0]},
				   {"state": "Pending Approval", "doc_status": "0", "allow_edit": "Sales Manager"},
				   {"state": "Approved", "doc_status": "1", "allow_edit": "Sales Manager"},
				   {"state": "Rejected", "doc_status": "0", "allow_edit": "Sales Manager"}],
		"transitions": transitions,
	}).insert(ignore_permissions=True)
