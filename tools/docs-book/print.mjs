// node print.mjs in.html out.pdf — A4 PDF of a local HTML page (system Chrome via the video tooling's Playwright)
import { chromium } from "../videos/node_modules/playwright/index.mjs";
const [, , src, out] = process.argv;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("file://" + src, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
await browser.close();
