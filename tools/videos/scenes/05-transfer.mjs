// 05 — Plot transfer: wizard with no-dues check, new owner, approval, accounting.
export default async function (page, h) {
  await h.title("Transferring a plot", "No-dues check, new owner, transfer fee — then the Sales Manager approves and the invoices move.");
  const cands = await h.list("RE Booking", { docstatus: 1, status: ["in", ["Due", "Paid"]], overdue_amount: 0, cancellation: ["is", "not set"] }, ["name", "plot", "customer_name"], { order_by: "modified desc" });
  let pick = null;
  for (const c of cands) { const p = await h.call("realestate.operations.transfer_preview", { booking: c.name }, false); if (p.clear) { pick = c; break; } }
  if (!pick) throw new Error("no booking passes the no-dues check");
  await h.go(`/re/operations?tab=transfers&wizard=transfer&booking=${encodeURIComponent(pick.name)}`, 3500);
  await h.say(`Transfer of plot ${pick.plot} from ${pick.customer_name}: the wizard checks for overdue installments and society dues first.`, "Step 1 · No-dues check");
  await h.click(h.button("Continue", h.dialog()), 1500);
  await h.type(h.dialog().locator("input").first(), "a", 1500);
  await h.say("Choose the new owner.", "Step 2 · New owner");
  await h.click(h.dialog().locator("button").filter({ hasText: /\+92|[A-Z][a-z]+ [A-Z]/ }).nth(1), 1500);
  await h.type(h.dialog().locator("#t-notes"), "Sold to a relative", 600);
  await h.say("Review: transfer fee Rs 50,000 and the balance the new owner takes over.", "Step 3 · Review");
  await h.click(h.button("Submit for approval", h.dialog()), 3000);
  const [t] = await h.list("RE Plot Transfer", { workflow_state: "Pending Approval" }, ["name"], { order_by: "creation desc" });
  await h.go("/re/operations?tab=approvals", 3000);
  await h.say(`${t.name} waits in the approvals inbox for a Sales Manager.`, "Step 4 · Approval");
  const card = page.locator("div.rounded-2xl, div[class*='card']").filter({ hasText: t.name }).first();
  await h.click(card.getByRole("button", { name: /Approve/ }), 4000);
  await h.say("Approved: fee invoice to the seller, credit note for the balance, a new invoice with the remaining installments for the buyer, and a transfer letter.");
  await h.go("/re/operations?tab=transfers", 3000);
  await h.hush(); await h.pause(800);
}
