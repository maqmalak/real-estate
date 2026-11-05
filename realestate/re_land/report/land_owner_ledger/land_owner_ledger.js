frappe.query_reports["Land Owner Ledger"] = {
	filters: [
		{ fieldname: "land_owner", label: __("Land Owner"), fieldtype: "Link", options: "RE Land Owner" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() }
	],
};
