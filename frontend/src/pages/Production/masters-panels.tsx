import useSWR from "swr";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, Clock, Coins, Factory, Gauge, Package, PauseCircle, Timer, TrendingDown, Zap } from "lucide-react";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Card } from "@/components/ui/card";
import { postCall } from "@/services/frappe";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";
import { Empty, Tile } from "./plan-panels";
import { Meter } from "./wo-jc-panels";

const n0 = (v: unknown) => formatNumber(asNumber(v), 0);
const n1 = (v: unknown) => formatNumber(asNumber(v), 1);
const money = (v: unknown) => formatMoney(asNumber(v), "PKR");
const tone = (v: number | null | undefined, good = 95, ok = 85) => (v == null ? "primary" : v >= good ? "emerald" : v >= ok ? "amber" : "rose") as "primary" | "emerald" | "amber" | "rose";
const MONTH = (m: string) => new Date(`${m}-01T00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

interface WsInsights {
  period: { from: string; to: string };
  cards: number; completed: number; rework: number; std_hours: number; run_hours: number; stop_hours: number;
  efficiency: number | null; availability: number | null; output: number; loss_pct: number | null; cost: number; stops: number;
  downtime_by_reason: { reason: string; stops: number; minutes: number }[];
  items: { label: string; qty: number; cards: number }[];
  monthly: { month: string; run: number; stop: number }[];
}
function useWsInsights(workstation?: string) {
  return useSWR(workstation ? `ws-insights:${workstation}` : null,
    () => postCall<WsInsights>("micromax.production_plan.get_workstation_insights", { name: workstation }), { revalidateOnFocus: false });
}

/* ------------------------------------------------------------------ Workstation → Performance */
export function WorkstationPerformancePanel({ name, isNew }: ExtraContext) {
  const { data, isLoading } = useWsInsights(isNew ? undefined : name);
  if (isNew) return <Empty>Save the workstation to see how it performs.</Empty>;
  if (isLoading && !data) return <div className="h-48 animate-pulse rounded-xl bg-muted" />;
  if (!data) return <Empty>Could not load performance.</Empty>;
  const d = data;
  const oee = d.availability != null && d.efficiency != null ? (d.availability * d.efficiency) / 100 : null;
  const maxM = Math.max(1, ...d.monthly.map((m) => m.run + m.stop));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Fiscal year {d.period.from} → {d.period.to} · from job cards and downtime entries on this machine</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Gauge className="h-4 w-4" />} label="Time efficiency" value={d.efficiency != null ? `${d.efficiency}%` : "—"} sub="standard ÷ run hours" tone={tone(d.efficiency)} />
        <Tile icon={<Activity className="h-4 w-4" />} label="Availability" value={d.availability != null ? `${d.availability}%` : "—"} sub="run ÷ (run + stopped)" tone={tone(d.availability, 92, 85)} />
        <Tile icon={<Zap className="h-4 w-4" />} label="Availability × efficiency" value={oee != null ? `${n1(oee)}%` : "—"} sub="OEE without the quality factor" tone={tone(oee, 85, 70)} />
        <Tile icon={<Coins className="h-4 w-4" />} label="Operating cost" value={money(d.cost)} sub={`${n0(d.cards)} job cards`} tone="violet" />
        <Tile icon={<Clock className="h-4 w-4" />} label="Run hours" value={n1(d.run_hours)} sub={`${n1(d.std_hours)} standard`} tone="sky" />
        <Tile icon={<PauseCircle className="h-4 w-4" />} label="Stopped" value={`${n1(d.stop_hours)} h`} sub={`${n0(d.stops)} stops`} tone={d.stop_hours > d.run_hours * 0.1 ? "rose" : "amber"} />
        <Tile icon={<Package className="h-4 w-4" />} label="Output" value={n0(d.output)} sub={`${n0(d.completed)} completed cards`} tone="emerald" />
        <Tile icon={<TrendingDown className="h-4 w-4" />} label="Process loss" value={d.loss_pct != null ? `${d.loss_pct}%` : "—"} sub={d.rework ? `${d.rework} rework cards` : "of input"} tone={d.loss_pct != null && d.loss_pct > 3 ? "amber" : "emerald"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold">Running vs stopped hours</p>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-emerald-500" /> Running</span>
              <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-rose-500" /> Stopped</span>
            </div>
          </div>
          {d.monthly.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No activity this year.</p> : (
            <div className="flex h-44 items-end gap-2">
              {d.monthly.map((m) => (
                <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${MONTH(m.month)}: ${n1(m.run)} h running · ${n1(m.stop)} h stopped`}>
                  <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${((m.run + m.stop) / maxM) * 140}px` }}>
                    <div className="bg-emerald-500" style={{ height: `${(m.run / (m.run + m.stop || 1)) * 100}%` }} />
                    <div className="bg-rose-500" style={{ height: `${(m.stop / (m.run + m.stop || 1)) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{MONTH(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="space-y-3 p-5 lg:col-span-2">
          <p className="text-sm font-semibold">Why it stops</p>
          {d.downtime_by_reason.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No stoppages recorded.</p> :
            d.downtime_by_reason.map((r) => <Meter key={r.reason} label={r.reason} value={asNumber(r.minutes)} max={asNumber(d.downtime_by_reason[0].minutes)} tone="bg-rose-500" right={`${n1(asNumber(r.minutes) / 60)} h · ${r.stops}×`} />)}
          {d.items.length > 0 && (
            <>
              <p className="pt-2 text-sm font-semibold">What it made</p>
              {d.items.map((i) => <Meter key={i.label} label={i.label} value={asNumber(i.qty)} max={asNumber(d.items[0].qty)} tone="bg-sky-500" right={`${n0(i.qty)} · ${i.cards} cards`} />)}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Downtime Entry → Stoppage + Machine history */
export function DowntimeSummaryPanel({ values }: ExtraContext) {
  const mins = asNumber(values.downtime);
  const sev = mins >= 240 ? { t: "Major stoppage", c: "rose" as const } : mins >= 60 ? { t: "Significant stoppage", c: "amber" as const } : { t: "Minor stoppage", c: "emerald" as const };
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile icon={<Timer className="h-4 w-4" />} label="Duration" value={mins >= 60 ? `${n1(mins / 60)} h` : `${n0(mins)} min`} sub={sev.t} tone={sev.c} />
      <Tile icon={<Factory className="h-4 w-4" />} label="Machine" value={values.workstation ?? "—"} sub={values.operator ? `operator ${values.operator}` : "no operator"} />
      <Tile icon={<AlertTriangle className="h-4 w-4" />} label="Reason" value={values.stop_reason || "Not set"} sub={values.remarks ? String(values.remarks).slice(0, 40) : "no remarks"} tone="amber" />
      <Tile icon={<Package className="h-4 w-4" />} label="Work order" value={values.work_order || "—"} sub={values.work_order ? "production lost on this order" : "not linked"} tone="violet" />
    </div>
  );
}

export function DowntimeHistoryPanel({ values }: ExtraContext) {
  const { data, isLoading } = useWsInsights(values.workstation || undefined);
  if (!values.workstation) return <Empty>Choose a workstation to see its stoppage history.</Empty>;
  if (isLoading && !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!data) return <Empty>Could not load history.</Empty>;
  const mins = asNumber(values.downtime);
  const total = data.downtime_by_reason.reduce((s, r) => s + asNumber(r.minutes), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<PauseCircle className="h-4 w-4" />} label="Stops this year" value={n0(data.stops)} sub={`${n1(total / 60)} h in total`} tone="rose" />
        <Tile icon={<Timer className="h-4 w-4" />} label="This stop" value={total ? `${formatNumber((mins / total) * 100, 1)}%` : "—"} sub="of the machine's downtime" tone="amber" />
        <Tile icon={<Activity className="h-4 w-4" />} label="Availability" value={data.availability != null ? `${data.availability}%` : "—"} sub="run ÷ (run + stopped)" tone={tone(data.availability, 92, 85)} />
        <Tile icon={<Gauge className="h-4 w-4" />} label="Average stop" value={data.stops ? `${n0(total / data.stops)} min` : "—"} sub="per stoppage" />
      </div>
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{values.workstation} — stoppages by reason</p>
          <Link to={`/production/workstations/${encodeURIComponent(values.workstation)}?tab=Performance`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Machine performance <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.downtime_by_reason.map((r) => (
          <Meter key={r.reason} label={r.reason === values.stop_reason ? `${r.reason} · this reason` : r.reason} value={asNumber(r.minutes)} max={asNumber(data.downtime_by_reason[0]?.minutes)}
            tone={r.reason === values.stop_reason ? "bg-rose-500" : "bg-slate-400"} right={`${n1(asNumber(r.minutes) / 60)} h · ${r.stops}×`} />
        ))}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Routing → flow */
export function RoutingFlowPanel({ rows }: ExtraContext) {
  const ops = rows.operations ?? [];
  if (!ops.length) return <Empty>Add operations on the Operations tab to build the route.</Empty>;
  const mins = ops.reduce((s, o) => s + asNumber(o.time_in_mins), 0);
  const cost = ops.reduce((s, o) => s + (asNumber(o.time_in_mins) / 60) * asNumber(o.hour_rate), 0);
  const bottleneck = ops.reduce((a, o) => (asNumber(o.time_in_mins) > asNumber(a.time_in_mins) ? o : a), ops[0]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Activity className="h-4 w-4" />} label="Steps" value={ops.length} sub="operations in sequence" />
        <Tile icon={<Clock className="h-4 w-4" />} label="Time per unit" value={`${formatNumber(mins, 3)} min`} sub={`${n1(mins > 0 ? 60 / mins : 0)} units / hour`} tone="sky" />
        <Tile icon={<Coins className="h-4 w-4" />} label="Cost per unit" value={formatMoney(cost, "PKR")} sub="time × hour rate" tone="emerald" />
        <Tile icon={<AlertTriangle className="h-4 w-4" />} label="Slowest step" value={bottleneck.operation ?? "—"} sub={`${formatNumber(asNumber(bottleneck.time_in_mins), 3)} min per unit`} tone="amber" />
      </div>
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold">Process flow</p>
        <ol className="flex flex-wrap items-stretch gap-2">
          {ops.map((o, i) => {
            const share = mins ? (asNumber(o.time_in_mins) / mins) * 100 : 0;
            return (
              <li key={`${o.operation}-${i}`} className="flex items-center gap-2">
                <div className={cn("w-40 rounded-xl border p-3 transition-colors", o === bottleneck ? "border-amber-500/60 bg-amber-500/10" : "border-border bg-muted/30")}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Step {o.sequence_id || i + 1}</p>
                  <p className="truncate text-sm font-semibold" title={o.operation}>{o.operation || "—"}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={o.workstation}>{o.workstation || o.workstation_type || "any machine"}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-muted"><div className={cn("h-1.5 rounded-full", o === bottleneck ? "bg-amber-500" : "bg-primary")} style={{ width: `${share}%` }} /></div>
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{formatNumber(asNumber(o.time_in_mins), 3)} min · {formatNumber(share, 0)}%</p>
                </div>
                {i < ops.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
