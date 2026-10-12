frappe.ui.form.on("RE Broadcast", {
	setup(frm) {
		frm.set_query("template", () => ({ filters: { status: "Approved" } }));
	},
	refresh(frm) {
		if (frm.is_new()) return;
		if (["Draft", "Completed", "Failed"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Fetch Recipients"), () => frm.call("fetch_recipients").then((r) => {
				frappe.show_alert(__("{0} recipients", [r.message]));
				frm.reload_doc();
			}));
			if (frm.doc.status === "Draft") {
				frm.add_custom_button(__("Start Broadcast"), () => frappe.confirm(
					__("Send {0} to {1} recipients at {2} per minute? Opted-out numbers are skipped.", [frm.doc.template, frm.doc.total_recipients || __("all"), frm.doc.rate_per_minute || 60]),
					() => frm.call("start").then(() => frm.reload_doc()))).addClass("btn-primary");
			}
		}
		frappe.realtime.off("re_broadcast_progress");
		frappe.realtime.on("re_broadcast_progress", (d) => {
			if (d.name !== frm.doc.name) return;
			frm.dashboard.show_progress(__("Sending"), ((d.sent + d.failed + d.skipped) * 100) / (d.total || 1),
				__("{0} sent · {1} failed · {2} skipped of {3}", [d.sent, d.failed, d.skipped, d.total]));
			if (d.sent + d.failed + d.skipped >= d.total) setTimeout(() => frm.reload_doc(), 1500);
		});
	},
});
