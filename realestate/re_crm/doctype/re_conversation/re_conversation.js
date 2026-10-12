frappe.ui.form.on("RE Conversation", {
	refresh(frm) {
		frm.add_custom_button(__("Open in Inbox"), () => { frappe.route_options = { conversation: frm.doc.name }; frappe.set_route("re-inbox"); }).addClass("btn-primary");
	},
});
