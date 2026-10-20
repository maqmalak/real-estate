// 04 — Receive an installment: receipt against a booking, allocation oldest-due first, Payment Entry, receipt.
export default async function (page, h) {
  await h.title("Receiving a payment", "A receipt against a booking is allocated to installments oldest-due first and posts a Payment Entry.");
  const [b] = await h.list("RE Booking", { docstatus: 1, status: "Due", cancellation: ["is", "not set"] }, ["name", "customer", "customer_name", "next_due_amount", "plot"], { order_by: "modified desc" });
  await h.go(`/re/d/re-booking/${encodeURIComponent(b.name)}`, 3000);
  await h.say(`${b.customer_name} — plot ${b.plot}. Next installment due: Rs ${Math.round(b.next_due_amount).toLocaleString()}.`, "Step 1 · The booking");
  await h.go(`/re/d/re-payment/new?payment_against=Booking&booking=${encodeURIComponent(b.name)}&customer=${encodeURIComponent(b.customer)}&amount=${Math.round(b.next_due_amount)}&mode_of_payment=Bank%20Transfer`, 3000);
  await h.say("New receipt: against the booking, by bank transfer, with the amount received.", "Step 2 · Receipt");
  await h.type(page.getByPlaceholder(/Reference/i).first(), "HBL-778341", 600).catch(() => {});
  await h.click(h.button("Save"), 2500);
  const name = await h.savedName("/re/d/re-payment/");
  await h.click(page.getByRole("button", { name: /^Submit$/ }).first(), 1200);
  await h.click(h.button("Submit", h.dialog()), 4500);
  await h.say(`${name} submitted: allocated to the oldest unpaid installment first, and a Payment Entry posted against the Sales Invoice.`, "Step 3 · Allocation");
  await h.scroll(600); await h.scroll(500);
  const ledger = page.getByRole("tab", { name: /Ledger/ }).first();
  if (await ledger.count()) { await h.click(ledger, 2500); await h.say("Ledger: bank debited, customer credited — the general ledger stays balanced."); }
  await h.go("/re/d/re-payment", 3000);
  await h.say("All receipts with collection insights; installment reminders and overdue notices go out automatically.", "Collections");
  await h.hush(); await h.pause(600);
}
