// 03 — Book a plot: pick an available plot on the plots page, book it for a customer, submit, see the schedule and the
// Sales Invoice, generate the allotment letter in Urdu.
export default async function (page, h) {
  await h.title("Booking a plot", "From an available plot to a submitted booking with its installment schedule, Sales Invoice and allotment letter.");
  const today = new Date().toISOString().slice(0, 10);
  const [plot] = await h.list("RE Plot", { status: "Available", merged_into: ["is", "not set"], block: "B Block" }, ["name", "list_price", "plot_size", "block"], { order_by: "plot_no asc" });
  const [cust] = await h.list("Customer", { re_demo: 1, re_cnic: ["is", "set"] }, ["name", "customer_name", "mobile_no", "account_manager"], { order_by: "modified desc" });

  await h.go(`/re/plots/${encodeURIComponent(plot.name)}`, 3000);
  await h.say(`Plot ${plot.name} — ${plot.plot_size}, ${plot.block} — is available. The plot panel shows its price, position and history.`, "Step 1 · Choose a plot");
  await h.go(`/re/d/re-booking/new?customer=${encodeURIComponent(cust.name)}&mobile_no=${encodeURIComponent(cust.mobile_no ?? "")}`
    + `&payment_plan=${encodeURIComponent("2 Years Monthly")}&booking_date=${today}&agent=${encodeURIComponent(cust.account_manager ?? "")}`, 3500);
  await h.say(`New booking for ${cust.customer_name}. Pick the plot — the list shows only plots you can book, with their status.`, "Step 2 · Booking form");
  await h.pickLink("Plot", plot.name);
  await h.say("Picking the plot fills block, size and the list price; the payment plan sets the schedule.");
  await h.scroll(500);
  await h.say("A discount above 5% would wait for a Sales Manager's approval. The buyer's CNIC and nominee come from the customer record.");
  await h.scroll(-500, 600);
  await h.click(h.button("Save"), 2500);
  const name = await h.savedName("/re/d/re-booking/");
  await h.say(`Saved as ${name} (draft). Submitting it creates the schedule and the Sales Invoice.`, "Step 3 · Submit");
  await h.click(page.getByRole("button", { name: /^Submit$/ }).first(), 1200);
  await h.click(h.button("Submit", h.dialog()), 4500);
  await h.say("Submitted: the plot is now Booked, the installments are scheduled and the Sales Invoice carries the same payment schedule.");
  await h.scroll(600);
  await h.scroll(600);
  const tabs = ["Installments", "Schedule", "Ledger"];
  for (const t of tabs) {
    const tab = page.getByRole("tab", { name: new RegExp(t, "i") }).first();
    if (await tab.count()) { await h.click(tab, 2500); await h.say(t === "Ledger" ? "Ledger: the GL entries the invoice posted." : "The installment schedule always totals the net price."); }
  }
  await h.scroll(-2000, 800);
  await h.hush();
  await h.click(h.button("Actions"), 900);
  const gen = page.getByRole("menuitem", { name: /Letters|document/i }).first();
  await h.click(gen, 1800);
  await h.click(h.dialog().getByRole("button", { name: /Allotment Letter/ }).first(), 700);
  await h.click(h.dialog().getByRole("radio", { name: "اردو" }), 1000);
  await h.say("Documents are generated on the letterhead in English or Urdu — here the allotment letter in Urdu.", "Step 4 · Allotment letter");
  await h.click(h.dialog().getByRole("button", { name: /Generate/ }).last(), 4000);
  await h.hush();
  await h.pause(800);
}
