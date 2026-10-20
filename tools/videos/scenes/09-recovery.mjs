// 09 — Recovery: overdue, surcharges, dunning and a surcharge waiver.
export default async function (page, h) {
  await h.title("Recovery & late-payment surcharges", "Overdue bookings, monthly surcharges, dunning notices and waivers with approval.");
  await h.go("/re/operations?tab=recovery", 3500);
  await h.say("Recovery notices are ERPNext Dunnings; they resolve automatically when the customer pays.", "Recovery");
  await h.say("Surcharge: 2% a month of the overdue amount after 15 days' grace, minimum Rs 500, capped at 10%.");
  await h.click(h.button("Waive"), 2000);
  await h.type(h.dialog().locator("#w-reason"), "Medical emergency in the family; first delay", 700);
  await h.say("A waiver needs a reason and approval; it posts a Credit Note against the surcharge invoice.", "Waiver");
  await h.click(h.button("Submit for approval", h.dialog()), 3000);
  const [w] = await h.list("RE Surcharge Waiver", { workflow_state: "Pending Approval" }, ["name"], { order_by: "creation desc" });
  await h.go("/re/operations?tab=approvals", 3000);
  await h.click(page.locator("div").filter({ hasText: w.name }).getByRole("button", { name: /Approve/ }).first(), 4500);
  await h.go("/re/reports?r=Receivables%20Aging", 4000);
  await h.say("Receivables ageing shows who is late and by how much.", "Report");
  await h.hush(); await h.pause(800);
}
