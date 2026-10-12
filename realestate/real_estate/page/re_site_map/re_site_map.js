// Interactive site plan: boundary, blocks, plots coloured by status / payment, roads, public buildings,
// infrastructure, waste sites and utility networks (water, sewerage, electricity, internet).

const RE_STATUS_COLORS = { Available: "#22c55e", Hold: "#f97316", Reserved: "#a855f7", Booked: "#3b82f6", Sold: "#6366f1", "Possession Given": "#0ea5e9", Blocked: "#9ca3af" };
const RE_PAY_COLORS = { Paid: "#16a34a", Due: "#f59e0b", Overdue: "#dc2626", "": "#e5e7eb" };
const RE_LAYERS = [
	["boundary", "Boundary"], ["blocks", "Blocks"], ["plots", "Plots"], ["Roads and Gates", "Roads & Gates"],
	["Public Buildings", "Public Buildings"], ["Infrastructure", "Infrastructure"], ["Waste", "Waste Area"],
	["Water Supply Line", "Water Supply"], ["Sewerage Line", "Sewerage"], ["Electricity Line", "Electricity"], ["Internet Cable", "Internet Cable"],
	["maintenance", "Open Maintenance Tasks"],
];

frappe.pages["re-site-map"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Site Map"), single_column: true });
	new SiteMap(page, wrapper);
};

class SiteMap {
	constructor(page, wrapper) {
		this.page = page;
		this.color_by = "Payment Status";
		this.visible = new Set(RE_LAYERS.map((l) => l[0]));
		this.project = page.add_field({ fieldname: "project", label: __("Project"), fieldtype: "Link", options: "RE Project",
			change: () => this.load() });
		const color_by = page.add_field({ fieldname: "color_by", label: __("Colour By"), fieldtype: "Select", options: "Payment Status\nStatus\nBlock",
			default: this.color_by, change: () => { this.color_by = color_by.get_value(); this.restyle(); } });
		this.search = page.add_field({ fieldname: "plot", label: __("Find Plot"), fieldtype: "Data",
			change: () => this.find(this.search.get_value()) });
		page.set_primary_action(__("Refresh"), () => this.load(), "refresh");
		page.add_menu_item(__("Import KML / GeoJSON"), () => frappe.new_doc("RE Map Import"));
		page.add_menu_item(__("Plot List"), () => frappe.set_route("List", "RE Plot"));
		$(page.body).html(`<div class="re-map-wrap">
			<div class="re-map" id="re-map"></div>
			<div class="re-map-side">
				<div class="re-map-card re-stats"></div>
				<div class="re-map-card re-legend"></div>
				<div class="re-map-card re-layers"><b>${__("Layers")}</b>${RE_LAYERS.map(([k, l]) =>
					`<div class="re-legend-row"><label class="m-0"><input type="checkbox" data-layer="${k}" checked> ${__(l)}</label></div>`).join("")}</div>
			</div></div>`);
		$(page.body).find("[data-layer]").on("change", (e) => {
			const k = $(e.target).data("layer");
			e.target.checked ? this.visible.add(k) : this.visible.delete(k);
			this.apply_visibility();
		});
		frappe.db.get_single_value("RE Settings", "default_project").then((p) => {
			if (p) this.project.set_value(p);
			else this.load();
		});		// recolour when a plot's status changes anywhere (debounced reload)
		frappe.realtime.on("re_plot_status", () => {
			clearTimeout(this._live);
			this._live = setTimeout(() => this.load(), 800);
		});
	}

	async load() {
		const data = await frappe.xcall("realestate.api.get_map_data", { project: this.project.get_value() || null });
		if (!data || !data.project) {
			$(this.page.body).find(".re-map").html(`<div class="p-4 text-muted">${__("No project yet. Create an RE Project or run the demo data.")}</div>`);
			return;
		}
		this.data = data;
		this.data.tasks = await frappe.xcall("realestate.maintenance.get_map_tasks", { project: data.project.name });
		this.draw();
	}

	draw() {
		const p = this.data.project;
		if (!this.map) {
			this.map = L.map("re-map", { zoomControl: true, maxZoom: 21 });
			const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap" });
			const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
				{ maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri" });
			sat.addTo(this.map);
			L.control.layers({ [__("Satellite")]: sat, [__("Street map")]: osm }).addTo(this.map);
			L.control.scale({ imperial: false }).addTo(this.map);
			this.map.on("zoomend", () => this.toggle_labels());
		}
		if (this.groups) Object.values(this.groups).forEach((g) => g.remove());
		this.groups = {};
		const group = (k) => (this.groups[k] = this.groups[k] || L.featureGroup());

		if (p.boundary_geojson) {
			L.geoJSON(p.boundary_geojson, { style: { color: "#dc2626", weight: 3, fill: false, dashArray: "8 4" } }).addTo(group("boundary"));
		}
		(this.data.blocks || []).forEach((b) => b.geojson && L.geoJSON(b.geojson, {
			style: { color: b.color || "#64748b", weight: 2, fillOpacity: 0.08 },
		}).bindTooltip(`${b.name}`, { sticky: true }).addTo(group("blocks")));

		this.feature_layers = [];
		(this.data.features || []).forEach((f) => {
			if (!f.geojson) return;
			const key = f.category === "Utility Network" ? f.feature_type : f.category;
			const line = f.geojson.type === "LineString";
			const layer = L.geoJSON(f.geojson, {
				style: line ? { color: f.color || "#6b7280", weight: f.category === "Roads and Gates" ? Math.max(2, (f.width_ft || 30) / 10) : 2,
					opacity: 0.85, dashArray: f.category === "Utility Network" ? "4 4" : null }
					: { color: f.color || "#6b7280", weight: 1, fillColor: f.color || "#6b7280", fillOpacity: 0.45 },
				pointToLayer: (_g, ll) => L.circleMarker(ll, { radius: f.feature_type.includes("Gate") ? 8 : 5, color: "#111827", weight: 1,
					fillColor: f.color || "#ca8a04", fillOpacity: 1 }),
			}).bindTooltip(`<b>${frappe.utils.escape_html(f.feature_name)}</b><br>${f.feature_type}`, { sticky: true });
			layer.on("click", () => frappe.set_route("Form", "RE Map Feature", f.name));
			layer.addTo(group(key));
		});

		this.plot_layers = {};
		(this.data.plots || []).forEach((pl) => {
			if (!pl.geojson) return;
			const layer = L.geoJSON(pl.geojson, { style: this.plot_style(pl) });
			layer.bindPopup(() => this.popup(pl), { maxWidth: 280 });
			layer.bindTooltip(pl.name.split("-")[1], { permanent: true, direction: "center", className: "re-plot-label" });
			layer.addTo(group("plots"));
			this.plot_layers[pl.name] = { layer, plot: pl };
		});

		(this.data.tasks || []).forEach((t) => {
			const color = { Urgent: "#dc2626", High: "#ea580c", Medium: "#ca8a04", Low: "#65a30d" }[t.priority] || "#ca8a04";
			const icon = L.divIcon({ className: "", iconSize: [26, 26], html: `<div title="${frappe.utils.escape_html(t.subject)}" style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">🛠</div>` });
			L.marker([t.lat, t.lng], { icon }).bindPopup(`<b>${frappe.utils.escape_html(t.subject)}</b><br>${t.type || ""} · ${__(t.status)} · ${__(t.priority)}
				<br>${t.exp_end_date ? __("Due") + " " + frappe.datetime.str_to_user(t.exp_end_date) : ""}
				<br>${(t.assigned || []).map((u) => frappe.utils.escape_html(frappe.user.full_name(u))).join(", ") || __("Unassigned")}
				<br><a class="btn btn-xs btn-default mt-2" href="/app/task/${t.name}">${__("Open task")}</a>`).addTo(group("maintenance"));
		});

		this.apply_visibility();
		const bounds = (this.groups.boundary || this.groups.plots).getBounds();
		if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [10, 10] });
		this.legend();
		this.stats();
		this.toggle_labels();
	}

	plot_style(pl) {
		let fill;
		if (this.color_by === "Status") fill = RE_STATUS_COLORS[pl.status];
		else if (this.color_by === "Block") fill = ((this.data.blocks || []).find((b) => b.name === pl.block) || {}).color;
		else fill = pl.status === "Available" ? "#ffffff" : RE_PAY_COLORS[pl.payment_status || ""];
		return { color: "#334155", weight: 0.6, fillColor: fill || "#e5e7eb", fillOpacity: pl.status === "Available" && this.color_by === "Payment Status" ? 0.55 : 0.85 };
	}

	restyle() {
		Object.values(this.plot_layers || {}).forEach(({ layer, plot }) => layer.setStyle(this.plot_style(plot)));
		this.legend();
	}

	popup(pl) {
		const money = (v) => (v ? format_currency(v, "PKR", 0) : "—");
		const features = ["is_corner", "is_park_facing", "is_boulevard_facing"].filter((k) => pl[k])
			.map((k) => ({ is_corner: __("Corner"), is_park_facing: __("Park facing"), is_boulevard_facing: __("Boulevard") })[k]).join(", ");
		return `<div style="min-width:220px">
			<h5 style="margin:0 0 4px">${__("Plot")} ${pl.name}</h5>
			<div>${pl.plot_size} · ${pl.block}${pl.street ? " · " + frappe.utils.escape_html(pl.street) : ""}</div>
			${features ? `<div class="text-muted small">${features}</div>` : ""}
			<div style="margin:6px 0"><span class="indicator-pill ${{ Available: "green", Booked: "blue", Sold: "purple", Reserved: "orange", Hold: "orange", "Possession Given": "cyan" }[pl.status] || "gray"}">${__(pl.status)}</span>
			${pl.payment_status ? `<span class="indicator-pill ${{ Paid: "green", Due: "orange", Overdue: "red" }[pl.payment_status]}">${__(pl.payment_status)}</span>` : ""}</div>
			${pl.customer_name ? `<div><b>${frappe.utils.escape_html(pl.customer_name)}</b></div>` : ""}
			<div>${__("List price")}: ${money(pl.list_price)}</div>
			${pl.outstanding_amount ? `<div>${__("Outstanding")}: ${money(pl.outstanding_amount)}</div>` : ""}
			${pl.overdue_amount ? `<div style="color:#dc2626">${__("Overdue")}: ${money(pl.overdue_amount)}</div>` : ""}
			${pl.next_due_date ? `<div>${__("Next due")}: ${frappe.datetime.str_to_user(pl.next_due_date)}</div>` : ""}
			<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
				<a class="btn btn-xs btn-default" href="/app/re-plot/${encodeURIComponent(pl.name)}">${__("Open")}</a>
				${pl.booking ? `<a class="btn btn-xs btn-default" href="/app/re-booking/${encodeURIComponent(pl.booking)}">${__("Booking")}</a>` : ""}
				${pl.status === "Available" ? `<a class="btn btn-xs btn-primary" onclick="frappe.new_doc('RE Booking', {plot: '${pl.name}'})">${__("Book")}</a>` : ""}
				<a class="btn btn-xs btn-default" onclick="realestate.complaint_dialog({doctype: 'RE Plot', name: '${pl.name}'})">🛠 ${__("Complaint")}</a>
			</div></div>`;
	}

	legend() {
		const map = this.color_by === "Status" ? RE_STATUS_COLORS
			: this.color_by === "Block" ? Object.fromEntries((this.data.blocks || []).map((b) => [b.name, b.color]))
				: { [__("Available")]: "#ffffff", [__("Paid")]: RE_PAY_COLORS.Paid, [__("Due")]: RE_PAY_COLORS.Due, [__("Overdue")]: RE_PAY_COLORS.Overdue };
		$(this.page.body).find(".re-legend").html(`<b>${__(this.color_by)}</b>` + Object.entries(map).map(([k, c]) =>
			`<div class="re-legend-row"><span class="re-swatch" style="background:${c}"></span>${__(k)}</div>`).join(""));
	}

	stats() {
		const plots = this.data.plots || [];
		const count = (f) => plots.filter(f).length;
		const p = this.data.project;
		$(this.page.body).find(".re-stats").html(`
			<b>${frappe.utils.escape_html(p.name)}</b>
			<div class="text-muted small">${p.total_area_kanal} ${__("Kanal")} · ${__("drawn")} ${p.boundary_area_kanal || "—"}</div>
			<div class="re-legend-row">${__("Plots")}: <b>${plots.length}</b></div>
			<div class="re-legend-row">${__("Available")}: <b>${count((x) => x.status === "Available")}</b></div>
			<div class="re-legend-row">${__("Booked / Sold")}: <b>${count((x) => ["Booked", "Sold"].includes(x.status))}</b></div>
			<div class="re-legend-row" style="color:#dc2626">${__("Overdue")}: <b>${count((x) => x.payment_status === "Overdue")}</b></div>
			<div class="re-legend-row">🛠 ${__("Open maintenance")}: <b><a href="/app/task?re_project=${encodeURIComponent(p.name)}&status=${encodeURIComponent('["in",["Open","Working","Pending Review","Overdue"]]')}">${(this.data.tasks || []).length}</a></b></div>`);
	}

	apply_visibility() {
		Object.entries(this.groups || {}).forEach(([k, g]) => (this.visible.has(k) ? g.addTo(this.map) : g.remove()));
		if (this.groups && this.groups.plots && this.visible.has("plots")) this.groups.plots.bringToFront();
	}

	toggle_labels() {
		const show = this.map.getZoom() >= 18;
		Object.values(this.plot_layers || {}).forEach(({ layer }) => layer.eachLayer((l) => {
			const t = l.getTooltip();
			if (t) show ? l.openTooltip() : l.closeTooltip();
		}));
	}

	find(no) {
		if (!no || !this.plot_layers) return;
		const key = no.trim().toUpperCase();
		const hit = this.plot_layers[key] || Object.values(this.plot_layers).find((x) => x.plot.name.endsWith(key));
		if (!hit) return frappe.show_alert(__("Plot {0} not found", [no]));
		this.map.fitBounds(hit.layer.getBounds(), { maxZoom: 20 });
		hit.layer.openPopup();
	}
}
