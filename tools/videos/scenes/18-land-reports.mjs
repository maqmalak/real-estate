// 18 — Land reports and documents: Land Purchase Status (client layout), owners' trial balance, the iqrar nama in Urdu.
export default async function (page, h) {
  await h.title("Land reports & documents", "The Land Purchase Status report in the client's layout, owners' balances against the ledger, and the agreement to sell in Urdu.");
  await h.go("/re/reports?r=Land%20Purchase%20Status", 5000);
  await h.say("Land Purchase Status: a section per deal with its owner lines, deal subtotals and grand totals — PDF on legal landscape, or Excel.", "Step 1 · Land Purchase Status");
  await h.focus(page.getByText("Net due").first(), 2400);
  await h.scroll(500);
  await h.say("Filters: dates, land for, single or multi owner, status, owners with balance only, matured but unpaid.");
  await h.scroll(-500, 600);
  await h.go("/re/reports?r=Land%20Owners%20Trial%20Balance", 4500);
  await h.say("Land owners' trial balance: opening, invoiced, paid, adjusted and closing per owner — checked against the Creditors - Land Owners account.", "Step 2 · Owners' balances");
  await h.focus(page.getByText(/Closing \(owners\)/).first(), 2400);
  const [deal] = await h.list("RE Land Deal", { land_owners_type: "MULTI", status: "Completed" }, ["name"], { order_by: "deal_date asc" });
  await h.go(`/re/d/re-land-deal/${encodeURIComponent(deal.name)}`, 4000);
  await h.hush();
  await h.click(h.button("Actions"), 900, false);
  await h.click(page.getByRole("menuitem", { name: /Letters|document/i }).first(), 1800, false);
  await h.click(h.dialog().getByRole("button", { name: /Land Purchase Agreement/ }).first(), 700, false);
  await h.click(h.dialog().getByRole("radio", { name: "اردو" }), 1000, false);
  await h.say("The agreement to sell (iqrar nama) in English or Urdu: every seller with CNIC, khasra and share, the schedule, and signature blocks.", "Step 3 · Iqrar nama");
  await h.click(h.dialog().getByRole("button", { name: /Generate/ }).last(), 4500, false);
  await h.hush(); await h.pause(800);
}
