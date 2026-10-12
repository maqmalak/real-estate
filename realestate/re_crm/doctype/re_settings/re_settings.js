frappe.ui.form.on("RE Settings", {
	refresh(frm) {
		frm.fields_dict.reset_demo_html.$wrapper.html(`<div class="mt-3"><p class="text-muted">${__("Wipes the sample project (plots, bookings, payments, bills, demo leads / customers, messages) and generates it again.")}</p>
			<button class="btn btn-sm btn-danger re-reset">${__("Reset Demo Data")}</button></div>`);
		frm.fields_dict.reset_demo_html.$wrapper.find(".re-reset").on("click", () => frappe.confirm(
			__("Delete all demo data and generate it again? Real (non-demo) records are not touched."),
			() => frm.call("reset_demo_data").then((r) => frappe.msgprint(r.message))));
		frm.add_custom_button(__("WhatsApp Inbox"), () => frappe.set_route("re-inbox"));
		frm.add_custom_button(__("Templates"), () => frappe.set_route("List", "WhatsApp Template"));
		frm.add_custom_button(__("Run Daily Reminders Now"), () => frappe.call({ method: "realestate.re_crm.doctype.re_settings.re_settings.run_reminders",
			callback: (r) => frappe.msgprint(r.message) }));
		frm.set_df_property("webhook_url", "description",
			__("In Meta → WhatsApp → Configuration, set this callback URL and the verify token above, then subscribe to the <b>messages</b> and <b>calls</b> fields."));
	},
});
