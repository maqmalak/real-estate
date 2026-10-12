/**
 * Plot sizes side by side (RE Plot Size list and form). Pick a measure to compare every size on one chart, click a bar or
 * a size card to open its detail (stock, collections, block split, premium plots, latest bookings) — the choice is kept in
 * the URL (?size=). On a size's own form the same view opens on that size. Server: realestate.spa.size_overview.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BadgePercent, Building2, CalendarClock, Crown, Gauge, Layers, Ruler, Sparkles, Timer, TrendingUp, Wallet, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartTip, Highlights, KpiCard, Segmented, Sparkline, useChartTheme, type Highlight } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";
import { Bar100, n0, Panel, pct, Ring } from "./ProjectProfile";

interface Size {
  name: string; plot_type: string; area_marla: number; width_ft: number; depth_ft: number; base_price: number; monthly_maintenance: number;
  plots: { n?: number; available?: number; sold?: number; held?: number; possessed?: number; avg_price?: number; min_price?: number; max_price?: number;
    value?: number; stock_value?: number; marla?: number; corner?: number; park?: number; boulevard?: number };
  sales: { bookings?: number; net?: number; paid?: number; outstanding?: number; overdue?: number; overdue_count?: number; discount?: number; gross?: number; d30?: number; d90?: number };
  per_month: number; months_left: number | null;
  blocks: { block: string; n: number; sold: number; available: number }[];
  trend: number[];
  recent: { plot: string; customer_name: string; net_price: number; booking_date: string }[];
}
interface Overview { sizes: Size[]; months: string[]; scope: { agent: boolean } }

type Measure = "sold" | "stock" | "pace" | "per_marla" | "months";
const MEASURES: [Measure, string][] = [["sold", "Sold %"], ["stock", "Stock value"], ["pace", "Pace / month"], ["per_marla", "Price / marla"], ["months", "Months of stock"]];
const PALETTE = [C.blue, C.violet, C.teal, C.amber, C.rose, C.sky, C.emerald, C.orange];
const perMarla = (s: Size) => (s.area_marla ? n0(s.plots.avg_price) / s.area_marla : 0);
const soldPct = (s: Size) => pct(n0(s.plots.sold), n0(s.plots.n));
const markup = (s: Size) => (s.base_price ? pct(n0(s.plots.avg_price) - s.base_price, s.base_price) : 0);

function value(s: Size, m: Measure): number {
  return m === "sold" ? soldPct(s) : m === "stock" ? n0(s.plots.stock_value) : m === "pace" ? s.per_month : m === "per_marla" ? perMarla(s) : n0(s.months_left);
}
function fmt(v: number, m: Measure): string {
  return m === "sold" ? `${v.toFixed(0)}%` : m === "stock" || m === "per_marla" ? money(v, { compact: true }) : m === "pace" ? v.toFixed(1) : `${v.toFixed(0)} mo`;
}

function insights(sizes: Size[]): Highlight[] {
  const out: Highlight[] = [];
  const live = sizes.filter((s) => n0(s.plots.n) > 0);
  if (live.length < 2) return out;
  const by = (f: (s: Size) => number) => [...live].sort((a, b) => f(b) - f(a));
  const best = by(soldPct), fast = by((s) => s.per_month), pm = by(perMarla), mk = by(markup);
  out.push({ tone: "good", text: `${best[0].name} sells best (${soldPct(best[0]).toFixed(0)}% sold); ${best[best.length - 1].name} is slowest at ${soldPct(best[best.length - 1]).toFixed(0)}%.` });
  out.push({ tone: "info", text: `${fast[0].name} moves fastest — ${fast[0].per_month.toFixed(1)} bookings a month over the last 90 days.` });
  out.push({ tone: "info", text: `${pm[0].name} earns the most per marla (${money(perMarla(pm[0]), { compact: true })}), ${(perMarla(pm[0]) / Math.max(perMarla(pm[pm.length - 1]), 1)).toFixed(1)}× ${pm[pm.length - 1].name}.` });
  if (Math.abs(markup(mk[0])) >= 0.5) out.push({ tone: "good", text: `${mk[0].name} lists ${markup(mk[0]).toFixed(1)}% above its base price — the largest premium.` });
  const slow = live.filter((s) => s.months_left !== null && n0(s.months_left) > 24).sort((a, b) => n0(b.months_left) - n0(a.months_left));
  if (slow.length) out.push({ tone: "warn", text: `${slow.map((s) => `${s.name} (${n0(s.months_left).toFixed(0)} mo)`).join(", ")} ${slow.length > 1 ? "have" : "has"} over two years of stock at the current pace — consider a promotion.` });
  const od = by((s) => n0(s.sales.overdue))[0];
  if (n0(od.sales.overdue) > 0) out.push({ tone: "bad", text: `${od.name} carries the most overdue: ${money(od.sales.overdue, { compact: true })} on ${num(od.sales.overdue_count)} bookings.` });
  return out;
}

export function SizeInsights({ fixed }: { fixed?: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["size-overview"], queryFn: () => get<Overview>("realestate.spa.size_overview"), staleTime: 60_000 });
  const [params, setParams] = useSearchParams();
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const measure = (params.get("measure") as Measure) || "sold";
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: k === "measure" }); };

  if (isLoading || !data) return <div className="space-y-3"><Skeleton className="h-64 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div></div>;
  const sizes = data.sizes;
  const selected = fixed ?? params.get("size") ?? "";
  const sel = sizes.find((s) => s.name === selected);
  const colorOf = (name: string) => PALETTE[Math.max(0, sizes.findIndex((s) => s.name === name)) % PALETTE.length];
  const chart = sizes.map((s) => ({ name: s.name, v: value(s, measure), color: colorOf(s.name) }));
  const pick = (name: string) => (fixed ? undefined : set("size", selected === name ? "" : name));

  return (
    <div className="space-y-4">
      {/* compare */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"><Sparkles className="size-4" /></span>
            <div>
              <h3 className="text-sm font-semibold">Compare plot sizes</h3>
              <p className="text-xs text-muted-foreground">{fixed ? `${fixed} highlighted` : "Click a bar or a card to open a size"}{data.scope.agent ? " · sales are your own" : ""}</p>
            </div>
          </div>
          <Segmented accent value={measure} onChange={(v) => set("measure", v === "sold" ? "" : v)} options={MEASURES} />
        </header>
        <div className="h-64 px-2 py-3 sm:px-4">
          <ResponsiveContainer>
            <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="name" width={130} tick={{ ...t.tick, fill: t.axis }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} content={<ChartTip fmt={(v) => fmt(Number(v), measure)} />} />
              <Bar dataKey="v" name={MEASURES.find(([k]) => k === measure)?.[1]} radius={[0, 8, 8, 0]} maxBarSize={26} onClick={(e: { name?: string }) => e.name && pick(e.name)} className="cursor-pointer">
                {chart.map((c) => <Cell key={c.name} fill={c.color} opacity={!selected || selected === c.name ? 1 : 0.3} />)}
                <LabelList dataKey="v" position="right" formatter={(v: number) => fmt(v, measure)} className="fill-foreground text-[11px] font-semibold" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {!fixed && <Highlights items={insights(sizes)} />}

      {/* size cards */}
      {!fixed && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sizes.map((s) => {
            const c = colorOf(s.name), on = selected === s.name, sp = soldPct(s);
            return (
              <button key={s.name} type="button" onClick={() => pick(s.name)} aria-pressed={on}
                className={cn("group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
                  on && "ring-2 ring-offset-2 ring-offset-background", selected && !on && "opacity-60 hover:opacity-100")}
                style={on ? { ["--tw-ring-color" as string]: c } : undefined}>
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: c }} />
                <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${c}14, transparent 60%)` }} />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold tracking-tight">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.plot_type} · {num(s.area_marla)} marla{s.width_ft ? ` · ${s.width_ft}×${s.depth_ft} ft` : ""}</p>
                  </div>
                  <Ring value={sp} label="Sold" color={c} size={56} />
                </div>
                <div className="relative mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                  <Stat k="Avg price" v={money(s.plots.avg_price, { compact: true })} />
                  <Stat k="Per marla" v={money(perMarla(s), { compact: true })} />
                  <Stat k="vs base" v={`${markup(s) >= 0 ? "+" : ""}${markup(s).toFixed(1)}%`} tone={markup(s) > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined} />
                </div>
                <div className="relative mt-3 flex items-end justify-between gap-3">
                  <div className="text-[11px] text-muted-foreground">
                    <p><b className="text-foreground">{num(s.plots.available)}</b> left of {num(s.plots.n)} · {money(s.plots.stock_value, { compact: true })}</p>
                    <p>{s.per_month.toFixed(1)}/month · {s.months_left === null ? "no recent sales" : `${n0(s.months_left).toFixed(0)} months of stock`}</p>
                  </div>
                  <div className="w-24 shrink-0"><Sparkline data={s.trend} color={c} height={30} /></div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {sel ? <SizeDetail s={sel} color={colorOf(sel.name)} onClose={fixed ? undefined : () => set("size", "")} months={data.months} />
        : !fixed && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Select a size above to see its stock, collections, blocks and latest bookings.</p>}
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="rounded-lg bg-muted/60 px-1 py-1.5"><p className={cn("font-semibold tabular-nums text-foreground", tone)}>{v}</p><p className="text-muted-foreground">{k}</p></div>;
}

function SizeDetail({ s, color, onClose, months }: { s: Size; color: string; onClose?: () => void; months: string[] }) {
  const p = s.plots, b = s.sales;
  const collected = pct(n0(b.paid), n0(b.net));
  const disc = n0(b.gross) ? pct(n0(b.discount), n0(b.gross)) : 0;
  const maxTrend = Math.max(1, ...s.trend);
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5" style={{ borderColor: `${color}66` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl text-white shadow-md" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}><Ruler className="size-5" /></span>
          <div>
            <h3 className="text-lg font-bold tracking-tight">{s.name}</h3>
            <p className="text-xs text-muted-foreground">{s.plot_type} · {num(s.area_marla)} marla · base {money(s.base_price, { compact: true })} · maintenance {money(s.monthly_maintenance)}/month</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/re/d/re-plot?plot_size=${encodeURIComponent(s.name)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90">
            View {num(p.n)} plots <ArrowRight className="size-3.5" />
          </Link>
          <Link to={`/re/d/re-plot?plot_size=${encodeURIComponent(s.name)}&status=Available`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted">{num(p.available)} available</Link>
          {onClose && <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted"><X className="mr-1 size-3.5" />Close</button>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Layers} label="Unsold stock" value={money(p.stock_value, { compact: true })} sub={`${num(p.available)} of ${num(p.n)} plots · ${num(p.held)} on hold`} progress={pct(n0(p.available), n0(p.n))} color={color} />
        <KpiCard icon={TrendingUp} label="Sales" value={money(b.net, { compact: true })} sub={`${num(b.bookings)} bookings · ${num(b.d30)} in 30 days`} spark={s.trend} color={C.indigo} />
        <KpiCard icon={Wallet} label="Collected" value={money(b.paid, { compact: true })} sub={`${collected.toFixed(0)}% of sales`} progress={collected} color={C.emerald}
          footer={n0(b.overdue) > 0 && <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3.5" />Overdue <b>{money(b.overdue, { compact: true })}</b> · {num(b.overdue_count)}</span>} />
        <KpiCard icon={BadgePercent} label="Avg discount" value={`${disc.toFixed(1)}%`} sub={`${money(b.discount, { compact: true })} on ${money(b.gross, { compact: true })} list`} color={C.amber} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Blocks" sub="Where this size sits" icon={Building2}>
          <ul className="space-y-3">
            {s.blocks.map((x) => (
              <li key={x.block}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <Link to={`/re/d/re-plot?block=${encodeURIComponent(x.block)}&plot_size=${encodeURIComponent(s.name)}`} className="font-medium hover:text-primary">{x.block}</Link>
                  <span className="text-muted-foreground"><b className="text-foreground">{num(x.sold)}</b>/{num(x.n)} sold · {num(x.available)} left</span>
                </div>
                <Bar100 value={pct(n0(x.sold), n0(x.n))} color={color} />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <Stat k="Corner" v={num(p.corner)} /><Stat k="Park" v={num(p.park)} /><Stat k="Boulevard" v={num(p.boulevard)} />
          </div>
        </Panel>

        <Panel title="Booking trend" sub="Bookings per month, last 12 months" icon={CalendarClock}>
          <div className="flex h-32 items-end gap-1">
            {s.trend.map((v, i) => (
              <div key={i} className="group relative flex flex-1 flex-col items-center justify-end" title={`${months[i]}: ${v}`}>
                <span className="mb-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">{v}</span>
                <span className="w-full rounded-t transition-all group-hover:opacity-80" style={{ height: `${Math.max(v ? 8 : 2, (v / maxTrend) * 100)}%`, background: v ? color : "hsl(var(--muted))" }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{months[0]}</span><span>{months[months.length - 1]}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-center text-[11px]">
            <Stat k="Per month (90d)" v={s.per_month.toFixed(1)} />
            <Stat k="Months of stock" v={s.months_left === null ? "—" : n0(s.months_left).toFixed(0)} tone={n0(s.months_left) > 24 ? "text-amber-600" : undefined} />
          </div>
        </Panel>

        <Panel title="Pricing & latest bookings" sub="List price range and what sold last" icon={Gauge}>
          <div className="space-y-1.5 text-xs">
            <p className="flex justify-between"><span className="text-muted-foreground">Base price</span><b className="tabular-nums">{money(s.base_price, { compact: true })}</b></p>
            <p className="flex justify-between"><span className="text-muted-foreground">List range</span><b className="tabular-nums">{money(p.min_price, { compact: true })}{n0(p.min_price) !== n0(p.max_price) ? ` – ${money(p.max_price, { compact: true })}` : ""}</b></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Per marla</span><b className="tabular-nums">{money(perMarla(s), { compact: true })}</b></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Possession given</span><b className="tabular-nums">{num(p.possessed)}</b></p>
          </div>
          <ul className="mt-3 space-y-1 border-t pt-2">
            {s.recent.map((r) => (
              <li key={r.plot + r.booking_date} className="flex items-baseline gap-2 text-xs">
                <Link to={`/re/d/re-plot/${encodeURIComponent(r.plot)}`} className="font-semibold text-primary hover:underline">{r.plot}</Link>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.customer_name}</span>
                <span className="text-muted-foreground">{date(r.booking_date)}</span>
              </li>
            ))}
            {!s.recent.length && <li className="text-xs text-muted-foreground">No bookings yet.</li>}
          </ul>
          {n0(s.months_left) > 24 && <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-600"><Timer className="size-3.5" /><Crown className="size-3.5" />Slow mover — a price or payment-plan offer could help.</p>}
        </Panel>
      </div>
    </section>
  );
}
