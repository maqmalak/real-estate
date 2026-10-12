/**
 * Acceptance & security checks (/re/acceptance, System Manager): runs realestate.acceptance.run against the live data —
 * land use, geometry, schedules, receipts → ledger, live map, scheduler, WhatsApp, documents, roles, audit trail.
 * Same checks as `bench --site realestate re-acceptance`.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Eye, Loader2, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/re/components/ui/button";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { dateTime } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";

type Status = "pass" | "warn" | "fail" | "manual";
interface Result { key: string; title: string; status: Status; detail: string; evidence: string[]; seconds: number }
interface Run { project: string; ran_at: string; results: Result[]; summary: Record<Status, number> }

const LOOK: Record<Status, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  pass: { icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", label: "Pass" },
  warn: { icon: TriangleAlert, cls: "text-amber-600 dark:text-amber-400", label: "Warning" },
  fail: { icon: XCircle, cls: "text-red-600 dark:text-red-400", label: "Fail" },
  manual: { icon: Eye, cls: "text-sky-600 dark:text-sky-400", label: "Check by eye" },
};

export function AcceptancePage() {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["re-acceptance"], queryFn: () => get<Run>("realestate.acceptance.run"), staleTime: Infinity, retry: false,
  });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="size-6 text-primary" /> Acceptance & security</h1>
          <p className="text-sm text-muted-foreground">
            Spec §7 and §9 checked against live data{data ? ` · ${data.project} · ${dateTime(data.ran_at)}` : ""}. Read-only.
          </p>
        </div>
        <Button onClick={() => void refetch()} disabled={isFetching}>{isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Run again</Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["pass", "warn", "fail", "manual"] as const).map((s) => {
            const L = LOOK[s];
            return (
              <div key={s} className="rounded-xl border bg-card p-4">
                <p className={cn("flex items-center gap-1.5 text-sm font-medium", L.cls)}><L.icon className="size-4" />{L.label}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{data.summary[s] ?? 0}</p>
              </div>
            );
          })}
        </div>
      )}

      {error ? <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">{(error as Error).message}</div>
        : !data ? <Skeleton className="h-96" /> : !data.results.length ? <Empty title="No checks" /> : (
          <div className="divide-y rounded-xl border bg-card">
            {data.results.map((r) => {
              const L = LOOK[r.status];
              const expanded = open === r.key;
              return (
                <div key={r.key}>
                  <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50" onClick={() => setOpen(expanded ? null : r.key)} aria-expanded={expanded}>
                    <L.icon className={cn("mt-0.5 size-5 shrink-0", L.cls)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.title}</span>
                      <span className="block text-sm text-muted-foreground">{r.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.seconds}s</span>
                    <ChevronDown className={cn("mt-0.5 size-4 shrink-0 transition", expanded && "rotate-180")} />
                  </button>
                  {expanded && r.evidence.length > 0 && (
                    <ul className="space-y-1 border-t bg-muted/30 px-12 py-3 text-sm">
                      {r.evidence.map((e, i) => <li key={i} className="break-words font-mono text-xs">{e}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      <p className="text-xs text-muted-foreground">Command line: <code>bench --site realestate re-acceptance --verbose</code> (exit code 1 when a check fails).</p>
    </div>
  );
}
