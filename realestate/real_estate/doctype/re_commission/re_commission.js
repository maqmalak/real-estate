// Pay a Payable commission (date, mode, reference) → Payment Entry, then print the Commission Payment Voucher.
frappe.ui.form.on("RE Commission", {
	refresh(frm) {
		const tone = { Accrued: "orange", Payable: "blue", Paid: "green", Cancelled: "gray" }[frm.doc.status] || "gray";
		frm.page.set_indicator(__(frm.doc.status), tone);
		if (frm.doc.status === "Payable") {
			frm.add_custom_button(__("Pay Commission"), () => re_commission_pay_dialog(frm)).addClass("btn-primary");
		}
		if (frm.doc.status === "Accrued") {
			frm.dashboard.set_headline(__("Payable once the customer has paid the threshold share of the price (RE Settings → Commission payable after %)."));
		}
		if (["Accrued", "Payable"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Cancel Commission"), () => frappe.confirm(__("Cancel {0} and reverse its accrual journal?", [frm.doc.name]),
				() => frm.call("cancel_commission").then(() => frm.reload_doc())), __("Actions"));
		}
		if (frm.doc.payment_doctype === "Payment Entry" && frm.doc.payment_entry) {
			frm.add_custom_button(__("Print Payment Voucher"), () => re_commission_print(frm.doc.payment_entry));
			frm.add_custom_button(__("Payment Entry"), () => frappe.set_route("Form", "Payment Entry", frm.doc.payment_entry), __("View"));
		}
		if (frm.doc.supplier) frm.add_custom_button(__("Beneficiary ledger"), () => frappe.set_route("query-report", "General Ledger",
			{ party_type: "Supplier", party: [frm.doc.supplier], company: frappe.defaults.get_default("company") }), __("View"));
	},
});

function re_commission_pay_dialog(frm) {
	const d = new frappe.ui.Dialog({
		title: __("Pay {0} — {1}", [frm.doc.beneficiary, format_currency(frm.doc.amount, "PKR")]),
		fields: [
			{ fieldname: "posting_date", fieldtype: "Date", label: __("Payment Date"), default: frappe.datetime.get_today(), reqd: 1 },
			{ fieldname: "mode_of_payment", fieldtype: "Link", options: "Mode of Payment", label: __("Mode of Payment"), default: "Bank Transfer", reqd: 1 },
			{ fieldtype: "Column Break" },
			{ fieldname: "reference_no", fieldtype: "Data", label: __("Reference / Cheque No."), description: __("Defaults to the commission number") },
			{ fieldname: "reference_date", fieldtype: "Date", label: __("Reference Date"), default: frappe.datetime.get_today() },
		],
		primary_action_label: __("Pay & Print Voucher"),
		primary_action(v) {
			d.disable_primary_action();
			frm.call("pay", v).then((r) => {
				d.hide();
				frappe.show_alert({ message: __("Paid — {0}", [r.message]), indicator: "green" });
				frm.reload_doc();
				re_commission_print(r.message);
			}).always(() => d.enable_primary_action());
		},
	});
	d.show();
}

function re_commission_print(pe) {
	window.open(`/printview?doctype=Payment%20Entry&name=${encodeURIComponent(pe)}&format=${encodeURIComponent("Commission Payment Voucher")}&trigger_print=1`);
}
