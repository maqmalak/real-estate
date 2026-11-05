/**
 * Sellers and payments (/re/land/payments): every land owner with their area, net due, paid (cash), adjusted (plots) and
 * balance from the ledger; payables aging by mature date; schedule rows due within a month; seller payments and their
 * approval; plots given instead of cash; and the check that deal balances equal the Creditors - Land Owners account.
 * Server: realestate.land_api.payments.
 */
import { CalendarClock, CheckCircle2, Combine, HandCoins, Plus, Scale, ShieldAlert, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisShort, C, ChartCard, ChartTip, DataTable, KpiCard, useChartTheme } from "@/re/components/analytics/kit";
import { Panel } from "@/re/components/record/ProjectProfile";
import { Skeleton } from "@/re/components/ui/skeleton";
import { date, money, todayISO } from "@/re/lib/format";
import { kanal, useLandPayments, type Seller } from "@/re/lib/land";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";
import { LandHeader } from "./Land";

const AGING_COLORS = ["#16a34a", "#f59e0b", "#f97316", "#dc2626"];

export function LandPaymentsPage() {
  const { data: d, isLoading } = useLandPayments();
  const { dark } = useTheme();
  const ct = useChartTheme(dark);
  const header = <LandHeader active="/re/land/payments" icon={Wallet} title="Sellers & payments" sub="Land owners' shares, what is paid in cash or plots, what is still owed and when" />;
  if (isLoading || !d) return <div className="space-y-5 p-4 sm:p-6">{header}<div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div><Skeleton className="h-96 rounded-2xl" /></div>;
  const t = d.totals;
  const settled = t.net_due ? ((t.paid + t.adjusted) * 100) / t.net_due : 0;
  const today = todayISO();
  const r = d.reconciliation;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {header}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} label="Land owners" value={String(d.sellers.length)} sub={`${d.sellers.filter((s) => s.balance > 0.5).length} still to be paid`} color={C.teal} />
        <KpiCard icon={HandCoins} label="Paid to sellers" value={money(t.paid, { compact: true })} sub={`${money(t.adjusted, { compact: true })} more settled with plots`} progress={settled} color={C.sky} />
        <KpiCard icon={Wallet} label="Balance payable" value={money(t.balance, { compact: true })} sub={`of ${money(t.net_due, { compact: true })} net due`} color={C.amber} />
        <KpiCard icon={ShieldAlert} label="Overdue" value={money(t.overdue, { compact: true })} sub="past the mature or extended date" color={t.overdue ? C.rose : C.emerald} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ChartCard title="Payables aging" sub="Balance owed to sellers by days past the mature / extended date" bodyClass="h-56"
          insight={r ? (r.matches
            ? <>Deal balances match <b>{r.creditors_account}</b> in the ledger ({money(r.gl_balance)}).</>
            : <span className="text-red-700 dark:text-red-300">Deal balances ({money(r.deal_balances)}) differ from {r.creditors_account} ({money(r.gl_balance)}) by {money(r.difference)} — check unposted or cancelled vouchers.</span>) : undefined}>
          <ResponsiveContainer>
            <BarChart data={d.aging} margin={{ left: 4, right: 8, top: 6 }}>
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: ct.axis }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={axisShort} tick={{ fontSize: 11, fill: ct.axis }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTip />} cursor={{ fill: ct.grid }} />
              <Bar dataKey="amount" name="Balance" radius={[6, 6, 0, 0]}>{d.aging.map((_a, i) => <Cell key={i} fill={AGING_COLORS[i]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Panel title="Waiting for approval" sub="Seller payments above the limit — Admin / Accounts Manager" icon={CheckCircle2}
          action={<Link to="/re/d/re-land-payment/new" className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm hover:opacity-90"><Plus className="size-3.5" />Payment</Link>}>
          <ul className="divide-y text-sm">
            {d.pending.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/re/d/re-land-payment/${encodeURIComponent(p.name)}`} className="min-w-0 truncate font-medium hover:underline">{p.owner_name}<span className="block text-[11px] font-normal text-muted-foreground">{p.deal}</span></Link>
                <span className="shrink-0 font-semibold tabular-nums">{money(p.amount, { compact: true })}</span>
              </li>
            ))}
            {!d.pending.length && <li className="py-3 text-muted-foreground">Nothing waiting.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Sellers" sub="Per land owner across all deals — Paid and Balance come from their supplier ledger" icon={Users}>
        <DataTable<Seller> rows={d.sellers} rowKey={(s) => s.owner} dense maxHeight="560px" initialSort={{ key: "balance", dir: "desc" }}
          onRow={(s) => `/re/d/re-land-owner/${encodeURIComponent(s.owner)}`}
          cols={[
            { key: "name", label: "Owner", render: (s) => <span className="font-medium">{s.name}<span className="block text-[10px] font-normal text-muted-foreground">{s.cnic ?? "No CNIC"}{s.mobile ? ` · ${s.mobile}` : ""}</span></span> },
            { key: "deals", label: "Deals", value: (s) => s.deals.length, render: (s) => <span className="text-xs">{s.deals.join(", ")}{s.cancelled ? <span className="ml-1 rounded bg-red-500/10 px-1 text-[10px] text-red-700">cancelled</span> : null}</span>, hideSm: true },
            { key: "kanal", label: "Area", align: "right", render: (s) => kanal(s.kanal) },
            { key: "net_due", label: "Net due", align: "right", render: (s) => money(s.net_due, { compact: true }) },
            { key: "paid", label: "Paid (cash)", align: "right", render: (s) => money(s.paid, { compact: true }) },
            { key: "adjusted", label: "Plots", align: "right", render: (s) => (s.adjusted ? <span className="text-violet-700 dark:text-violet-300">{money(s.adjusted, { compact: true })}</span> : "—"), hideSm: true },
            { key: "balance", label: "Balance", align: "right", render: (s) => <span className={cn("font-semibold", s.balance < -0.5 ? "text-violet-700" : s.overdue ? "text-red-600" : s.balance <= 0.5 ? "text-emerald-600" : "")}>{s.balance < -0.5 ? `Refund due ${money(-s.balance, { compact: true })}` : money(s.balance, { compact: true })}</span>, bar: { color: C.amber } },
            { key: "next_due", label: "Next due", render: (s) => (s.overdue ? <span className="text-xs font-medium text-red-600">Overdue</span> : s.next_due ? <span className="text-xs">{date(s.next_due)}</span> : <span className="text-xs text-muted-foreground">—</span>) },
          ]} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Due within a month" sub="Seller schedule rows that are overdue or fall due in the next 31 days" icon={CalendarClock}>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {d.schedule.map((s, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-2 pr-2"><span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", s.due_date < today ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700")}>{date(s.due_date)}</span></td>
                    <td className="py-2"><Link to={`/re/d/re-land-deal/${encodeURIComponent(s.deal)}`} className="font-medium hover:underline">{s.owner_name}</Link><span className="block text-[11px] text-muted-foreground">{s.deal} · {s.label}</span></td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(s.amount - s.paid, { compact: true })}</td>
                  </tr>
                ))}
                {!d.schedule.length && <tr><td className="py-3 text-muted-foreground">Nothing due.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Seller payments" sub="Latest payments, withholding tax and signed receipts" icon={HandCoins}>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {d.recent.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2 pr-2 text-[11px] text-muted-foreground tabular-nums">{date(p.posting_date)}</td>
                    <td className="py-2"><Link to={`/re/d/re-land-payment/${encodeURIComponent(p.name)}`} className="font-medium hover:underline">{p.owner_name}</Link>
                      <span className="block text-[11px] text-muted-foreground">{p.payment_kind} · {p.mode_of_payment}{p.instrument_no ? ` ${p.instrument_no}` : ""}{p.wht_amount ? ` · WHT ${money(p.wht_amount)}` : ""}{p.received_by_seller ? " · receipt signed" : ""}</span></td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right"><span className="font-semibold tabular-nums">{money(p.amount, { compact: true })}</span>
                      <span className={cn("block text-[10px]", p.docstatus === 1 ? "text-emerald-600" : "text-amber-600")}>{p.workflow_state || (p.docstatus === 1 ? "Paid" : "Draft")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Plots given instead of cash" sub="Plot adjustments: each plot is booked to the owner and netted against their land payable" icon={Combine}
        action={<Link to="/re/d/re-plot-adjustment/new" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted"><Plus className="size-3.5" />Adjust with plots</Link>}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.adjustments.map((a) => (
            <Link key={a.name} to={`/re/d/re-plot-adjustment/${encodeURIComponent(a.name)}`} className="rounded-xl border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{a.owner_name}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", a.docstatus === 1 ? "bg-violet-500/10 text-violet-700" : "bg-amber-500/10 text-amber-700")}>{a.workflow_state}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{a.deal} · {date(a.posting_date)}</p>
              <div className="mt-2 flex flex-wrap gap-1">{a.plots.map((p) => <span key={p.plot} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">{p.plot} · {money(p.agreed_value, { compact: true })}</span>)}</div>
              <p className="mt-2 text-xs">Adjusted <b>{money(a.applied_amount, { compact: true })}</b>{a.excess_receivable ? <> · owner owes <b>{money(a.excess_receivable, { compact: true })}</b></> : null}</p>
            </Link>
          ))}
          {!d.adjustments.length && <p className="text-sm text-muted-foreground">No plots have been given against land yet.</p>}
        </div>
      </Panel>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Scale className="size-3.5" />Land owners are ERPNext Suppliers in "Land Owners": purchase invoices on approval, Payment Entries for payments, a Journal Entry for plots.</p>
    </div>
  );
}
