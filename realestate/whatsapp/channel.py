"""Outgoing channel used by reminders, receipts and broadcasts: WhatsApp first, then the fallback gateways (SMS, Email).

Every automated message leaves an RE Reminder Log. A send that raises falls back to SMS at once;
one that Meta later reports as failed (webhook status) is picked up by `sms_fallback_for_failed`.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import now_datetime, nowdate

from realestate.whatsapp.inbox import is_opted_out, profile_for

TEMPLATES = {
	# reminder type -> template label (template_name is derived from it)
	"Booking Confirmation": "RE Booking Confirmation",
	"Payment Receipt": "RE Payment Receipt",
	"Installment Reminder": "RE Installment Reminder",
	"Overdue Notice": "RE Overdue Notice",
	"Society Bill": "RE Society Bill",
	"Follow Up": "RE Follow Up",
	"Site Visit Invitation": "RE Site Visit Invitation",
}


def template_name(label):
	return frappe.db.get_value("WhatsApp Template", {"template_label": label}, "name")


def recipient(reference_doctype, reference_name):
	"""(party_type, party, phone) for a document we message about."""
	doc = frappe.get_doc(reference_doctype, reference_name)
	if reference_doctype in ("CRM Lead", "CRM Deal", "Customer"):
		return reference_doctype, reference_name, doc.get("mobile_no") or doc.get("phone")
	if reference_doctype == "RE Site Visit":
		return doc.party_type, doc.party, doc.mobile_no or _party_phone(doc.party_type, doc.party)
	customer = doc.get("customer")
	phone = doc.get("mobile_no") or frappe.db.get_value("Customer", customer, "mobile_no")
	return "Customer", customer, phone


def _party_phone(party_type, party):
	return frappe.db.get_value(party_type, party, "mobile_no")


def notify(reminder_type, reference_doctype, reference_name, for_date=None):
	"""Send the template for `reminder_type` about a document; log it; SMS if WhatsApp is not possible."""
	party_type, party, phone = recipient(reference_doctype, reference_name)
	log = frappe.get_doc({
		"doctype": "RE Reminder Log", "reminder_type": reminder_type, "for_date": for_date or nowdate(),
		"party_type": party_type, "party": party, "phone": phone, "reference_doctype": reference_doctype,
		"reference_name": reference_name, "channel": "WhatsApp", "status": "Queued",
	})
	template = template_name(TEMPLATES[reminder_type])
	log.message = render_template_text(template, reference_doctype, reference_name) if template else None
	log.insert(ignore_permissions=True)
	if not phone:
		log.db_set({"status": "Failed", "error": _("No mobile number")})
		return log.name
	if not template or is_opted_out(phone, party_type, party):
		_sms(log, _("Opted out of WhatsApp") if template else _("Template missing"))
		return log.name
	from realestate.whatsapp.gateways import email_copy

	email_copy(log)
	try:
		msg = send_template(template, phone, reference_doctype, reference_name,
							document=_receipt_pdf(reference_name) if reminder_type == "Payment Receipt" else None)
		status = frappe.db.get_value("WhatsApp Message", msg, "status")
		log.db_set({"whatsapp_message": msg, "status": "Failed" if status == "Failed" else "Sent"})
		if status == "Failed":
			_sms(log, frappe.db.get_value("WhatsApp Message", msg, "error_message"))
	except Exception as e:
		log.reload()
		_sms(log, str(e)[:500])
	return log.name


def send_template(template, phone, reference_doctype=None, reference_name=None, document=None):
	"""Like whatsapp.api.messages.send_template, plus an optional per-message document header."""
	profile = profile_for(phone)
	if not profile:
		frappe.throw(_("No default WhatsApp account configured"))
	doc = frappe.get_doc({
		"doctype": "WhatsApp Message", "direction": "Outgoing", "to": profile, "is_template": 1,
		"whatsapp_template": template, "message": "Template message",
		"reference_doctype": reference_doctype, "reference_docname": reference_name,
	})
	doc.flags.ignore_permissions = True
	doc.insert()
	if document:
		media_id = _upload(doc, document)
		doc.db_set("template_header_parameters", json.dumps({"id": media_id, "filename": document["file_name"]}))
		doc.db_set("attach", document["file"])
		doc.reload()
	try:
		doc.submit()
	except Exception:
		# the message stays as a Failed draft for the timeline; let the caller fall back
		frappe.db.commit()
		raise
	return doc.name


def _upload(doc, document):
	from whatsapp.whatsapp.doctype.whatsapp_message.whatsapp_message import _get_whatsapp_client

	account = frappe.get_doc("WhatsApp Account", doc.whatsapp_account)
	client = _get_whatsapp_client(account, frappe.get_single("WhatsApp Settings"))
	file_doc = frappe.get_doc("File", document["file"])
	return client.upload_media(file_doc.get_content(), "application/pdf", file_doc.file_name)["id"]


def _receipt_pdf(payment):
	"""Render the receipt print format to PDF and attach it to the payment."""
	file_name = f"Receipt-{payment}.pdf"
	existing = frappe.db.get_value("File", {"attached_to_doctype": "RE Payment", "attached_to_name": payment, "file_name": file_name}, "name")
	if not existing:
		try:
			pdf = frappe.get_print("RE Payment", payment, print_format="RE Payment Receipt", as_pdf=True)
		except Exception:
			frappe.log_error(title="RE receipt PDF")
			return None
		existing = frappe.get_doc({"doctype": "File", "file_name": file_name, "attached_to_doctype": "RE Payment",
								   "attached_to_name": payment, "is_private": 1, "content": pdf}).insert(ignore_permissions=True).name
	return {"file": existing, "file_name": file_name}


def send_text(profile=None, text=None, phone=None, reference_doctype=None, reference_name=None):
	"""Session (free-form) message — only reaches the customer within 24 h of their last message."""
	profile = profile or profile_for(phone)
	doc = frappe.get_doc({"doctype": "WhatsApp Message", "direction": "Outgoing", "to": profile, "message": text,
						  "reference_doctype": reference_doctype, "reference_docname": reference_name})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return doc.name


def render_template_text(template, reference_doctype, reference_name):
	"""The template body with its variables filled in from the reference document (used for SMS)."""
	tpl = frappe.get_cached_doc("WhatsApp Template", template)
	ref = frappe.get_doc(reference_doctype, reference_name) if tpl.reference_doctype == reference_doctype else None
	values = {v.variable_name: str(ref.get(v.variable_field) or "") for v in tpl.template_variables if ref and v.variable_field}
	return re.sub(r"\{\{\s*([^}]+?)\s*\}\}", lambda m: values.get(m.group(1), m.group(0)), tpl.message or "")


# ---------------------------------------------------------------- fallbacks (SMS, email — realestate.whatsapp.gateways)
def _sms(log, error):
	"""Kept for callers: fall back through the configured gateways (SMS, Email…)."""
	from realestate.whatsapp.gateways import fall_back

	fall_back(log, error)


def send_sms(phone, text):
	from realestate.whatsapp.gateways import GATEWAYS

	GATEWAYS["SMS"].send(frappe._dict(phone=phone), text)


def sms_fallback_for_failed():
	"""Per-minute: copy WhatsApp delivery status onto reminder logs; SMS the ones Meta reported failed."""
	rows = frappe.db.sql("""select l.name, m.status, m.error_message from `tabRE Reminder Log` l
		join `tabWhatsApp Message` m on m.name = l.whatsapp_message
		where l.status in ('Sent', 'Delivered') and m.status != l.status
		and l.creation > now() - interval 3 day limit 500""", as_dict=True)
	for r in rows:
		log = frappe.get_doc("RE Reminder Log", r.name)
		if r.status == "Failed":
			_sms(log, r.error_message or _("WhatsApp delivery failed"))
		elif r.status in ("Delivered", "Read"):
			log.db_set("status", r.status)
	if rows:
		frappe.db.commit()


@frappe.whitelist()
def send_now(reminder_type: str, reference_doctype: str, reference_name: str) -> str:
	"""Send (or resend) a receipt / reminder / bill / invitation from a form button."""
	frappe.get_doc(reference_doctype, reference_name).check_permission("read")
	if reminder_type not in TEMPLATES:
		frappe.throw(_("Unknown message type"))
	log = notify(reminder_type, reference_doctype, reference_name)
	return frappe.db.get_value("RE Reminder Log", log, "status")
