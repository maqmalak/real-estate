/**
 * Sales operations hub (phase B): approvals inbox, plot transfers, booking cancellations & refunds, plot merges,
 * late-payment surcharges & waivers, commissions and recovery (ERPNext Dunning). Every action goes through the
 * realestate controllers, which post standard ERPNext documents (Sales Invoice, Credit Note, Payment Entry,
 * Journal Entry, Dunning).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, BadgePercent, Ban, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Combine, FileWarning, HandCoins, Inbox,
  Loader2, Repeat2, Search, ShieldCheck, Sparkles, Users, XCircle, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge, type Tone } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/re/components/ui/card";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get, getList, post } from "@/re/lib/api";
import { date, money, todayISO } from "@/re/lib/format";
import { cn, recordUrl } from "@/re/lib/utils";

// ------------------------------------------------------------------ types
interface Overview {
  pending: Record<string, number>;
  transfers_month: number;
  transfer_fees: number;
  cancellations: number;
  refunds: number;
  deductions: number;
  merges: number;
  surcharge: { amount: number; paid_amount: number; waived_amount: number; outstanding_amount: number };
  commission: { Accrued: number; Payable: number; Paid: number };
  dunnings: number;
  dunning_outstanding: number;
}
type Row = Record<string, string | number | null | string[] | boolean>;
interface Approval extends Row { doctype: string; name: string; workflow_state: string; actions: string[]; owner: string; modified: string }
interface Lists { transfers: Row[]; cancellations: Row[]; merges: Row[]; waivers: Row[]; reallotments: Row[] }
interface TransferPreview { booking: string; plot: string; plot_size: string; customer: string; customer_name: string; net_price: number; paid: number;
  outstanding: number; overdue: number; society_dues: number; clear: boolean; fee: number; status: string }
interface CxlPreview { booking: string; plot: string; customer_name: string; net_price: number; paid: number; deduction_percent: number; deduction: number;
  refund: number; credit_note: number; status: string; commissions: number }
interface MergePreview { plots: { name: string; block: string; plot_size: string; area_marla: number; list_price: number; status: string; customer_name: string | null }[];
  ok: boolean; area_marla: number; list_price: number; suggested_no: string; suggested_size: string | null; reason: string | null }
interface CommissionRow { name: string; booking: string; plot: string; beneficiary_type: string; beneficiary: string; rate: number; amount: number; status: string; paid_on: string | null }
interface Commissions { rows: CommissionRow[]; summary: { beneficiary: string; type: string; Accrued: number; Payable: number; Paid: number; Cancelled: number }[] }
interface Recovery {
  dunnings: { name: string; customer: string; customer_name: string; posting_date: string; total_outstanding: number; dunning_amount: number; grand_total: number }[];
  surcharges: { name: string; booking: string; customer_name: string; month_label: string; amount: number; outstanding_amount: number; status: string }[];
}

const DOC_LABEL: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  "RE Plot Transfer": { label: "Plot transfer", icon: Repeat2, tone: "blue" },
  "RE Booking Cancellation": { label: "Cancellation & refund", icon: Ban, tone: "red" },
  "RE Plot Merge": { label: "Plot merge", icon: Combine, tone: "violet" },
  "RE Surcharge Waiver": { label: "Surcharge waiver", icon: BadgePercent, tone: "amber" },
  "RE Booking": { label: "Discount approval", icon: BadgePercent, tone: "orange" },
};
const STATE_TONE: Record<string, Tone> = { Draft: "gray", "Pending Approval": "amber", Approved: "green", Rejected: "red", "Discount Approval": "orange" };
const slug = (dt: string) => dt.toLowerCase().replace(/ /g, "-");
const short = (v: unknown) => money(Number(v ?? 0), { compact: true });

// ------------------------------------------------------------------ building blocks
function Stat({ icon: Icon, label, value, sub, gradient }: { icon: LucideIcon; label: string; value: string; sub?: string; gradient: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-xl", gradient)} />
      {/* icon above the text on phones (two tiles per row), beside it from sm up */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-white shadow", gradient)}><Icon className="size-5" /></div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">{label}</p>
          <p className="truncate text-xl font-bold">{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, icon: Icon, children, count }: { active: boolean; onClick: () => void; icon: LucideIcon; children: ReactNode; count?: number }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
      active ? "border-transparent bg-primary text-primary-foreground shadow" : "border-input bg-card hover:border-primary/60")}>
      <Icon className="size-4" />{children}
      {count ? <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/25" : "bg-amber-500 text-white")}>{count}</span> : null}
    </button>
  );
}

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-4 flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
            i < current ? "bg-emerald-500 text-white" : i === current ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground")}>
            {i < current ? "✓" : i + 1}
          </span>
          <span className={cn("hidden text-xs font-medium sm:block", i === current ? "text-foreground" : "text-muted-foreground")}>{s}</span>
          {i < steps.length - 1 && <span className={cn("h-0.5 flex-1 rounded", i < current ? "bg-emerald-500" : "bg-muted")} />}
        </li>
      ))}
    </ol>
  );
}

function Check({ ok, label, value }: { ok: boolean; label: string; value?: string }) {
  return (
    <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm", ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5")}>
      <span className="flex items-center gap-2">{ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}{label}</span>
      {value && <span className="font-semibold">{value}</span>}
    </div>
  );
}

function Amount({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" | "muted" }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", tone === "green" && "text-emerald-600 dark:text-emerald-400", tone === "red" && "text-red-600 dark:text-red-400")}>{money(value)}</p>
    </div>
  );
}

/** Type-ahead picker over a DocType (permission-aware list). */
function SearchPick<T extends { name: string }>({ doctype, fields, filters, search, label, render, onPick, placeholder }: {
  doctype: string; fields: string[]; filters?: [string, string, string | number | (string | number)[]][]; search: string[]; label: string;
  render: (row: T) => ReactNode; onPick: (row: T) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["pick", doctype, q, filters],
    queryFn: () => getList<T>(doctype, { fields, filters, orFilters: q ? search.map((f) => [f, "like", `%${q}%`] as [string, string, string]) : undefined, limit: 8, orderBy: "modified desc" }),
  });
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? "Search…"} autoFocus />
        {isFetching && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {data?.map((r) => (
          <button key={r.name} type="button" onClick={() => onPick(r)} className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5">
            {render(r)}<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        {data && !data.length && <p className="p-3 text-sm text-muted-foreground">No matches</p>}
      </div>
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => ["ops-overview", "ops-approvals", "ops-lists", "ops-commissions", "ops-recovery"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
}

function useCreate(doctype: string, done: () => void) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => post<{ name: string; state: string }>("realestate.operations.create", { doctype, values }),
    onSuccess: (r) => { toast.success(`${r.name} sent for approval`); refresh(); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ------------------------------------------------------------------ wizards
interface BookingRow { name: string; plot: string; customer_name: string; status: string; net_price: number; outstanding_amount: number }
const ACTIVE_BOOKINGS: [string, string, string | number | (string | number)[]][] = [["docstatus", "=", 1], ["status", "!=", "Cancelled"]];
const bookingRow = (b: BookingRow) => (
  <span className="min-w-0"><b>{b.plot}</b> · {b.customer_name}<span className="block text-xs text-muted-foreground">{b.name} · {b.status} · balance {short(b.outstanding_amount)}</span></span>
);

function TransferWizard({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string }) {
  const [step, setStep] = useState(0);
  const [booking, setBooking] = useState(initial ?? "");
  const [to, setTo] = useState<{ name: string; customer_name: string } | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const preview = useQuery({ queryKey: ["ops-tp", booking], enabled: Boolean(booking), queryFn: () => get<TransferPreview>("realestate.operations.transfer_preview", { booking }) });
  useEffect(() => { if (initial) { setBooking(initial); setStep(1); } }, [initial]);
  useEffect(() => { if (preview.data && fee === null) setFee(preview.data.fee); }, [preview.data, fee]);
  const reset = () => { setStep(0); setBooking(""); setTo(null); setFee(null); setNotes(""); onClose(); };
  const create = useCreate("RE Plot Transfer", reset);
  const p = preview.data;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()} title="Transfer a plot">
      <Stepper steps={["Booking", "No-dues check", "New owner", "Review"]} current={step} />
      {step === 0 && (
        <SearchPick<BookingRow> doctype="RE Booking" label="Booking to transfer" fields={["name", "plot", "customer_name", "status", "net_price", "outstanding_amount"]}
          filters={ACTIVE_BOOKINGS} search={["name", "plot", "customer_name"]} render={bookingRow} placeholder="Plot no, customer or booking"
          onPick={(b) => { setBooking(b.name); setStep(1); }} />
      )}
      {step === 1 && (preview.isLoading || !p ? <Skeleton className="h-40" /> : (
        <div className="space-y-2">
          <p className="text-sm"><b>{p.plot}</b> ({p.plot_size}) — current owner <b>{p.customer_name}</b></p>
          <Check ok={p.overdue < 0.5} label="No overdue installments or surcharges" value={short(p.overdue)} />
          <Check ok={p.society_dues < 0.5} label="Society bills paid" value={short(p.society_dues)} />
          <div className="grid grid-cols-3 gap-2 pt-1"><Amount label="Price" value={p.net_price} /><Amount label="Paid" value={p.paid} tone="green" /><Amount label="Moves to new owner" value={p.outstanding} /></div>
          {!p.clear && <p className="rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">Clear the dues first — a transfer needs a no-dues check.</p>}
        </div>
      ))}
      {step === 2 && (
        <SearchPick<{ name: string; customer_name: string; mobile_no: string | null }> doctype="Customer" label="New owner" fields={["name", "customer_name", "mobile_no"]}
          filters={[["disabled", "=", 0], ["name", "!=", p?.customer ?? ""]]} search={["customer_name", "mobile_no", "name"]}
          render={(c) => <span><b>{c.customer_name}</b><span className="block text-xs text-muted-foreground">{c.mobile_no ?? ""}</span></span>}
          onPick={(c) => { setTo(c); setStep(3); }} />
      )}
      {step === 3 && p && to && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div><p className="text-xs text-muted-foreground">From</p><p className="font-semibold">{p.customer_name}</p></div>
            <ArrowRight className="size-5 text-primary" />
            <div className="text-right"><p className="text-xs text-muted-foreground">To</p><p className="font-semibold">{to.customer_name}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="t-fee">Transfer fee (PKR)</Label><Input id="t-fee" inputMode="numeric" value={fee ?? 0} onChange={(e) => setFee(Number(e.target.value.replace(/\D/g, "")) || 0)} /></div>
            <Amount label="Balance taken over" value={p.outstanding} />
          </div>
          <div><Label htmlFor="t-notes">Notes</Label><Input id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. sold to a relative" /></div>
          <p className="text-xs text-muted-foreground">On approval: fee invoice to the current owner, credit note for the balance, a new invoice with the remaining installments to the new owner.</p>
        </div>
      )}
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : reset())}><ChevronLeft /> {step ? "Back" : "Cancel"}</Button>
        {step === 1 && <Button disabled={!p?.clear} onClick={() => setStep(2)}>Continue <ChevronRight /></Button>}
        {step === 3 && <Button disabled={create.isPending} onClick={() => create.mutate({ booking, to_customer: to?.name, transfer_fee: fee, notes })}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Submit for approval</Button>}
      </div>
    </Dialog>
  );
}

function CancelWizard({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string }) {
  const [booking, setBooking] = useState(initial ?? "");
  const [pct, setPct] = useState<number | null>(null);
  const [reason, setReason] = useState("Customer Request");
  const [mode, setMode] = useState("Bank Transfer");
  useEffect(() => { if (initial) setBooking(initial); }, [initial]);
  const preview = useQuery({ queryKey: ["ops-cp", booking, pct], enabled: Boolean(booking),
    queryFn: () => get<CxlPreview>("realestate.operations.cancellation_preview", { booking, deduction_percent: pct ?? undefined }) });
  useEffect(() => { if (preview.data && pct === null) setPct(preview.data.deduction_percent); }, [preview.data, pct]);
  const reset = () => { setBooking(""); setPct(null); onClose(); };
  const create = useCreate("RE Booking Cancellation", reset);
  const p = preview.data;
  const share = p && p.paid ? (p.deduction * 100) / p.paid : 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()} title="Cancel a booking">
      <Stepper steps={["Booking", "Settlement"]} current={booking ? 1 : 0} />
      {!booking ? (
        <SearchPick<BookingRow> doctype="RE Booking" label="Booking to cancel" fields={["name", "plot", "customer_name", "status", "net_price", "outstanding_amount"]}
          filters={ACTIVE_BOOKINGS} search={["name", "plot", "customer_name"]} render={bookingRow} onPick={(b) => setBooking(b.name)} placeholder="Plot no, customer or booking" />
      ) : !p ? <Skeleton className="h-48" /> : (
        <div className="space-y-3">
          <p className="text-sm"><b>{p.plot}</b> — {p.customer_name} <Badge tone={p.status === "Overdue" ? "red" : "blue"}>{p.status}</Badge></p>
          <div>
            <Label htmlFor="c-pct">Deduction: {pct ?? 0}% of the price</Label>
            <input id="c-pct" type="range" min={0} max={25} step={0.5} value={pct ?? 0} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Amount label="Price" value={p.net_price} /><Amount label="Paid" value={p.paid} /><Amount label="Deduction kept" value={p.deduction} tone="red" /><Amount label="Refund" value={p.refund} tone="green" />
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted" title="Of what was paid: deduction vs refund">
            <div className="flex h-full"><div className="bg-red-500" style={{ width: `${share}%` }} /><div className="bg-emerald-500" style={{ width: `${100 - share}%` }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="c-reason">Reason</Label><Select id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)}>{["Customer Request", "Non-payment", "Plot Change", "Other"].map((r) => <option key={r}>{r}</option>)}</Select></div>
            <div><Label htmlFor="c-mode">Refund by</Label><Select id="c-mode" value={mode} onChange={(e) => setMode(e.target.value)}>{["Bank Transfer", "Cheque", "Cash"].map((m) => <option key={m}>{m}</option>)}</Select></div>
          </div>
          <p className="text-xs text-muted-foreground">On approval: credit notes clear the balance, the refund is paid by Payment Entry, the plot becomes available{p.commissions ? `, ${p.commissions} unpaid commission(s) are cancelled` : ""}.</p>
        </div>
      )}
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" onClick={() => (booking && !initial ? setBooking("") : reset())}><ChevronLeft /> {booking && !initial ? "Back" : "Cancel"}</Button>
        {p && <Button variant="destructive" disabled={create.isPending} onClick={() => create.mutate({ booking, deduction_percent: pct, reason, refund_mode: mode })}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Submit for approval</Button>}
      </div>
    </Dialog>
  );
}

function MergeWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [block, setBlock] = useState("A Block");
  const [picked, setPicked] = useState<string[]>([]);
  const [no, setNo] = useState("");
  const plots = useQuery({ queryKey: ["ops-merge-plots", block], queryFn: () => getList<{ name: string; plot_size: string; status: string; customer_name: string | null }>("RE Plot",
    { fields: ["name", "plot_size", "status", "customer_name"], filters: [["block", "=", block], ["status", "in", ["Available", "Sold"]]], orderBy: "plot_no asc", limit: 300 }) });
  const preview = useQuery({ queryKey: ["ops-mp", picked], enabled: picked.length > 1, queryFn: () => get<MergePreview>("realestate.operations.merge_preview", { plots: JSON.stringify(picked) }) });
  useEffect(() => { if (preview.data) setNo(preview.data.suggested_no); }, [preview.data]);
  const reset = () => { setPicked([]); setNo(""); onClose(); };
  const create = useCreate("RE Plot Merge", reset);
  const p = preview.data;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()} title="Merge plots">
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="m-block">Block</Label><Select id="m-block" value={block} onChange={(e) => { setBlock(e.target.value); setPicked([]); }}>{["A Block", "B Block", "C Block", "D Block"].map((b) => <option key={b}>{b}</option>)}</Select></div>
        <div><Label htmlFor="m-no">New plot no.</Label><Input id="m-no" value={no} onChange={(e) => setNo(e.target.value)} placeholder="e.g. A-118/119" /></div>
      </div>
      <p className="mt-3 text-sm font-semibold">Pick adjacent plots ({picked.length} selected)</p>
      <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-2">
        {plots.data?.map((pl) => (
          <button key={pl.name} type="button" title={`${pl.plot_size} · ${pl.status}${pl.customer_name ? ` · ${pl.customer_name}` : ""}`}
            onClick={() => setPicked((s) => (s.includes(pl.name) ? s.filter((x) => x !== pl.name) : [...s, pl.name]))}
            className={cn("rounded-md border px-2 py-1 text-xs font-medium", picked.includes(pl.name) ? "border-primary bg-primary text-primary-foreground" : pl.status === "Sold" ? "border-violet-400/50 bg-violet-500/10" : "border-emerald-400/50 bg-emerald-500/10")}>
            {pl.name.split("-")[1]}
          </button>
        ))}
      </div>
      {p && (
        <div className="mt-3 space-y-2">
          {p.ok ? (
            <div className="grid grid-cols-3 gap-2"><Amount label="Combined price" value={p.list_price} /><div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Area</p><p className="text-lg font-bold">{p.area_marla} Marla</p></div>
              <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Size</p><p className="text-lg font-bold">{p.suggested_size}</p></div></div>
          ) : <p className="rounded-lg bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">{p.reason}</p>}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={reset}>Cancel</Button>
        <Button disabled={!p?.ok || !no || create.isPending} onClick={() => create.mutate({ new_plot_no: no, plot_size: p?.suggested_size, plots: picked.map((x) => ({ plot: x })) })}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Combine />} Submit for approval</Button>
      </div>
    </Dialog>
  );
}

function WaiveDialog({ surcharge, onClose }: { surcharge: Recovery["surcharges"][number] | null; onClose: () => void }) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  useEffect(() => { if (surcharge) setAmount(surcharge.outstanding_amount); }, [surcharge]);
  const create = useCreate("RE Surcharge Waiver", () => { setReason(""); onClose(); });
  return (
    <Dialog open={Boolean(surcharge)} onOpenChange={(o) => !o && onClose()} title="Waive late-payment surcharge">
      {surcharge && (
        <div className="space-y-3">
          <p className="text-sm">{surcharge.customer_name} · {surcharge.month_label} · outstanding <b>{money(surcharge.outstanding_amount)}</b></p>
          <div><Label htmlFor="w-amt">Waive amount</Label><Input id="w-amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)} /></div>
          <div><Label htmlFor="w-reason">Reason (required)</Label><Input id="w-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. first delay, medical emergency" /></div>
          <p className="text-xs text-muted-foreground">On approval a Credit Note reduces the surcharge invoice.</p>
          <div className="flex justify-end"><Button disabled={!reason || !amount || create.isPending} onClick={() => create.mutate({ surcharge: surcharge.name, amount, reason })}><ShieldCheck /> Submit for approval</Button></div>
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ tabs
function Approvals() {
  const refresh = useRefresh();
  const { data, isLoading } = useQuery({ queryKey: ["ops-approvals"], queryFn: () => get<Approval[]>("realestate.operations.approvals") });
  const act = useMutation({
    mutationFn: (a: { doctype: string; name: string; action: string }) => post<{ state: string }>("realestate.operations.act", a),
    onSuccess: (r, a) => { toast.success(`${a.name}: ${r.state}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data?.length) return <Empty title="Nothing waiting for approval" hint="Transfers, cancellations, merges, waivers and large discounts appear here." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {data.map((a) => {
        const meta = DOC_LABEL[a.doctype] ?? DOC_LABEL["RE Booking"]!;
        const facts: [string, string][] = a.doctype === "RE Plot Transfer" ? [["Plot", String(a.plot)], ["From → to", `${a.from_customer_name} → ${a.to_customer_name}`], ["Balance moving", short(a.outstanding_at_transfer)], ["Fee", short(a.transfer_fee)]]
          : a.doctype === "RE Booking Cancellation" ? [["Plot", String(a.plot)], ["Customer", String(a.customer_name)], ["Paid / deduction", `${short(a.paid_amount)} / ${short(a.deduction_amount)}`], ["Refund", short(a.refund_amount)]]
            : a.doctype === "RE Plot Merge" ? [["New plot", String(a.new_plot_no)], ["Area", `${a.total_area_marla} Marla`], ["Price", short(a.total_list_price)]]
              : a.doctype === "RE Surcharge Waiver" ? [["Customer", String(a.customer_name)], ["Waive", short(a.amount)], ["Of outstanding", short(a.surcharge_outstanding)], ["Reason", String(a.reason)]]
                : [["Plot", String(a.plot)], ["Customer", String(a.customer_name)], ["Discount", `${short(a.discount)} (${a.discount_pct}%)`]];
        return (
          <Card key={`${a.doctype}-${a.name}`} className="flex flex-col rounded-2xl">
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><meta.icon className="size-5" /></span>
                <div>
                  <CardTitle className="text-sm">{meta.label}</CardTitle>
                  <Link to={`/re/d/${slug(a.doctype)}/${encodeURIComponent(a.name)}`} className="text-xs text-muted-foreground hover:underline">{a.name}</Link>
                </div>
              </div>
              <Badge tone={STATE_TONE[a.workflow_state] ?? "gray"}>{a.workflow_state}</Badge>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              <dl className="space-y-1 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">{k}</dt><dd className="truncate text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-auto text-xs text-muted-foreground">by {String(a.owner ?? a.agent ?? "")} · {date(String(a.modified))}</p>
              <div className="flex gap-2">
                {a.actions.includes("Approve") || a.actions.includes("Approve discount") ? (
                  <Button size="sm" variant="success" className="flex-1" disabled={act.isPending}
                    onClick={() => act.mutate({ doctype: a.doctype, name: a.name, action: a.actions.includes("Approve") ? "Approve" : "Approve discount" })}><CheckCircle2 /> Approve</Button>
                ) : null}
                {a.actions.includes("Reject") && <Button size="sm" variant="outline" className="flex-1 text-red-600" disabled={act.isPending}
                  onClick={() => act.mutate({ doctype: a.doctype, name: a.name, action: "Reject" })}><XCircle /> Reject</Button>}
                {!a.actions.length && <p className="text-xs text-muted-foreground">Waiting for a Sales Manager</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Pipeline({ rows, columns, doctype }: { rows: Row[]; columns: [string, string, (r: Row) => ReactNode][]; doctype: string }) {
  if (!rows.length) return <Empty title="None yet" />;
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr>{columns.map(([k, l]) => <th key={k} className="px-3 py-2.5">{l}</th>)}<th className="px-3">State</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.name)} className="border-t hover:bg-accent/40">
              {columns.map(([k, , fn], i) => <td key={k} className="px-3 py-2">{i === 0 ? <Link className="font-semibold hover:underline" to={`/re/d/${slug(doctype)}/${encodeURIComponent(String(r.name))}`}>{fn(r)}</Link> : fn(r)}</td>)}
              <td className="px-3"><Badge tone={STATE_TONE[String(r.workflow_state)] ?? "gray"}>{String(r.workflow_state ?? "Draft")}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Open the Commission Payment Voucher (Payment Entry print) in a new tab. */
function printVoucher(pe: string) {
  window.open(`/printview?doctype=Payment%20Entry&name=${encodeURIComponent(pe)}&format=${encodeURIComponent("Commission Payment Voucher")}&trigger_print=1`, "_blank");
}

function CommissionsTab() {
  const refresh = useRefresh();
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState("Bank Transfer");
  const [day, setDay] = useState(todayISO());
  const [ref, setRef] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["ops-commissions"], queryFn: () => get<Commissions>("realestate.operations.commissions") });
  const pay = useMutation({
    mutationFn: () => post<{ paid: number; vouchers: string[] }>("realestate.operations.pay_commissions",
      { names: JSON.stringify(sel), mode_of_payment: mode, posting_date: day, reference_no: ref || undefined, reference_date: day }),
    onSuccess: (r) => {
      toast.success(`${r.paid} commission(s) paid — Payment Entries ${r.vouchers.join(", ")}`);
      r.vouchers.forEach(printVoucher);
      setSel([]); setRef(""); refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading || !data) return <Skeleton className="h-64" />;
  const payable = data.rows.filter((r) => r.status === "Payable");
  const max = Math.max(...data.summary.map((s) => s.Accrued + s.Payable + s.Paid), 1);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>By agent & dealer</CardTitle><CardDescription>Paid · payable · accrued (payable once the customer has paid the set share)</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {data.summary.map((s) => (
            <div key={s.beneficiary}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{s.beneficiary} <span className="text-xs text-muted-foreground">{s.type}</span></span><span>{short(s.Payable)} payable</span></div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-emerald-500" style={{ width: `${(s.Paid * 100) / max}%` }} /><div className="bg-amber-500" style={{ width: `${(s.Payable * 100) / max}%` }} /><div className="bg-slate-400" style={{ width: `${(s.Accrued * 100) / max}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div><CardTitle>Payable now</CardTitle><CardDescription>{payable.length} commission(s) · {short(payable.reduce((a, r) => a + r.amount, 0))}</CardDescription></div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Payment date" className="field h-9 w-36" value={day} onChange={(e) => setDay(e.target.value || todayISO())} />
            <Select className="h-9 w-36" value={mode} onChange={(e) => setMode(e.target.value)}>{["Bank Transfer", "Cheque", "Cash"].map((m) => <option key={m}>{m}</option>)}</Select>
            <input aria-label="Reference or cheque number" placeholder="Ref / cheque no." className="field h-9 w-36" value={ref} onChange={(e) => setRef(e.target.value)} />
            <Button disabled={!sel.length || pay.isPending} onClick={() => pay.mutate()}>{pay.isPending ? <Loader2 className="animate-spin" /> : <HandCoins />} Pay {sel.length || ""} & print</Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[420px] overflow-y-auto">
          {!payable.length ? <Empty title="Nothing payable" /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1"><input type="checkbox" className="size-4" checked={sel.length === payable.length} onChange={(e) => setSel(e.target.checked ? payable.map((r) => r.name) : [])} /></th><th>Beneficiary</th><th>Plot</th><th>Rate</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {payable.map((r) => (
                  <tr key={r.name} className="border-t">
                    <td className="py-1.5"><input type="checkbox" className="size-4" checked={sel.includes(r.name)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, r.name] : s.filter((x) => x !== r.name)))} /></td>
                    <td>{r.beneficiary}</td><td>{r.plot}</td><td>{r.rate}%</td><td className="text-right font-medium">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecoveryTab({ onWaive }: { onWaive: (s: Recovery["surcharges"][number]) => void }) {
  const refresh = useRefresh();
  const { data, isLoading } = useQuery({ queryKey: ["ops-recovery"], queryFn: () => get<Recovery>("realestate.operations.recovery") });
  const run = useMutation({
    mutationFn: () => post<{ surcharges: number; dunnings: number }>("realestate.operations.run_recovery"),
    onSuccess: (r) => { toast.success(`${r.surcharges} surcharge(s) and ${r.dunnings} dunning notice(s) raised`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading || !data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Raise this month's surcharges & dunnings</Button></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Recovery notices (ERPNext Dunning)</CardTitle><CardDescription>Unresolved — resolved automatically when the customer pays</CardDescription></CardHeader>
          <CardContent className="max-h-[440px] divide-y overflow-y-auto">
            {!data.dunnings.length ? <Empty title="No open dunnings" /> : data.dunnings.map((d) => (
              <Link key={d.name} to={recordUrl("Customer", d.customer)} title="Open the customer (dues, receipts, chat)" className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-accent/40">
                <div><p className="font-medium">{d.customer_name}</p><p className="text-xs text-muted-foreground">{d.name} · {date(d.posting_date)}</p></div>
                <p className="font-semibold text-red-600 dark:text-red-400">{money(d.total_outstanding)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>Late-payment surcharges</CardTitle><CardDescription>Sales Invoices for penalty — waive with approval (Credit Note)</CardDescription></CardHeader>
          <CardContent className="max-h-[440px] divide-y overflow-y-auto">
            {!data.surcharges.length ? <Empty title="No surcharges due" /> : data.surcharges.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{s.customer_name}</p><p className="text-xs text-muted-foreground">{s.month_label} · {s.booking} · <Badge tone={s.status === "Unpaid" ? "amber" : "violet"}>{s.status}</Badge></p></div>
                <div className="flex shrink-0 items-center gap-2"><span className="font-semibold">{money(s.outstanding_amount)}</span><Button size="sm" variant="outline" onClick={() => onWaive(s)}>Waive</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page
interface ReallotCandidates { plots: { cancellation: string; plot: string; previous_customer_name: string; cancellation_date: string; list_price: number; plot_size: string; block: string }[]; fee: number; plans: string[] }

/** Re-allot a plot released by an approved cancellation: new allottee, price, plan and fee -> sent for approval. */
function ReallotWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["reallot-candidates"], enabled: open, queryFn: () => get<ReallotCandidates>("realestate.operations.reallot_candidates") });
  const [search, setSearch] = useState("");
  const { data: customers } = useQuery({
    queryKey: ["cust-search", search], enabled: open,
    queryFn: () => getList<{ name: string; customer_name: string; re_cnic: string | null }>("Customer", { fields: ["name", "customer_name", "re_cnic"],
      filters: search ? [["customer_name", "like", `%${search}%`]] : [], limit: 20, orderBy: "customer_name asc" }),
  });
  const [v, setV] = useState({ cancellation: "", new_customer: "", total_price: 0, discount: 0, payment_plan: "", reallotment_fee: 0, remarks: "" });
  const picked = data?.plots.find((p) => p.cancellation === v.cancellation);
  useEffect(() => {
    if (picked) setV((x) => ({ ...x, total_price: picked.list_price }));
  }, [picked]);
  useEffect(() => {
    if (data) setV((x) => ({ ...x, reallotment_fee: x.reallotment_fee || data.fee, payment_plan: x.payment_plan || data.plans[0] || "" }));
  }, [data]);
  const cust = customers?.find((c) => c.name === v.new_customer);
  const save = useMutation({
    mutationFn: () => post<{ name: string; state: string }>("realestate.operations.create", { doctype: "RE Re-allotment", values: JSON.stringify({
      ...v, plot: picked?.plot, reallotment_date: todayISO() }) }),
    onSuccess: (r) => { toast.success(`${r.name} sent for approval`); onClose(); void qc.invalidateQueries({ queryKey: ["ops-lists"] }); void qc.invalidateQueries({ queryKey: ["ops-approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Re-allot a released plot">
      {!data ? <Skeleton className="h-40" /> : !data.plots.length ? <Empty title="No released plots" hint="Plots appear here after an approved cancellation." /> : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div><Label htmlFor="ra-plot">Released plot</Label>
            <Select id="ra-plot" required value={v.cancellation} onChange={(e) => setV({ ...v, cancellation: e.target.value })}>
              <option value="">Choose…</option>
              {data.plots.map((p) => <option key={p.cancellation} value={p.cancellation}>{p.plot} · {p.plot_size} · cancelled {date(p.cancellation_date)} ({p.previous_customer_name})</option>)}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="ra-search">Find new allottee</Label><Input id="ra-search" placeholder="Type a name" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <div><Label htmlFor="ra-cust">New allottee</Label>
              <Select id="ra-cust" required value={v.new_customer} onChange={(e) => setV({ ...v, new_customer: e.target.value })}>
                <option value="">Choose…</option>{customers?.map((c) => <option key={c.name} value={c.name}>{c.customer_name}{c.re_cnic ? ` · ${c.re_cnic}` : " · no CNIC"}</option>)}
              </Select>
            </div>
          </div>
          {cust && !cust.re_cnic && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">This customer has no CNIC — add it before approval.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="ra-price">Price</Label><Input id="ra-price" type="number" value={v.total_price} onChange={(e) => setV({ ...v, total_price: Number(e.target.value) })} /></div>
            <div><Label htmlFor="ra-disc">Discount</Label><Input id="ra-disc" type="number" value={v.discount} onChange={(e) => setV({ ...v, discount: Number(e.target.value) })} /></div>
            <div><Label htmlFor="ra-fee">Re-allotment fee</Label><Input id="ra-fee" type="number" value={v.reallotment_fee} onChange={(e) => setV({ ...v, reallotment_fee: Number(e.target.value) })} /></div>
          </div>
          <div><Label htmlFor="ra-plan">Payment plan</Label><Select id="ra-plan" value={v.payment_plan} onChange={(e) => setV({ ...v, payment_plan: e.target.value })}>{data.plans.map((p) => <option key={p}>{p}</option>)}</Select></div>
          <div><Label htmlFor="ra-rem">Remarks</Label><textarea id="ra-rem" className="field h-16" value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Net price {money(v.total_price - v.discount)}. On approval a new booking is created for the new allottee (own schedule and Sales Invoice) and the fee is invoiced.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Send for approval</Button></div>
        </form>
      )}
    </Dialog>
  );
}

type TabKey = "approvals" | "transfers" | "cancellations" | "reallotments" | "merges" | "commissions" | "recovery";

export function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const [reallot, setReallot] = useState(false);
  const tab = (params.get("tab") as TabKey) || "approvals";
  const setTab = (t: TabKey) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });
  const [wizard, setWizard] = useState<"transfer" | "cancel" | "merge" | null>(params.get("wizard") as "transfer" | "cancel" | "merge" | null);
  const initialBooking = params.get("booking") ?? undefined;
  const [waive, setWaive] = useState<Recovery["surcharges"][number] | null>(null);
  const overview = useQuery({ queryKey: ["ops-overview"], queryFn: () => get<Overview>("realestate.operations.overview") });
  const lists = useQuery({ queryKey: ["ops-lists"], queryFn: () => get<Lists>("realestate.operations.lists") });
  const o = overview.data;
  const pendingTotal = useMemo(() => (o ? Object.values(o.pending).reduce((a, b) => a + b, 0) : 0), [o]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-card to-card p-6">
        <div className="absolute -right-10 -top-16 size-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Sales operations</p>
            <h1 className="text-2xl font-bold sm:text-3xl">Transfers, cancellations, merges & recovery</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Every step is approved by a Sales Manager and posts standard ERPNext documents — Sales Invoices, Credit Notes, Payment Entries, Journal Entries and Dunning notices.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setWizard("transfer")}><Repeat2 /> Transfer plot</Button>
            <Button variant="outline" onClick={() => setWizard("cancel")}><Ban /> Cancel booking</Button>
            <Button variant="outline" onClick={() => setWizard("merge")}><Combine /> Merge plots</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
        {!o ? Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />) : (
          <>
            <Stat icon={Inbox} label="Awaiting approval" value={String(pendingTotal)} sub="transfers, refunds, merges, waivers, discounts" gradient="bg-gradient-to-br from-amber-500 to-orange-600" />
            <Stat icon={Repeat2} label="Transfers this month" value={String(o.transfers_month)} sub={`${short(o.transfer_fees)} fees billed`} gradient="bg-gradient-to-br from-sky-500 to-blue-600" />
            <Stat icon={Ban} label="Cancellations" value={String(o.cancellations)} sub={`${short(o.refunds)} refunded · ${short(o.deductions)} kept`} gradient="bg-gradient-to-br from-rose-500 to-red-600" />
            <Stat icon={Combine} label="Plot merges" value={String(o.merges)} gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
            <Stat icon={FileWarning} label="Surcharge outstanding" value={short(o.surcharge.outstanding_amount)} sub={`${short(o.surcharge.amount)} billed · ${short(o.surcharge.waived_amount)} waived`} gradient="bg-gradient-to-br from-orange-500 to-amber-600" />
            <Stat icon={CircleDollarSign} label="Commission payable" value={short(o.commission.Payable)} sub={`${short(o.commission.Paid)} paid · ${short(o.commission.Accrued)} accrued`} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
            <Stat icon={Users} label="Open dunnings" value={String(o.dunnings)} sub={`${short(o.dunning_outstanding)} overdue`} gradient="bg-gradient-to-br from-slate-500 to-slate-700" />
          </>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Pill active={tab === "approvals"} onClick={() => setTab("approvals")} icon={Inbox} count={pendingTotal}>Approvals</Pill>
        <Pill active={tab === "transfers"} onClick={() => setTab("transfers")} icon={Repeat2}>Transfers</Pill>
        <Pill active={tab === "cancellations"} onClick={() => setTab("cancellations")} icon={Ban}>Cancellations & refunds</Pill>
        <Pill active={tab === "reallotments"} onClick={() => setTab("reallotments")} icon={Repeat2}>Re-allotments</Pill>
        <Pill active={tab === "merges"} onClick={() => setTab("merges")} icon={Combine}>Merges</Pill>
        <Pill active={tab === "recovery"} onClick={() => setTab("recovery")} icon={FileWarning}>Recovery & surcharges</Pill>
        <Pill active={tab === "commissions"} onClick={() => setTab("commissions")} icon={HandCoins}>Commissions</Pill>
      </div>

      {tab === "approvals" && <Approvals />}
      {tab === "transfers" && (lists.data ? <Pipeline doctype="RE Plot Transfer" rows={lists.data.transfers} columns={[
        ["name", "Transfer", (r) => String(r.name)], ["plot", "Plot", (r) => String(r.plot)], ["from", "From → to", (r) => `${r.from_customer_name} → ${r.to_customer_name}`],
        ["date", "Date", (r) => date(String(r.transfer_date))], ["fee", "Fee", (r) => short(r.transfer_fee)], ["bal", "Balance moved", (r) => short(r.outstanding_at_transfer)],
      ]} /> : <Skeleton className="h-64" />)}
      {tab === "cancellations" && (lists.data ? <Pipeline doctype="RE Booking Cancellation" rows={lists.data.cancellations} columns={[
        ["name", "Cancellation", (r) => String(r.name)], ["plot", "Plot", (r) => String(r.plot)], ["cust", "Customer", (r) => String(r.customer_name)], ["reason", "Reason", (r) => String(r.reason)],
        ["paid", "Paid", (r) => short(r.paid_amount)], ["ded", "Kept", (r) => short(r.deduction_amount)], ["ref", "Refund", (r) => short(r.refund_amount)],
      ]} /> : <Skeleton className="h-64" />)}
      {tab === "reallotments" && (
        <div className="space-y-3">
          <div className="flex justify-end"><Button onClick={() => setReallot(true)}><Repeat2 /> Re-allot a released plot</Button></div>
          {lists.data ? <Pipeline doctype="RE Re-allotment" rows={lists.data.reallotments} columns={[
            ["name", "Re-allotment", (r) => String(r.name)], ["plot", "Plot", (r) => String(r.plot)], ["new", "New allottee", (r) => String(r.new_customer_name ?? "")],
            ["prev", "Previous booking", (r) => String(r.previous_booking ?? "")], ["price", "Net price", (r) => short(r.net_price)], ["fee", "Fee", (r) => short(r.reallotment_fee)],
            ["bk", "New booking", (r) => String(r.new_booking ?? "—")],
          ]} /> : <Skeleton className="h-64" />}
        </div>
      )}
      {tab === "merges" && (lists.data ? <Pipeline doctype="RE Plot Merge" rows={lists.data.merges} columns={[
        ["name", "Merge", (r) => String(r.name)], ["no", "New plot", (r) => String(r.new_plot_no)], ["area", "Area", (r) => `${r.total_area_marla} Marla`],
        ["price", "Price", (r) => short(r.total_list_price)], ["date", "Date", (r) => date(String(r.merge_date))],
      ]} /> : <Skeleton className="h-64" />)}
      {tab === "recovery" && <RecoveryTab onWaive={setWaive} />}
      {tab === "commissions" && <CommissionsTab />}

      <TransferWizard open={wizard === "transfer"} onClose={() => setWizard(null)} initial={wizard === "transfer" ? initialBooking : undefined} />
      <CancelWizard open={wizard === "cancel"} onClose={() => setWizard(null)} initial={wizard === "cancel" ? initialBooking : undefined} />
      <MergeWizard open={wizard === "merge"} onClose={() => setWizard(null)} />
      <WaiveDialog surcharge={waive} onClose={() => setWaive(null)} />
      <ReallotWizard open={reallot} onClose={() => setReallot(false)} />
    </div>
  );
}
