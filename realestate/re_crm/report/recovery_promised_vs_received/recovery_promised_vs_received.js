frappe.query_reports["Recovery Promised vs Received"] = {
	filters: [
		{"fieldname": "from_date", "label": __("From Date"), "fieldtype": "Date", "default": frappe.datetime.add_months(frappe.datetime.get_today(), -6)},
		{"fieldname": "to_date", "label": __("To Date"), "fieldtype": "Date", "default": frappe.datetime.get_today()},
		{"fieldname": "agent", "label": __("Agent"), "fieldtype": "Link", "options": "User"},
	],
};
