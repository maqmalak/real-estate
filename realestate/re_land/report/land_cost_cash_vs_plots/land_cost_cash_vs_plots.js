frappe.query_reports["Land Cost Cash vs Plots"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "land_for", label: __("Land For"), fieldtype: "Data" }
	],
};
