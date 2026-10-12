// Maintenance tasks: jump to the plot / chat / map.
frappe.ui.form.on("Task", {
	refresh(frm) {
		if (!frm.doc.re_project) return;
		if (frm.doc.re_plot) frm.add_custom_button(__("Plot {0}", [frm.doc.re_plot]), () => frappe.set_route("Form", "RE Plot", frm.doc.re_plot), __("Site"));
		if (frm.doc.re_customer) frm.add_custom_button(__("Customer"), () => frappe.set_route("Form", "Customer", frm.doc.re_customer), __("Site"));
		if (frm.doc.re_conversation) frm.add_custom_button(__("WhatsApp Chat"), () => {
			frappe.route_options = { conversation: frm.doc.re_conversation };
			frappe.set_route("re-inbox");
		}, __("Site"));
		frm.add_custom_button(__("Site Map"), () => frappe.set_route("re-site-map"), __("Site"));
	},
});
