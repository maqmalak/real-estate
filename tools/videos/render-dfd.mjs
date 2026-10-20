// Renders the FSD's Mermaid DFDs to PNG (for the PowerPoint deck and the PDF).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../../docs/FSD.html", import.meta.url), "utf8");
const blocks = [...html.matchAll(/<pre class="mermaid">([\s\S]*?)<\/pre>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
const out = new URL("../../docs/fsd-assets/", import.meta.url).pathname;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 2200, height: 1400 }, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0;background:#fff;font-family:Arial"><div id="d"></div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script></body></html>`);
await page.waitForFunction(() => window.mermaid);
for (const [i, code] of blocks.entries()) {
  await page.evaluate(async ([c, n]) => {
    mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: {
      primaryColor: "#e2f1ee", primaryBorderColor: "#0f766e", primaryTextColor: "#14201e", lineColor: "#51625f",
      secondaryColor: "#f6f8f7", tertiaryColor: "#ffffff", fontFamily: "Arial", fontSize: "15px" }, flowchart: { curve: "basis", padding: 14 } });
    const { svg } = await mermaid.render(`dfd${n}`, c);
    document.getElementById("d").innerHTML = svg;
  }, [code, i]);
  const el = page.locator("#d svg");
  await el.screenshot({ path: `${out}dfd-level-${i}.png`, omitBackground: false });
  console.log("rendered", `dfd-level-${i}.png`);
}
await browser.close();
