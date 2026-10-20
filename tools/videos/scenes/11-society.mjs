// 11 — Society billing and bulk collection.
export default async function (page, h) {
  await h.title("Society billing", "Charge heads, monthly bills with arrears, collection insights and bulk collection.");
  await h.go("/re/d/re-charge-head", 3500);
  await h.say("Charge heads — fixed, per marla or by plot size — and what each plot size pays per month.", "Charge heads");
  await h.go("/re/d/re-society-bill", 4000);
  await h.say("Monthly bills on the 1st, due in 15 days, with arrears carried forward. Billed vs collected, ageing and the owners furthest behind.", "Bills");
  await h.scroll(800); await h.scroll(800); await h.scroll(700);
  await h.go("/re/society/collect", 3000);
  await h.say("Bulk collection: tick owners and record many payments in one go.", "Bulk collection");
  const boxes = page.locator("tbody input[type=checkbox]");
  await h.click(boxes.nth(0), 500); await h.click(boxes.nth(1), 500); await h.click(boxes.nth(2), 1200);
  await h.click(page.getByRole("button", { name: /Collect|Record|Receive/ }).last(), 4000);
  await h.say("Receipts posted against each bill; owners get their receipt on WhatsApp.");
  await h.hush(); await h.pause(800);
}
