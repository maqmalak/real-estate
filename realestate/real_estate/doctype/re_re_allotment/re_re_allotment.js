frappe.ui.form.on("RE Re-allotment", {
	setup(frm) {
		frm.set_query("plot", () => ({ filters: { status: ["in", ["Available", "Reserved"]] } }));
		frm.set_query("cancellation", () => ({ filters: { docstatus: 1, ...(frm.doc.plot ? { plot: frm.doc.plot } : {}) } }));
	},
	refresh(frm) {
		if (frm.doc.new_booking) frm.add_custom_button(__("New Booking"), () => frappe.set_route("Form", "RE Booking", frm.doc.new_booking));
		if (frm.doc.previous_booking) frm.add_custom_button(__("Previous Booking"), () => frappe.set_route("Form", "RE Booking", frm.doc.previous_booking));
		if (frm.is_new() && !frm.doc.reallotment_fee) frappe.db.get_single_value("RE Settings", "reallotment_fee").then((v) => frm.set_value("reallotment_fee", v));
	},
	plot(frm) {
		if (!frm.doc.plot) return;
		frappe.db.get_value("RE Plot", frm.doc.plot, "list_price").then((r) => frm.set_value("total_price", r.message.list_price));
	},
});
