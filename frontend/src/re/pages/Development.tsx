/**
 * Development & Costs (/re/development): budget vs actual per cost head (ERPNext Projects) next to the physical progress of
 * the works on the map, monthly spend, suppliers and contractors, the purchase pipeline, site-store stock and assets.
 * Server: realestate.spa.development.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Boxes, ClipboardList, Coins, FileText, Gauge as GaugeIcon, HardHat, Hammer, Landmark, Package, PackageCheck,
  ReceiptText, ShoppingCart, Target, Truck, Users, Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisShort, C, ChartCard, ChartTip, Donut, Highlights, KpiCard, Segmented, useChartTheme, useLegendToggle, type Highlight } from "@/re/components/analytics/kit";
import { Bar100, monthLabel, n0, Panel, pct, Ring } from "@/re/components/record/ProjectProfile";
import { GlossyIcon } from "@/components/ui/app-icon";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num, todayISO } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

interface Head {
  head: string; project: string; budget: number; actual: number; consumed: number; committed: number; paid: number; payable: number;
  used_pct: number | null; progress: number | null; features: number; features_done: number; features_wip: number;
}
interface Dev {
  heads: Head[];
  assets: { category: string; n: number; value: number }[];
  stock: { item_code: string; item_name: string; item_group: string; actual_qty: number; stock_value: number; stock_uom: string }[];
  progress: { feature_type: string; n: number; pct: number; done: number }[];
  categories: { category: string; n: number; pct: number; done: number; wip: number; planned: number }[];
  contractors: { contractor: string; n: number; pct: number; done: number }[];
  suppliers: { supplier: string; invoices: number; billed: number; outstanding: number; oldest_due: string | null }[];
  requests: { name: string; status: string; schedule_date: string | null; material_request_type: string; items: number; amount: number; project: string | null }[];
  orders: { name: string; supplier: string; status: string; schedule_date: string | null; amount: number; per_received: number; per_billed: number }[];
  months: { month: string; spent: number; billed: number; paid: number }[];
  open_mr: number; open_po: number; payable: number; payable_other: number;
}

const LINKS = [
  { label: "Material Requests", to: "/import/material-requests", icon: ClipboardList, hue: "amber" },
  { label: "Purchase Orders", to: "/import/purchase-orders", icon: ShoppingCart, hue: "blue" },
  { label: "Purchase Receipts", to: "/purchase/receipts", icon: PackageCheck, hue: "teal" },
  { label: "Purchase Invoices", to: "/purchase/invoices", icon: FileText, hue: "rose" },
  { label: "Stock Entries", to: "/inventory/stock-entries", icon: Package, hue: "cyan" },
  { label: "Projects", to: "/projects", icon: HardHat, hue: "emerald" },
  { label: "Assets", to: "/assets", icon: Boxes, hue: "stone" },
  { label: "Budgets", to: "/desk/budget", icon: Target, hue: "violet", desk: true },
];
const CAT = [C.teal, C.violet, C.amber, C.sky, C.rose, C.emerald];

/** Spend vs physical progress: how far the money has run ahead of (or behind) the work on the ground. */
function health(h: Head): { label: string; tone: string; cls: string } {
  if (h.budget > 0 && h.actual + h.committed > h.budget) return { label: "Over budget", tone: C.red, cls: "bg-red-500/10 text-red-600 dark:text-red-400" };
  if (h.progress === null || !h.budget) return { label: h.budget ? "No works tracked" : "No budget", tone: C.slate, cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400" };
  const gap = n0(h.used_pct) - h.progress;
  if (gap > 15) return { label: `Spend ahead +${gap.toFixed(0)}pt`, tone: C.amber, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  if (gap < -15) return { label: "Work ahead of spend", tone: C.sky, cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" };
  return { label: "On track", tone: C.emerald, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
}

function insights(d: Dev, t: { budget: number; actual: number; committed: number; works: number }): Highlight[] {
  const out: Highlight[] = [];
  const used = pct(t.actual + t.committed, t.budget);
  out.push({ tone: used > 90 ? "warn" : "info", text: `${used.toFixed(0)}% of the ${money(t.budget, { compact: true })} budget is spent or committed, while works are ${t.works.toFixed(0)}% complete.` });
  const over = d.heads.filter((h) => h.budget > 0 && h.actual + h.committed > h.budget);
  if (over.length) out.push({ tone: "bad", text: `${over.map((h) => h.head).join(", ")} ${over.length === 1 ? "is" : "are"} over budget.` });
  const ahead = d.heads.filter((h) => h.progress !== null && h.budget > 0 && n0(h.used_pct) - n0(h.progress) > 15).sort((a, b) => (n0(b.used_pct) - n0(b.progress)) - (n0(a.used_pct) - n0(a.progress)));
  if (ahead[0]) out.push({ tone: "warn", text: `${ahead[0].head}: ${n0(ahead[0].used_pct).toFixed(0)}% of budget used for ${n0(ahead[0].progress).toFixed(0)}% of the work — check rates and wastage.` });
  const noBudget = d.heads.filter((h) => !h.budget && h.actual > 0);
  if (noBudget.length) out.push({ tone: "info", text: `${noBudget.length} head${noBudget.length > 1 ? "s have" : " has"} spending but no budget (${noBudget.map((h) => h.head).join(", ")}).` });
  const slow = [...d.categories].sort((a, b) => a.pct - b.pct)[0];
  if (slow && slow.pct < 100) out.push({ tone: slow.pct < 70 ? "warn" : "info", text: `${slow.category} is the least complete at ${slow.pct.toFixed(0)}% — ${num(slow.wip)} works in progress.` });
  const late = d.suppliers.filter((s) => s.outstanding > 0 && s.oldest_due && s.oldest_due < todayISO()).sort((a, b) => b.outstanding - a.outstanding)[0];
  if (late) out.push({ tone: "bad", text: `${late.supplier} is owed ${money(late.outstanding, { compact: true })}, due since ${date(late.oldest_due)}.` });
  const bad = d.stock.filter((s) => n0(s.stock_value) < 0);
  if (bad.length) out.push({ tone: "warn", text: `${bad.length} site-store items show a negative stock value although quantity is on hand (${bad.map((s) => s.item_name).slice(0, 3).join(", ")}) — check valuation rates.` });
  const m = d.months, last3 = m.slice(-3).reduce((a, x) => a + n0(x.spent), 0), prev3 = m.slice(-6, -3).reduce((a, x) => a + n0(x.spent), 0);
  if (prev3 > 0) {
    const ch = pct(last3 - prev3, prev3);
    out.push({ tone: "info", text: `Spending in the last 3 months is ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(0)}% (${money(last3, { compact: true })} vs ${money(prev3, { compact: true })}).` });
  }
  return out;
}

export function DevelopmentPage() {
  const { data: d, isLoading } = useQuery({ queryKey: ["re-development"], queryFn: () => get<Dev>("realestate.spa.development") });
  const { dark } = useTheme();
  const ct = useChartTheme(dark);
  const lt = useLegendToggle();
  const [sort, setSort] = useState<"budget" | "used" | "progress">("budget");

  const header = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="relative grid size-11 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25">
          <Hammer className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Development & Costs</h1>
          <p className="text-sm text-muted-foreground">Cost heads as ERPNext Projects — budgets, purchases, consumption and payments, matched with the works on the ground</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {LINKS.map((l) => {
          const body = (<><GlossyIcon icon={l.icon} hue={l.hue} size="sm" /><span>{l.label}</span></>);
          const cls = "group inline-flex shrink-0 items-center gap-2 rounded-full border bg-card py-1.5 pl-1.5 pr-3 text-xs font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md";
          return l.desk ? <a key={l.to} href={l.to} target="_blank" rel="noreferrer" className={cls}>{body}</a> : <Link key={l.to} to={l.to} className={cls}>{body}</Link>;
        })}
      </div>
    </div>
  );

  if (isLoading || !d) {
    return <div className="space-y-5 p-4 sm:p-6">{header}<Skeleton className="h-48 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div></div>;
  }

  const sum = (k: keyof Head) => d.heads.reduce((a, h) => a + n0(h[k]), 0);
  const t = { budget: sum("budget"), actual: sum("actual"), committed: sum("committed"), paid: sum("paid"), payable: d.payable, consumed: sum("consumed") };
  const nWorks = d.categories.reduce((a, c) => a + n0(c.n), 0);
  const works = nWorks ? d.categories.reduce((a, c) => a + n0(c.pct) * n0(c.n), 0) / nWorks : 0;
  const worksDone = d.categories.reduce((a, c) => a + n0(c.done), 0);
  const remaining = Math.max(0, t.budget - t.actual - t.committed);
  const stockValue = d.stock.reduce((a, s) => a + n0(s.stock_value), 0);
  const assetValue = d.assets.reduce((a, s) => a + n0(s.value), 0);
  const badStock = d.stock.filter((s) => n0(s.stock_value) < 0);
  const maxStock = Math.max(1, ...d.stock.map((s) => n0(s.stock_value)));
  const maxBilled = Math.max(1, ...d.suppliers.map((s) => n0(s.billed)));
  const heads = [...d.heads].sort((a, b) => sort === "budget" ? b.budget - a.budget : sort === "used" ? n0(b.used_pct) - n0(a.used_pct) : n0(b.progress) - n0(a.progress));
  const spark = (k: "spent" | "billed" | "paid") => d.months.map((m) => m[k]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {header}

      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.12] via-transparent to-amber-500/[0.08]" />
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Development budget</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{money(t.budget, { compact: true })}</p>
            <p className="text-sm text-muted-foreground">
              {d.heads.length} cost heads · {num(nWorks)} tracked works · {num(d.open_mr)} open material requests · {num(d.open_po)} POs to receive / bill
            </p>
            <div className="space-y-2 pt-1">
              <div className="flex h-3.5 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border">
                <div title="Spent" style={{ width: `${pct(t.actual, Math.max(t.budget, t.actual + t.committed))}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.emerald})` }} />
                <div title="Committed" style={{ width: `${pct(t.committed, Math.max(t.budget, t.actual + t.committed))}%`, background: C.amber }} />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: C.teal }} />Spent <b className="text-foreground">{money(t.actual, { compact: true })}</b></span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: C.amber }} />Committed <b className="text-foreground">{money(t.committed, { compact: true })}</b></span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/30" />Remaining <b className="text-foreground">{money(remaining, { compact: true })}</b></span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-5 sm:gap-7">
            <Ring value={pct(t.actual + t.committed, t.budget)} label="Budget used" sub={`${money(t.actual + t.committed, { compact: true })} of ${money(t.budget, { compact: true })}`} color={C.teal} />
            <Ring value={works} label="Works complete" sub={`${num(worksDone)} / ${num(nWorks)} done`} color={C.amber} />
            <Ring value={pct(t.paid, t.paid + t.payable)} label="Suppliers paid" sub={`${money(t.payable, { compact: true })} payable`} color={C.violet} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Coins} label="Spent (GL)" value={money(t.actual, { compact: true })} sub={`${money(t.consumed, { compact: true })} material consumed`} spark={spark("spent")} color={C.teal} />
        <KpiCard icon={ReceiptText} label="Supplier bills" value={money(t.paid + t.payable, { compact: true })} sub={`${money(t.paid, { compact: true })} paid`} spark={spark("billed")} color={C.violet} progress={pct(t.paid, t.paid + t.payable)} />
        <KpiCard icon={Wallet} label="Payable to suppliers" value={money(t.payable, { compact: true })} sub={`${d.suppliers.filter((s) => s.outstanding > 0).length} suppliers owed`} color={C.rose}
          footer={<span className="flex flex-col gap-0.5"><span className="flex items-center gap-1"><ClipboardList className="size-3.5" /> {num(d.open_mr)} requests · {num(d.open_po)} open POs</span>
            {n0(d.payable_other) > 0 && <span>+ {money(d.payable_other, { compact: true })} owed on non-development bills</span>}</span>} />
        <KpiCard icon={Package} label="Assets" value={money(assetValue, { compact: true })} sub={`${num(d.assets.reduce((a, x) => a + n0(x.n), 0))} assets · site stock ${money(stockValue, { compact: true })}`} color={C.blue}
          footer={badStock.length > 0 && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3.5" /> {badStock.length} stock items with negative value</span>} />
      </div>

      <Highlights items={insights(d, { ...t, works })} />

      {/* cost heads */}
      <Panel title="Cost heads" sub="Money used vs work done — each head is an ERPNext Project" icon={Landmark}
        action={<Segmented value={sort} onChange={setSort} options={[["budget", "Budget"], ["used", "Used %"], ["progress", "Progress"]]} />}>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {heads.map((h) => {
            const hl = health(h);
            const base = Math.max(h.budget, h.actual + h.committed) || 1;
            return (
              <Link key={h.project} to={`/projects/${encodeURIComponent(h.project)}`}
                className="group relative overflow-hidden rounded-xl border bg-background/60 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: hl.tone }} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold group-hover:text-primary">{h.head}</p>
                    <p className="text-[11px] text-muted-foreground">{h.project}{h.features ? ` · ${h.features_done}/${h.features} works done` : ""}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", hl.cls)}>{hl.label}</span>
                </div>
                <div className="mt-3 space-y-2.5">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Spent <b className="text-foreground">{money(h.actual, { compact: true })}</b>{h.committed ? ` + ${money(h.committed, { compact: true })}` : ""}</span>
                      <span>{h.budget ? <>of {money(h.budget, { compact: true })} · <b className="text-foreground">{n0(h.used_pct).toFixed(0)}%</b></> : "no budget"}</span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                      <div style={{ width: `${pct(h.actual, base)}%`, background: h.budget && h.actual + h.committed > h.budget ? C.red : C.teal }} />
                      <div style={{ width: `${pct(h.committed, base)}%`, background: C.amber }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Work done</span><b className="text-foreground">{h.progress === null ? "—" : `${h.progress.toFixed(0)}%`}</b>
                    </div>
                    <Bar100 value={n0(h.progress)} color={C.amber} />
                  </div>
                </div>
                {h.payable > 0 && <p className="mt-2.5 border-t pt-2 text-[11px] text-muted-foreground">Payable <b className="text-rose-600 dark:text-rose-400">{money(h.payable, { compact: true })}</b> · paid {money(h.paid, { compact: true })}</p>}
              </Link>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartCard title="Monthly spend" sub="Last 12 months — expense booked (bars), supplier bills and payments (lines)">
          <ResponsiveContainer>
            <ComposedChart data={d.months.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs><linearGradient id="dev-spent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} /><stop offset="100%" stopColor={C.emerald} stopOpacity={0.45} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke={ct.grid} />
              <XAxis dataKey="label" tick={ct.tick} stroke={ct.axis} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={axisShort} tick={ct.tick} stroke={ct.axis} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              {lt.legend}
              {lt.series([
                <Bar key="spent" dataKey="spent" name="Spent" fill="url(#dev-spent)" radius={[6, 6, 0, 0]} maxBarSize={34} />,
                <Line key="billed" dataKey="billed" name="Billed" stroke={C.violet} strokeWidth={2} dot={false} type="monotone" />,
                <Line key="paid" dataKey="paid" name="Paid" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} type="monotone" />,
              ])}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <Panel title="Works progress" sub="Roads, utilities and buildings on the map" icon={HardHat}>
          <div className="grid grid-cols-2 gap-3">
            {d.categories.map((c, i) => (
              <div key={c.category} className="flex flex-col items-center rounded-xl border bg-background/60 p-3">
                <Ring value={c.pct} label={c.category} sub={`${num(c.done)}/${num(c.n)} done · ${num(c.wip)} active`} color={CAT[i % CAT.length]} size={84} />
              </div>
            ))}
          </div>
          <Link to="/re/map" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Open the society map →</Link>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Work by type" sub="Completion of each kind of work" icon={GaugeIcon}>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {[...d.progress].sort((a, b) => a.pct - b.pct).map((p) => (
              <li key={p.feature_type}>
                <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate font-medium">{p.feature_type}</span>
                  <span className="shrink-0 text-muted-foreground">{num(p.done)}/{num(p.n)} · <b className="text-foreground">{Math.round(p.pct)}%</b></span></div>
                <Bar100 value={p.pct} color={p.pct >= 100 ? C.emerald : p.pct >= 70 ? C.teal : C.amber} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Contractors" sub="Works assigned and how far along they are" icon={Users}>
          <ul className="space-y-3">
            {d.contractors.map((c) => (
              <li key={c.contractor} className="flex items-center gap-3">
                <Ring value={c.pct} label={c.contractor} color={c.pct >= 80 ? C.emerald : c.pct >= 60 ? C.teal : C.amber} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.contractor}</p>
                  <p className="text-[11px] text-muted-foreground">{num(c.n)} works · {num(c.done)} completed · {num(c.n - c.done)} open</p>
                </div>
              </li>
            ))}
            {!d.contractors.length && <li className="text-sm text-muted-foreground">No contractors assigned on the map.</li>}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Suppliers" sub="Billed against development heads and still owed" icon={Truck}>
          <ul className="space-y-3">
            {d.suppliers.map((s) => {
              const late = s.outstanding > 0 && s.oldest_due && s.oldest_due < todayISO();
              return (
                <li key={s.supplier}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{s.supplier}</span>
                    <span className="shrink-0 text-xs text-muted-foreground"><b className="text-foreground">{money(s.billed, { compact: true })}</b> · {num(s.invoices)} bills</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(12, pct(s.billed, maxBilled))}%` }}>
                    <div style={{ width: `${pct(s.billed - s.outstanding, s.billed)}%`, background: C.violet }} />
                    <div style={{ width: `${pct(s.outstanding, s.billed)}%`, background: late ? C.red : C.rose, opacity: 0.75 }} />
                  </div>
                  {s.outstanding > 0 && (
                    <p className={cn("mt-1 flex items-center gap-1 text-[11px]", late ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {late && <AlertTriangle className="size-3" />}Owed {money(s.outstanding, { compact: true })}{s.oldest_due ? ` · due ${date(s.oldest_due)}` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Purchase pipeline" sub="Material requests and orders still open" icon={ShoppingCart}>
          <ul className="divide-y">
            {d.requests.map((r) => (
              <li key={r.name}>
                <a href={`/desk/material-request/${encodeURIComponent(r.name)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 hover:text-primary">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><ClipboardList className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.material_request_type} · {r.status} · {num(r.items)} item{r.items === 1 ? "" : "s"}{r.schedule_date ? ` · needed ${date(r.schedule_date)}` : ""}</span></span>
                  <b className="text-sm tabular-nums">{money(r.amount, { compact: true })}</b>
                </a>
              </li>
            ))}
            {d.orders.map((o) => (
              <li key={o.name}>
                <a href={`/desk/purchase-order/${encodeURIComponent(o.name)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 hover:text-primary">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><ShoppingCart className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{o.supplier}</span>
                    <span className="block text-[11px] text-muted-foreground">{o.name} · {n0(o.per_received).toFixed(0)}% received · {n0(o.per_billed).toFixed(0)}% billed</span></span>
                  <b className="text-sm tabular-nums">{money(o.amount, { compact: true })}</b>
                </a>
              </li>
            ))}
            {!d.requests.length && !d.orders.length && <li className="py-2 text-sm text-muted-foreground">Nothing pending.</li>}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Assets" sub={`ERPNext Assets by category · ${money(assetValue, { compact: true })}`} bodyClass="h-auto">
          <Donut data={d.assets.map((a) => ({ name: a.category, value: n0(a.value) }))} centerLabel="Assets" centerValue={money(assetValue, { compact: true })}
            fmt={(v) => money(v, { compact: true })} legendFmt={(s) => `${money(s.value, { compact: true })} · ${d.assets.find((a) => a.category === s.name)?.n ?? 0} items`} />
        </ChartCard>
        <Panel title="Site store stock" sub={`Construction material & plantation on hand · ${money(stockValue, { compact: true })}`} icon={Boxes}>
          <ul className="space-y-2.5">
            {d.stock.map((s) => (
              <li key={s.item_code}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span className="truncate"><span className="font-medium">{s.item_name}</span> <span className="text-muted-foreground">· {num(s.actual_qty)} {s.stock_uom}</span></span>
                  <b className={cn("shrink-0 tabular-nums", n0(s.stock_value) < 0 && "text-red-600 dark:text-red-400")} title={n0(s.stock_value) < 0 ? "Negative stock value — check the valuation rate" : undefined}>
                    {n0(s.stock_value) < 0 && <AlertTriangle className="mr-1 inline size-3" />}{money(s.stock_value, { compact: true })}</b>
                </div>
                <Bar100 value={pct(s.stock_value, maxStock)} color={s.item_group.toLowerCase().includes("plant") ? C.emerald : C.sky} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
