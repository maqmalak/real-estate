frappe.ui.form.on("RE Project", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Site Map"), () => frappe.set_route("re-site-map"));
		frm.add_custom_button(__("Import Survey (KML / GeoJSON)"), () => frappe.new_doc("RE Map Import", { project: frm.doc.name }));
		re_project_profile(frm);
	},
});

// Scheme profile (same data as the React project page): sold / collected / development rings, KPIs, block and development progress.
function re_project_profile(frm) {
	// form scripts share one scope with other desk scripts — keep these local
	const SOLD = ["Booked", "Sold", "Possession Given"];
	const TONE = { Available: "#10b981", Hold: "#f97316", Reserved: "#f59e0b", Booked: "#3b82f6", Sold: "#6366f1", "Possession Given": "#8b5cf6", Blocked: "#64748b" };
	const ORDER = Object.keys(TONE);
	frappe.call({ method: "realestate.spa.project_profile", args: { project: frm.doc.name }, type: "GET" }).then(({ message: d }) => {
		if (!d) return;
		const e = frappe.utils.escape_html;
		const n = (v) => format_number(v || 0, null, 0);
		const cr = (v) => {
			v = flt(v);
			return v >= 1e7 ? `Rs ${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `Rs ${(v / 1e5).toFixed(1)} Lac` : format_currency(v, "PKR", 0);
		};
		const pct = (a, b) => (b > 0 ? (a * 100) / b : 0);
		const total = d.plots.reduce((a, r) => a + r.n, 0);
		const sold = d.plots.filter((r) => SOLD.includes(r.status)).reduce((a, r) => a + r.n, 0);
		const avail = d.plots.find((r) => r.status === "Available") || { n: 0, value: 0 };
		const coll = pct(flt(d.sales.paid), flt(d.sales.net_sales));
		const ring = (v, label, sub, color) => {
			const c = 2 * Math.PI * 42, x = Math.max(0, Math.min(v == null ? 0 : v, 100));
			return `<div style="text-align:center;min-width:110px">
				<svg viewBox="0 0 100 100" width="96" height="96" style="transform:rotate(-90deg)">
					<circle cx="50" cy="50" r="42" fill="none" stroke="var(--gray-200)" stroke-width="9"/>
					${x > 0 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(x / 100) * c} ${c}"/>` : ""}
				</svg>
				<div style="margin-top:-62px;height:30px;font-size:20px;font-weight:700;color:${color}">${v == null ? "—" : x.toFixed(0) + "%"}</div>
				<div style="margin-top:32px;font-weight:600;font-size:12px">${label}</div>
				<div class="text-muted" style="font-size:11px">${sub}</div></div>`;
		};
		const bar = (v, color) => `<div style="height:8px;border-radius:99px;background:var(--gray-100);overflow:hidden">
			<div style="height:100%;width:${Math.max(0, Math.min(v, 100))}%;background:${color};border-radius:99px"></div></div>`;
		const kpi = (label, value, sub, color) => `<div style="flex:1 1 180px;border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;border-top:3px solid ${color}">
			<div class="text-muted" style="font-size:12px">${label}</div><div style="font-size:20px;font-weight:700">${value}</div>
			<div class="text-muted" style="font-size:11px">${sub}</div></div>`;
		const rows = [...d.plots].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
		const html = `<div class="re-scheme-profile">
		<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between">
			<div style="flex:1 1 320px;min-width:0">
				<div class="text-muted" style="font-size:12px">${e(d.project.location || "")} · ${n(d.project.total_area_kanal)} kanal · ${d.blocks.length} blocks · ${n(total)} plots</div>
				<div style="display:flex;height:12px;border-radius:99px;overflow:hidden;margin:10px 0 6px;background:var(--gray-100)">
					${rows.map((r) => `<div title="${e(r.status)}: ${r.n}" style="width:${pct(r.n, total)}%;background:${TONE[r.status] || "#64748b"}"></div>`).join("")}
				</div>
				<div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px">
					${rows.map((r) => `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${TONE[r.status] || "#64748b"}"></span> ${e(r.status)} <b>${n(r.n)}</b></span>`).join("")}
				</div>
			</div>
			<div style="display:flex;gap:12px;flex-wrap:wrap">
				${ring(pct(sold, total), __("Sold"), `${n(sold)} / ${n(total)} plots`, "#6366f1")}
				${ring(coll, __("Collected"), cr(d.sales.paid), "#10b981")}
				${ring(d.development_pct, __("Development"), "", "#f59e0b")}
			</div>
		</div>
		<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
			${kpi(__("Net sales"), cr(d.sales.net_sales), `${n(d.sales.bookings)} bookings`, "#6366f1")}
			${kpi(__("Collected"), cr(d.sales.paid), `${coll.toFixed(0)}% of sales`, "#10b981")}
			${kpi(__("Outstanding"), cr(d.sales.outstanding), `Overdue ${cr(d.sales.overdue)} · ${n(d.sales.overdue_count)} bookings`, "#f59e0b")}
			${kpi(__("Unsold stock"), cr(avail.value), `${n(avail.n)} plots available`, "#3b82f6")}
		</div>
		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-top:18px">
			<div><div style="font-weight:600;margin-bottom:8px">${__("Block progress")}</div>
				${d.blocks.map((b) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px">
					<span><b>${e(b.block_name)}</b> <span class="text-muted">${e(b.block_type || "")}</span></span>
					<span class="text-muted">${n(b.sold)} sold · ${n(b.available)} available · <b>${pct(b.sold, b.plots).toFixed(0)}%</b></span></div>
					${bar(pct(b.sold, b.plots), b.color || "#3b82f6")}</div>`).join("")}
			</div>
			<div><div style="font-weight:600;margin-bottom:8px">${__("Development progress")}</div>
				${d.features.map((f) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px">
					<b>${e(f.category)}</b><span class="text-muted">${n(f.done)}/${n(f.n)} done · <b>${flt(f.pct).toFixed(0)}%</b></span></div>
					${bar(flt(f.pct), "#f59e0b")}</div>`).join("") || `<div class="text-muted">${__("No tracked infrastructure yet.")}</div>`}
				${d.works.map((w) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
					<a href="${frappe.utils.get_form_link("Project", w.name)}">${e(w.project_name)}</a><span class="text-muted">${e(w.status)} · <b>${flt(w.percent_complete).toFixed(0)}%</b></span></div>`).join("")}
			</div>
		</div></div>`;
		frm.dashboard.parent.find(".re-scheme-profile").closest(".form-dashboard-section").remove();
		frm.dashboard.add_section(html, __("Scheme profile"));
		frm.dashboard.show();
	});
}
