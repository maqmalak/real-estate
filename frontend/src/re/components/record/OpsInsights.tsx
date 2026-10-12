/**
 * Insight headers (and the matching list cells) for society-operations lists: charge heads, maintenance plans,
 * infrastructure / map features and fixed assets. Data: realestate.ops_insights.* — each list's cells read the same
 * cached query as its header, so rows add no extra requests.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, Coins, Gauge as GaugeIcon, Hammer, Layers, ListChecks, MapPin, Network, Receipt,
  Repeat, Ruler, TrendingUp, Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisShort, C, ChartCard, ChartTip, DataTable, Donut, KpiCard, Segmented, Sparkline, useChartTheme } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

const PALETTE = [C.blue, C.teal, C.amber, C.violet, C.rose, C.sky, C.emerald, C.orange, C.slate];
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const tone = (pct: number) => (pct >= 85 ? C.green : pct >= 60 ? C.amber : C.red);

function Bar2({ pct, color, className = "" }: { pct: number; color: string; className?: string }) {
  return <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>;
}

// ================================================================== charge heads
interface HeadsData {
  kpis: { active: number; heads: number; this_month: number; billed_12m: number; collected_12m: number; bills: number; avg_bill: number; run_rate: number };
  heads: { name: string; charge_name: string; enabled: number; applies_to: string; rate_type: string; rate: number; rate_label: string; billed_12m: number;
    collected_12m: number; this_month: number; plots: number; share: number; collection: number | null; trend: number[] }[];
  matrix: { size: string; plot_type: string; plots: number; heads: Record<string, number>; total: number }[];
  months: string[];
}
const useHeads = () => useQuery({ queryKey: ["ops-charge-heads"], queryFn: () => get<HeadsData>("realestate.ops_insights.charge_heads"), staleTime: 60_000 });

export function ChargeHeadInsights() {
  const { data: d } = useHeads();
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  if (!d) return <Skeleton className="h-72" />;
  const k = d.kpis;
  const heads = d.heads.filter((h) => h.enabled);
  const sizes = d.matrix.filter((m) => m.total > 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Layers} label="Charge heads" value={`${k.active} active`} color={C.blue} sub={`${k.heads} defined · billed on every society bill`} />
        <KpiCard icon={Receipt} label="Billed this month" value={money(k.this_month, { compact: true })} color={C.teal} sub={`${num(k.bills)} bills · avg ${money(k.avg_bill)} per bill`} />
        <KpiCard icon={Coins} label="Billed (12 months)" value={money(k.billed_12m, { compact: true })} color={C.violet}
          progress={k.billed_12m ? (k.collected_12m * 100) / k.billed_12m : 0} sub={`${k.billed_12m ? ((k.collected_12m * 100) / k.billed_12m).toFixed(0) : 0}% collected`} />
        <KpiCard icon={TrendingUp} label="Monthly run-rate" value={money(k.run_rate, { compact: true })} color={C.amber} sub="current rates × plots that pay them" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="What each plot size pays per month" sub="Every active charge head at today's rates — stacked into the monthly bill" bodyClass="h-80">
          <ResponsiveContainer>
            <BarChart data={sizes.map((m) => ({ size: m.size, ...m.heads, total: m.total }))} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={t.grid} />
              <XAxis type="number" tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="size" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={120} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              {heads.map((h, i) => <Bar key={h.name} dataKey={h.name} stackId="a" fill={PALETTE[i % PALETTE.length]} radius={i === heads.length - 1 ? [0, 5, 5, 0] : undefined} maxBarSize={22} />)}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Share of billing" sub="Last 12 months by charge head" bodyClass="h-auto">
          <Donut data={heads.map((h, i) => ({ name: h.name, value: h.billed_12m, color: PALETTE[i % PALETTE.length] }))} centerLabel="12 months" fmt={(v) => money(v, { compact: true })} height={200} />
        </ChartCard>
      </div>
      <ChartCard title="Monthly bill by plot size" sub="Rates per head and the total an owner of each size pays" bodyClass="h-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 text-left">Plot size</th><th className="px-2 py-2 text-right">Paying plots</th>
              {heads.map((h) => <th key={h.name} className="px-2 py-2 text-right">{h.name}</th>)}<th className="px-2 py-2 text-right">Monthly bill</th>
            </tr></thead>
            <tbody>
              {sizes.map((m) => (
                <tr key={m.size} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-2 py-1.5 font-medium">{m.size} <span className="text-xs text-muted-foreground">{m.plot_type}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(m.plots)}</td>
                  {heads.map((h) => <td key={h.name} className={cn("px-2 py-1.5 text-right tabular-nums", !m.heads[h.name] && "text-muted-foreground/50")}>{m.heads[h.name] ? num(m.heads[h.name]) : "—"}</td>)}
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

export function ChargeHeadCell({ name, part }: { name: string; part: "rate" | "billed" | "share" | "trend" }) {
  const { data } = useHeads();
  const h = data?.heads.find((x) => x.name === name);
  if (!h) return <span className="text-muted-foreground">—</span>;
  if (part === "rate") return <span className="inline-flex rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs font-medium">{h.rate_label}</span>;
  if (part === "billed") return <span className="flex flex-col items-end leading-tight"><b className="tabular-nums">{money(h.this_month)}</b><span className="text-[10px] text-muted-foreground">{money(h.billed_12m, { compact: true })} in 12 m · {h.collection ?? 0}% paid</span></span>;
  if (part === "share") return <div className="w-28"><div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{num(h.plots)} plots</span><b>{h.share}%</b></div><Bar2 pct={h.share} color={C.blue} /></div>;
  return <div className="w-28"><Sparkline data={h.trend} color={C.teal} height={26} /></div>;
}

// ================================================================== maintenance plans
interface PlansData {
  kpis: { plans: number; active: number; due_week: number; late_plans: number; jobs_month: number; all_jobs: number; all_done: number; all_on_time: number;
    all_open: number; all_overdue: number; all_on_time_pct: number | null; all_avg_days: number | null; per_month: number };
  plans: { name: string; title: string; maintenance_type: string; frequency: string; next_due: string | null; assignee: string | null; priority: string; enabled: number;
    jobs: number; done: number; on_time: number; open: number; overdue: number; on_time_pct: number | null; avg_days: number | null; days_to_due: number | null;
    last_status: string | null; last_task: string | null; last_done: string | null }[];
  calendar: { date: string; plan: string; title: string; type: string; priority: string; assignee: string | null; overdue: boolean }[];
  types: { type: string; planned: number; complaints: number; open: number }[];
}
const usePlans = () => useQuery({ queryKey: ["ops-maint-plans"], queryFn: () => get<PlansData>("realestate.ops_insights.maintenance_plans"), staleTime: 60_000 });

export function MaintenancePlanInsights() {
  const { data: d } = usePlans();
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  if (!d) return <Skeleton className="h-72" />;
  const k = d.kpis;
  const days = d.calendar.reduce<Record<string, PlansData["calendar"]>>((a, c) => { (a[c.date] ??= []).push(c); return a; }, {});
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={ListChecks} label="Active plans" value={num(k.active)} color={C.blue} sub={`≈ ${k.per_month} planned jobs a month`} />
        <KpiCard icon={CalendarClock} label="Due this week" value={num(k.due_week)} color={C.amber} sub={k.late_plans ? `${k.late_plans} plan(s) past their due date` : "nothing past due"} />
        <KpiCard icon={Wrench} label="Planned jobs (6 m)" value={num(k.all_jobs)} color={C.violet} sub={`${num(k.all_done)} done · ${num(k.all_open)} open · ${num(k.all_overdue)} overdue`} />
        <KpiCard icon={CheckCircle2} label="Done on time" value={k.all_on_time_pct !== null ? `${k.all_on_time_pct}%` : "—"} color={tone(k.all_on_time_pct ?? 0)}
          progress={k.all_on_time_pct ?? 0} sub={`${num(k.all_on_time)} of ${num(k.all_done)} completed by their due date`} />
        <KpiCard icon={AlertTriangle} label="Overdue jobs" value={num(k.all_overdue)} color={k.all_overdue ? C.red : C.slate} sub="planned jobs past due and not closed" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Next 30 days" sub="Planned work by date (projected from each plan's frequency)" bodyClass="h-80 overflow-y-auto">
          <ol className="space-y-3">
            {Object.entries(days).map(([dt, items]) => (
              <li key={dt} className="flex gap-3">
                <div className="w-12 shrink-0 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">{new Date(dt).toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className="text-lg font-bold leading-none">{new Date(dt).getDate()}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(dt).toLocaleDateString(undefined, { month: "short" })}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {items.map((c) => (
                    <Link key={c.plan + c.date} to={`/re/d/re-maintenance-plan/${encodeURIComponent(c.plan)}`}
                      className={cn("block rounded-lg border px-2.5 py-1.5 text-xs transition hover:border-primary/50", c.overdue ? "border-red-500/40 bg-red-500/5" : "bg-card")}>
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="text-muted-foreground">{c.type} · {c.assignee ?? "unassigned"}{c.overdue ? " · overdue" : ""}</p>
                    </Link>
                  ))}
                </div>
              </li>
            ))}
            {!d.calendar.length && <p className="text-sm text-muted-foreground">Nothing planned in the next 30 days.</p>}
          </ol>
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Planned work vs complaints" sub="Jobs in the last 6 months by type — complaints where planned upkeep may be falling short" bodyClass="h-80">
          <ResponsiveContainer>
            <BarChart data={d.types} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="type" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={44} />
              <YAxis allowDecimals={false} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={32} />
              <Tooltip content={<ChartTip fmt={(v) => num(v)} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="planned" name="Planned jobs" stackId="a" fill={C.teal} maxBarSize={30} />
              <Bar dataKey="complaints" name="Complaints" stackId="a" fill={C.rose} radius={[5, 5, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export function PlanCell({ name, part }: { name: string; part: "due" | "reliability" | "last" | "who" }) {
  const { data } = usePlans();
  const p = data?.plans.find((x) => x.name === name);
  if (!p) return <span className="text-muted-foreground">—</span>;
  if (part === "due") {
    const d = p.days_to_due;
    const cls = d === null ? "bg-muted text-muted-foreground" : d < 0 ? "bg-red-500/15 text-red-700 dark:text-red-300" : d <= 7 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    return <span className="flex flex-col leading-tight"><span>{p.next_due ? date(p.next_due) : "—"}</span>
      {d !== null && <span className={cn("mt-0.5 w-fit rounded-full px-1.5 py-px text-[10px] font-semibold", cls)}>{d < 0 ? `${-d} days late` : d === 0 ? "today" : `in ${d} days`}</span>}</span>;
  }
  if (part === "reliability") {
    if (p.on_time_pct === null) return <span className="text-xs text-muted-foreground">no jobs yet</span>;
    return <div className="w-32"><div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{p.done}/{p.jobs} done</span><b style={{ color: tone(p.on_time_pct) }}>{p.on_time_pct}% on time</b></div><Bar2 pct={p.on_time_pct} color={tone(p.on_time_pct)} /></div>;
  }
  if (part === "last") return p.last_task
    ? <Link to={`/projects/tasks/${encodeURIComponent(p.last_task)}`} className="flex flex-col leading-tight hover:underline"><span className="text-xs font-medium">{p.last_status ?? "—"}</span><span className="text-[10px] text-muted-foreground">{p.last_done ? `done ${date(p.last_done)}` : p.last_task}</span></Link>
    : <span className="text-xs text-muted-foreground">—</span>;
  return <span className="flex flex-col leading-tight"><span className="text-sm">{p.assignee ?? "—"}</span><span className="text-[10px] text-muted-foreground"><Repeat className="mr-0.5 inline size-3" />{p.frequency} · {p.priority}</span></span>;
}

// ================================================================== infrastructure / map features
interface InfraData {
  kpis: { features: number; completed: number; in_progress: number; completion: number; network_km: number; estimated: number; spent: number; assets: number;
    asset_value: number; open_jobs: number; contractors: number };
  features: { name: string; feature_name: string; feature_type: string; category: string; geometry_type: string; status: string; completion: number; length_m: number;
    estimated_cost: number; asset: string | null; asset_value: number; contractor: string | null; area_kanal: number; jobs: number; open_jobs: number; color: string | null }[];
  categories: { category: string; features: number; completed: number; in_progress: number; planned: number; untracked: number; completion: number | null; estimated: number }[];
  networks: { network: string; length_m: number; built_m: number; segments: number; pct: number }[];
  types: { name: string; value: number }[];
}
const useInfra = () => useQuery({ queryKey: ["ops-infra"], queryFn: () => get<InfraData>("realestate.ops_insights.infrastructure"), staleTime: 60_000 });
const NET_COLOR: Record<string, string> = { Roads: C.slate, Sewerage: C.violet, "Water supply": C.sky, Electricity: C.amber, "Fibre internet": C.teal };
const STATUS_COLOR: Record<string, string> = { Completed: C.green, "In Progress": C.amber, Planned: C.blue, "Not tracked": C.slate };

export function InfrastructureInsights() {
  const { data: d } = useInfra();
  if (!d) return <Skeleton className="h-72" />;
  const k = d.kpis;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={MapPin} label="Features on the map" value={num(k.features)} color={C.blue} sub={`${num(k.completed)} completed · ${num(k.in_progress)} in progress`} />
        <KpiCard icon={GaugeIcon} label="Build-out" value={`${k.completion.toFixed(0)}%`} color={tone(k.completion)} progress={k.completion} sub="average completion of tracked works" />
        <KpiCard icon={Network} label="Networks laid out" value={`${k.network_km} km`} color={C.violet} sub="roads, sewer, water, power and fibre" />
        <KpiCard icon={Hammer} label="Spent on development" value={money(k.spent, { compact: true })} color={C.amber} sub={`${k.contractors} contractors · linked development projects`} />
        <KpiCard icon={Building2} label="Assets on the map" value={num(k.assets)} color={C.teal} sub={`${money(k.asset_value, { compact: true })} · ${num(k.open_jobs)} open upkeep jobs`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Networks — laid vs planned" sub="Length of each network on the map and how much of it is built" bodyClass="h-auto">
          <ul className="space-y-3">
            {d.networks.map((n) => (
              <li key={n.network}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: NET_COLOR[n.network] ?? C.slate }} />{n.network}
                    <span className="text-xs font-normal text-muted-foreground">{n.segments} segments</span></span>
                  <span className="tabular-nums"><b>{km(n.built_m)}</b> <span className="text-muted-foreground">of {km(n.length_m)} · {n.pct.toFixed(0)}%</span></span>
                </div>
                <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${n.pct}%`, background: `linear-gradient(90deg, ${NET_COLOR[n.network] ?? C.slate}aa, ${NET_COLOR[n.network] ?? C.slate})` }} />
                </div>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard title="Feature types" sub="What is on the scheme map" bodyClass="h-auto">
          <Donut data={d.types.slice(0, 8).map((x, i) => ({ ...x, color: PALETTE[i % PALETTE.length] }))} centerLabel="Features" centerValue={num(k.features)} height={190} />
        </ChartCard>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {d.categories.map((c) => (
          <div key={c.category} className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">{c.category}</p>
            <p className="text-xs text-muted-foreground">{c.features} features</p>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
              {(["completed", "in_progress", "planned", "untracked"] as const).map((s) => (
                <div key={s} style={{ width: `${(c[s] * 100) / Math.max(c.features, 1)}%`, background: STATUS_COLOR[s === "completed" ? "Completed" : s === "in_progress" ? "In Progress" : s === "planned" ? "Planned" : "Not tracked"] }} />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{c.completed} done · {c.in_progress} in progress{c.completion !== null ? ` · ${c.completion.toFixed(0)}% built` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeatureCell({ name, part }: { name: string; part: "progress" | "size" | "upkeep" }) {
  const { data } = useInfra();
  const f = data?.features.find((x) => x.name === name);
  if (!f) return <span className="text-muted-foreground">—</span>;
  if (part === "progress") {
    if (f.status === "Not tracked") return <span className="text-xs text-muted-foreground">not tracked</span>;
    return <div className="w-36"><div className="flex justify-between text-[11px]"><span style={{ color: STATUS_COLOR[f.status] }} className="font-semibold">{f.status}</span><b>{f.completion.toFixed(0)}%</b></div><Bar2 pct={f.completion} color={STATUS_COLOR[f.status] ?? C.slate} /></div>;
  }
  if (part === "size") {
    const bits = [f.length_m ? km(f.length_m) : null, f.area_kanal ? `${f.area_kanal.toFixed(1)} kanal` : null].filter(Boolean);
    return <span className="inline-flex items-center gap-1 text-xs tabular-nums"><Ruler className="size-3 text-muted-foreground" />{bits.join(" · ") || "point"}</span>;
  }
  return (
    <span className="flex flex-col items-end leading-tight">
      {f.asset ? <Link to={`/asset-management/register/${encodeURIComponent(f.asset)}`} className="text-xs font-medium text-primary hover:underline">{money(f.asset_value, { compact: true })} asset</Link> : <span className="text-xs text-muted-foreground">no asset</span>}
      <span className={cn("text-[10px]", f.open_jobs ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>{f.jobs} jobs{f.open_jobs ? ` · ${f.open_jobs} open` : ""}</span>
    </span>
  );
}

// ================================================================== fixed assets
interface AssetsData {
  kpis: { assets: number; drafts: number; cost: number; book: number; depreciated: number; on_map: number; depreciating: number; categories: number; largest: string | null; largest_cost: number };
  categories: { name: string; count: number; cost: number; book: number }[];
  status: { name: string; value: number }[];
  monthly: { month: string; cost: number; count: number }[];
  top: { name: string; asset_name: string; asset_category: string; location: string; status: string; purchase_date: string; feature: string | null; feature_name: string | null;
    feature_type: string | null; cost: number; book: number; jobs: number; open_jobs: number }[];
}

export function AssetInsights() {
  const { data: d } = useQuery({ queryKey: ["ops-assets"], queryFn: () => get<AssetsData>("realestate.ops_insights.assets"), staleTime: 60_000 });
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [land, setLand] = useState<"with" | "without">("without");
  const cats = useMemo(() => (d?.categories ?? []).filter((c) => land === "with" || c.name !== "Land"), [d, land]);
  const monthly = useMemo(() => {
    const rows = d?.monthly ?? [];
    const first = rows.findIndex((r) => r.cost > 0);
    return rows.slice(Math.max(0, first)).map((r) => ({ ...r, label: monthLabel(r.month) }));
  }, [d]);
  if (!d) return <Skeleton className="h-72" />;
  const k = d.kpis;
  const landCost = d.categories.find((c) => c.name === "Land")?.cost ?? 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Building2} label="Fixed assets" value={num(k.assets)} color={C.blue} sub={`${k.categories} categories${k.drafts ? ` · ${k.drafts} draft` : ""}`} />
        <KpiCard icon={Coins} label="Cost" value={money(k.cost, { compact: true })} color={C.violet} sub={landCost ? `land ${money(landCost, { compact: true })} · works ${money(k.cost - landCost, { compact: true })}` : "at purchase"} />
        <KpiCard icon={TrendingUp} label="Book value" value={money(k.book, { compact: true })} color={C.teal} progress={k.cost ? (k.book * 100) / k.cost : 0}
          sub={k.depreciated ? `${money(k.depreciated, { compact: true })} depreciated` : `${k.depreciating} on a depreciation schedule`} />
        <KpiCard icon={MapPin} label="On the scheme map" value={`${k.on_map} of ${k.assets}`} color={C.amber} progress={k.assets ? (k.on_map * 100) / k.assets : 0} sub="linked to a map feature" />
        <KpiCard icon={Wrench} label="Largest asset" value={money(k.largest_cost, { compact: true })} color={C.rose} sub={k.largest ?? "—"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Value by category" sub="Cost of the assets in each category"
          actions={landCost ? <Segmented value={land} onChange={setLand} options={[["without", "Without land"], ["with", "With land"]]} /> : undefined} bodyClass="h-72">
          <ResponsiveContainer>
            <BarChart data={cats} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={t.grid} />
              <XAxis type="number" tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={140} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="cost" name="Cost" radius={[0, 6, 6, 0]} maxBarSize={22}>{cats.map((c, i) => <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Assets by category" sub="How many of each" bodyClass="h-auto">
          <Donut data={d.categories.map((c, i) => ({ name: c.name, value: c.count, color: PALETTE[i % PALETTE.length] }))} centerLabel="Assets" height={190} />
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Purchases by month" sub="Assets added to the register" bodyClass="h-64">
          <ResponsiveContainer>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="label" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={48} scale="sqrt" />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="cost" name="Cost" fill={C.violet} radius={[5, 5, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Largest assets" sub="With the map feature they sit on and its upkeep jobs" bodyClass="h-auto">
          <DataTable rows={d.top} rowKey={(r) => r.name} dense rank initialSort={{ key: "cost", dir: "desc" }}
            cols={[
              { key: "asset_name", label: "Asset", render: (r) => <Link to={`/asset-management/register/${encodeURIComponent(r.name)}`} className="font-medium text-primary hover:underline">{r.asset_name}</Link> },
              { key: "asset_category", label: "Category", hideSm: true },
              { key: "feature_name", label: "On the map", value: (r) => r.feature_name ?? "", hideSm: true,
                render: (r) => (r.feature ? <Link to={`/re/d/re-map-feature/${encodeURIComponent(r.feature)}`} className="text-xs hover:underline">{r.feature_name}</Link> : <span className="text-xs text-muted-foreground">—</span>) },
              { key: "jobs", label: "Upkeep", align: "right", value: (r) => r.jobs, render: (r) => <span className={cn("text-xs", r.open_jobs && "font-semibold text-red-600")}>{r.jobs}{r.open_jobs ? ` (${r.open_jobs} open)` : ""}</span> },
              { key: "cost", label: "Cost", align: "right", value: (r) => r.cost, render: (r) => money(r.cost, { compact: true }), bar: { color: C.violet } },
            ]} />
        </ChartCard>
      </div>
    </div>
  );
}

