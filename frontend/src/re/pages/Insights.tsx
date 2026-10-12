/**
 * Management insights (/re/insights): 12-month analytics in sections — Overview, Sales & inventory, Collections &
 * receivables, CRM & agents, Finance & society. Rolling 3-month comparisons, efficiency, forecast, mixes,
 * scorecards and plain-language highlights (realestate.spa.insights + realestate.analytics).
 */
import { useQuery } from "@tanstack/react-query";
import { Banknote, CircleDollarSign, HandCoins, Landmark, PiggyBank, Receipt, ShoppingBag, Target } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Avatar, axisShort, C, ChartCard, OpacityControl, SeriesLegend, useChartOpacity, useSeriesPrefs, ChartTip, compact, DataTable, Donut, Highlights, KpiCard, pctDelta, Segmented, SERIES, STATUS_TONE, useChartTheme, useLegendToggle,
} from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import type { AgentScore, InsightsExtra, SizeMix, SourceRow } from "@/re/lib/analytics-types";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

interface Insights {
  extra: InsightsExtra;
  modes: { mode: string; amount: number }[];
  funnel: { stage: string; count: number }[];
  defaulters: { customer: string; customer_name: string; plots: number; overdue: number; since: string }[];
  society: { month: string; income: number; expense: number }[];
  economics: { land: number; development: number; infrastructure: number; booked: number; received: number; unsold: number; receivable: number; projected_margin: number };
}
type Section = "all" | "sales" | "collections" | "crm" | "finance";
const SECTIONS: [Section, string][] = [["all", "Everything"], ["sales", "Sales & inventory"], ["collections", "Collections"], ["crm", "CRM & agents"], ["finance", "Finance & society"]];

function SectionTitle({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div id={id} className="flex items-end justify-between gap-3 pt-2">
      <div><h2 className="text-lg font-bold tracking-tight">{title}</h2><p className="text-xs text-muted-foreground">{sub}</p></div>
    </div>
  );
}

export function InsightsPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [section, setSection] = useState<Section>("all");
  // chart colours / visibility chosen by the user (remembered in this browser)
  const streamPrefs = useSeriesPrefs("re-chart-streams", { installments: { from: "#2dd4bf", to: "#0f766e" }, society: { from: "#fcd34d", to: "#d97706" }, surcharge: { from: "#fda4af", to: "#e11d48" } });
  const [streamOpacity, setStreamOpacity] = useChartOpacity("re-chart-streams-opacity", 0.55);
  const salesLt = useLegendToggle();
  const blockLt = useLegendToggle();
  const finLt = useLegendToggle();
  const cumPrefs = useSeriesPrefs("re-chart-cumulative", { cumulative_booked: { from: "#a5b4fc", to: "#6366f1" }, bookings: { from: "#7dd3fc", to: "#0284c7" } });
  const { data, isLoading } = useQuery({ queryKey: ["re-insights"], queryFn: () => get<Insights>("realestate.spa.insights") });
  if (isLoading || !data) {
    return <div className="grid gap-4 p-6 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>;
  }
  const x = data.extra;
  const e = data.economics;
  const tr = x.trend;
  const show = (s: Section) => section === "all" || section === s;
  const cmp = x.compare;
  const avgTicket = (cmp.booked.now / Math.max(cmp.bookings.now, 1));
  const avgTicketBefore = (cmp.booked.before / Math.max(cmp.bookings.before, 1));
  const effAvg = tr.filter((r) => r.due).reduce((s, r, _i, arr) => s + r.efficiency / arr.length, 0);
  const funnel = data.funnel;
  const waterfall = (() => {
    const steps: [string, number][] = [["Sales booked", e.booked], ["Unsold stock", e.unsold], ["Land", -e.land], ["Development", -e.development], ["Infrastructure", -e.infrastructure]];
    let run = 0;
    const rows = steps.map(([name, v]) => {
      const base = v >= 0 ? run : run + v;
      run += v;
      return { name, base, value: Math.abs(v), color: v >= 0 ? C.teal : C.rose };
    });
    rows.push({ name: "Projected margin", base: 0, value: run, color: run >= 0 ? C.indigo : C.red });
    return rows;
  })();
  const societyRows = data.society.map((s) => ({ ...s, margin: s.income - s.expense }));
  const socIncome = societyRows.reduce((s, r) => s + r.income, 0);
  const socExpense = societyRows.reduce((s, r) => s + r.expense, 0);
  const bestSource = [...x.sources].filter((s) => s.leads >= 5).sort((p, q) => q.conversion - p.conversion)[0];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Insights</h1>
          <p className="text-sm text-muted-foreground">Last 12 months · comparisons are the last 3 months against the 3 before</p>
        </div>
        <Segmented value={section} onChange={setSection} options={SECTIONS} />
      </div>

      <Highlights items={x.highlights} />

      {/* headline KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={CircleDollarSign} label="Collected · last 3 months" value={money(cmp.collected.now, { compact: true })} color={C.teal}
          delta={pctDelta(cmp.collected.now, cmp.collected.before)} spark={tr.map((r) => r.collected)} sub={`${money(cmp.collected.before, { compact: true })} the 3 months before`} />
        <KpiCard icon={Banknote} label="Sales booked · last 3 months" value={money(cmp.booked.now, { compact: true })} color={C.blue}
          delta={pctDelta(cmp.booked.now, cmp.booked.before)} spark={tr.map((r) => r.booked)} sub={`${cmp.bookings.now} bookings (${cmp.bookings.before} before)`} />
        <KpiCard icon={ShoppingBag} label="Average ticket" value={money(avgTicket, { compact: true })} color={C.indigo}
          delta={pctDelta(avgTicket, avgTicketBefore)} spark={tr.map((r) => r.avg_ticket ?? 0)} sub="Net price per booking" />
        <KpiCard icon={Target} label="Collection efficiency" value={`${effAvg.toFixed(0)}%`} color={effAvg >= 80 ? C.green : effAvg >= 60 ? C.amber : C.red}
          progress={effAvg} spark={tr.map((r) => r.efficiency)} sub="12-month average of dues paid ÷ due" />
        <KpiCard icon={Landmark} label="Receivable" value={money(x.receivables.total, { compact: true })} color={C.violet}
          progress={100 - x.receivables.overdue_pct} sub={`${x.receivables.overdue_pct}% overdue · ${money(x.receivables.overdue, { compact: true })}`} />
        <KpiCard icon={PiggyBank} label="Projected margin" value={money(e.projected_margin, { compact: true })} color={e.projected_margin >= 0 ? C.emerald : C.red}
          sub={`${e.booked + e.unsold ? Math.round((e.projected_margin * 100) / (e.booked + e.unsold)) : 0}% of total sales value`} />
      </div>

      {/* ---------------- sales & inventory */}
      {show("sales") && <>
        <SectionTitle id="sales" title="Sales & inventory" sub="What is selling, where, and at what price" />
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard className="xl:col-span-2" title="Sales vs collections by month" sub="Bars: value booked · lines: money collected and collection efficiency"
            insight={`${tr.reduce((s, r) => s + r.bookings, 0)} bookings worth ${money(tr.reduce((s, r) => s + r.booked, 0), { compact: true })} in 12 months; ${money(tr.reduce((s, r) => s + r.collected, 0), { compact: true })} collected.`}>
            <ResponsiveContainer>
              <ComposedChart data={tr} margin={{ left: 0, right: 0, top: 8 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                <YAxis yAxisId="v" stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                <YAxis yAxisId="p" orientation="right" stroke={t.axis} tick={t.tick} tickFormatter={(v: number) => `${v}%`} width={40} domain={[0, 100]} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip fmt={(v, key) => (key === "efficiency" ? `${v}%` : money(v, { compact: true }))} />} />
                {salesLt.legend}
                {salesLt.series([
                  <Bar key="booked" yAxisId="v" dataKey="booked" name="Booked" fill={C.blue} radius={[6, 6, 0, 0]} barSize={18} opacity={0.85} />,
                  <Line key="collected" yAxisId="v" type="monotone" dataKey="collected" name="Collected" stroke={C.teal} strokeWidth={2.5} dot={false} />,
                  <Line key="efficiency" yAxisId="p" type="monotone" dataKey="efficiency" name="Efficiency %" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} />,
                ])}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Residential vs commercial" sub="Plots and how many are sold" bodyClass="h-auto"
            insight={x.mix.types.map((p) => `${p.name}: ${Math.round(((p.sold ?? 0) * 100) / Math.max(p.value, 1))}% sold`).join(" · ")}>
            <Donut data={x.mix.types.map((p, i) => ({ name: p.name, value: p.value, color: [C.teal, C.amber, C.violet][i] }))} centerLabel="Plots"
              legendFmt={(s) => `${num(s.value)} · ${x.mix.types.find((p) => p.name === s.name)?.sold ?? 0} sold`} />
          </ChartCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Inventory by plot size" sub="Sold share, average price and stock still to sell" bodyClass="h-auto"
            insight={(() => { const s = [...x.mix.sizes].sort((p, q) => q.unsold_value - p.unsold_value)[0]; return s ? `Largest unsold stock: ${s.name} (${money(s.unsold_value, { compact: true })}).` : null; })()}>
            <DataTable<SizeMix> rows={x.mix.sizes} rowKey={(s) => s.name} initialSort={{ key: "avg_price", dir: "asc" }} cols={[
              { key: "name", label: "Size", render: (s) => <span className="font-medium">{s.name}</span> },
              { key: "plots", label: "Plots", align: "right", render: (s) => `${s.sold} / ${s.plots}` },
              { key: "sold_pct", label: "Sold", bar: { color: C.indigo, max: 100 }, render: (s) => `${s.sold_pct}%` },
              { key: "avg_price", label: "Avg price", align: "right", render: (s) => money(s.avg_price, { compact: true }) },
              { key: "unsold_value", label: "Unsold stock", bar: { color: C.amber }, render: (s) => compact(s.unsold_value) },
            ]} />
          </ChartCard>
          <ChartCard title="Sales by block" sub="Booked value, received and overdue"
            insight={(() => { const b = [...x.blocks].sort((p, q) => q.booked - p.booked)[0]; return b ? `${b.block} leads with ${money(b.booked, { compact: true })} booked; ${b.recovery_pct}% already received.` : null; })()}>
            <ResponsiveContainer>
              <BarChart data={x.blocks} margin={{ left: 0, right: 8, top: 8 }} barGap={3}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="block" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                <YAxis stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "transparent" }} />
                {blockLt.legend}
                {blockLt.series([
                  <Bar key="booked" dataKey="booked" name="Booked" fill={C.blue} radius={[6, 6, 0, 0]} />,
                  <Bar key="received" dataKey="received" name="Received" fill={C.teal} radius={[6, 6, 0, 0]} />,
                  <Bar key="overdue" dataKey="overdue" name="Overdue" fill={C.red} radius={[6, 6, 0, 0]} />,
                ])}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Cumulative sales" sub="Running total of value booked over 12 months, with bookings per month"
          insight={`Average ticket over 12 months: ${money(tr.reduce((s, r) => s + r.booked, 0) / Math.max(tr.reduce((s, r) => s + r.bookings, 0), 1), { compact: true })}.`}>
          <div className="flex h-full flex-col">
            <div className="mb-2 px-1">
              <SeriesLegend colors={cumPrefs.colors} onSetHidden={cumPrefs.setHidden} hidden={cumPrefs.hidden} onToggle={cumPrefs.toggle} onColor={cumPrefs.setColor}
                onReset={cumPrefs.reset} customised={cumPrefs.customised} series={[
                  { key: "cumulative_booked", label: "Cumulative booked", value: money(tr[tr.length - 1]?.cumulative_booked ?? 0, { compact: true }) },
                  { key: "bookings", label: "Bookings per month", value: `${num(tr.reduce((acc, r) => acc + r.bookings, 0))} total` },
                ]} />
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer>
                <ComposedChart data={tr} margin={{ left: 0, right: 0, top: 8 }} barCategoryGap="18%">
                  <defs>
                    <linearGradient id="cum" key={cumPrefs.colors.cumulative_booked.from} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cumPrefs.colors.cumulative_booked.to} stopOpacity={0.4} /><stop offset="100%" stopColor={cumPrefs.colors.cumulative_booked.from} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="cum-bars" key={cumPrefs.colors.bookings.from} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cumPrefs.colors.bookings.from} /><stop offset="100%" stopColor={cumPrefs.colors.bookings.to} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={t.grid} vertical={false} strokeDasharray="4 4" />
                  <XAxis dataKey="month" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="v" hide={cumPrefs.hidden.has("cumulative_booked")} stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="n" hide={cumPrefs.hidden.has("bookings")} orientation="right" stroke={t.axis} tick={t.tick} width={30} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip fmt={(v, key) => (key === "bookings" ? num(v) : money(v, { compact: true }))} />} cursor={{ fill: dark ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.04)", radius: 8 }} />
                  {!cumPrefs.hidden.has("bookings") && (
                    <Bar yAxisId="n" dataKey="bookings" name="Bookings" fill="url(#cum-bars)" radius={[8, 8, 0, 0]} maxBarSize={44} />
                  )}
                  {!cumPrefs.hidden.has("cumulative_booked") && (
                    <Area yAxisId="v" type="monotone" dataKey="cumulative_booked" name="Cumulative booked" stroke={cumPrefs.colors.cumulative_booked.to}
                      strokeWidth={3} fill="url(#cum)" dot={{ r: 3, fill: cumPrefs.colors.cumulative_booked.to, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>
      </>}

      {/* ---------------- collections */}
      {show("collections") && <>
        <SectionTitle id="collections" title="Collections & receivables" sub="Where the money comes from, what is late, and what is coming" />
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard title="Collections by stream" sub="Installments, society charges and surcharges per month" className="xl:col-span-2"
            actions={<OpacityControl value={streamOpacity} onChange={setStreamOpacity} />}
            insight={`Society charges are ${Math.round((tr.reduce((s, r) => s + r.society, 0) * 100) / Math.max(tr.reduce((s, r) => s + r.collected, 0), 1))}% of collections; surcharges ${money(tr.reduce((s, r) => s + r.surcharge, 0), { compact: true })}.`}>
            <div className="flex h-full flex-col">
              <div className="mb-2 px-1">
                <SeriesLegend colors={streamPrefs.colors} onSetHidden={streamPrefs.setHidden} hidden={streamPrefs.hidden} onToggle={streamPrefs.toggle} onColor={streamPrefs.setColor}
                  onReset={streamPrefs.reset} customised={streamPrefs.customised} series={[
                    { key: "installments", label: "Installments", value: money(tr.reduce((a, r) => a + r.installments, 0), { compact: true }) },
                    { key: "society", label: "Society", value: money(tr.reduce((a, r) => a + r.society, 0), { compact: true }) },
                    { key: "surcharge", label: "Surcharge", value: money(tr.reduce((a, r) => a + r.surcharge, 0), { compact: true }) },
                  ]} />
              </div>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer>
                  <AreaChart data={tr} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      {(["installments", "society", "surcharge"] as const).map((k) => (
                        <linearGradient key={`${k}-${streamPrefs.colors[k].from}-${streamOpacity}`} id={`stream-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={streamPrefs.colors[k].to} stopOpacity={streamOpacity} />
                          <stop offset="100%" stopColor={streamPrefs.colors[k].from} stopOpacity={streamOpacity * 0.35} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid stroke={t.grid} vertical={false} />
                    <XAxis dataKey="month" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                    <YAxis stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip />} />
                    {(["installments", "society", "surcharge"] as const).filter((k) => !streamPrefs.hidden.has(k)).map((k) => (
                      <Area key={k} type="monotone" dataKey={k} name={{ installments: "Installments", society: "Society", surcharge: "Surcharge" }[k]} stackId="1"
                        stroke={streamPrefs.colors[k].to} strokeWidth={2} fill={`url(#stream-${k})`} strokeOpacity={Math.max(0.6, streamOpacity)} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ChartCard>
          <ChartCard title="Collections by payment mode" sub="Last 12 months" bodyClass="h-auto">
            <Donut data={data.modes.map((m, i) => ({ name: m.mode ?? "Other", value: m.amount, color: SERIES[i % SERIES.length] }))} centerLabel="Collected" fmt={(v) => compact(v)} />
          </ChartCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard title="Receivables aging" sub="Overdue installments by days late" bodyClass="h-auto"
            insight={`Current (not yet due): ${money(x.receivables.current, { compact: true })}. Society dues ${money(x.receivables.society, { compact: true })}, surcharges ${money(x.receivables.surcharge, { compact: true })}.`}>
            <Donut data={x.receivables.aging.map((a, i) => ({ name: a.name, value: a.value, color: [C.amber, C.orange, C.red, "#991b1b"][i] }))} centerLabel="Overdue" fmt={(v) => compact(v)} />
          </ChartCard>
          <ChartCard title="Expected inflow" sub="Scheduled installments still unpaid, next 6 months" className="xl:col-span-2"
            insight={`${money(x.forecast.reduce((s, f) => s + f.expected, 0), { compact: true })} scheduled over ${x.forecast.reduce((s, f) => s + f.installments, 0)} installments — the basis for cash planning.`}>
            <ResponsiveContainer>
              <BarChart data={x.forecast} margin={{ left: 0, right: 8, top: 8 }}>
                <defs><linearGradient id="fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.emerald} /><stop offset="100%" stopColor={C.teal} /></linearGradient></defs>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                <YAxis stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "transparent" }} />
                <Bar dataKey="expected" name="Expected" fill="url(#fc)" radius={[8, 8, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Top defaulters" sub="Largest overdue installment balances" bodyClass="h-auto"
          actions={<Link to="/re/operations?tab=recovery" className="text-xs font-medium text-primary hover:underline">Recovery desk →</Link>}>
          <DataTable dense rank rows={data.defaulters} rowKey={(d) => d.customer} initialSort={{ key: "overdue", dir: "desc" }}
            onRow={(d) => `/re/customers/${encodeURIComponent(d.customer)}`} cols={[
              { key: "customer_name", label: "Customer", render: (d) => <span className="flex items-center gap-2 font-medium"><Avatar name={d.customer_name} />{d.customer_name}</span> },
              { key: "plots", label: "Plots", align: "right" },
              { key: "since", label: "Overdue since", render: (d) => date(d.since), value: (d) => d.since },
              { key: "overdue", label: "Overdue", bar: { color: C.red }, render: (d) => compact(d.overdue) },
            ]} />
        </ChartCard>
      </>}

      {/* ---------------- CRM */}
      {show("crm") && <>
        <SectionTitle id="crm" title="CRM & agents" sub="Pipeline conversion, lead sources and agent performance" />
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Lead-to-booking funnel" sub="Frappe CRM pipeline with step conversion" bodyClass="h-auto"
            insight={funnel[0]?.count ? `${((funnel[funnel.length - 1].count * 100) / funnel[0].count).toFixed(1)}% of leads become bookings.` : null}>
            <div className="space-y-2 py-1">
              {funnel.map((f, i) => {
                const w = (f.count * 100) / Math.max(funnel[0]?.count ?? 1, 1);
                const step = i > 0 && funnel[i - 1].count ? Math.round((f.count * 100) / funnel[i - 1].count) : null;
                return (
                  <div key={f.stage} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm font-medium">{f.stage}</span>
                    <div className="relative h-9 flex-1">
                      <div className="mx-auto flex h-full items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                        style={{ width: `${Math.max(w, 12)}%`, background: `linear-gradient(90deg, ${SERIES[i % SERIES.length]}, ${SERIES[(i + 1) % SERIES.length]})` }}>
                        {num(f.count)}
                      </div>
                    </div>
                    <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{step !== null ? `${step}%` : ""}</span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
          <ChartCard title="Lead sources" sub="Leads, deals and bookings by source — sorted by conversion" bodyClass="h-auto"
            insight={bestSource ? `${bestSource.source} converts best (${bestSource.conversion}% of leads book).` : null}>
            <DataTable<SourceRow> dense rows={x.sources} rowKey={(s) => s.source} initialSort={{ key: "conversion", dir: "desc" }} cols={[
              { key: "source", label: "Source", render: (s) => <span className="font-medium">{s.source}</span> },
              { key: "leads", label: "Leads", align: "right" },
              { key: "deals", label: "Deals", align: "right", hideSm: true },
              { key: "bookings", label: "Booked", align: "right" },
              { key: "conversion", label: "Conversion", bar: { color: C.violet, max: 100 }, render: (s) => `${s.conversion}%` },
            ]} />
          </ChartCard>
        </div>
        <ChartCard title="Agent leaderboard" sub="Score = 40% lead conversion + 40% recovery of booked value + 20% low overdue" bodyClass="h-auto">
          <DataTable<AgentScore> rank rows={x.agents} rowKey={(a) => a.agent} initialSort={{ key: "score", dir: "desc" }} cols={[
            { key: "name", label: "Agent", render: (a) => <span className="flex items-center gap-2 font-medium"><Avatar name={a.name} />{a.name}</span> },
            { key: "score", label: "Score", align: "center", render: (a) => (
              <span className={cn("inline-grid min-w-10 place-items-center rounded-full px-2 py-0.5 text-xs font-bold",
                a.score >= 70 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : a.score >= 50 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-red-500/15 text-red-700 dark:text-red-300")}>{a.score}</span>) },
            { key: "bookings", label: "Bookings", align: "right", render: (a) => <>{a.bookings}{a.bookings_month ? <span className="ml-1 text-xs text-emerald-600">+{a.bookings_month}</span> : null}</> },
            { key: "booked", label: "Booked", align: "right", render: (a) => compact(a.booked) },
            { key: "conversion", label: "Conversion", bar: { color: C.violet, max: 100 }, render: (a) => `${a.conversion}%` },
            { key: "recovery_pct", label: "Recovered", bar: { color: C.teal, max: 100 }, render: (a) => `${a.recovery_pct}%` },
            { key: "overdue_pct", label: "Overdue", align: "right", render: (a) => <span className={a.overdue_pct > 5 ? "text-red-600 dark:text-red-400" : ""}>{a.overdue_pct}%</span> },
            { key: "collected_month", label: "Collected (month)", align: "right", render: (a) => compact(a.collected_month), hideSm: true },
            { key: "activity", label: "Visits · calls · chats", align: "right", value: (a) => a.visits + a.calls + a.messages, render: (a) => `${a.visits} · ${a.calls} · ${a.messages}`, hideSm: true },
          ]} />
        </ChartCard>
      </>}

      {/* ---------------- finance & society */}
      {show("finance") && <>
        <SectionTitle id="finance" title="Finance & society" sub="Project economics and the society account" />
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Project economics" sub="From sales value to projected margin (ERPNext ledger and assets)"
            insight={`Received ${money(e.received, { compact: true })} of ${money(e.booked, { compact: true })} booked; ${money(e.receivable, { compact: true })} still to collect.`}>
            <ResponsiveContainer>
              <BarChart data={waterfall} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="name" stroke={t.axis} tick={{ fontSize: 10 }} interval={0} tickLine={false} axisLine={false} />
                <YAxis stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "transparent" }} />
                <Bar dataKey="base" stackId="w" fill="transparent" name="base" legendType="none" tooltipType="none" />
                <Bar dataKey="value" stackId="w" name="Amount" radius={[6, 6, 0, 0]}>
                  {waterfall.map((w) => <Cell key={w.name} fill={w.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Society account" sub="Charges billed vs society expenses, with monthly surplus"
            insight={`6-month surplus: ${money(socIncome - socExpense, { compact: true })} (${socIncome ? Math.round(((socIncome - socExpense) * 100) / socIncome) : 0}% of income).`}>
            <ResponsiveContainer>
              <ComposedChart data={societyRows} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                <YAxis stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                {finLt.legend}
                <ReferenceLine y={0} stroke={t.axis} />
                {finLt.series([
                  <Bar key="income" dataKey="income" name="Income" fill={C.green} radius={[6, 6, 0, 0]} barSize={16} />,
                  <Bar key="expense" dataKey="expense" name="Expense" fill={C.rose} radius={[6, 6, 0, 0]} barSize={16} />,
                  <Line key="margin" type="monotone" dataKey="margin" name="Surplus" stroke={C.indigo} strokeWidth={2.5} dot={{ r: 3 }} />,
                ])}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([["Land", e.land, Landmark, C.amber], ["Development spent", e.development, HandCoins, C.orange], ["Infrastructure assets", e.infrastructure, Receipt, C.sky],
            ["Unsold stock", e.unsold, ShoppingBag, C.indigo]] as const).map(([label, v, Icon, color]) => (
            <KpiCard key={label} icon={Icon} label={label} value={money(v, { compact: true })} color={color} />
          ))}
        </div>
      </>}

      <p className="text-center text-xs text-muted-foreground">
        Status colours: {Object.entries(STATUS_TONE).slice(0, 5).map(([k, v]) => <span key={k} className="mx-1 inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: v }} />{k}</span>)}
        · Detailed tables and exports in <Link to="/re/reports" className="text-primary hover:underline">Reports</Link>.
      </p>
    </div>
  );
}
