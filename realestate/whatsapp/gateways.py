"""Pluggable message gateways behind WhatsApp: SMS and email (more can be registered in GATEWAYS).

WhatsApp is always tried first (realestate.whatsapp.channel.notify). If it is not possible or fails, the gateways listed
in RE Settings → "Fallback Channels" (e.g. "SMS, Email") are tried in that order until one succeeds. "Email a Copy" also
emails every automated message to parties that have an email address. In mock mode nothing leaves the machine.
"""

from typing import Protocol

import frappe
from frappe import _
from frappe.utils import now_datetime


class Gateway(Protocol):
	name: str  # shown as the log's channel
	status: str  # log status after a successful send

	def address(self, log) -> str | None: ...

	def send(self, log, text: str) -> None: ...


def _mock() -> bool:
	from realestate.whatsapp.mock import is_mock

	return is_mock()


class SmsGateway:
	name, status = "SMS", "SMS Sent"

	def address(self, log):
		return log.phone

	def send(self, log, text):
		if _mock() or not frappe.db.get_single_value("SMS Settings", "sms_gateway_url"):
			frappe.logger("realestate").info(f"[mock SMS] {log.phone}: {text}")
			return
		from frappe.core.doctype.sms_settings.sms_settings import send_sms

		send_sms([log.phone], text)


class EmailGateway:
	name, status = "Email", "Email Sent"

	def address(self, log):
		field = {"CRM Lead": "email", "CRM Deal": "email"}.get(log.party_type, "email_id")
		return frappe.db.get_value(log.party_type, log.party, field) if log.party_type and log.party else None

	def send(self, log, text):
		to = self.address(log)
		subject = _("{0} — Zarmeen Gardens").format(_(log.reminder_type))
		if _mock():
			frappe.logger("realestate").info(f"[mock email] {to}: {subject}: {text}")
			return
		attachments = []
		if log.reminder_type == "Payment Receipt" and log.reference_doctype == "RE Payment":
			attachments.append(frappe.attach_print("RE Payment", log.reference_name, print_format="RE Payment Receipt", file_name=f"Receipt {log.reference_name}"))
		frappe.sendmail(recipients=[to], subject=subject, message=frappe.utils.escape_html(text).replace("\n", "<br>"),
						attachments=attachments, reference_doctype=log.reference_doctype, reference_name=log.reference_name)


GATEWAYS: dict[str, Gateway] = {"SMS": SmsGateway(), "Email": EmailGateway()}


def fallback_order() -> list[Gateway]:
	raw = frappe.db.get_single_value("RE Settings", "fallback_channels") or ("SMS" if frappe.db.get_single_value("RE Settings", "sms_fallback") else "")
	return [GATEWAYS[c.strip()] for c in raw.split(",") if c.strip() in GATEWAYS]


def fall_back(log, error):
	"""Try each fallback gateway in order; the first that succeeds marks the log."""
	log.db_set("error", error)
	text = log.message or _("Message from Zarmeen Gardens regarding {0}").format(log.reference_name)
	problems = [error]
	for gw in fallback_order():
		if not gw.address(log):
			problems.append(_("{0}: no address").format(gw.name))
			continue
		try:
			gw.send(log, text)
			log.db_set({"status": gw.status, "channel": gw.name, "sms_sent_on": now_datetime()})
			return
		except Exception as e:  # noqa: BLE001 — try the next gateway
			problems.append(f"{gw.name}: {e}")
	log.db_set({"status": "Failed", "error": " | ".join(str(p) for p in problems)[:1000]})


def email_copy(log):
	"""Optional: also email the message (RE Settings → Email a Copy)."""
	if not frappe.db.get_single_value("RE Settings", "email_copy"):
		return
	gw = GATEWAYS["Email"]
	if gw.address(log):
		try:
			gw.send(log, log.message or "")
		except Exception:  # noqa: BLE001 — a copy must never break the main send
			frappe.log_error(title="Email copy failed", message=frappe.get_traceback())
