frappe.query_reports["Society Bill Status"] = {
	filters: [
		{"fieldname": "block", "label": __("Block"), "fieldtype": "Link", "options": "RE Block"},
		{"fieldname": "billing_month", "label": __("Month"), "fieldtype": "Date"},
	],
};
