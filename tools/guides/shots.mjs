// node shots.mjs shots.json outdir — light-theme screenshots of the React app for the guide books.
// shots.json: [{ id, path, wait?, click?, tab?, scroll?, clip?, open? }] — {placeholders} in paths are demo records.
import { chromium } from "../videos/node_modules/playwright/index.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const BASE = process.env.RE_BASE ?? "http://realestate.localhost:7176";
const [, , spec, out] = process.argv;
mkdirSync(out, { recursive: true });
const pwd = readFileSync(homedir() + "/.realestate-site-secrets", "utf8").split("\n").find((l) => l.startsWith("ADMIN_PASSWORD=")).slice(15).trim();
const shots = JSON.parse(readFileSync(spec, "utf8"));

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "light", locale: "en-GB" });
await ctx.addInitScript(() => { try { localStorage.setItem("micromax-theme", "light"); localStorage.setItem("theme", "light"); } catch { /* ignore */ } });
await ctx.request.post(`${BASE}/api/method/login`, { form: { usr: "Administrator", pwd } });

async function one(doctype, filters, order = "creation desc", field = "name") {
  const r = await ctx.request.get(`${BASE}/api/method/frappe.client.get_list`, {
    params: { doctype, filters: JSON.stringify(filters), fields: JSON.stringify([field]), order_by: order, limit_page_length: "1" } });
  const rows = (await r.json()).message ?? [];
  return rows[0]?.[field] ?? "";
}
const vars = {
  project: await one("RE Project", { is_demo: 1 }),
  deal: await one("RE Land Deal", { land_owners_type: "MULTI", status: "Completed" }, "deal_date asc"),
  deal_pay: await one("RE Land Deal", { status: "In Payment" }, "deal_date asc"),
  parcel: await one("RE Land Parcel", { stage: "Under Negotiation" }),
  parcel_acq: await one("RE Land Parcel", { stage: "Acquired" }, "khasra_nos asc"),
  owner: await one("RE Land Owner", { customer: ["is", "set"] }),
  payment: await one("RE Land Payment", { docstatus: 1, wht_amount: [">", 0] }),
  adjustment: await one("RE Plot Adjustment", { docstatus: 1 }),
  case: await one("RE Land Case", { status: "Under Hearing" }),
  booking: await one("RE Booking", { docstatus: 1, status: "Due" }),
  receipt: await one("RE Payment", { docstatus: 1, payment_against: "Booking" }),
  plot: await one("RE Plot", { status: "Available", block: "B Block" }, "plot_no asc"),
  customer: await one("Customer", { re_demo: 1, re_portal_user: ["is", "set"] }),
  bill: await one("RE Society Bill", { status: "Overdue" }),
  transfer: await one("RE Plot Transfer", { docstatus: 1 }),
};
const fill = (s) => s.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(vars[k] ?? ""));

const page = await ctx.newPage();
for (const s of shots) {
  try {
    await page.goto(BASE + fill(s.path), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(s.wait ?? 3500);
    if (s.tab) { await page.getByRole("tab", { name: new RegExp(`^${s.tab}`, "i") }).first().click().catch(() => {}); await page.waitForTimeout(1500); }
    if (s.click) { await page.getByText(s.click, { exact: false }).first().click().catch(() => {}); await page.waitForTimeout(2000); }
    if (s.open) { await page.locator("button", { hasText: s.open }).first().click().catch(() => {}); await page.waitForTimeout(2200); }
    if (s.scroll) { await page.getByText(s.scroll, { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(1000); }
    const file = `${out}/${s.id}.png`;
    if (s.clip) {
      const el = page.locator(s.clip.startsWith("text=") ? `section:has-text("${s.clip.slice(5)}")` : s.clip).last();
      await el.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file });
    }
    console.log("✓", s.id);
  } catch (e) {
    console.log("✗", s.id, String(e).slice(0, 120));
  }
}
await browser.close();
console.log(JSON.stringify(vars));
