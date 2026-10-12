/**
 * Plot profile (RE Plot form): the plot's identity and price against its size and block, the current owner's payment
 * progress with an installment timeline, ownership and price history, society bills, buyer interest, documents, open
 * tasks and street neighbours — with computed insights. Server: realestate.spa.plot_profile.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, BadgePercent, CalendarClock, Crown, FileText, History, Home, Landmark, MapPin, Phone, Receipt, Repeat2, Ruler,
  TrendingUp, User, Wallet, Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { C, Highlights, KpiCard, STATUS_TONE, type Highlight } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { Chip, n0, Panel, pct, Ring } from "./ProjectProfile";

interface Inst { label: string; due_date: string; amount: number; paid: number; status: string }
interface PP {
  plot: {
    name: string; plot_no: string; block: string; block_name: string; block_type: string; color: string | null; plot_size: string; plot_type: string;
    area_marla: number; area_sqft: number; status: string; payment_status: string | null; list_price: number; street: string | null;
    is_corner: number; is_park_facing: number; is_boulevard_facing: number; hold_reason: string | null; possession_date: string | null; project: string;
  };
  size: { avg_price: number; min_price: number; max_price: number; n: number; available: number; sold: number };
  block_stats: { per_marla: number; n: number; sold: number; available: number; other_sizes: number };
  street: { status: string; n: number }[];
  booking: null | {
    name: string; customer: string; customer_name: string; mobile_no: string | null; status: string; booking_date: string; net_price: number;
    discount: number; paid: number; outstanding: number; overdue: number; overdue_since: string | null; next_due_date: string | null;
    next_due_amount: number; payment_plan: string | null; agent: string | null; possession_date: string | null; installments: Inst[];
    receipts: number; last_receipt: { posting_date: string; amount: number; name: string } | null;
  };
  transfers: { name: string; transfer_date: string; from_customer: string; to_customer: string; workflow_state: string | null; transfer_fee: number }[];
  bills: { n: number; outstanding: number | null; overdue: number | null; last_month: string | null };
  interest: { visits: number; deals: number; last_visit: string | null };
  price_history: { on: string; old: number; new: number; reason: string | null }[];
  documents: { document_type: string; at: string; n: number }[];
  tasks: { name: string; subject: string; status: string; priority: string }[];
}

const INST: Record<string, string> = { Paid: C.green, "Partly Paid": C.amber, Due: C.amber, Overdue: C.red, Unpaid: "#cbd5e1" };
const daysTo = (d: string | null) => (d ? Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000) : null);

function insights(d: PP): Highlight[] {
  const out: Highlight[] = [];
  const p = d.plot, b = d.booking;
  const perMarla = p.area_marla ? p.list_price / p.area_marla : 0;
  const prem = d.block_stats.per_marla ? pct(perMarla - n0(d.block_stats.per_marla), n0(d.block_stats.per_marla)) : 0;
  if (Math.abs(prem) >= 1) out.push({ tone: prem > 0 ? "info" : "good", text: `Priced ${money(perMarla, { compact: true })}/marla — ${Math.abs(prem).toFixed(0)}% ${prem > 0 ? "above" : "below"} the ${p.block_name} average.` });
  else out.push({ tone: "info", text: `Priced at the ${p.block_name} average of ${money(d.block_stats.per_marla, { compact: true })}/marla.` });
  if (p.status === "Available") out.push({ tone: "good", text: `Available now — one of ${num(d.size.available)} ${p.plot_size} plots left.${d.interest.visits ? ` ${num(d.interest.visits)} site visits showed interest.` : ""}` });
  if (b) {
    out.push({ tone: pct(b.paid, b.net_price) >= 50 ? "good" : "info", text: `${b.customer_name} has paid ${pct(b.paid, b.net_price).toFixed(0)}% (${money(b.paid, { compact: true })} of ${money(b.net_price, { compact: true })}).` });
    if (b.overdue > 0) out.push({ tone: "bad", text: `Overdue ${money(b.overdue, { compact: true })}${b.overdue_since ? ` since ${date(b.overdue_since)}` : ""} — send a reminder or call.` });
    const dd = daysTo(b.next_due_date);
    if (dd !== null && b.next_due_amount > 0) out.push({ tone: dd < 0 ? "bad" : dd <= 7 ? "warn" : "info", text: `Next installment ${money(b.next_due_amount, { compact: true })} ${dd < 0 ? `was due ${-dd} days ago` : dd === 0 ? "is due today" : `is due in ${dd} days`} (${date(b.next_due_date)}).` });
  }
  const ph = d.price_history.filter((x) => x.old > 0);
  if (ph.length) {
    const first = d.price_history[0].new || ph[0].old, last = p.list_price;
    if (first) out.push({ tone: "good", text: `Price up ${pct(last - first, first).toFixed(1)}% since launch (${money(first, { compact: true })} → ${money(last, { compact: true })}).` });
  }
  if (n0(d.bills.overdue) > 0) out.push({ tone: "warn", text: `${num(d.bills.overdue)} society bill overdue · ${money(d.bills.outstanding, { compact: true })} outstanding.` });
  if (d.transfers.length) out.push({ tone: "info", text: `Changed hands ${d.transfers.length} time${d.transfers.length > 1 ? "s" : ""} — last on ${date(d.transfers[d.transfers.length - 1].transfer_date)}.` });
  return out;
}

export function PlotProfile({ plot }: { plot: string | undefined }) {
  const { data: d, isLoading, error } = useQuery({
    queryKey: ["plot-profile", plot], enabled: Boolean(plot), staleTime: 30_000,
    queryFn: () => get<PP>("realestate.spa.plot_profile", { plot: plot ?? "" }),
  });
  if (!plot) return null;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !d) return <div className="space-y-3"><Skeleton className="h-40 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div></div>;

  const p = d.plot, b = d.booking;
  const color = p.color || C.blue;
  const tone = STATUS_TONE[p.status] ?? C.slate;
  const perMarla = p.area_marla ? p.list_price / p.area_marla : 0;
  const vsSize = d.size.avg_price ? pct(p.list_price - d.size.avg_price, d.size.avg_price) : 0;
  const streetTotal = d.street.reduce((a, s) => a + n0(s.n), 0);
  const inst = b?.installments ?? [];
  const instPaid = inst.filter((i) => i.status === "Paid").length;
  const dd = daysTo(b?.next_due_date ?? null);
  const features = [p.is_corner && "Corner", p.is_park_facing && "Park facing", p.is_boulevard_facing && "Boulevard facing"].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}24, transparent 55%)` }} />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full blur-3xl" style={{ background: `${tone}22` }} />
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
        <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>Plot profile</span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${tone}1f`, color: tone }}>{p.status}</span>
              {features.map((f) => <span key={f} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"><Crown className="size-3" />{f}</span>)}
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              <h2 className="text-3xl font-bold tracking-tight">{p.plot_no}</h2>
              <p className="pb-1 text-2xl font-semibold tabular-nums text-foreground/90">{money(p.list_price, { compact: true })}</p>
              <p className="pb-1.5 text-xs text-muted-foreground">{money(perMarla, { compact: true })}/marla</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link to={`/re/d/re-block/${encodeURIComponent(p.block)}`}><Chip icon={Landmark}>{p.block_name} · {p.block_type}</Chip></Link>
              <Chip icon={Ruler}>{p.plot_size} · {num(p.area_marla)} marla · {num(p.area_sqft)} sq ft</Chip>
              {p.street && <Chip icon={MapPin}>{p.street}</Chip>}
              <Chip icon={Home}>{p.plot_type}</Chip>
            </div>
            {p.hold_reason && <p className="rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs text-orange-700 dark:text-orange-300"><b>On hold:</b> {p.hold_reason}</p>}
          </div>
          <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-5">
            {b ? (
              <>
                <Ring value={pct(b.paid, b.net_price)} label="Paid" sub={`${money(b.paid, { compact: true })} of ${money(b.net_price, { compact: true })}`} color={C.emerald} />
                <Ring value={inst.length ? pct(instPaid, inst.length) : null} label="Installments" sub={`${instPaid} / ${inst.length} paid`} color={b.overdue > 0 ? C.red : C.indigo} />
              </>
            ) : (
              <>
                <Ring value={pct(n0(d.block_stats.sold), n0(d.block_stats.n))} label={`${p.block_name} sold`}
                  sub={`${num(d.block_stats.sold)} of ${num(d.block_stats.n)} · ${num(d.block_stats.available)} left`} color={color} />
                <Ring value={pct(n0(d.size.sold), n0(d.size.n))} label={`${p.plot_size} sold`}
                  sub={`${num(d.size.sold)} of ${num(d.size.n)} · ${num(d.size.available)} left`} color={C.indigo} />
              </>
            )}
          </div>
          {!b && n0(d.block_stats.other_sizes) > 0 && (
            <p className="max-w-xs text-center text-[11px] text-muted-foreground">
              {p.block_name} also has {num(d.block_stats.other_sizes)} plot{n0(d.block_stats.other_sizes) === 1 ? "" : "s"} of other sizes, so its totals differ from {p.plot_size}.
            </p>
          )}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={BadgePercent} label="Price vs size average" value={`${vsSize >= 0 ? "+" : ""}${vsSize.toFixed(1)}%`}
          sub={`${p.plot_size} avg ${money(d.size.avg_price, { compact: true })}${n0(d.size.min_price) !== n0(d.size.max_price) ? ` (${money(d.size.min_price, { compact: true })}–${money(d.size.max_price, { compact: true })})` : ""}`} color={C.violet} />
        {b ? (
          <>
            <KpiCard icon={Wallet} label="Outstanding" value={money(b.outstanding, { compact: true })} sub={`${num(b.receipts)} receipts${b.last_receipt ? ` · last ${date(b.last_receipt.posting_date)}` : ""}`} progress={pct(b.paid, b.net_price)} color={C.amber}
              footer={b.overdue > 0 && <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3.5" /> Overdue <b>{money(b.overdue, { compact: true })}</b></span>} />
            <KpiCard icon={CalendarClock} label="Next installment" value={b.next_due_amount ? money(b.next_due_amount, { compact: true }) : "—"}
              sub={b.next_due_date ? `${date(b.next_due_date)} · ${dd! < 0 ? `${-dd!} days late` : dd === 0 ? "today" : `in ${dd} days`}` : "Nothing due"} color={dd !== null && dd < 0 ? C.red : C.blue} />
          </>
        ) : (
          <>
            <KpiCard icon={TrendingUp} label="Interest" value={`${num(d.interest.visits)} visits`} sub={`${num(d.interest.deals)} deals${d.interest.last_visit ? ` · last ${date(d.interest.last_visit)}` : ""}`} color={C.blue} />
            <KpiCard icon={Ruler} label={`${p.plot_size} stock`} value={`${num(d.size.available)} left`} sub={`${num(d.size.sold)} sold of ${num(d.size.n)} in the scheme`} progress={pct(n0(d.size.available), n0(d.size.n))} color={C.emerald} />
          </>
        )}
        <KpiCard icon={Receipt} label="Society bills" value={money(d.bills.outstanding ?? 0, { compact: true })} sub={`${num(d.bills.n)} bills${d.bills.last_month ? ` · last ${date(d.bills.last_month)}` : ""}`} color={C.teal}
          footer={n0(d.bills.overdue) > 0 && <span className="text-amber-600 dark:text-amber-400">{num(d.bills.overdue)} overdue</span>} />
      </div>

      <Highlights items={insights(d)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* owner + installments */}
        {b ? (
          <Panel title="Owner & payment plan" sub={`${b.name} · booked ${date(b.booking_date)}${b.payment_plan ? ` · ${b.payment_plan}` : ""}`} icon={User}
            action={<Link to={`/re/d/re-booking/${encodeURIComponent(b.name)}`} className="text-xs font-medium text-primary hover:underline">Open booking</Link>}>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-background/60 p-3">
              <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{b.customer_name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{b.customer_name}</p>
                <p className="text-xs text-muted-foreground">{b.agent ? `Agent ${b.agent}` : "No agent"}{b.discount ? ` · discount ${money(b.discount, { compact: true })}` : ""}{b.possession_date ? ` · possession ${date(b.possession_date)}` : ""}</p>
              </div>
              {b.mobile_no && <a href={`tel:${b.mobile_no}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted"><Phone className="size-3.5" />{b.mobile_no}</a>}
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${INST[b.status] ?? C.slate}22`, color: INST[b.status] ?? C.slate }}>{b.status}</span>
            </div>
            {/* installment timeline */}
            <div className="flex gap-[3px]" role="img" aria-label={`${instPaid} of ${inst.length} installments paid`}>
              {inst.map((i, k) => (
                <span key={k} title={`${i.label} · ${date(i.due_date)} · ${money(i.amount, { compact: true })} · ${i.status}`}
                  className={cn("h-7 flex-1 rounded-[3px] transition hover:scale-y-110", i.due_date === b.next_due_date && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
                  style={{ background: i.status === "Partly Paid" ? `linear-gradient(to top, ${C.amber} ${pct(i.paid, i.amount)}%, #e2e8f0 0)` : INST[i.status] ?? "#cbd5e1" }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{inst[0] ? date(inst[0].due_date) : ""}</span>
              <span className="flex flex-wrap gap-3">{Object.entries(INST).filter(([k]) => inst.some((i) => i.status === k)).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: c }} />{k} {inst.filter((i) => i.status === k).length}</span>)}</span>
              <span>{inst.length ? date(inst[inst.length - 1].due_date) : ""}</span>
            </div>
          </Panel>
        ) : (
          <Panel title="Not booked yet" sub="Ready to sell" icon={Home}
            action={p.status === "Available" && <Link to={`/re/d/re-booking/new?plot=${encodeURIComponent(p.name)}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90">Book this plot</Link>}>
            <p className="text-sm text-muted-foreground">{p.status === "Available" ? `${p.plot_no} is open for booking at ${money(p.list_price)}.` : `${p.plot_no} is ${p.status.toLowerCase()} and has no active booking.`}</p>
          </Panel>
        )}

        {/* street neighbours */}
        <Panel title="Street & neighbours" sub={p.street ? `${p.street} · ${num(streetTotal)} plots` : `${p.block_name}`} icon={MapPin}>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {d.street.map((s) => <div key={s.status} title={`${s.status}: ${s.n}`} style={{ width: `${pct(n0(s.n), streetTotal)}%`, background: STATUS_TONE[s.status] ?? C.slate }} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
            {d.street.map((s) => (
              <li key={s.status} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: STATUS_TONE[s.status] ?? C.slate }} />{s.status} <b className="ml-auto tabular-nums">{num(s.n)}</b></li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">{pct(d.street.filter((s) => ["Booked", "Sold", "Possession Given"].includes(s.status)).reduce((a, s) => a + n0(s.n), 0), streetTotal).toFixed(0)}% of this street is sold.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Price history" sub="Revisions on the list price" icon={History}>
          <ol className="relative space-y-3 border-l-2 border-dashed border-border pl-4">
            {d.price_history.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[22px] top-1 size-3 rounded-full border-2 border-background" style={{ background: h.old && h.new < h.old ? C.red : C.emerald }} />
                <p className="text-xs text-muted-foreground">{date(h.on)}</p>
                <p className="text-sm font-semibold tabular-nums">{h.old ? <>{money(h.old, { compact: true })} → </> : null}{money(h.new, { compact: true })}
                  {h.old > 0 && <span className={cn("ml-1.5 text-xs", h.new >= h.old ? "text-emerald-600" : "text-rose-600")}>{h.new >= h.old ? "+" : ""}{pct(h.new - h.old, h.old).toFixed(1)}%</span>}</p>
                {h.reason && <p className="break-words text-xs text-muted-foreground">{h.reason}</p>}
              </li>
            ))}
            {!d.price_history.length && <li className="text-sm text-muted-foreground">No price changes recorded.</li>}
          </ol>
        </Panel>

        <Panel title="Ownership" sub="Transfers of this plot" icon={Repeat2}>
          <ol className="space-y-2 text-sm">
            {b && <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" /><b>{b.customer_name}</b><span className="text-xs text-muted-foreground">current owner</span></li>}
            {[...d.transfers].reverse().map((t) => (
              <li key={t.name} className="text-xs">
                <Link to={`/re/d/re-plot-transfer/${encodeURIComponent(t.name)}`} className="font-medium text-primary hover:underline">{t.name}</Link>
                <span className="text-muted-foreground"> · {date(t.transfer_date)} · {t.workflow_state ?? ""}</span>
                <span className="block break-words">{t.from_customer} → {t.to_customer}</span>
              </li>
            ))}
            {!d.transfers.length && <li className="text-xs text-muted-foreground">{b ? "Original allottee — never transferred." : "No owner yet."}</li>}
          </ol>
        </Panel>

        <Panel title="Documents & tasks" sub="Letters issued and open work" icon={FileText}>
          <ul className="space-y-1.5 text-xs">
            {d.documents.map((x) => (
              <li key={x.document_type} className="flex items-center gap-2"><FileText className="size-3.5 text-primary" /><span className="flex-1">{x.document_type}</span>
                {x.n > 1 && <span className="rounded-full bg-muted px-1.5">v{x.n}</span>}<span className="text-muted-foreground">{date(x.at)}</span></li>
            ))}
            {!d.documents.length && <li className="text-muted-foreground">No letters generated yet — use Actions → Generate.</li>}
          </ul>
          <div className="mt-3 border-t pt-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Wrench className="size-3.5 text-primary" />{d.tasks.length} open task{d.tasks.length === 1 ? "" : "s"}</p>
            <ul className="space-y-1 text-xs">
              {d.tasks.map((t) => <li key={t.name} className="flex gap-2"><span className="flex-1 break-words">{t.subject}</span><span className="text-muted-foreground">{t.status}</span></li>)}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
