function re_charges_total(frm) {
	// footer under the Charges grid: rows and total amount (updates as rows change)
	const grid = frm.fields_dict.charges && frm.fields_dict.charges.grid;
	if (!grid) return;
	const rows = frm.doc.charges || [];
	const total = rows.reduce((a, r) => a + flt(r.amount), 0);
	let $f = grid.wrapper.find(".re-charges-total");
	if (!$f.length) $f = $(`<div class="re-charges-total text-muted small" style="padding:6px 10px;border-top:1px solid var(--border-color);display:flex;gap:24px"></div>`).appendTo(grid.wrapper);
	$f.html(`<span>${__("Rows")}: <b>${rows.length}</b></span><span>${__("Total Amount")}: <b class="text-body">${format_currency(total, "PKR", 0)}</b></span>`);
}

frappe.ui.form.on("RE Bill Charge", { amount: re_charges_total });

frappe.ui.form.on("RE Society Bill", {
	charges_add: re_charges_total,
	charges_remove: re_charges_total,
	refresh(frm) {
		re_charges_total(frm);
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
