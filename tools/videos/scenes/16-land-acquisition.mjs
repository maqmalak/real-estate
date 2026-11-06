// 16 — Land acquisition (Module 0): land bank, khasras on the map, the pipeline, a khasra's owners and due diligence, a deal.
export default async function (page, h) {
  await h.title("Land acquisition", "Khasras bought from their co-owners before anything is plotted: land bank, map, pipeline, due diligence and the deal (iqrar nama).");
  await h.go("/re/land", 5000);
  await h.say("Land Overview: the project's land is fully acquired; Phase 2 khasras are still moving through the pipeline.", "Step 1 · Land bank");
  await h.focus(page.getByText("Kanal acquired / targeted").first(), 2600);
  await h.focus(page.getByText("Paid to sellers").first(), 2200);
  await h.say("On the map every khasra is coloured by stage; the acquired khasras are exactly the project boundary (dashed red).");
  await h.focus(page.locator("section", { hasText: "Khasras by acquisition stage" }).first(), 3000, 1.25);
  await h.scrollTo(page.getByText("Acquisition pipeline").first(), 1200);
  await h.say("The pipeline board: drag a khasra to its next stage. The agreement stages need the due diligence checks first.", "Step 2 · Pipeline");
  const card = page.locator("button", { hasText: "Khasra" }).filter({ hasText: /checks/ }).first();
  await h.click((await card.count()) ? card : page.locator("button", { hasText: "Khasra" }).first(), 2500);
  await h.say("The khasra panel: revenue record, co-owners and their shares per fard, deals and payments, papers and history.", "Step 3 · A khasra");
  await h.click(page.getByRole("button", { name: /Due diligence/ }).first(), 2200);
  await h.say("Nine checks — fard, mutations, demarcation, encumbrance, litigation, CNICs, legal opinion. Seven are required.");
  await h.click(page.getByRole("button", { name: /Deals & payments/ }).first(), 2200);
  await h.click(page.getByRole("button", { name: "Close" }).first(), 1200, false);
  await h.go("/re/land/legal", 4000);
  await h.say("Due Diligence & Cases: every khasra against every check, the court cases with the next hearing, and the land papers.", "Step 4 · Diligence & courts");
  await h.focus(page.getByText("Due diligence matrix").first(), 2600, 1.4);
  const [deal] = await h.list("RE Land Deal", { land_owners_type: "MULTI", status: "Completed" }, ["name"], { order_by: "deal_date asc" });
  await h.go(`/re/d/re-land-deal/${encodeURIComponent(deal.name)}`, 4000);
  await h.say(`Deal ${deal.name}: the client's deal sheet and the agreement to sell in one — owner lines with Kanal, Marla, rate per Acre / Kanal / Marla, due, extra, paid and balance.`, "Step 5 · The deal");
  await h.scrollTo(page.getByText("Owner lines").first(), 1500);
  await h.focus(page.getByText("Owner lines").first(), 2800, 1.35);
  await h.scrollTo(page.getByText("Deal subtotals").first(), 1200);
  await h.say("Deal subtotals add raw Kanals and Marlas, then normalise the total area (272 sqft per Marla).");
  await h.focus(page.getByText("Total deal area").first(), 2400);
  for (const t of ["Contract", "Schedule"]) {
    const tab = page.getByRole("tab", { name: new RegExp(`^${t}`) }).first();
    if (await tab.count()) { await h.click(tab, 2400, false); await h.say(t === "Contract" ? "Contract terms, witnesses and stamp paper; transfer costs are estimated from the rate table and posted into the land cost." : "Each seller's schedule: token, agreement amount, installments and the final payment at registry."); }
  }
  await h.hush(); await h.pause(800);
}
