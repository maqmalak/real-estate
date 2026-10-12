"""Site map data and the unified customer timeline."""

import json

import frappe
from frappe import _
from frappe.utils import flt, strip_html

from realestate.whatsapp.inbox import phone_key


@frappe.whitelist()
def get_map_data(project: str | None = None) -> dict:
	project = project or frappe.db.get_single_value("RE Settings", "default_project") or frappe.db.get_value("RE Project", {}, "name")
	if not project:
		return {}
	frappe.get_doc("RE Project", project).check_permission("read")
	p = frappe.db.get_value("RE Project", project, ["name", "centre_lat", "centre_lng", "default_zoom", "boundary_geojson",
													 "total_area_kanal", "boundary_area_kanal"], as_dict=True)
	# merged-away plots (merged_into set) are replaced by the merged plot — leave them off the map
	plots = frappe.get_all("RE Plot", {"project": project, "merged_into": ("is", "not set")}, ["name", "block", "plot_size", "status", "payment_status", "customer_name",
															 "list_price", "geojson", "street", "is_corner", "is_park_facing",
															 "is_boulevard_facing", "booking"], limit=0)
	overdue = {b.name: b for b in frappe.get_all("RE Booking", {"docstatus": 1, "project": project},
												 ["name", "overdue_amount", "outstanding_amount", "next_due_date"], limit=0)}
	for pl in plots:
		pl.geojson = _geo(pl.geojson)
		b = overdue.get(pl.booking)
		if b:
			pl.overdue_amount, pl.outstanding_amount, pl.next_due_date = b.overdue_amount, b.outstanding_amount, b.next_due_date
	return {
		"project": {**p, "boundary_geojson": _geo(p.boundary_geojson)},
		"blocks": [{**b, "geojson": _geo(b.geojson)} for b in frappe.get_all(
			"RE Block", {"project": project}, ["name", "block_code", "block_type", "color", "geojson", "planned_plots", "area_kanal"])],
		"plots": plots,
		"features": [{**f, "geojson": _geo(f.geojson)} for f in frappe.get_all(
			"RE Map Feature", {"project": project}, ["name", "feature_name", "feature_type", "category", "color", "geojson", "width_ft"], limit=0)],
	}


def _geo(value):
	try:
		return json.loads(value) if value else None
	except ValueError:
		return None


# ---------------------------------------------------------------- unified timeline
def _related(party_type, party):
	"""All CRM / ERPNext records that are the same person: lead <-> deal <-> customer."""
	refs = {(party_type, party)}
	if party_type == "Customer":
		deal = frappe.db.get_value("Customer", party, "crm_deal") if frappe.get_meta("Customer").has_field("crm_deal") else None
		if deal:
			refs.add(("CRM Deal", deal))
	for dt, dn in list(refs):
		if dt == "CRM Deal":
			lead = frappe.db.get_value("CRM Deal", dn, "lead")
			if lead:
				refs.add(("CRM Lead", lead))
			customer = frappe.db.get_value("CRM Deal", dn, "erpnext_customer") if frappe.get_meta("CRM Deal").has_field("erpnext_customer") else None
			if customer:
				refs.add(("Customer", customer))
		if dt == "CRM Lead":
			for deal in frappe.get_all("CRM Deal", {"lead": dn}, pluck="name"):
				refs.add(("CRM Deal", deal))
				customer = frappe.db.get_value("CRM Deal", deal, "erpnext_customer") if frappe.get_meta("CRM Deal").has_field("erpnext_customer") else None
				if customer:
					refs.add(("Customer", customer))
	return refs


@frappe.whitelist()
def get_timeline(party_type: str, party: str, limit: int = 300) -> list[dict]:
	"""Messages, calls, visits, bookings, payments, bills, documents, reminders, tasks and notes, newest first."""
	frappe.get_doc(party_type, party).check_permission("read")
	refs = _related(party_type, party)
	names = [dn for _dt, dn in refs]
	customers = [dn for dt, dn in refs if dt == "Customer"]
	phones = {phone_key(frappe.db.get_value(dt, dn, "mobile_no")) for dt, dn in refs} - {"", None}
	items = []

	def add(kind, at, title, body="", doctype=None, name=None, status=None, icon=None, direction=None):
		items.append({"kind": kind, "at": at, "title": title, "body": body, "doctype": doctype, "name": name,
					  "status": status, "icon": icon, "direction": direction})

	# WhatsApp — every message with these numbers, whatever document it was sent from
	profiles = [p for p in frappe.get_all("WhatsApp Profile", ["name", "phone_number"]) if phone_key(p.phone_number) in phones]
	for m in frappe.get_all("WhatsApp Message", {"to": ("in", [p.name for p in profiles] or [""]), "reaction": ("is", "not set")},
							["name", "direction", "message", "status", "creation", "timestamp", "is_template", "whatsapp_template", "re_location_name"],
							order_by="creation desc", limit=200):
		label = frappe.db.get_value("WhatsApp Template", m.whatsapp_template, "template_label") if m.is_template else None
		add("whatsapp", m.timestamp or m.creation, (_("WhatsApp received") if m.direction == "Incoming" else _("WhatsApp sent")) + (f" · {label}" if label else ""),
			"📍 " + m.re_location_name if m.re_location_name else strip_html(m.message or "")[:300] if not label else "",
			"WhatsApp Message", m.name, m.status, "message-circle", m.direction)
	# calls
	for c in frappe.get_all("CRM Call Log", {"reference_docname": ("in", names)}, ["name", "type", "status", "duration", "start_time", "creation",
																					 "re_outcome", "re_notes", "re_promised_amount", "re_promised_date", "caller", "receiver"]):
		agent = frappe.utils.get_fullname(c.caller or c.receiver) if (c.caller or c.receiver) else ""
		body = " · ".join(x for x in (c.re_outcome, f"{int(c.duration or 0) // 60}m {int(c.duration or 0) % 60}s" if c.duration else "", agent,
									  _("promised {0} by {1}").format(f"{flt(c.re_promised_amount):,.0f}", c.re_promised_date) if c.re_promised_amount else "",
									  c.re_notes or "") if x)
		add("call", c.start_time or c.creation, _("{0} call").format(_(c.type)), body, "CRM Call Log", c.name, c.status, "phone", c.type)
	# site visits
	for v in frappe.get_all("RE Site Visit", {"party": ("in", names)}, ["name", "visit_on", "status", "outcome", "interested_plot", "notes"]):
		add("visit", v.visit_on, _("Site visit {0}").format(_(v.status).lower()), " · ".join(x for x in (v.interested_plot, v.outcome, v.notes) if x),
			"RE Site Visit", v.name, v.status, "map-pin")
	if customers:
		for b in frappe.get_all("RE Booking", {"customer": ("in", customers), "docstatus": ("<", 2)}, ["name", "booking_date", "creation", "plot", "net_price", "status"]):
			add("booking", b.creation, _("Booked plot {0}").format(b.plot), _("Net price {0}").format(f"{flt(b.net_price):,.0f}"), "RE Booking", b.name, b.status, "home")
		for p in frappe.get_all("RE Payment", {"customer": ("in", customers), "docstatus": 1}, ["name", "posting_date", "creation", "amount", "mode_of_payment", "plot", "payment_against"]):
			add("payment", p.creation, _("Payment received {0}").format(f"{flt(p.amount):,.0f}"), f"{p.payment_against} · {p.plot} · {p.mode_of_payment}", "RE Payment", p.name, None, "wallet")
		for s in frappe.get_all("RE Society Bill", {"customer": ("in", customers)}, ["name", "creation", "bill_month_label", "total_amount", "status", "plot"]):
			add("bill", s.creation, _("Society bill {0}").format(s.bill_month_label), f"{s.plot} · {flt(s.total_amount):,.0f}", "RE Society Bill", s.name, s.status, "file-text")
	# maintenance complaints raised by the customer or on their plots
	if customers:
		plots = frappe.get_all("RE Plot", {"customer": ("in", customers)}, pluck="name")
		for t in frappe.get_all("Task", {"re_project": ("is", "set")}, ["name", "subject", "status", "type", "creation", "re_plot", "re_customer", "completed_on"],
								or_filters={"re_customer": ("in", customers), "re_plot": ("in", plots or [""])}, limit=100):
			add("maintenance", t.creation, _("Maintenance: {0}").format(t.subject), " · ".join(x for x in (t.type, t.re_plot) if x),
				"Task", t.name, t.status, "tool")
	# documents attached to any of the related records
	ref_docs = [(dt, dn) for dt, dn in refs]
	if customers:
		ref_docs += [("RE Booking", n) for n in frappe.get_all("RE Booking", {"customer": ("in", customers)}, pluck="name")]
		ref_docs += [("RE Payment", n) for n in frappe.get_all("RE Payment", {"customer": ("in", customers)}, pluck="name")]
	for dt in {d for d, _n in ref_docs}:
		for f in frappe.get_all("File", {"attached_to_doctype": dt, "attached_to_name": ("in", [n for d, n in ref_docs if d == dt])},
								["name", "file_name", "file_url", "creation", "attached_to_name"]):
			add("document", f.creation, _("Document: {0}").format(f.file_name), f.attached_to_name, "File", f.name, None, "paperclip")
	# reminders
	for r in frappe.get_all("RE Reminder Log", {"party": ("in", names)}, ["name", "creation", "reminder_type", "channel", "status", "reference_name"]):
		add("reminder", r.creation, _("{0} via {1}").format(_(r.reminder_type), r.channel), r.reference_name, "RE Reminder Log", r.name, r.status, "bell")
	# follow-up tasks and notes
	for t in frappe.get_all("CRM Task", {"reference_docname": ("in", names)}, ["name", "title", "due_date", "status", "assigned_to", "creation"]):
		add("task", t.due_date or t.creation, _("Follow-up: {0}").format(t.title),
			" · ".join(x for x in (frappe.utils.get_fullname(t.assigned_to) if t.assigned_to else "", str(t.due_date or "")) if x),
			"CRM Task", t.name, t.status, "check-square")
	for n in frappe.get_all("FCRM Note", {"reference_docname": ("in", names)}, ["name", "title", "content", "creation"]):
		add("note", n.creation, _("Note: {0}").format(n.title), strip_html(n.content or "")[:300], "FCRM Note", n.name, None, "edit")
	items.sort(key=lambda i: str(i["at"] or ""), reverse=True)
	return items[: int(limit)]
