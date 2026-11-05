frappe.query_reports["Seller Payments Due"] = {
	filters: [
		{ fieldname: "window", label: __("Window"), fieldtype: "Select", options: "Week\nMonth\nQuarter", default: "Month" }
	],
};
