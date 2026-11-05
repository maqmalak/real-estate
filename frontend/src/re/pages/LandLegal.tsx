/**
 * Due diligence and cases (/re/land/legal): the checklist matrix (every khasra × fard, jamabandi, mutation history, aks
 * shajra, nishandehi, encumbrance, litigation, CNIC and legal opinion), the court case register with the next hearing,
 * and the land papers in the document vault. Server: realestate.land_api.legal.
 */
import { CheckCircle2, CircleDashed, FileText, Gavel, Paperclip, Plus, Scale, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { C, KpiCard } from "@/re/components/analytics/kit";
import { Panel } from "@/re/components/record/ProjectProfile";
import { Skeleton } from "@/re/components/ui/skeleton";
import { date, todayISO } from "@/re/lib/format";
import { stageColor, useLandLegal } from "@/re/lib/land";
import { cn } from "@/re/lib/utils";
import { LandHeader } from "./Land";

const SHORT: Record<string, string> = {
  "Latest fard-e-malkiat": "Fard", Jamabandi: "Jamabandi", "Mutation (intiqal) history": "Mutations", "Aks shajra (map)": "Aks shajra",
  "Site demarcation (nishandehi) report": "Nishandehi", "Encumbrance / mortgage check": "Encumbrance", "Litigation check": "Litigation",
  "Seller CNIC verification": "CNICs", "Legal opinion": "Legal opinion",
};
const OPEN = ["Pending", "Under Hearing", "Stay Order"];

export function LandLegalPage() {
  const { data: d, isLoading } = useLandLegal();
  const header = <LandHeader active="/re/land/legal" icon={Scale} title="Due diligence & cases" sub="Revenue record checks before the agreement, land papers and the litigation register" />;
  if (isLoading || !d) return <div className="space-y-5 p-4 sm:p-6">{header}<Skeleton className="h-96 rounded-2xl" /></div>;
  const today = todayISO();
  const days = (iso: string | null) => (iso ? Math.round((new Date(iso).getTime() - new Date(today).getTime()) / 86_400_000) : null);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {header}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ShieldCheck} label="Khasras cleared" value={`${d.summary.clear} / ${d.parcels.length}`} sub="all mandatory checks verified" progress={d.parcels.length ? (d.summary.clear * 100) / d.parcels.length : 0} color={C.emerald} />
        <KpiCard icon={CircleDashed} label="Checks pending" value={String(d.summary.pending)} sub="khasras that cannot reach the agreement stage yet" color={d.summary.pending ? C.amber : C.emerald} />
        <KpiCard icon={Gavel} label="Open court cases" value={String(d.summary.open_cases)} sub={`${d.cases.length} cases in the register`} color={d.summary.open_cases ? C.rose : C.slate} />
        <KpiCard icon={FileText} label="Land papers in the vault" value={String(d.documents.length)} sub={d.doc_types.slice(0, 3).map((t) => `${t.n} ${t.type}`).join(" · ")} color={C.violet} />
      </div>

      <Panel title="Due diligence matrix" sub="Required checks are marked •; the agreement stage needs every required check verified (or an Admin override)" icon={ShieldCheck}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b bg-card px-2 py-2 text-left font-semibold">Khasra</th>
                {d.items.map((i) => <th key={i} className="border-b px-1 py-2 text-center font-semibold" title={i}>{SHORT[i] ?? i}{d.mandatory.includes(i) ? " •" : ""}</th>)}
                <th className="border-b px-2 py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.parcels.map((p) => (
                <tr key={p.name} className="hover:bg-accent/40">
                  <td className="sticky left-0 z-10 border-b bg-card px-2 py-1.5">
                    <Link to={`/re/land?parcel=${encodeURIComponent(p.name)}`} className="flex items-center gap-1.5 font-medium hover:underline"><span className="size-2 shrink-0 rounded-full" style={{ background: stageColor(p.stage) }} />{p.khasra_nos}</Link>
                    <span className="text-[10px] text-muted-foreground">{p.stage} · {p.area_display}</span>
                  </td>
                  {d.items.map((i) => {
                    const c = p.cells[i];
                    const st = c?.status ?? "Pending";
                    return (
                      <td key={i} className="border-b px-1 py-1.5 text-center" title={`${i}: ${st}${c?.by ? ` — ${c.by}` : ""}${c?.on ? `, ${date(c.on)}` : ""}`}>
                        <span className={cn("inline-grid size-6 place-items-center rounded-md", st === "Verified" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : st === "Failed" ? "bg-red-500/15 text-red-700" : st === "Not Applicable" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700")}>
                          {st === "Verified" ? <CheckCircle2 className="size-3.5" /> : st === "Failed" ? <XCircle className="size-3.5" /> : st === "Not Applicable" ? "–" : <CircleDashed className="size-3.5" />}
                        </span>
                        {c?.doc && <Paperclip className="mx-auto mt-0.5 size-2.5 text-muted-foreground" />}
                      </td>
                    );
                  })}
                  <td className="border-b px-2 py-1.5 text-right">
                    {p.diligence_clear ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Clear</span>
                      : p.diligence_override ? <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Override</span>
                        : <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{p.pending} pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Litigation register" sub="Court cases and disputes over khasras, with the next hearing" icon={Gavel}
          action={<Link to="/re/d/re-land-case/new" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted"><Plus className="size-3.5" />Case</Link>}>
          <div className="space-y-2">
            {d.cases.map((c) => {
              const n = days(c.next_hearing);
              const open = OPEN.includes(c.status);
              return (
                <Link key={c.name} to={`/re/d/re-land-case/${encodeURIComponent(c.name)}`} className={cn("flex items-start gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md", open ? "bg-card" : "bg-muted/30 opacity-80")}>
                  <div className={cn("grid w-14 shrink-0 place-items-center rounded-lg py-1.5 text-center", open && n !== null && n <= 7 ? "bg-red-500/10 text-red-700" : "bg-muted")}>
                    {c.next_hearing && open ? <><span className="text-lg font-bold leading-none tabular-nums">{n}</span><span className="text-[9px] uppercase">{n === 1 ? "day" : "days"}</span></> : <Gavel className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.case_title}</p>
                    <p className="text-[11px] text-muted-foreground">{c.court} · {c.case_no} · {c.lawyer}</p>
                    <p className="mt-1 text-[11px]">Khasra {c.parcels.join(", ") || "—"}{c.affected_area ? ` · ${c.affected_area}` : ""}{c.next_hearing && open ? ` · next hearing ${date(c.next_hearing)}` : ""}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", open ? "bg-red-500/10 text-red-700" : "bg-emerald-500/10 text-emerald-700")}>{c.status}</span>
                </Link>
              );
            })}
            {!d.cases.length && <p className="text-sm text-muted-foreground">No cases recorded.</p>}
          </div>
        </Panel>
        <Panel title="Land papers" sub="Fard, iqrar nama, registry, mutation and more — stored per khasra with versions" icon={FileText}
          action={<Link to="/re/d/re-vault-document/new" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted"><Plus className="size-3.5" />Paper</Link>}>
          <div className="mb-3 flex flex-wrap gap-1.5">{d.doc_types.map((t) => <span key={t.type} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t.type} <b>{t.n}</b></span>)}</div>
          <ul className="max-h-[440px] divide-y overflow-y-auto text-sm">
            {d.documents.slice(0, 60).map((doc) => (
              <li key={doc.name} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/re/d/re-vault-document/${encodeURIComponent(doc.name)}`} className="min-w-0 truncate hover:underline">{doc.title}<span className="block text-[11px] text-muted-foreground">{doc.document_type}{doc.issue_date ? ` · ${date(doc.issue_date)}` : ""}</span></Link>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", doc.status === "Expired" ? "bg-red-500/10 text-red-700" : doc.status === "Expiring Soon" ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700")}>{doc.status || "Valid"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
