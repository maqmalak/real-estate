/**
 * Real-estate dashboard (/re): today's position at a glance — KPIs with 12-month sparklines and change badges,
 * highlights, collections by week / month, collection-efficiency gauge with the next months' expected inflow,
 * inventory and booking-status donuts, receivables aging, block scorecard, recent receipts, today's schedule,
 * site-visit funnel and urgent maintenance.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Banknote, CalendarClock, CircleDollarSign, FileDown, Gauge as GaugeIcon, Home, Landmark, Map as MapIcon, MessageCircle, Phone,
  PhoneCall, Users, Wrench, FileWarning, Inbox,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Avatar, axisShort, C, ChartCard, SeriesLegend, useSeriesPrefs, ChartTip, compact, DataTable, Donut, Gauge, Highlights, KpiCard, Pill, pctDelta, Segmented, STATUS_TONE, useChartTheme,
} from "@/re/components/analytics/kit";
import { StatusBadge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import type { BlockScore, Receipt } from "@/re/lib/analytics-types";
import { get, post } from "@/re/lib/api";
import { date, money, num, time } from "@/re/lib/format";
import type { Dashboard } from "@/re/lib/types";
import { cn, followUpUrl, recordUrl } from "@/re/lib/utils";
import { useAuth } from "@/re/providers/auth";
import { useTheme } from "@/re/providers/theme";

/** Call + WhatsApp. WhatsApp opens the chat in the team inbox (/re/inbox) — created on the spot for a number that has
 *  never messaged — so the conversation stays in the ERP instead of the WhatsApp app. */
export function CallButtons({ phone, partyType, party }: { phone: string | null | undefined; partyType?: string | null; party?: string | null }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!phone) return null;
  const openChat = async () => {
    setBusy(true);
    try {
      const name = await post<string>("realestate.whatsapp.inbox.open_conversation", { phone, party_type: partyType ?? undefined, party: party ?? undefined });
      navigate(`/re/inbox?view=everything&c=${encodeURIComponent(name)}`);
    } catch (e) {
      toast.error((e as Error).message || "Could not open the chat");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-1">
      <Button asChild size="icon" variant="outline" className="size-8" title={`Call ${phone}`}>
        <a href={`tel:${phone}`}><Phone /></a>
      </Button>
      <Button size="icon" variant="outline" className="size-8 text-emerald-600" title="Open the WhatsApp chat in the inbox" disabled={busy} onClick={() => void openChat()}>
        <MessageCircle />
      </Button>
    </div>
  );
}

const AGING_COLORS = [C.amber, C.orange, C.red, "#991b1b"];

/** Collections chart: bottom-to-top stack, each a soft vertical gradient. */
const COLLECTION_SERIES = [
  { key: "collected", label: "Collected", from: "#34d399", to: "#059669" },
  { key: "pending", label: "Pending", from: "#a5b4fc", to: "#6366f1" },
  { key: "overdue", label: "Overdue", from: "#fda4af", to: "#e11d48" },
] as const;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const [granularity, setGranularity] = useState<"week" | "month">("week");
  const [kind, setKind] = useState<"installments" | "society">("installments");
  const colPrefs = useSeriesPrefs("re-chart-collections", Object.fromEntries(COLLECTION_SERIES.map((sr) => [sr.key, { from: sr.from, to: sr.to }])));
  const visibleSeries = COLLECTION_SERIES.filter((sr) => !colPrefs.hidden.has(sr.key));
  const [urgentTab, setUrgentTab] = useState<"complaints" | "documents" | "approvals">("complaints");
  const { dark } = useTheme();
  const { boot } = useAuth();
  const t = useChartTheme(dark);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", granularity, kind],
    queryFn: () => get<Dashboard>("realestate.spa.dashboard", { granularity, kind }),
    placeholderData: (prev) => prev,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        <div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-80 rounded-2xl xl:col-span-2" /><Skeleton className="h-80 rounded-2xl" /></div>
      </div>
    );
  }
  const k = data.kpis;
  const a = data.analytics;
  const tr = a.trend;
  const soldPct = Math.round((k.plots_sold * 100) / Math.max(k.plots_total, 1));
  const booked12 = tr.reduce((s, x) => s + x.booked, 0);
  const bookings12 = tr.reduce((s, x) => s + x.bookings, 0);
  // last 3 months vs the 3 before (the current month is still running, so a month-on-month figure would mislead)
  const sum3 = (from: number, to?: number) => tr.slice(from, to).reduce((s, r) => s + r.booked, 0);
  const lastBooked = sum3(-3);
  const prevBooked = sum3(-6, -3);
  const collectedSeries = data.collection.reduce((s, x) => s + x.collected, 0);
  const overdueSeries = data.collection.reduce((s, x) => s + x.overdue, 0);
  const worstBlock = [...a.blocks].sort((x, y) => y.overdue_pct - x.overdue_pct)[0];
  const forecastTotal = a.forecast.reduce((s, f) => s + f.expected, 0);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}, {boot?.full_name?.split(" ")[0] ?? "there"} ·{" "}
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {data.scope?.agent ? "My business" : "Zarmeen Gardens overview"}
            {data.scope?.agent && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Your bookings, customers &amp; follow-ups only</span>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!data.scope?.agent && <Button asChild variant="outline"><Link to="/re/insights"><GaugeIcon /> Insights</Link></Button>}
          {!data.scope?.agent && <Button asChild variant="outline"><Link to="/re/reports"><FileDown /> Reports</Link></Button>}
          <Button asChild><Link to="/re/map"><MapIcon /> Society map</Link></Button>
        </div>
      </div>

      <Highlights items={a.highlights.slice(0, 3)} />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={CircleDollarSign} label="Collected this month" value={money(k.collected_month, { compact: true })} color={C.teal}
          delta={pctDelta(a.mtd.now, a.mtd.prev)} sub={`vs ${money(a.mtd.prev, { compact: true })} in the same ${a.mtd.days} days last month`}
          spark={tr.map((x) => x.collected)} to="/re/d/re-payment" />
        <KpiCard icon={Banknote} label={data.scope?.agent ? "My sales (12 months)" : "Sales booked (12 months)"} value={money(booked12, { compact: true })} color={C.blue}
          delta={pctDelta(lastBooked, prevBooked)} sub={`${bookings12} bookings · ${money(booked12 / Math.max(bookings12, 1), { compact: true })} avg · Δ last 3 vs prior 3 months`}
          spark={tr.map((x) => x.booked)} to="/re/d/re-booking" />
        <KpiCard icon={Home} label={data.scope?.agent ? "Scheme plots sold" : "Plots sold"} value={`${num(k.plots_sold)} / ${num(k.plots_total)}`} color={C.indigo} progress={soldPct}
          sub={`${soldPct}% of inventory sold`} to="/re/plots"
          footer={<span className="flex justify-between"><span>Unsold stock</span><b className="text-foreground">{money(a.blocks.reduce((s, b) => s + b.unsold_value, 0), { compact: true })}</b></span>} />
        <KpiCard icon={Landmark} label="Receivables" value={money(a.receivables.total, { compact: true })} color={C.violet} progress={100 - a.receivables.overdue_pct}
          sub={`${(100 - a.receivables.overdue_pct).toFixed(1)}% current · ${a.receivables.overdue_pct}% overdue`} to="/re/reports?r=Installment%20Dues"
          footer={<span className="flex justify-between"><span>Next 3 months due</span><b className="text-foreground">{money(forecastTotal, { compact: true })}</b></span>} />
        <KpiCard icon={AlertTriangle} label="Overdue installments" value={money(k.overdue_installments, { compact: true })} color={C.red}
          sub={`${k.overdue_bookings} bookings · surcharge ${money(a.receivables.surcharge, { compact: true })}`} to="/re/d/re-booking?status=Overdue"
          footer={worstBlock && <span className="flex justify-between"><span>Worst block</span><b className="text-foreground">{worstBlock.block} · {worstBlock.overdue_pct}%</b></span>} />
        <KpiCard icon={CalendarClock} label="Today's activity" value={`${num(k.visits_today)} visit${k.visits_today === 1 ? "" : "s"}`} color={C.amber}
          sub={`${k.follow_ups_today} follow-ups due · ${k.unread_chats} unread chats`} to="/re/today"
          footer={<span className="flex justify-between"><span>Society dues overdue</span><b className="text-foreground">{money(k.society_overdue, { compact: true })}</b></span>} />
      </div>

      {/* collections + efficiency */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Collections" sub={`Collected, still pending and overdue per ${granularity}`}
          actions={<div className="flex flex-wrap gap-2">
            <Segmented value={kind} onChange={setKind} options={[["installments", "Installments"], ["society", "Society"]]} />
            <Segmented value={granularity} onChange={setGranularity} options={[["week", "Weekly"], ["month", "Monthly"]]} />
          </div>}
          insight={<>In this view: <b>{money(collectedSeries, { compact: true })}</b> collected, <b>{money(overdueSeries, { compact: true })}</b> of those periods' dues now overdue
            ({collectedSeries + overdueSeries ? Math.round((overdueSeries * 100) / (collectedSeries + overdueSeries)) : 0}%).</>}>
          <div className="flex h-full flex-col">
            {/* legend: click a series to hide / show it, click its dot to choose a colour (remembered in this browser) */}
            <div className="mb-2 px-1">
              <SeriesLegend customised={colPrefs.customised} onReset={colPrefs.reset} colors={colPrefs.colors} hidden={colPrefs.hidden}
                onToggle={colPrefs.toggle} onColor={colPrefs.setColor} onSetHidden={colPrefs.setHidden}
                series={COLLECTION_SERIES.map((sr) => {
                  const total = data.collection.reduce((acc, r) => acc + (r[sr.key] ?? 0), 0);
                  const all = data.collection.reduce((acc, r) => acc + r.collected + r.pending + r.overdue, 0);
                  return { key: sr.key, label: sr.label, value: `${money(total, { compact: true })}${all ? ` · ${Math.round((total * 100) / all)}%` : ""}` };
                })} />
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer>
                <BarChart data={data.collection} margin={{ left: 0, right: 8, top: 4 }} barCategoryGap="26%">
                  <defs>
                    {COLLECTION_SERIES.map((sr) => (
                      <linearGradient key={`${sr.key}-${colPrefs.colors[sr.key].from}`} id={`col-${sr.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colPrefs.colors[sr.key].from} />
                        <stop offset="100%" stopColor={colPrefs.colors[sr.key].to} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke={t.grid} vertical={false} strokeDasharray="4 4" />
                  <XAxis dataKey="label" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
                  <YAxis stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: dark ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.04)", radius: 8 }} />
                  {visibleSeries.map((sr, i) => (
                    <Bar key={sr.key} dataKey={sr.key} name={sr.label} stackId="a" fill={`url(#col-${sr.key})`}
                      stroke={dark ? "hsl(218 44% 12.5%)" : "#ffffff"} strokeWidth={1.5}
                      radius={i === visibleSeries.length - 1 ? [8, 8, 0, 0] : 0} maxBarSize={56} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Collection efficiency" sub="This month: installments paid ÷ installments falling due" bodyClass="h-auto"
          insight={a.efficiency.pct < 70 ? "Below 70% — prioritise reminders and recovery calls for this month's dues." : "On track — keep reminders going before due dates."}>
          <div><Gauge value={a.efficiency.pct} label="of this month's dues paid" sub={`${money(a.efficiency.paid, { compact: true })} of ${money(a.efficiency.due, { compact: true })}`} /></div>
          <p className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expected inflow</p>
          <div className="space-y-2">
            {a.forecast.map((f) => (
              <div key={f.month} className="flex items-center gap-3 text-sm">
                <span className="w-14 text-muted-foreground">{f.month}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${(f.expected * 100) / Math.max(...a.forecast.map((x) => x.expected), 1)}%` }} />
                </div>
                <span className="w-20 text-right font-semibold tabular-nums">{money(f.expected, { compact: true })}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* mixes */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <ChartCard title="Plot inventory" sub="All plots by status" bodyClass="h-auto"
          insight={`${soldPct}% sold; ${a.mix.status.find((s) => s.name === "Available")?.value ?? 0} plots available to sell.`}>
          <Donut data={a.mix.status.map((s) => ({ name: s.name, value: s.value, color: STATUS_TONE[s.name] }))} centerLabel="Plots" />
        </ChartCard>
        <ChartCard title="Bookings by payment status" sub="Count, with outstanding balance" bodyClass="h-auto"
          insight={`${a.mix.bookings.find((s) => s.name === "Overdue")?.value ?? 0} bookings are overdue, holding ${money(a.mix.bookings.find((s) => s.name === "Overdue")?.amount ?? 0, { compact: true })} outstanding.`}>
          <Donut data={a.mix.bookings.map((s) => ({ name: s.name, value: s.value, color: STATUS_TONE[s.name], hint: String(s.amount ?? 0) }))} centerLabel="Bookings"
            legendFmt={(s) => `${s.value} · ${compact(Number(s.hint))}`} />
        </ChartCard>
        <ChartCard title="Receivables aging" sub="Overdue installments by days late" className="lg:col-span-2 2xl:col-span-1"
          insight={`${money(a.receivables.overdue, { compact: true })} overdue of ${money(a.receivables.total, { compact: true })} receivable; society dues ${money(a.receivables.society, { compact: true })}.`}>
          <ResponsiveContainer>
            <BarChart data={a.receivables.aging} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke={t.grid} horizontal={false} />
              <XAxis type="number" stroke={t.axis} tick={t.tick} tickFormatter={axisShort} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke={t.axis} tick={t.tick} width={66} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "transparent" }} />
              <Bar dataKey="value" name="Overdue" radius={[0, 6, 6, 0]} barSize={22}>
                {a.receivables.aging.map((_, i) => <Cell key={i} fill={AGING_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* block scorecard */}
      <ChartCard title="Block scorecard" sub="Sales, recovery and risk per block — click a column to sort" bodyClass="h-auto"
        actions={<Button asChild size="sm" variant="ghost"><Link to="/re/plots">All plots <ArrowRight /></Link></Button>}>
        <DataTable<BlockScore> rows={a.blocks} rowKey={(b) => b.block} initialSort={{ key: "booked", dir: "desc" }} cols={[
          { key: "block", label: "Block", render: (b) => <span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-sm" style={{ background: b.color ?? C.slate }} />{b.block}<span className="text-xs font-normal text-muted-foreground">{b.block_type}</span></span> },
          { key: "plots", label: "Plots", align: "right", render: (b) => `${b.sold} / ${b.plots}` , value: (b) => b.plots, hideSm: true },
          { key: "sold_pct", label: "Sold", bar: { color: C.indigo, max: 100 }, render: (b) => `${b.sold_pct}%` },
          { key: "booked", label: "Booked", align: "right", render: (b) => money(b.booked, { compact: true }) },
          { key: "recovery_pct", label: "Recovered", bar: { color: C.teal, max: 100 }, render: (b) => `${b.recovery_pct}%` },
          { key: "overdue", label: "Overdue", align: "right", render: (b) => <span className={b.overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>{money(b.overdue, { compact: true })} <span className="text-xs text-muted-foreground">({b.overdue_pct}%)</span></span> },
          { key: "society_due", label: "Society dues", align: "right", render: (b) => money(b.society_due, { compact: true }), hideSm: true },
          { key: "unsold_value", label: "Unsold stock", align: "right", render: (b) => money(b.unsold_value, { compact: true }), hideSm: true },
        ]} />
      </ChartCard>

      {/* activity */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Recent receipts" sub="Latest money in — every receipt posts a Payment Entry" bodyClass="h-auto"
          actions={<Button asChild size="sm" variant="ghost"><Link to="/re/d/re-payment">All receipts <ArrowRight /></Link></Button>}>
          <DataTable<Receipt> dense rows={a.recent} rowKey={(r) => r.name} cols={[
            { key: "customer_name", label: "Customer", render: (r) => <Link to={`/re/customers/${encodeURIComponent(r.customer)}`} className="flex items-center gap-2 font-medium hover:underline"><Avatar name={r.customer_name ?? r.customer} />{r.customer_name ?? r.customer}</Link> },
            { key: "plot", label: "Plot" },
            { key: "payment_against", label: "For", render: (r) => <Pill color={r.payment_against === "Booking" ? C.teal : r.payment_against === "Society Bill" ? C.amber : C.rose}>{r.payment_against}</Pill>, hideSm: true },
            { key: "mode_of_payment", label: "Mode", hideSm: true },
            { key: "posting_date", label: "Date", render: (r) => date(r.posting_date) },
            { key: "amount", label: "Amount", align: "right", render: (r) => <b>{money(r.amount)}</b> },
          ]} />
        </ChartCard>

        <ChartCard title="Site-visit funnel" sub="Last 90 days, with stage conversion" bodyClass="h-auto">
          <div className="space-y-3 py-1">
            {data.visits.map((s, i) => {
              const max = Math.max(...data.visits.map((v) => v.count), 1);
              const cancelled = s.stage === "Cancelled";
              return (
                <div key={s.stage}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{s.stage}</span>
                    <span className="tabular-nums"><b>{s.count}</b>{i > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{s.rate}%{cancelled ? " of contacted" : " conv."}</span>}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(s.count * 100) / max}%`, background: cancelled ? C.red : `linear-gradient(90deg, ${C.teal}, ${C.sky})`, opacity: cancelled ? 0.8 : 1 - i * 0.12 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Today's schedule" sub="Confirmed visits and follow-ups due" bodyClass="h-auto"
          actions={<Button asChild size="sm" variant="ghost"><Link to="/re/today">Open <ArrowRight /></Link></Button>}>
          <div className="divide-y">
            {!data.schedule.visits.length && !data.schedule.follow_ups.length && <Empty title="Nothing scheduled" />}
            {data.schedule.visits.map((v) => (
              <div key={v.name} className="flex items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400"><Users className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.party_name}</p>
                  <p className="truncate text-xs text-muted-foreground"><PhoneCall className="mr-1 inline size-3" />Site visit · {date(v.visit_on)} {time(v.visit_on)}{v.interested_plot && ` · plot ${v.interested_plot}`}</p>
                </div>
                <CallButtons phone={v.mobile_no} partyType={v.party_type} party={v.party} />
              </div>
            ))}
            {data.schedule.follow_ups.map((f) => (
              <div key={f.name} className="flex items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><CalendarClock className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <Link className="block truncate font-medium hover:underline" to={followUpUrl(f)}>{f.title}</Link>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">Due {date(f.due_date)} {time(f.due_date)} <StatusBadge status={f.priority} /></p>
                </div>
                <CallButtons phone={f.mobile_no} partyType={f.reference_doctype} party={f.reference_docname} />
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Urgent queue" sub="Complaints by priority, documents due for renewal, approvals waiting" bodyClass="h-auto"
          actions={<Segmented value={urgentTab} onChange={setUrgentTab} options={[
            ["complaints", `Complaints ${data.urgent.length}`], ["documents", `Documents ${data.expiring?.length ?? 0}`], ["approvals", `Approvals ${data.approvals?.count ?? 0}`]]} />}>
          <div className="divide-y">
            {urgentTab === "complaints" && (data.urgent.length ? data.urgent.map((u) => (
              <Link key={u.name} to={recordUrl("Task", u.name)} className="flex items-center gap-3 py-2.5 hover:bg-accent/40">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", u.re_priority === "Critical" || u.priority === "Urgent" ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-orange-500/15 text-orange-600 dark:text-orange-400")}><Wrench className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">{[u.type, u.re_block, u.re_plot].filter(Boolean).join(" · ")} · due {date(u.exp_end_date)}</p>
                </div>
                <div className="flex shrink-0 gap-1"><StatusBadge status={u.re_priority ?? u.priority} /><StatusBadge status={u.status} /></div>
              </Link>
            )) : <Empty title="No urgent complaints" />)}
            {urgentTab === "documents" && (data.expiring?.length ? data.expiring.map((d) => (
              <Link key={d.name} to={recordUrl("RE Vault Document", d.name)} className="flex items-center gap-3 py-2.5 hover:bg-accent/40">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", d.status === "Expired" ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400")}><FileWarning className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{[d.document_type, d.authority].filter(Boolean).join(" · ")} · expires {date(d.expiry_date)}</p>
                </div>
                <Pill color={d.status === "Expired" ? C.red : C.amber}>{d.status}</Pill>
              </Link>
            )) : <Empty title="No documents due for renewal" />)}
            {urgentTab === "approvals" && (data.approvals?.rows.length ? data.approvals.rows.map((a) => (
              <Link key={`${a.doctype}-${a.name}`} to="/re/operations?tab=approvals" className="flex items-center gap-3 py-2.5 hover:bg-accent/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400"><Inbox className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.doctype.replace("RE ", "")} · {a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.who ?? ""}{a.who ? " · " : ""}{date(a.modified)}</p>
                </div>
                <Pill color={a.can_act ? C.amber : C.slate}>{a.can_act ? "Your action" : a.state}</Pill>
              </Link>
            )) : <Empty title="Nothing waiting for approval" />)}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
