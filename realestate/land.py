"""Module 0 — land purchase and acquisition: shared helpers, setup and the API the React land screens use.

Records (module RE Land): RE Land Owner (an ERPNext Supplier in "Land Owners"), RE Land Parcel (khasra, co-owners per fard,
acquisition stage history, due diligence checklist), RE Land Deal (the client's deal sheet and the iqrar nama contract in
one: owner lines, extensions, seller schedule, amendments), RE Land Case and RE Transfer Cost Rate. Arithmetic lives in
land_calc (unit tested).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime, nowdate

from realestate import land_calc as L

STAGES = ["Identified", "Under Negotiation", "Due Diligence", "Token Paid", "Agreement Signed", "Payment in Progress",
		  "Registry / Mutation Done", "Possession Taken", "Acquired", "Dropped", "Disputed"]
PIPELINE = STAGES[:9]
# stages that need the mandatory due diligence checks (or an Admin override)
AGREEMENT_PLUS = set(PIPELINE[PIPELINE.index("Agreement Signed"):])
# map-layer colour groups (spec: Acquired, Payment in Progress, Agreement, Negotiation, Disputed)
LAYER = {"Identified": "Negotiation", "Under Negotiation": "Negotiation", "Due Diligence": "Negotiation", "Token Paid": "Agreement",
		 "Agreement Signed": "Agreement", "Payment in Progress": "Payment in Progress", "Registry / Mutation Done": "Acquired",
		 "Possession Taken": "Acquired", "Acquired": "Acquired", "Dropped": "Dropped", "Disputed": "Disputed"}

CHECKLIST = [  # (item, mandatory)
	("Latest fard-e-malkiat", 1), ("Jamabandi", 0), ("Mutation (intiqal) history", 1), ("Aks shajra (map)", 0),
	("Site demarcation (nishandehi) report", 1), ("Encumbrance / mortgage check", 1), ("Litigation check", 1),
	("Seller CNIC verification", 1), ("Legal opinion", 1),
]
APPROVERS = ("System Manager", "Accounts Manager")
LAND_STAFF = ("System Manager", "Land Manager", "Accounts Manager", "Accounts User", "Projects Manager")
SUPPLIER_GROUP = "Land Owners"


def marla_sqft() -> float:
	return flt(frappe.db.get_single_value("RE Settings", "land_marla_sqft")) or L.MARLA_SQFT


def guard(roles=LAND_STAFF):
	if not set(frappe.get_roles()) & set(roles):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def is_approver() -> bool:
	return bool(set(frappe.get_roles()) & set(APPROVERS))


def location_index(**parts) -> str:
	"""'khewat:12 khewat:13 killa:5/2 ...' — the parsed lists, searchable with a LIKE filter."""
	return " ".join(f"{k}:{v}" for k, text in parts.items() for v in L.parse_numbers(text))


# ---------------------------------------------------------------- suppliers (owners) and party links
def ensure_supplier_group() -> str:
	group = frappe.db.get_single_value("RE Settings", "land_supplier_group") or SUPPLIER_GROUP
	if not frappe.db.exists("Supplier Group", group):
		parent = frappe.db.get_value("Supplier Group", {"is_group": 1}, "name", order_by="lft")
		if not parent:
			frappe.throw(_("Complete the ERPNext setup wizard first (there is no supplier group tree yet)"))
		frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": group, "parent_supplier_group": parent}).insert(ignore_permissions=True)
	if not frappe.db.get_single_value("RE Settings", "land_supplier_group"):
		frappe.db.set_single_value("RE Settings", "land_supplier_group", group)
	return group


def ensure_supplier(owner) -> str:
	"""Create or update the owner's Supplier (Land Owners group, CNIC as tax id); returns its name."""
	group = ensure_supplier_group()
	if owner.supplier and frappe.db.exists("Supplier", owner.supplier):
		frappe.db.set_value("Supplier", owner.supplier, {"tax_id": owner.cnic, "mobile_no": owner.mobile_no}, update_modified=False)
		return owner.supplier
	name = owner.display_name or owner.owner_name
	if frappe.db.exists("Supplier", name):  # another person with the same name and father's name
		name = f"{name} ({(owner.cnic or owner.name)[-5:]})"
	sup = frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": group, "supplier_type": "Individual",
						  "country": "Pakistan", "tax_id": owner.cnic, "mobile_no": owner.mobile_no})
	sup.flags.ignore_permissions = True
	sup.insert()
	return sup.name


def ensure_party_link(supplier: str | None, customer: str | None):
	"""Join an owner's Supplier and Customer so both sides show in one ledger (ERPNext Party Link)."""
	if not (supplier and customer) or not frappe.db.exists("DocType", "Party Link"):
		return
	if frappe.db.exists("Party Link", {"primary_party": supplier, "secondary_party": customer}) or \
			frappe.db.exists("Party Link", {"primary_party": customer, "secondary_party": supplier}):
		return
	frappe.get_doc({"doctype": "Party Link", "primary_role": "Supplier", "primary_party": supplier,
					"secondary_role": "Customer", "secondary_party": customer}).insert(ignore_permissions=True)


# ---------------------------------------------------------------- ledger (filled in by the accounting step)
def line_ledger(deal) -> dict[int, dict]:
	"""{ser: {"paid", "adjusted", "invoiced", "refunded"}} for a deal's owner lines, read from the tagged vouchers."""
	from realestate import land_accounts

	return land_accounts.line_ledger(deal)


# ---------------------------------------------------------------- setup
def setup():
	from realestate import land_accounts

	if not frappe.db.exists("DocType", "RE Land Deal"):  # module not synced yet (first migrate after adding the app files)
		return
	if not frappe.db.exists("Supplier Group", {"is_group": 1}):
		return  # fresh site before the ERPNext setup wizard: no supplier group tree or company yet — runs again on the next migrate
	ensure_supplier_group()
	_workflow()
	_submit_workflow("RE Land Payment", "Pay", "Paid")
	_submit_workflow("RE Plot Adjustment", "Adjust", "Adjusted", always_approve=True)
	land_accounts.setup()
	for field, default in (("land_marla_sqft", 272), ("land_payment_approval_limit", 5_000_000), ("land_due_window_days", 7), ("land_province", "Punjab")):
		if not frappe.db.get_single_value("RE Settings", field):  # defaults are not applied to an existing Single
			frappe.db.set_single_value("RE Settings", field, default)


def _workflow():
	"""Land deal approval: Land Manager submits, Admin or Accounts Manager approves or rejects (documents stay editable
	drafts; economic fields lock once approved and change only through approved amendments)."""
	name = "RE Land Deal Approval"
	if frappe.db.exists("Workflow", name):
		return
	for state, style in (("Draft", ""), ("Pending Approval", "Warning"), ("Approved", "Success"), ("Rejected", "Danger")):
		if not frappe.db.exists("Workflow State", state):
			frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": state, "style": style}).insert(ignore_permissions=True)
	for action in ("Submit for Approval", "Approve", "Reject", "Revise"):
		if not frappe.db.exists("Workflow Action Master", action):
			frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": action}).insert(ignore_permissions=True)
	initiators = ("Land Manager", "System Manager")
	transitions = [{"state": "Draft", "action": "Submit for Approval", "next_state": "Pending Approval", "allowed": r} for r in initiators]
	transitions += [{"state": "Pending Approval", "action": a, "next_state": s, "allowed": r}
					for a, s in (("Approve", "Approved"), ("Reject", "Rejected")) for r in APPROVERS]
	transitions += [{"state": "Rejected", "action": "Revise", "next_state": "Draft", "allowed": r} for r in initiators]
	frappe.get_doc({
		"doctype": "Workflow", "workflow_name": name, "document_type": "RE Land Deal", "is_active": 1, "workflow_state_field": "workflow_state",
		"send_email_alert": 0, "override_status": 1,
		"states": [{"state": "Draft", "doc_status": "0", "allow_edit": "Land Manager"},
				   {"state": "Pending Approval", "doc_status": "0", "allow_edit": "Accounts Manager"},
				   {"state": "Approved", "doc_status": "0", "allow_edit": "Land Manager"},
				   {"state": "Rejected", "doc_status": "0", "allow_edit": "Land Manager"}],
		"transitions": transitions,
	}).insert(ignore_permissions=True)


def _submit_workflow(doctype: str, action: str, done: str, always_approve: bool = False):
	"""Seller payments: Land Manager / Accounts pay directly up to the limit; above it (doc.approval_required) Admin or
	Accounts Manager approve. Plot adjustments always need that approval. The approver cannot approve their own request."""
	name = f"{doctype} Approval"
	if frappe.db.exists("Workflow", name):
		return
	for state, style in (("Draft", ""), ("Pending Approval", "Warning"), (done, "Success"), ("Rejected", "Danger"), ("Cancelled", "Inverse")):
		if not frappe.db.exists("Workflow State", state):
			frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": state, "style": style}).insert(ignore_permissions=True)
	for a in (action, "Submit for Approval", "Approve", "Reject", "Revise", "Cancel"):
		if not frappe.db.exists("Workflow Action Master", a):
			frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": a}).insert(ignore_permissions=True)
	makers = ("Land Manager", "Accounts User", "Accounts Manager", "System Manager")
	transitions = []
	if not always_approve:
		transitions += [{"state": "Draft", "action": action, "next_state": done, "allowed": r, "condition": "not doc.approval_required"} for r in makers]
	transitions += [{"state": "Draft", "action": "Submit for Approval", "next_state": "Pending Approval", "allowed": r,
					 **({} if always_approve else {"condition": "doc.approval_required"})} for r in makers]
	transitions += [{"state": "Pending Approval", "action": a, "next_state": s, "allowed": r, "allow_self_approval": 0}
					for a, s in (("Approve", done), ("Reject", "Rejected")) for r in APPROVERS]
	transitions += [{"state": "Rejected", "action": "Revise", "next_state": "Draft", "allowed": r} for r in makers]
	transitions += [{"state": done, "action": "Cancel", "next_state": "Cancelled", "allowed": r} for r in APPROVERS]
	frappe.get_doc({
		"doctype": "Workflow", "workflow_name": name, "document_type": doctype, "is_active": 1, "workflow_state_field": "workflow_state",
		"send_email_alert": 0, "override_status": 1,
		"states": [{"state": "Draft", "doc_status": "0", "allow_edit": "Land Manager"},
				   {"state": "Pending Approval", "doc_status": "0", "allow_edit": "Accounts Manager"},
				   {"state": done, "doc_status": "1", "allow_edit": "Accounts Manager"},
				   {"state": "Rejected", "doc_status": "0", "allow_edit": "Land Manager"},
				   {"state": "Cancelled", "doc_status": "2", "allow_edit": "Accounts Manager"}],
		"transitions": transitions,
	}).insert(ignore_permissions=True)


# ---------------------------------------------------------------- API
@frappe.whitelist()
def act(name: str, action: str, doctype: str = "RE Land Deal") -> dict:
	"""Workflow buttons on land deals, seller payments and plot adjustments (the workflow decides who may do what)."""
	guard()
	if doctype not in ("RE Land Deal", "RE Land Payment", "RE Plot Adjustment"):
		frappe.throw(_("Not a land workflow document"))
	from frappe.model.workflow import apply_workflow

	doc = apply_workflow(frappe.get_doc(doctype, name), action)
	return {"state": doc.workflow_state, "docstatus": doc.docstatus}


@frappe.whitelist(methods=["GET"])
def area_preview(kanal: float = 0, marla: float = 0, sqft: float = 0, unit: str = "Kanal", rate: float = 0) -> dict:
	"""Live maths for the forms: normalised area, area in the unit and the due amount."""
	ms = marla_sqft()
	total = L.to_sqft(flt(kanal), flt(marla), flt(sqft), ms=ms)
	return {"sqft": total, "label": L.fmt_area(total, ms), "in_unit": L.in_unit(total, unit, ms), "due": L.due_amount(total, unit, flt(rate), ms),
			"acre": L.in_unit(total, "Acre", ms)}


def stage_row(parcel, stage: str, notes: str | None = None):
	parcel.append("stages", {"stage": stage, "stage_date": nowdate(), "responsible": parcel.responsible or frappe.session.user, "notes": notes})


def jsonify(value) -> str:
	return value if isinstance(value, str) else json.dumps(value, default=str)


def today():
	return getdate(nowdate())


def now():
	return now_datetime()
