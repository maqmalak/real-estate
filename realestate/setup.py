"""Install / migrate: CRM pipeline, custom fields, WhatsApp templates, receipt print format and the desk.

Safe to re-run (bench migrate runs it). The company and demo data come from realestate.demo.seed.
"""

import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ENGAGE = [
	{"fieldname": "re_engagement_tab", "fieldtype": "Tab Break", "label": "WhatsApp & Timeline", "insert_after": None},
	{"fieldname": "re_engagement_html", "fieldtype": "HTML", "label": "", "insert_after": "re_engagement_tab"},
]


def _interest(insert_after, with_plot=False):
	fields = [
		{"fieldname": "re_section", "fieldtype": "Section Break", "label": "Real Estate Interest", "insert_after": insert_after, "collapsible": 0},
		{"fieldname": "re_interested_block", "fieldtype": "Link", "options": "RE Block", "label": "Interested Block", "insert_after": "re_section"},
		{"fieldname": "re_plot_size", "fieldtype": "Link", "options": "RE Plot Size", "label": "Plot Size", "insert_after": "re_interested_block"},
	]
	last = "re_plot_size"
	if with_plot:
		fields.append({"fieldname": "re_interested_plot", "fieldtype": "Link", "options": "RE Plot", "label": "Interested Plot", "insert_after": last})
		last = "re_interested_plot"
	fields += [
		{"fieldname": "re_cb", "fieldtype": "Column Break", "insert_after": last},
		{"fieldname": "re_budget", "fieldtype": "Currency", "options": "PKR", "label": "Budget", "insert_after": "re_cb"},
		{"fieldname": "re_next_follow_up", "fieldtype": "Datetime", "label": "Next Follow-up", "insert_after": "re_budget"},
		{"fieldname": "re_whatsapp_opt_out", "fieldtype": "Check", "label": "Opted Out of WhatsApp Broadcasts", "insert_after": "re_next_follow_up"},
	]
	return fields


DEMO_FLAG = {"fieldname": "re_demo", "fieldtype": "Check", "label": "Demo Record", "hidden": 1, "read_only": 1, "no_copy": 0}


def custom_fields():
	lead_engage = [dict(f, insert_after=f["insert_after"] or "lost_notes") for f in ENGAGE]
	deal_engage = [dict(f, insert_after=f["insert_after"] or "lost_notes") for f in ENGAGE]
	cust_engage = [dict(f, insert_after=f["insert_after"] or "portal_users") for f in ENGAGE]
	return {
		"CRM Lead": _interest("lead_owner") + lead_engage + [dict(DEMO_FLAG, insert_after="re_whatsapp_opt_out")],
		"CRM Deal": _interest("deal_owner", with_plot=True) + deal_engage + [dict(DEMO_FLAG, insert_after="re_whatsapp_opt_out")],
		"Customer": [dict(DEMO_FLAG, insert_after="mobile_no"),
			{"fieldname": "re_whatsapp_opt_out", "fieldtype": "Check", "label": "Opted Out of WhatsApp Broadcasts", "insert_after": "mobile_no"},
		] + cust_engage,
		"CRM Call Log": [
			{"fieldname": "re_section", "fieldtype": "Section Break", "label": "Outcome", "insert_after": "telephony_medium"},
			{"fieldname": "re_channel", "fieldtype": "Select", "label": "Channel", "insert_after": "re_section",
			 "options": "\nWhatsApp Calling API\nWhatsApp Click-to-Call\nPhone"},
			{"fieldname": "re_outcome", "fieldtype": "Select", "label": "Outcome", "insert_after": "re_channel", "in_list_view": 1, "in_standard_filter": 1,
			 "options": "\nAnswered\nNo Answer\nBusy\nPromised to Pay\nNot Interested\nCall Back Later\nMissed"},
			{"fieldname": "re_notes", "fieldtype": "Small Text", "label": "Call Notes", "insert_after": "re_outcome"},
			{"fieldname": "re_cb", "fieldtype": "Column Break", "insert_after": "re_notes"},
			{"fieldname": "re_promised_amount", "fieldtype": "Currency", "options": "PKR", "label": "Promised Amount", "insert_after": "re_cb",
			 "depends_on": "eval:doc.re_outcome=='Promised to Pay'"},
			{"fieldname": "re_promised_date", "fieldtype": "Date", "label": "Promised By", "insert_after": "re_promised_amount",
			 "depends_on": "eval:doc.re_outcome=='Promised to Pay'"},
			{"fieldname": "re_next_follow_up", "fieldtype": "Datetime", "label": "Next Follow-up", "insert_after": "re_promised_date"},
			{"fieldname": "re_wa_call_id", "fieldtype": "Data", "label": "WhatsApp Call ID", "insert_after": "re_next_follow_up", "read_only": 1, "search_index": 1},
			{"fieldname": "re_follow_up_task", "fieldtype": "Link", "options": "CRM Task", "label": "Missed-call Task", "insert_after": "re_wa_call_id", "read_only": 1},
		],
		"WhatsApp Message": [
			{"fieldname": "re_location_section", "fieldtype": "Section Break", "label": "Location", "insert_after": "mime_type", "collapsible": 1},
			{"fieldname": "re_latitude", "fieldtype": "Float", "label": "Latitude", "precision": "7", "insert_after": "re_location_section"},
			{"fieldname": "re_longitude", "fieldtype": "Float", "label": "Longitude", "precision": "7", "insert_after": "re_latitude"},
			{"fieldname": "re_location_name", "fieldtype": "Data", "label": "Location Name", "insert_after": "re_longitude"},
			{"fieldname": "re_location_address", "fieldtype": "Data", "label": "Location Address", "insert_after": "re_location_name"},
		],
	}


DEAL_STATUSES = [
	# name, type, position, colour, probability
	("Opportunity", "Open", 1, "blue", 10),
	("Site Visit", "Ongoing", 2, "orange", 30),
	("Negotiation", "Ongoing", 3, "amber", 60),
	("Booking", "Won", 4, "green", 100),
	("Lost", "Lost", 5, "red", 0),
]
LEAD_SOURCES = ["Walk In", "Dealer", "Facebook", "Website", "Referral", "WhatsApp"]
LOST_REASONS = ["Price too high", "Bought in another scheme", "Location too far", "Not responding", "Financing not arranged"]

TEMPLATES = [
	# label, reference doctype, category, header type, header text, body, {variable: field}
	("RE Booking Confirmation", "RE Booking", "Utility", "Text", "Booking Confirmed",
	 "Dear {{customer_name}}, your booking {{booking_no}} for plot {{plot}} ({{plot_size}}, {{block}}) at Zarmeen Gardens is confirmed. "
	 "Net price: PKR {{net_price}}. Your next installment is due on {{next_due_date}}. Thank you for choosing us!",
	 {"customer_name": "customer_name", "booking_no": "name", "plot": "plot", "plot_size": "plot_size", "block": "block",
	  "net_price": "fmt_net_price", "next_due_date": "next_due_date"}),
	("RE Payment Receipt", "RE Payment", "Utility", "Document", None,
	 "Dear {{customer_name}}, we have received PKR {{amount}} for plot {{plot}} on {{payment_date}} (receipt {{receipt_no}}). "
	 "Your receipt is attached. Thank you!",
	 {"customer_name": "customer_name", "amount": "fmt_amount", "plot": "plot", "payment_date": "posting_date", "receipt_no": "name"}),
	("RE Installment Reminder", "RE Booking", "Utility", None, None,
	 "Dear {{customer_name}}, a friendly reminder that your installment of PKR {{amount}} for plot {{plot}} is due on {{due_date}}. "
	 "Please ignore this message if you have already paid.",
	 {"customer_name": "customer_name", "amount": "fmt_next_due_amount", "plot": "plot", "due_date": "next_due_date"}),
	("RE Overdue Notice", "RE Booking", "Utility", None, None,
	 "Dear {{customer_name}}, PKR {{overdue_amount}} for plot {{plot}} is overdue since {{overdue_since}}. "
	 "Please clear your dues at the earliest. Call us if you need any help.",
	 {"customer_name": "customer_name", "overdue_amount": "fmt_overdue", "plot": "plot", "overdue_since": "overdue_since"}),
	("RE Society Bill", "RE Society Bill", "Utility", None, None,
	 "Dear {{customer_name}}, your society bill for {{month}} for plot {{plot}} is PKR {{amount}}, due by {{due_date}}. Thank you.",
	 {"customer_name": "customer_name", "month": "bill_month_label", "plot": "plot", "amount": "fmt_total", "due_date": "due_date"}),
	("RE Follow Up", "CRM Lead", "Marketing", None, None,
	 "Hi {{first_name}}, thank you for your interest in Zarmeen Gardens. Plots are available in 5 Marla, 10 Marla, 1 Kanal and "
	 "commercial sizes on easy installments. Shall we arrange a call or a site visit?",
	 {"first_name": "first_name"}),
	("RE Site Visit Invitation", "RE Site Visit", "Utility", None, None,
	 "Dear {{visitor_name}}, you are invited to visit Zarmeen Gardens on {{visit_time}}. Our agent will meet you at the main gate. "
	 "Reply YES to confirm.",
	 {"visitor_name": "party_name", "visit_time": "visit_label"}),
]

QUICK_REPLIES = [
	("Greeting", "/hi", "Assalam o Alaikum! Thank you for contacting Zarmeen Gardens. How can I help you today?"),
	("Prices", "/price", "Current prices: 5 Marla PKR 65 lac, 10 Marla PKR 1.2 crore, 1 Kanal PKR 2.2 crore, commercial from PKR 80 lac. "
							 "Easy 2-3 year installment plans are available."),
	("Site visit", "/visit", "We would be happy to show you the site. Which day and time suits you? Our office is open 10 am - 6 pm, Monday to Saturday."),
	("Bank details", "/bank", "Please deposit to: Zarmeen Developers (Pvt) Ltd, Meezan Bank, A/C 0000-0000000000 (sample). Share the slip here once paid."),
	("Payment received", "/thanks", "Thank you! We have received your payment. Your receipt will follow shortly."),
	("Location", "/location", "Zarmeen Gardens is on the Lahore outskirts. I will send you the location pin of the plot now."),
]


def after_install():
	setup()


def after_migrate():
	setup()


def setup():
	from realestate import erp, maintenance
	from realestate.whatsapp.mock import install

	install()  # template pushes go to the mock when mock mode is on (no web request patches it during install)
	create_custom_fields({**custom_fields(), **maintenance.custom_fields()}, ignore_validate=True)
	create_custom_fields(erp.custom_fields(), ignore_validate=True)
	from realestate import portal

	create_custom_fields(portal.custom_fields(), ignore_validate=True)
	from realestate import identity

	create_custom_fields(identity.custom_fields(), ignore_validate=True)
	maintenance.setup()
	if not frappe.db.exists("File", "Home"):  # uploads fail without Frappe's root folders
		from frappe.core.doctype.file.utils import make_home_folder

		make_home_folder()
	from realestate import audit, rbac

	audit.setup()
	rbac.setup()  # the spec's roles as Role Profiles
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if company:
		erp.setup_masters(company)
		erp.setup_phase_b(company)
	from realestate import roles

	roles.setup()
	_crm_pipeline()
	_side_panel()
	_settings()
	_templates()
	_quick_replies()
	_print_format()
	from realestate import documents

	documents.setup()
	from realestate.desk import setup_desk

	setup_desk()
	frappe.db.commit()


def _crm_pipeline():
	for name, kind, pos, colour, prob in DEAL_STATUSES:
		doc = frappe.get_doc("CRM Deal Status", name) if frappe.db.exists("CRM Deal Status", name) else frappe.new_doc("CRM Deal Status")
		doc.update({"deal_status": name, "type": kind, "position": pos, "color": colour, "probability": prob})
		doc.save(ignore_permissions=True)
	keep = {s[0] for s in DEAL_STATUSES}
	for name in frappe.get_all("CRM Deal Status", pluck="name"):
		if name not in keep and not frappe.db.exists("CRM Deal", {"status": name}):
			frappe.delete_doc("CRM Deal Status", name, ignore_permissions=True, force=True)
	for reason in LOST_REASONS:
		if not frappe.db.exists("CRM Lost Reason", reason):
			frappe.get_doc({"doctype": "CRM Lost Reason", "lost_reason": reason}).insert(ignore_permissions=True)
	for source in LEAD_SOURCES:
		if not frappe.db.exists("CRM Lead Source", source):
			frappe.get_doc({"doctype": "CRM Lead Source", "source_name": source}).insert(ignore_permissions=True)
	link_erpnext()


def link_erpnext():
	"""Booking (won deal) creates the ERPNext Customer through Frappe CRM's own integration."""
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		return
	crm_settings = frappe.get_single("CRM Settings")
	if not crm_settings.get("enable_frappe_crm_data_synchronization"):
		crm_settings.enable_frappe_crm_data_synchronization = 1
		crm_settings.save(ignore_permissions=True)
	s = frappe.get_single("ERPNext CRM Settings")
	if not (s.enabled and s.deal_status == "Booking" and s.create_customer_on_status_change and s.erpnext_company == company):
		s.update({"enabled": 1, "is_erpnext_in_different_site": 0, "erpnext_company": company,
				  "create_customer_on_status_change": 1, "deal_status": "Booking"})
		s.save(ignore_permissions=True)


def _side_panel():
	section = {"label": "Real Estate", "name": "re_section", "opened": True,
			   "columns": [{"name": "re_column", "fields": ["re_interested_block", "re_plot_size", "re_budget", "re_next_follow_up", "re_whatsapp_opt_out"]}]}
	for dt in ("CRM Lead", "CRM Deal"):
		name = frappe.db.get_value("CRM Fields Layout", {"dt": dt, "type": "Side Panel"})
		if not name:
			continue
		layout = json.loads(frappe.db.get_value("CRM Fields Layout", name, "layout") or "[]")
		if any(s.get("name") == "re_section" for s in layout):
			continue
		sec = json.loads(json.dumps(section))
		if dt == "CRM Deal":
			sec["columns"][0]["fields"].insert(2, "re_interested_plot")
		layout.insert(1, sec)
		frappe.db.set_value("CRM Fields Layout", name, "layout", json.dumps(layout))


PHASE_B_DEFAULTS = {"max_discount_percent": 5, "surcharge_enabled": 1, "surcharge_grace_days": 15, "surcharge_percent": 2, "surcharge_cap_percent": 10,
					"surcharge_minimum": 500, "transfer_fee": 50000, "cancellation_deduction_percent": 10, "agent_commission_percent": 1,
					"dealer_commission_percent": 2, "commission_payable_after_percent": 25}


# settings added later: filled once if empty (single DocType defaults are only stored when the form is saved)
LATER_DEFAULTS = {"due_window_days": 7, "reallotment_fee": 25000, "fallback_channels": "SMS, Email"}


def _settings():
	for field, value in LATER_DEFAULTS.items():
		if not frappe.db.get_single_value("RE Settings", field) and not frappe.db.get_default(f"re_default_{field}"):
			frappe.db.set_single_value("RE Settings", field, value)
			frappe.db.set_default(f"re_default_{field}", 1)
	if not frappe.db.get_default("re_phase_b_defaults"):  # single DocType defaults are only stored when someone saves the form
		for field, value in PHASE_B_DEFAULTS.items():
			if not frappe.db.get_single_value("RE Settings", field):
				frappe.db.set_single_value("RE Settings", field, value)
		frappe.db.set_default("re_phase_b_defaults", 1)
	s = frappe.get_single("RE Settings")
	if s.webhook_url:  # configured before: keep the user's values
		from realestate.re_crm.doctype.re_settings.re_settings import sync_whatsapp_account

		sync_whatsapp_account(s)
		return
	defaults = {"mock_mode": 1, "auto_create_lead": 1, "broadcast_rate_per_minute": 60, "missed_call_follow_up_hours": 2,
				"opt_out_keywords": "STOP\nUNSUBSCRIBE\nBAND KARO", "opt_in_keywords": "START\nSUBSCRIBE",
				"installment_reminder_days": 3, "overdue_notice_every_days": 7, "send_booking_confirmation": 1,
				"bill_day_of_month": 1, "bill_due_days": 15, "sms_fallback": 1}
	s.update(defaults)
	s.company = frappe.db.get_single_value("Global Defaults", "default_company")
	s.save(ignore_permissions=True)


def _templates():
	account = frappe.db.get_single_value("WhatsApp Settings", "default_account")
	if not account:
		return
	for label, ref, category, header_type, header_text, body, variables in TEMPLATES:
		if frappe.db.exists("WhatsApp Template", {"template_label": label}):
			continue
		doc = frappe.get_doc({
			"doctype": "WhatsApp Template", "template_label": label, "template_type": category, "language": "en",
			"reference_doctype": ref, "whatsapp_account": account, "message": body, "variable_format": "Named",
			"header_type": header_type or "", "header_text": header_text or "",
			"footer": "Zarmeen Gardens Housing Scheme",
			"template_variables": [{"variable_name": k, "variable_field": v, "variable_example": k.replace("_", " ").title()}
								   for k, v in variables.items()],
		})
		try:
			doc.insert(ignore_permissions=True)
		except Exception:
			frappe.log_error(title=f"WhatsApp template {label}")


def _quick_replies():
	for title, shortcut, message in QUICK_REPLIES:
		if not frappe.db.exists("RE Quick Reply", title):
			frappe.get_doc({"doctype": "RE Quick Reply", "title": title, "shortcut": shortcut, "message": message}).insert(ignore_permissions=True)


def _print_format():
	html = frappe.read_file(frappe.get_app_path("realestate", "templates", "payment_receipt.html"))
	name = "RE Payment Receipt"
	doc = frappe.get_doc("Print Format", name) if frappe.db.exists("Print Format", name) else frappe.new_doc("Print Format")
	doc.update({"name": name, "doc_type": "RE Payment", "module": "Real Estate", "print_format_type": "Jinja", "custom_format": 1,
				"standard": "No", "html": html, "disabled": 0})
	doc.flags.ignore_permissions = True
	doc.save()
	if not frappe.db.get_value("Property Setter", {"doc_type": "RE Payment", "property": "default_print_format"}):
		frappe.make_property_setter({"doctype": "RE Payment", "doctype_or_field": "DocType", "property": "default_print_format",
									 "value": name, "property_type": "Data"})
