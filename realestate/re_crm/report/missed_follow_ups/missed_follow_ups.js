frappe.query_reports["Missed Follow-ups"] = {
	filters: [
		{"fieldname": "agent", "label": __("Agent"), "fieldtype": "Link", "options": "User"},
	],
};
