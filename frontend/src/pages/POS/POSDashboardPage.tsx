import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight, ArrowUpRight, Award, CalendarDays, Clock, DoorClosed, DoorOpen, Flame, Minus, Package, Percent, ReceiptText,
  RefreshCw, ShoppingBasket, ShoppingCart, Store, Ticket, Users, Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";

interface Totals { count: number; returns: number; net: number; gross: number; refunds: number; tax: number; discounts: number; customers: number; qty: number;
  coupons: number; loyalty: number; credit: number; avg: number }
interface Period { key: string; label: string; from: string; to: string; net: number; count: number; avg: number; prev_net: number; prev_count: number; vs: string }
interface Dash {
  range: { from: string; to: string; days: number; prev_from: string; prev_to: string };
  periods: Period[]; summary: Totals; previous: Totals;
  series: { date: string; amount: number; prev: number }[];
  hourly: { hour: number; count: number; amount: number }[];
  heat: { weekday: number; hour: number; count: number; amount: number }[];
  by_mode: { mode: string; amount: number; count: number }[];
  by_cashier: { user: string; count: number; amount: number; returns: number }[];
  by_profile: { profile: string; count: number; amount: number }[];
  top_items: { code: string; item: string; qty: number; amount: number; bills: number }[];
  groups: { group: string; amount: number }[];
  top_customers: { customer: string; name: string; count: number; amount: number; last: string }[];
  profiles: string[];
  open_shifts: { name: string; pos_profile: string; user: string; period_start_date: string }[];
  closings: { name: string; pos_profile: string; user: string; period_end_date: string; grand_total: number; status: string }[];
}

// Validated categorical palette (dataviz reference): fixed order, never cycled; light / dark steps.
const CAT_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const CAT_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
// Sequential blue ramp for the heatmap (light → dark).
const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v)));
const fmtDay = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const pct = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? null : 0);

function presets(): { key: string; label: string; from: string; to: string }[] {
  const t = new Date(); const day = (t.getDay() + 6) % 7;
  const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const ws = add(t, -day); const ms = new Date(t.getFullYear(), t.getMonth(), 1); const lme = add(ms, -1); const lms = new Date(lme.getFullYear(), lme.getMonth(), 1);
  return [
    { key: "today", label: "Today", from: iso(t), to: iso(t) }, { key: "yesterday", label: "Yesterday", from: iso(add(t, -1)), to: iso(add(t, -1)) },
    { key: "this_week", label: "This week", from: iso(ws), to: iso(t) }, { key: "last_week", label: "Last week", from: iso(add(ws, -7)), to: iso(add(ws, -1)) },
    { key: "this_month", label: "This month", from: iso(ms), to: iso(t) }, { key: "last_month", label: "Last month", from: iso(lms), to: iso(lme) },
    { key: "last_30", label: "30 days", from: iso(add(t, -29)), to: iso(t) },
  ];
}

/** /pos — point-of-sale insights: period cards, a filterable range with comparison, trend, hours, tenders, items, people, shifts. */
export default function POSDashboardPage() {
  const { company, companyCurrency } = useCompanyContext();
  const P = useMemo(presets, []);
  const [range, setRange] = useState({ key: "this_month", from: P[4].from, to: P[4].to });
  const [profile, setProfile] = useState("");
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const CAT = dark ? CAT_DARK : CAT_LIGHT;
  const { data, isLoading, isValidating, mutate } = useFrappeGetCall<{ message: Dash }>("mm_core.pos.dashboard",
    company ? { company, from_date: range.from, to_date: range.to, pos_profile: profile || undefined } : undefined,
    company ? `pos.dash.${company}.${range.from}.${range.to}.${profile}` : null, { refreshInterval: 60_000, keepPreviousData: true });
  const d = data?.message;
  const money = (v?: number) => formatMoney(v ?? 0, companyCurrency ?? "PKR");
  const s = d?.summary; const p = d?.previous;
  const modeColor = (m: string) => CAT[(d?.by_mode.findIndex((x) => x.mode === m) ?? 0) % CAT.length];

  return (
    <div className="space-y-5">
      {/* header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-lg shadow-primary/30 ring-1 ring-inset ring-white/20"><Store className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">Point of Sale insights</h1>
          <p className="text-xs text-muted-foreground">{company}{d ? ` · ${fmtDay(d.range.from)} – ${fmtDay(d.range.to)} (${d.range.days} day${d.range.days > 1 ? "s" : ""}) vs ${fmtDay(d.range.prev_from)} – ${fmtDay(d.range.prev_to)}` : ""}</p>
        </div>
        <button type="button" onClick={() => void mutate()} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted"><RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} /> Refresh</button>
        <Link to="/pos/terminal" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-4 text-sm font-bold text-white shadow-lg shadow-primary/30 hover:brightness-110"><ShoppingCart className="h-4 w-4" /> Open terminal</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
          {P.map((x) => (
            <button key={x.key} type="button" onClick={() => setRange({ key: x.key, from: x.from, to: x.to })}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-all", range.key === x.key ? "bg-card text-foreground shadow ring-1 ring-primary/40" : "text-foreground/65 hover:text-foreground")}>{x.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, key: "custom", from: e.target.value }))} className="h-7 bg-transparent text-xs outline-none" aria-label="From date" />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, key: "custom", to: e.target.value }))} className="h-7 bg-transparent text-xs outline-none" aria-label="To date" />
        </div>
        <select value={profile} onChange={(e) => setProfile(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-medium" aria-label="Counter">
          <option value="">All counters</option>{(d?.profiles ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      {isLoading && !d ? <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div> : d && s && p && (
        <>
          {/* period cards */}
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {d.periods.map((x) => {
              const delta = pct(x.net, x.prev_net);
              const active = range.from === x.from && range.to === x.to;
              return (
                <button key={x.key} type="button" onClick={() => setRange({ key: x.key, from: x.from, to: x.to })}
                  className={cn("group relative overflow-hidden rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                    active ? "border-primary ring-2 ring-primary/25" : "border-border")}>
                  <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">{x.label}</span><Delta value={delta} /></div>
                  <div className="mt-1.5 truncate text-xl font-extrabold tabular-nums">{money(x.net)}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{x.count} bill{x.count === 1 ? "" : "s"}{x.count ? ` · avg ${short(x.avg)}` : ""}</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">{x.vs}: {money(x.prev_net)}</div>
                </button>
              );
            })}
          </div>

          {/* range KPIs */}
          <div className="grid gap-3 lg:grid-cols-[1.3fr_2fr]">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-teal-600 to-violet-700 p-5 text-white shadow-lg shadow-primary/25">
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
              <div className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Net sales · selected range</div>
              <div className="relative mt-1 text-4xl font-extrabold tabular-nums">{money(s.net)}</div>
              <div className="relative mt-2 flex items-center gap-2 text-sm">
                <Delta value={pct(s.net, p.net)} onDark /> <span className="text-white/80">vs previous {d.range.days} day{d.range.days > 1 ? "s" : ""} ({money(p.net)})</span>
              </div>
              <div className="relative mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-white/15 p-2 ring-1 ring-inset ring-white/20"><div className="text-white/75">Gross</div><div className="font-bold tabular-nums">{money(s.gross)}</div></div>
                <div className="rounded-xl bg-white/15 p-2 ring-1 ring-inset ring-white/20"><div className="text-white/75">Refunds</div><div className="font-bold tabular-nums">{money(s.refunds)}</div></div>
                <div className="rounded-xl bg-white/15 p-2 ring-1 ring-inset ring-white/20"><div className="text-white/75">Tax</div><div className="font-bold tabular-nums">{money(s.tax)}</div></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={ReceiptText} label="Bills" value={String(s.count)} delta={pct(s.count, p.count)} hint={`${s.returns} return${s.returns === 1 ? "" : "s"}`} />
              <Stat icon={ShoppingBasket} label="Avg basket" value={money(s.avg)} delta={pct(s.avg, p.avg)} hint={`prev ${money(p.avg)}`} />
              <Stat icon={Users} label="Customers" value={String(s.customers)} delta={pct(s.customers, p.customers)} hint="distinct buyers" />
              <Stat icon={Package} label="Items sold" value={short(s.qty)} delta={pct(s.qty, p.qty)} hint="quantity" />
              <Stat icon={Percent} label="Discounts" value={money(s.discounts)} hint={s.gross ? `${((s.discounts / s.gross) * 100).toFixed(1)}% of gross` : "—"} />
              <Stat icon={Wallet} label="On credit" value={money(s.credit)} hint="still to collect" warn={s.credit > 0} />
              <Stat icon={Ticket} label="Coupons" value={String(s.coupons)} hint="bills with a coupon" />
              <Stat icon={Award} label="Loyalty" value={money(s.loyalty)} hint="points redeemed" />
            </div>
          </div>

          {/* trend */}
          <Panel title="Sales trend" sub={`Daily net sales — dashed line is the previous ${d.range.days} days`}
            right={<div className="flex items-center gap-3 text-[11px] text-muted-foreground"><Legend color={CAT[0]} label="This period" /><Legend color={CAT[0]} label="Previous" dashed /></div>}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={d.series} margin={{ left: 0, right: 8, top: 8 }}>
                <defs><linearGradient id="posTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CAT[0]} stopOpacity={0.3} /><stop offset="100%" stopColor={CAT[0]} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" minTickGap={18} />
                <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" width={44} />
                <Tooltip content={<ChartTip money={money} labels={{ amount: "This period", prev: "Previous" }} />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="amount" stroke={CAT[0]} strokeWidth={2} fill="url(#posTrend)" activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }} />
                <Line type="monotone" dataKey="prev" stroke={CAT[0]} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* hours */}
            <Panel title="Busiest hours" sub={(() => { const pk = [...d.hourly].sort((a, b) => b.amount - a.amount)[0]; return pk ? `Peak at ${pad(pk.hour)}:00 — ${money(pk.amount)} from ${pk.count} bills` : "No sales in range"; })()}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={Array.from({ length: 24 }, (_, h) => { const x = d.hourly.find((y) => y.hour === h); return { hour: pad(h), amount: x?.amount ?? 0, count: x?.count ?? 0 }; })} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" interval={1} />
                  <YAxis tickFormatter={short} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" width={40} />
                  <Tooltip content={<ChartTip money={money} labels={{ amount: "Sales" }} suffix=":00" />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Bar dataKey="amount" fill={CAT[2]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            {/* heatmap */}
            <Panel title="Weekday × hour" sub="Number of bills — darker is busier" right={<Flame className="h-4 w-4 text-muted-foreground" />}>
              <Heatmap heat={d.heat} money={money} />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Payment methods" sub={`${d.by_mode.reduce((a, m) => a + m.count, 0)} payments`}>
              <RankBars rows={d.by_mode.map((m) => ({ key: m.mode, label: m.mode, value: m.amount, sub: `${m.count} bills`, color: modeColor(m.mode) }))} money={money} />
            </Panel>
            <Panel title="Item groups" sub="Share of item sales">
              {d.groups.length === 0 ? <Empty /> : (() => {
                const tot = d.groups.reduce((a, g) => a + g.amount, 0) || 1;
                const top = d.groups.slice(0, 7); const other = d.groups.slice(7).reduce((a, g) => a + g.amount, 0);
                const rows = [...top, ...(other ? [{ group: "Other", amount: other }] : [])];
                return (
                  <div className="space-y-3">
                    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">{rows.map((g, i) => <span key={g.group} title={`${g.group} · ${money(g.amount)}`} style={{ width: `${(g.amount / tot) * 100}%`, background: CAT[i % CAT.length] }} className="h-full first:rounded-l-full last:rounded-r-full" />)}</div>
                    <ul className="space-y-1.5">{rows.map((g, i) => (
                      <li key={g.group} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT[i % CAT.length] }} />
                        <span className="min-w-0 flex-1 truncate">{g.group}</span><span className="tabular-nums text-muted-foreground">{((g.amount / tot) * 100).toFixed(1)}%</span>
                        <span className="w-24 text-right font-semibold tabular-nums">{money(g.amount)}</span></li>))}</ul>
                  </div>
                );
              })()}
            </Panel>
            <Panel title="Counters" sub="Sales by POS profile">
              <RankBars rows={d.by_profile.map((x, i) => ({ key: x.profile, label: x.profile, value: x.amount, sub: `${x.count} bills`, color: CAT[(i + 3) % CAT.length] }))} money={money} />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Best sellers" sub="By sales value">
              {d.top_items.length === 0 ? <Empty /> : (
                <ol className="space-y-2.5">{d.top_items.map((t, i) => (
                  <li key={t.code} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium" title={t.code}>{t.item}</span><span className="font-semibold tabular-nums">{money(t.amount)}</span></div>
                    <div className="flex items-center gap-2 pl-7"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(t.amount / (d.top_items[0]?.amount || 1)) * 100}%`, background: CAT[0] }} /></div>
                      <span className="w-28 text-right text-[11px] tabular-nums text-muted-foreground">{short(t.qty)} qty · {t.bills} bills</span></div>
                  </li>))}</ol>
              )}
            </Panel>
            <Panel title="Top customers" sub="By spend in range">
              {d.top_customers.length === 0 ? <Empty /> : (
                <ul className="divide-y divide-border">{d.top_customers.map((c) => (
                  <li key={c.customer} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.name}</div><div className="text-[11px] text-muted-foreground">{c.count} bills · last {fmtDay(c.last)}</div></div>
                    <span className="font-semibold tabular-nums">{money(c.amount)}</span></li>))}</ul>
              )}
            </Panel>
            <Panel title="Cashiers" sub="Leaderboard">
              {d.by_cashier.length === 0 ? <Empty /> : (
                <ul className="divide-y divide-border">{d.by_cashier.map((c, i) => (
                  <li key={c.user} className="flex items-center gap-3 py-2 text-sm">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", i === 0 ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" : "bg-muted")}>{i === 0 ? <Award className="h-4 w-4" /> : i + 1}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.user}</div><div className="text-[11px] text-muted-foreground">{c.count} bills{c.returns ? ` · ${c.returns} returns` : ""} · avg {short(c.count ? c.amount / c.count : 0)}</div></div>
                    <span className="font-semibold tabular-nums">{money(c.amount)}</span></li>))}</ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Open shifts" sub="Counters selling right now" right={<Link to="/pos/openings" className="text-xs font-semibold text-primary hover:underline">All openings</Link>}>
              {d.open_shifts.length === 0 ? <Empty text="No shift is open." /> : (
                <ul className="divide-y divide-border">{d.open_shifts.map((x) => (
                  <li key={x.name} className="flex items-center gap-3 py-2 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><DoorOpen className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><Link to={`/pos/openings/${encodeURIComponent(x.name)}`} className="font-medium hover:underline">{x.pos_profile}</Link><div className="text-[11px] text-muted-foreground">{x.user} · {x.name}</div></div>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{x.period_start_date.slice(0, 16)}</span></li>))}</ul>
              )}
            </Panel>
            <Panel title="Shift closings" sub="In the selected range" right={<Link to="/pos/closings" className="text-xs font-semibold text-primary hover:underline">All closings</Link>}>
              {d.closings.length === 0 ? <Empty text="No shift closed in this range." /> : (
                <ul className="divide-y divide-border">{d.closings.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 py-2 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><DoorClosed className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><Link to={`/pos/closings/${encodeURIComponent(c.name)}`} className="font-medium hover:underline">{c.name}</Link><div className="text-[11px] text-muted-foreground">{c.pos_profile} · {c.period_end_date?.slice(0, 16)}</div></div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", c.status === "Submitted" ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300")}>{c.status}</span>
                    <span className="w-24 text-right font-semibold tabular-nums">{money(c.grand_total)}</span></li>))}</ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/** Change badge: arrow icon + text (never colour alone). */
function Delta({ value, onDark }: { value: number | null; onDark?: boolean }) {
  if (value === null) return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", onDark ? "bg-white/20 text-white" : "bg-sky-500/15 text-sky-700 dark:text-sky-300")}><ArrowUpRight className="h-3 w-3" />new</span>;
  const flat = Math.abs(value) < 0.5;
  const up = value > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const cls = onDark ? "bg-white/20 text-white" : flat ? "bg-muted text-muted-foreground" : up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums", cls)}><Icon className="h-3 w-3" />{flat ? "0%" : `${up ? "+" : ""}${value.toFixed(Math.abs(value) < 10 ? 1 : 0)}%`}</span>;
}

function Stat({ icon: Icon, label, value, hint, delta, warn }: { icon: typeof Store; label: string; value: string; hint: string; delta?: number | null; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-foreground/65">{label}</div>
      <div className={cn("truncate text-lg font-extrabold tabular-nums", warn && "text-rose-600 dark:text-rose-400")}>{value}</div>
      <div className="truncate text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Panel({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-sm font-bold">{title}</h2>{sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}</div>{right}
      </div>
      {children}
    </section>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} strokeOpacity={dashed ? 0.6 : 1} /></svg>{label}</span>;
}

function RankBars({ rows, money }: { rows: { key: string; label: string; value: number; sub: string; color: string }[]; money: (v?: number) => string }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => r.value), 1); const tot = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <ul className="space-y-2.5">{rows.map((r) => (
      <li key={r.key} className="space-y-1">
        <div className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} /><span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{((r.value / tot) * 100).toFixed(1)}%</span><span className="w-24 text-right font-semibold tabular-nums">{money(r.value)}</span></div>
        <div className="flex items-center gap-2 pl-[18px]"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <span className="w-16 text-right text-[10px] text-muted-foreground">{r.sub}</span></div>
      </li>))}</ul>
  );
}

function Heatmap({ heat, money }: { heat: Dash["heat"]; money: (v?: number) => string }) {
  const [tip, setTip] = useState<string | null>(null);
  const hours = Array.from({ length: 16 }, (_, i) => i + 7);       // 07:00 – 22:00
  const max = Math.max(...heat.map((h) => h.count), 1);
  const cell = (w: number, h: number) => heat.find((x) => x.weekday === w && x.hour === h);
  if (!heat.length) return <Empty />;
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-grid min-w-full gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(16px, 1fr))` }}>
          <span />{hours.map((h) => <span key={h} className="text-center text-[9px] text-muted-foreground">{h % 2 ? "" : pad(h)}</span>)}
          {DAYS.map((d, w) => (
            <div key={d} className="contents">
              <span className="pr-1 text-right text-[10px] font-medium leading-5 text-muted-foreground">{d}</span>
              {hours.map((h) => {
                const c = cell(w, h);
                const step = c ? Math.min(SEQ.length - 1, Math.floor((c.count / max) * (SEQ.length - 1))) : -1;
                return <span key={h} onMouseEnter={() => setTip(c ? `${d} ${pad(h)}:00 · ${c.count} bills · ${money(c.amount)}` : `${d} ${pad(h)}:00 · no sales`)} onMouseLeave={() => setTip(null)}
                  className="h-5 rounded-[4px] ring-1 ring-inset ring-border/40 transition-transform hover:scale-110" style={{ background: step >= 0 ? SEQ[step] : "hsl(var(--muted))" }} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="min-h-[16px]">{tip ?? "Hover a cell for details"}</span>
        <span className="inline-flex items-center gap-1">fewer{SEQ.map((c) => <span key={c} className="h-2.5 w-3 rounded-sm" style={{ background: c }} />)}more</span>
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label, money, labels, suffix }: { active?: boolean; payload?: { dataKey: string; value: number; color?: string; stroke?: string; fill?: string }[]; label?: string; money: (v?: number) => string; labels: Record<string, string>; suffix?: string }) {
  if (!active || !payload?.length) return null;
  const head = label && /^\d{4}-\d{2}-\d{2}$/.test(label) ? new Date(`${label}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : `${label ?? ""}${suffix ?? ""}`;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold">{head}</div>
      {payload.filter((p) => labels[p.dataKey]).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: p.stroke || p.fill || p.color }} />{labels[p.dataKey]}</span>
          <span className="font-semibold tabular-nums">{money(p.value)}</span></div>
      ))}
    </div>
  );
}

function Empty({ text = "No sales in this range." }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
