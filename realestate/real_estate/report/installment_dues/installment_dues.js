frappe.query_reports["Installment Dues"] = {
	filters: [
		{"fieldname": "block", "label": __("Block"), "fieldtype": "Link", "options": "RE Block"},
		{"fieldname": "status", "label": __("Status"), "fieldtype": "Select", "options": "\nDue\nOverdue\nPaid"},
		{"fieldname": "agent", "label": __("Agent"), "fieldtype": "Link", "options": "User"},
	],
};
