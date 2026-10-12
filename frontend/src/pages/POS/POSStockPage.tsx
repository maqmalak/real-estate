import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  AlertTriangle, ArrowLeft, ArrowRightLeft, Boxes, CheckCircle2, Clock, PackageCheck, PackageMinus, PackagePlus, PackageX, Plus, Printer, Search, Store, Trash2, Warehouse,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import type { CompanyHeader } from "./pos-offline";
import { loadPrinter, printHtml } from "./pos-receipt";

interface Ctx { profile: { name: string; warehouse: string; price_list: string; currency: string } | null; shift: unknown; profiles: { name: string }[] }
interface Setup { warehouse: string; company: string; warehouses: string[]; currency: string; can_receive: boolean; company_header: CompanyHeader; user: string }
interface StockRow { item_code: string; item_name: string; item_group: string; stock_uom: string; qty: number; value: number; reorder_level: number; reorder_qty: number; state: "out" | "low" | "ok" }
interface Receipt { name: string; purpose: string; posting_date: string; posting_time: string; docstatus: number; remarks: string; total_incoming_value: number; line_count: number; qty: number; source?: string; user: string }
interface Line { item_code: string; item_name: string; uom: string; qty: number; rate: number; have: number }
interface Item { item_code: string; item_name: string; uom?: string; stock_uom?: string; price_list_rate?: number; actual_qty?: number }

/** /pos/stock — receive stock into the counter: transfer from another warehouse or new stock (Material Receipt). */
export default function POSStockPage() {
  const { data: ctxData } = useFrappeGetCall<{ message: Ctx }>("mm_core.pos.get_context", undefined, "mm_core.pos.ctx");
  const profile = ctxData?.message?.profile;
  const { data: setupData } = useFrappeGetCall<{ message: Setup }>("mm_core.pos.stock_setup", profile ? { pos_profile: profile.name } : undefined, profile ? `pos.stock.setup.${profile.name}` : null);
  const setup = setupData?.message;
  const money = (v?: number) => formatMoney(v ?? 0, setup?.currency ?? "PKR");
  const [q, setQ] = useState("");
  const { data: stockData, mutate: reloadStock } = useFrappeGetCall<{ message: { rows: StockRow[]; value: number; out: number; low: number; items: number } }>(
    "mm_core.pos.counter_stock", profile ? { pos_profile: profile.name, q: q || undefined } : undefined, profile ? `pos.stock.list.${profile.name}.${q}` : null, { keepPreviousData: true });
  const { data: recData, mutate: reloadRec } = useFrappeGetCall<{ message: Receipt[] }>("mm_core.pos.stock_receipts", profile ? { pos_profile: profile.name } : undefined, profile ? `pos.stock.rec.${profile.name}` : null);
  const stock = stockData?.message;
  const receipts = recData?.message ?? [];

  if (!ctxData) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-96" /></div>;
  if (!profile) return <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No POS profile for you.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30 ring-1 ring-inset ring-white/20"><PackagePlus className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight">Receive stock</h1>
          <p className="text-xs text-muted-foreground">{profile.name} · into <b className="text-foreground">{profile.warehouse}</b></p>
        </div>
        <Link to="/pos/terminal" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><ArrowLeft className="h-4 w-4" /> Terminal</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile icon={Boxes} label="Items on shelf" value={String(stock?.items ?? "–")} cls="from-sky-500/15 border-sky-500/25 text-sky-600" />
        <Tile icon={Warehouse} label="Stock value" value={money(stock?.value)} cls="from-violet-500/15 border-violet-500/25 text-violet-600" />
        <Tile icon={PackageMinus} label="Running low" value={String(stock?.low ?? "–")} cls="from-amber-500/15 border-amber-500/25 text-amber-600" />
        <Tile icon={PackageX} label="Out of stock" value={String(stock?.out ?? "–")} cls="from-rose-500/15 border-rose-500/25 text-rose-600" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {setup ? <ReceiveForm profile={profile} setup={setup} money={money} lowItems={(stock?.rows ?? []).filter((r) => r.state !== "ok")}
          onDone={() => { void reloadStock(); void reloadRec(); }} /> : <Skeleton className="h-96 rounded-2xl" />}

        <div className="space-y-4">
          {/* shelf */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 text-sm font-bold">On the shelf</h2>
              <div className="relative w-52"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find item…" className="h-8 pl-8 text-xs" /></div>
            </div>
            {!stock ? <Skeleton className="h-48" /> : stock.rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nothing in this warehouse yet.</p> : (
              <ul className="max-h-[360px] divide-y divide-border overflow-y-auto pr-1 scrollbar-thin">
                {stock.rows.map((r) => (
                  <li key={r.item_code} className="flex items-center gap-3 py-2 text-sm">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", r.state === "out" ? "bg-rose-500/15 text-rose-600" : r.state === "low" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600")}>
                      {r.state === "out" ? <PackageX className="h-4 w-4" /> : r.state === "low" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.item_name}</div><div className="truncate text-[11px] text-muted-foreground">{r.item_code} · {r.item_group}{r.reorder_level ? ` · reorder at ${r.reorder_level}` : ""}</div></div>
                    <div className="text-right"><div className={cn("font-bold tabular-nums", r.state === "out" ? "text-rose-600" : r.state === "low" ? "text-amber-600" : "")}>{Math.round(r.qty * 1000) / 1000} <span className="text-[10px] font-normal text-muted-foreground">{r.stock_uom}</span></div>
                      <div className="text-[10px] tabular-nums text-muted-foreground">{money(r.value)}</div></div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* recent */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold">Recent receipts</h2>
            {receipts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No stock received yet.</p> : (
              <ul className="space-y-2">{receipts.map((r) => (
                <li key={r.name} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5 text-sm">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white", r.purpose === "Material Transfer" ? "from-sky-500 to-blue-600" : "from-emerald-500 to-green-600")}>
                    {r.purpose === "Material Transfer" ? <ArrowRightLeft className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px] font-semibold">{r.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.purpose === "Material Transfer" ? `From ${r.source ?? "—"}` : "New stock"} · {r.line_count} line{r.line_count === 1 ? "" : "s"} · {Math.round(r.qty * 1000) / 1000} qty</div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-2.5 w-2.5" />{r.posting_date} {r.posting_time} · {r.user}</div>
                  </div>
                  <div className="text-right text-sm font-bold tabular-nums">{money(r.total_incoming_value)}</div>
                  <button type="button" title="Print GRN" onClick={() => void getCall<GrnDetail>("mm_core.pos.stock_receipt_detail", { name: r.name }).then((d) => printGrn(d, setup, profile.name, money)).catch((e) => toast.error(humanizeError(e)))}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Printer className="h-4 w-4" /></button>
                </li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, cls }: { icon: typeof Store; label: string; value: string; cls: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-card bg-gradient-to-br to-transparent p-4", cls)}>
      <Icon className="absolute right-4 top-4 h-6 w-6 opacity-70" />
      <div className="text-[10px] font-bold uppercase tracking-wider text-foreground/65">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ReceiveForm({ profile, setup, money, lowItems, onDone }: {
  profile: NonNullable<Ctx["profile"]>; setup: Setup; money: (v?: number) => string; lowItems: StockRow[]; onDone: () => void;
}) {
  const [mode, setMode] = useState<"transfer" | "receipt">("transfer");
  const [source, setSource] = useState(setup.warehouses.find((w) => /store|godown|finished/i.test(w)) ?? setup.warehouses[0] ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [remarks, setRemarks] = useState("");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim()), 220); return () => clearTimeout(t); }, [term]);
  const { data: itemData } = useFrappeGetCall<{ message: { items: Item[] } }>("erpnext.selling.page.point_of_sale.point_of_sale.get_items",
    debounced ? { start: 0, page_length: 12, price_list: profile.price_list, item_group: "", pos_profile: profile.name, search_term: debounced } : undefined,
    debounced ? `pos.stock.search.${profile.name}.${debounced}` : null);
  const results = itemData?.message?.items ?? [];
  const codes = useMemo(() => lines.map((l) => l.item_code), [lines]);
  const { data: srcData } = useFrappeGetCall<{ message: Record<string, number> }>("mm_core.pos.source_stock",
    mode === "transfer" && source && codes.length ? { warehouse: source, item_codes: JSON.stringify(codes) } : undefined,
    mode === "transfer" && source && codes.length ? `pos.stock.src.${source}.${codes.join(",")}` : null);
  const avail = srcData?.message ?? {};

  const addItem = (it: { item_code: string; item_name: string; uom?: string; stock_uom?: string; price_list_rate?: number; qty?: number; have?: number }) => {
    setLines((ls) => ls.some((l) => l.item_code === it.item_code) ? ls : [...ls, { item_code: it.item_code, item_name: it.item_name, uom: it.stock_uom || it.uom || "Nos",
      qty: it.qty ?? 1, rate: it.price_list_rate ?? 0, have: it.have ?? 0 }]);
    setTerm("");
  };
  const total = lines.reduce((a, l) => a + l.qty * (mode === "receipt" ? l.rate : 0), 0);
  const over = mode === "transfer" ? lines.filter((l) => avail[l.item_code] !== undefined && l.qty > avail[l.item_code]) : [];

  const save = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ name: string; total: number }>("mm_core.pos.receive_stock", { data: JSON.stringify({ pos_profile: profile.name, mode, source_warehouse: mode === "transfer" ? source : undefined,
        remarks, items: lines.map((l) => ({ item_code: l.item_code, qty: l.qty, uom: l.uom, rate: mode === "receipt" ? l.rate : undefined })) }) });
      toast.success(`Stock received — ${r.name}`);
      const d = await getCall<GrnDetail>("mm_core.pos.stock_receipt_detail", { name: r.name });
      printGrn(d, setup, profile.name, money);
      setLines([]); setRemarks("");
      onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        {([["transfer", "Transfer in", "From another warehouse", ArrowRightLeft, "from-sky-500 to-blue-600 shadow-sky-500/30"],
          ["receipt", "New stock", "Material receipt at a rate", PackageCheck, "from-emerald-500 to-green-600 shadow-emerald-500/30"]] as const).map(([k, l, sub, Icon, g]) => (
          <button key={k} type="button" onClick={() => setMode(k)}
            className={cn("flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all", mode === k ? cn("border-transparent bg-gradient-to-br text-white shadow-lg", g) : "border-border hover:border-primary/40")}>
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", mode === k ? "bg-white/20" : "bg-muted")}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold">{l}</span><span className={cn("block truncate text-[10px]", mode === k ? "text-white/80" : "text-muted-foreground")}>{sub}</span></span>
          </button>
        ))}
      </div>

      {mode === "transfer" && (
        <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From warehouse</span>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>{setup.warehouses.map((w) => <option key={w} value={w}>{w}</option>)}</Select></label>
      )}

      {lowItems.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> Needs restocking</div>
          <div className="flex flex-wrap gap-1.5">{lowItems.slice(0, 10).map((r) => (
            <button key={r.item_code} type="button" onClick={() => addItem({ item_code: r.item_code, item_name: r.item_name, stock_uom: r.stock_uom, qty: r.reorder_qty || 10, have: r.qty })}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-card px-2.5 py-0.5 text-xs font-medium hover:bg-amber-500/10"><Plus className="h-3 w-3" />{r.item_name} <span className="tabular-nums text-muted-foreground">{Math.round(r.qty * 100) / 100}</span></button>
          ))}</div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search item or scan barcode to add…" className="h-11 rounded-xl pl-9" />
        {debounced && results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl">
            {results.map((it) => (
              <li key={it.item_code}><button type="button" onClick={() => addItem(it)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                <Plus className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.item_name}</span><span className="block text-[11px] text-muted-foreground">{it.item_code}</span></span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{it.actual_qty ?? 0} here</span></button></li>
            ))}
          </ul>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground"><PackagePlus className="h-8 w-8 opacity-50" /> Add items to receive.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              <tr><th className="px-3 py-2 text-left">Item</th>{mode === "transfer" && <th className="text-right">Available</th>}<th className="text-right">Qty</th>{mode === "receipt" && <th className="text-right">Rate</th>}<th className="w-8" /></tr>
            </thead>
            <tbody>{lines.map((l) => {
              const a = avail[l.item_code];
              return (
                <tr key={l.item_code} className="border-t border-border">
                  <td className="px-3 py-2"><div className="font-medium">{l.item_name}</div><div className="text-[11px] text-muted-foreground">{l.item_code} · {l.uom}</div></td>
                  {mode === "transfer" && <td className={cn("text-right text-xs tabular-nums", a !== undefined && l.qty > a ? "font-semibold text-rose-600" : "text-muted-foreground")}>{a === undefined ? "…" : Math.round(a * 1000) / 1000}</td>}
                  <td className="text-right"><div className="ml-auto w-24"><Input type="number" min={0} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x) => x.item_code === l.item_code ? { ...x, qty: Number(e.target.value) } : x))} className="h-8 text-right" /></div></td>
                  {mode === "receipt" && <td className="text-right"><div className="ml-auto w-24"><Input type="number" min={0} value={l.rate} onChange={(e) => setLines((ls) => ls.map((x) => x.item_code === l.item_code ? { ...x, rate: Number(e.target.value) } : x))} className="h-8 text-right" /></div></td>}
                  <td className="pr-2 text-right"><button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.item_code !== l.item_code))} className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note</span>
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={mode === "transfer" ? "e.g. Morning top-up from main store" : "e.g. Supplier delivery, bill #123"} /></label>

      {over.length > 0 && <p className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300"><AlertTriangle className="h-4 w-4" /> {over.map((l) => l.item_name).join(", ")}: more than {source} has.</p>}
      {!setup.can_receive && <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">You need permission to create Stock Entries (Stock User) to receive stock.</p>}

      <button type="button" disabled={busy || !lines.length || over.length > 0 || !setup.can_receive || lines.some((l) => l.qty <= 0)} onClick={() => void save()}
        className={cn("inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
          mode === "transfer" ? "from-sky-500 to-blue-600 shadow-sky-500/30" : "from-emerald-500 to-green-600 shadow-emerald-500/30")}>
        <PackageCheck className="h-5 w-5" /> {mode === "transfer" ? `Transfer ${lines.length} item${lines.length === 1 ? "" : "s"} in` : `Receive ${lines.length} item${lines.length === 1 ? "" : "s"}${total ? ` · ${money(total)}` : ""}`} &amp; print
      </button>
    </section>
  );
}

interface GrnDetail { name: string; purpose: string; posting_date: string; posting_time: string; remarks: string; user: string; total: number;
  items: { item_code: string; item_name: string; qty: number; uom: string; rate: number; amount: number; from?: string; to?: string }[] }

/** Goods-received slip on the receipt printer. */
function printGrn(d: GrnDetail, setup: Setup | undefined, counter: string, money: (v?: number) => string) {
  const s = loadPrinter();
  const esc = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const width = s.paper === "58" ? "48mm" : s.paper === "80" ? "72mm" : "150mm";
  const row = (k: string, v: string, cls = "") => `<div class="row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const from = d.items[0]?.from;
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.name)}</title><style>
    @page { size: ${s.paper === "a4" ? "A4" : `${s.paper}mm auto`}; margin: 2mm 2.5mm; } body { margin: 0; font: ${s.fontSize}px/1.4 "Inter", Arial, sans-serif; color: #000; font-variant-numeric: tabular-nums; }
    .r { width: ${width}; margin: 0 auto; } .c { text-align: center; } .b { font-weight: 700; } .muted { color: #444; } .xs { font-size: .75em; }
    .title { margin: 2mm 0; padding: 1mm 0; border-top: 2px solid #000; border-bottom: 2px solid #000; text-align: center; font-weight: 800; letter-spacing: .18em; font-size: .9em; }
    .row { display: flex; justify-content: space-between; gap: 6px; } .row > span:last-child { text-align: right; } .hr { border-top: 1px dashed #000; margin: 2mm 0; }
    .it { padding: 1mm 0; border-bottom: 1px dotted #999; } .it:last-child { border-bottom: 0; }
  </style></head><body><div class="r">
    <div class="c b" style="font-size:1.2em;letter-spacing:.05em">${esc(setup?.company_header.company_name ?? "")}</div>
    <div class="title">${d.purpose === "Material Transfer" ? "STOCK TRANSFER IN" : "GOODS RECEIVED"}</div>
    ${row("Entry", `<b>${esc(d.name)}</b>`)}${row("Date", `${esc(d.posting_date)} · ${esc(d.posting_time)}`)}${row("Counter", esc(counter))}
    ${from ? row("From", esc(from)) : ""}${row("Into", esc(d.items[0]?.to ?? ""))}${row("Received by", esc(d.user))}
    <div class="hr"></div>
    ${d.items.map((i) => `<div class="it"><div class="b">${esc(i.item_name)}</div><div class="row"><span class="muted">${esc(i.item_code)}</span><span class="b">${i.qty} ${esc(i.uom)}</span></div>
      ${d.purpose !== "Material Transfer" ? `<div class="row xs muted"><span>@ ${money(i.rate)}</span><span>${money(i.amount)}</span></div>` : ""}</div>`).join("")}
    <div class="hr"></div>
    ${row(`${d.items.length} line${d.items.length === 1 ? "" : "s"}`, `<b>${d.items.reduce((a, i) => a + i.qty, 0)} qty</b>`)}
    ${d.total ? row("Value", `<b>${money(d.total)}</b>`) : ""}
    ${d.remarks ? `<div class="xs" style="margin-top:2mm">${esc(d.remarks)}</div>` : ""}
    <br><div class="row xs"><span>Delivered by ________</span><span>Received by ________</span></div>
  </div></body></html>`);
}
