frappe.query_reports["Commission Report"] = {
	filters: [
		{ fieldname: "beneficiary_type", label: __("Beneficiary Type"), fieldtype: "Select", options: "\nAgent\nDealer" },
		{ fieldname: "status", label: __("Status"), fieldtype: "Select", options: "\nAccrued\nPayable\nPaid\nCancelled" },
	],
};
