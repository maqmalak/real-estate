// 13 — Development cost, procurement, stock and assets.
export default async function (page, h) {
  await h.title("Development, stock & assets", "Budgets per cost head, procurement into the site store, material issues, and fixed assets with depreciation.");
  await h.go("/re/development", 4000);
  await h.say("Development: budget vs actual per cost head, spend by month and the purchase pipeline.", "Development");
  await h.scroll(800); await h.scroll(800);
  await h.go("/import/material-requests", 3000);
  await h.say("Material Request → Purchase Order → Purchase Receipt into the site store → Purchase Invoice.", "Procurement");
  await h.go("/inventory/stock-entries", 3000);
  await h.say("Material issued to a cost head with a Stock Entry charges its account and project.", "Stock");
  await h.go("/re/assets", 4000);
  await h.say("Fixed assets: land, buildings, transformers, generators and machinery — value, map links and straight-line depreciation.", "Assets");
  await h.scroll(900);
  await h.hush(); await h.pause(800);
}
