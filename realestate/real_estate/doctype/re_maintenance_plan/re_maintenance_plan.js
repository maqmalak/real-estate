frappe.ui.form.on("RE Maintenance Plan", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Create Task Now"), () => frm.call("create_task_now").then((r) => frappe.set_route("Form", "Task", r.message)));
		frm.add_custom_button(__("Tasks"), () => frappe.set_route("List", "Task", { re_maintenance_plan: frm.doc.name }));
	},
});
