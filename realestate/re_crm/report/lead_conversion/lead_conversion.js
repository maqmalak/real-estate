frappe.query_reports["Lead Conversion"] = {
	filters: [
		{"fieldname": "from_date", "label": __("From Date"), "fieldtype": "Date", "default": frappe.datetime.add_months(frappe.datetime.get_today(), -6)},
		{"fieldname": "to_date", "label": __("To Date"), "fieldtype": "Date", "default": frappe.datetime.get_today()},
		{"fieldname": "group_by", "label": __("Group By"), "fieldtype": "Select", "options": "Agent\nSource", "default": "Agent"},
	],
};
