frappe.ui.form.on("RE Booking Cancellation", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1) return;
		frappe.db.get_value("RE Plot", frm.doc.plot, "status").then((r) => {
			if (!["Available", "Reserved"].includes(r.message.status)) return;
			frm.add_custom_button(__("Re-allot Plot"), () => frappe.new_doc("RE Re-allotment", { plot: frm.doc.plot, cancellation: frm.doc.name }))
				.addClass("btn-primary");
		});
	},
});
