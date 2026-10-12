frappe.query_reports["Agent Response Time"] = {
	filters: [
		{"fieldname": "from_date", "label": __("From Date"), "fieldtype": "Date", "default": frappe.datetime.add_months(frappe.datetime.get_today(), -6)},
		{"fieldname": "to_date", "label": __("To Date"), "fieldtype": "Date", "default": frappe.datetime.get_today()},
		{"fieldname": "sla_minutes", "label": __("SLA (minutes)"), "fieldtype": "Int", "default": 30},
	],
};
