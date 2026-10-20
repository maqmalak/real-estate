// 10 — Agent and dealer commissions: accrued, payable, paid with a voucher.
export default async function (page, h) {
  await h.title("Commissions", "Agent 1% and dealer 2% accrue at booking, become payable after 25% is collected, and are paid with a voucher.");
  await h.go("/re/operations?tab=commissions", 3500);
  await h.say("By agent and dealer: paid, payable and accrued.", "Commissions");
  const boxes = page.locator("table tbody input[type=checkbox]");
  await h.click(boxes.nth(0), 500); await h.click(boxes.nth(1), 800);
  await h.type(page.getByPlaceholder("Ref / cheque no."), "CHQ-552190", 600);
  await h.say("Select payable commissions, choose the date, mode and reference, then pay.", "Pay");
  await h.click(page.getByRole("button", { name: /Pay \d+ & print/ }), 4500);
  await h.say("Paid by Payment Entry against each party's payable, and a commission voucher printed for each.");
  await h.go("/re/d/re-commission", 3000);
  await h.hush(); await h.pause(800);
}
