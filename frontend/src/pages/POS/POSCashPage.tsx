import { useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Banknote, Building2, CalendarDays, Clock, Printer, Store, Trash2, Truck, User, Users2, Wallet, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { localDate, type CompanyHeader } from "./pos-offline";
import { loadPrinter, printHtml } from "./pos-receipt";

interface Setup {
  shift: { name: string; pos_profile: string; period_start_date: string } | null; company: string; currency: string; pos_profile: string; modes: string[];
  expense_accounts: string[]; income_accounts: string[]; cashier: string; company_header: CompanyHeader;
}
interface Move { doctype: string; name: string; posting_date: string; creation: string; docstatus: number; mode_of_payment: string; amount: number; direction: "in" | "out";
  party_type?: string; party?: string; party_name?: string; account?: string; reference_no?: string; remarks?: string; cashier: string }

const AGAINST = [
  { key: "account", label: "Account", icon: Building2 }, { key: "Customer", label: "Customer", icon: User },
  { key: "Supplier", label: "Supplier", icon: Truck }, { key: "Employee", label: "Employee", icon: Users2 },
] as const;

/** /pos/cash — cash receipts (money in) and cash payments (money out) at the counter, counted in the shift's cash-up. */
export default function POSCashPage() {
  const { data: setupData, isLoading } = useFrappeGetCall<{ message: Setup }>("mm_core.pos.cash_setup", undefined, "pos.cash.setup");
  const setup = setupData?.message;
  const money = (v?: number) => formatMoney(v ?? 0, setup?.currency ?? "PKR");
  const [scope, setScope] = useState<"shift" | "range">("shift");
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const { data: moveData, mutate } = useFrappeGetCall<{ message: { rows: Move[]; in: number; out: number } }>("mm_core.pos.cash_movements",
    setup?.pos_profile ? { pos_profile: setup.pos_profile, scope, from_date: from, to_date: to } : undefined,
    setup?.pos_profile ? `pos.cash.moves.${setup.pos_profile}.${scope}.${from}.${to}` : null);
  const moves = moveData?.message;

  if (isLoading && !setup) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-96" /></div>;
  if (!setup?.shift) {
    return (
      <div className="mx-auto mt-10 max-w-md space-y-3 rounded-2xl border border-border bg-card p-8 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No open shift</h2>
        <p className="text-sm text-muted-foreground">Cash in and out is recorded against your open shift. Open one in the terminal first.</p>
        <Link to="/pos/terminal" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Store className="h-4 w-4" /> Open terminal</Link>
      </div>
    );
  }
  const net = (moves?.in ?? 0) - (moves?.out ?? 0);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-inset ring-white/20"><Wallet className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight">Cash receipts &amp; payments</h1>
          <p className="text-xs text-muted-foreground">{setup.pos_profile} · {setup.cashier} · shift {setup.shift.name} — counted in the shift's cash-up</p>
        </div>
        <Link to="/pos/terminal" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><ArrowLeft className="h-4 w-4" /> Terminal</Link>
      </div>

      {/* totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Total label="Cash in" value={money(moves?.in)} icon={ArrowDownLeft} tint="from-emerald-500/15 border-emerald-500/25" tone="text-emerald-600" />
        <Total label="Cash out" value={money(moves?.out)} icon={ArrowUpRight} tint="from-rose-500/15 border-rose-500/25" tone="text-rose-600" />
        <Total label="Net" value={money(net)} icon={Banknote} tint="from-sky-500/15 border-sky-500/25" tone={net < 0 ? "text-rose-600" : "text-sky-600"} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <CashForm setup={setup} money={money} onSaved={() => void mutate()} />

        {/* movements */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold">Movements</h2>
            <div className="flex rounded-lg bg-muted/70 p-0.5">
              {([["shift", "This shift"], ["range", "By date"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setScope(k)}
                  className={cn("rounded-md px-3 py-1 text-xs font-semibold", scope === k ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground")}>{l}</button>
              ))}
            </div>
            {scope === "range" && (
              <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-xs" aria-label="From" />
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-xs" aria-label="To" /></div>
            )}
          </div>
          {!moves ? <Skeleton className="h-60" /> : moves.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-14 text-sm text-muted-foreground"><Wallet className="h-8 w-8 opacity-50" /> No cash in or out yet.</div>
          ) : (
            <ul className="space-y-2">
              {moves.rows.map((m) => <MoveRow key={m.name} m={m} money={money} setup={setup} onChanged={() => void mutate()} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Total({ label, value, icon: Icon, tint, tone }: { label: string; value: string; icon: typeof Wallet; tint: string; tone: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-4", tint)}>
      <Icon className={cn("absolute right-4 top-4 h-6 w-6 opacity-70", tone)} />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function CashForm({ setup, money, onSaved }: { setup: Setup; money: (v?: number) => string; onSaved: () => void }) {
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [against, setAgainst] = useState<string>("account");
  const [mode, setMode] = useState(setup.modes.find((m) => /cash/i.test(m)) ?? setup.modes[0] ?? "");
  const [amount, setAmount] = useState<number>(0);
  const [account, setAccount] = useState("");
  const [party, setParty] = useState("");
  const [q, setQ] = useState("");
  const [ref, setRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const accounts = direction === "in" ? setup.income_accounts : setup.expense_accounts;
  const nameField = { Customer: "customer_name", Supplier: "supplier_name", Employee: "employee_name" }[against] ?? "name";
  const { data: parties } = useFrappeGetDocList<Record<string, string>>(against === "account" ? "Customer" : against, {
    fields: ["name", nameField] as never, limit: 20,
    filters: (against === "Employee" ? [["status", "=", "Active"], ["company", "=", setup.company]] : [["disabled", "=", 0]]) as never,
    orFilters: q ? ([["name", "like", `%${q}%`], [nameField, "like", `%${q}%`]] as never) : undefined,
  }, against === "account" ? null : `pos.cash.party.${against}.${q}`);

  const save = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ doctype: string; name: string; allocated?: number }>("mm_core.pos.record_cash", { data: JSON.stringify({
        direction, mode_of_payment: mode, amount, reference_no: ref || undefined, remarks: remarks || undefined,
        ...(against === "account" ? { account } : { party_type: against, party }),
      }) });
      toast.success(`${direction === "in" ? "Cash receipt" : "Cash payment"} ${r.name} recorded`);
      printVoucher({ name: r.name, direction, amount, mode, against: against === "account" ? account : party, reference: ref, remarks, date: localDate() }, setup, money);
      setAmount(0); setRef(""); setRemarks(""); setParty(""); setQ("");
      onSaved();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  const ready = amount > 0 && mode && (against === "account" ? account : party);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* in / out */}
      <div className="grid grid-cols-2 gap-2">
        {([["in", "Cash receipt", "Money into the drawer", ArrowDownLeft, "from-emerald-500 to-green-600 shadow-emerald-500/30"],
          ["out", "Cash payment", "Money out of the drawer", ArrowUpRight, "from-rose-500 to-red-600 shadow-rose-500/30"]] as const).map(([k, l, sub, Icon, g]) => (
          <button key={k} type="button" onClick={() => { setDirection(k); setAccount(""); setAgainst(k === "in" ? (against === "Supplier" ? "Customer" : against) : (against === "Customer" ? "Supplier" : against)); }}
            className={cn("flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all", direction === k ? "border-transparent bg-gradient-to-br text-white shadow-lg " + g : "border-border hover:border-primary/40")}>
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", direction === k ? "bg-white/20" : "bg-muted")}><Icon className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-bold">{l}</span><span className={cn("block truncate text-[10px]", direction === k ? "text-white/80" : "text-muted-foreground")}>{sub}</span></span>
          </button>
        ))}
      </div>

      <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</span>
        <Input type="number" min={0} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} placeholder="0" className="h-12 text-right text-2xl font-bold tabular-nums" autoFocus /></label>

      <div className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mode</span>
        <div className="flex flex-wrap gap-1.5">{setup.modes.map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold", mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{m}</button>
        ))}</div></div>

      <div className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{direction === "in" ? "Received from" : "Paid to"}</span>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1">{AGAINST.map((a) => (
          <button key={a.key} type="button" onClick={() => { setAgainst(a.key); setParty(""); setQ(""); }}
            className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold", against === a.key ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground")}>
            <a.icon className="h-4 w-4" />{a.label}</button>
        ))}</div>
        {against === "account" ? (
          <Select value={account} onChange={(e) => setAccount(e.target.value)} className="mt-1.5">
            <option value="">{direction === "in" ? "Income account…" : "Expense account…"}</option>
            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        ) : (
          <>
            <Input list="pos-cash-party" value={party || q} onChange={(e) => { const v = e.target.value; const hit = (parties ?? []).find((p) => p.name === v); if (hit) { setParty(hit.name); setQ(""); } else { setParty(""); setQ(v); } }}
              placeholder={`Search ${against.toLowerCase()}…`} className="mt-1.5" />
            <datalist id="pos-cash-party">{(parties ?? []).map((p) => <option key={p.name} value={p.name}>{p[nameField]}</option>)}</datalist>
            {(against === "Customer" && direction === "in") || (against === "Supplier" && direction === "out") ? <p className="text-[10px] text-muted-foreground">Allocated to their oldest open invoices.</p> : null}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reference</span><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Slip / bill no" /></label>
        <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note</span><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={direction === "in" ? "e.g. Scrap sold" : "e.g. Tea for staff"} /></label>
      </div>

      <Button className={cn("h-11 w-full text-base text-white", direction === "in" ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-rose-500 to-red-600")} disabled={busy || !ready} onClick={() => void save()}>
        {direction === "in" ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
        {direction === "in" ? "Receive" : "Pay"} {money(amount)} &amp; print
      </Button>
    </section>
  );
}

function MoveRow({ m, money, setup, onChanged }: { m: Move; money: (v?: number) => string; setup: Setup; onChanged: () => void }) {
  const isIn = m.direction === "in";
  const cancelled = m.docstatus === 2;
  const against = m.party_name || m.party || (m.account ?? "").replace(/ - [A-Z]+$/, "");
  const cancel = async () => {
    if (!window.confirm(`Cancel ${m.name}?`)) return;
    try { await postCall("mm_core.pos.cancel_cash", { doctype: m.doctype, name: m.name }); toast.success(`${m.name} cancelled`); onChanged(); } catch (e) { toast.error(humanizeError(e)); }
  };
  return (
    <li className={cn("relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-background/40 p-3", cancelled && "opacity-50")}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", isIn ? "bg-gradient-to-b from-emerald-400 to-green-600" : "bg-gradient-to-b from-rose-400 to-red-600")} />
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md", isIn ? "from-emerald-500 to-green-600" : "from-rose-500 to-red-600")}>
        {isIn ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2"><span className="truncate text-sm font-semibold">{against || (isIn ? "Cash receipt" : "Cash payment")}</span>
          {cancelled && <span className="flex items-center gap-0.5 text-[10px] font-semibold text-rose-600"><XCircle className="h-3 w-3" />Cancelled</span>}</div>
        <div className="truncate text-xs text-muted-foreground">{m.remarks || (m.party_type ? `${m.party_type} payment` : m.doctype)}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground"><span className="font-mono">{m.name}</span><span>· {m.mode_of_payment}</span>{m.reference_no && !m.reference_no.startsWith("POS ") && <span>· #{m.reference_no}</span>}
          <span className="inline-flex items-center gap-0.5">· <Clock className="h-2.5 w-2.5" />{m.creation.slice(11, 16)}</span><span>· {m.cashier}</span></div>
      </div>
      <div className={cn("shrink-0 text-right text-base font-bold tabular-nums", isIn ? "text-emerald-600" : "text-rose-600")}>{isIn ? "+" : "−"}{money(m.amount)}</div>
      {!cancelled && (
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" title="Reprint" onClick={() => printVoucher({ name: m.name, direction: m.direction, amount: m.amount, mode: m.mode_of_payment, against, reference: m.reference_no?.startsWith("POS ") ? "" : m.reference_no, remarks: m.remarks, date: m.posting_date }, setup, money)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Printer className="h-3.5 w-3.5" /></button>
          <button type="button" title="Cancel" onClick={() => void cancel()} className="rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </li>
  );
}

/** Thermal voucher for a cash receipt / payment (same printer settings as receipts). */
function printVoucher(v: { name: string; direction: "in" | "out"; amount: number; mode: string; against?: string; reference?: string; remarks?: string; date: string }, setup: Setup, money: (n?: number) => string) {
  const s = loadPrinter();
  const esc = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const width = s.paper === "58" ? "48mm" : s.paper === "80" ? "72mm" : "190mm";
  const row = (k: string, val: string, cls = "") => `<div class="row ${cls}"><span>${k}</span><span>${val}</span></div>`;
  const c = setup.company_header;
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(v.name)}</title><style>
    @page { size: ${s.paper === "a4" ? "A4" : `${s.paper}mm auto`}; margin: 2mm 3mm; } body { margin: 0; font: ${s.fontSize}px/1.35 "Courier New", monospace; color: #000; }
    .r { width: ${width}; margin: 0 auto; } .c { text-align: center; } .b { font-weight: 700; } .big { font-size: 1.35em; } .hr { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; } .row > span:last-child { text-align: right; }
  </style></head><body><div class="r">
    <div class="c b big">${esc(c.company_name)}</div>${c.address ? `<div class="c">${esc(c.address)}</div>` : ""}<div class="hr"></div>
    <div class="c b">${v.direction === "in" ? "CASH RECEIPT" : "CASH PAYMENT VOUCHER"}</div><div class="hr"></div>
    ${row("Voucher", esc(v.name))}${row("Date", esc(v.date))}${row("Counter", esc(setup.pos_profile))}${row("Cashier", esc(setup.cashier))}
    ${row(v.direction === "in" ? "From" : "To", esc(v.against))}${v.reference ? row("Ref", esc(v.reference)) : ""}
    ${v.remarks ? `<div>${esc(v.remarks)}</div>` : ""}<div class="hr"></div>${row(esc(v.mode), esc(money(v.amount)), "b big")}<div class="hr"></div>
    <br><div class="row"><span>Received by ________</span><span>Paid by ________</span></div>
  </div></body></html>`);
}
