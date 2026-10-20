// 07 — Re-allot a plot released by a cancellation.
export default async function (page, h) {
  await h.title("Re-allotting a released plot", "A plot freed by an approved cancellation goes to a waiting buyer with its own schedule.");
  await h.go("/re/operations?tab=reallotments", 3000);
  await h.say("Plots released by approved cancellations can be re-allotted.", "Step 1 · Released plots");
  await h.click(h.button("Re-allot a released plot"), 2500);
  await h.type(h.dialog().locator("#ra-search"), "a", 1500);
  const opts = await h.dialog().locator("#ra-cust option").count();
  if (opts > 1) await h.dialog().locator("#ra-cust").selectOption({ index: 1 });
  await h.pause(900);
  await h.say("Pick the new allottee, price, discount, re-allotment fee (Rs 25,000) and payment plan.", "Step 2 · New allottee");
  await h.click(h.button("Send for approval", h.dialog()), 3000);
  const [r] = await h.list("RE Re-allotment", { workflow_state: "Pending Approval" }, ["name"], { order_by: "creation desc" });
  await h.go("/re/operations?tab=approvals", 3000);
  await h.click(page.locator("div").filter({ hasText: r.name }).getByRole("button", { name: /Approve/ }).first(), 5000);
  await h.say("Approved: a new booking with its schedule and Sales Invoice, and the fee invoiced.", "Step 3 · Approved");
  await h.go("/re/operations?tab=reallotments", 3000);
  await h.hush(); await h.pause(800);
}
