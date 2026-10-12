"""Endpoints behind the WhatsApp chat panel on Lead, Deal, Customer and Plot forms and the team inbox."""

import json
import re

import frappe
from frappe import _

from realestate.whatsapp.inbox import PARTY_AGENT_FIELD, e164, party_agent, party_name, profile_for

CHAT_ROLES = ("System Manager", "Sales Manager", "Sales User")


def _guard():
	if not set(CHAT_ROLES) & set(frappe.get_roles()):
		frappe.throw(_("Only sales users can use WhatsApp"), frappe.PermissionError)


def _party_of(doctype, name):
	"""(party_type, party, phone) for any document that has a chat panel."""
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	if doctype in PARTY_AGENT_FIELD:
		return doctype, name, doc.get("mobile_no") or doc.get("phone")
	if doctype == "RE Conversation":
		return doc.party_type or None, doc.party or None, doc.phone
	if doctype == "RE Plot":
		return ("Customer", doc.customer, frappe.db.get_value("Customer", doc.customer, "mobile_no")) if doc.customer else (None, None, None)
	if doc.get("customer"):
		return "Customer", doc.customer, frappe.db.get_value("Customer", doc.customer, "mobile_no")
	return None, None, None


@frappe.whitelist()
def get_context(doctype: str, name: str) -> dict:
	_guard()
	party_type, party, phone = _party_of(doctype, name)
	profile = profile_for(phone, create=False) if phone else None
	conv = frappe.db.get_value("RE Conversation", profile, ["name", "agent", "opted_out", "unread_count", "status"], as_dict=True) if profile else None
	settings = frappe.get_cached_doc("RE Settings")
	ctx = {
		"party_type": party_type, "party": party, "party_name": party_name(party_type, party) if party else None, "phone": phone,
		"wa_link": f"https://wa.me/{e164(phone)}" if phone else None, "profile": profile, "conversation": conv,
		"agent": (conv or {}).get("agent") or (party_agent(party_type, party) if party else None),
		"opted_out": bool((conv or {}).get("opted_out") or (party and frappe.get_meta(party_type).has_field("re_whatsapp_opt_out")
																and frappe.db.get_value(party_type, party, "re_whatsapp_opt_out"))),
		"mock": bool(settings.mock_mode), "calling_api": bool(settings.calling_api_enabled) and not settings.mock_mode,
		"plots": _plots(doctype, name, party_type, party),
		"template_refs": _template_refs(doctype, name, party_type, party),
	}
	return ctx


def _plots(doctype, name, party_type, party):
	if doctype == "RE Plot":
		names = [name]
	elif party_type == "Customer":
		names = frappe.get_all("RE Plot", {"customer": party}, pluck="name")
	else:
		block = frappe.db.get_value(party_type, party, "re_interested_block") if party and frappe.get_meta(party_type).has_field("re_interested_block") else None
		plot = frappe.db.get_value(party_type, party, "re_interested_plot") if party and frappe.get_meta(party_type).has_field("re_interested_plot") else None
		names = [plot] if plot else frappe.get_all("RE Plot", {"block": block, "status": "Available"}, pluck="name", limit=5) if block else []
	return frappe.get_all("RE Plot", {"name": ("in", names or [""])}, ["name", "block", "plot_size", "status", "centre_lat", "centre_lng", "street"])


def _template_refs(doctype, name, party_type, party):
	"""Documents a template can be filled from, grouped by doctype."""
	refs = {}
	if party_type == "CRM Lead":
		refs["CRM Lead"] = [party]
	if party_type == "CRM Deal":
		refs["CRM Deal"] = [party]
		lead = frappe.db.get_value("CRM Deal", party, "lead")
		if lead:
			refs["CRM Lead"] = [lead]
	if party_type == "Customer":
		refs["RE Booking"] = frappe.get_all("RE Booking", {"customer": party, "docstatus": 1}, pluck="name", order_by="booking_date desc")
		refs["RE Payment"] = frappe.get_all("RE Payment", {"customer": party, "docstatus": 1}, pluck="name", order_by="posting_date desc", limit=10)
		refs["RE Society Bill"] = frappe.get_all("RE Society Bill", {"customer": party}, pluck="name", order_by="billing_month desc", limit=6)
	if party:
		refs["RE Site Visit"] = frappe.get_all("RE Site Visit", {"party": party}, pluck="name", order_by="visit_on desc", limit=5)
	if doctype in ("RE Booking", "RE Payment", "RE Society Bill", "RE Site Visit"):
		refs.setdefault(doctype, [])
		if name not in refs[doctype]:
			refs[doctype].insert(0, name)
	templates = frappe.get_all("WhatsApp Template", {"status": "Approved", "reference_doctype": ("in", list(refs) or [""])},
							   ["name", "template_label", "reference_doctype", "message", "header_type"])
	return {"templates": templates, "refs": {k: v for k, v in refs.items() if v}}


@frappe.whitelist()
def get_thread(doctype: str | None = None, name: str | None = None, profile: str | None = None, limit: int = 300) -> list[dict]:
	_guard()
	if not profile:
		_pt, _p, phone = _party_of(doctype, name)
		profile = profile_for(phone, create=False) if phone else None
	if not profile:
		return []
	rows = frappe.get_all("WhatsApp Message", {"to": profile, "reaction": ("is", "not set")}, [
		"name", "direction", "message", "status", "timestamp", "creation", "attach", "media_url", "mime_type", "media_id",
		"is_template", "whatsapp_template", "template_body_parameters", "owner", "error_message", "re_latitude", "re_longitude",
		"re_location_name", "reference_doctype", "reference_docname"], order_by="creation desc", limit=int(limit))
	files = {f.name: f for f in frappe.get_all("File", {"name": ("in", [r.attach for r in rows if r.attach] or [""])}, ["name", "file_url", "file_name"])}
	for r in rows:
		r.at = r.timestamp or r.creation
		if r.is_template and r.whatsapp_template:
			tpl = frappe.get_cached_doc("WhatsApp Template", r.whatsapp_template)
			params = json.loads(r.template_body_parameters or "{}") if (r.template_body_parameters or "").startswith("{") else {}
			r.template_label = tpl.template_label
			r.message = re.sub(r"\{\{\s*([^}]+?)\s*\}\}", lambda m: params.get(m.group(1), m.group(0)), tpl.message or "")
		f = files.get(r.attach)
		if f:
			r.file_url, r.file_name = f.file_url, f.file_name
		if r.status == "Failed" and r.error_message:
			r.error = _short_error(r.error_message)
		r.agent = frappe.utils.get_fullname(r.owner) if r.direction == "Outgoing" and r.owner not in ("Administrator", "Guest") else None
	return list(reversed(rows))


def _short_error(raw):
	try:
		data = json.loads(raw)
		if isinstance(data, list) and data:
			return data[0].get("title") or data[0].get("message") or raw
	except Exception:
		pass
	return raw[:200]


@frappe.whitelist()
def send(doctype: str, name: str, message: str | None = None, attach: str | None = None, template: str | None = None,
		 template_ref: str | None = None, plot: str | None = None, profile: str | None = None) -> str:
	"""Send from a chat panel: text, a file, an approved template, or a plot's location pin."""
	from whatsapp.whatsapp.api.messages import send_message

	from realestate.whatsapp.channel import send_template

	_guard()
	party_type, party, phone = _party_of(doctype, name)
	if profile:
		phone = frappe.db.get_value("WhatsApp Profile", profile, "phone_number")
	if not phone:
		frappe.throw(_("No mobile number on {0}").format(name))
	if template:
		ref_doctype = frappe.db.get_value("WhatsApp Template", template, "reference_doctype")
		msg = send_template(template, e164(phone), ref_doctype, template_ref)
	elif plot:
		msg = _send_location(e164(phone), plot, party_type, party)
	else:
		content_type = "text"
		if attach:
			ext = attach.rsplit(".", 1)[-1].lower()
			content_type = "image" if ext in ("png", "jpg", "jpeg", "webp", "gif") else "video" if ext in ("mp4", "3gp") else "document"
		msg = send_message(to=profile_for(phone), message=message or "", attach=attach, content_type=content_type,
						   reference_doctype=party_type, reference_docname=party)
	prof = frappe.db.get_value("WhatsApp Message", msg, "to")
	if frappe.db.exists("RE Conversation", prof):
		frappe.db.set_value("RE Conversation", prof, "unread_count", 0)
	return msg


def _send_location(phone, plot, party_type, party):
	p = frappe.db.get_value("RE Plot", plot, ["name", "centre_lat", "centre_lng", "block", "plot_size", "street", "project"], as_dict=True)
	if not p.centre_lat:
		frappe.throw(_("Plot {0} has no map position").format(plot))
	doc = frappe.get_doc({
		"doctype": "WhatsApp Message", "direction": "Outgoing", "to": profile_for(phone),
		"message": _("📍 Plot {0} ({1}, {2})").format(p.name, p.plot_size, p.block),
		"re_latitude": p.centre_lat, "re_longitude": p.centre_lng, "re_location_name": _("Plot {0} - {1}").format(p.name, p.project),
		"re_location_address": ", ".join(x for x in (p.street, p.block, p.project) if x),
		"reference_doctype": party_type, "reference_docname": party,
	})
	doc.insert()
	doc.submit()
	return doc.name


@frappe.whitelist()
def quick_replies() -> list[dict]:
	_guard()
	return frappe.get_all("RE Quick Reply", ["title", "shortcut", "message"], order_by="title")
