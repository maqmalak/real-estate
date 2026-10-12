frappe.query_reports["Collection Summary"] = {
	filters: [
		{"fieldname": "from_date", "label": __("From Date"), "fieldtype": "Date", "default": frappe.datetime.add_months(frappe.datetime.get_today(), -6)},
		{"fieldname": "to_date", "label": __("To Date"), "fieldtype": "Date", "default": frappe.datetime.get_today()},
		{"fieldname": "payment_against", "label": __("Against"), "fieldtype": "Select", "options": "\nBooking\nSociety Bill"},
	],
};
