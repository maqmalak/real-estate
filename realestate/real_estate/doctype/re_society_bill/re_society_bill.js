frappe.ui.form.on("RE Society Bill", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (frm.doc.outstanding_amount > 0) {
			frm.add_custom_button(__("Record Payment"), () => frappe.new_doc("RE Payment", {
				payment_against: "Society Bill", society_bill: frm.doc.name, customer: frm.doc.customer, amount: frm.doc.outstanding_amount })).addClass("btn-primary");
		}
		frm.add_custom_button(__("Send on WhatsApp"), () => frappe.xcall("realestate.whatsapp.channel.send_now",
			{ reminder_type: "Society Bill", reference_doctype: frm.doctype, reference_name: frm.doc.name })
			.then((s) => frappe.show_alert({ message: __("Bill: {0}", [__(s)]), indicator: s === "Failed" ? "red" : "green" })));
	},
});
frappe.listview_settings["RE Society Bill"] = {
	onload(list) {
		list.page.add_inner_button(__("Generate This Month's Bills"), () => frappe.xcall("realestate.tasks.generate_society_bills")
			.then((n) => { frappe.show_alert(__("{0} bills created", [n])); list.refresh(); }));
	},
};
