frappe.ui.form.on("RE Block", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Plots"), () => frappe.set_route("List", "RE Plot", { block: frm.doc.name }));
		frm.add_custom_button(__("Site Map"), () => frappe.set_route("re-site-map"));
		re_block_profile(frm);
	},
});

// Block profile (same data as the React block page): sold / collected / society-bill rings, KPIs, sizes, streets, premium plots, overdue.
function re_block_profile(frm) {
	// form scripts share one scope with other desk scripts — keep these local
	const SOLD = ["Booked", "Sold", "Possession Given"];
	const TONE = { Available: "#10b981", Hold: "#f97316", Reserved: "#f59e0b", Booked: "#3b82f6", Sold: "#6366f1", "Possession Given": "#8b5cf6", Blocked: "#64748b" };
	const ORDER = Object.keys(TONE);
	frappe.call({ method: "realestate.spa.block_profile", args: { block: frm.doc.name }, type: "GET" }).then(({ message: d }) => {
		if (!d) return;
		const e = frappe.utils.escape_html;
		const n = (v) => format_number(v || 0, null, 0);
		const cr = (v) => {
			v = flt(v);
			return v >= 1e7 ? `Rs ${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `Rs ${(v / 1e5).toFixed(1)} Lac` : format_currency(v, "PKR", 0);
		};
		const pct = (a, b) => (b > 0 ? (flt(a) * 100) / flt(b) : 0);
		const color = d.block.color || "#3b82f6";
		const total = d.plots.reduce((a, r) => a + r.n, 0);
		const sold = d.plots.filter((r) => SOLD.includes(r.status)).reduce((a, r) => a + r.n, 0);
		const avail = d.plots.find((r) => r.status === "Available") || { n: 0, value: 0 };
		const coll = pct(d.sales.paid, d.sales.net_sales);
		const bills = d.bills.n ? pct(d.bills.paid, flt(d.bills.paid) + flt(d.bills.outstanding)) : null;
		const ring = (v, label, sub, c) => {
			const len = 2 * Math.PI * 42, x = Math.max(0, Math.min(v == null ? 0 : v, 100));
			return `<div style="text-align:center;min-width:110px">
				<svg viewBox="0 0 100 100" width="96" height="96" style="transform:rotate(-90deg)">
					<circle cx="50" cy="50" r="42" fill="none" stroke="var(--gray-200)" stroke-width="9"/>
					${x > 0 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(x / 100) * len} ${len}"/>` : ""}
				</svg>
				<div style="margin-top:-62px;height:30px;font-size:20px;font-weight:700;color:${c}">${v == null ? "—" : x.toFixed(0) + "%"}</div>
				<div style="margin-top:32px;font-weight:600;font-size:12px">${label}</div>
				<div class="text-muted" style="font-size:11px">${sub}</div></div>`;
		};
		const bar = (v, c) => `<div style="height:8px;border-radius:99px;background:var(--gray-100);overflow:hidden">
			<div style="height:100%;width:${Math.max(0, Math.min(v, 100))}%;background:${c};border-radius:99px"></div></div>`;
		const kpi = (label, value, sub, c) => `<div style="flex:1 1 180px;border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;border-top:3px solid ${c}">
			<div class="text-muted" style="font-size:12px">${label}</div><div style="font-size:20px;font-weight:700">${value}</div>
			<div class="text-muted" style="font-size:11px">${sub}</div></div>`;
		const line = (label, right, v, c) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px">
			<b>${e(label)}</b><span class="text-muted">${right}</span></div>${bar(v, c)}</div>`;
		const rows = [...d.plots].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
		const p = d.premium;
		const html = `<div class="re-block-profile" style="border-left:4px solid ${color};padding-left:14px">
		<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between">
			<div style="flex:1 1 320px;min-width:0">
				<div class="text-muted" style="font-size:12px">${e(d.block.project || "")} · ${e(d.block.block_type || "")} · ${n(d.block.area_kanal)} kanal · ${n(total)} plots${d.block.planned_plots ? ` / ${n(d.block.planned_plots)} planned` : ""}</div>
				<div style="display:flex;height:12px;border-radius:99px;overflow:hidden;margin:10px 0 6px;background:var(--gray-100)">
					${rows.map((r) => `<div title="${e(r.status)}: ${r.n}" style="width:${pct(r.n, total)}%;background:${TONE[r.status] || "#64748b"}"></div>`).join("")}
				</div>
				<div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px">
					${rows.map((r) => `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${TONE[r.status] || "#64748b"}"></span> ${e(r.status)} <b>${n(r.n)}</b></span>`).join("")}
				</div>
			</div>
			<div style="display:flex;gap:12px;flex-wrap:wrap">
				${ring(pct(sold, total), __("Sold"), `${n(sold)} / ${n(total)} plots`, color)}
				${ring(coll, __("Collected"), cr(d.sales.paid), "#10b981")}
				${ring(bills, __("Society bills"), d.bills.n ? `${n(d.bills.n)} bills` : __("none yet"), "#f59e0b")}
			</div>
		</div>
		<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
			${kpi(__("Net sales"), cr(d.sales.net_sales), `${n(d.sales.bookings)} bookings`, "#6366f1")}
			${kpi(__("Collected"), cr(d.sales.paid), `${coll.toFixed(0)}% of sales`, "#10b981")}
			${kpi(__("Outstanding"), cr(d.sales.outstanding), `Overdue ${cr(d.sales.overdue)} · ${n(d.sales.overdue_count)} bookings`, "#f59e0b")}
			${kpi(__("Unsold stock"), cr(avail.value), p.min_price ? `${cr(p.min_price)} – ${cr(p.max_price)} per plot` : `${n(avail.n)} available`, "#3b82f6")}
		</div>
		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-top:18px">
			<div><div style="font-weight:600;margin-bottom:8px">${__("Plot sizes")}</div>
				${d.sizes.map((z) => line(z.plot_size, `${n(z.sold)}/${n(z.n)} sold · ${n(z.available)} left · ${cr(z.avg_price)}`, pct(z.sold, z.n), color)).join("")}
				<div style="font-weight:600;margin:12px 0 8px">${__("Streets")}</div>
				${d.streets.map((s) => line(s.street, `${n(s.sold)}/${n(s.n)} · <b>${pct(s.sold, s.n).toFixed(0)}%</b>`, pct(s.sold, s.n), color)).join("")}
			</div>
			<div><div style="font-weight:600;margin-bottom:8px">${__("Premium plots")}</div>
				${line(__("Corner"), `${n(p.corner_sold)}/${n(p.corner)} sold`, pct(p.corner_sold, p.corner), "#8b5cf6")}
				${line(__("Park facing"), `${n(p.park_sold)}/${n(p.park)} sold`, pct(p.park_sold, p.park), "#10b981")}
				${line(__("Boulevard facing"), `${n(p.boulevard_sold)}/${n(p.boulevard)} sold`, pct(p.boulevard_sold, p.boulevard), "#0ea5e9")}
				<div style="font-weight:600;margin:12px 0 6px">${__("Largest overdue")}</div>
				${d.overdue.map((o) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
					<a href="${frappe.utils.get_form_link("RE Booking", o.name)}">${e(o.customer_name)} · ${e(o.plot)}</a><b style="color:#e11d48">${cr(o.overdue_amount)}</b></div>`).join("") || `<div class="text-muted" style="font-size:12px">${__("Nothing overdue.")}</div>`}
				<div class="text-muted" style="font-size:12px;margin-top:10px">${__("Society bills")}: ${n(d.bills.n)} · ${__("outstanding")} ${cr(d.bills.outstanding)} · ${n(d.bills.overdue)} ${__("overdue")}
					· ${__("open maintenance")}: ${n(d.tasks.reduce((a, r) => a + r.n, 0))}</div>
			</div>
		</div></div>`;
		frm.dashboard.parent.find(".re-block-profile").closest(".form-dashboard-section").remove();
		frm.dashboard.add_section(html, __("Block profile"));
		frm.dashboard.show();
	});
}
