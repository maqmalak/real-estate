frappe.listview_settings["RE Plot"] = {
	add_fields: ["status", "payment_status"],
	get_indicator(doc) {
		const colour = { Available: "green", Hold: "orange", Reserved: "purple", Booked: "blue", Sold: "darkgrey", "Possession Given": "cyan", Blocked: "gray" }[doc.status] || "gray";
		return [__(doc.status), colour, `status,=,${doc.status}`];
	},
	onload(listview) {
		if (!frappe.user.has_role(["Sales Manager", "System Manager"])) return;
		listview.page.add_inner_button(__("Revise Prices"), () => {
			const method = "realestate.real_estate.doctype.re_plot.re_plot.revise_prices";
			const d = new frappe.ui.Dialog({
				title: __("Revise plot prices"),
				fields: [
					{ fieldname: "block", fieldtype: "Link", options: "RE Block", label: __("Block") },
					{ fieldname: "plot_size", fieldtype: "Link", options: "RE Plot Size", label: __("Size") },
					{ fieldname: "percent", fieldtype: "Float", label: __("Change %"), default: 5, reqd: 1 },
					{ fieldname: "reason", fieldtype: "Data", label: __("Reason"), reqd: 1 },
					{ fieldname: "preview", fieldtype: "HTML" },
				],
				primary_action_label: __("Apply"),
				primary_action(v) {
					frappe.call({ method, args: { ...v, preview: 0 }, freeze: true }).then((r) => {
						frappe.show_alert({ message: __("{0} plots repriced", [r.message.count]), indicator: "green" });
						d.hide();
						listview.refresh();
					});
				},
			});
			const preview = () => {
				const v = d.get_values(true);
				if (!v.percent) return;
				frappe.call({ method, args: { ...v, reason: "preview", preview: 1 } }).then((r) => {
					const m = r.message;
					d.fields_dict.preview.$wrapper.html(`<p class="text-muted">${m.count} available / on-hold plots ·
						${format_currency(m.before, "PKR", 0)} → <b>${format_currency(m.after, "PKR", 0)}</b>. Booked and sold plots keep their price.</p>`);
				});
			};
			["block", "plot_size", "percent"].forEach((f) => d.fields_dict[f].df.onchange = preview);
			d.show();
			preview();
		});
	},
};
