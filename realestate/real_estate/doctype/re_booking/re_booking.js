frappe.ui.form.on("RE Booking", {
	setup(frm) {
		frm.set_query("plot", () => ({ filters: { status: ["in", ["Available", "Reserved"]] } }));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.payment_plan) {
			frm.add_custom_button(__("Rebuild Schedule"), () => frm.call("make_schedule").then(() => frm.dirty() || frm.refresh_field("installments")));
		}
		if (frm.doc.docstatus === 1) {
			if (frm.doc.outstanding_amount > 0) {
				frm.add_custom_button(__("Record Payment"), () => frappe.new_doc("RE Payment", {
					payment_against: "Booking", booking: frm.doc.name, customer: frm.doc.customer,
					amount: frm.doc.overdue_amount || frm.doc.next_due_amount }), null).addClass("btn-primary");
			}
			const send = (type) => frappe.xcall("realestate.whatsapp.channel.send_now", { reminder_type: type, reference_doctype: frm.doctype, reference_name: frm.doc.name })
				.then((s) => frappe.show_alert({ message: __("{0}: {1}", [__(type), __(s)]), indicator: s === "Failed" ? "red" : "green" }));
			frm.add_custom_button(__("Booking Confirmation"), () => send("Booking Confirmation"), __("WhatsApp"));
			frm.add_custom_button(__("Installment Reminder"), () => send("Installment Reminder"), __("WhatsApp"));
			if (frm.doc.overdue_amount > 0) frm.add_custom_button(__("Overdue Notice"), () => send("Overdue Notice"), __("WhatsApp"));
			frm.add_custom_button(__("Customer Chat"), () => frappe.set_route("Form", "Customer", frm.doc.customer), __("WhatsApp"));
			if (frm.doc.status === "Paid" && !frm.doc.possession_date) {
				frm.add_custom_button(__("Give Possession"), () => frappe.prompt([
					{ fieldname: "possession_date", fieldtype: "Date", label: __("Possession Date"), default: frappe.datetime.get_today(), reqd: 1 },
					{ fieldname: "remarks", fieldtype: "Small Text", label: __("Remarks") }],
					(v) => frm.call("give_possession", v).then((r) => {
						frappe.show_alert({ message: __("Possession given — letter issued"), indicator: "green" });
						if (r.message?.file_url) window.open(r.message.file_url);
						frm.reload_doc();
					}), __("Hand over plot {0}", [frm.doc.plot]), __("Give Possession")));
			}
		}
		const colors = { Paid: "green", Due: "orange", Overdue: "red", Cancelled: "gray", Draft: "gray" };
		frm.page.set_indicator(frm.doc.possession_date ? __("Possession Given") : __(frm.doc.status), frm.doc.possession_date ? "blue" : colors[frm.doc.status] || "blue");
	},
	plot(frm) {
		if (!frm.doc.plot) return;
		frappe.db.get_value("RE Plot", frm.doc.plot, "list_price").then((r) => frm.set_value("total_price", r.message.list_price));
	},
	customer(frm) {
		if (!frm.doc.customer) return;
		frappe.db.get_value("Customer", frm.doc.customer, ["mobile_no", "account_manager"]).then((r) => {
			frm.set_value("mobile_no", r.message.mobile_no);
			if (!frm.doc.agent && r.message.account_manager) frm.set_value("agent", r.message.account_manager);
		});
	},
	payment_plan: (frm) => frm.doc.payment_plan && frm.doc.total_price && frm.call("make_schedule").then(() => frm.refresh_field("installments")),
	total_price: (frm) => frm.doc.payment_plan && frm.doc.total_price && frm.call("make_schedule").then(() => frm.refresh_field("installments")),
	discount: (frm) => frm.doc.payment_plan && frm.call("make_schedule").then(() => frm.refresh_field("installments")),
	first_due_date: (frm) => frm.doc.payment_plan && frm.call("make_schedule").then(() => frm.refresh_field("installments")),
});
