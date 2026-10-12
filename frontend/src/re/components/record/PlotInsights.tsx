/**
 * Plot inventory at a glance, above the RE Plot list: value, sell-through, sales pace and months of stock, block × status,
 * size mix with price per marla, premium plots, payment health of sold plots, plots on hold and the latest bookings —
 * with computed insights. Collapsible (remembered per browser). Server: realestate.spa.plot_overview.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, ChevronDown, Crown, Filter, Gauge, Layers, PauseCircle, Ruler, Sparkles, Timer, TrendingUp, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { C, Highlights, KpiCard, STATUS_TONE, type Highlight } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { Bar100, n0, Panel, pct, Ring } from "./ProjectProfile";

interface Ov {
  merged: number;
  status: { status: string; n: number; value: number; marla: number }[];
  blocks: { block: string; color: string | null; block_type: string; n: number; available: number; sold: number; held: number; stock_value: number }[];
  sizes: { plot_size: string; n: number; available: number; sold: number; avg_price: number; min_price: number; max_price: number; per_marla: number }[];
  premium: { kind: string; n: number; available: number; sold: number; avg_price: number }[];
  payment: { status: string; n: number; outstanding: number; overdue: number }[];
  holds: { name: string; block: string; plot_size: string; status: string; hold_reason: string | null; list_price: number; modified: string }[];
  pace: { d30: number; d90: number; prev30: number; v30: number };
  recent: { plot: string; block: string; plot_size: string; customer_name: string; net_price: number; booking_date: string }[];
  scope: { agent: boolean };
}

const SOLD = ["Booked", "Sold", "Possession Given"];
const PAY: Record<string, string> = { Paid: C.green, Due: C.amber, Overdue: C.red };
const KEY = "re-plot-insights-open";

function insights(d: Ov, k: { total: number; sold: number; avail: number; stock: number; monthsLeft: number | null; perMonth: number }): Highlight[] {
  const out: Highlight[] = [];
  out.push({ tone: "info", text: `${num(k.avail)} plots available worth ${money(k.stock, { compact: true })} — ${pct(k.sold, k.total).toFixed(0)}% of these plots are sold.` });
  if (k.monthsLeft !== null) out.push({ tone: k.monthsLeft > 24 ? "warn" : "good", text: `At ${k.perMonth.toFixed(1)} bookings a month (last 90 days) the remaining stock lasts about ${k.monthsLeft.toFixed(0)} months.` });
  const p = d.pace;
  if (n0(p.prev30) > 0) {
    const ch = pct(n0(p.d30) - n0(p.prev30), n0(p.prev30));
    out.push({ tone: ch >= 0 ? "good" : "warn", text: `${num(p.d30)} bookings in the last 30 days, ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(0)}% on the 30 days before (${num(p.prev30)}).` });
  }
  const bySell = [...d.sizes].filter((s) => s.n > 0).sort((a, b) => pct(b.sold, b.n) - pct(a.sold, a.n));
  if (bySell.length > 1) out.push({ tone: "good", text: `${bySell[0].plot_size} sells best (${pct(bySell[0].sold, bySell[0].n).toFixed(0)}% sold); ${bySell[bySell.length - 1].plot_size} is slowest with ${num(bySell[bySell.length - 1].available)} left.` });
  const prem = d.premium.filter((x) => x.kind !== "Standard" && n0(x.n) > 0).sort((a, b) => pct(b.sold, b.n) - pct(a.sold, a.n))[0];
  const std = d.premium.find((x) => x.kind === "Standard");
  if (prem && std) out.push({ tone: "info", text: `${prem.kind} plots are ${pct(prem.sold, prem.n).toFixed(0)}% sold vs ${pct(std.sold, std.n).toFixed(0)}% for standard plots.` });
  const od = d.payment.find((x) => x.status === "Overdue");
  if (od && n0(od.n) > 0) out.push({ tone: "bad", text: `${num(od.n)} sold plots are overdue by ${money(od.overdue, { compact: true })}.` });
  if (d.holds.length) out.push({ tone: "warn", text: `${num(d.holds.length)} plots are on hold / reserved / blocked — release or book them to free ${money(d.holds.reduce((a, h) => a + n0(h.list_price), 0), { compact: true })}.` });
  return out;
}

export function PlotInsights() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } });
  const toggle = () => setOpen((o) => { try { localStorage.setItem(KEY, o ? "0" : "1"); } catch { /* not remembered */ } return !o; });
  // follows the list's top filters (URL ?block= &plot_size= &status=) and can set them
  const [params, setParams] = useSearchParams();
  const f = { block: params.get("block") ?? "", plot_size: params.get("plot_size") ?? "", status: params.get("status") ?? "" };
  const setF = (key: keyof typeof f, value: string) => {
    const next = new URLSearchParams(params);
    if (value && f[key] !== value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const filtered = Boolean(f.block || f.plot_size || f.status);
  const { data: d, isLoading, isFetching } = useQuery({
    queryKey: filtered ? ["plot-overview", f.block, f.plot_size, f.status] : ["plot-overview"],
    queryFn: () => get<Ov>("realestate.spa.plot_overview", f), staleTime: 60_000, placeholderData: (prev) => prev,
  });

  const header = (
    <button type="button" onClick={toggle} aria-expanded={open}
      className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"><Sparkles className="size-4" /></span>
      <span className="flex-1">
        <span className="block text-sm font-semibold">Inventory insights</span>
        <span className="block text-xs text-muted-foreground">Value, pace, blocks, sizes, premium plots and payment health{d?.scope.agent ? " · sales are your own" : ""}
          {d && d.merged > 0 ? ` · ${d.merged} plots merged into others are not counted` : ""}</span>
      </span>
      {isFetching && <span className="size-2 animate-pulse rounded-full bg-primary" aria-label="Updating" />}
      <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
    </button>
  );
  const scopeBar = filtered && (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <Filter className="size-3.5 text-primary" />
      <span className="font-medium">Insights for</span>
      {(["block", "plot_size", "status"] as const).filter((k) => f[k]).map((k) => (
        <button key={k} type="button" onClick={() => setF(k, "")} className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground hover:bg-primary/90">
          {f[k]} <X className="size-3" />
        </button>
      ))}
      <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => { const n = new URLSearchParams(params); ["block", "plot_size", "status"].forEach((k) => n.delete(k)); setParams(n); }}>Whole scheme</button>
    </div>
  );
  if (!open) return <div className="rounded-2xl border bg-card p-2 shadow-sm">{header}</div>;
  if (isLoading || !d) return <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm">{header}<Skeleton className="h-40 rounded-xl" /></div>;

  const total = d.status.reduce((a, s) => a + n0(s.n), 0);
  const sold = d.status.filter((s) => SOLD.includes(s.status)).reduce((a, s) => a + n0(s.n), 0);
  const availRow = d.status.find((s) => s.status === "Available");
  const avail = n0(availRow?.n), stock = n0(availRow?.value);
  const soldValue = d.status.filter((s) => SOLD.includes(s.status)).reduce((a, s) => a + n0(s.value), 0);
  const allValue = d.status.reduce((a, s) => a + n0(s.value), 0);
  const marla = d.status.reduce((a, s) => a + n0(s.marla), 0);
  const perMonth = n0(d.pace.d90) / 3;
  const monthsLeft = perMonth > 0 ? avail / perMonth : null;
  const payTotal = d.payment.reduce((a, p) => a + n0(p.n), 0);
  const maxPerMarla = Math.max(1, ...d.sizes.map((s) => n0(s.per_marla)));
  const k = { total, sold, avail, stock, monthsLeft, perMonth };

  return (
    <div className={cn("space-y-4 rounded-2xl border bg-card p-3 shadow-sm transition-opacity sm:p-4", isFetching && "opacity-80")}>
      {header}
      {scopeBar}

      {/* headline */}
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="relative flex items-center justify-center gap-5 overflow-hidden rounded-xl border bg-gradient-to-br from-primary/[0.10] via-transparent to-emerald-500/[0.08] px-5 py-3">
          <Ring value={pct(sold, total)} label="Sold" sub={`${num(sold)} / ${num(total)} plots`} color={C.indigo} size={96} />
          <Ring value={pct(soldValue, allValue)} label="Value sold" sub={money(soldValue, { compact: true })} color={C.emerald} size={96} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Wallet} label="Inventory value" value={money(allValue, { compact: true })} sub={`${num(marla)} marla · ${money(allValue / Math.max(marla, 1), { compact: true })}/marla`} color={C.indigo} />
          <KpiCard icon={Layers} label="Available stock" value={money(stock, { compact: true })} sub={`${num(avail)} plots ready to sell`} progress={pct(avail, total)} color={C.emerald} />
          <KpiCard icon={TrendingUp} label="Sales pace" value={`${num(d.pace.d30)} / 30 days`} sub={`${money(d.pace.v30, { compact: true })} booked · ${num(d.pace.d90)} in 90 days`}
            delta={n0(d.pace.prev30) ? pct(n0(d.pace.d30) - n0(d.pace.prev30), n0(d.pace.prev30)) : null} color={C.blue} />
          <KpiCard icon={Timer} label="Months of stock" value={monthsLeft === null ? "—" : monthsLeft.toFixed(0)} sub={`at ${perMonth.toFixed(1)} bookings / month`} color={C.amber} />
        </div>
      </div>

      <Highlights items={insights(d, k)} />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* blocks */}
        <Panel title="Blocks" sub="Click a block to filter · ↗ opens its profile" icon={Layers}>
          <ul className="space-y-3">
            {d.blocks.map((b) => (
              <li key={b.block} role="button" tabIndex={0} onClick={() => setF("block", b.block)} onKeyDown={(e) => e.key === "Enter" && setF("block", b.block)}
                title={f.block === b.block ? "Click to show all blocks" : `Filter to ${b.block}`}
                className={cn("group -mx-2 cursor-pointer rounded-lg px-2 py-1.5 transition hover:bg-muted/60", f.block === b.block && "bg-primary/10 ring-1 ring-primary/40")}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                    <span className="size-2.5 rounded-sm" style={{ background: b.color || C.blue }} />{b.block}
                    <span className="text-[11px] font-normal text-muted-foreground">{b.block_type}</span>
                    <Link to={`/re/d/re-block/${encodeURIComponent(b.block)}`} onClick={(e) => e.stopPropagation()} title="Open block profile"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-primary group-hover:opacity-100"><ArrowUpRight className="size-3.5" /></Link>
                  </span>
                  <span className="text-xs text-muted-foreground"><b className="text-foreground">{num(b.sold)}</b>/{num(b.n)} sold · {num(b.available)} left · {money(b.stock_value, { compact: true })}</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  <div title={`Sold ${b.sold}`} style={{ width: `${pct(b.sold, b.n)}%`, background: b.color || C.blue }} />
                  <div title={`On hold ${b.held}`} style={{ width: `${pct(b.held, b.n)}%`, background: C.orange }} />
                  <div title={`Available ${b.available}`} style={{ width: `${pct(b.available, b.n)}%`, background: `${b.color || C.blue}40` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* sizes */}
        <Panel title="Plot sizes" sub="Click a size to filter · sold share, stock, price per marla" icon={Ruler}>
          <ul className="space-y-3">
            {d.sizes.map((s) => (
              <li key={s.plot_size} role="button" tabIndex={0} onClick={() => setF("plot_size", s.plot_size)} onKeyDown={(e) => e.key === "Enter" && setF("plot_size", s.plot_size)}
                title={f.plot_size === s.plot_size ? "Click to show all sizes" : `Filter to ${s.plot_size}`}
                className={cn("-mx-2 grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 transition hover:bg-muted/60", f.plot_size === s.plot_size && "bg-primary/10 ring-1 ring-primary/40")}>
                <span className="text-sm font-medium">{s.plot_size}</span>
                <span className="text-right text-xs text-muted-foreground">
                  <b className="text-foreground">{money(s.avg_price, { compact: true })}</b>{n0(s.min_price) !== n0(s.max_price) ? ` (${money(s.min_price, { compact: true })}–${money(s.max_price, { compact: true })})` : ""}
                </span>
                <Bar100 value={pct(s.sold, s.n)} color={C.indigo} />
                <span className="text-right text-[11px] text-muted-foreground">{num(s.sold)}/{num(s.n)} sold · {num(s.available)} left</span>
                <div className="col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="w-20 shrink-0">per marla</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct(n0(s.per_marla), maxPerMarla)}%`, background: C.teal }} /></div>
                  <b className="w-16 shrink-0 text-right text-foreground">{money(s.per_marla, { compact: true })}</b>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Premium plots" sub="Sell-through vs standard" icon={Crown}>
          <ul className="space-y-3">
            {d.premium.filter((p) => n0(p.n) > 0).map((p, i) => (
              <li key={p.kind}>
                <div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-medium">{p.kind}</span>
                  <span className="text-muted-foreground"><b className="text-foreground">{num(p.sold)}</b>/{num(p.n)} · {num(p.available)} left · avg {money(p.avg_price, { compact: true })}</span></div>
                <Bar100 value={pct(n0(p.sold), n0(p.n))} color={[C.violet, C.emerald, C.sky, C.slate][i % 4]} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Payment health" sub="Bookings on sold plots" icon={Gauge}>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {[...d.payment].sort((a, b) => ["Paid", "Due", "Overdue"].indexOf(a.status) - ["Paid", "Due", "Overdue"].indexOf(b.status)).map((p) => <div key={p.status} title={`${p.status}: ${p.n}`} style={{ width: `${pct(n0(p.n), payTotal)}%`, background: PAY[p.status] ?? C.slate }} />)}
          </div>
          <ul className="mt-3 space-y-2">
            {["Paid", "Due", "Overdue"].map((st) => {
              const p = d.payment.find((x) => x.status === st);
              return (
                <li key={st} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: PAY[st] }} />
                  <span className="flex-1">{st}</span>
                  <b className="tabular-nums">{num(p?.n ?? 0)}</b>
                  <span className="w-20 text-right text-xs text-muted-foreground">{st === "Overdue" ? money(p?.overdue ?? 0, { compact: true }) : st === "Due" ? money(p?.outstanding ?? 0, { compact: true }) : `${pct(n0(p?.n), payTotal).toFixed(0)}%`}</span>
                </li>
              );
            })}
          </ul>
          <Link to="/re/d/re-booking?status=Overdue" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">
            <AlertTriangle className="size-3.5" /> Open overdue bookings
          </Link>
        </Panel>

        <Panel title="On hold & latest bookings" sub="Plots set aside, and what sold last" icon={PauseCircle}>
          <ul className="space-y-1.5">
            {d.holds.map((h) => (
              <li key={h.name} className="flex items-start gap-2 text-xs">
                <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: STATUS_TONE[h.status] ?? C.orange }} />
                <span className="min-w-0 flex-1">
                  <Link to={`/re/d/re-plot/${encodeURIComponent(h.name)}`} className="font-semibold text-primary hover:underline">{h.name}</Link>
                  <span className="text-muted-foreground"> · {h.status} · {h.plot_size}</span>
                  {h.hold_reason && <span className="block break-words text-muted-foreground">{h.hold_reason}</span>}
                </span>
              </li>
            ))}
            {!d.holds.length && <li className="text-xs text-muted-foreground">Nothing on hold.</li>}
          </ul>
          <div className="mt-3 border-t pt-2">
            <ul className="space-y-1">
              {d.recent.map((r) => (
                <li key={`${r.plot}-${r.booking_date}`} className="flex items-baseline gap-2 text-xs">
                  <Link to={`/re/d/re-plot/${encodeURIComponent(r.plot)}`} className="font-semibold text-primary hover:underline">{r.plot}</Link>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.customer_name}</span>
                  <span className="text-muted-foreground">{date(r.booking_date)}</span>
                  <b className="tabular-nums">{money(r.net_price, { compact: true })}</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
