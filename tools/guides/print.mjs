// node print.mjs in.html out.pdf [portrait|landscape] — A4 PDF of a local HTML page (system Chrome via the video tooling's Playwright)
import { chromium } from "../videos/node_modules/playwright/index.mjs";
const [, , src, out, orientation = "portrait"] = process.argv;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ colorScheme: "light" });
await page.goto("file://" + src, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// landscape books draw their own frame (no margins); portrait guides use their CSS @page margins
await page.pdf({ path: out, format: "A4", landscape: orientation === "landscape", printBackground: true, preferCSSPageSize: true,
  ...(orientation === "landscape" ? { margin: { top: "0", bottom: "0", left: "0", right: "0" } } : {}) });
await browser.close();
