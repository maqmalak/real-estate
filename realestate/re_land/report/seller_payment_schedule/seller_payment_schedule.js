frappe.query_reports["Seller Payment Schedule"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "land_for", label: __("Land For"), fieldtype: "Data" },
		{ fieldname: "deal_status", label: __("Status"), fieldtype: "Select", options: "\nDraft\nPartially Signed\nExecuted\nIn Payment\nCompleted\nClosed\nDisputed" }
	],
};
