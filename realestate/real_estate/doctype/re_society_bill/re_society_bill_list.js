frappe.listview_settings["RE Society Bill"] = {
	add_fields: ["status"],
	onload(listview) {
		if (frappe.user.has_role(["System Manager", "Society Manager", "Accounts User", "Sales Manager"])) {
			listview.page.add_inner_button(__("Generate Bills for a Month"), () => frappe.prompt(
				{ fieldname: "month", fieldtype: "Date", label: __("Any date in the month"), default: frappe.datetime.get_today(), reqd: 1 },
				(v) => frappe.call({ method: "realestate.tasks.generate_society_bills", args: { month: v.month }, freeze: true,
					freeze_message: __("Generating plot-wise bills…") }).then((r) => {
					frappe.show_alert({ message: __("{0} bills generated (plots already billed are skipped)", [r.message || 0]), indicator: "green" });
					listview.refresh();
				}), __("Generate monthly society bills"), __("Generate")));
		}
		if (!frappe.user.has_role(["System Manager", "Society Manager", "Recovery Officer", "Accounts User", "Accounts Manager"])) return;
		listview.page.add_actions_menu_item(__("Collect Selected"), () => {
			const bills = listview.get_checked_items(true);
			if (!bills.length) return frappe.msgprint(__("Tick the bills being paid first"));
			frappe.prompt([
				{ fieldname: "mode_of_payment", fieldtype: "Link", options: "Mode of Payment", label: __("Mode of Payment"), default: "Cash", reqd: 1 },
				{ fieldname: "posting_date", fieldtype: "Date", label: __("Date"), default: frappe.datetime.get_today(), reqd: 1 },
				{ fieldname: "reference_no", fieldtype: "Data", label: __("Reference / Cheque No") },
			], (v) => frappe.call({ method: "realestate.society.bulk_collect", freeze: true, freeze_message: __("Posting receipts…"),
				args: { ...v, rows: JSON.stringify(bills.map((bill) => ({ bill, amount: 0 }))) } }).then((r) => {
				const m = r.message;
				frappe.msgprint({ title: __("Collection result"), indicator: m.failed.length ? "orange" : "green",
					message: __("{0} receipts for {1}", [m.done.length, format_currency(m.total, "PKR", 0)]) +
						(m.failed.length ? "<br>" + m.failed.map((f) => `${f.bill}: ${f.error}`).join("<br>") : "") });
				listview.refresh();
			}), __("Collect {0} bills in full", [bills.length]), __("Collect"));
		}, false);
	},
	get_indicator(doc) {
		const colour = { Paid: "green", Due: "orange", Overdue: "red", "Partly Paid": "yellow", Unpaid: "gray" }[doc.status] || "gray";
		return [__(doc.status), colour, `status,=,${doc.status}`];
	},
};
