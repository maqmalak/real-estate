// 17 — Paying land owners: sellers & balances, a seller payment with withholding tax posted as a Payment Entry, plots instead of cash.
export default async function (page, h) {
  await h.title("Seller payments", "Land owners are ERPNext suppliers: invoices on approval, Payment Entries for payments, plots instead of cash — all from the ledger.");
  await h.go("/re/land/payments", 4500);
  await h.say("Sellers & Payments: every land owner's net due, paid in cash, settled with plots and balance — read from their supplier ledger.", "Step 1 · Sellers");
  await h.focus(page.getByText("Payables aging").first(), 2600, 1.4);
  await h.say("The aging shows what is owed by days past the mature date — and confirms the deals equal the Creditors - Land Owners account.");
  // a seller with a balance on an approved deal
  const deals = await h.list("RE Land Deal", { workflow_state: "Approved", status: "In Payment" }, ["name"], { order_by: "deal_date asc" });
  let deal, line;
  for (const d of deals) {
    const doc = await h.call("frappe.client.get", { doctype: "RE Land Deal", name: d.name }, false);
    line = doc.lines.find((l) => l.status !== "Cancelled" && l.balance > 800000);
    if (line) { deal = doc; break; }
  }
  const today = new Date().toISOString().slice(0, 10);
  await h.go(`/re/d/re-land-payment/new?deal=${encodeURIComponent(deal.name)}&ser=${line.ser}&payment_kind=Installment&mode_of_payment=Cheque`
    + `&instrument_no=CHQ-778812&instrument_date=${today}&bank_name=${encodeURIComponent("HBL Raiwind Road")}&amount=500000&wht_rate=1&received_by_seller=1`, 4000);
  await h.say(`Paying ${line.owner_name} Rs 500,000 by cheque against deal ${deal.name}, with 1% withholding tax.`, "Step 2 · Record the payment");
  await h.click(h.button("Save"), 2500);
  const name = await h.savedName("/re/d/re-land-payment/");
  await h.say(`${name}: up to Rs 5,000,000 it is paid directly; above that it goes to Admin / Accounts for approval.`);
  await h.focus(page.getByText("Net to owner").first(), 2400);
  await h.click(h.button("Actions"), 900, false);
  await h.click(page.getByRole("menuitem", { name: /^Pay$/ }).first(), 3500);
  await h.say("Paid: a Payment Entry against the owner's invoices; the tax goes to Withholding Tax Payable and prints on the receipt.", "Step 3 · Posted");
  await h.go(`/re/d/re-land-deal/${encodeURIComponent(deal.name)}`, 4000);
  await h.say("The deal's Paid and Balance update straight from the ledger.");
  await h.focus(page.getByText("Balance").first(), 2400);
  const [adj] = await h.list("RE Plot Adjustment", { docstatus: 1 }, ["name"]);
  if (adj) {
    await h.go(`/re/d/re-plot-adjustment/${encodeURIComponent(adj.name)}`, 4000);
    await h.say("Plots instead of cash: each plot is booked to the owner and netted against their land payable by a Journal Entry — no cash moves.", "Step 4 · Plots in lieu");
    await h.focus(page.getByText("Adjusted against land").first(), 2600);
  }
  await h.hush(); await h.pause(800);
}
