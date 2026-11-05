frappe.query_reports["Land Purchase Status"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "land_for", label: __("Land For"), fieldtype: "Data" },
		{ fieldname: "owners_type", label: __("Land Owners"), fieldtype: "Select", options: "\nSINGLE\nMULTI" },
		{ fieldname: "deal_status", label: __("Status"), fieldtype: "Select", options: "\nDraft\nPartially Signed\nExecuted\nIn Payment\nCompleted\nClosed\nDisputed" },
		{ fieldname: "balance_only", label: __("Owners With Balance Only"), fieldtype: "Check" },
		{ fieldname: "matured_unpaid", label: __("Matured But Unpaid"), fieldtype: "Check" }
	],
};
