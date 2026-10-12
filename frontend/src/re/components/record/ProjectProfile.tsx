/**
 * Housing-scheme profile (RE Project form and list): land, sell-through, collections and development progress at a glance —
 * progress rings, KPI cards, an inventory bar, block-wise progress, a 12-month sales vs collection chart, land use,
 * development works and computed insights. Server: realestate.spa.project_profile (agents see their own sales only).
 */
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Building2, CalendarClock, HandCoins, Hammer, Landmark, LandPlot, MapPin, Package, TrendingUp, Wallet,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisShort, C, ChartCard, ChartTip, Highlights, KpiCard, STATUS_TONE, useChartTheme, useLegendToggle, type Highlight } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get, getList } from "@/re/lib/api";
import { money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

interface StatusRow { status: string; n: number; value: number; marla: number }
interface BlockRow { name: string; block_name: string; block_type: string; planned_plots: number; color: string | null; area_kanal: number; plots: number; sold: number; available: number; held: number; stock_value: number }
interface Sales { bookings: number; net_sales: number; paid: number; outstanding: number; overdue: number; overdue_count: number; possessions: number; discount: number }
interface Month { month: string; bookings: number; sales: number; collected: number }
interface Feature { category: string; n: number; pct: number; done: number; wip: number; cost: number }
interface Work { name: string; project_name: string; status: string; percent_complete: number; expected_end_date: string | null }
interface LandUse { category: string; label: string; percent: number; area_kanal: number }
export interface Profile {
  project: { name: string; project_name: string; location: string | null; company: string | null; total_area_kanal: number; boundary_area_kanal: number; land_use: LandUse[] };
  plots: StatusRow[]; blocks: BlockRow[]; sales: Sales; months: Month[]; features: Feature[]; works: Work[];
  development_pct: number | null; scope: { agent: boolean; name: string | null };
}

const SOLD = ["Booked", "Sold", "Possession Given"];
const ORDER = ["Available", "Hold", "Reserved", "Booked", "Sold", "Possession Given", "Blocked"];
const LAND = [C.blue, C.emerald, C.violet, C.amber, C.slate, C.rose, C.sky, C.orange, C.teal];
export const n0 = (v: unknown) => Number(v ?? 0);
export const pct = (a: number, b: number) => (b > 0 ? (a * 100) / b : 0);
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });

export function useProjectProfile(project: string | undefined) {
  return useQuery({
    queryKey: ["project-profile", project],
    queryFn: () => get<Profile>("realestate.spa.project_profile", { project: project ?? "" }),
    enabled: Boolean(project),
    staleTime: 60_000,
  });
}

/** Derived numbers shared by the full profile and the compact list card. */
function derive(d: Profile) {
  const total = d.plots.reduce((a, r) => a + n0(r.n), 0);
  const sold = d.plots.filter((r) => SOLD.includes(r.status)).reduce((a, r) => a + n0(r.n), 0);
  const avail = d.plots.find((r) => r.status === "Available");
  const s = d.sales;
  return {
    total, sold, sellThrough: pct(sold, total), available: n0(avail?.n), stockValue: n0(avail?.value),
    collection: pct(n0(s.paid), n0(s.net_sales)), dev: d.development_pct,
  };
}

// ------------------------------------------------------------------ rings
export function Ring({ value, label, sub, color, size = 108 }: { value: number | null; label: string; sub?: string; color: string; size?: number }) {
  const r = 42, c = 2 * Math.PI * r, v = Math.max(0, Math.min(value ?? 0, 100));
  const gid = `ring${useId().replace(/:/g, "")}`;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.65} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
          <title>{label}</title>
          {v > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${(v / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />}
        </svg>
        <span className={cn("absolute inset-0 grid place-items-center font-bold tabular-nums", size < 60 ? "text-[11px]" : "text-xl")} style={{ color }}>
          {value === null ? "—" : `${v.toFixed(0)}%`}
        </span>
      </div>
      {size >= 60 && <p className="text-xs font-semibold">{label}</p>}
      {sub && <p className="-mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Bar100({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(value, 100))}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
    </div>
  );
}

export function Panel({ title, sub, icon: Icon, children, className, action }: { title: string; sub?: string; icon: typeof Package; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-sm", className)}>
      <header className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ insights
function insights(d: Profile, k: ReturnType<typeof derive>): Highlight[] {
  const out: Highlight[] = [];
  out.push({ tone: k.sellThrough >= 50 ? "good" : "info", text: `${k.sellThrough.toFixed(0)}% sold — ${num(k.sold)} of ${num(k.total)} plots; ${num(k.available)} still available worth ${money(k.stockValue, { compact: true })}.` });
  const best = [...d.blocks].filter((b) => b.plots > 0).sort((a, b) => pct(b.sold, b.plots) - pct(a.sold, a.plots));
  if (best.length > 1) {
    const top = best[0], low = best[best.length - 1];
    out.push({ tone: "good", text: `${top.block_name} sells fastest (${pct(top.sold, top.plots).toFixed(0)}% sold); ${low.block_name} is slowest at ${pct(low.sold, low.plots).toFixed(0)}%.` });
  }
  out.push({ tone: k.collection >= 60 ? "good" : "warn", text: `Collected ${money(d.sales.paid, { compact: true })} of ${money(d.sales.net_sales, { compact: true })} sold (${k.collection.toFixed(0)}%).` });
  if (n0(d.sales.overdue) > 0) {
    out.push({ tone: "bad", text: `${num(d.sales.overdue_count)} bookings are overdue by ${money(d.sales.overdue, { compact: true })} — ${pct(n0(d.sales.overdue), n0(d.sales.outstanding)).toFixed(0)}% of the outstanding balance.` });
  }
  const recent = d.months.slice(-3), prev = d.months.slice(-6, -3);
  const sum = (a: Month[], f: keyof Month) => a.reduce((t, m) => t + n0(m[f]), 0);
  if (sum(prev, "bookings") > 0) {
    const ch = pct(sum(recent, "bookings") - sum(prev, "bookings"), sum(prev, "bookings"));
    out.push({ tone: ch >= 0 ? "good" : "warn", text: `Bookings in the last 3 months are ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(0)}% on the 3 months before (${sum(recent, "bookings")} vs ${sum(prev, "bookings")}).` });
  }
  const slow = [...d.features].sort((a, b) => a.pct - b.pct)[0];
  if (slow && slow.pct < 100) out.push({ tone: slow.pct < 60 ? "warn" : "info", text: `${slow.category} is the least complete development head at ${slow.pct.toFixed(0)}% (${num(slow.wip)} in progress).` });
  return out;
}

// ------------------------------------------------------------------ full profile (form)
export function ProjectProfile({ project }: { project: string | undefined }) {
  const { data: d, isLoading, error } = useProjectProfile(project);
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const lt = useLegendToggle();
  if (!project) return null;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !d) {
    return <div className="space-y-4"><Skeleton className="h-44 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div></div>;
  }
  const k = derive(d);
  const s = d.sales;
  const plotRows = [...d.plots].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const spark = (f: keyof Month) => d.months.map((m) => n0(m[f]));
  const landTotal = d.project.land_use.reduce((a, r) => a + n0(r.percent), 0) || 100;

  return (
    <div className="space-y-5">
      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.12] via-transparent to-emerald-500/[0.08]" />
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Scheme profile{d.scope.agent ? " · my sales" : ""}</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{d.project.project_name}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {d.project.location && <Chip icon={MapPin}>{d.project.location}</Chip>}
              {d.project.company && <Chip icon={Landmark}>{d.project.company}</Chip>}
              <Chip icon={LandPlot}>{num(d.project.total_area_kanal || d.project.boundary_area_kanal)} kanal</Chip>
              <Chip icon={Building2}>{d.blocks.length} blocks · {num(k.total)} plots</Chip>
            </div>
            {/* inventory bar */}
            <div className="space-y-2 pt-1">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border">
                {plotRows.map((r) => (
                  <div key={r.status} title={`${r.status}: ${r.n}`} className="h-full transition-all first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${pct(n0(r.n), k.total)}%`, background: STATUS_TONE[r.status] ?? C.slate }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {plotRows.map((r) => (
                  <Link key={r.status} to={`/re/d/re-plot?status=${encodeURIComponent(r.status)}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <span className="size-2 rounded-full" style={{ background: STATUS_TONE[r.status] ?? C.slate }} />
                    {r.status} <b className="tabular-nums text-foreground">{num(r.n)}</b>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-5 sm:gap-7">
            <Ring value={k.sellThrough} label="Sold" sub={`${num(k.sold)} / ${num(k.total)} plots`} color={C.indigo} />
            <Ring value={k.collection} label="Collected" sub={money(s.paid, { compact: true })} color={C.emerald} />
            <Ring value={k.dev} label="Development" sub={`${d.features.reduce((a, f) => a + n0(f.done), 0)} works done`} color={C.amber} />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Net sales" value={money(s.net_sales, { compact: true })} sub={`${num(s.bookings)} bookings · ${money(s.discount, { compact: true })} discount`} spark={spark("sales")} color={C.indigo} />
        <KpiCard icon={Wallet} label="Collected" value={money(s.paid, { compact: true })} sub={`${k.collection.toFixed(0)}% of sales`} progress={k.collection} spark={spark("collected")} color={C.emerald} />
        <KpiCard icon={HandCoins} label="Outstanding" value={money(s.outstanding, { compact: true })} sub={`${num(s.possessions)} possessions given`} color={C.amber}
          footer={<span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3.5" /> Overdue <b>{money(s.overdue, { compact: true })}</b> · {num(s.overdue_count)} bookings</span>} />
        <KpiCard icon={Package} label="Unsold stock" value={money(k.stockValue, { compact: true })} sub={`${num(k.available)} plots available`} progress={pct(k.available, k.total)} color={C.blue} to="/re/d/re-plot?status=Available" />
      </div>

      <Highlights items={insights(d, k)} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartCard title="Sales vs collections" sub="Last 12 months — bookings value (bars) and receipts (line)">
          <ResponsiveContainer>
            <ComposedChart data={d.months.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="pp-sales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.indigo} /><stop offset="100%" stopColor={C.violet} stopOpacity={0.55} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="label" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              {lt.legend}
              {lt.series([
                <Bar key="sales" dataKey="sales" name="Sales" fill="url(#pp-sales)" radius={[6, 6, 0, 0]} maxBarSize={34} />,
                <Line key="collected" dataKey="collected" name="Collected" stroke={C.emerald} strokeWidth={2.5} dot={{ r: 3, fill: C.emerald }} type="monotone" />,
              ])}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <Panel title="Land use" sub={`${num(d.project.total_area_kanal)} kanal planned`} icon={LandPlot}>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted">
            {d.project.land_use.map((r, i) => (
              <div key={r.label} title={`${r.label}: ${r.percent}%`} style={{ width: `${(n0(r.percent) * 100) / landTotal}%`, background: LAND[i % LAND.length] }} />
            ))}
          </div>
          <ul className="space-y-2">
            {d.project.land_use.map((r, i) => (
              <li key={r.label} className="flex items-center gap-2.5 text-sm">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: LAND[i % LAND.length] }} />
                <span className="min-w-0 flex-1 truncate">{r.label}<span className="ml-1.5 text-xs text-muted-foreground">{r.category !== r.label ? r.category : ""}</span></span>
                <span className="tabular-nums text-xs text-muted-foreground">{num(r.area_kanal)} K</span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums">{n0(r.percent).toFixed(0)}%</span>
              </li>
            ))}
            {!d.project.land_use.length && <li className="text-sm text-muted-foreground">No land-use plan yet.</li>}
          </ul>
        </Panel>
      </div>

      {/* blocks */}
      <Panel title="Block progress" sub="Sold share, availability and unsold stock per block" icon={Building2}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {d.blocks.map((b) => {
            const color = b.color || C.blue;
            const p = pct(n0(b.sold), n0(b.plots));
            return (
              <Link key={b.name} to={`/re/d/re-plot?block=${encodeURIComponent(b.name)}`}
                className="group relative overflow-hidden rounded-xl border bg-background/60 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{b.block_name}</p>
                    <p className="text-[11px] text-muted-foreground">{b.block_type} · {num(b.area_kanal)} kanal</p>
                  </div>
                  <span className="text-lg font-bold tabular-nums" style={{ color }}>{p.toFixed(0)}%</span>
                </div>
                <Bar100 value={p} color={color} className="mt-3" />
                <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                  <Stat label="Sold" value={num(b.sold)} />
                  <Stat label="Available" value={num(b.available)} />
                  <Stat label="Planned" value={num(b.planned_plots || b.plots)} />
                </div>
                <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">Stock <b className="text-foreground">{money(b.stock_value, { compact: true })}</b>{n0(b.held) > 0 && <> · {num(b.held)} on hold</>}</p>
              </Link>
            );
          })}
        </div>
      </Panel>

      {/* development */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Development progress" sub="Infrastructure features by category" icon={Hammer}
          action={k.dev !== null && <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">{k.dev.toFixed(0)}% overall</span>}>
          <ul className="space-y-3.5">
            {d.features.map((f, i) => (
              <li key={f.category}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{f.category}</span>
                  <span className="text-xs text-muted-foreground"><b className="text-foreground">{num(f.done)}</b>/{num(f.n)} done{n0(f.wip) > 0 && ` · ${num(f.wip)} in progress`} · <b className="text-foreground">{n0(f.pct).toFixed(0)}%</b></span>
                </div>
                <Bar100 value={n0(f.pct)} color={[C.teal, C.amber, C.violet, C.sky, C.rose][i % 5]} />
              </li>
            ))}
            {!d.features.length && <li className="text-sm text-muted-foreground">No tracked infrastructure yet.</li>}
          </ul>
        </Panel>
        <Panel title="Development works" sub="ERPNext Projects for this scheme" icon={CalendarClock}>
          <ul className="divide-y">
            {d.works.map((w) => (
              <li key={w.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Ring value={n0(w.percent_complete)} label={w.name} color={w.status === "Completed" ? C.green : n0(w.percent_complete) >= 50 ? C.teal : C.amber} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{w.project_name}</p>
                  <p className="text-[11px] text-muted-foreground">{w.name} · {w.status}{w.expected_end_date ? ` · due ${w.expected_end_date}` : ""}</p>
                </div>
              </li>
            ))}
            {!d.works.length && <li className="text-sm text-muted-foreground">No development projects linked.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function Chip({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 font-medium text-muted-foreground backdrop-blur"><Icon className="size-3.5 text-primary" />{children}</span>;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/60 py-1"><p className="font-semibold tabular-nums text-foreground">{value}</p><p className="text-muted-foreground">{label}</p></div>;
}

// ------------------------------------------------------------------ compact card (list page)
export function ProjectProfileCard({ project }: { project: string }) {
  const { data: d } = useProjectProfile(project);
  if (!d) return <Skeleton className="h-40 rounded-2xl" />;
  const k = derive(d);
  return (
    <Link to={`/re/d/re-project/${encodeURIComponent(project)}`}
      className="group relative block overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.10] via-transparent to-emerald-500/[0.06]" />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 space-y-2">
          <p className="text-lg font-bold tracking-tight group-hover:text-primary">{d.project.project_name}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {d.project.location && <Chip icon={MapPin}>{d.project.location}</Chip>}
            <Chip icon={LandPlot}>{num(d.project.total_area_kanal)} kanal</Chip>
            <Chip icon={Building2}>{d.blocks.length} blocks · {num(k.total)} plots</Chip>
          </div>
          <p className="text-sm text-muted-foreground">
            Sales <b className="text-foreground">{money(d.sales.net_sales, { compact: true })}</b> · collected <b className="text-foreground">{money(d.sales.paid, { compact: true })}</b> · stock <b className="text-foreground">{money(k.stockValue, { compact: true })}</b>
          </p>
        </div>
        <div className="flex gap-5">
          <Ring value={k.sellThrough} label="Sold" color={C.indigo} size={84} />
          <Ring value={k.collection} label="Collected" color={C.emerald} size={84} />
          <Ring value={k.dev} label="Development" color={C.amber} size={84} />
        </div>
      </div>
    </Link>
  );
}

/** Every scheme as a profile card — shown above the RE Project list. */
export function ProjectCards() {
  const { data } = useQuery({ queryKey: ["re-projects"], queryFn: () => getList<{ name: string }>("RE Project", { fields: ["name"], limit: 20 }) });
  if (!data?.length) return null;
  return <div className="grid gap-4">{data.map((p) => <ProjectProfileCard key={p.name} project={p.name} />)}</div>;
}
