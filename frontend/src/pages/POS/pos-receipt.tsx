/**
 * Thermal printing for the POS terminal: 80 mm / 58 mm receipts, reprints (DUPLICATE), payment receipts and X / Z
 * shift reports. Rendered as a small HTML document in a hidden iframe and sent to the browser's print dialog — pick the
 * receipt printer once (Chrome remembers it; kiosk mode `--kiosk-printing` prints silently).
 */
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CompanyHeader, ReceiptData } from "./pos-offline";

export interface PrinterSettings {
  paper: "80" | "58" | "a4"; autoPrint: boolean; copies: number; fontSize: number; showItemCode: boolean;
  header: string; footer: string; printZOnClose: boolean;
  /** Small print at the very bottom, e.g. the exchange / return policy. */
  policy?: string;
}
const KEY = "pos.printer";
export const DEFAULT_PRINTER: PrinterSettings = {
  paper: "80", autoPrint: false, copies: 1, fontSize: 12, showItemCode: false, header: "", footer: "Thank you for shopping with us!", printZOnClose: true,
};
export function loadPrinter(): PrinterSettings {
  try { return { ...DEFAULT_PRINTER, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT_PRINTER; }
}
export function savePrinter(s: PrinterSettings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (v?: number) => (Number(v) || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v?: number) => (Number(v) || 0).toLocaleString("en-PK", { maximumFractionDigits: 3 });
/** Whole rupees for the money people count at the counter (total, received, change, balance due). */
const whole = (v?: number) => Math.round(Number(v) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });

function page(body: string, s: PrinterSettings, title: string) {
  const width = s.paper === "58" ? "48mm" : s.paper === "80" ? "72mm" : "150mm";
  const size = s.paper === "a4" ? "A4" : `${s.paper}mm auto`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: ${size}; margin: ${s.paper === "a4" ? "14mm" : "2mm 2.5mm"}; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; color: #000; background: #fff; font: ${s.fontSize}px/1.4 "Inter", "Segoe UI", Roboto, Arial, sans-serif; font-variant-numeric: tabular-nums; }
    .r { width: ${width}; margin: 0 auto; padding: 2mm 0 4mm; }
    .c { text-align: center; } .b { font-weight: 700; } .big { font-size: 1.3em; } .sm { font-size: .82em; } .xs { font-size: .72em; }
    .muted { color: #444; } .mono { font-family: "Courier New", ui-monospace, monospace; letter-spacing: .02em; }
    .brand { text-align: center; margin-bottom: 2mm; }
    .logo { display: inline-flex; align-items: center; justify-content: center; width: 12mm; height: 12mm; border-radius: 50%; border: 2px solid #000; color: #000;
            font-weight: 800; font-size: 1.15em; letter-spacing: .04em; margin-bottom: 1.2mm; }
    .logo-img { max-height: 14mm; max-width: 40mm; object-fit: contain; margin-bottom: 1.2mm; }
    .name { font-size: 1.28em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; line-height: 1.15; }
    .title { margin: 2.5mm 0 2mm; padding: 1.2mm 0; border-top: 2px solid #000; border-bottom: 2px solid #000; text-align: center; font-weight: 800; letter-spacing: .22em; font-size: .9em; }
    .tag { display: inline-block; border: 1px solid #000; border-radius: 1mm; padding: 0 1.5mm; font-weight: 700; font-size: .78em; letter-spacing: .1em; }
    .hr { border-top: 1px dashed #000; margin: 2mm 0; } .hr2 { border-top: 3px double #000; margin: 2mm 0; } .hr0 { border-top: 1px solid #000; margin: 1.5mm 0; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; } .row > span:last-child { text-align: right; white-space: nowrap; }
    .meta .row { padding: .3mm 0; } .meta .row > span:first-child { color: #444; }
    .it { padding: 1.2mm 0; border-bottom: 1px dotted #999; } .it:last-child { border-bottom: 0; }
    .it .nm { font-weight: 700; } .it .ln { display: flex; justify-content: space-between; margin-top: .4mm; } .it .amt { font-weight: 700; }
    .grand { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 1.8mm 0; margin: 2mm 0; }
    .grand .l { font-weight: 800; letter-spacing: .12em; font-size: .9em; } .grand .v { font-weight: 800; font-size: 1.35em; }
    .box { border: 1px solid #000; border-radius: 1.5mm; padding: 1.5mm 2mm; margin: 2mm 0; }
    .thanks { text-align: center; font-weight: 800; letter-spacing: .25em; font-size: 1.05em; margin-top: 3mm; }
    .stars { text-align: center; letter-spacing: .6em; margin: 1mm 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: .5mm 0; vertical-align: top; } td.n { text-align: right; white-space: nowrap; }
  </style></head><body><div class="r">${body}</div></body></html>`;
}

const initialsOf = (name?: string) => (name ?? "").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(pvt|ltd|private|limited|co)\.?$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "POS";

function header(c: CompanyHeader, s: PrinterSettings) {
  const logo = c.company_logo
    ? `<img class="logo-img" src="${esc(c.company_logo.startsWith("http") ? c.company_logo : `${location.origin}${c.company_logo}`)}" alt="">`
    : `<div class="logo">${esc(initialsOf(c.company_name))}</div>`;
  return `<div class="brand">${logo}<div class="name">${esc(c.company_name)}</div>
    ${c.address ? `<div class="sm muted">${esc(c.address)}</div>` : ""}
    ${c.phone_no || c.email ? `<div class="xs muted">${[c.phone_no && `Tel ${esc(c.phone_no)}`, c.email && esc(c.email)].filter(Boolean).join(" · ")}</div>` : ""}
    ${c.tax_id ? `<div class="xs muted">NTN ${esc(c.tax_id)}</div>` : ""}
    ${s.header ? `<div class="sm" style="margin-top:1mm">${esc(s.header)}</div>` : ""}</div>`;
}

export function receiptHtml(r: ReceiptData, s: PrinterSettings, opts: { duplicate?: boolean } = {}) {
  const title = r.is_return ? "RETURN / REFUND" : (r.outstanding_amount ?? 0) > 0.01 ? "CREDIT SALE" : "SALES RECEIPT";
  const row = (k: string, v: string, cls = "") => `<div class="row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const cur = esc(r.currency);
  const lines = r.items.map((i) => `<div class="it"><div class="nm">${esc(i.item_name)}${i.is_free_item ? ` <span class="tag">FREE</span>` : ""}</div>
      ${s.showItemCode ? `<div class="xs muted">${esc(i.item_code)}</div>` : ""}
      <div class="ln"><span class="muted">${qty(i.qty)} ${esc(i.uom)} × ${num(i.rate)}${i.discount_percentage ? ` <span class="xs">(−${Math.round(i.discount_percentage * 100) / 100}%)</span>` : ""}</span><span class="amt">${num(i.amount)}</span></div>
      ${i.batch_no ? `<div class="xs muted">Batch ${esc(i.batch_no)}</div>` : ""}${i.serial_no ? `<div class="xs muted">S/N ${esc(String(i.serial_no).split("\n").join(", "))}</div>` : ""}</div>`).join("");
  const count = r.total_qty ?? r.items.reduce((a, i) => a + i.qty, 0);
  const body = `${header(r.company, s)}
    <div class="title">${title}</div>
    ${opts.duplicate ? `<div class="c" style="margin-bottom:1.5mm"><span class="tag">DUPLICATE COPY</span></div>` : ""}
    ${r.pending_sync ? `<div class="box c sm"><b>OFFLINE SALE</b> — pending sync<br><span class="mono xs">${esc(r.offline_id?.slice(0, 8))}</span></div>` : ""}
    <div class="meta">
      ${row("Invoice", `<span class="mono b">${esc(r.name)}</span>`)}${r.return_against ? row("Against", `<span class="mono">${esc(r.return_against)}</span>`) : ""}
      ${row("Date", `${esc(new Date(`${r.posting_date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }))} · ${esc(String(r.posting_time).slice(0, 5))}`)}
      ${row("Customer", esc(r.customer_name))}${r.contact_mobile ? row("Mobile", esc(r.contact_mobile)) : ""}
      ${row("Counter", esc(r.pos_profile))}
    </div>
    <div class="hr0"></div>${lines}<div class="hr"></div>
    ${row(`Subtotal <span class="xs muted">(${qty(count)} item${count === 1 ? "" : "s"})</span>`, num(r.total ?? r.net_total))}
    ${r.discount_amount ? row(`Discount${r.additional_discount_percentage ? ` ${r.additional_discount_percentage}%` : ""}${r.coupon_code ? ` · ${esc(r.coupon_code)}` : ""}`, `−${num(r.discount_amount)}`) : ""}
    ${r.taxes.map((t) => row(`${esc(t.description)}${t.rate ? ` <span class="xs muted">${t.rate}%</span>` : ""}`, num(t.tax_amount))).join("")}
    <div class="grand"><span class="l">GRAND TOTAL</span><span class="v">${cur} ${whole(r.rounded_total || r.grand_total)}</span></div>
    ${r.in_words ? `<div class="xs muted c">${esc(r.in_words)}</div>` : ""}
    <div class="hr"></div>
    ${r.payments.map((p) => row(`${esc(p.mode_of_payment)}${p.reference_no ? ` <span class="xs muted mono">#${esc(p.reference_no)}</span>` : ""}`, whole(p.amount))).join("")}
    ${r.loyalty_amount ? row(`Loyalty <span class="xs muted">${r.loyalty_points} pts</span>`, whole(r.loyalty_amount)) : ""}
    ${r.change_amount ? row("Change", whole(r.change_amount), "b big") : ""}
    ${r.write_off_amount ? row("Written off", whole(r.write_off_amount)) : ""}
    ${(r.outstanding_amount ?? 0) > 0.01 ? `<div class="box">${row("BALANCE DUE", `${cur} ${whole(r.outstanding_amount)}`, "b")}</div>` : ""}
    ${r.remarks && !/^Held by/.test(r.remarks) ? `<div class="box sm">${esc(r.remarks)}</div>` : ""}
    <div class="hr2"></div>
    <div class="sm">${row("Served by", `<b>${esc(r.cashier)}</b>`)}</div>
    <div class="thanks">THANK YOU!</div>
    ${s.footer ? `<div class="c sm muted">${esc(s.footer)}</div>` : ""}
    <div class="stars">✦ ✦ ✦ ✦ ✦</div>
    ${s.policy ? `<div class="c xs muted">${esc(s.policy)}</div>` : ""}`;
  return page(body, s, r.name);
}

export interface ShiftReport {
  type: "X" | "Z"; shift: string; closing?: string; pos_profile: string; cashier: string; start: string; end: string; company: CompanyHeader;
  invoices: number; returns: number; refunds: number; gross: number; net_sales: number; net_total: number; taxes_total: number; discounts: number;
  change: number; write_off: number; loyalty: number; coupons: number; first?: string; last?: string;
  modes: { mode: string; amount: number }[]; items: { item: string; qty: number; amount: number }[]; taxes: { description: string; amount: number }[];
  reconciliation: { mode: string; opening: number; expected: number; counted?: number; difference?: number; dues?: number }[];
}

export function shiftReportHtml(r: ShiftReport, s: PrinterSettings) {
  const row = (k: string, v: string, cls = "") => `<div class="row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const body = `${header(r.company, s)}
    <div class="c b big">${r.type} REPORT</div><div class="c sm">${r.type === "X" ? "Shift so far — not closed" : `Shift closed — ${esc(r.closing)}`}</div><div class="hr"></div>
    ${row("Counter", esc(r.pos_profile))}${row("Cashier", esc(r.cashier))}${row("Shift", esc(r.shift))}
    ${row("From", esc(r.start.slice(0, 16)))}${row("To", esc(r.end.slice(0, 16)))}
    ${r.first ? row("Invoices", `${esc(r.first.slice(-5))} … ${esc(String(r.last).slice(-5))}`) : ""}<div class="hr"></div>
    ${row(`Sales (${r.invoices})`, num(r.gross))}${row(`Returns (${r.returns})`, num(r.refunds))}${row("NET SALES", num(r.net_sales), "b")}
    ${row("Net of tax", num(r.net_total))}${row("Taxes", num(r.taxes_total))}${row("Discounts given", num(r.discounts))}
    ${r.loyalty ? row("Loyalty redeemed", num(r.loyalty)) : ""}${r.coupons ? row("Coupons used", String(r.coupons)) : ""}
    ${r.write_off ? row("Written off", num(r.write_off)) : ""}${row("Change given", num(r.change))}
    <div class="hr"></div><div class="b">TENDERS</div>${r.modes.map((m) => row(esc(m.mode), num(m.amount))).join("") || '<div class="sm">none</div>'}
    <div class="hr"></div><div class="b">CASH-UP</div>
    <table>${r.reconciliation.map((m) => `<tr><td colspan="2" class="b">${esc(m.mode)}</td></tr>
      <tr><td>Opening</td><td class="n">${num(m.opening)}</td></tr>${m.dues ? `<tr><td>Dues collected</td><td class="n">${num(m.dues)}</td></tr>` : ""}
      <tr><td>Expected</td><td class="n">${num(m.expected)}</td></tr>
      ${m.counted !== undefined ? `<tr><td>Counted</td><td class="n">${num(m.counted)}</td></tr><tr><td>Difference</td><td class="n b">${num(m.difference)}</td></tr>` : ""}`).join("")}</table>
    ${r.taxes.length ? `<div class="hr"></div><div class="b">TAXES</div>${r.taxes.map((t) => row(esc(t.description), num(t.amount))).join("")}` : ""}
    ${r.items.length ? `<div class="hr"></div><div class="b">ITEMS SOLD</div>${r.items.map((i) => row(`${esc(i.item)} × ${qty(i.qty)}`, num(i.amount))).join("")}` : ""}
    <div class="hr"></div><div class="c sm">Printed ${esc(new Date().toLocaleString())}</div><br><div class="c">Signature ____________</div>`;
  return page(body, s, `${r.type} report ${r.shift}`);
}

export function paymentReceiptHtml(p: { name: string; customer: string; amount: number; mode: string; reference_no?: string; allocated: number; currency: string; cashier: string; company: CompanyHeader }, s: PrinterSettings) {
  const row = (k: string, v: string, cls = "") => `<div class="row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  return page(`${header(p.company, s)}<div class="c b">PAYMENT RECEIVED</div><div class="hr"></div>
    ${row("Receipt", esc(p.name))}${row("Date", esc(new Date().toLocaleString()))}${row("Customer", esc(p.customer))}${row("Cashier", esc(p.cashier))}
    <div class="hr"></div>${row(`${esc(p.mode)}${p.reference_no ? ` #${esc(p.reference_no)}` : ""}`, `${esc(p.currency)} ${num(p.amount)}`, "b big")}
    ${row("Against invoices", num(p.allocated))}${p.amount - p.allocated > 0.01 ? row("On account", num(p.amount - p.allocated)) : ""}
    <div class="hr"></div><div class="c">${esc(s.footer)}</div>`, s, p.name);
}

/** The MMX POS desktop app (Electron) bridge, when the POS runs inside it. */
export interface MmxDesktop {
  isDesktop: true; platform: string;
  print: (html: string, opts?: { printer?: string; silent?: boolean; copies?: number }) => Promise<{ ok: boolean; silent: boolean; printer: string | null }>;
  listPrinters: () => Promise<{ name: string; displayName: string; isDefault: boolean }[]>;
  getConfig: () => Promise<{ receiptPrinter?: string; silentPrint?: boolean; copies?: number; serverUrl?: string; kiosk?: boolean }>;
  saveConfig: (patch: Record<string, unknown>) => Promise<unknown>;
  openSettings: () => Promise<boolean>;
}
export const desktop = (): MmxDesktop | undefined => (typeof window !== "undefined" ? (window as unknown as { mmxDesktop?: MmxDesktop }).mmxDesktop : undefined);

/** Print an HTML document: silently via the desktop app when inside MMX POS, else through a hidden iframe (copies = repeated pages). */
export function printHtml(html: string, copies = 1) {
  const app = desktop();
  if (app?.isDesktop) {
    void app.print(html, { copies }).catch(() => undefined);
    return;
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const n = Math.max(1, Math.min(5, copies));
  const multi = n > 1 ? html.replace(/<body>([\s\S]*)<\/body>/, (_m, b: string) => `<body>${Array.from({ length: n }, () => b).join('<div style="page-break-after:always"></div>')}</body>`) : html;
  doc.open(); doc.write(multi); doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  if (doc.readyState === "complete") setTimeout(go, 50); else frame.onload = go;
}

export const printReceipt = (r: ReceiptData, s: PrinterSettings, duplicate = false) => printHtml(receiptHtml(r, s, { duplicate }), duplicate ? 1 : s.copies);

/** Receipt preview (same HTML the printer gets). */
export function ReceiptPreview({ html, className }: { html: string; className?: string }) {
  return <iframe title="Receipt preview" srcDoc={html} className={className ?? "h-[60vh] w-full rounded-lg border border-border bg-white"} />;
}

export function PrinterSettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<PrinterSettings>(loadPrinter);
  const app = desktop();
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([]);
  const [dcfg, setDcfg] = useState<{ receiptPrinter?: string; silentPrint?: boolean }>({});
  useEffect(() => {
    if (!app) return;
    void app.listPrinters().then(setPrinters).catch(() => undefined);
    void app.getConfig().then((c) => setDcfg({ receiptPrinter: c.receiptPrinter, silentPrint: c.silentPrint })).catch(() => undefined);
  }, [app]);
  const set = <K extends keyof PrinterSettings>(k: K, v: PrinterSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const sample: ReceiptData = {
    name: "ACC-PSINV-SAMPLE", posting_date: new Date().toISOString().slice(0, 10), posting_time: new Date().toTimeString().slice(0, 8), customer: "Walk-in Customer",
    customer_name: "Walk-in Customer", cashier: "Cashier", pos_profile: "Counter", currency: "PKR", company: { company_name: "Your Company", address: "Main Road, City", phone_no: "042-0000000", tax_id: "0000000-0" },
    items: [{ item_code: "ITEM-1", item_name: "Sample item", qty: 2, uom: "Nos", rate: 250, amount: 500 }, { item_code: "ITEM-2", item_name: "Another item with a longer name", qty: 1, uom: "Kg", rate: 1200, amount: 1080, discount_percentage: 10 }],
    net_total: 1580, total: 1580, taxes: [], grand_total: 1580, rounded_total: 1580, payments: [{ mode_of_payment: "Cash", amount: 2000 }], change_amount: 420,
  };
  return (
    <Dialog open onClose={onClose} title="Receipt printer" description="Saved on this device. Choose the thermal printer in the browser's print dialog once — it is remembered." size="xl">
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-muted-foreground">Paper</span>
              <Select value={s.paper} onChange={(e) => set("paper", e.target.value as PrinterSettings["paper"])}><option value="80">80 mm thermal</option><option value="58">58 mm thermal</option><option value="a4">A4 / Letter</option></Select></label>
            <label className="space-y-1"><span className="text-muted-foreground">Font size</span><Input type="number" min={9} max={16} value={s.fontSize} onChange={(e) => set("fontSize", Number(e.target.value) || 12)} /></label>
            <label className="space-y-1"><span className="text-muted-foreground">Copies</span><Input type="number" min={1} max={5} value={s.copies} onChange={(e) => set("copies", Number(e.target.value) || 1)} /></label>
          </div>
          <label className="block space-y-1"><span className="text-muted-foreground">Header line (under the company)</span><Input value={s.header} onChange={(e) => set("header", e.target.value)} placeholder="e.g. Factory Outlet — Open 9 to 9" /></label>
          <label className="block space-y-1"><span className="text-muted-foreground">Footer</span><Input value={s.footer} onChange={(e) => set("footer", e.target.value)} /></label>
          <label className="block space-y-1"><span className="text-muted-foreground">Policy line (small print)</span><Input value={s.policy ?? ""} onChange={(e) => set("policy", e.target.value)} placeholder="e.g. Exchange within 7 days with this receipt" /></label>
          {app && (
            <div className="space-y-2 rounded-xl border border-teal-500/30 bg-teal-500/[0.06] p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">MMX POS desktop app</div>
              <label className="block space-y-1"><span className="text-muted-foreground">Receipt printer</span>
                <Select value={dcfg.receiptPrinter ?? ""} onChange={(e) => setDcfg((d) => ({ ...d, receiptPrinter: e.target.value }))}>
                  <option value="">Ask every time (print dialog)</option>
                  {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? " (default)" : ""}</option>)}
                </Select></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!dcfg.silentPrint} onChange={(e) => setDcfg((d) => ({ ...d, silentPrint: e.target.checked }))} /> Print silently — no dialog</label>
            </div>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.autoPrint} onChange={(e) => set("autoPrint", e.target.checked)} /> Print the receipt automatically when a sale completes</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.showItemCode} onChange={(e) => set("showItemCode", e.target.checked)} /> Show item codes</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.printZOnClose} onChange={(e) => set("printZOnClose", e.target.checked)} /> Print the Z report when the shift closes</label>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => printReceipt(sample, s)}><Printer className="h-4 w-4" /> Test print</Button>
            <Button onClick={() => { savePrinter(s); if (app) void app.saveConfig({ receiptPrinter: dcfg.receiptPrinter ?? "", silentPrint: !!dcfg.silentPrint, copies: s.copies }); onClose(); }}>Save</Button>
          </div>
        </div>
        <ReceiptPreview html={receiptHtml(sample, s)} className="h-[460px] w-full rounded-lg border border-border bg-white" />
      </div>
    </Dialog>
  );
}
