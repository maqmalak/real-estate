frappe.query_reports["Receivables Aging"] = {
	filters: [
		{ fieldname: "as_of", label: __("As Of"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "block", label: __("Block"), fieldtype: "Link", options: "RE Block" },
		{ fieldname: "overdue_only", label: __("Overdue Only"), fieldtype: "Check" },
	],
};
