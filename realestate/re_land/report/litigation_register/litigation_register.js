frappe.query_reports["Litigation Register"] = {
	filters: [
		{ fieldname: "open_only", label: __("Open Cases Only"), fieldtype: "Check" }
	],
};
