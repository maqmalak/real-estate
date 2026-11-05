/**
 * Parcel slide-over on /re/land: a khasra's revenue record, co-owners and shares, deals with each owner's paid and
 * balance, seller payments, due diligence checklist, documents, court cases and stage history; move it along the pipeline.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, CircleDashed, ExternalLink, FileText, Gavel, History, Landmark, ScrollText, Users, Wallet, X, XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Skeleton } from "@/re/components/ui/skeleton";
import { date, money } from "@/re/lib/format";
import { STAGES, stageColor, useMoveParcel, useParcel } from "@/re/lib/land";
import { cn } from "@/re/lib/utils";
import { humanizeError } from "@/services/frappe";

type Tab = "owners" | "deals" | "checks" | "docs" | "history";

export function ParcelSheet({ name, onClose, canMove }: { name: string | null; onClose: () => void; canMove: boolean }) {
  const { data: p, isLoading } = useParcel(name);
  const move = useMoveParcel();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("owners");
  const [busy, setBusy] = useState(false);
  if (!name) return null;

  const onMove = async (stage: string) => {
    setBusy(true);
    try {
      await move(name, stage);
      toast.success(`Moved to ${stage}`);
      await qc.invalidateQueries({ queryKey: ["land-parcel", name] });
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  const tabs: [Tab, string, typeof Users, number?][] = [
    ["owners", "Owners", Users, p?.owners.length], ["deals", "Deals & payments", Wallet, p?.lines.length],
    ["checks", "Due diligence", CheckCircle2, p ? p.checks.filter((c) => c.mandatory && c.status !== "Verified").length : undefined],
    ["docs", "Documents & cases", FileText, p ? p.documents.length + p.cases.length : undefined], ["history", "History", History],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Khasra details">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden border-l bg-background shadow-2xl animate-in slide-in-from-right">
        {isLoading || !p ? (
          <div className="space-y-3 p-5"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
        ) : (
          <>
            <header className="border-b p-5" style={{ background: `linear-gradient(135deg, ${stageColor(p.stage)}22, transparent 70%)` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{p.mauza} · Tehsil {p.tehsil}</p>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight">Khasra {p.khasra_nos}</h2>
                  <p className="text-sm text-muted-foreground">{p.area_display} · {p.kanal} Kanal · {p.area_acre} acre · {p.land_type || "—"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Link to={`/re/d/re-land-parcel/${encodeURIComponent(p.name)}`} className="grid size-8 place-items-center rounded-lg border hover:bg-muted" title="Open the record"><ExternalLink className="size-4" /></Link>
                  <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg border hover:bg-muted" aria-label="Close"><X className="size-4" /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm" style={{ background: stageColor(p.stage) }}>{p.stage}</span>
                {p.cases.some((c) => ["Pending", "Under Hearing", "Stay Order"].includes(c.status)) && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300"><Gavel className="size-3" />In court</span>}
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", p.diligence_clear ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
                  Due diligence {p.diligence_clear ? "passed" : p.diligence_override ? "overridden" : "pending"}
                </span>
                {canMove && (
                  <select aria-label="Move to stage" disabled={busy} value={p.stage} onChange={(e) => onMove(e.target.value)}
                    className="ml-auto h-8 rounded-lg border bg-background px-2 text-xs font-medium">
                    {STAGES.map((s) => <option key={s} value={s}>Move to: {s}</option>)}
                  </select>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
                {[["Khewat", p.khewat_no], ["Khatooni", p.khatooni_no], ["Square", p.square_no], ["Killa", p.killa_nos]].map(([k, v]) => (
                  <div key={k} className="rounded-lg border bg-card px-2 py-1.5"><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="truncate font-medium">{v || "—"}</dd></div>
                ))}
              </dl>
            </header>
            <nav className="flex gap-1 overflow-x-auto border-b px-3 py-2 scrollbar-thin">
              {tabs.map(([k, label, Icon, n]) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition", tab === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <Icon className="size-3.5" />{label}{n ? <span className={cn("rounded-full px-1.5 text-[10px]", tab === k ? "bg-white/20" : "bg-muted")}>{n}</span> : null}
                </button>
              ))}
            </nav>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {tab === "owners" && (
                <div className="space-y-2">
                  {p.owners.map((o) => (
                    <div key={o.owner} className="rounded-xl border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/re/d/re-land-owner/${encodeURIComponent(o.owner)}`} className="truncate text-sm font-semibold hover:underline">{o.name}</Link>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">{o.share}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-lime-500 to-emerald-600" style={{ width: `${Math.min(o.pct, 100)}%` }} /></div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{o.pct.toFixed(1)}% of the khasra per fard</p>
                    </div>
                  ))}
                  {!p.owners.length && <Empty text="No co-owners entered from the fard yet." />}
                </div>
              )}
              {tab === "deals" && (
                <div className="space-y-3">
                  {Object.entries(groupBy(p.lines, (l) => l.deal)).map(([deal, rows]) => (
                    <div key={deal} className="overflow-hidden rounded-xl border bg-card">
                      <Link to={`/re/d/re-land-deal/${encodeURIComponent(deal)}`} className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 hover:bg-muted">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><ScrollText className="size-4 shrink-0 text-primary" /><span className="truncate">{deal} · {rows[0].description}</span></span>
                        <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium">{rows[0].deal_status}</span>
                      </Link>
                      <div className="divide-y">
                        {rows.map((l) => {
                          const paid = l.paid_amount + l.adjusted_amount;
                          const pctPaid = l.net_due ? Math.min((paid * 100) / l.net_due, 100) : 0;
                          return (
                            <div key={`${deal}-${l.ser}`} className={cn("px-3 py-2.5 text-xs", l.status === "Cancelled" && "opacity-60")}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{l.ser}. {l.owner_name}</span>
                                <span className={cn("shrink-0 font-semibold tabular-nums", l.overdue ? "text-red-600" : l.balance <= 0.5 ? "text-emerald-600" : "")}>{l.status === "Cancelled" ? "Cancelled" : l.balance > 0.5 ? `${money(l.balance, { compact: true })} due` : "Paid"}</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500" style={{ width: `${pctPaid}%` }} /></div>
                              <p className="mt-1 text-muted-foreground">{money(paid, { compact: true })} of {money(l.net_due, { compact: true })}{l.adjusted_amount ? ` (plots ${money(l.adjusted_amount, { compact: true })})` : ""} · {l.status}{l.date_ext || l.mature_date ? ` · due ${date(l.date_ext || l.mature_date)}` : ""}{l.overdue ? " · overdue" : ""}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {!p.lines.length && <Empty text="No deal covers this khasra yet." />}
                  {p.payments.length > 0 && (
                    <div className="rounded-xl border bg-card">
                      <p className="border-b px-3 py-2 text-xs font-semibold">Seller payments</p>
                      <ul className="divide-y text-xs">
                        {p.payments.slice(0, 12).map((x) => (
                          <li key={x.name} className="flex items-center justify-between gap-2 px-3 py-2">
                            <Link to={`/re/d/re-land-payment/${encodeURIComponent(x.name)}`} className="min-w-0 truncate hover:underline">{date(x.posting_date)} · {x.owner_name} · {x.payment_kind}</Link>
                            <span className="shrink-0 font-semibold tabular-nums">{money(x.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {tab === "checks" && (
                <ul className="space-y-1.5">
                  {p.checks.map((c) => (
                    <li key={c.item} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-sm">
                      {c.status === "Verified" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : c.status === "Failed" ? <XCircle className="size-4 shrink-0 text-red-600" /> : <CircleDashed className="size-4 shrink-0 text-amber-500" />}
                      <span className="min-w-0 flex-1 truncate">{c.item}{c.mandatory ? <span className="ml-1 text-[10px] font-semibold uppercase text-muted-foreground">required</span> : null}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{c.status}{c.verified_on ? ` · ${date(c.verified_on)}` : ""}</span>
                    </li>
                  ))}
                  {p.override_reason && <li className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">Admin override: {p.override_reason}</li>}
                </ul>
              )}
              {tab === "docs" && (
                <div className="space-y-3">
                  <div className="rounded-xl border bg-card">
                    <p className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold"><Landmark className="size-3.5" />Revenue papers and agreements</p>
                    <ul className="divide-y text-xs">
                      {p.documents.map((d) => (
                        <li key={d.name} className="flex items-center justify-between gap-2 px-3 py-2">
                          <Link to={`/re/d/re-vault-document/${encodeURIComponent(d.name)}`} className="min-w-0 truncate hover:underline">{d.document_type} — {d.title}</Link>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", d.status === "Expired" ? "bg-red-500/10 text-red-700" : d.status === "Expiring Soon" ? "bg-amber-500/10 text-amber-700" : "bg-muted")}>{d.issue_date ? date(d.issue_date) : d.status}</span>
                        </li>
                      ))}
                      {!p.documents.length && <li className="px-3 py-3 text-muted-foreground">No papers in the vault for this khasra.</li>}
                    </ul>
                  </div>
                  <div className="rounded-xl border bg-card">
                    <p className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold"><Gavel className="size-3.5" />Court cases</p>
                    <ul className="divide-y text-xs">
                      {p.cases.map((c) => (
                        <li key={c.name} className="px-3 py-2">
                          <Link to={`/re/d/re-land-case/${encodeURIComponent(c.name)}`} className="font-medium hover:underline">{c.case_title}</Link>
                          <p className="text-muted-foreground">{c.court} · {c.case_no} · {c.status}{c.next_hearing ? ` · next hearing ${date(c.next_hearing)}` : ""}</p>
                        </li>
                      ))}
                      {!p.cases.length && <li className="px-3 py-3 text-muted-foreground">No cases.</li>}
                    </ul>
                  </div>
                </div>
              )}
              {tab === "history" && (
                <ol className="relative ml-2 space-y-3 border-l pl-5">
                  {[...p.history].reverse().map((h, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-background" style={{ background: stageColor(h.stage) }} />
                      <p className="text-sm font-medium">{h.stage}</p>
                      <p className="text-xs text-muted-foreground">{date(h.date)}{h.by ? ` · ${h.by}` : ""}{h.notes ? ` · ${h.notes}` : ""}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{text}</p>;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((a, r) => ((a[key(r)] ??= []).push(r), a), {});
}
