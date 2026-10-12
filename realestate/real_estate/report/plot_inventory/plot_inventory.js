frappe.query_reports["Plot Inventory"] = {
	filters: [
		{"fieldname": "block", "label": __("Block"), "fieldtype": "Link", "options": "RE Block"},
		{"fieldname": "group_by", "label": __("Group By"), "fieldtype": "Select", "options": "Block\nPlot Size", "default": "Block"},
	],
};
