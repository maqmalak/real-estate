/**
 * Bulk society collection (/re/society/collect): open society bills by block / month / status, tick the ones being paid
 * (amounts editable for part payments), choose mode and date, and collect — one submitted receipt (+ Payment Entry)
 * per bill. Results list each receipt or the reason a bill was skipped.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, HandCoins, Loader2, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get, post } from "@/re/lib/api";
import { date, money, todayISO } from "@/re/lib/format";
import { useFilterOptions } from "@/re/lib/plots";
import { cn } from "@/re/lib/utils";

interface Bill { name: string; plot: string; block: string; customer: string; customer_name: string | null; mobile_no: string | null; bill_month_label: string;
  billing_month: string; due_date: string; status: string; total_amount: number; paid_amount: number; outstanding_amount: number }
interface Sheet { rows: Bill[]; months: { billing_month: string; bill_month_label: string }[]; modes: string[]; total: number }
interface Result { done: { bill: string; receipt: string; amount: number; plot: string }[]; failed: { bill: string; error: string }[]; total: number }
const TONE: Record<string, "red" | "amber" | "orange" | "gray"> = { Overdue: "red", Due: "amber", "Partly Paid": "orange", Unpaid: "gray" };

export function SocietyCollectPage() {
  const qc = useQueryClient();
  const { data: opts } = useFilterOptions();
  const [filters, setFilters] = useState({ block: "", month: "", status: "", search: "" });
  const { data, isLoading } = useQuery({
    queryKey: ["society-sheet", filters],
    queryFn: () => get<Sheet>("realestate.society.collection_sheet", { block: filters.block || undefined, month: filters.month || undefined, status: filters.status || undefined, search: filters.search || undefined }),
  });
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [mode, setMode] = useState("Cash");
  const [on, setOn] = useState(todayISO());
  const [ref, setRef] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const rows = data?.rows ?? [];
  const selected = Object.entries(picked);
  const total = selected.reduce((s, [, a]) => s + a, 0);
  const allOn = rows.length > 0 && rows.every((r) => r.name in picked);
  const byBlock = useMemo(() => rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.block]: (a[r.block] ?? 0) + r.outstanding_amount }), {}), [rows]);
  const toggle = (r: Bill) => setPicked((p) => { const n = { ...p }; if (r.name in n) delete n[r.name]; else n[r.name] = r.outstanding_amount; return n; });
  const collect = useMutation({
    mutationFn: () => post<Result>("realestate.society.bulk_collect", { rows: JSON.stringify(selected.map(([bill, amount]) => ({ bill, amount }))), mode_of_payment: mode, posting_date: on, reference_no: ref || undefined }),
    onSuccess: (r) => { setResult(r); setPicked({}); toast.success(`${r.done.length} receipts · ${money(r.total)}`); void qc.invalidateQueries({ queryKey: ["society-sheet"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><HandCoins className="size-6 text-primary" /> Society collection</h1>
          <p className="text-sm text-muted-foreground">Collect many society bills at once — one receipt and Payment Entry per bill</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(byBlock).map(([b, v]) => <span key={b} className="rounded-full border bg-card px-3 py-1">{b}: <b>{money(v, { compact: true })}</b></span>)}
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="sc-block">Block</Label><Select id="sc-block" value={filters.block} onChange={(e) => setFilters({ ...filters, block: e.target.value })}><option value="">All blocks</option>{opts?.blocks.map((b) => <option key={b.name}>{b.name}</option>)}</Select></div>
        <div><Label htmlFor="sc-month">Month</Label><Select id="sc-month" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}><option value="">All months</option>{data?.months.map((m) => <option key={m.billing_month} value={m.billing_month}>{m.bill_month_label}</option>)}</Select></div>
        <div><Label htmlFor="sc-status">Status</Label><Select id="sc-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any open</option>{["Overdue", "Due", "Partly Paid", "Unpaid"].map((s) => <option key={s}>{s}</option>)}</Select></div>
        <div><Label htmlFor="sc-q">Search</Label><div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input id="sc-q" className="pl-8" placeholder="Plot or owner" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div></div>
      </div>

      <div className="overflow-auto rounded-2xl border bg-card" style={{ maxHeight: "calc(100vh - 22rem)" }}>
        {isLoading ? <Skeleton className="m-3 h-64" /> : !rows.length ? <Empty title="No open bills" hint="Everything in this filter is paid." /> : (
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="border-b px-3 py-2"><input type="checkbox" aria-label="Select all" className="size-4" checked={allOn}
                  onChange={(e) => setPicked(e.target.checked ? Object.fromEntries(rows.map((r) => [r.name, r.outstanding_amount])) : {})} /></th>
                {["Plot", "Owner", "Month", "Due", "Status", "Outstanding", "Collect"].map((h, i) => <th key={h} className={cn("border-b px-3 py-2", i >= 5 && "text-right")}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on2 = r.name in picked;
                return (
                  <tr key={r.name} className={cn("hover:bg-accent/40", on2 && "bg-primary/5")}>
                    <td className="border-b px-3 py-2"><input type="checkbox" aria-label={`Collect ${r.name}`} className="size-4" checked={on2} onChange={() => toggle(r)} /></td>
                    <td className="border-b px-3 font-medium">{r.plot}</td>
                    <td className="border-b px-3"><p className="font-medium">{r.customer_name ?? r.customer}</p><p className="text-xs text-muted-foreground">{r.mobile_no}</p></td>
                    <td className="border-b px-3">{r.bill_month_label}</td>
                    <td className="border-b px-3">{date(r.due_date)}</td>
                    <td className="border-b px-3"><Badge tone={TONE[r.status] ?? "gray"}>{r.status}</Badge></td>
                    <td className="border-b px-3 text-right tabular-nums">{money(r.outstanding_amount)}</td>
                    <td className="border-b px-3 text-right">
                      <Input type="number" aria-label={`Amount for ${r.name}`} className="ml-auto h-8 w-28 text-right" disabled={!on2} min={1} max={r.outstanding_amount}
                        value={on2 ? picked[r.name] : ""} onChange={(e) => setPicked((p) => ({ ...p, [r.name]: Number(e.target.value) }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-3 shadow-lg">
        <div><Label htmlFor="sc-mode">Mode</Label><Select id="sc-mode" value={mode} onChange={(e) => setMode(e.target.value)}>{(data?.modes ?? ["Cash"]).map((m) => <option key={m}>{m}</option>)}</Select></div>
        <div><Label htmlFor="sc-date">Date</Label><Input id="sc-date" type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div>
        <div><Label htmlFor="sc-ref">Reference / cheque no</Label><Input id="sc-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">{selected.length} bills selected</p>
          <p className="text-xl font-bold tabular-nums">{money(total)}</p>
        </div>
        <Button size="lg" disabled={!selected.length || collect.isPending} onClick={() => collect.mutate()}>
          {collect.isPending ? <Loader2 className="animate-spin" /> : <HandCoins />} Collect {selected.length || ""}
        </Button>
      </div>

      <Dialog open={Boolean(result)} onOpenChange={(o) => !o && setResult(null)} title="Collection result">
        {result && (
          <div className="space-y-3 text-sm">
            <p><b>{result.done.length}</b> receipts for <b>{money(result.total)}</b>{result.failed.length ? `, ${result.failed.length} skipped` : ""}.</p>
            <div className="max-h-72 space-y-1 overflow-auto">
              {result.done.map((d) => <p key={d.receipt} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" />{d.plot} · {d.receipt} · {money(d.amount)}</p>)}
              {result.failed.map((f) => <p key={f.bill} className="flex items-center gap-2 text-red-600"><XCircle className="size-4" />{f.bill}: {f.error}</p>)}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
