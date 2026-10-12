import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_url

ACCOUNT = "Zarmeen WhatsApp"


class RESettings(Document):
	def validate(self):
		self.webhook_url = get_url("/api/method/realestate.whatsapp.webhook.handler")

	def on_update(self):
		sync_whatsapp_account(self)
		if self.has_value_changed("mock_mode") and not self.mock_mode and not self.is_new():
			frappe.enqueue(repush_mock_templates, enqueue_after_commit=True)

	@frappe.whitelist()
	def reset_demo_data(self):
		frappe.only_for("System Manager")
		frappe.enqueue("realestate.demo.seed.reset", queue="long", timeout=3600, enqueue_after_commit=True)
		return _("Demo data is being regenerated in the background. This takes a few minutes.")


def sync_whatsapp_account(settings):
	"""The whatsapp app sends through a WhatsApp Account; keep ours in step with RE Settings."""
	account = frappe.get_doc("WhatsApp Account", ACCOUNT) if frappe.db.exists("WhatsApp Account", ACCOUNT) else frappe.new_doc("WhatsApp Account")
	token = settings.get_password("access_token", raise_exception=False) if settings.access_token else None
	account.update({
		"account_name": ACCOUNT, "status": "Active",
		"phone_id": settings.phone_number_id or "MOCK-PHONE-ID",
		"business_id": settings.business_account_id or "MOCK-WABA-ID", "app_id": settings.app_id or "",
	})
	if token or not account.access_token:
		account.access_token = token or "mock-token"
	account.flags.ignore_permissions = True
	account.save()
	ws = frappe.get_single("WhatsApp Settings")
	if ws.default_account != account.name:
		ws.default_account = account.name
		ws.flags.ignore_permissions = True
		ws.save()


def repush_mock_templates():
	"""Leaving mock mode: submit the templates that were only "approved" by the mock to Meta for real."""
	for name in frappe.get_all("WhatsApp Template", {"whatsapp_template_id": ("like", "MOCKTPL%")}, pluck="name"):
		doc = frappe.get_doc("WhatsApp Template", name)
		doc.whatsapp_template_id = None
		doc.status = "Pending"
		try:
			doc.save(ignore_permissions=True)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"Push template {name} to Meta")


@frappe.whitelist()
def run_reminders():
	frappe.only_for(("System Manager", "Sales Manager"))
	from realestate.tasks import refresh_dues, send_installment_reminders, send_overdue_notices

	before = frappe.db.count("RE Reminder Log")
	refresh_dues()
	send_installment_reminders()
	send_overdue_notices()
	return _("{0} reminders sent (WhatsApp first, SMS fallback).").format(frappe.db.count("RE Reminder Log") - before)
