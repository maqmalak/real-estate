frappe.ui.form.on("RE Site Visit", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Send WhatsApp Invitation"), () => frappe.xcall("realestate.whatsapp.channel.send_now",
			{ reminder_type: "Site Visit Invitation", reference_doctype: frm.doctype, reference_name: frm.doc.name })
			.then((s) => frappe.show_alert({ message: __("Invitation: {0}", [__(s)]), indicator: s === "Failed" ? "red" : "green" })));
		frm.add_custom_button(__("Open {0}", [__(frm.doc.party_type)]), () => frappe.set_route("Form", frm.doc.party_type, frm.doc.party));
	},
	party(frm) {
		if (frm.doc.party_type && frm.doc.party) frappe.db.get_value(frm.doc.party_type, frm.doc.party, "mobile_no").then((r) => frm.set_value("mobile_no", r.message.mobile_no));
	},
});
