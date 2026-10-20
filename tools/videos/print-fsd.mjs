// Print docs/FSD.html to docs/fsd/Zarmeen-Gardens-FSD-document.pdf: diagrams as PNGs, videos as posters, no TOC rail, light theme.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const DOCS = new URL("../../docs/", import.meta.url).pathname;
let html = readFileSync(DOCS + "FSD.html", "utf8");
html = html.replace(/<script[\s\S]*?<\/script>/g, "");
const fig = (f, alt) => `<figure class="pfig"><img src="fsd-assets/${f}" alt="${alt}"></figure>`;
const dfds = [
  fig("dfd-level-0.png", "DFD Level 0"),
  ["dfd-1a-sell.png", "dfd-1a-collect.png", "dfd-1a-postsale.png", "dfd-1b-society.png", "dfd-1c-setup-docs.png"].map((f) => fig(f, "DFD Level 1 part")).join(""),
];
let i = 0;
html = html.replace(/<div class="dfd"><pre class="mermaid">[\s\S]*?<\/pre><\/div>/g, () => dfds[i++] ?? "");
html = html.replace(/<video[^>]*src="videos\/([0-9a-z-]+)\.webm"><\/video>/g, `<img class="poster" src="fsd-assets/posters/$1.png" alt="video $1">`);
html = html.replace("<html", '<html data-theme="light"').replace("</style>", `</style><style>
  nav.toc{display:none!important} .wrap{display:block!important;max-width:none!important;padding:0!important}
  .pfig{margin:14px 0;break-inside:avoid} .pfig img{width:100%;height:auto;border:1px solid #d5e5e1;border-radius:8px}
  .poster{width:100%;border-radius:8px;border:1px solid #d5e5e1} .vid{break-inside:avoid}
  h2{break-before:auto;break-after:avoid} table,tr,pre{break-inside:avoid} pre,.formula{white-space:pre-wrap!important;overflow:visible!important;break-inside:avoid}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style>`);
const tmp = DOCS + "_print.html";
writeFileSync(tmp, html);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ colorScheme: "light" });
await page.goto("file://" + tmp, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: DOCS + "fsd/Zarmeen-Gardens-FSD-document.pdf", format: "A4", printBackground: true,
  margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" }, displayHeaderFooter: true,
  headerTemplate: `<div style="font:8px Arial;color:#51625f;width:100%;padding:0 14mm">Zarmeen Gardens · Functional Specification v1.0</div>`,
  footerTemplate: `<div style="font:8px Arial;color:#51625f;width:100%;padding:0 14mm;text-align:right"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
});
await browser.close();
unlinkSync(tmp);
console.log("wrote fsd/Zarmeen-Gardens-FSD-document.pdf");
