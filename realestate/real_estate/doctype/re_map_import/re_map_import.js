frappe.ui.form.on("RE Map Import", {
	refresh(frm) {
		frm.set_intro(__("Export the survey from QGIS / AutoCAD / Google Earth as KML or GeoJSON in WGS84. Give each plot polygon its number in the name property and, optionally, its block and size; blocks are matched by name, code or by position."));
		if (!frm.is_new() && frm.doc.import_file) {
			frm.add_custom_button(__("Run Import"), () => frappe.confirm(__("Import {0} into {1}?", [__(frm.doc.target), frm.doc.project]),
				() => frm.call("run_import").then((r) => { frappe.msgprint(r.message); frm.reload_doc(); }))).addClass("btn-primary");
		}
		if (frm.doc.status === "Completed") frm.add_custom_button(__("Open Site Map"), () => frappe.set_route("re-site-map"));
	},
});
