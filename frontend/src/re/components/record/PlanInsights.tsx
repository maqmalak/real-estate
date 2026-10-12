/**
 * Payment plans compared (RE Payment Plan list) and one plan's track record (its form): terms as a composition bar,
 * tenure and upfront share, plus how buyers on it actually pay — bookings, value, collected, overdue rate, discount and
 * recent use. Server: realestate.spa.plan_overview.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Coins, Percent, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { C, Highlights, KpiCard, type Highlight } from "@/re/components/analytics/kit";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { date, money, num } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { n0, pct, Ring } from "./ProjectProfile";

interface Usage { bookings?: number; net?: number; paid?: number; outstanding?: number; overdue?: number; overdue_count?: number; fully_paid?: number; discount?: number; gross?: number; last_used?: string; d90?: number }
interface PlanRow {
  name: string; plan_name: string; booking_percent: number; down_payment_percent: number; down_payment_days: number; installments: number; frequency: string;
  balloon_percent: number; balloon_frequency: string | null; development_percent: number; development_due_month: number; possession_percent: number;
  description: string | null; tenure_months: number; upfront_pct: number; installment_pct: number; usage: Usage;
}
interface Ov { plans: PlanRow[]; prices: { name: string; price: number }[]; unplanned: number; scope: { agent: boolean } }

const PARTS: { key: keyof PlanRow; label: string; color: string }[] = [
  { key: "booking_percent", label: "Booking", color: "#0ea5e9" },
  { key: "down_payment_percent", label: "Down", color: "#6366f1" },
  { key: "installment_pct", label: "Installments", color: "#14b8a6" },
  { key: "balloon_percent", label: "Balloons", color: "#f59e0b" },
  { key: "development_percent", label: "Development", color: "#e11d48" },
  { key: "possession_percent", label: "Possession", color: "#8b5cf6" },
];
const usePlans = () => useQuery({ queryKey: ["plan-overview"], queryFn: () => get<Ov>("realestate.spa.plan_overview"), staleTime: 60_000 });
const overdueRate = (u: Usage) => pct(n0(u.overdue_count), n0(u.bookings));
const collected = (u: Usage) => pct(n0(u.paid), n0(u.net));

function Composition({ p, tall }: { p: PlanRow; tall?: boolean }) {
  return (
    <div className={cn("flex overflow-hidden rounded-full ring-1 ring-inset ring-border", tall ? "h-3.5" : "h-2.5")}>
      {PARTS.map((x) => n0(p[x.key]) > 0 && <div key={x.key} title={`${x.label} ${n0(p[x.key])}%`} style={{ width: `${n0(p[x.key])}%`, background: x.color }} />)}
    </div>
  );
}

function insights(plans: PlanRow[]): Highlight[] {
  const used = plans.filter((p) => n0(p.usage.bookings) > 0);
  if (!used.length) return [];
  const total = used.reduce((a, p) => a + n0(p.usage.bookings), 0);
  const by = (f: (p: PlanRow) => number) => [...used].sort((a, b) => f(b) - f(a));
  const pop = by((p) => n0(p.usage.bookings))[0];
  const out: Highlight[] = [{ tone: "info", text: `${pop.name} is the most chosen plan — ${num(pop.usage.bookings)} of ${num(total)} bookings (${pct(n0(pop.usage.bookings), total).toFixed(0)}%).` }];
  const credit = used.filter((p) => p.installments > 0 && n0(p.usage.bookings) >= 3);
  if (credit.length > 1) {
    const worst = [...credit].sort((a, b) => overdueRate(b.usage) - overdueRate(a.usage))[0];
    const best = [...credit].sort((a, b) => overdueRate(a.usage) - overdueRate(b.usage))[0];
    out.push({ tone: overdueRate(worst.usage) > 30 ? "bad" : "warn", text: `${worst.name} has the highest overdue rate: ${overdueRate(worst.usage).toFixed(0)}% of its bookings are behind (${money(worst.usage.overdue, { compact: true })}).` });
    out.push({ tone: "good", text: `${best.name} pays most reliably — ${overdueRate(best.usage).toFixed(0)}% overdue, ${collected(best.usage).toFixed(0)}% collected.` });
  }
  const recent = by((p) => n0(p.usage.d90))[0];
  if (n0(recent.usage.d90) > 0) out.push({ tone: "info", text: `Last 90 days: ${recent.name} led with ${num(recent.usage.d90)} new bookings.` });
  const idle = plans.filter((p) => n0(p.usage.bookings) <= 1);
  if (idle.length) out.push({ tone: "warn", text: `${idle.map((p) => p.name).join(", ")} ${idle.length > 1 ? "are" : "is"} barely used — promote, merge or retire.` });
  return out;
}

/** List page: every plan as a comparison card. */
export function PlanCards() {
  const { data, isLoading } = usePlans();
  if (isLoading || !data) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>;
  const maxBookings = Math.max(1, ...data.plans.map((p) => n0(p.usage.bookings)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-2.5 text-xs shadow-sm">
        <span className="flex items-center gap-1.5 font-semibold"><Sparkles className="size-3.5 text-primary" />Plan parts</span>
        {PARTS.map((x) => <span key={x.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: x.color }} />{x.label}</span>)}
        {data.scope.agent && <span className="ml-auto text-muted-foreground">Usage counts your own bookings</span>}
      </div>
      <Highlights items={insights(data.plans)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.plans.map((p) => {
          const u = p.usage, or = overdueRate(u);
          return (
            <Link key={p.name} to={`/re/d/re-payment-plan/${encodeURIComponent(p.name)}`}
              className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold tracking-tight group-hover:text-primary">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.installments ? `${p.installments} × ${p.frequency.toLowerCase()} · ${p.tenure_months} months` : "Single payment"}{n0(p.balloon_percent) ? ` · ${p.balloon_frequency?.toLowerCase()} balloons` : ""}
                  </p>
                </div>
                <Ring value={n0(u.bookings) ? collected(u) : null} label="Collected" color={C.emerald} size={52} />
              </div>
              <Composition p={p} />
              <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                <Cell k="Upfront" v={`${n0(p.upfront_pct).toFixed(0)}%`} />
                <Cell k="Bookings" v={num(u.bookings ?? 0)} />
                <Cell k="Overdue rate" v={n0(u.bookings) ? `${or.toFixed(0)}%` : "—"} tone={or > 30 ? "text-rose-600 dark:text-rose-400" : or > 15 ? "text-amber-600" : undefined} />
              </div>
              <div className="mt-auto space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${pct(n0(u.bookings), maxBookings)}%` }} /></div>
                <p className="flex justify-between text-[11px] text-muted-foreground"><span>{money(u.net ?? 0, { compact: true })} sold</span><span>{u.last_used ? `last used ${date(u.last_used)}` : "never used"}</span></p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className="rounded-lg bg-muted/60 py-1.5"><p className={cn("font-semibold tabular-nums text-foreground", tone)}>{v}</p><p className="text-muted-foreground">{k}</p></div>;
}

/** Form page: this plan's terms and track record. */
export function PlanUsage({ plan }: { plan: string | undefined }) {
  const { data } = usePlans();
  const p = data?.plans.find((x) => x.name === plan);
  if (!plan || !data) return null;
  if (!p) return null;
  const u = p.usage;
  const share = pct(n0(u.bookings), data.plans.reduce((a, x) => a + n0(x.usage.bookings), 0));
  const disc = n0(u.gross) ? pct(n0(u.discount), n0(u.gross)) : 0;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Plan track record</p>
          <h3 className="text-lg font-bold tracking-tight">{p.name}</h3>
          <p className="text-xs text-muted-foreground">{p.installments ? `${p.installments} ${p.frequency.toLowerCase()} installments over ${p.tenure_months} months` : "Paid in full"} · {n0(p.upfront_pct).toFixed(0)}% upfront</p>
        </div>
        <Link to={`/re/d/re-booking?payment_plan=${encodeURIComponent(p.name)}`} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">View its bookings</Link>
      </div>
      <div>
        <Composition p={p} tall />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {PARTS.filter((x) => n0(p[x.key]) > 0).map((x) => <span key={x.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: x.color }} />{x.label} <b>{n0(p[x.key])}%</b></span>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} label="Bookings on this plan" value={num(u.bookings ?? 0)} sub={`${share.toFixed(0)}% of all · ${num(u.d90 ?? 0)} in 90 days`} progress={share} color={C.indigo} />
        <KpiCard icon={TrendingUp} label="Sold value" value={money(u.net ?? 0, { compact: true })} sub={`${num(u.fully_paid ?? 0)} fully paid`} color={C.blue} />
        <KpiCard icon={Wallet} label="Collected" value={money(u.paid ?? 0, { compact: true })} sub={`${collected(u).toFixed(0)}% · ${money(u.outstanding ?? 0, { compact: true })} to come`} progress={collected(u)} color={C.emerald} />
        <KpiCard icon={AlertTriangle} label="Overdue" value={money(u.overdue ?? 0, { compact: true })} sub={`${num(u.overdue_count ?? 0)} bookings · ${overdueRate(u).toFixed(0)}% rate`} color={overdueRate(u) > 30 ? C.red : C.amber} />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Percent className="size-3.5" />Average discount {disc.toFixed(1)}%</span>
        <span className="flex items-center gap-1"><CalendarClock className="size-3.5" />{u.last_used ? `Last used ${date(u.last_used)}` : "Never used"}</span>
        <span className="flex items-center gap-1"><Coins className="size-3.5" />Down payment due {p.down_payment_days || 0} days after booking</span>
      </p>
    </section>
  );
}
