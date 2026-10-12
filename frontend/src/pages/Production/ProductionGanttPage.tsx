import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  GanttChartSquare,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { addDaysISO, todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/currency";

// ------------------------------------------------------------------ data
type Span = [string, string] | null;
interface GanttOp {
  id: string; label: string; workstation?: string; status: string; rework: boolean;
  planned: Span; actual: Span; open_ended: boolean; efficiency: number | null;
}
interface GanttWO {
  id: string; label: string; item: string; status: string; stream: string; qty: number; produced: number; progress: number;
  planned: Span; actual: Span; open_ended: boolean; due: string | null; late: boolean; ops: GanttOp[];
}
interface GanttPlan {
  id: string; label: string; is_plan: boolean; status: string; posting_date: string | null; qty: number; produced: number; progress: number;
  planned: Span; actual: Span; late: boolean; streams: string[]; work_orders: GanttWO[];
}
interface Schedule {
  from: string; to: string; now: string; truncated: boolean; plans: GanttPlan[];
  totals: { plans: number; work_orders: number; operations: number; in_process: number; late: number };
}

type Level = 0 | 1 | 2;
interface Row {
  key: string; level: Level; id: string; label: string; sub?: string; status: string; planned: Span; actual: Span;
  progress?: number; late?: boolean; openEnded?: boolean; rework?: boolean; expandable: boolean; expanded: boolean; to?: string;
  info: [string, ReactNode][];
}

// ------------------------------------------------------------------ look
const ZOOM = { day: { px: 64, label: "Day" }, week: { px: 22, label: "Week" }, month: { px: 7, label: "Month" } } as const;
type Zoom = keyof typeof ZOOM;
const DAY_MS = 86_400_000;
const LEFT_W = 320;
const ROW_H = [40, 34, 30];

const STATUS_BAR: Record<string, string> = {
  Completed: "bg-emerald-500", Closed: "bg-emerald-600",
  "In Process": "bg-sky-500", "Work In Progress": "bg-sky-500", "Material Transferred": "bg-sky-400", Submitted: "bg-sky-400",
  "Not Started": "bg-slate-400", Open: "bg-slate-400", Draft: "bg-slate-300",
  Stopped: "bg-amber-500", "On Hold": "bg-amber-500", Cancelled: "bg-zinc-300",
};
const STATUS_DOT: Record<string, string> = {
  Completed: "text-emerald-600", Closed: "text-emerald-600", "In Process": "text-sky-600", "Work In Progress": "text-sky-600",
  "Not Started": "text-slate-500", Open: "text-slate-500", Stopped: "text-amber-600", "On Hold": "text-amber-600",
};
const barColor = (s: string) => STATUS_BAR[s] ?? "bg-slate-400";

const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDur = (s: Span) => {
  if (!s) return "—";
  const h = (new Date(s[1]).getTime() - new Date(s[0]).getTime()) / 3_600_000;
  return h >= 48 ? `${formatNumber(h / 24, 1)} days` : `${formatNumber(h, 1)} h`;
};

// ------------------------------------------------------------------ page
export function ProductionGanttPage() {
  const { company } = useCompanyContext();
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(() => addDaysISO(todayISO(), 21));
  const [zoom, setZoom] = useState<Zoom>("week");
  const [stream, setStream] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; row: Row } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const invalid = from > to;
  const { data, isLoading, isValidating, error } = useFrappeGetCall<{ message: Schedule }>(
    "micromax.gantt.get_schedule",
    { from_date: from, to_date: to, company: company ?? "", stream, status, search },
    invalid ? null : `micromax.gantt.${from}.${to}.${company ?? ""}.${stream}.${status}.${search}.${refresh}`,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const sched = data?.message;

  // ---- time axis
  const start = useMemo(() => new Date(`${from}T00:00`).getTime(), [from]);
  const days = Math.max(1, Math.round((new Date(`${to}T00:00`).getTime() - start) / DAY_MS) + 1);
  const px = ZOOM[zoom].px;
  const width = days * px;
  const x = (iso: string) => ((new Date(iso).getTime() - start) / DAY_MS) * px;
  const nowX = sched ? x(sched.now) : x(new Date().toISOString());

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => new Date(start + i * DAY_MS)), [start, days]);
  const months = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = [];
    dayList.forEach((d, i) => {
      const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const last = out[out.length - 1];
      if (last && last.label === label) last.width += px;
      else out.push({ label, left: i * px, width: px });
    });
    return out;
  }, [dayList, px]);

  // ---- rows
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of sched?.plans ?? []) {
      const pOpen = expanded.has(p.id);
      out.push({
        key: p.id, level: 0, id: p.id, label: p.label, sub: `${p.work_orders.length} WO · ${p.streams.join(", ")}`, status: p.status,
        planned: p.planned, actual: p.actual, progress: p.progress, late: p.late, expandable: p.work_orders.length > 0, expanded: pOpen,
        to: p.is_plan ? `/production/production-plans/${encodeURIComponent(p.id)}` : undefined,
        info: [["Status", p.status], ["Posted", p.posting_date ?? "—"], ["Work orders", p.work_orders.length],
               ["Planned qty", formatNumber(p.qty, 0)], ["Produced", `${formatNumber(p.produced, 0)} (${p.progress}%)`],
               ["Planned", p.planned ? `${fmtDT(p.planned[0])} → ${fmtDT(p.planned[1])}` : "—"],
               ["Actual", p.actual ? `${fmtDT(p.actual[0])} → ${fmtDT(p.actual[1])}` : "—"]],
      });
      if (!pOpen) continue;
      for (const w of p.work_orders) {
        const wKey = `${p.id}/${w.id}`;
        const wOpen = expanded.has(wKey);
        out.push({
          key: wKey, level: 1, id: w.id, label: w.label, sub: `${w.id} · ${w.stream}`, status: w.status, planned: w.planned, actual: w.actual,
          progress: w.progress, late: w.late, openEnded: w.open_ended, expandable: w.ops.length > 0, expanded: wOpen,
          to: `/production/work-orders/${encodeURIComponent(w.id)}`,
          info: [["Work order", w.id], ["Item", `${w.item} · ${w.label}`], ["Status", w.status], ["Stream", w.stream],
                 ["Quantity", `${formatNumber(w.produced, 0)} / ${formatNumber(w.qty, 0)} (${w.progress}%)`],
                 ["Planned", w.planned ? `${fmtDT(w.planned[0])} → ${fmtDT(w.planned[1])}` : "—"],
                 ["Actual", w.actual ? `${fmtDT(w.actual[0])} → ${w.open_ended ? "running" : fmtDT(w.actual[1])}` : "Not started"],
                 ["Due", w.due ?? "—"], ["Operations", w.ops.length]],
        });
        if (!wOpen) continue;
        for (const o of w.ops) {
          out.push({
            key: `${wKey}/${o.id}`, level: 2, id: o.id, label: o.label, sub: `${o.workstation ?? "—"}${o.rework ? " · rework" : ""}`, status: o.status,
            planned: o.planned, actual: o.actual, openEnded: o.open_ended, rework: o.rework, expandable: false, expanded: false,
            to: `/production/job-cards/${encodeURIComponent(o.id)}`,
            info: [["Job card", o.id], ["Operation", o.label], ["Machine", o.workstation ?? "—"], ["Status", o.status],
                   ["Planned", o.planned ? `${fmtDT(o.planned[0])} → ${fmtDT(o.planned[1])} (${fmtDur(o.planned)})` : "—"],
                   ["Actual", o.actual ? `${fmtDT(o.actual[0])} → ${o.open_ended ? "running" : fmtDT(o.actual[1])} (${fmtDur(o.actual)})` : "Not started"],
                   ["Efficiency", o.efficiency != null ? `${o.efficiency}%` : "—"]],
          });
        }
      }
    }
    return out;
  }, [sched, expanded]);

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const expandAll = () =>
    setExpanded(new Set((sched?.plans ?? []).flatMap((p) => [p.id, ...p.work_orders.map((w) => `${p.id}/${w.id}`)])));

  // Bring "now" into view whenever the window or zoom changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = nowX > 0 && nowX < width ? Math.max(0, nowX - (el.clientWidth - LEFT_W) / 3) : 0;
  }, [from, to, zoom, width, nowX, !!sched]);

  const shift = (dir: 1 | -1) => {
    const n = days * dir;
    setFrom((f) => addDaysISO(f, n));
    setTo((t) => addDaysISO(t, n));
  };
  const goToday = () => {
    setFrom(addDaysISO(todayISO(), -7));
    setTo(addDaysISO(todayISO(), days - 8));
  };

  const showTip = (e: MouseEvent, row: Row) => setTip({ x: e.clientX, y: e.clientY, row });

  // ---- bar renderer
  const bars = (r: Row) => {
    const h = ROW_H[r.level];
    const segs: ReactNode[] = [];
    const place = (s: Span) => {
      if (!s) return null;
      const l = x(s[0]), rt = x(s[1]);
      if (rt < 0 || l > width) return null;
      const left = Math.max(0, l);
      return { left, w: Math.max(3, Math.min(width, rt) - left), clipL: l < 0, clipR: rt > width };
    };
    const pl = place(r.planned);
    if (pl) {
      segs.push(
        <div
          key="p"
          className="absolute rounded-sm border border-dashed border-slate-400/80 bg-slate-300/25 dark:border-slate-500 dark:bg-slate-500/15"
          style={{ left: pl.left, width: pl.w, top: r.level === 0 ? 5 : 4, height: r.level === 0 ? 9 : 7 }}
        />,
      );
    }
    const ac = place(r.actual);
    if (ac) {
      const barH = r.level === 0 ? 14 : r.level === 1 ? 12 : 10;
      segs.push(
        <div
          key="a"
          className={cn(
            "absolute overflow-hidden rounded shadow-sm transition-[filter] group-hover/row:brightness-110",
            barColor(r.status),
            r.late && "ring-2 ring-rose-500 ring-offset-1 ring-offset-card",
            r.rework && "bg-violet-500",
            ac.clipL && "rounded-l-none",
            ac.clipR && "rounded-r-none",
          )}
          style={{ left: ac.left, width: ac.w, top: h - barH - (r.level === 0 ? 8 : 6), height: barH }}
        >
          {r.progress != null && r.progress > 0 && r.progress < 100 && (
            <div className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${r.progress}%` }} />
          )}
          {r.openEnded && (
            <div className="absolute inset-y-0 right-0 w-6 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.55)_0_4px,transparent_4px_8px)]" />
          )}
          {ac.w > 70 && r.level < 2 && (
            <span className="absolute inset-0 truncate px-1.5 text-[10px] font-semibold leading-[inherit] text-white" style={{ lineHeight: `${barH}px` }}>
              {r.progress != null ? `${Math.round(r.progress)}%` : ""}
            </span>
          )}
        </div>,
      );
    }
    return segs;
  };

  const t = sched?.totals;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Production Schedule"
        subtitle="Gantt of production plans → work orders → operations: planned (dashed) against actual (solid)"
        icon={<GanttChartSquare className="h-5 w-5" />}
        actions={
          <>
            <Link to="/production/production-plans" className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted">
              Production plans
            </Link>
            <Button variant="outline" size="sm" onClick={() => setRefresh((n) => n + 1)}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", isValidating && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />

      {/* toolbar */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous window" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={goToday}>Today</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next window" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-8 w-[9.5rem]" aria-label="From" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-8 w-[9.5rem]" aria-label="To" />
        </div>
        <div className="flex rounded-md bg-muted p-0.5">
          {(Object.keys(ZOOM) as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium", zoom === z ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {ZOOM[z].label}
            </button>
          ))}
        </div>
        <div className="w-36">
          <Select value={stream} onChange={(e) => setStream(e.target.value)} className="h-8 text-xs" aria-label="Stream">
            <option value="">All streams</option>
            <option>Mill 1</option>
            <option>Mill 2</option>
            <option>Conversion</option>
          </Select>
        </div>
        <div className="w-36">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 text-xs" aria-label="Work order status">
            <option value="">All statuses</option>
            {["Not Started", "In Process", "Stopped", "Completed", "Closed"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Plan, work order or item…" className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}><ChevronsUpDown className="mr-1 h-3.5 w-3.5" /> Expand all</Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setExpanded(new Set())}><ChevronsDownUp className="mr-1 h-3.5 w-3.5" /> Collapse</Button>
        </div>
      </Card>

      {/* summary + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {t &&
            ([["Plans", t.plans, ""], ["Work orders", t.work_orders, ""], ["Operations", t.operations, ""], ["Open / running", t.in_process, "text-sky-600"],
              ["Late", t.late, t.late ? "text-rose-600" : ""]] as const).map(([l, v, c]) => (
              <span key={l} className="rounded-full border border-border bg-card px-3 py-1 shadow-sm">
                <span className="text-muted-foreground">{l}</span> <b className={cn("tabular-nums", c)}>{formatNumber(v, 0)}</b>
              </span>
            ))}
          {sched?.truncated && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Showing the first 600 work orders — narrow the window or filter
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-5 rounded-sm border border-dashed border-slate-400 bg-slate-300/30" /> Planned</span>
          {[["bg-emerald-500", "Completed"], ["bg-sky-500", "In progress"], ["bg-slate-400", "Not started"], ["bg-amber-500", "Stopped / on hold"], ["bg-violet-500", "Rework"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5"><i className={cn("inline-block h-2.5 w-5 rounded-sm", c)} /> {l}</span>
          ))}
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-5 rounded-sm bg-slate-300 ring-2 ring-rose-500" /> Late</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-rose-500" /> Now</span>
        </div>
      </div>

      {invalid && <p className="text-sm text-rose-600">The start date must be before the end date.</p>}
      {error && <p className="text-sm text-rose-600">Could not load the schedule: {String((error as { message?: string }).message ?? error)}</p>}

      {/* chart */}
      <Card className="relative overflow-hidden p-0">
        {isValidating && sched && (
          <div className="absolute right-3 top-3 z-40 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
            <Loader2 className="h-3 w-3 animate-spin" /> Updating
          </div>
        )}
        {isLoading && !sched ? (
          <div className="space-y-2 p-4">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div ref={scrollRef} className="max-h-[calc(100vh-17rem)] min-h-[20rem] overflow-auto scrollbar-thin">
            <div style={{ width: LEFT_W + width }} className="relative">
              {/* header */}
              <div className="sticky top-0 z-30 flex border-b border-border bg-card">
                <div className="sticky left-0 z-10 flex items-end border-r border-border bg-card px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                  Plan / work order / operation
                </div>
                <div className="relative" style={{ width, height: 46 }}>
                  {months.map((m) => (
                    <div key={m.label + m.left} className="absolute top-0 h-5 truncate border-l border-border px-1.5 text-[11px] font-semibold" style={{ left: m.left, width: m.width }}>
                      {m.label}
                    </div>
                  ))}
                  {dayList.map((d, i) => {
                    const show = zoom === "day" || (zoom === "week" ? true : d.getDay() === 1);
                    if (!show) return null;
                    const weekend = d.getDay() === 0;
                    return (
                      <div
                        key={i}
                        className={cn("absolute top-5 flex h-[26px] flex-col items-center justify-center border-l border-border/60 text-[10px] leading-tight",
                          weekend ? "text-rose-500/80" : "text-muted-foreground")}
                        style={{ left: i * px, width: zoom === "month" ? px * 7 : px }}
                      >
                        {zoom === "day" && <span>{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>}
                        <span className="font-medium tabular-nums">{d.getDate()}</span>
                      </div>
                    );
                  })}
                  {nowX >= 0 && nowX <= width && <div className="absolute bottom-0 h-2 w-2 -translate-x-1/2 rotate-45 bg-rose-500" style={{ left: nowX }} />}
                </div>
              </div>

              {/* grid background + now line (one layer under all rows) */}
              <div className="pointer-events-none absolute bottom-0 top-[47px]" style={{ left: LEFT_W, width }}>
                {dayList.map((d, i) =>
                  zoom !== "month" || d.getDay() === 1 ? (
                    <div key={i} className={cn("absolute inset-y-0 border-l", d.getDay() === 0 && zoom !== "month" ? "border-border/60 bg-muted/40" : "border-border/40")}
                      style={{ left: i * px, width: zoom === "month" ? 0 : px }} />
                  ) : null,
                )}
                {nowX >= 0 && nowX <= width && <div className="absolute inset-y-0 z-20 w-0.5 bg-rose-500/80" style={{ left: nowX }} />}
              </div>

              {/* rows */}
              {rows.length === 0 && !isLoading && (
                <div className="sticky left-0 p-10 text-center text-sm text-muted-foreground" style={{ width: `min(100%, ${LEFT_W + width}px)` }}>
                  No work orders are scheduled in this window.
                </div>
              )}
              {rows.map((r) => (
                <div key={r.key} className={cn("group/row relative flex border-b border-border/50", r.level === 0 && "bg-muted/20")} style={{ height: ROW_H[r.level] }}>
                  <div
                    className="sticky left-0 z-10 flex items-center gap-1 border-r border-border bg-card pr-2 group-hover/row:bg-muted"
                    style={{ width: LEFT_W, minWidth: LEFT_W, paddingLeft: 8 + r.level * 18 }}
                  >
                    {r.expandable ? (
                      <button type="button" onClick={() => toggle(r.key)} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={r.expanded ? "Collapse" : "Expand"}>
                        {r.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}
                    <span className={cn("text-[9px]", STATUS_DOT[r.status] ?? "text-slate-500")}>●</span>
                    <div
                      className={cn("min-w-0 flex-1", r.expandable && "cursor-pointer")}
                      onClick={() => r.expandable && toggle(r.key)}
                    >
                      <p className={cn("truncate leading-tight", r.level === 0 ? "text-[13px] font-semibold" : r.level === 1 ? "text-xs font-medium" : "text-xs")}>
                        {r.label}
                        {r.late && <AlertTriangle className="ml-1 inline h-3 w-3 text-rose-500" />}
                      </p>
                      {r.sub && <p className="truncate text-[10px] leading-tight text-muted-foreground">{r.sub}</p>}
                    </div>
                    {r.to && (
                      <Link to={r.to} className="rounded p-1 text-muted-foreground opacity-0 hover:text-primary group-hover/row:opacity-100" aria-label={`Open ${r.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                  <div
                    className={cn("relative", r.to && "cursor-pointer")}
                    style={{ width }}
                    onMouseMove={(e) => showTip(e, r)}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => r.to && navigate(r.to)}
                  >
                    {bars(r)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* tooltip */}
      {tip && (tip.row.planned || tip.row.actual) && (
        <div
          className="pointer-events-none fixed z-50 w-72 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: Math.min(tip.y + 14, window.innerHeight - 230) }}
        >
          <p className="mb-1.5 truncate text-[13px] font-semibold">{tip.row.label}</p>
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5">
            {tip.row.info.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {tip.row.late && <p className="mt-1.5 font-medium text-rose-600">Past its due date</p>}
        </div>
      )}
    </div>
  );
}
