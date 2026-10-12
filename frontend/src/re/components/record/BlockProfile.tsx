/**
 * Block profile (RE Block form and list), styled like the scheme profile: sell-through / collection / society-bill rings,
 * KPI cards, inventory bar, insights, 12-month sales vs collections, plot sizes, streets, premium plots, overdue bookings,
 * society bills and open maintenance. Server: realestate.spa.block_profile (agents see their own sales only).
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Crown, HandCoins, Landmark, LandPlot, Layers, Receipt, Ruler, Signpost, TrendingUp, Wallet, Wrench, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisShort, C, ChartCard, ChartTip, Highlights, KpiCard, STATUS_TONE, useChartTheme, useLegendToggle, type Highlight } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get, getList } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { useTheme } from "@/re/providers/theme";
import { AreaMap } from "@/re/components/map/AreaMap";
import { Bar100, Chip, monthLabel, n0, Panel, pct, Ring, Stat } from "./ProjectProfile";

interface StatusRow { status: string; n: number; value: number; marla: number }
interface Size { plot_size: string; n: number; sold: number; available: number; avg_price: number; marla: number }
interface Street { street: string; n: number; sold: number }
interface Month { month: string; bookings: number; sales: number; collected: number }
export interface BlockData {
  block: { name: string; block_name: string; block_type: string; project: string; plot_size: string | null; planned_plots: number; area_kanal: number; land_use_percent: number; color: string | null };
  plots: StatusRow[]; sizes: Size[]; streets: Street[];
  premium: { corner: number; corner_sold: number; park: number; park_sold: number; boulevard: number; boulevard_sold: number; min_price: number | null; max_price: number | null; avg_price: number | null };
  sales: { bookings: number; net_sales: number; paid: number; outstanding: number; overdue: number; overdue_count: number; possessions: number; discount: number };
  overdue: { name: string; customer_name: string; plot: string; overdue_amount: number; overdue_since: string | null }[];
  bills: { n: number; payable: number | null; paid: number | null; outstanding: number | null; overdue: number | null };
  tasks: { status: string; n: number }[];
  months: Month[]; scope: { agent: boolean };
}

const SOLD = ["Booked", "Sold", "Possession Given"];
const ORDER = ["Available", "Hold", "Reserved", "Booked", "Sold", "Possession Given", "Blocked"];
const SIZE = [C.blue, C.violet, C.teal, C.amber, C.rose, C.sky];
const TASK_TONE: Record<string, string> = { Open: C.sky, Working: C.teal, "Pending Review": C.amber, Overdue: C.rose };

export function useBlockProfile(block: string | undefined) {
  return useQuery({
    queryKey: ["block-profile", block],
    queryFn: () => get<BlockData>("realestate.spa.block_profile", { block: block ?? "" }),
    enabled: Boolean(block),
    staleTime: 60_000,
  });
}

function derive(d: BlockData) {
  const total = d.plots.reduce((a, r) => a + n0(r.n), 0);
  const sold = d.plots.filter((r) => SOLD.includes(r.status)).reduce((a, r) => a + n0(r.n), 0);
  const avail = d.plots.find((r) => r.status === "Available");
  const billPaid = n0(d.bills.paid), billOut = n0(d.bills.outstanding);
  return {
    total, sold, sellThrough: pct(sold, total), available: n0(avail?.n), stockValue: n0(avail?.value),
    collection: pct(n0(d.sales.paid), n0(d.sales.net_sales)),
    bills: d.bills.n ? pct(billPaid, billPaid + billOut) : null,
    color: d.block.color || C.blue,
  };
}

function insights(d: BlockData, k: ReturnType<typeof derive>): Highlight[] {
  const out: Highlight[] = [];
  out.push({ tone: k.sellThrough >= 50 ? "good" : "info", text: `${k.sellThrough.toFixed(0)}% sold — ${num(k.sold)} of ${num(k.total)} plots${d.block.planned_plots ? ` (${num(d.block.planned_plots)} planned)` : ""}; ${num(k.available)} available worth ${money(k.stockValue, { compact: true })}.` });
  const sizes = [...d.sizes].filter((s) => s.n > 0).sort((a, b) => pct(b.sold, b.n) - pct(a.sold, a.n));
  if (sizes.length > 1) out.push({ tone: "good", text: `${sizes[0].plot_size} sells best (${pct(sizes[0].sold, sizes[0].n).toFixed(0)}% sold); ${sizes[sizes.length - 1].plot_size} has the most stock left (${num(sizes[sizes.length - 1].available)} available).` });
  out.push({ tone: k.collection >= 60 ? "good" : "warn", text: `Collected ${money(d.sales.paid, { compact: true })} of ${money(d.sales.net_sales, { compact: true })} sold here (${k.collection.toFixed(0)}%).` });
  if (n0(d.sales.overdue) > 0) out.push({ tone: "bad", text: `${num(d.sales.overdue_count)} bookings overdue by ${money(d.sales.overdue, { compact: true })}${d.overdue[0] ? ` — largest ${d.overdue[0].customer_name} (${d.overdue[0].plot})` : ""}.` });
  const corner = n0(d.premium.corner);
  if (corner > 0) out.push({ tone: "info", text: `${num(d.premium.corner_sold)} of ${num(corner)} corner plots sold${n0(d.premium.park) ? `, ${num(d.premium.park_sold)} of ${num(d.premium.park)} park-facing` : ""}.` });
  if (n0(d.bills.overdue) > 0) out.push({ tone: "warn", text: `${num(d.bills.overdue)} society bills overdue; ${money(d.bills.outstanding, { compact: true })} outstanding.` });
  return out;
}

export function BlockProfile({ block }: { block: string | undefined }) {
  const { data: d, isLoading, error } = useBlockProfile(block);
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const lt = useLegendToggle();
  if (!block) return null;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !d) {
    return <div className="space-y-4"><Skeleton className="h-44 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div></div>;
  }
  const k = derive(d);
  const s = d.sales;
  const rows = [...d.plots].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const spark = (f: keyof Month) => d.months.map((m) => n0(m[f]));
  const plotsLink = (q: string) => `/re/d/re-plot?block=${encodeURIComponent(d.block.name)}${q}`;
  const premium: [string, number, number][] = [
    ["Corner", n0(d.premium.corner), n0(d.premium.corner_sold)],
    ["Park facing", n0(d.premium.park), n0(d.premium.park_sold)],
    ["Boulevard facing", n0(d.premium.boulevard), n0(d.premium.boulevard_sold)],
  ];
  const openTasks = d.tasks.reduce((a, r) => a + n0(r.n), 0);

  return (
    <div className="space-y-5">
      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${k.color}22, transparent 55%)` }} />
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 size-72 rounded-full blur-3xl" style={{ background: `${k.color}26` }} />
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: k.color }} />
        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: k.color }}>Block profile{d.scope.agent ? " · my sales" : ""}</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{d.block.block_name}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link to={`/re/d/re-project/${encodeURIComponent(d.block.project)}`}><Chip icon={Landmark}>{d.block.project}</Chip></Link>
              <Chip icon={Building2}>{d.block.block_type}</Chip>
              <Chip icon={LandPlot}>{num(d.block.area_kanal)} kanal · {n0(d.block.land_use_percent).toFixed(0)}% of scheme</Chip>
              <Chip icon={Layers}>{num(k.total)} plots{d.block.planned_plots ? ` / ${num(d.block.planned_plots)} planned` : ""}</Chip>
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border">
                {rows.map((r) => <div key={r.status} title={`${r.status}: ${r.n}`} className="h-full" style={{ width: `${pct(n0(r.n), k.total)}%`, background: STATUS_TONE[r.status] ?? C.slate }} />)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {rows.map((r) => (
                  <Link key={r.status} to={plotsLink(`&status=${encodeURIComponent(r.status)}`)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <span className="size-2 rounded-full" style={{ background: STATUS_TONE[r.status] ?? C.slate }} />{r.status} <b className="tabular-nums text-foreground">{num(r.n)}</b>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-5 sm:gap-7">
            <Ring value={k.sellThrough} label="Sold" sub={`${num(k.sold)} / ${num(k.total)} plots`} color={k.color} />
            <Ring value={k.collection} label="Collected" sub={money(s.paid, { compact: true })} color={C.emerald} />
            <Ring value={k.bills} label="Society bills" sub={d.bills.n ? `${num(d.bills.n)} bills` : "none yet"} color={C.amber} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Net sales" value={money(s.net_sales, { compact: true })} sub={`${num(s.bookings)} bookings · ${num(s.possessions)} possessions`} spark={spark("sales")} color={C.indigo} />
        <KpiCard icon={Wallet} label="Collected" value={money(s.paid, { compact: true })} sub={`${k.collection.toFixed(0)}% of sales`} progress={k.collection} spark={spark("collected")} color={C.emerald} />
        <KpiCard icon={HandCoins} label="Outstanding" value={money(s.outstanding, { compact: true })} sub={`${money(s.discount, { compact: true })} discount given`} color={C.amber}
          footer={<span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3.5" /> Overdue <b>{money(s.overdue, { compact: true })}</b> · {num(s.overdue_count)} bookings</span>} />
        <KpiCard icon={Package} label="Unsold stock" value={money(k.stockValue, { compact: true })}
          sub={d.premium.min_price ? `${money(d.premium.min_price, { compact: true })} – ${money(d.premium.max_price, { compact: true })} per plot` : `${num(k.available)} available`}
          progress={pct(k.available, k.total)} color={C.blue} to={plotsLink("&status=Available")} />
      </div>

      <Highlights items={insights(d, k)} />

      <AreaMap block={d.block.name} height={440} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartCard title="Sales vs collections" sub="Last 12 months — bookings value (bars) and receipts (line)">
          <ResponsiveContainer>
            <ComposedChart data={d.months.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="bp-sales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.color} /><stop offset="100%" stopColor={k.color} stopOpacity={0.45} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="label" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              {lt.legend}
              {lt.series([
                <Bar key="sales" dataKey="sales" name="Sales" fill="url(#bp-sales)" radius={[6, 6, 0, 0]} maxBarSize={34} />,
                <Line key="collected" dataKey="collected" name="Collected" stroke={C.emerald} strokeWidth={2.5} dot={{ r: 3, fill: C.emerald }} type="monotone" />,
              ])}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <Panel title="Plot sizes" sub="Sold share and stock per size" icon={Ruler}>
          <ul className="space-y-3.5">
            {d.sizes.map((z, i) => (
              <li key={z.plot_size}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{z.plot_size}</span>
                  <span className="text-xs text-muted-foreground"><b className="text-foreground">{num(z.sold)}</b>/{num(z.n)} sold · {num(z.available)} left · {money(z.avg_price, { compact: true })}</span>
                </div>
                <Bar100 value={pct(n0(z.sold), n0(z.n))} color={SIZE[i % SIZE.length]} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Streets" sub="Plots and sold share by street" icon={Signpost}>
          <ul className="space-y-3">
            {d.streets.map((st) => (
              <li key={st.street}>
                <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate font-medium">{st.street}</span>
                  <span className="shrink-0 text-xs text-muted-foreground"><b className="text-foreground">{num(st.sold)}</b>/{num(st.n)} · {pct(n0(st.sold), n0(st.n)).toFixed(0)}%</span></div>
                <Bar100 value={pct(n0(st.sold), n0(st.n))} color={k.color} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Premium plots" sub="Corner, park and boulevard facing" icon={Crown}>
          <div className="grid grid-cols-3 gap-3">
            {premium.map(([label, n, sold], i) => (
              <div key={label} className="flex flex-col items-center rounded-xl border bg-background/60 p-3">
                <Ring value={n ? pct(sold, n) : null} label={label} sub={`${num(sold)} / ${num(n)} sold`} color={[C.violet, C.emerald, C.sky][i]} size={84} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Largest overdue" sub="Bookings to chase first" icon={AlertTriangle}
          action={<Link to={`/re/d/re-booking?block=${encodeURIComponent(d.block.name)}&status=Overdue`} className="text-xs font-medium text-primary hover:underline">All overdue</Link>}>
          <ul className="divide-y">
            {d.overdue.map((o) => (
              <li key={o.name}>
                <Link to={`/re/d/re-booking/${encodeURIComponent(o.name)}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-600 dark:text-rose-400">{o.plot.split("-").pop()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{o.customer_name}</span>
                    <span className="block text-[11px] text-muted-foreground">{o.plot} · {o.name}{o.overdue_since ? ` · since ${date(o.overdue_since)}` : ""}</span></span>
                  <b className="text-sm tabular-nums text-rose-600 dark:text-rose-400">{money(o.overdue_amount, { compact: true })}</b>
                </Link>
              </li>
            ))}
            {!d.overdue.length && <li className="py-2 text-sm text-muted-foreground">Nothing overdue in this block.</li>}
          </ul>
        </Panel>
        <Panel title="Society & maintenance" sub="Bills and open maintenance tasks" icon={Receipt}>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="Billed" value={money(n0(d.bills.paid) + n0(d.bills.outstanding), { compact: true })} />
            <Stat label="Paid" value={money(d.bills.paid, { compact: true })} />
            <Stat label="Outstanding" value={money(d.bills.outstanding, { compact: true })} />
          </div>
          <Bar100 value={k.bills ?? 0} color={C.amber} className="mt-3" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">{num(d.bills.n)} bills · {num(d.bills.overdue)} overdue</p>
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Wrench className="size-3.5 text-primary" /> {num(openTasks)} open maintenance tasks</p>
            <div className="flex flex-wrap gap-2">
              {d.tasks.map((r) => (
                <span key={r.status} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                  <span className="size-2 rounded-full" style={{ background: TASK_TONE[r.status] ?? C.slate }} />{r.status} <b>{num(r.n)}</b>
                </span>
              ))}
              {!d.tasks.length && <span className="text-xs text-muted-foreground">None open.</span>}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Compact block card for the list page. */
export function BlockProfileCard({ block }: { block: string }) {
  const { data: d } = useBlockProfile(block);
  if (!d) return <Skeleton className="h-48 rounded-2xl" />;
  const k = derive(d);
  return (
    <Link to={`/re/d/re-block/${encodeURIComponent(block)}`} className="group relative block overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${k.color}1f, transparent 60%)` }} />
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: k.color }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-bold tracking-tight group-hover:text-primary">{d.block.block_name}</p>
            <p className="text-[11px] text-muted-foreground">{d.block.block_type} · {num(d.block.area_kanal)} kanal · {num(k.total)} plots</p>
          </div>
          <Ring value={k.sellThrough} label="Sold" color={k.color} size={56} />
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
          {[...d.plots].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map((r) => (
            <div key={r.status} style={{ width: `${pct(n0(r.n), k.total)}%`, background: STATUS_TONE[r.status] ?? C.slate }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
          <Stat label="Sold" value={num(k.sold)} />
          <Stat label="Available" value={num(k.available)} />
          <Stat label="Collected" value={`${k.collection.toFixed(0)}%`} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Sales <b className="text-foreground">{money(d.sales.net_sales, { compact: true })}</b> · stock <b className="text-foreground">{money(k.stockValue, { compact: true })}</b></p>
      </div>
    </Link>
  );
}

export function BlockCards() {
  const { data } = useQuery({ queryKey: ["re-blocks"], queryFn: () => getList<{ name: string }>("RE Block", { fields: ["name"], orderBy: "block_name asc", limit: 24 }) });
  if (!data?.length) return null;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.map((b) => <BlockProfileCard key={b.name} block={b.name} />)}</div>;
}

interface OvBlock { block: string; color: string | null; n: number; available: number; sold: number; held: number; stock_value: number }

/** Shared scheme overview (same query as the plot list insights) — one request for every row. */
function useBlockRow(block: string) {
  const { data } = useQuery({ queryKey: ["plot-overview"], queryFn: () => get<{ blocks: OvBlock[] }>("realestate.spa.plot_overview"), staleTime: 60_000 });
  return data ? data.blocks.find((b) => b.block === block) ?? null : undefined;
}

/** Bar gauge for the block list: sold / on hold / available, with sold % and counts. */
export function BlockGauge({ block }: { block: string }) {
  const b = useBlockRow(block);
  if (b === undefined) return <span className="block h-2 w-40 animate-pulse rounded-full bg-muted" />;
  if (!b || !b.n) return <span className="text-xs text-muted-foreground">No plots</span>;
  const color = b.color || C.blue;
  const p = pct(n0(b.sold), n0(b.n));
  return (
    <div className="flex min-w-[220px] items-center gap-3" title={`${b.sold} sold · ${b.held} on hold · ${b.available} available of ${b.n}`}>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${p}%`, background: color }} />
        <div style={{ width: `${pct(n0(b.held), n0(b.n))}%`, background: C.orange }} />
        <div style={{ width: `${pct(n0(b.available), n0(b.n))}%`, background: `${color}40` }} />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums" style={{ color }}>{p.toFixed(0)}%</span>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{num(b.sold)}/{num(b.n)} · {num(b.available)} left</span>
    </div>
  );
}

/** Unsold stock value for the block list. */
export function BlockStock({ block }: { block: string }) {
  const b = useBlockRow(block);
  return <span className="tabular-nums">{b ? money(b.stock_value, { compact: true }) : "—"}</span>;
}
