import type { ReactNode } from "react";
import useSWR from "swr";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Coins, Factory, Gauge, Hourglass, PackageCheck, Timer, TrendingDown, Users, Wrench } from "lucide-react";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Card } from "@/components/ui/card";
import { postCall } from "@/services/frappe";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";
import { Empty, Tile } from "./plan-panels";

/* ------------------------------------------------------------------ shared bits */
const n0 = (v: unknown) => formatNumber(asNumber(v), 0);
const n1 = (v: unknown) => formatNumber(asNumber(v), 1);
const money = (v: unknown) => formatMoney(asNumber(v), "PKR");
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const dt = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDT = (v: unknown) => dt(v)?.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) ?? "—";
const hoursBetween = (a: unknown, b: unknown) => {
  const x = dt(a), y = dt(b);
  return x && y ? (y.getTime() - x.getTime()) / 3_600_000 : null;
};
const toneFor = (v: number | null, good = 95, ok = 85) => (v == null ? "primary" : v >= good ? "emerald" : v >= ok ? "amber" : "rose") as "primary" | "emerald" | "amber" | "rose";

/** Status as a stepper: where the document is in its life cycle. */
function Stepper({ steps, current, halted }: { steps: string[]; current: string; halted?: string | null }) {
  const at = Math.max(0, steps.indexOf(current));
  return (
    <Card className="p-4">
      <ol className="flex items-center gap-2 overflow-x-auto">
        {steps.map((s, i) => {
          const done = i < at || (i === at && s === steps[steps.length - 1]);
          const on = i === at;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2",
                done ? "bg-emerald-500 text-white ring-emerald-500/30" : on ? "bg-primary text-primary-foreground ring-primary/30" : "bg-muted text-muted-foreground ring-border")}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("truncate text-xs font-medium", on ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < steps.length - 1 && <span className={cn("h-0.5 min-w-4 flex-1 rounded", i < at ? "bg-emerald-500" : "bg-border")} />}
            </li>
          );
        })}
      </ol>
      {halted && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> {halted}
        </p>
      )}
    </Card>
  );
}

/** Horizontal meter with a label, value and optional target marker. */
export function Meter({ label, value, max, target, tone = "bg-primary", right }: { label: string; value: number; max: number; target?: number; tone?: string; right: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{right}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-muted">
        <div className={cn("h-2.5 rounded-full transition-[width] duration-500", tone)} style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }} />
        {target != null && max > 0 && <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-foreground/70" style={{ left: `${Math.min(100, (target / max) * 100)}%`, height: 18 }} title={`Target ${n1(target)}`} />}
      </div>
    </div>
  );
}

/** Planned vs actual (and due) spans on one small time axis. */
export function Timeline({ rows, due }: { rows: { label: string; from: unknown; to: unknown; tone: string }[]; due?: unknown }) {
  const pts = rows.flatMap((r) => [dt(r.from), dt(r.to)]).concat(due ? [dt(due)] : []).filter(Boolean) as Date[];
  if (!pts.length) return <p className="py-4 text-center text-sm text-muted-foreground">No dates yet.</p>;
  const min = Math.min(...pts.map((d) => d.getTime())), max = Math.max(...pts.map((d) => d.getTime()));
  const span = Math.max(max - min, 3_600_000);
  const x = (d: Date) => ((d.getTime() - min) / span) * 100;
  const dueD = dt(due);
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const a = dt(r.from), b = dt(r.to) ?? (a ? new Date() : null);
        return (
          <div key={r.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-xs">
            <span className="font-medium text-muted-foreground">{r.label}</span>
            <div className="relative h-5 rounded-md bg-muted/60">
              {a && b && (
                <div className={cn("absolute inset-y-0.5 rounded", r.tone, !dt(r.to) && "bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.35)_0_4px,transparent_4px_8px)]")}
                  style={{ left: `${x(a)}%`, width: `${Math.max(1.5, x(b) - x(a))}%` }} title={`${fmtDT(r.from)} → ${dt(r.to) ? fmtDT(r.to) : "running"}`} />
              )}
              {dueD && <span className="absolute -inset-y-1 w-0.5 bg-rose-500" style={{ left: `${x(dueD)}%` }} title={`Due ${fmtDT(due)}`} />}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between pl-[7.25rem] text-[10px] text-muted-foreground">
        <span>{fmtDT(new Date(min).toISOString())}</span>
        {dueD && <span className="text-rose-500">● due</span>}
        <span>{fmtDT(new Date(max).toISOString())}</span>
      </div>
    </div>
  );
}

/* ================================================================== WORK ORDER */
interface WoInsights {
  operations: { operation: string; cards: number; completed: number; std_hours: number; actual_hours: number; cost: number; loss: number; qty: number;
    workstations: string; started: string | null; finished: string | null; rework: number; efficiency: number | null; loss_pct: number | null }[];
  stock: { purpose: string; entries: number; qty: number; outgoing: number; incoming: number; additional: number }[];
  downtime: { reason: string; stops: number; minutes: number }[];
}
function useWoInsights({ name, isNew, values }: ExtraContext) {
  return useSWR(!isNew && name ? `wo-insights:${name}:${values.modified ?? ""}` : null,
    () => postCall<WoInsights>("micromax.production_plan.get_wo_insights", { name }), { revalidateOnFocus: false, keepPreviousData: true });
}

/** Order tab — where the order stands. */
export function WoProgressPanel({ values }: ExtraContext) {
  const qty = asNumber(values.qty), made = asNumber(values.produced_qty), moved = asNumber(values.material_transferred_for_manufacturing), loss = asNumber(values.process_loss_qty);
  const status = String(values.status ?? "Draft");
  const steps = ["Draft", "Not Started", "In Process", "Completed"];
  const cur = status === "Closed" ? "Completed" : steps.includes(status) ? status : status === "Stopped" ? "In Process" : "Not Started";
  return (
    <div className="space-y-4">
      <Stepper steps={steps} current={cur} halted={status === "Stopped" ? "This work order is stopped." : status === "Closed" ? "Closed before full completion." : null} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Factory className="h-4 w-4" />} label="To manufacture" value={`${n0(qty)} ${values.stock_uom ?? ""}`} sub={values.item_name ?? values.production_item} />
        <Tile icon={<PackageCheck className="h-4 w-4" />} label="Produced" value={n0(made)} sub={`${n1(pct(made, qty))}% of the order`} tone={made >= qty && qty ? "emerald" : "sky"} />
        <Tile icon={<Hourglass className="h-4 w-4" />} label="Material transferred" value={n0(moved)} sub={`${n1(pct(moved, qty))}% moved to WIP`} tone="violet" />
        <Tile icon={<TrendingDown className="h-4 w-4" />} label="Balance" value={n0(Math.max(0, qty - made))} sub={loss ? `${n0(loss)} process loss` : "to produce"} tone={qty - made > 0 ? "amber" : "emerald"} />
      </div>
      <Card className="space-y-3 p-5">
        <Meter label="Produced" value={made} max={qty} tone="bg-emerald-500" right={`${n0(made)} / ${n0(qty)}`} />
        <Meter label="Material transferred for manufacture" value={moved} max={qty} tone="bg-violet-500" right={`${n0(moved)} / ${n0(qty)}`} />
      </Card>
    </div>
  );
}

/** Schedule tab — planned vs actual span and delivery. */
export function WoSchedulePanel({ values }: ExtraContext) {
  const due = values.expected_delivery_date ? `${values.expected_delivery_date} 23:59:59` : null;
  const plannedH = hoursBetween(values.planned_start_date, values.planned_end_date);
  const actualH = hoursBetween(values.actual_start_date, values.actual_end_date ?? (values.actual_start_date ? new Date().toISOString() : null));
  const startDelay = hoursBetween(values.planned_start_date, values.actual_start_date);
  const finish = dt(values.actual_end_date);
  const late = finish && due ? (finish.getTime() - dt(due)!.getTime()) / 86_400_000 : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<CalendarClock className="h-4 w-4" />} label="Planned duration" value={plannedH != null ? `${n1(plannedH / 24)} d` : "—"} sub={`${fmtDT(values.planned_start_date)}`} />
        <Tile icon={<Clock className="h-4 w-4" />} label="Actual duration" value={actualH != null && actualH >= 0 ? `${n1(actualH / 24)} d` : "—"} sub={values.actual_end_date ? "finished" : values.actual_start_date ? "running" : "not started"} tone="violet" />
        <Tile icon={<Timer className="h-4 w-4" />} label="Start delay" value={startDelay != null ? `${n1(startDelay)} h` : "—"} sub="planned → actual start" tone={startDelay != null && startDelay > 24 ? "amber" : "emerald"} />
        <Tile icon={<AlertTriangle className="h-4 w-4" />} label="Against due date" value={late == null ? "—" : late <= 0 ? "On time" : `${n1(late)} d late`}
          sub={values.expected_delivery_date ? `due ${values.expected_delivery_date}` : "no due date"} tone={late == null ? "primary" : late <= 0 ? "emerald" : "rose"} />
      </div>
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold">Timeline</p>
        <Timeline due={due} rows={[
          { label: "Planned", from: values.planned_start_date, to: values.planned_end_date, tone: "bg-slate-400/80" },
          { label: "Actual", from: values.actual_start_date, to: values.actual_end_date, tone: late != null && late > 0 ? "bg-rose-500" : "bg-emerald-500" },
        ]} />
      </Card>
    </div>
  );
}

/** Materials tab — required vs transferred vs consumed per component. */
export function WoMaterialsPanel({ rows }: ExtraContext) {
  const items = rows.required_items ?? [];
  if (!items.length) return <Empty>No required items — pick a BOM on the Order tab to load them.</Empty>;
  const req = items.reduce((s, r) => s + asNumber(r.required_qty), 0);
  const tr = items.reduce((s, r) => s + asNumber(r.transferred_qty), 0);
  const co = items.reduce((s, r) => s + asNumber(r.consumed_qty), 0);
  const value = items.reduce((s, r) => s + asNumber(r.amount), 0);
  const max = Math.max(1, ...items.map((r) => Math.max(asNumber(r.required_qty), asNumber(r.transferred_qty), asNumber(r.consumed_qty))));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<PackageCheck className="h-4 w-4" />} label="Required" value={n0(req)} sub={`${items.length} components`} />
        <Tile icon={<Hourglass className="h-4 w-4" />} label="Transferred" value={n0(tr)} sub={`${n1(pct(tr, req))}% of required`} tone="violet" />
        <Tile icon={<Factory className="h-4 w-4" />} label="Consumed" value={n0(co)} sub={`${n1(pct(co, req))}% of required`} tone="sky" />
        <Tile icon={<Coins className="h-4 w-4" />} label="Material value" value={money(value)} sub="required qty × rate" tone="emerald" />
      </div>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Component flow</p>
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-slate-400" /> Required</span>
            <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-violet-500" /> Transferred</span>
            <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-sky-500" /> Consumed</span>
          </div>
        </div>
        {items.map((r, i) => (
          <div key={`${r.item_code}-${i}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium">{r.item_name || r.item_code}{asNumber(r.blend_ratio) ? <span className="ml-1.5 text-muted-foreground">· {n1(r.blend_ratio)}% blend</span> : null}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{n1(r.consumed_qty)} / {n1(r.required_qty)} {r.stock_uom ?? ""}</span>
            </div>
            {[["bg-slate-400", r.required_qty], ["bg-violet-500", r.transferred_qty], ["bg-sky-500", r.consumed_qty]].map(([c, v], k) => (
              <div key={k} className="my-0.5 h-1.5 rounded-full bg-muted"><div className={cn("h-1.5 rounded-full", c as string)} style={{ width: `${(asNumber(v) / max) * 100}%` }} /></div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Operations tab — execution per operation from the order's job cards. */
export function WoOperationsPanel(ctx: ExtraContext) {
  const { data, isLoading } = useWoInsights(ctx);
  if (ctx.isNew) return <Empty>Save the work order to track its operations.</Empty>;
  if (isLoading && !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const ops = data?.operations ?? [];
  if (!ops.length) return <Empty>No job cards yet — operations appear here as the shop floor records them.</Empty>;
  const std = ops.reduce((s, o) => s + asNumber(o.std_hours), 0), act = ops.reduce((s, o) => s + asNumber(o.actual_hours), 0);
  const eff = act ? (std / act) * 100 : null;
  const done = ops.reduce((s, o) => s + asNumber(o.completed), 0), cards = ops.reduce((s, o) => s + asNumber(o.cards), 0);
  const max = Math.max(1, ...ops.map((o) => Math.max(asNumber(o.std_hours), asNumber(o.actual_hours))));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Wrench className="h-4 w-4" />} label="Operations" value={ops.length} sub={`${n0(done)} of ${n0(cards)} job cards completed`} />
        <Tile icon={<Clock className="h-4 w-4" />} label="Standard hours" value={n1(std)} sub="routing standard" tone="sky" />
        <Tile icon={<Timer className="h-4 w-4" />} label="Actual hours" value={n1(act)} sub={money(ops.reduce((s, o) => s + asNumber(o.cost), 0)) + " cost"} tone="violet" />
        <Tile icon={<Gauge className="h-4 w-4" />} label="Time efficiency" value={eff != null ? `${n1(eff)}%` : "—"} sub="standard ÷ actual" tone={toneFor(eff)} />
      </div>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2 text-left">Operation</th><th className="px-4 py-2 text-left">Standard vs actual</th><th className="px-3 py-2 text-right">Efficiency</th>
                <th className="px-3 py-2 text-right">Loss %</th><th className="px-3 py-2 text-right">Cards</th><th className="px-4 py-2 text-right">Cost</th></tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.operation} className="border-t border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-2.5"><p className="font-medium">{o.operation}{o.rework ? <span className="ml-1.5 rounded bg-violet-500/15 px-1 text-[10px] text-violet-600 dark:text-violet-300">rework</span> : null}</p>
                    <p className="max-w-[14rem] truncate text-[11px] text-muted-foreground" title={o.workstations}>{o.workstations}</p></td>
                  <td className="w-[32%] px-4 py-2.5">
                    <div className="my-0.5 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${(asNumber(o.std_hours) / max) * 100}%` }} /></div>
                    <div className="my-0.5 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${(asNumber(o.actual_hours) / max) * 100}%` }} /></div>
                    <p className="text-[10px] text-muted-foreground">{n1(o.std_hours)} h std · {n1(o.actual_hours)} h actual</p>
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", o.efficiency == null ? "text-muted-foreground" : o.efficiency >= 95 ? "text-emerald-600 dark:text-emerald-400" : o.efficiency >= 85 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>{o.efficiency != null ? `${o.efficiency}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.loss_pct != null ? `${o.loss_pct}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n0(o.completed)}/{n0(o.cards)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(o.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Performance tab — spinning targets vs actuals, and downtime by reason. */
export function WoPerformancePanel(ctx: ExtraContext) {
  const { values } = ctx;
  const { data } = useWoInsights(ctx);
  const cmp = [
    { label: "Yield %", target: asNumber(values.target_yield), actual: asNumber(values.actual_yield), higherBetter: true },
    { label: "Waste %", target: asNumber(values.target_waste_percentage), actual: asNumber(values.actual_waste_percentage), higherBetter: false },
    { label: "OPS", target: asNumber(values.target_ops), actual: asNumber(values.actual_ops), higherBetter: true },
    { label: "Spindles", target: asNumber(values.spindle_required), actual: asNumber(values.spindle_worked), higherBetter: true },
    { label: "Frames", target: asNumber(values.frame_required), actual: asNumber(values.actual_frame_required), higherBetter: true },
  ].filter((c) => c.target || c.actual);
  const dtRows = data?.downtime ?? [];
  const dtTotal = dtRows.reduce((s, r) => s + asNumber(r.minutes), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="space-y-4 p-5 lg:col-span-3">
        <div><p className="text-sm font-semibold">Target vs actual</p><p className="text-xs text-muted-foreground">Bar: actual · marker: target</p></div>
        {cmp.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No spinning targets on this order.</p> : cmp.map((c) => {
          const good = c.actual === 0 ? null : c.higherBetter ? c.actual >= c.target : c.actual <= c.target;
          return <Meter key={c.label} label={c.label} value={c.actual} max={Math.max(c.target, c.actual) * 1.15 || 1} target={c.target}
            tone={good == null ? "bg-slate-400" : good ? "bg-emerald-500" : "bg-rose-500"}
            right={<><b className="text-foreground">{n1(c.actual)}</b> vs {n1(c.target)}</>} />;
        })}
      </Card>
      <Card className="p-5 lg:col-span-2">
        <p className="text-sm font-semibold">Downtime</p>
        <p className="mb-4 text-xs text-muted-foreground">{dtRows.length ? `${n0(dtRows.reduce((s, r) => s + asNumber(r.stops), 0))} stops · ${n1(dtTotal / 60)} hours` : "No stoppages recorded"}</p>
        <div className="space-y-3">
          {dtRows.map((r) => <Meter key={r.reason} label={r.reason} value={asNumber(r.minutes)} max={dtRows[0] ? asNumber(dtRows[0].minutes) : 1} tone="bg-amber-500" right={`${n0(r.minutes)} min · ${n0(r.stops)}×`} />)}
        </div>
      </Card>
    </div>
  );
}

/** Costing tab — operating cost plan vs actual, plus material value from the manufacture entries. */
export function WoCostingPanel(ctx: ExtraContext) {
  const { values } = ctx;
  const { data } = useWoInsights(ctx);
  const planned = asNumber(values.planned_operating_cost), actual = asNumber(values.actual_operating_cost);
  const additional = asNumber(values.additional_operating_cost), corrective = asNumber(values.corrective_operation_cost);
  const jobCardCost = (data?.operations ?? []).reduce((s, o) => s + asNumber(o.cost), 0);
  const mfg = (data?.stock ?? []).find((s) => s.purpose === "Manufacture");
  const material = asNumber(mfg?.outgoing);
  const made = asNumber(values.produced_qty);
  const opCost = actual || jobCardCost;
  const total = material + opCost + additional + corrective;
  const lines: [string, number, string][] = [["Material consumed", material, "bg-sky-500"], ["Operations", opCost, "bg-violet-500"], ["Additional", additional, "bg-amber-500"], ["Corrective", corrective, "bg-rose-500"]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Coins className="h-4 w-4" />} label="Planned operating cost" value={money(planned)} sub="from the operations" />
        <Tile icon={<Wrench className="h-4 w-4" />} label="Actual operating cost" value={money(opCost)} sub={actual ? "on the work order" : "from job cards"} tone="violet" />
        <Tile icon={<Factory className="h-4 w-4" />} label="Total cost" value={money(total)} sub="material + operations + extra" tone="sky" />
        <Tile icon={<Gauge className="h-4 w-4" />} label="Cost per unit" value={made ? money(total / made) : "—"} sub={made ? `${n0(made)} produced` : "nothing produced yet"} tone="emerald" />
      </div>
      <Card className="p-5">
        <p className="mb-3 text-sm font-semibold">Cost build-up</p>
        <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted">
          {lines.filter(([, v]) => v > 0).map(([l, v, c]) => <div key={l} className={c} style={{ width: `${pct(v, total || 1)}%` }} />)}
        </div>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {lines.map(([l, v, c]) => (
            <div key={l} className="flex items-center justify-between"><dt className="flex items-center gap-2 text-muted-foreground"><i className={cn("h-2.5 w-2.5 rounded-sm", c)} /> {l}</dt><dd className="font-medium tabular-nums">{money(v)}</dd></div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

/* ================================================================== JOB CARD */
/** Job tab — progress and status. */
export function JcProgressPanel({ values }: ExtraContext) {
  const qty = asNumber(values.for_quantity), done = asNumber(values.total_completed_qty), loss = asNumber(values.process_loss_qty);
  const status = String(values.status ?? "Open");
  const steps = ["Open", "Material Transferred", "Work In Progress", "Completed"];
  const cur = steps.includes(status) ? status : status === "Partially Transferred" ? "Material Transferred" : status === "Submitted" ? "Completed" : status === "On Hold" ? "Work In Progress" : "Open";
  return (
    <div className="space-y-4">
      <Stepper steps={steps} current={cur} halted={status === "On Hold" ? "This job card is on hold." : values.is_corrective_job_card ? `Corrective job card${values.for_job_card ? ` for ${values.for_job_card}` : ""}.` : null} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Wrench className="h-4 w-4" />} label="Operation" value={values.operation ?? "—"} sub={values.workstation ?? ""} />
        <Tile icon={<Factory className="h-4 w-4" />} label="To process" value={n0(qty)} sub={values.item_name ?? values.production_item ?? ""} tone="sky" />
        <Tile icon={<PackageCheck className="h-4 w-4" />} label="Completed" value={n0(done)} sub={`${n1(pct(done, qty))}% of input`} tone={done >= qty && qty ? "emerald" : "violet"} />
        <Tile icon={<TrendingDown className="h-4 w-4" />} label="Process loss" value={n1(loss)} sub={qty ? `${formatNumber(pct(loss, qty), 2)}% of input` : "—"} tone={pct(loss, qty) > 3 ? "amber" : "emerald"} />
      </div>
    </div>
  );
}

/** Time tab — expected vs actual time, schedule, and hours per operator. */
export function JcTimePanel({ values, rows }: ExtraContext) {
  const req = asNumber(values.time_required), act = asNumber(values.total_time_in_mins);
  const eff = act && req ? (req / act) * 100 : null;
  const wait = hoursBetween(values.expected_start_date, values.actual_start_date);
  const byEmp = new Map<string, { mins: number; qty: number; shifts: number }>();
  for (const r of rows.time_logs ?? []) {
    const k = r.employee_name || r.employee || "Unassigned";
    const e = byEmp.get(k) ?? { mins: 0, qty: 0, shifts: 0 };
    e.mins += asNumber(r.time_in_mins); e.qty += asNumber(r.completed_qty); e.shifts += 1;
    byEmp.set(k, e);
  }
  const emps = [...byEmp.entries()].sort((a, b) => b[1].mins - a[1].mins);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Clock className="h-4 w-4" />} label="Standard time" value={`${n1(req / 60)} h`} sub={`${n0(req)} min`} />
        <Tile icon={<Timer className="h-4 w-4" />} label="Actual time" value={`${n1(act / 60)} h`} sub={`${n0(act)} min`} tone="violet" />
        <Tile icon={<Gauge className="h-4 w-4" />} label="Efficiency" value={eff != null ? `${n1(eff)}%` : "—"} sub="standard ÷ actual" tone={toneFor(eff)} />
        <Tile icon={<Hourglass className="h-4 w-4" />} label="Queue wait" value={wait != null ? `${n1(wait)} h` : "—"} sub="expected → actual start" tone={wait != null && wait > 8 ? "amber" : "emerald"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <p className="mb-4 text-sm font-semibold">Expected vs actual</p>
          <Timeline rows={[
            { label: "Expected", from: values.expected_start_date, to: values.expected_end_date, tone: "bg-slate-400/80" },
            { label: "Actual", from: values.actual_start_date, to: values.actual_end_date, tone: eff != null && eff < 85 ? "bg-rose-500" : "bg-emerald-500" },
          ]} />
        </Card>
        <Card className="p-5 lg:col-span-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Operators</p>
          <p className="mb-3 text-xs text-muted-foreground">{emps.length ? `${emps.length} on ${(rows.time_logs ?? []).length} time logs` : "No time logged yet"}</p>
          <div className="max-h-56 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            {emps.map(([k, e]) => <Meter key={k} label={k} value={e.mins} max={emps[0][1].mins} tone="bg-primary" right={`${n1(e.mins / 60)} h · ${n0(e.qty)} qty`} />)}
          </div>
        </Card>
      </div>
    </div>
  );
}
