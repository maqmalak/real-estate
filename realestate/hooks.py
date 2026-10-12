app_name = "realestate"
app_title = "Real Estate"
app_publisher = "MicroMax"
app_description = "Housing scheme management: site map, plots, bookings, installments, society bills, CRM with WhatsApp"
app_email = "maqmalak@gmail.com"
app_license = "mit"

required_apps = ["erpnext", "crm", "whatsapp"]

app_include_js = ["/assets/realestate/js/re_engage.js"]
app_include_css = ["/assets/realestate/css/realestate.css"]

doctype_js = {
	"Customer": "public/js/party_engage.js",
	"CRM Lead": "public/js/party_engage.js",
	"CRM Deal": "public/js/party_engage.js",
	"Task": "public/js/task.js",
}

after_install = "realestate.setup.after_install"
after_migrate = "realestate.setup.after_migrate"

# mock-mode Graph API patch (per site, checked on each call)
before_request = ["realestate.whatsapp.mock.install"]
before_job = ["realestate.whatsapp.mock.install"]

extend_doctype_class = {"WhatsApp Message": "realestate.whatsapp.location.LocationMessageMixin"}

doc_events = {
	"WhatsApp Message": {
		"validate": "realestate.whatsapp.inbox.link_party",
		"after_insert": "realestate.whatsapp.inbox.on_message",
	},
	"CRM Call Log": {
		"after_insert": "realestate.whatsapp.calls.on_call_log",
		"on_update": "realestate.whatsapp.calls.on_call_log_update",
	},
	"CRM Deal": {
		"on_update": "realestate.crm.on_deal_update",
	},
	"Task": {
		"validate": "realestate.maintenance.sync_priority",
		"on_update": "realestate.maintenance.on_task_update",
	},
	"Customer": {"validate": "realestate.identity.validate_customer"},
	"CRM Lead": {"validate": "realestate.identity.validate_lead"},
	**{dt: {"on_trash": "realestate.audit.keep_financial_records"} for dt in (
		"Sales Invoice", "Payment Entry", "Journal Entry", "Purchase Invoice", "Purchase Receipt", "Purchase Order", "Stock Entry",
		"Dunning", "Asset", "RE Booking", "RE Payment", "RE Plot Transfer", "RE Booking Cancellation", "RE Plot Merge",
		"RE Surcharge Waiver", "RE Re-allotment")},
	# keeps the audit guard above; cancelling a commission's Payment Entry makes the commission payable again
	"Payment Entry": {"on_trash": "realestate.audit.keep_financial_records", "on_cancel": "realestate.commissions.on_payment_entry_cancel"},
}

scheduler_events = {
	"cron": {
		"* * * * *": [
			"realestate.whatsapp.mock.progress_statuses",
			"realestate.whatsapp.channel.sms_fallback_for_failed",
		],
	},
	"daily": [
		"realestate.tasks.daily",
		"realestate.tasks.phase_b_daily",
		"realestate.maintenance.generate_planned_tasks",
		"realestate.maintenance.mark_overdue",
	],
}




permission_query_conditions = {
	"RE Booking": "realestate.permissions.booking_query",
	"RE Payment": "realestate.permissions.payment_query",
	"RE Site Visit": "realestate.permissions.agent_query",
	"RE Conversation": "realestate.permissions.agent_query",
	"RE Commission": "realestate.permissions.agent_query",
	"RE Plot Transfer": "realestate.permissions.owner_query",
	"RE Booking Cancellation": "realestate.permissions.owner_query",
	"Customer": "realestate.permissions.party_query",
	"RE Society Bill": "realestate.permissions.society_bill_query",
	"CRM Lead": "realestate.permissions.party_query",
	"CRM Deal": "realestate.permissions.party_query",
}
has_permission = {
	"RE Booking": "realestate.permissions.booking_has_permission",
	"Customer": "realestate.permissions.party_has_permission",
	"CRM Lead": "realestate.permissions.party_has_permission",
	"CRM Deal": "realestate.permissions.party_has_permission",
}

jinja = {
	"methods": [
		"realestate.documents.qr_svg",
		"realestate.documents.plot_svg",
		"realestate.documents.verify_url",
		"realestate.documents.society_dues",
	],
}

export_python_type_annotations = True

# React "Connections" tab: add schema-discovered links (RE DocTypes have no desk dashboard definitions) — this site only
override_whitelisted_methods = {"mm_core.connections.get_connections": "realestate.connections.get_connections"}
