/**
 * Commission payment panel (RE Commission form): status, and when Payable a pay form — payment date, mode, reference —
 * that makes a Payment Entry against the accrual and prints the Commission Payment Voucher. Paid commissions show the
 * voucher with a Print button. Server: RE Commission.pay → realestate.commissions.pay.
 */
import { CheckCircle2, HandCoins, Loader2, Printer, Receipt, Timer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Button } from "@/components/ui/button";
import { callDocMethod, humanizeError } from "@/services/frappe";
import { date, money, todayISO } from "@/re/lib/format";

export function printVoucher(pe: string) {
  window.open(`/printview?doctype=Payment%20Entry&name=${encodeURIComponent(pe)}&format=${encodeURIComponent("Commission Payment Voucher")}&trigger_print=1`, "_blank");
}

export function CommissionPay({ ctx }: { ctx: ExtraContext }) {
  const v = ctx.values;
  const [day, setDay] = useState(todayISO());
  const [mode, setMode] = useState("Bank Transfer");
  const [ref, setRef] = useState("");
  const [refDate, setRefDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  if (ctx.isNew || !ctx.name) return null;
  const status = String(v.status ?? "");
  const amount = Number(v.amount ?? 0);

  const pay = async () => {
    setBusy(true);
    try {
      const pe = await callDocMethod<string>("pay", "RE Commission", ctx.name!, { mode_of_payment: mode, posting_date: day, reference_no: ref || undefined, reference_date: refDate });
      toast.success(`Paid — ${pe}`);
      printVoucher(pe);
      ctx.reload();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === "Paid") {
    const isPE = v.payment_doctype === "Payment Entry";
    return (
      <section className="form-card">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600"><CheckCircle2 className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Paid {money(amount)} on {date(String(v.paid_on ?? ""))}</p>
            <p className="text-xs text-muted-foreground">{String(v.payment_mode ?? "")}{v.reference_no ? ` · ref ${String(v.reference_no)}` : ""} · {String(v.payment_doctype ?? "Journal Entry")} {String(v.payment_entry ?? "")}</p>
          </div>
          {isPE && v.payment_entry ? (
            <>
              <Button variant="save" onClick={() => printVoucher(String(v.payment_entry))}><Printer className="h-4 w-4" />Print voucher</Button>
              <Link to={`/accounting/payment-entries/${encodeURIComponent(String(v.payment_entry))}`} className="text-xs font-medium text-primary hover:underline">Open Payment Entry</Link>
            </>
          ) : <span className="text-xs text-muted-foreground">Paid before vouchers — journal entry only</span>}
        </div>
      </section>
    );
  }
  if (status === "Accrued") {
    return (
      <section className="form-card">
        <div className="flex items-center gap-3 p-4 text-sm">
          <span className="grid size-10 place-items-center rounded-xl bg-amber-500/15 text-amber-600"><Timer className="size-5" /></span>
          <p><b>Accrued {money(amount)}.</b> <span className="text-muted-foreground">It becomes payable once the customer has paid the set share of the price (RE Settings → Commission payable after %). Status updates as soon as a receipt is posted.</span></p>
        </div>
      </section>
    );
  }
  if (status !== "Payable") return null;
  return (
    <section className="form-card">
      <h3 className="form-card-head"><HandCoins className="size-4 text-primary" />Pay this commission — {money(amount)} to {String(v.beneficiary ?? "")}</h3>
      <div className="form-card-body grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-xs font-medium">Payment date<input type="date" className="field h-9" value={day} onChange={(e) => setDay(e.target.value || todayISO())} /></label>
        <label className="space-y-1 text-xs font-medium">Mode of payment
          <select className="field h-9" value={mode} onChange={(e) => setMode(e.target.value)}>{["Bank Transfer", "Cheque", "Cash"].map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="space-y-1 text-xs font-medium">Reference / cheque no.<input className="field h-9" placeholder={ctx.name} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium">Reference date<input type="date" className="field h-9" value={refDate} onChange={(e) => setRefDate(e.target.value || todayISO())} /></label>
        <div className="flex items-center justify-between gap-3 sm:col-span-2 xl:col-span-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Receipt className="size-3.5" />Posts a Payment Entry from the mode's account against the accrual, then opens the payment voucher to print.</p>
          <Button variant="submit" disabled={busy} onClick={() => void pay()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}Pay & print voucher</Button>
        </div>
      </div>
    </section>
  );
}
