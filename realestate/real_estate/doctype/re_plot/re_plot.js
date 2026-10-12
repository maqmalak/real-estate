frappe.ui.form.on("RE Plot", {
	refresh(frm) {
		if (frm.is_new()) return;
		realestate.render_engagement(frm, frm.doc.customer ? "Customer" : null, frm.doc.customer);
		frm.add_custom_button(__("Show on Site Map"), () => frappe.set_route("re-site-map"));
		if (frm.doc.status === "Available") {
			frm.add_custom_button(__("Book Plot"), () => frappe.new_doc("RE Booking", { plot: frm.doc.name }));
			frm.add_custom_button(__("Send Pin to a Lead"), () => frappe.prompt(
				{ fieldname: "lead", fieldtype: "Link", options: "CRM Lead", label: __("Lead"), reqd: 1 },
				(v) => frappe.xcall("realestate.whatsapp.api.send", { doctype: "CRM Lead", name: v.lead, plot: frm.doc.name })
					.then(() => frappe.show_alert({ message: __("Location sent"), indicator: "green" })), __("Send location on WhatsApp")));
		}
		if (["Available", "Reserved"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Put on Hold"), () => frappe.prompt({ fieldname: "reason", fieldtype: "Small Text", label: __("Reason"), reqd: 1 },
				(v) => frm.call("put_on_hold", v).then(() => frm.reload_doc()), __("Put plot on hold")), __("Status"));
		}
		if (frm.doc.status === "Hold") frm.add_custom_button(__("Release Hold"), () => frm.call("release_hold").then(() => frm.reload_doc()), __("Status"));
		frm.add_custom_button(__("Maintenance Complaint"), () => realestate.complaint_dialog({ doctype: "RE Plot", name: frm.doc.name }));
		frm.add_custom_button(__("Maintenance Tasks"), () => frappe.set_route("List", "Task", { re_plot: frm.doc.name }));
		if (frm.doc.booking) frm.add_custom_button(__("Booking"), () => frappe.set_route("Form", "RE Booking", frm.doc.booking));
		realestate.mini_map(frm.fields_dict.map_html.$wrapper, frm.doc.geojson, frm.doc.centre_lat, frm.doc.centre_lng);
		// site photos (images attached to the plot) under the map; upload with the sidebar "Attach" button
		setTimeout(() => {
			const imgs = (frm.get_docinfo().attachments || []).filter((a) => /\.(jpe?g|png|webp|gif)$/i.test(a.file_url));
			const $w = frm.fields_dict.map_html.$wrapper;
			$w.find(".re-photos").remove();
			$w.append(`<div class="re-photos" style="display:flex;gap:8px;overflow-x:auto;margin-top:8px">${imgs.length
				? imgs.map((a) => `<a href="${a.file_url}" target="_blank"><img src="${a.file_url}" style="height:96px;width:144px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color)"></a>`).join("")
				: `<span class="text-muted small">${__("No site photos yet — use Attach in the sidebar to add them.")}</span>`}</div>`);
		}, 400);
	},
});

realestate.mini_map = (wrapper, geojson, lat, lng) => {
	const $w = $(wrapper).empty();
	if (!geojson || typeof L === "undefined") return;
	const id = "re-mini-" + Math.random().toString(36).slice(2);
	$w.html(`<div id="${id}" style="height:320px;border-radius:8px;border:1px solid var(--border-color)"></div>`);
	setTimeout(() => {
		const map = L.map(id, { maxZoom: 21 });
		L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
			{ maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri" }).addTo(map);
		const layer = L.geoJSON(JSON.parse(geojson), { style: { color: "#f59e0b", weight: 3, fillOpacity: 0.3 } }).addTo(map);
		map.fitBounds(layer.getBounds(), { maxZoom: 19, padding: [30, 30] });
	}, 200);
};
