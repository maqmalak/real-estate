import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import {
  AlertTriangle, CalendarRange, ChartGantt, CheckCircle2, ChevronDown, ChevronRight, Circle, Crosshair, Diamond, FolderKanban,
  GitBranch, Layers, PlayCircle, Target, TrendingUp, type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { companyFilter, useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";

interface Project {
  name: string; project_name: string; status: string; percent_complete: number; priority?: string; customer?: string;
  expected_start_date?: string; expected_end_date?: string; actual_end_date?: string;
}
interface Task {
  name: string; subject: string; project: string; parent_task?: string; is_group: 0 | 1; is_milestone: 0 | 1; status: string;
  progress: number; exp_start_date?: string; exp_end_date?: string; completed_on?: string; depends_on_tasks?: string; priority?: string;
}
type Row =
  | { kind: "project"; id: string; p: Project; depth: 0 }
  | { kind: "task"; id: string; t: Task; depth: number; hasKids: boolean };

const DAY = 86_400_000;
const ROW = 38;
const LEFT = 330;
const HEAD = 52;
const ZOOMS = [
  { key: "day", label: "Days", px: 34 },
  { key: "week", label: "Weeks", px: 14 },
  { key: "month", label: "Months", px: 5 },
  { key: "quarter", label: "Quarters", px: 2.2 },
] as const;

const d0 = (s?: string) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`) : null);
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const today = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();

/** Health of a project for colour and the summary. */
function projectState(p: Project, tasks: Task[]) {
  if (p.status === "Completed") {
    const late = p.actual_end_date && p.expected_end_date && p.actual_end_date > p.expected_end_date;
    return late ? "done-late" : "done";
  }
  if (p.status === "Cancelled") return "cancelled";
  const start = d0(p.expected_start_date);
  if (start && start > today) return "planned";
  const end = d0(p.expected_end_date);
  if ((end && end < today) || tasks.some((t) => t.project === p.name && t.status === "Overdue")) return "late";
  return "running";
}
const STATE: Record<string, { label: string; bar: string; chip: string; dot: string }> = {
  done: { label: "Completed on time", bar: "from-emerald-400 to-emerald-600", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  "done-late": { label: "Completed late", bar: "from-teal-400 to-teal-600", chip: "bg-teal-500/10 text-teal-700 dark:text-teal-400", dot: "bg-teal-500" },
  running: { label: "On track", bar: "from-indigo-400 to-violet-600", chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400", dot: "bg-indigo-500" },
  late: { label: "Behind schedule", bar: "from-rose-400 to-rose-600", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400", dot: "bg-rose-500" },
  planned: { label: "Not started", bar: "from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500", chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
  cancelled: { label: "Cancelled", bar: "from-zinc-300 to-zinc-400", chip: "bg-zinc-500/10 text-zinc-500", dot: "bg-zinc-400" },
};
const TASK: Record<string, { icon: LucideIcon; iconCls: string; bar: string; fill: string }> = {
  Completed: { icon: CheckCircle2, iconCls: "text-emerald-500", bar: "bg-emerald-500/25 border-emerald-500/40", fill: "bg-emerald-500" },
  Working: { icon: PlayCircle, iconCls: "text-indigo-500", bar: "bg-indigo-500/20 border-indigo-500/40", fill: "bg-gradient-to-r from-indigo-500 to-violet-500" },
  "Pending Review": { icon: PlayCircle, iconCls: "text-violet-500", bar: "bg-violet-500/20 border-violet-500/40", fill: "bg-violet-500" },
  Overdue: { icon: AlertTriangle, iconCls: "text-rose-500", bar: "bg-rose-500/15 border-rose-500/50", fill: "bg-gradient-to-r from-amber-500 to-rose-500" },
  Open: { icon: Circle, iconCls: "text-slate-400", bar: "border-dashed border-slate-400/70 bg-slate-400/10", fill: "bg-slate-400" },
  Cancelled: { icon: Circle, iconCls: "text-zinc-400", bar: "border-zinc-300 bg-zinc-200/40", fill: "bg-zinc-400" },
};
const taskStyle = (s: string) => TASK[s] ?? TASK.Open;
const HATCH = { backgroundImage: "repeating-linear-gradient(135deg, rgba(244,63,94,.55) 0 4px, rgba(244,63,94,.12) 4px 8px)" };

export function ProjectGanttPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]["key"]>("week");
  const [only, setOnly] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showDeps, setShowDeps] = useState(true);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const { data: projects, isLoading: pl } = useFrappeGetDocList<Project>("Project", {
    fields: ["name", "project_name", "status", "percent_complete", "priority", "customer", "expected_start_date", "expected_end_date", "actual_end_date"] as never,
    filters: [...companyFilter(company), ["status", "!=", "Cancelled"]] as never,
    orderBy: { field: "expected_start_date", order: "asc" }, limit: 60,
  });
  const names = (projects ?? []).map((p) => p.name);
  const { data: tasks, isLoading: tl } = useFrappeGetDocList<Task>("Task", {
    fields: ["name", "subject", "project", "parent_task", "is_group", "is_milestone", "status", "progress", "exp_start_date", "exp_end_date", "completed_on", "depends_on_tasks", "priority"] as never,
    filters: [["project", "in", names.length ? names : ["__none__"]]] as never,
    orderBy: { field: "lft", order: "asc" }, limit: 2000,
  }, names.length ? undefined : null);

  const px = ZOOMS.find((z) => z.key === zoom)!.px;
  const allTasks = tasks ?? [];
  const states = useMemo(() => Object.fromEntries((projects ?? []).map((p) => [p.name, projectState(p, allTasks)])), [projects, allTasks]);
  const visibleProjects = (projects ?? []).filter((p) => only === "all" || p.name === only);

  // rows: project → top-level tasks (phases) → children, by start date
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const byParent = new Map<string, Task[]>();
    allTasks.forEach((t) => {
      const key = t.parent_task && allTasks.some((x) => x.name === t.parent_task) ? t.parent_task : `__${t.project}`;
      byParent.set(key, [...(byParent.get(key) ?? []), t]);
    });
    byParent.forEach((list) => list.sort((a, b) => (a.exp_start_date ?? "").localeCompare(b.exp_start_date ?? "") || a.is_milestone - b.is_milestone));
    const walk = (key: string, depth: number) => {
      (byParent.get(key) ?? []).forEach((t) => {
        const kids = byParent.has(t.name);
        out.push({ kind: "task", id: t.name, t, depth, hasKids: kids });
        if (kids && !collapsed.has(t.name)) walk(t.name, depth + 1);
      });
    };
    visibleProjects.forEach((p) => {
      out.push({ kind: "project", id: p.name, p, depth: 0 });
      if (!collapsed.has(p.name)) walk(`__${p.name}`, 1);
    });
    return out;
  }, [visibleProjects, allTasks, collapsed]);

  // date range
  const [start, end] = useMemo(() => {
    const ds: Date[] = [today];
    visibleProjects.forEach((p) => [p.expected_start_date, p.expected_end_date, p.actual_end_date].forEach((s) => { const d = d0(s); if (d) ds.push(d); }));
    allTasks.filter((t) => only === "all" || t.project === only).forEach((t) => [t.exp_start_date, t.exp_end_date, t.completed_on].forEach((s) => { const d = d0(s); if (d) ds.push(d); }));
    const a = new Date(Math.min(...ds.map((d) => d.getTime())) - 10 * DAY);
    const b = new Date(Math.max(...ds.map((d) => d.getTime())) + 21 * DAY);
    a.setDate(1);
    return [a, b];
  }, [visibleProjects, allTasks, only]);
  const total = days(start, end);
  const x = (d: Date | null) => (d ? days(start, d) * px : 0);
  const width = total * px;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(today) - (el.clientWidth - LEFT) / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, start.getTime(), only, projects?.length]);

  // header ticks
  const months = useMemo(() => {
    const out: { label: string; left: number; w: number }[] = [];
    const d = new Date(start);
    while (d < end) {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const l = x(d), r = x(next < end ? next : end);
      out.push({ label: d.toLocaleDateString("en-GB", { month: px < 3 ? "short" : "long", year: "numeric" }), left: l, w: r - l });
      d.setTime(next.getTime());
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime(), end.getTime(), px]);
  const ticks = useMemo(() => {
    const out: { label: string; left: number; sunday: boolean; first: boolean }[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(start.getTime() + i * DAY);
      const sunday = d.getDay() === 0;
      if (px >= 18 || (px >= 5 && d.getDay() === 1) || d.getDate() === 1) out.push({ label: String(d.getDate()), left: i * px, sunday, first: d.getDate() === 1 });
      else if (sunday && px >= 5) out.push({ label: "", left: i * px, sunday, first: false });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime(), total, px]);

  // summary
  const sum = useMemo(() => {
    const st = Object.values(states);
    const ms = allTasks.filter((t) => t.is_milestone && t.status !== "Completed" && t.exp_end_date).sort((a, b) => (a.exp_end_date ?? "").localeCompare(b.exp_end_date ?? ""));
    return {
      projects: st.length, running: st.filter((s) => s === "running").length, late: st.filter((s) => s === "late").length,
      done: st.filter((s) => s.startsWith("done")).length, overdue: allTasks.filter((t) => t.status === "Overdue" && !t.is_group).length,
      milestone: ms[0],
    };
  }, [states, allTasks]);

  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  const hovered = hover ? rows.find((r) => r.id === hover.id) : undefined;
  const related = new Set<string>();
  if (hovered?.kind === "task") {
    related.add(hovered.id);
    (hovered.t.depends_on_tasks ?? "").split(",").filter(Boolean).forEach((d) => related.add(d));
    allTasks.forEach((t) => (t.depends_on_tasks ?? "").split(",").includes(hovered.id) && related.add(t.name));
  }
  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onMove = (id: string) => (e: React.MouseEvent) => setHover({ id, x: e.clientX, y: e.clientY });

  return (
    <div className="space-y-5">
      <PageHeader title="Project Timeline" subtitle="Schedule, milestones and dependencies of every project — late work in red" icon={<ChartGantt className="h-5 w-5" />} />

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { icon: FolderKanban, label: "Projects", value: sum.projects, tone: "from-slate-500/10 text-slate-700 dark:text-slate-300" },
          { icon: TrendingUp, label: "On track", value: sum.running, tone: "from-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
          { icon: AlertTriangle, label: "Behind schedule", value: sum.late, tone: "from-rose-500/10 text-rose-600 dark:text-rose-400" },
          { icon: CheckCircle2, label: "Completed", value: sum.done, tone: "from-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
          { icon: Target, label: "Overdue tasks", value: sum.overdue, tone: "from-amber-500/10 text-amber-600 dark:text-amber-400" },
        ].map((c) => (
          <Card key={c.label} className={cn("flex items-center gap-3 bg-gradient-to-br to-transparent p-3.5", c.tone)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 shadow-sm"><c.icon className="h-4 w-4" /></span>
            <div><div className="text-xl font-semibold tabular-nums text-foreground">{c.value}</div><div className="text-[11px] text-muted-foreground">{c.label}</div></div>
          </Card>
        ))}
        <Card className="flex items-center gap-3 bg-gradient-to-br from-violet-500/10 to-transparent p-3.5 text-violet-600 dark:text-violet-400">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 shadow-sm"><Diamond className="h-4 w-4" /></span>
          <div className="min-w-0"><div className="truncate text-sm font-semibold text-foreground">{sum.milestone?.subject ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground">Next milestone{sum.milestone ? ` · ${fmt(d0(sum.milestone.exp_end_date))}` : ""}</div></div>
        </Card>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setOnly("all")} className={cn("rounded-full border px-3 py-1 text-xs font-medium", only === "all" ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>All projects</button>
          {(projects ?? []).map((p) => (
            <button key={p.name} type="button" onClick={() => setOnly(p.name)}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", only === p.name ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              <span className={cn("h-2 w-2 rounded-full", STATE[states[p.name]]?.dot)} />
              <span className="max-w-[180px] truncate">{p.project_name}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setShowDeps((v) => !v)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs", showDeps ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            <GitBranch className="h-3.5 w-3.5" /> Dependencies
          </button>
          <button type="button" onClick={() => { const el = scroller.current; if (el) el.scrollTo({ left: Math.max(0, x(today) - (el.clientWidth - LEFT) / 3), behavior: "smooth" }); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Crosshair className="h-3.5 w-3.5" /> Today
          </button>
          <div className="flex rounded-lg border border-border p-0.5">
            {ZOOMS.map((z) => (
              <button key={z.key} type="button" onClick={() => setZoom(z.key)} className={cn("rounded-md px-2.5 py-1 text-xs", zoom === z.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{z.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* gantt */}
      <Card className="overflow-hidden p-0">
        {pl || tl ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No projects for this company yet.</p>
        ) : (
          <div ref={scroller} className="relative max-h-[70vh] overflow-auto scrollbar-thin" onMouseLeave={() => setHover(null)}>
            <div className="relative" style={{ width: LEFT + width, minHeight: HEAD + rows.length * ROW }}>
              {/* header */}
              <div className="sticky top-0 z-40 flex" style={{ height: HEAD }}>
                <div className="sticky left-0 z-50 flex items-end border-b border-r border-border bg-card px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: LEFT, minWidth: LEFT }}>
                  <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> Project / task
                </div>
                <div className="relative border-b border-border bg-card" style={{ width }}>
                  {months.map((m) => (
                    <div key={m.left} className="absolute top-0 flex h-6 items-center border-l border-border px-2 text-[11px] font-semibold text-foreground" style={{ left: m.left, width: m.w }}>
                      <span className="truncate">{m.label}</span>
                    </div>
                  ))}
                  {ticks.map((t) => (
                    <div key={t.left} className={cn("absolute bottom-0 flex h-6 items-center justify-center text-[10px]", t.sunday ? "text-rose-500/80" : "text-muted-foreground", t.first && "font-semibold")}
                      style={{ left: t.left, width: px >= 18 ? px : 20 }}>{t.label}</div>
                  ))}
                  <div className="absolute bottom-0 z-10 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow" style={{ left: x(today) + px / 2, top: 4, height: 16 }}>Today</div>
                </div>
              </div>

              {/* grid background: sundays + today line */}
              <div className="pointer-events-none absolute bottom-0" style={{ left: LEFT, top: HEAD, width }}>
                {px >= 5 && ticks.filter((t) => t.sunday).map((t) => <div key={t.left} className="absolute inset-y-0 bg-muted/40" style={{ left: t.left, width: px }} />)}
                {months.map((m) => <div key={m.left} className="absolute inset-y-0 border-l border-border/60" style={{ left: m.left }} />)}
                <div className="absolute inset-y-0 z-20 w-px bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,.6)]" style={{ left: x(today) + px / 2 }} />
              </div>

              {/* dependency arrows */}
              {showDeps && (
                <svg className="pointer-events-none absolute z-10" style={{ left: LEFT, top: HEAD }} width={width} height={rows.length * ROW}>
                  <defs>
                    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" /></marker>
                    <marker id="arrowHi" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#6366f1" /></marker>
                  </defs>
                  {rows.flatMap((r) => {
                    if (r.kind !== "task" || r.t.is_group) return [];
                    const to = rowIndex.get(r.id)!;
                    return (r.t.depends_on_tasks ?? "").split(",").filter(Boolean).map((dep) => {
                      const from = rowIndex.get(dep);
                      const dt = allTasks.find((t) => t.name === dep);
                      if (from === undefined || !dt || dt.is_group) return null;
                      const x1 = x(d0(dt.exp_end_date)) + (dt.is_milestone ? 0 : px), y1 = from * ROW + ROW / 2;
                      const x2 = x(d0(r.t.exp_start_date)), y2 = to * ROW + ROW / 2;
                      const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 14));
                      const hi = related.has(r.id) && related.has(dep);
                      return <path key={`${dep}>${r.id}`} d={`M${x1},${y1} H${mid} V${y2} H${x2 - 2}`} fill="none" stroke={hi ? "#6366f1" : "#94a3b8"} strokeWidth={hi ? 2 : 1.2}
                        strokeOpacity={hover && !hi ? 0.25 : 0.85} markerEnd={`url(#${hi ? "arrowHi" : "arrow"})`} />;
                    });
                  })}
                </svg>
              )}

              {/* rows */}
              {rows.map((r, i) => {
                const top = HEAD + i * ROW;
                const dim = hover && hovered?.kind === "task" && r.kind === "task" && !related.has(r.id);
                if (r.kind === "project") {
                  const p = r.p, st = STATE[states[p.name]] ?? STATE.running;
                  const s = d0(p.expected_start_date), e = d0(p.expected_end_date), act = d0(p.actual_end_date);
                  const lateEnd = states[p.name] === "late" && e && e < today ? today : act && e && act > e ? act : null;
                  return (
                    <div key={r.id} className="absolute left-0 flex w-full items-center border-b border-border/70 bg-muted/30" style={{ top, height: ROW }}>
                      <div className="sticky left-0 z-30 flex h-full items-center gap-2 border-r border-border bg-card px-3 shadow-[4px_0_8px_-6px_rgba(0,0,0,0.25)]" style={{ width: LEFT, minWidth: LEFT }}>
                        <button type="button" onClick={() => toggle(p.name)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                          {collapsed.has(p.name) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm", st.bar)}><FolderKanban className="h-3.5 w-3.5" /></span>
                        <button type="button" onClick={() => navigate(`/projects/list/${encodeURIComponent(p.name)}`)} className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold hover:underline" title={p.project_name}>{p.project_name}</button>
                        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", st.chip)}>{Math.round(p.percent_complete ?? 0)}%</span>
                      </div>
                      {s && e && (
                        <div className="absolute" style={{ left: LEFT + x(s), top: 9, height: ROW - 18, width: Math.max(px, x(e) - x(s) + px) }} onMouseMove={onMove(r.id)}>
                          <div className={cn("relative h-full overflow-hidden rounded-full bg-gradient-to-r opacity-30", st.bar)} />
                          <div className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r shadow-sm", st.bar)} style={{ width: `${Math.min(100, p.percent_complete ?? 0)}%` }} />
                        </div>
                      )}
                      {e && lateEnd && <div className="absolute rounded-r-full" style={{ ...HATCH, left: LEFT + x(e) + px, top: 9, height: ROW - 18, width: Math.max(2, x(lateEnd) - x(e)) }} onMouseMove={onMove(r.id)} />}
                    </div>
                  );
                }
                const t = r.t, ts = taskStyle(t.status);
                const s = d0(t.exp_start_date), e = d0(t.exp_end_date), done = d0(t.completed_on);
                const lateTo = t.status === "Overdue" && e && e < today ? today : t.status === "Completed" && done && e && done > e ? done : null;
                const Icon = t.is_milestone ? Diamond : t.is_group ? Layers : ts.icon;
                return (
                  <div key={r.id} className={cn("absolute left-0 flex w-full items-center border-b border-border/40 transition-opacity", dim && "opacity-40", hover?.id === r.id && "bg-primary/[0.04]")} style={{ top, height: ROW }}>
                    <div className="sticky left-0 z-30 flex h-full items-center gap-1.5 border-r border-border bg-card pr-3 shadow-[4px_0_8px_-6px_rgba(0,0,0,0.25)]" style={{ width: LEFT, minWidth: LEFT, paddingLeft: 12 + r.depth * 16 }}>
                      {r.hasKids ? (
                        <button type="button" onClick={() => toggle(t.name)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                          {collapsed.has(t.name) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      ) : <span className="w-4" />}
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", t.is_milestone ? "fill-violet-500/20 text-violet-500" : t.is_group ? "text-slate-500" : ts.iconCls)} />
                      <button type="button" onClick={() => navigate(`/projects/tasks/${encodeURIComponent(t.name)}`)} title={t.subject}
                        className={cn("min-w-0 flex-1 truncate text-left text-xs hover:underline", t.is_group ? "font-semibold" : "", t.status === "Completed" && !t.is_group && "text-muted-foreground")}>{t.subject}</button>
                      {t.status === "Overdue" && <span className="shrink-0 rounded bg-rose-500/10 px-1 text-[9px] font-semibold uppercase text-rose-600">late</span>}
                    </div>
                    {s && e && (t.is_milestone ? (
                      <div className="absolute z-20 flex items-center gap-1.5" style={{ left: LEFT + x(done ?? e) - 7 + px / 2, top: ROW / 2 - 8 }} onMouseMove={onMove(r.id)}>
                        <span className={cn("h-4 w-4 rotate-45 rounded-[3px] border-2 shadow-md", t.status === "Completed" ? "border-emerald-600 bg-emerald-500" : t.status === "Overdue" ? "border-rose-600 bg-rose-500" : "border-violet-600 bg-violet-500")} />
                        {px >= 5 && <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">{fmt(done ?? e)}</span>}
                      </div>
                    ) : t.is_group ? (
                      <div className="absolute" style={{ left: LEFT + x(s), top: ROW / 2 - 4, height: 8, width: Math.max(px, x(e) - x(s) + px) }} onMouseMove={onMove(r.id)}>
                        <div className="h-full rounded-sm bg-slate-400/40 dark:bg-slate-500/40" />
                        <div className="absolute inset-y-0 left-0 rounded-sm bg-slate-600 dark:bg-slate-300" style={{ width: `${Math.min(100, t.progress ?? 0)}%` }} />
                        <span className="absolute -bottom-1 left-0 h-3 w-1 rounded-b bg-slate-600 dark:bg-slate-300" />
                        <span className="absolute -bottom-1 right-0 h-3 w-1 rounded-b bg-slate-600 dark:bg-slate-300" />
                      </div>
                    ) : (
                      <div className="absolute z-20 flex items-center" style={{ left: LEFT + x(s), top: 8, height: ROW - 16 }} onMouseMove={onMove(r.id)}>
                        <div className={cn("relative h-full overflow-hidden rounded-md border shadow-sm", ts.bar)} style={{ width: Math.max(px, x(e) - x(s) + px) }}>
                          <div className={cn("absolute inset-y-0 left-0", ts.fill)} style={{ width: `${t.status === "Completed" ? 100 : Math.min(100, t.progress ?? 0)}%` }} />
                          {px >= 14 && <span className="relative z-10 block truncate px-1.5 text-[10px] font-medium leading-[22px] text-white mix-blend-normal drop-shadow">{Math.round(t.status === "Completed" ? 100 : t.progress ?? 0)}%</span>}
                        </div>
                        {lateTo && e && <div className="h-full rounded-r-md" style={{ ...HATCH, width: Math.max(3, x(lateTo) - x(e)) }} title="Late" />}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded bg-emerald-500" /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded bg-gradient-to-r from-indigo-500 to-violet-500" /> In progress</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded border border-dashed border-slate-400" /> Not started</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded bg-gradient-to-r from-amber-500 to-rose-500" /> Overdue</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded" style={HATCH} /> Late (past due date)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-violet-500" /> Milestone</span>
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> Phase</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-rose-500" /> Today</span>
      </div>

      {/* tooltip */}
      {hover && hovered && (
        <div className="pointer-events-none fixed z-50 w-64 rounded-xl border border-border bg-popover/95 p-3 text-xs shadow-xl backdrop-blur" style={{ left: Math.min(hover.x + 14, window.innerWidth - 270), top: hover.y + 14 }}>
          {hovered.kind === "project" ? (
            <>
              <div className="mb-1 font-semibold">{hovered.p.project_name}</div>
              <div className={cn("mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", STATE[states[hovered.p.name]]?.chip)}>{STATE[states[hovered.p.name]]?.label}</div>
              <Tip k="Planned" v={`${fmt(d0(hovered.p.expected_start_date))} → ${fmt(d0(hovered.p.expected_end_date))}`} />
              {hovered.p.actual_end_date && <Tip k="Finished" v={fmt(d0(hovered.p.actual_end_date))} />}
              <Tip k="Complete" v={`${Math.round(hovered.p.percent_complete ?? 0)}%`} />
              {hovered.p.customer && <Tip k="Customer" v={hovered.p.customer} />}
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                {hovered.t.is_milestone ? <Diamond className="h-3.5 w-3.5 text-violet-500" /> : null}{hovered.t.subject}
              </div>
              <div className="mb-2 text-[10px] text-muted-foreground">{hovered.t.name}</div>
              <Tip k="Status" v={hovered.t.status} />
              <Tip k="Planned" v={`${fmt(d0(hovered.t.exp_start_date))} → ${fmt(d0(hovered.t.exp_end_date))}`} />
              {hovered.t.completed_on && <Tip k="Completed" v={fmt(d0(hovered.t.completed_on))} />}
              {!hovered.t.is_milestone && <Tip k="Progress" v={`${Math.round(hovered.t.status === "Completed" ? 100 : hovered.t.progress ?? 0)}%`} />}
              {(() => {
                const e = d0(hovered.t.exp_end_date), c = d0(hovered.t.completed_on);
                const late = hovered.t.status === "Overdue" && e ? days(e, today) : c && e && c > e ? days(e, c) : 0;
                return late > 0 ? <Tip k="Late by" v={`${late} day${late === 1 ? "" : "s"}`} warn /> : null;
              })()}
              {(hovered.t.depends_on_tasks ?? "").split(",").filter(Boolean).length > 0 && (
                <Tip k="After" v={(hovered.t.depends_on_tasks ?? "").split(",").filter(Boolean).map((d) => allTasks.find((t) => t.name === d)?.subject ?? d).join(", ")} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Tip({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-16 shrink-0 text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 flex-1", warn && "font-semibold text-rose-600")}>{v}</span>
    </div>
  );
}
