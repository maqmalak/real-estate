frappe.ui.form.on("RE Payment", {
	setup(frm) {
		frm.set_query("booking", () => ({ filters: { docstatus: 1, status: ["!=", "Paid"] } }));
		frm.set_query("society_bill", () => ({ filters: { status: ["!=", "Paid"] } }));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Send Receipt on WhatsApp"), () => frappe.xcall("realestate.whatsapp.channel.send_now",
				{ reminder_type: "Payment Receipt", reference_doctype: frm.doctype, reference_name: frm.doc.name })
				.then((s) => frappe.show_alert({ message: __("Receipt: {0}", [__(s)]), indicator: s === "Failed" ? "red" : "green" })));
		}
	},
	booking(frm) {
		if (!frm.doc.booking) return;
		frappe.db.get_value("RE Booking", frm.doc.booking, ["customer", "overdue_amount", "next_due_amount"]).then(({ message: b }) => {
			frm.set_value("customer", b.customer);
			if (!frm.doc.amount) frm.set_value("amount", b.overdue_amount || b.next_due_amount);
		});
	},
	society_bill(frm) {
		if (!frm.doc.society_bill) return;
		frappe.db.get_value("RE Society Bill", frm.doc.society_bill, ["customer", "outstanding_amount"]).then(({ message: b }) => {
			frm.set_value("customer", b.customer);
			frm.set_value("amount", b.outstanding_amount);
		});
	},
});
