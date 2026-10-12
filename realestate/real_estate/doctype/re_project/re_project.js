frappe.ui.form.on("RE Project", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Site Map"), () => frappe.set_route("re-site-map"));
		frm.add_custom_button(__("Import Survey (KML / GeoJSON)"), () => frappe.new_doc("RE Map Import", { project: frm.doc.name }));
	},
});
