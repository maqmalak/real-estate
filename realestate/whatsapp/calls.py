"""WhatsApp calls, logged as CRM Call Log so they appear in Frappe CRM and on the unified timeline.

- Business Calling API (when enabled for the number): the agent's browser makes a WebRTC offer,
  we POST it to /{phone-number-id}/calls, Meta's answer SDP arrives on the `calls` webhook and is
  pushed to that browser; incoming calls ring the agents' browsers and can be accepted there.
- Otherwise the Call button opens wa.me and the agent logs the call with `log_call`.
- Missed incoming calls create a CRM Task for the assigned agent.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, now_datetime

from realestate.whatsapp.inbox import find_party, party_agent, party_name, phone_key

ANSWERED_OUTCOMES = ("Answered", "Promised to Pay", "Not Interested", "Call Back Later")


def _graph_client():
	from whatsapp.whatsapp.doctype.whatsapp_message.whatsapp_message import _get_whatsapp_client

	account = frappe.get_doc("WhatsApp Account", frappe.db.get_single_value("WhatsApp Settings", "default_account"))
	return _get_whatsapp_client(account, frappe.get_single("WhatsApp Settings"))


def _business_phone():
	account = frappe.db.get_single_value("WhatsApp Settings", "default_account")
	return frappe.db.get_single_value("RE Settings", "display_phone_number") or frappe.db.get_value("WhatsApp Account", account, "phone_id")


# ---------------------------------------------------------------- manual / click-to-call logging
@frappe.whitelist()
def log_call(party_type: str, party: str, direction: str = "Outgoing", outcome: str = "Answered", duration: int = 0,
			 notes: str | None = None, promised_amount: float | None = None, promised_date: str | None = None,
			 next_follow_up: str | None = None, phone: str | None = None, channel: str = "WhatsApp Click-to-Call",
			 call_log: str | None = None) -> str:
	frappe.get_doc(party_type, party).check_permission("read")
	phone = phone or frappe.db.get_value(party_type, party, "mobile_no")
	values = {
		"type": direction, "status": "Completed" if outcome in ANSWERED_OUTCOMES else ("Busy" if outcome == "Busy" else "No Answer"),
		"duration": cint(duration), "re_outcome": outcome, "re_notes": notes, "re_channel": channel,
		"re_promised_amount": flt(promised_amount) or None, "re_promised_date": promised_date or None,
		"re_next_follow_up": next_follow_up or None, "reference_doctype": party_type, "reference_docname": party,
	}
	if call_log:  # outcome for a call already logged by the Calling API
		doc = frappe.get_doc("CRM Call Log", call_log)
		if doc.duration:
			values.pop("duration")
		if doc.status in ("Completed", "No Answer"):
			values.pop("status")
		doc.update(values)
		doc.save(ignore_permissions=True)
		return doc.name
	me, biz = frappe.session.user, _business_phone() or "business"
	start = add_to_date(now_datetime(), seconds=-cint(duration))
	doc = frappe.get_doc({
		"doctype": "CRM Call Log", **values, "telephony_medium": "Manual", "medium": "WhatsApp",
		"from": biz if direction == "Outgoing" else phone, "to": phone if direction == "Outgoing" else biz,
		"caller": me if direction == "Outgoing" else None, "receiver": me if direction == "Incoming" else None,
		"start_time": start, "end_time": now_datetime(),
	})
	doc.insert(ignore_permissions=True)
	return doc.name


def on_call_log(doc, method=None):
	"""after_insert: follow-up tasks for missed calls and requested follow-ups."""
	_follow_ups(doc)


def on_call_log_update(doc, method=None):
	if doc.has_value_changed("re_next_follow_up") or doc.has_value_changed("re_outcome"):
		_follow_ups(doc)


def _follow_ups(doc):
	if not (doc.reference_doctype and doc.reference_docname):
		return
	agent = doc.receiver or doc.caller or party_agent(doc.reference_doctype, doc.reference_docname)
	who = party_name(doc.reference_doctype, doc.reference_docname)
	if doc.type == "Incoming" and doc.re_outcome == "Missed" and not doc.get("re_follow_up_task"):
		hours = cint(frappe.db.get_single_value("RE Settings", "missed_call_follow_up_hours")) or 2
		task = create_task(doc.reference_doctype, doc.reference_docname, _("Call back {0} (missed WhatsApp call)").format(who),
						   agent, add_to_date(doc.start_time or now_datetime(), hours=hours), "High",
						   _("Missed incoming WhatsApp call from {0}").format(doc.get("from")))
		doc.db_set("re_follow_up_task", task)
	if doc.re_next_follow_up and not frappe.db.exists("CRM Task", {"reference_docname": doc.reference_docname,
																	   "due_date": doc.re_next_follow_up, "status": ("not in", ("Done", "Canceled"))}):
		create_task(doc.reference_doctype, doc.reference_docname, _("Follow up with {0}").format(who), agent,
					doc.re_next_follow_up, "Medium", doc.re_notes or "")
		if frappe.get_meta(doc.reference_doctype).has_field("re_next_follow_up"):
			frappe.db.set_value(doc.reference_doctype, doc.reference_docname, "re_next_follow_up", doc.re_next_follow_up)


def create_task(reference_doctype, reference_name, title, agent, due, priority="Medium", description=""):
	task = frappe.get_doc({
		"doctype": "CRM Task", "title": title, "assigned_to": agent, "status": "Todo", "priority": priority,
		"due_date": due, "start_date": get_datetime(due).date(), "description": description,
		"reference_doctype": reference_doctype, "reference_docname": reference_name,
	})
	task.insert(ignore_permissions=True)
	if agent:
		frappe.get_doc({"doctype": "Notification Log", "for_user": agent, "type": "Alert", "document_type": "CRM Task",
						"document_name": task.name, "subject": title}).insert(ignore_permissions=True)
	return task.name


# ---------------------------------------------------------------- Business Calling API
@frappe.whitelist()
def start_call(party_type: str, party: str, sdp_offer: str) -> dict:
	"""Business-initiated call: send the browser's SDP offer to Meta and log the call."""
	frappe.get_doc(party_type, party).check_permission("read")
	if not frappe.db.get_single_value("RE Settings", "calling_api_enabled"):
		frappe.throw(_("The WhatsApp Calling API is not enabled in RE Settings"))
	phone = frappe.db.get_value(party_type, party, "mobile_no")
	to = "".join(c for c in phone if c.isdigit())
	client = _graph_client()
	result = client._request("POST", f"{client.phone_number_id}/calls", json={
		"messaging_product": "whatsapp", "to": to, "action": "connect", "session": {"sdp_type": "offer", "sdp": sdp_offer}})
	call_id = (result.get("calls") or [{}])[0].get("id")
	log = frappe.get_doc({
		"doctype": "CRM Call Log", "type": "Outgoing", "status": "Initiated", "telephony_medium": "Manual", "medium": "WhatsApp",
		"from": _business_phone(), "to": phone, "caller": frappe.session.user, "start_time": now_datetime(),
		"reference_doctype": party_type, "reference_docname": party, "re_channel": "WhatsApp Calling API", "re_wa_call_id": call_id,
	}).insert(ignore_permissions=True)
	return {"call_id": call_id, "call_log": log.name}


@frappe.whitelist()
def accept_call(call_id: str, sdp_answer: str) -> str:
	"""Agent picked up an incoming call in the browser."""
	client = _graph_client()
	session = {"sdp_type": "answer", "sdp": sdp_answer}
	for action in ("pre_accept", "accept"):
		client._request("POST", f"{client.phone_number_id}/calls", json={"messaging_product": "whatsapp", "call_id": call_id,
																		  "action": action, "session": session})
	log = frappe.db.get_value("CRM Call Log", {"re_wa_call_id": call_id}, "name")
	frappe.db.set_value("CRM Call Log", log, {"status": "In Progress", "receiver": frappe.session.user})
	frappe.publish_realtime("re_wa_call_taken", {"call_id": call_id, "by": frappe.session.user})
	return log


@frappe.whitelist()
def end_call(call_id: str, reject: int = 0) -> None:
	client = _graph_client()
	client._request("POST", f"{client.phone_number_id}/calls", json={"messaging_product": "whatsapp", "call_id": call_id,
																	  "action": "reject" if cint(reject) else "terminate"})


def handle_calls(value):
	"""`calls` webhook: connect / terminate events, plus call status updates."""
	contacts = {c.get("wa_id"): (c.get("profile") or {}).get("name") for c in value.get("contacts", [])}
	for call in value.get("calls", []):
		if call.get("event") == "connect":
			_on_connect(call, contacts.get(call.get("from")))
		elif call.get("event") == "terminate":
			_on_terminate(call)
	for status in value.get("statuses", []):
		log = frappe.db.get_value("CRM Call Log", {"re_wa_call_id": status.get("id")}, "name")
		state = {"RINGING": "Ringing", "ACCEPTED": "In Progress", "REJECTED": "Busy"}.get((status.get("status") or "").upper())
		if log and state:
			frappe.db.set_value("CRM Call Log", log, "status", state)


def _on_connect(call, caller_name):
	session = call.get("session") or {}
	existing = frappe.db.get_value("CRM Call Log", {"re_wa_call_id": call["id"]}, ["name", "caller"], as_dict=True)
	if existing:  # our outgoing call was answered: hand Meta's SDP answer to the calling browser
		frappe.db.set_value("CRM Call Log", existing.name, "status", "In Progress")
		frappe.publish_realtime("re_wa_call_answer", {"call_id": call["id"], "sdp": session.get("sdp")}, user=existing.caller)
		return
	phone = "+" + call.get("from", "")
	party_type, party = find_party(phone)
	if not party and frappe.db.get_single_value("RE Settings", "auto_create_lead"):
		party_type, party = "CRM Lead", _lead_for_caller(phone, caller_name)
	agent = party_agent(party_type, party) if party else frappe.db.get_single_value("RE Settings", "default_agent")
	log = frappe.get_doc({
		"doctype": "CRM Call Log", "type": "Incoming", "status": "Ringing", "telephony_medium": "Manual", "medium": "WhatsApp",
		"from": phone, "to": _business_phone() or "business", "receiver": agent, "start_time": _ts(call.get("timestamp")),
		"reference_doctype": party_type, "reference_docname": party,
		"re_channel": "WhatsApp Calling API", "re_wa_call_id": call["id"],
	}).insert(ignore_permissions=True)
	_ring_agents(log, call, phone, party_type, party, caller_name, session)


def _ring_agents(log, call, phone, party_type, party, caller_name, session):
	from realestate.whatsapp.mock import is_mock

	if is_mock():  # simulated calls have no media to answer
		return
	payload = {"call_id": call["id"], "call_log": log.name, "phone": phone, "sdp": session.get("sdp"),
			   "name": party_name(party_type, party) if party else (caller_name or phone), "party_type": party_type, "party": party}
	users = {log.receiver} if log.receiver else set()
	users |= set(frappe.get_all("Has Role", {"role": "Sales User", "parenttype": "User"}, pluck="parent"))
	for user in users - {"Administrator", "Guest", None}:
		frappe.publish_realtime("re_wa_incoming_call", payload, user=user, after_commit=True)


def _lead_for_caller(phone, caller_name):
	from realestate.whatsapp.inbox import _next_agent

	first, _sep, last = (caller_name or phone).partition(" ")
	lead = frappe.get_doc({"doctype": "CRM Lead", "first_name": first, "last_name": last, "mobile_no": phone, "status": "New",
						   "source": "WhatsApp" if frappe.db.exists("CRM Lead Source", "WhatsApp") else None, "lead_owner": _next_agent()})
	lead.insert(ignore_permissions=True)
	lead.add_comment("Info", _("Created from an incoming WhatsApp call"))
	return lead.name


def _on_terminate(call):
	log = frappe.db.get_value("CRM Call Log", {"re_wa_call_id": call["id"]}, "name")
	if not log:
		return
	doc = frappe.get_doc("CRM Call Log", log)
	duration = cint(call.get("duration"))
	answered = duration > 0 or doc.status == "In Progress"
	doc.update({
		"status": "Completed" if answered else ("No Answer" if doc.type == "Incoming" else "Failed"),
		"duration": duration, "end_time": _ts(call.get("end_time") or call.get("timestamp")),
	})
	if call.get("start_time"):
		doc.start_time = _ts(call["start_time"])
	if doc.type == "Incoming" and not answered:
		doc.re_outcome = "Missed"
	elif answered and not doc.re_outcome:
		doc.re_outcome = "Answered"
	doc.save(ignore_permissions=True)
	if doc.caller or doc.receiver:
		frappe.publish_realtime("re_wa_call_ended", {"call_id": call["id"], "call_log": doc.name, "answered": answered},
								user=doc.caller or doc.receiver, after_commit=True)


def _ts(value):
	from datetime import datetime

	return datetime.fromtimestamp(int(value)) if value else now_datetime()
