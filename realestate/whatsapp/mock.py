"""Mock mode: test every WhatsApp feature without a live Meta account.

The whatsapp app's Graph API client is patched once per process; each call checks the current
site's RE Settings.mock_mode, so other sites served by the same process are unaffected.

- sends succeed with a fake wamid; a per-minute job moves them Sent -> Delivered -> Read
  through the real webhook status handler (numbers ending in 0000 go to Failed instead,
  which exercises the SMS fallback);
- template create / update "approves" immediately; media uploads return a fake id;
- the Calling API answers with a fake call id;
- simulate_incoming_message / simulate_incoming_call feed Meta-shaped payloads to the webhook.
"""

import hashlib
import time

import frappe
from frappe.utils import add_to_date, now_datetime

_installed = False


def install(**kwargs):
	global _installed
	if _installed:
		return
	from whatsapp.whatsapp.api.whatsapp import WhatsApp

	real_request, real_upload = WhatsApp._request, WhatsApp.upload_media

	def _request(self, method, endpoint, **kw):
		if is_mock():
			return _fake_response(method, endpoint, kw.get("json") or {})
		return real_request(self, method, endpoint, **kw)

	def upload_media(self, file_content, mime_type, file_name):
		if is_mock():
			return {"id": f"MOCKMEDIA{int(time.time() * 1000)}"}
		return real_upload(self, file_content, mime_type, file_name)

	WhatsApp._request, WhatsApp.upload_media = _request, upload_media
	_installed = True


def is_mock():
	if not getattr(frappe.local, "site", None) or "realestate" not in frappe.get_installed_apps():
		return False
	return bool(frappe.db.get_single_value("RE Settings", "mock_mode"))


def _fake_response(method, endpoint, payload):
	stamp = f"{time.time_ns()}"
	if endpoint.endswith("/messages"):
		if payload.get("status") == "read":
			return {"success": True}
		return {"messaging_product": "whatsapp", "contacts": [{"input": payload.get("to"), "wa_id": payload.get("to")}],
				"messages": [{"id": f"wamid.MOCK{stamp}"}]}
	if endpoint.endswith("/calls"):
		return {"messaging_product": "whatsapp", "calls": [{"id": f"wacid.MOCK{stamp}"}]}
	if "message_templates" in endpoint:
		if method == "GET":
			return {"data": []}
		return {"id": f"MOCKTPL{stamp}", "status": "APPROVED", "category": payload.get("category", "UTILITY")}
	return {"success": True, "id": f"MOCK{stamp}"}


def _ends_0000(profile):
	phone = frappe.db.get_value("WhatsApp Profile", profile, "phone_number") or ""
	return "".join(c for c in phone if c.isdigit()).endswith("0000")


def progress_statuses():
	"""Per-minute job: walk mock sends through delivered / read (or failed) via the real webhook code."""
	if not is_mock():
		return
	from whatsapp.whatsapp.webhook import _update_message_status

	account = frappe.db.get_single_value("WhatsApp Settings", "default_account")
	now = now_datetime()
	sent = frappe.get_all("WhatsApp Message", {"direction": "Outgoing", "status": "Sent", "message_id": ("like", "wamid.MOCK%"),
											   "modified": ("<", add_to_date(now, seconds=-10))}, ["message_id", "to"], limit=300)
	for m in sent:
		_update_message_status({"id": m.message_id, "status": "failed" if _ends_0000(m.to) else "delivered",
								"errors": [{"code": 131026, "title": "Mock: message undeliverable"}] if _ends_0000(m.to) else []}, account)
	delivered = frappe.get_all("WhatsApp Message", {"direction": "Outgoing", "status": "Delivered", "message_id": ("like", "wamid.MOCK%"),
													"modified": ("<", add_to_date(now, seconds=-50))}, ["message_id"], limit=300)
	for m in delivered:
		if int(hashlib.md5(m.message_id.encode()).hexdigest(), 16) % 10 < 7:  # most get read, some stay delivered
			_update_message_status({"id": m.message_id, "status": "read"}, account)
	frappe.db.commit()


def _payload(field, value):
	phone_id = frappe.db.get_value("WhatsApp Account", frappe.db.get_single_value("WhatsApp Settings", "default_account"), "phone_id")
	value = {"messaging_product": "whatsapp", "metadata": {"phone_number_id": phone_id, "display_phone_number": phone_id}, **value}
	return {"object": "whatsapp_business_account", "entry": [{"id": "MOCK", "changes": [{"field": field, "value": value}]}]}


def _wa_id(phone):
	digits = "".join(c for c in phone if c.isdigit())
	return "92" + digits[1:] if digits.startswith("0") else digits


@frappe.whitelist()
def simulate_incoming_message(phone: str, text: str, name: str | None = None) -> str:
	"""Pretend Meta delivered a customer's message to the webhook."""
	_only_in_mock()
	from realestate.whatsapp.webhook import process_payload

	wa_id = _wa_id(phone)
	msg_id = f"wamid.MOCKIN{time.time_ns()}"
	process_payload(_payload("messages", {
		"contacts": [{"profile": {"name": name or wa_id}, "wa_id": wa_id}],
		"messages": [{"from": wa_id, "id": msg_id, "timestamp": str(int(time.time())), "type": "text", "text": {"body": text}}],
	}))
	return frappe.db.get_value("WhatsApp Message", {"message_id": msg_id}, "name")


@frappe.whitelist()
def simulate_incoming_call(phone: str, answered: int = 0, duration: int = 0, name: str | None = None) -> str:
	"""Pretend a customer called the business number: connect, then terminate (missed when not answered)."""
	_only_in_mock()
	from realestate.whatsapp.webhook import process_payload

	wa_id = _wa_id(phone)
	call_id = f"wacid.MOCKIN{time.time_ns()}"
	contact = [{"profile": {"name": name or wa_id}, "wa_id": wa_id}]
	now = int(time.time())
	process_payload(_payload("calls", {"contacts": contact, "calls": [
		{"id": call_id, "from": wa_id, "to": "business", "event": "connect", "direction": "USER_INITIATED",
		 "timestamp": str(now), "session": {"sdp_type": "offer", "sdp": "v=0 (mock)"}}]}))
	answered = int(answered)
	process_payload(_payload("calls", {"contacts": contact, "calls": [
		{"id": call_id, "from": wa_id, "to": "business", "event": "terminate", "direction": "USER_INITIATED",
		 "timestamp": str(now + int(duration or 0)), "status": "COMPLETED" if answered else "FAILED",
		 "start_time": str(now) if answered else None, "end_time": str(now + int(duration or 0)) if answered else None,
		 "duration": int(duration or 0) if answered else 0}]}))
	return frappe.db.get_value("CRM Call Log", {"re_wa_call_id": call_id}, "name")


def _only_in_mock():
	frappe.only_for(("System Manager", "Sales Manager", "Sales User"))
	if not is_mock():
		frappe.throw("Simulation is only available in mock mode (RE Settings)")
