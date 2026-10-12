// Live schedule preview on a sample price, recalculated as the plan changes.
const RE_PLAN_FIELDS = ["installments", "frequency", "booking_percent", "down_payment_percent", "down_payment_days", "balloon_frequency",
	"balloon_percent", "development_percent", "development_due_month", "possession_percent"];

frappe.ui.form.on("RE Payment Plan", {
	refresh(frm) { re_plan_preview(frm); },
	...Object.fromEntries(RE_PLAN_FIELDS.map((f) => [f, (frm) => re_plan_preview(frm)])),
});

function re_plan_preview(frm) {
	clearTimeout(frm._re_preview);
	frm._re_preview = setTimeout(async () => {
		const price = 10000000;
		try {
			const { message: r } = await frappe.call({ method: "realestate.real_estate.doctype.re_payment_plan.re_payment_plan.preview",
				args: { plan: JSON.stringify(frm.doc), price }, freeze: false });
			const rows = r.rows.map((x) => `<tr><td>${frappe.utils.escape_html(x.label)}</td><td>${frappe.datetime.str_to_user(x.due_date)}</td>
				<td class="text-right">${format_currency(x.amount, "PKR", 0)}</td></tr>`).join("");
			frm.get_field("preview_html").$wrapper.html(`<p class="text-muted small">On a sample price of ${format_currency(price, "PKR", 0)} booked today —
				${r.count} payments, total ${format_currency(r.total, "PKR", 0)}</p>
				<div style="max-height:360px;overflow:auto"><table class="table table-sm table-bordered"><thead><tr><th>Payment</th><th>Due</th>
				<th class="text-right">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`);
		} catch (e) {
			frm.get_field("preview_html").$wrapper.html(`<p class="text-danger small">${__("Fix the plan to see a preview")}</p>`);
		}
	}, 300);
}
