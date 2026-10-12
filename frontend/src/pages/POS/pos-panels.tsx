/** POS terminal panels: invoice manager (with receipt preview / reprint / return), returns, sync status, collecting dues. */
import { useEffect, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  AlertTriangle, ArrowRight, Banknote, CalendarDays, CheckCircle2, CloudOff, Coins, Database, Eye, FileText, HandCoins, History, LayoutGrid, List, Loader2,
  PauseCircle, Percent, PlayCircle, Printer, ReceiptText, RefreshCw, Search, Trash2, TrendingUp, Undo2, User, Wallet, Wifi, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { kvGet, localDate, type CompanyHeader, type OfflineBundle, type ReceiptData, type SyncState } from "./pos-offline";
import { loadPrinter, paymentReceiptHtml, printHtml, printReceipt, receiptHtml, ReceiptPreview } from "./pos-receipt";

type Money = (v?: number) => string;
interface PanelProfile { name: string; company: string; print_format?: string; payments: { mode_of_payment: string; default: number }[] }

export const printUrl = (name: string, format?: string) =>
  `/printview?doctype=POS%20Invoice&name=${encodeURIComponent(name)}${format ? `&format=${encodeURIComponent(format)}` : ""}&trigger_print=1`;

// ------------------------------------------------------------------ invoice manager
interface InvRow { name: string; customer: string; customer_name: string; posting_date: string; posting_time: string; grand_total: number; total: number; paid_amount: number;
  change_amount?: number; write_off_amount?: number; due: number; discount?: number; is_return: number; return_against?: string; status: string; docstatus: number; consolidated_invoice?: string;
  cashier: string; mm_offline_id?: string; coupon_code?: string; remarks?: string; total_qty?: number; line_count?: number; modes?: string }
interface InvResult { rows: InvRow[]; count: number; amount: number; due: number; tendered: number; change: number; refunds: number; discount: number; tabs: Record<string, number> }

const INV_TABS = [
  { key: "all", label: "History", icon: History, badge: "bg-teal-600" },
  { key: "credit", label: "Unpaid", icon: Wallet, badge: "bg-amber-600" },
  { key: "held", label: "Drafts", icon: PauseCircle, badge: "bg-sky-600" },
  { key: "return", label: "Returns", icon: Undo2, badge: "bg-rose-600" },
] as const;
const HISTORY_FILTERS = [["all", "All"], ["paid", "Paid"], ["credit", "Credit / due"], ["consolidated", "Consolidated"], ["offline", "Synced offline"], ["cancelled", "Cancelled"]] as const;
const VIEW_KEY = "pos.invoices.view";
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };
const monthStart = () => { const d = new Date(); d.setDate(1); return localDate(d); };
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** What the invoice is, for its pill and card tint. */
function invState(r: InvRow): { label: string; pill: string; tint: string; bar: string } {
  if (r.docstatus === 0) return { label: "Draft", pill: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300", tint: "from-sky-500/10", bar: "from-sky-400 to-blue-500" };
  if (r.docstatus === 2) return { label: "Cancelled", pill: "bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300", tint: "from-slate-500/10", bar: "from-slate-400 to-slate-500" };
  if (r.is_return) return { label: "Return", pill: "bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300", tint: "from-rose-500/10", bar: "from-rose-400 to-red-500" };
  if (r.due > 0.01) return { label: "Unpaid", pill: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300", tint: "from-amber-500/10", bar: "from-amber-400 to-orange-500" };
  if (r.consolidated_invoice) return { label: "Consolidated", pill: "bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300", tint: "from-indigo-500/10", bar: "from-indigo-400 to-violet-500" };
  return { label: "Paid", pill: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300", tint: "from-emerald-500/10", bar: "from-emerald-400 to-green-500" };
}

export function InvoicesDialog({ profile, money, online, onClose, onResume, initialTab = "all" }: {
  profile: PanelProfile; money: Money; online: boolean; onClose: () => void; onResume: (name: string) => void; initialTab?: string;
}) {
  const [tab, setTab] = useState<string>(initialTab);
  const [filter, setFilter] = useState<string>("all");
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(48);
  const [view, setView] = useState<"cards" | "list">(() => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; } });
  const [detail, setDetail] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);
  const status = tab === "all" ? filter : tab;
  const { data, mutate, isLoading, isValidating } = useFrappeGetCall<{ message: InvResult }>("mm_core.pos.invoices",
    online ? { pos_profile: profile.name, status, from_date: from, to_date: to, q, mine: mine ? 1 : 0, page_length: limit } : undefined,
    online ? `pos.inv.${profile.name}.${status}.${from}.${to}.${q}.${mine}.${limit}` : null, { keepPreviousData: true });
  const res = data?.message;
  const preset = (f: string, t = localDate()) => { setFrom(f); setTo(t); };
  const presets: [string, string][] = [["Today", localDate()], ["7 days", daysAgo(6)], ["30 days", daysAgo(29)], ["This month", monthStart()]];

  const remove = async (name: string) => {
    if (!window.confirm(`Delete held sale ${name}?`)) return;
    try { await postCall("mm_core.pos.delete_held", { name }); toast.success(`${name} deleted`); void mutate(); } catch (e) { toast.error(humanizeError(e)); }
  };

  if (returning) return <ReturnDialog name={returning} profile={profile} money={money} onClose={() => setReturning(null)} onDone={() => { setReturning(null); void mutate(); }} />;
  if (detail) return <InvoiceView name={detail} profile={profile} money={money} onBack={() => setDetail(null)} onReturn={(n) => { setDetail(null); setReturning(n); }} />;

  const actions = (r: InvRow, compact = false) => (
    <div className={cn("flex items-center gap-1", compact ? "justify-end" : "")}>
      {r.docstatus === 0 ? (<>
        <ActionBtn tone="sky" icon={PlayCircle} label="Resume" onClick={() => onResume(r.name)} compact={compact} />
        <ActionBtn tone="rose" icon={Trash2} label="Delete" onClick={() => void remove(r.name)} compact={compact} />
      </>) : r.docstatus === 1 ? (<>
        <ActionBtn tone="slate" icon={Eye} label="View" onClick={() => setDetail(r.name)} compact={compact} />
        <ActionBtn tone="teal" icon={Printer} label="Receipt" onClick={() => void reprint(r.name)} compact={compact} />
        {!r.is_return && <ActionBtn tone="rose" icon={Undo2} label="Return" onClick={() => setReturning(r.name)} compact={compact} />}
      </>) : null}
    </div>
  );

  return (
    <Dialog open onClose={onClose} size="xl" className="max-w-6xl sm:mt-6">
      {/* header */}
      <div className="-mx-5 -mt-5 mb-4 border-b border-border bg-gradient-to-r from-teal-500/10 via-transparent to-sky-500/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30 ring-1 ring-inset ring-white/20"><ReceiptText className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">Invoice Management</h2>
            <p className="text-xs text-muted-foreground">Track recent sales, collect unpaid balances and reopen saved work · {profile.name}</p>
          </div>
          <div className="flex rounded-lg bg-muted/70 p-0.5">
            {([["cards", LayoutGrid, "Cards"], ["list", List, "List"]] as const).map(([k, Icon, l]) => (
              <button key={k} type="button" onClick={() => setView(k)}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all", view === k ? "bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-3.5 w-3.5" />{l}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={!online}><RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} /> Refresh</Button>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {!online ? <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><CloudOff className="h-4 w-4" /> The invoice list needs the server. Offline sales are under Sync status.</p> : (
        <div className="space-y-4">
          {/* tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 sm:grid-cols-4">
            {INV_TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => { setTab(t.key); setLimit(48); }}
                className={cn("flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-bold uppercase tracking-wide transition-all",
                  tab === t.key ? "bg-card text-foreground shadow ring-1 ring-primary/40" : "text-foreground/65 hover:bg-card/60 hover:text-foreground")}>
                <t.icon className="h-3.5 w-3.5" />{t.label}
                <span className={cn("min-w-5 rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums text-white", t.badge)}>{res?.tabs?.[t.key] ?? "–"}</span>
              </button>
            ))}
          </div>

          {/* filters */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, customer or offline id…" className="h-10 pl-9" /></div>
            {tab === "all" && (
              <label className="space-y-0.5"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
                <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 w-44">{HISTORY_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
            )}
            <div className="rounded-xl border border-border bg-background/50 p-1.5">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="ml-1 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="Start date" />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="End date" />
              </div>
              <div className="mt-1 flex gap-1 pl-6">{presets.map(([l, f]) => (
                <button key={l} type="button" onClick={() => preset(f)}
                  className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", from === f && to === localDate() ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{l}</button>
              ))}</div>
            </div>
            <label className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only</label>
          </div>

          {/* summary tiles */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <SummaryTile label="Invoices" value={String(res?.count ?? "–")} hint="In this range and filter" tint="from-sky-500/15 to-blue-500/5 border-sky-500/20" icon={ReceiptText} tone="text-sky-600" />
            <SummaryTile label="Gross sales" value={money(res?.amount)} hint={res?.refunds ? `Returns ${money(res.refunds)}` : "Before returns"} tint="from-violet-500/15 to-indigo-500/5 border-violet-500/20" icon={TrendingUp} tone="text-violet-600" />
            <SummaryTile label="Tendered" value={money(res?.tendered)} hint="Received from customers" tint="from-emerald-500/15 to-green-500/5 border-emerald-500/20" icon={Banknote} tone="text-emerald-600" />
            <SummaryTile label="Change returned" value={money(res?.change)} hint="Cash given back" tint="from-rose-500/15 to-pink-500/5 border-rose-500/20" icon={Coins} tone="text-rose-600" />
            <SummaryTile label="Discounts" value={money(res?.discount)} hint="Bill + line discounts" tint="from-orange-500/15 to-amber-500/5 border-orange-500/20" icon={Percent} tone="text-orange-600" />
            <SummaryTile label="Outstanding" value={money(res?.due)} hint="Balances still pending" tint="from-amber-500/15 to-yellow-500/5 border-amber-500/20" icon={Wallet} tone="text-amber-600" />
          </div>

          {/* results */}
          <div className="max-h-[56vh] overflow-y-auto pr-1 scrollbar-thin">
            {isLoading && !res ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
            ) : !res?.rows.length ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-sm text-muted-foreground">
                <ReceiptText className="h-8 w-8 opacity-50" /> No invoices for these filters.
              </div>
            ) : view === "cards" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {res.rows.map((r) => {
                  const st = invState(r);
                  return (
                    <div key={r.name} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", st.bar)} />
                      <button type="button" onClick={() => r.docstatus === 1 && setDetail(r.name)} className={cn("bg-gradient-to-b to-transparent p-4 pb-3 text-left", st.tint)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-mono text-[13px] font-bold" title={r.name}>{r.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", st.pill)}>{st.label}</span>
                              {r.mm_offline_id && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-600 ring-1 ring-inset ring-sky-500/20">Offline</span>}
                              {r.coupon_code && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-inset ring-violet-500/20">{r.coupon_code}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
                            <div className={cn("text-lg font-bold leading-tight tabular-nums", r.is_return && "text-rose-600")}>{money(r.total)}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.customer_name}</span></div>
                      </button>
                      <div className="grid grid-cols-2 gap-px border-y border-border bg-border/60 text-[11px]">
                        <Cell label="Posted" value={`${fmtDate(r.posting_date)} · ${String(r.posting_time).slice(0, 5)}`} />
                        <Cell label="Tendered" value={money(r.paid_amount)} tone="text-emerald-600 dark:text-emerald-400" />
                        <Cell label="Change" value={money(r.change_amount ?? 0)} tone={(r.change_amount ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : undefined} />
                        <Cell label="Outstanding" value={money(r.due)} tone={r.due > 0.01 ? "text-rose-600 dark:text-rose-400" : undefined} />
                        <Cell label="Discount" value={r.discount ? money(r.discount) : "—"} tone={r.discount ? "text-amber-600 dark:text-amber-400" : undefined} />
                        <Cell label="Items" value={`${r.line_count ?? 0} line${r.line_count === 1 ? "" : "s"} · ${Math.abs(r.total_qty ?? 0)} qty`} />
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0 truncate text-[10px] text-muted-foreground" title={`${r.cashier} · ${r.modes ?? ""}`}>
                          {r.line_count ?? 0} item{r.line_count === 1 ? "" : "s"}{r.modes ? ` · ${r.modes}` : ""}
                        </span>
                        {actions(r, true)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                    <tr><th className="px-3 py-2 text-left">Invoice</th><th className="text-left">Customer</th><th className="text-left">Posted</th><th className="text-left">Paid by</th>
                      <th className="text-right">Total</th><th className="text-right">Discount</th><th className="text-right">Tendered</th><th className="text-right">Due</th><th className="px-3 text-left">Status</th><th /></tr>
                  </thead>
                  <tbody>{res.rows.map((r, i) => {
                    const st = invState(r);
                    return (
                      <tr key={r.name} className={cn("border-t border-border transition-colors hover:bg-primary/10", i % 2 ? "bg-muted/40" : "bg-card")}>
                        <td className="px-3 py-2.5"><button type="button" className="font-mono text-[13px] font-semibold hover:text-primary hover:underline" onClick={() => r.docstatus === 1 && setDetail(r.name)}>{r.name}</button></td>
                        <td className="max-w-[180px] truncate text-[13px] font-medium">{r.customer_name}</td>
                        <td className="whitespace-nowrap text-[13px] text-foreground/75">{fmtDate(r.posting_date)} {String(r.posting_time).slice(0, 5)}</td>
                        <td className="max-w-[120px] truncate text-[13px] text-foreground/75">{r.modes || "—"}</td>
                        <td className={cn("text-right font-semibold tabular-nums", r.is_return && "text-rose-600")}>{money(r.total)}</td>
                        <td className={cn("text-right tabular-nums", r.discount ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{r.discount ? money(r.discount) : "—"}</td>
                        <td className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.paid_amount)}</td>
                        <td className={cn("text-right tabular-nums", r.due > 0.01 ? "font-semibold text-rose-600" : "text-muted-foreground")}>{r.due > 0.01 ? money(r.due) : "—"}</td>
                        <td className="px-3"><span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", st.pill)}>{st.label}</span></td>
                        <td className="whitespace-nowrap px-2">{actions(r, true)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
          {res && res.rows.length < res.count && (
            <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + 48)}>Load more · {res.count - res.rows.length} remaining</Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function SummaryTile({ label, value, hint, tint, icon: Icon, tone }: { label: string; value: string; hint: string; tint: string; icon: typeof Wifi; tone: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-card bg-gradient-to-br p-3.5", tint)}>
      <Icon className={cn("absolute right-3 top-3 h-5 w-5 opacity-60", tone)} />
      <div className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">{label}</div>
      <div className="mt-1 truncate text-xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">{label}</div>
      <div className={cn("mt-0.5 truncate text-[13px] font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

const ACTION_TONE = {
  slate: "text-slate-600 hover:bg-slate-500/10 dark:text-slate-300", teal: "text-teal-600 hover:bg-teal-500/10 dark:text-teal-300",
  sky: "text-sky-600 hover:bg-sky-500/10 dark:text-sky-300", rose: "text-rose-600 hover:bg-rose-500/10 dark:text-rose-300",
};
function ActionBtn({ tone, icon: Icon, label, onClick, compact }: { tone: keyof typeof ACTION_TONE; icon: typeof Wifi; label: string; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors", ACTION_TONE[tone])}>
      <Icon className="h-3.5 w-3.5" />{!compact && label}
    </button>
  );
}

async function reprint(name: string) {
  try { printReceipt(await getCall<ReceiptData>("mm_core.pos.receipt", { name }), loadPrinter(), true); } catch (e) { toast.error(humanizeError(e)); }
}

function InvoiceView({ name, profile, money, onBack, onReturn }: { name: string; profile: PanelProfile; money: Money; onBack: () => void; onReturn: (n: string) => void }) {
  const { data } = useFrappeGetCall<{ message: ReceiptData & { docstatus: number } }>("mm_core.pos.receipt", { name }, `pos.receipt.${name}`);
  const r = data?.message;
  return (
    <Dialog open onClose={onBack} title={name} description={r ? `${r.customer_name} · ${r.posting_date} ${r.posting_time.slice(0, 5)} · ${r.cashier}` : undefined} size="lg">
      {!r ? <Skeleton className="h-80" /> : (
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <ReceiptPreview html={receiptHtml(r, { ...loadPrinter(), paper: "80" })} />
          <div className="space-y-2">
            <div className="rounded-lg bg-muted/50 p-3 text-center"><div className="text-[11px] text-muted-foreground">Total</div><div className="text-2xl font-bold tabular-nums">{money(r.rounded_total || r.grand_total)}</div>
              {(r.outstanding_amount ?? 0) > 0.01 && <div className="text-xs font-medium text-rose-600">Due {money(r.outstanding_amount)}</div>}</div>
            <Button className="w-full" onClick={() => printReceipt(r, loadPrinter(), true)}><Printer className="h-4 w-4" /> Reprint (thermal)</Button>
            <Button variant="outline" className="w-full" onClick={() => window.open(printUrl(name, profile.print_format), "_blank")}><FileText className="h-4 w-4" /> A4 print format</Button>
            {r.docstatus === 1 && !r.is_return && <Button variant="outline" className="w-full" onClick={() => onReturn(name)}><Undo2 className="h-4 w-4" /> Return items</Button>}
            {r.offline_id && <p className="text-[11px] text-muted-foreground">Rung up offline · {r.offline_id.slice(0, 8)}</p>}
            <Button variant="ghost" className="w-full" onClick={onBack}>Back to list</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ returns
interface Returnable { name: string; customer_name: string; posting_date: string; payments: string[]; items: { name: string; item_code: string; item_name: string; qty: number; uom: string; rate: number; returnable: number }[] }

export function ReturnDialog({ name, profile, money, onClose, onDone }: { name: string; profile: PanelProfile; money: Money; onClose: () => void; onDone: () => void }) {
  const { data } = useFrappeGetCall<{ message: Returnable }>("mm_core.pos.returnable_items", { name }, `pos.returnable.${name}`);
  const inv = data?.message;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!inv) return;
    setQty(Object.fromEntries(inv.items.map((i) => [i.name, i.returnable])));
    setMode(inv.payments[0] ?? profile.payments[0]?.mode_of_payment ?? "");
  }, [inv, profile.payments]);
  const refund = (inv?.items ?? []).reduce((s, i) => s + (qty[i.name] ?? 0) * i.rate, 0);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ name: string; grand_total: number }>("mm_core.pos.return_invoice", { name, items: JSON.stringify(qty), mode_of_payment: mode });
      toast.success(`Returned as ${r.name} — refund ${money(Math.abs(r.grand_total))}`);
      const settings = loadPrinter();
      if (settings.autoPrint) void getCall<ReceiptData>("mm_core.pos.receipt", { name: r.name }).then((rc) => printReceipt(rc, settings));
      onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Return ${name}`} description={inv ? `${inv.customer_name} · ${inv.posting_date}` : undefined} size="lg">
      {!inv ? <Skeleton className="h-40" /> : (
        <div className="space-y-4">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="text-left">Item</th><th className="text-right">Sold</th><th className="text-right">Returnable</th><th className="text-right">Rate</th><th className="text-right">Return qty</th></tr></thead>
            <tbody>{inv.items.map((i) => (
              <tr key={i.name} className="border-t border-border">
                <td className="py-2"><div className="font-medium">{i.item_name}</div><div className="text-[11px] text-muted-foreground">{i.item_code}</div></td>
                <td className="text-right tabular-nums">{i.qty} {i.uom}</td><td className="text-right tabular-nums">{i.returnable}</td><td className="text-right tabular-nums">{money(i.rate)}</td>
                <td className="text-right"><Input type="number" min={0} max={i.returnable} disabled={i.returnable <= 0} value={qty[i.name] ?? 0} className="ml-auto h-8 w-24 text-right"
                  onChange={(e) => setQty((q) => ({ ...q, [i.name]: Math.max(0, Math.min(i.returnable, Number(e.target.value) || 0)) }))} aria-label={`Return qty ${i.item_name}`} /></td>
              </tr>))}</tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">Refund via
              <Select value={mode} onChange={(e) => setMode(e.target.value)} className="h-8 w-40">{profile.payments.map((m) => <option key={m.mode_of_payment}>{m.mode_of_payment}</option>)}</Select></label>
            <span className="text-sm">Refund ≈ <b className="tabular-nums text-rose-600">{money(refund)}</b> <span className="text-[11px] text-muted-foreground">(before bill discount / tax)</span></span>
          </div>
          <Button className="w-full" disabled={busy || refund <= 0} onClick={() => void submit()}><Undo2 className="h-4 w-4" /> Process return</Button>
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ sync status
const ago = (isoStr?: string) => {
  if (!isoStr) return "never";
  const m = Math.max(0, Math.round((Date.now() - new Date(isoStr.replace(" ", "T")).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export function SyncDialog({ sync, profile, money, bundle, onRefreshBundle, onClose }: {
  sync: SyncState; profile: PanelProfile; money: Money; bundle?: OfflineBundle; onRefreshBundle: () => Promise<void>; onClose: () => void;
}) {
  const [synced, setSynced] = useState<{ offline_id: string; name: string; at: string; total: number; customer_name: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { void kvGet<typeof synced>("synced").then((s) => setSynced(s ?? [])); }, [sync.queue.length, sync.lastSync]);
  const failed = sync.queue.filter((q) => q.status === "failed").length;
  const waiting = sync.queue.length - failed;
  const healthy = sync.online && !failed;
  return (
    <Dialog open onClose={onClose} size="xl" className="max-w-3xl sm:mt-8">
      {/* header */}
      <div className={cn("relative -mx-5 -mt-5 mb-5 overflow-hidden px-5 py-5 text-white",
        healthy ? "bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-700" : !sync.online ? "bg-gradient-to-br from-rose-600 via-red-600 to-orange-600" : "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600")}>
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30 backdrop-blur">
            {sync.syncing ? <Loader2 className="h-7 w-7 animate-spin" /> : sync.online ? <Wifi className="h-7 w-7" /> : <CloudOff className="h-7 w-7" />}
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" /><span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-white" /></span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold leading-tight">{sync.syncing ? "Syncing…" : healthy ? "All synced" : !sync.online ? "Working offline" : `${failed} sale${failed === 1 ? "" : "s"} need attention`}</h2>
            <p className="text-sm text-white/85">Sales rung up offline stay on this device and post automatically when the server is reachable.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="space-y-5">
        {/* stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SyncStat icon={sync.online ? Wifi : CloudOff} label="Connection" value={sync.online ? "Online" : "Offline"} cls={sync.online ? "from-emerald-500/15 border-emerald-500/30 text-emerald-600" : "from-rose-500/15 border-rose-500/30 text-rose-600"} />
          <SyncStat icon={PauseCircle} label="Waiting" value={String(waiting)} cls={waiting ? "from-amber-500/15 border-amber-500/30 text-amber-600" : "from-slate-500/10 border-border text-muted-foreground"} />
          <SyncStat icon={AlertTriangle} label="Failed" value={String(failed)} cls={failed ? "from-rose-500/15 border-rose-500/30 text-rose-600" : "from-slate-500/10 border-border text-muted-foreground"} />
          <SyncStat icon={CheckCircle2} label="Last sync" value={sync.lastSync ? new Date(sync.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Never"} sub={ago(sync.lastSync)} cls="from-sky-500/15 border-sky-500/30 text-sky-600" />
        </div>

        {/* offline data */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-indigo-500/[0.08] to-transparent p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"><Database className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">Offline data · {profile.name}</div>
              <div className="text-xs text-muted-foreground">{bundle ? `Cached ${ago(bundle.generated_at)} · ${new Date(bundle.generated_at.replace(" ", "T")).toLocaleString()}` : "Nothing cached on this device yet"}</div>
            </div>
            <Button variant="outline" size="sm" disabled={!sync.online || refreshing} onClick={() => { setRefreshing(true); void onRefreshBundle().finally(() => setRefreshing(false)); }}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh data</Button>
            <button type="button" disabled={!sync.online || sync.syncing || !sync.queue.length} onClick={() => void sync.sync()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-violet-600 px-3.5 text-sm font-semibold text-white shadow-md shadow-primary/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none">
              {sync.syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now</button>
          </div>
          {bundle && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[["Items", bundle.items.length, "from-sky-500 to-blue-600"], ["Customers", bundle.customers.length, "from-emerald-500 to-green-600"], ["Tax rows", bundle.taxes.length, "from-amber-400 to-orange-500"]].map(([l, n, g]) => (
                <div key={String(l)} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5">
                  <span className={cn("h-8 w-1.5 rounded-full bg-gradient-to-b", String(g))} />
                  <div><div className="text-lg font-extrabold leading-tight tabular-nums">{Number(n).toLocaleString()}</div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{l}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
        {sync.lastError && <p className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300"><AlertTriangle className="h-4 w-4" />{sync.lastError}</p>}

        {/* queue */}
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">On this device</span><span className="h-px flex-1 bg-border" /></div>
          {sync.queue.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] py-5 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /> Everything is synced</div>
          ) : (
            <ul className="space-y-2">{sync.queue.map((q) => (
              <li key={q.offline_id} className={cn("relative flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border p-3", q.status === "failed" ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]")}>
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", q.status === "failed" ? "bg-rose-500" : "bg-amber-500")} />
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-white", q.status === "failed" ? "bg-gradient-to-br from-rose-500 to-red-600" : "bg-gradient-to-br from-amber-400 to-orange-500")}>{q.status === "failed" ? <AlertTriangle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{q.customer_name} · <span className="tabular-nums">{money(q.total)}</span></div>
                  <div className="text-[11px] text-muted-foreground">{new Date(q.created).toLocaleString()} · {q.offline_id.slice(0, 8)}{q.attempts ? ` · ${q.attempts} attempt(s)` : ""}</div>
                  {q.error && <div className="mt-0.5 text-[11px] font-medium text-rose-600">{q.error}</div>}</div>
                <Button size="sm" variant="ghost" onClick={() => printReceipt(q.receipt, loadPrinter(), true)} title="Reprint"><Printer className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-rose-600" title="Discard"
                  onClick={() => { if (window.confirm("Discard this offline sale? It will never reach the server — refund or re-ring it.")) void sync.discard(q.offline_id); }}><Trash2 className="h-4 w-4" /></Button>
              </li>))}</ul>
          )}
        </div>

        {/* recently synced */}
        {synced.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Recently synced</span><span className="h-px flex-1 bg-border" /><span className="text-[11px] text-muted-foreground">{synced.length}</span></div>
            <ol className="relative max-h-56 space-y-1 overflow-y-auto pr-1 scrollbar-thin before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-border">
              {synced.slice(0, 25).map((s) => (
                <li key={s.offline_id} className="relative flex items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-muted/50">
                  <span className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-4 ring-card"><CheckCircle2 className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><div className="truncate font-mono text-[13px] font-semibold">{s.name}</div><div className="truncate text-[11px] text-muted-foreground">{s.customer_name}</div></div>
                  <div className="text-right"><div className="text-sm font-bold tabular-nums">{money(s.total)}</div><div className="text-[10px] text-muted-foreground">{new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function SyncStat({ icon: Icon, label, value, sub, cls }: { icon: typeof Wifi; label: string; value: string; sub?: string; cls: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card bg-gradient-to-br to-transparent p-3", cls)}>
      <Icon className="h-5 w-5" />
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-foreground/65">{label}</div>
      <div className="text-xl font-extrabold leading-tight text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ collect customer dues
export function ReceiveDuesDialog({ customer, customerName, outstanding, profile, money, currency, cashier, company, onClose, onDone }: {
  customer: string; customerName: string; outstanding: number; profile: PanelProfile; money: Money; currency: string; cashier: string; company: CompanyHeader;
  onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState(outstanding);
  const [mode, setMode] = useState(profile.payments.find((m) => m.default)?.mode_of_payment ?? profile.payments[0]?.mode_of_payment ?? "");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ name: string; allocated: number; unallocated: number }>("mm_core.pos.receive_payment", { customer, amount, mode_of_payment: mode, reference_no: ref || undefined });
      toast.success(`Payment ${r.name} received`);
      printHtml(paymentReceiptHtml({ name: r.name, customer: customerName, amount, mode, reference_no: ref, allocated: r.allocated, currency, cashier, company }, loadPrinter()));
      onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Receive payment" description={`${customerName} owes ${money(outstanding)}. Allocated to the oldest open invoices.`} size="sm">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Amount</span><Input type="number" min={0} autoFocus value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="text-right text-lg" /></label>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Mode</span>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>{profile.payments.map((m) => <option key={m.mode_of_payment}>{m.mode_of_payment}</option>)}</Select></label>
        {!/cash/i.test(mode) && <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Reference / slip no</span><Input value={ref} onChange={(e) => setRef(e.target.value)} /></label>}
        <p className="text-[11px] text-muted-foreground">Credit sales from an open shift become invoices once the shift closes; until then the amount stays on account.</p>
        <Button type="submit" className="w-full" disabled={busy || amount <= 0}><HandCoins className="h-4 w-4" /> Receive {money(amount)}</Button>
      </form>
    </Dialog>
  );
}
