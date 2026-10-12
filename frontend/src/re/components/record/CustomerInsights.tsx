/**
 * Customer insights (React customer page): payer segment, money position, punctuality score, payments vs dues by month
 * with how much of what fell due has been covered, what falls due in the next 12 months, how and for what they pay,
 * society / surcharge account, contact history and complaints. Data: realestate.spa.customer_profile.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CalendarClock, CircleDollarSign, Gauge as GaugeIcon, Home, MessageCircle, PhoneCall, Receipt, ShieldAlert, ShieldCheck, Wallet, Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  axisShort, C, ChartCard, ChartTip, Donut, Gauge, GRADIENTS, Highlights, KpiCard, Segmented, SeriesLegend, useChartTheme, useSeriesPrefs, type Highlight,
} from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, dateTime, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

interface Profile {
  segment: { label: string; tone: "good" | "warn" | "bad" };
  money: {
    net: number; paid: number; outstanding: number; overdue: number; due_to_date: number; paid_pct: number; cover_pct: number; plots: number; days_overdue: number;
    next: { amount: number; date: string; label: string; booking: string } | null; remaining_installments: number; last_payment: string | null; lifetime_paid: number;
  };
  punctuality: { score: number | null; avg_days_late: number; avg_days_early: number; bands: { name: string; value: number }[] };
  monthly: { month: string; due: number; paid: number; society: number; cover: number | null }[];
  ahead: { month: string; amount: number }[];
  modes: { name: string; value: number }[];
  purposes: { name: string; value: number }[];
  society: { bills: number; billed: number; paid: number; outstanding: number; overdue_bills: number };
  surcharge: { n: number; amount: number; waived: number; outstanding: number };
  contact: { calls: number; answered: number; incoming: number; wa_in: number; wa_out: number; promises: number; kept: number; last_contact: string | null };
  complaints: { total: number; open: number; resolved: number; avg_days: number | null };
  highlights: Highlight[];
}

const SEGMENT = {
  good: { icon: ShieldCheck, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  warn: { icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  bad: { icon: ShieldAlert, cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" },
};
const BAND_COLORS = [C.green, C.amber, C.orange, C.red, "#991b1b"];
const SERIES_DEF = [
  { key: "due", label: "Due", style: GRADIENTS[3] },
  { key: "paid", label: "Paid (installments)", style: GRADIENTS[0] },
  { key: "society", label: "Society & surcharges", style: GRADIENTS[5] },
  { key: "cover", label: "Dues covered %", style: GRADIENTS[7] },
] as const;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

/** Coloured badge with the payer segment (also used in the page header). */
export function SegmentBadge({ segment }: { segment: Profile["segment"] }) {
  const s = SEGMENT[segment.tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", s.cls)}><s.icon className="size-3.5" />{segment.label}</span>;
}

export function useCustomerProfile(customer: string) {
  return useQuery({ queryKey: ["customer-profile", customer], queryFn: () => get<Profile>("realestate.spa.customer_profile", { customer }), enabled: Boolean(customer) });
}

export function CustomerInsights({ customer }: { customer: string }) {
  const { data: p, isLoading } = useCustomerProfile(customer);
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [range, setRange] = useState<"12" | "24" | "all">("12");
  const prefs = useSeriesPrefs("re-customer-monthly", Object.fromEntries(SERIES_DEF.map((s) => [s.key, { from: s.style.from, to: s.style.to }])));
  const monthly = useMemo(() => {
    const rows = (p?.monthly ?? []).map((r) => ({ ...r, label: monthLabel(r.month) }));
    return range === "all" ? rows : rows.slice(-Number(range));
  }, [p, range]);

  if (isLoading || !p) return <Skeleton className="h-72" />;
  const m = p.money;
  const pu = p.punctuality;
  const nextIn = m.next ? Math.round((new Date(m.next.date).getTime() - Date.now()) / 86_400_000) : null;
  const bands = pu.bands.map((b, i) => ({ ...b, color: BAND_COLORS[i] }));
  const ahead = p.ahead.map((r) => ({ ...r, label: monthLabel(r.month) }));
  const peak = ahead.reduce((a, r) => (r.amount > a.amount ? r : a), { month: "", amount: 0, label: "" });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard icon={Home} label="Total booked" value={money(m.net, { compact: true })} color={C.blue}
          sub={`${m.plots} plot${m.plots === 1 ? "" : "s"} · ${m.remaining_installments} installments left`} />
        <KpiCard icon={Wallet} label="Paid" value={money(m.paid, { compact: true })} color={C.green} progress={m.paid_pct}
          sub={`${m.paid_pct.toFixed(0)}% of the price · lifetime ${money(m.lifetime_paid, { compact: true })}`} />
        <KpiCard icon={CircleDollarSign} label="Outstanding" value={money(m.outstanding, { compact: true })} color={C.violet}
          sub={m.last_payment ? `last receipt ${date(m.last_payment)}` : "no receipts yet"} />
        <KpiCard icon={AlertTriangle} label="Overdue" value={money(m.overdue, { compact: true })} color={m.overdue > 0 ? C.red : C.slate}
          sub={m.overdue > 0 ? `${m.days_overdue} days overdue` : "nothing overdue"} />
        <KpiCard icon={CalendarClock} label="Next due" value={m.next ? money(m.next.amount, { compact: true }) : "—"} color={C.amber}
          sub={m.next ? `${m.next.label} · ${date(m.next.date)}${nextIn !== null ? ` (${nextIn} days)` : ""}` : "schedule complete"} />
        <KpiCard icon={GaugeIcon} label="Dues covered" value={`${m.cover_pct.toFixed(0)}%`} color={m.cover_pct >= 95 ? C.green : m.cover_pct >= 80 ? C.amber : C.red}
          progress={m.cover_pct} sub={`${money(Math.min(m.paid, m.due_to_date), { compact: true })} of ${money(m.due_to_date, { compact: true })} fallen due`} />
      </div>

      <Highlights items={p.highlights} />

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Payments vs dues" sub="Installments falling due and what was paid each month; the line is the share of all dues to date that is paid"
          actions={<Segmented value={range} onChange={setRange} options={[["12", "12 M"], ["24", "24 M"], ["all", "All"]]} />}
          insight={<>Coverage now <b>{m.cover_pct.toFixed(0)}%</b> — {m.overdue > 0 ? <>{money(m.overdue)} behind schedule.</> : "fully up to date."}</>}
          bodyClass="h-80">
          <div className="flex h-full flex-col gap-2">
            <SeriesLegend series={SERIES_DEF.map((s) => ({ key: s.key, label: s.label }))} colors={prefs.colors} hidden={prefs.hidden}
              onToggle={prefs.toggle} onColor={prefs.setColor} onReset={prefs.reset} customised={prefs.customised} onSetHidden={prefs.setHidden} />
            <div className="min-h-0 flex-1">
              <ResponsiveContainer>
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    {SERIES_DEF.map((s) => (
                      <linearGradient key={s.key} id={`cu-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={prefs.colors[s.key].from} /><stop offset="100%" stopColor={prefs.colors[s.key].to} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} stroke={t.grid} />
                  <XAxis dataKey="label" tick={t.tick} stroke={t.axis} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="rs" tickFormatter={axisShort} tick={t.tick} stroke={t.axis} axisLine={false} tickLine={false} width={48} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={t.tick} stroke={t.axis} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<ChartTip fmt={(v, k) => (k === "cover" ? `${v}%` : money(v))} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  {!prefs.hidden.has("due") && <Bar yAxisId="rs" dataKey="due" name="Due" fill="url(#cu-due)" radius={[4, 4, 0, 0]} maxBarSize={22} />}
                  {!prefs.hidden.has("paid") && <Bar yAxisId="rs" dataKey="paid" name="Paid (installments)" fill="url(#cu-paid)" radius={[4, 4, 0, 0]} maxBarSize={22} />}
                  {!prefs.hidden.has("society") && <Bar yAxisId="rs" dataKey="society" name="Society & surcharges" fill="url(#cu-society)" radius={[4, 4, 0, 0]} maxBarSize={22} />}
                  {!prefs.hidden.has("cover") && <Line yAxisId="pct" dataKey="cover" name="Dues covered %" stroke={prefs.colors.cover.to} strokeWidth={2.5} dot={false} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Payment punctuality" sub="Money received, by how late it came against its due date" bodyClass="h-auto"
          insight={pu.score === null ? "Nothing has fallen due yet." : <>Late payments came <b>{pu.avg_days_late.toFixed(0)} days</b> after the due date on average{pu.avg_days_early > 0.5 ? <>; early ones <b>{pu.avg_days_early.toFixed(0)} days</b> ahead</> : null}.</>}>
          <div className="space-y-3">
            <Gauge value={pu.score ?? 100} label="Paid on time" sub="share of money due that came within 3 days" />
            <ul className="space-y-1.5">
              {bands.map((b) => {
                const total = bands.reduce((a, x) => a + x.value, 0) || 1;
                return (
                  <li key={b.name} className="text-xs">
                    <div className="flex justify-between"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: b.color }} />{b.name}</span>
                      <span className="tabular-nums text-muted-foreground">{money(b.value, { compact: true })} · {((b.value * 100) / total).toFixed(0)}%</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(b.value * 100) / total}%`, background: b.color }} /></div>
                  </li>
                );
              })}
            </ul>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Next 12 months" sub="Installments still to pay, by month"
          insight={peak.amount ? <>Biggest month: <b>{peak.label}</b> — {money(peak.amount)} (balloon / possession payments show up as spikes).</> : "Nothing left to pay in the next 12 months."}>
          <ResponsiveContainer>
            <BarChart data={ahead} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs><linearGradient id="cu-ahead" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fcd34d" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="label" tick={t.tick} stroke={t.axis} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisShort} tick={t.tick} stroke={t.axis} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="amount" name="To pay" fill="url(#cu-ahead)" radius={[5, 5, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="How they pay" sub="All receipts by payment mode" bodyClass="h-auto">
          <Donut data={p.modes.map((x, i) => ({ ...x, color: [C.blue, C.teal, C.amber, C.violet, C.slate][i % 5] }))} centerLabel="Received"
            fmt={(v) => money(v, { compact: true })} height={190} />
        </ChartCard>
        <ChartCard title="What they paid for" sub="Plot installments vs society bills and surcharges" bodyClass="h-auto">
          <Donut data={p.purposes.map((x, i) => ({ ...x, color: [C.green, C.amber, C.red, C.slate][i % 4] }))} centerLabel="Received"
            fmt={(v) => money(v, { compact: true })} height={190} />
        </ChartCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Receipt} title="Society account" color={C.amber} rows={[
          ["Bills", num(p.society.bills)], ["Billed", money(p.society.billed, { compact: true })], ["Paid", money(p.society.paid, { compact: true })],
          ["Outstanding", money(p.society.outstanding, { compact: true }), p.society.outstanding > 0], ["Overdue bills", num(p.society.overdue_bills), p.society.overdue_bills > 0],
        ]} />
        <Stat icon={AlertTriangle} title="Late surcharges" color={C.red} rows={[
          ["Charged", `${num(p.surcharge.n)} · ${money(p.surcharge.amount, { compact: true })}`], ["Waived", money(p.surcharge.waived, { compact: true })],
          ["Outstanding", money(p.surcharge.outstanding, { compact: true }), p.surcharge.outstanding > 0],
        ]} />
        <Stat icon={PhoneCall} title="Contact" color={C.blue} rows={[
          ["Calls (answered)", `${num(p.contact.calls)} (${num(p.contact.answered)})`],
          ["WhatsApp in / out", `${num(p.contact.wa_in)} / ${num(p.contact.wa_out)}`],
          ["Promises kept", p.contact.promises ? `${p.contact.kept} of ${p.contact.promises}` : "—", p.contact.promises > 0 && p.contact.kept < p.contact.promises],
          ["Last contact", p.contact.last_contact ? dateTime(p.contact.last_contact) : "—"],
        ]} footer={<span className="inline-flex items-center gap-1"><MessageCircle className="size-3" /> Chat from the green button at the top</span>} />
        <Stat icon={Wrench} title="Complaints" color={C.violet} rows={[
          ["Raised", num(p.complaints.total)], ["Open", num(p.complaints.open), p.complaints.open > 0], ["Resolved", num(p.complaints.resolved)],
          ["Avg. time to fix", p.complaints.avg_days !== null ? `${p.complaints.avg_days} days` : "—"],
        ]} />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, title, color, rows, footer }: {
  icon: typeof Receipt; title: string; color: string; rows: [string, string, boolean?][]; footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <header className="mb-2 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}><Icon className="size-4" /></span>
        <h3 className="font-semibold">{title}</h3>
      </header>
      <dl className="divide-y text-sm">
        {rows.map(([k, v, alert]) => (
          <div key={k} className="flex items-center justify-between gap-2 py-1.5">
            <dt className="text-muted-foreground">{k}</dt><dd className={cn("font-semibold tabular-nums", alert && "text-red-600 dark:text-red-400")}>{v}</dd>
          </div>
        ))}
      </dl>
      {footer && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
    </section>
  );
}
