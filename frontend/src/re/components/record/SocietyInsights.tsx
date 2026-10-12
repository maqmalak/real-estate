/**
 * Society bill list insights: this month billed / collected / cash, outstanding and overdue, chronic defaulters,
 * 12-month billed vs collected with the collection-rate line, outstanding by age, blocks ranked by collection (click to
 * filter the list), charge-head mix, this month's statuses and the owners furthest behind.
 * Data: realestate.spa.society_overview (block from the list's URL filter).
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CalendarRange, HandCoins, Receipt, UserX } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  axisShort, C, ChartCard, ChartTip, DataTable, Donut, GRADIENTS, Highlights, KpiCard, pctDelta, SeriesLegend, useChartTheme, useSeriesPrefs, type Highlight,
} from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

interface Overview {
  kpis: {
    billed: number; collected: number; rate: number; rate_prev: number; bills: number; billed_prev: number; cash_month: number; cash_prev: number;
    outstanding: number; open_bills: number; overdue: number; overdue_bills: number; owners_due: number; plots: number; chronic: number; rate3: number;
  };
  monthly: { month: string; billed: number; collected: number; outstanding: number; bills: number; cash: number; rate: number | null }[];
  aging: { name: string; value: number }[];
  blocks: { block: string; plots: number; billed: number; collected: number; outstanding: number; overdue_bills: number; rate: number }[];
  heads: { name: string; value: number }[];
  statuses: { name: string; value: number }[];
  defaulters: { customer: string; customer_name: string; plots: string; months: number; outstanding: number; oldest: string; last_paid: string | null }[];
  highlights: Highlight[];
}

const SERIES = [
  { key: "billed", label: "Billed", style: GRADIENTS[3] },
  { key: "collected", label: "Collected (of that month's bills)", style: GRADIENTS[0] },
  { key: "cash", label: "Cash received", style: GRADIENTS[5] },
  { key: "rate", label: "Collection rate %", style: GRADIENTS[7] },
] as const;
const AGE_COLORS = [C.slate, C.amber, C.orange, C.red, "#991b1b"];
const STATUS_COLORS: Record<string, string> = { Paid: C.green, Due: C.amber, Overdue: C.red, Unpaid: C.blue, "Partly Paid": C.violet };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

export function SocietyInsights() {
  const [params, setParams] = useSearchParams();
  const block = params.get("block") ?? "";
  const { data: d, isLoading } = useQuery({
    queryKey: ["society-overview", block],
    queryFn: () => get<Overview>("realestate.spa.society_overview", { block: block || undefined }),
  });
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const prefs = useSeriesPrefs("re-society-monthly", Object.fromEntries(SERIES.map((s) => [s.key, { from: s.style.from, to: s.style.to }])));
  const monthly = useMemo(() => {
    const rows = d?.monthly ?? [];
    const first = rows.findIndex((r) => r.billed > 0 || r.cash > 0);
    return rows.slice(Math.max(0, first)).map((r) => ({ ...r, label: monthLabel(r.month) }));
  }, [d]);
  const setBlock = (b: string) => {
    const next = new URLSearchParams(params);
    if (b && b !== block) next.set("block", b);
    else next.delete("block");
    setParams(next, { replace: true });
  };

  if (isLoading || !d) return <Skeleton className="h-72" />;
  const k = d.kpis;
  const agingTotal = d.aging.reduce((a, x) => a + x.value, 0) || 1;
  const maxRate = Math.max(100, ...d.blocks.map((b) => b.rate));

  return (
    <div className="space-y-4">
      {block && (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">{block}</span>
          <button type="button" onClick={() => setBlock("")} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Show all blocks</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard icon={Receipt} label="Billed this month" value={money(k.billed, { compact: true })} color={C.blue}
          delta={pctDelta(k.billed, k.billed_prev)} sub={`${num(k.bills)} bills · ${num(k.plots)} plots`} />
        <KpiCard icon={HandCoins} label="Collected this month" value={money(k.collected, { compact: true })} color={C.green} progress={k.rate}
          sub={`${k.rate.toFixed(0)}% of this month's bills · last month ${k.rate_prev.toFixed(0)}%`} />
        <KpiCard icon={Banknote} label="Cash received" value={money(k.cash_month, { compact: true })} color={C.teal}
          delta={pctDelta(k.cash_month, k.cash_prev)} sub="all society receipts this month" />
        <KpiCard icon={CalendarRange} label="Outstanding" value={money(k.outstanding, { compact: true })} color={C.violet}
          sub={`${num(k.open_bills)} open bills · ${num(k.owners_due)} owners`} />
        <KpiCard icon={AlertTriangle} label="Overdue" value={money(k.overdue, { compact: true })} color={k.overdue > 0 ? C.red : C.slate}
          sub={`${num(k.overdue_bills)} bills past their due date`} />
        <KpiCard icon={UserX} label="Chronic defaulters" value={num(k.chronic)} color={k.chronic > 0 ? C.orange : C.slate}
          sub="owners with 3+ unpaid bills" footer={<>3-month collection rate <b>{k.rate3.toFixed(0)}%</b></>} />
      </div>

      <Highlights items={d.highlights} />

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Billed vs collected" sub="Each month's bills and how much of them is paid; cash is everything received that month (incl. arrears)"
          bodyClass="h-80" insight={<>Collection rate this month <b>{k.rate.toFixed(0)}%</b> so far · last 3 months <b>{k.rate3.toFixed(0)}%</b>.</>}>
          <div className="flex h-full flex-col gap-2">
            <SeriesLegend series={SERIES.map((s) => ({ key: s.key, label: s.label }))} colors={prefs.colors} hidden={prefs.hidden}
              onToggle={prefs.toggle} onColor={prefs.setColor} onReset={prefs.reset} customised={prefs.customised} onSetHidden={prefs.setHidden} />
            <div className="min-h-0 flex-1">
              <ResponsiveContainer>
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient key={s.key} id={`sb-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={prefs.colors[s.key].from} /><stop offset="100%" stopColor={prefs.colors[s.key].to} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} stroke={t.grid} />
                  <XAxis dataKey="label" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="rs" tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={48} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<ChartTip fmt={(v, key) => (key === "rate" ? `${v}%` : money(v))} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  {!prefs.hidden.has("billed") && <Bar yAxisId="rs" dataKey="billed" name="Billed" fill="url(#sb-billed)" radius={[4, 4, 0, 0]} maxBarSize={24} />}
                  {!prefs.hidden.has("collected") && <Bar yAxisId="rs" dataKey="collected" name="Collected" fill="url(#sb-collected)" radius={[4, 4, 0, 0]} maxBarSize={24} />}
                  {!prefs.hidden.has("cash") && <Bar yAxisId="rs" dataKey="cash" name="Cash received" fill="url(#sb-cash)" radius={[4, 4, 0, 0]} maxBarSize={24} />}
                  {!prefs.hidden.has("rate") && <Line yAxisId="pct" dataKey="rate" name="Collection rate %" stroke={prefs.colors.rate.to} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Outstanding by age (days)" sub="Unpaid society money by age — days past the bill's due date" bodyClass="h-auto"
          insight={<>{money(d.aging[3].value + d.aging[4].value, { compact: true })} is over 60 days late.</>}>
          <ul className="space-y-3 pt-1">
            {d.aging.map((a, i) => (
              <li key={a.name}>
                <div className="flex justify-between text-sm"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: AGE_COLORS[i] }} />{a.name}</span>
                  <span className="tabular-nums text-muted-foreground">{money(a.value, { compact: true })} · {((a.value * 100) / agingTotal).toFixed(0)}%</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${(a.value * 100) / agingTotal}%`, background: AGE_COLORS[i] }} /></div>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Collection by block" sub="Last 12 months — click a block to filter the list" bodyClass="h-auto">
          <ul className="space-y-2.5">
            {d.blocks.map((b) => {
              const on = block === b.block;
              const tone = b.rate >= 85 ? C.green : b.rate >= 70 ? C.amber : C.red;
              return (
                <li key={b.block}>
                  <button type="button" onClick={() => setBlock(b.block)}
                    className={cn("w-full rounded-xl border p-2.5 text-left transition hover:border-primary/50", on ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : "bg-card")}>
                    <div className="flex items-center justify-between text-sm"><span className="font-semibold">{b.block}</span>
                      <span className="font-bold tabular-nums" style={{ color: tone }}>{b.rate.toFixed(0)}%</span></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(b.rate * 100) / maxRate}%`, background: tone }} /></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{num(b.plots)} plots · billed {money(b.billed, { compact: true })} · outstanding {money(b.outstanding, { compact: true })} · {num(b.overdue_bills)} overdue</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </ChartCard>
        <ChartCard title="Charge heads" sub="What society bills are made of (12 months)" bodyClass="h-auto">
          <Donut data={d.heads.map((h, i) => ({ ...h, color: [C.blue, C.teal, C.amber, C.violet, C.rose, C.sky, C.emerald][i % 7] }))} centerLabel="Billed"
            fmt={(v) => money(v, { compact: true })} height={200} />
        </ChartCard>
        <ChartCard title="This month's bills" sub="By status" bodyClass="h-auto">
          <div className="h-[200px] overflow-hidden">
            <Donut data={d.statuses.map((s) => ({ ...s, color: STATUS_COLORS[s.name] ?? C.slate }))} centerLabel="Bills" height={190} />
          </div>
          <div className="mt-3 border-t pt-2">
            <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Collection rate — last 6 months</span>
              <span className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: C.green }} />85%+</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: C.amber }} />70–85%</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: C.red }} />below 70%</span>
              </span>
            </p>
            <div className="mt-1 h-28 overflow-hidden">
              <ResponsiveContainer>
                <BarChart data={monthly.slice(-6)} margin={{ top: 14, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Bar dataKey="rate" name="Collection rate" radius={[4, 4, 0, 0]} maxBarSize={26}
                    label={{ position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))", formatter: (v: number) => (v ? `${Math.round(v)}%` : "") }}>
                    {monthly.slice(-6).map((m) => <Cell key={m.month} fill={(m.rate ?? 0) >= 85 ? C.green : (m.rate ?? 0) >= 70 ? C.amber : C.red} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Owners furthest behind" sub="Unpaid society bills past their due date — open an owner to call, chat or send a notice" bodyClass="h-auto">
        <DataTable rows={d.defaulters} rowKey={(r) => r.customer} rank dense initialSort={{ key: "outstanding", dir: "desc" }}
          cols={[
            { key: "customer_name", label: "Owner", render: (r) => <Link to={`/re/customers/${encodeURIComponent(r.customer)}`} className="font-medium text-primary hover:underline">{r.customer_name}</Link> },
            { key: "plots", label: "Plots", hideSm: true },
            { key: "months", label: "Unpaid bills", align: "right", value: (r) => r.months, render: (r) => <span className={cn("font-semibold tabular-nums", r.months >= 3 && "text-red-600 dark:text-red-400")}>{r.months}</span> },
            { key: "oldest", label: "Oldest due", value: (r) => r.oldest, render: (r) => date(r.oldest), hideSm: true },
            { key: "last_paid", label: "Last paid", value: (r) => r.last_paid ?? "", render: (r) => (r.last_paid ? date(r.last_paid) : "never"), hideSm: true },
            { key: "outstanding", label: "Outstanding", align: "right", value: (r) => r.outstanding, render: (r) => money(r.outstanding), bar: { color: C.red } },
          ]} />
      </ChartCard>
    </div>
  );
}
