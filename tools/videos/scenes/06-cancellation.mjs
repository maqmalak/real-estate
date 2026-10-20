// 06 — Booking cancellation with deduction and refund.
export default async function (page, h) {
  await h.title("Cancelling a booking", "Deduction, refund, credit notes and the plot released — after approval.");
  const [b] = await h.list("RE Booking", { docstatus: 1, status: "Due", cancellation: ["is", "not set"], paid_amount: [">", 0] }, ["name", "plot", "customer_name"], { order_by: "booking_date asc" });
  await h.go(`/re/operations?tab=cancellations&wizard=cancel&booking=${encodeURIComponent(b.name)}`, 3500);
  await h.say(`Cancel plot ${b.plot} (${b.customer_name}): 10% of the price is kept — never more than was paid — and the rest is refunded.`, "Step 1 · Settlement");
  await h.click(h.dialog().locator("#c-reason"), 400);
  await h.dialog().locator("#c-reason").selectOption("Customer Request");
  await h.pause(1200);
  await h.click(h.button("Submit for approval", h.dialog()), 3000);
  const [c] = await h.list("RE Booking Cancellation", { workflow_state: "Pending Approval" }, ["name"], { order_by: "creation desc" });
  await h.go("/re/operations?tab=approvals", 3000);
  await h.say(`${c.name} waits for approval.`, "Step 2 · Approval");
  await h.click(page.locator("div").filter({ hasText: c.name }).getByRole("button", { name: /Approve/ }).first(), 5000);
  await h.say("Approved: credit notes clear the balance, the refund is paid by Payment Entry, the plot becomes available and unpaid commissions are cancelled.");
  await h.go("/re/operations?tab=cancellations", 3000);
  await h.hush(); await h.pause(800);
}
