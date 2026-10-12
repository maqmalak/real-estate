frappe.ui.form.on("RE Booking", {
	setup(frm) {
		// status, block, size, price, street and premium tags in the dropdown; only plots that can be booked
		frm.set_query("plot", () => ({ query: "realestate.queries.plot_query", filters: { status: ["Available", "Reserved"] } }));
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
		if (!frm.doc.plot) { re_booking_plot_card(frm); return; }
		frappe.db.get_value("RE Plot", frm.doc.plot, "list_price").then((r) => frm.set_value("total_price", r.message.list_price));
		re_booking_plot_card(frm);
	},
	onload_post_render(frm) { re_booking_plot_card(frm); },
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

// The chosen plot at a glance under the Plot field: status, block, size, area, price, street and premium tags.
function re_booking_plot_card(frm) {
	const wrap = frm.fields_dict.plot && frm.fields_dict.plot.$wrapper;
	if (!wrap) return;
	wrap.find(".re-plot-card").remove();
	if (!frm.doc.plot) return;
	frappe.db.get_value("RE Plot", frm.doc.plot, ["status", "block", "plot_size", "area_marla", "list_price", "street", "is_corner",
		"is_park_facing", "is_boulevard_facing", "customer_name", "payment_status"]).then(({ message: p }) => {
		if (!p) return;
		const tone = { Available: "green", Reserved: "purple", Hold: "orange", Booked: "blue", Sold: "blue", "Possession Given": "cyan", Blocked: "gray" }[p.status] || "gray";
		const tags = [["Corner", p.is_corner], ["Park facing", p.is_park_facing], ["Boulevard", p.is_boulevard_facing]].filter((t) => t[1])
			.map((t) => `<span class="indicator-pill yellow" style="margin-left:4px">${__(t[0])}</span>`).join("");
		const bookable = ["Available", "Reserved"].includes(p.status) || frm.doc.docstatus > 0;
		const e = frappe.utils.escape_html;
		wrap.find(".re-plot-card").remove();
		wrap.append(`<div class="re-plot-card" style="margin-top:8px;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--subtle-fg)">
			<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
				<span class="indicator-pill ${tone}">${__(p.status)}</span>${tags}
				<b style="margin-left:auto">${format_currency(p.list_price, "PKR", 0)}</b>
			</div>
			<div class="text-muted" style="font-size:12px;margin-top:6px">${e(p.block || "")} · ${e(p.plot_size || "")} · ${p.area_marla || 0} marla${p.street ? " · " + e(p.street) : ""}</div>
			${bookable ? "" : `<div style="color:var(--red-600);font-size:12px;margin-top:6px">${__("This plot is {0}{1} — choose an available plot.", [__(p.status), p.customer_name ? " (" + e(p.customer_name) + ")" : ""])}</div>`}
		</div>`);
	});
}
