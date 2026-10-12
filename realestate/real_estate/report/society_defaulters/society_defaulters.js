frappe.query_reports["Society Defaulters"] = {
	filters: [
		{ fieldname: "block", label: __("Block"), fieldtype: "Link", options: "RE Block" },
		{ fieldname: "min_months", label: __("Min. Months Unpaid"), fieldtype: "Int", default: 1 }
	],
};
