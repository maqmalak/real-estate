"""Shared team inbox: one RE Conversation per WhatsApp number, linked to its Lead / Deal / Customer."""

import frappe
from frappe import _
from frappe.utils import now_datetime, strip_html

PARTY_AGENT_FIELD = {"CRM Lead": "lead_owner", "CRM Deal": "deal_owner", "Customer": "account_manager"}
PARTY_NAME_FIELD = {"CRM Lead": "lead_name", "CRM Deal": "lead_name", "Customer": "customer_name"}


def phone_key(phone):
	"""Last 10 digits — matches 0300-1234567, +92 300 1234567 and 923001234567 alike."""
	digits = "".join(c for c in (phone or "") if c.isdigit())
	return digits[-10:] if len(digits) >= 10 else digits


def e164(phone):
	"""Digits only, Pakistani 03xx numbers as 923xx — the form Meta uses for wa_id."""
	digits = "".join(c for c in phone or "" if c.isdigit())
	return "92" + digits[1:] if digits.startswith("0") else digits


def profile_for(phone, create=True):
	"""The WhatsApp Profile for a number in any format (created on the default account if missing)."""
	from whatsapp.whatsapp.api.messages import _resolve_to_profile

	key = phone_key(phone)
	if not key:
		return None
	found = frappe.db.sql("""select name from `tabWhatsApp Profile`
		where RIGHT(REGEXP_REPLACE(phone_number, '[^0-9]', ''), 10) = %s order by modified desc limit 1""", key)
	if found:
		return found[0][0]
	return _resolve_to_profile(e164(phone), create_if_missing=True) if create else None


def find_party(phone):
	"""Customer first, then an open deal, then a lead; (party_type, name) or (None, None)."""
	key = phone_key(phone)
	if len(key) < 7:
		return None, None
	match = "RIGHT(REGEXP_REPLACE(IFNULL({0}, ''), '[^0-9]', ''), 10) = %(key)s"
	queries = [
		("Customer", f"select name from `tabCustomer` where {match.format('mobile_no')} and disabled = 0 order by creation desc limit 1"),
		("CRM Deal", f"select name from `tabCRM Deal` where ({match.format('mobile_no')} or {match.format('phone')}) order by modified desc limit 1"),
		("CRM Lead", f"select name from `tabCRM Lead` where ({match.format('mobile_no')} or {match.format('phone')}) order by modified desc limit 1"),
	]
	for doctype, sql in queries:
		rows = frappe.db.sql(sql, {"key": key})
		if rows:
			return doctype, rows[0][0]
	# phone stored only on a linked contact
	row = frappe.db.sql(f"""select dl.link_doctype, dl.link_name from `tabContact Phone` cp
		join `tabDynamic Link` dl on dl.parent = cp.parent and dl.parenttype = 'Contact'
		where {match.format('cp.phone')} and dl.link_doctype in ('Customer', 'CRM Deal', 'CRM Lead')
		order by field(dl.link_doctype, 'Customer', 'CRM Deal', 'CRM Lead') limit 1""", {"key": key})
	return (row[0][0], row[0][1]) if row else (None, None)


def party_agent(party_type, party):
	field = PARTY_AGENT_FIELD.get(party_type)
	agent = frappe.db.get_value(party_type, party, field) if field and party else None
	return agent or frappe.db.get_single_value("RE Settings", "default_agent")


def party_name(party_type, party):
	field = PARTY_NAME_FIELD.get(party_type)
	return (frappe.db.get_value(party_type, party, field) if field and party else None) or party


def profile_phone(profile):
	return frappe.db.get_value("WhatsApp Profile", profile, "phone_number")


# ---------------------------------------------------------------- WhatsApp Message hooks
def link_party(doc, method=None):
	"""validate: give every message a Lead / Deal / Customer reference when it has none."""
	if doc.get("reference_docname") or not doc.to:
		return
	doc.reference_doctype = None  # may have been set by Frappe CRM's own (contact-based) matching
	party_type, party = find_party(profile_phone(doc.to))
	if not party and doc.direction == "Incoming" and frappe.db.get_single_value("RE Settings", "auto_create_lead"):
		party_type, party = "CRM Lead", _create_lead(doc)
	if party:
		doc.reference_doctype, doc.reference_docname = party_type, party


def _create_lead(doc):
	profile = frappe.db.get_value("WhatsApp Profile", doc.to, ["profile_name", "phone_number"], as_dict=True)
	name = (profile.profile_name or "").strip() or profile.phone_number
	first, _sep, last = name.partition(" ")
	lead = frappe.get_doc({
		"doctype": "CRM Lead", "first_name": first, "last_name": last, "mobile_no": "+" + profile.phone_number.lstrip("+"),
		"source": "WhatsApp" if frappe.db.exists("CRM Lead Source", "WhatsApp") else None,
		"lead_owner": _next_agent(), "status": "New",
	})
	lead.flags.ignore_permissions = True
	lead.insert()
	lead.add_comment("Info", _("Created from an incoming WhatsApp message"))
	return lead.name


def _next_agent():
	"""Default agent, else the sales user with the fewest open conversations."""
	agent = frappe.db.get_single_value("RE Settings", "default_agent")
	if agent:
		return agent
	users = frappe.get_all("Has Role", {"role": "Sales User", "parenttype": "User", "parent": ("not in", ("Administrator", "Guest"))}, pluck="parent")
	users = [u for u in set(users) if frappe.db.get_value("User", u, "enabled")]
	if not users:
		return None
	load = dict(frappe.db.sql("select agent, count(*) from `tabRE Conversation` where status = 'Open' group by agent"))
	return min(sorted(users), key=lambda u: load.get(u, 0))


def on_message(doc, method=None):
	"""after_insert: update the conversation, unread count, opt-out, and notify the agent."""
	if doc.get("reaction"):
		return
	conv = _conversation(doc)
	text = (doc.message or "").strip()
	preview = _preview(doc)
	conv.last_message, conv.last_message_at, conv.last_direction = preview[:240], doc.timestamp or now_datetime(), doc.direction
	if doc.direction == "Incoming":
		conv.unread_count = (conv.unread_count or 0) + 1
		conv.last_incoming_at = conv.last_message_at
		conv.status = "Open"
	conv.flags.ignore_permissions = True
	conv.save()
	if doc.direction == "Incoming":
		_handle_keywords(conv, text)
	frappe.publish_realtime("re_inbox", {"conversation": conv.name, "direction": doc.direction},
							doctype="RE Conversation", after_commit=True)
	if doc.direction == "Incoming" and conv.agent:
		_notify(conv, preview)


def _conversation(doc):
	if frappe.db.exists("RE Conversation", doc.to):
		conv = frappe.get_doc("RE Conversation", doc.to)
	else:
		profile = frappe.get_doc("WhatsApp Profile", doc.to)
		conv = frappe.get_doc({"doctype": "RE Conversation", "whatsapp_profile": doc.to, "phone": profile.phone_number,
							   "contact_name": profile.profile_name or profile.phone_number, "status": "Open"})
	if doc.reference_doctype in PARTY_AGENT_FIELD and doc.reference_docname:
		if conv.party_type != "Customer" or doc.reference_doctype == "Customer":
			conv.party_type, conv.party = doc.reference_doctype, doc.reference_docname
	elif not conv.party:
		conv.party_type, conv.party = find_party(conv.phone)
	if conv.party:
		conv.contact_name = party_name(conv.party_type, conv.party)
		conv.agent = conv.agent or party_agent(conv.party_type, conv.party)
	conv.agent = conv.agent or _next_agent() if doc.direction == "Incoming" else conv.agent
	return conv


def _preview(doc):
	if doc.is_template and doc.whatsapp_template:
		return "📄 " + (frappe.db.get_value("WhatsApp Template", doc.whatsapp_template, "template_label") or doc.whatsapp_template)
	if doc.get("re_latitude"):
		return "📍 " + (doc.get("re_location_name") or _("Location"))
	if doc.media_id or doc.attach:
		return "📎 " + (strip_html(doc.message or "") or (doc.mime_type or _("Attachment")))
	return strip_html(doc.message or "")


def _keywords(field):
	return {k.strip().upper() for k in (frappe.db.get_single_value("RE Settings", field) or "").splitlines() if k.strip()}


def _handle_keywords(conv, text):
	word = text.upper().strip(" .!")
	if word in _keywords("opt_out_keywords"):
		set_opt_out(conv, 1)
	elif word in _keywords("opt_in_keywords"):
		set_opt_out(conv, 0)


def set_opt_out(conv, value):
	conv.db_set("opted_out", value)
	if conv.party_type and conv.party and frappe.get_meta(conv.party_type).has_field("re_whatsapp_opt_out"):
		frappe.db.set_value(conv.party_type, conv.party, "re_whatsapp_opt_out", value)
	frappe.enqueue("realestate.whatsapp.channel.send_text", enqueue_after_commit=True, profile=conv.whatsapp_profile,
				   text=_("You have been unsubscribed from Zarmeen Gardens updates. Reply START to subscribe again.") if value
				   else _("You are subscribed to Zarmeen Gardens updates again. Reply STOP to unsubscribe."))


def is_opted_out(phone=None, party_type=None, party=None):
	if party_type and party and frappe.get_meta(party_type).has_field("re_whatsapp_opt_out"):
		if frappe.db.get_value(party_type, party, "re_whatsapp_opt_out"):
			return True
	key = phone_key(phone)
	if not key:
		return False
	return bool(frappe.db.sql("select 1 from `tabRE Conversation` where opted_out = 1 and RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = %s", key))


def _notify(conv, preview):
	frappe.get_doc({
		"doctype": "Notification Log", "for_user": conv.agent, "type": "Alert", "document_type": "RE Conversation",
		"document_name": conv.name, "subject": _("WhatsApp from {0}: {1}").format(conv.contact_name, preview[:80]),
	}).insert(ignore_permissions=True)


# ---------------------------------------------------------------- inbox API
@frappe.whitelist()
def get_conversations(view: str = "mine", search: str | None = None, limit: int = 100) -> list[dict]:
	filters = {}
	if view == "mine":
		filters["agent"] = frappe.session.user
	elif view == "unassigned":
		filters["agent"] = ("is", "not set")
	elif view == "unread":
		filters["unread_count"] = (">", 0)
	elif view == "resolved":
		filters["status"] = "Resolved"
	if view in ("mine", "unassigned", "all"):
		filters["status"] = "Open"
	or_filters = {"name": search, "contact_name": ("like", f"%{search}%"), "phone": ("like", f"%{search}%"), "party": ("like", f"%{search}%")} if search else None
	return frappe.get_list("RE Conversation", filters=filters, or_filters=or_filters, limit=int(limit), order_by="last_message_at desc",
						   fields=["name", "contact_name", "phone", "party_type", "party", "agent", "status", "unread_count",
								   "last_message", "last_message_at", "last_direction", "opted_out"])


@frappe.whitelist()
def get_counts() -> dict:
	user = frappe.session.user
	q = lambda f: frappe.db.count("RE Conversation", f)  # noqa: E731
	return {"mine": q({"agent": user, "status": "Open"}), "unassigned": q({"agent": ("is", "not set"), "status": "Open"}),
			"unread": q({"unread_count": (">", 0)}), "my_unread": q({"agent": user, "unread_count": (">", 0)}),
			"all": q({"status": "Open"})}


@frappe.whitelist()
def mark_read(conversation: str) -> None:
	frappe.get_doc("RE Conversation", conversation).check_permission("write")
	frappe.db.set_value("RE Conversation", conversation, "unread_count", 0)
	frappe.publish_realtime("re_inbox", {"conversation": conversation}, doctype="RE Conversation", after_commit=True)


@frappe.whitelist()
def assign(conversation: str, agent: str | None = None, status: str | None = None) -> None:
	conv = frappe.get_doc("RE Conversation", conversation)
	conv.check_permission("write")
	if agent is not None:
		conv.agent = agent or None
	if status:
		conv.status = status
	conv.save()
	if agent and agent != frappe.session.user:
		frappe.get_doc({"doctype": "Notification Log", "for_user": agent, "type": "Assignment", "document_type": "RE Conversation",
						"document_name": conv.name, "from_user": frappe.session.user,
						"subject": _("WhatsApp chat with {0} assigned to you").format(conv.contact_name)}).insert(ignore_permissions=True)
	frappe.publish_realtime("re_inbox", {"conversation": conversation}, doctype="RE Conversation", after_commit=True)


@frappe.whitelist()
def set_opted_out(conversation: str, opted_out: int) -> None:
	conv = frappe.get_doc("RE Conversation", conversation)
	conv.check_permission("write")
	conv.opted_out = int(opted_out)
	if conv.party_type and conv.party and frappe.get_meta(conv.party_type).has_field("re_whatsapp_opt_out"):
		frappe.db.set_value(conv.party_type, conv.party, "re_whatsapp_opt_out", int(opted_out))
	conv.save()


@frappe.whitelist(methods=["GET"])
def agents() -> list[dict]:
	"""Enabled sales staff a chat can be assigned to."""
	users = frappe.get_all("Has Role", {"role": ("in", ["Sales User", "Sales Agent", "Sales Manager", "Recovery Officer"]), "parenttype": "User"},
						   pluck="parent", distinct=True)
	return frappe.get_all("User", {"name": ("in", users or [""]), "enabled": 1, "user_type": "System User"}, ["name", "full_name"], order_by="full_name")
