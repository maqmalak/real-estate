"""Public webhook for Meta: verification and signature use the encrypted RE Settings secrets.

Callback URL: https://<site>/api/method/realestate.whatsapp.webhook.handler
Subscribe the app to the `messages` (messages + statuses + template updates) and `calls` fields.
"""

import hashlib
import hmac
import json

import frappe
from frappe.utils.password import get_decrypted_password
from werkzeug.wrappers import Response

from whatsapp.whatsapp.api.utils import log


def _secret(field):
	return get_decrypted_password("RE Settings", "RE Settings", field, raise_exception=False) or ""


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def handler():
	if frappe.request.method == "GET":
		return _verify()
	secret = _secret("app_secret")
	if secret:
		raw = frappe.request.get_data()
		expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
		if not hmac.compare_digest(expected, frappe.get_request_header("X-Hub-Signature-256", "")):
			log("Error", "Webhook", "Signature mismatch on realestate webhook")
			return Response("bad signature", status=403, mimetype="text/plain")
		payload = json.loads(raw or b"{}")
	else:
		payload = frappe.request.get_json(silent=True) or dict(frappe.local.form_dict)
	process_payload(payload)
	return Response("ok", status=200, mimetype="text/plain")


def _verify():
	args = frappe.form_dict
	token = _secret("webhook_verify_token")
	if args.get("hub.mode") == "subscribe" and token and hmac.compare_digest(args.get("hub.verify_token") or "", token):
		return Response(args.get("hub.challenge") or "", status=200, mimetype="text/plain")
	return Response("verification failed", status=403, mimetype="text/plain")


def process_payload(payload):
	"""Route Meta webhook changes: messages/statuses/templates to the whatsapp app, calls to us."""
	from whatsapp.whatsapp.webhook import _handle_messages, _handle_template_status

	from realestate.session import as_system
	from realestate.whatsapp.calls import handle_calls

	with as_system():
		log("Info", "Webhook", "realestate webhook payload", request_data=payload)
		for entry in payload.get("entry", []):
			for change in entry.get("changes", []):
				field, value = change.get("field"), change.get("value", {})
				if field == "messages":
					call_statuses = [s for s in value.get("statuses", []) if s.get("type") == "call"]
					if call_statuses:
						value = {**value, "statuses": [s for s in value.get("statuses", []) if s.get("type") != "call"]}
						handle_calls({"statuses": call_statuses})
					_handle_messages(value)
				elif field == "calls":
					handle_calls(value)
				elif field == "message_template_status_update":
					_handle_template_status(value)
	frappe.db.commit()
