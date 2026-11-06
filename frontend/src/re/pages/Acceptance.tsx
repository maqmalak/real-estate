/**
 * Acceptance & security checks (/re/acceptance, System Manager): runs realestate.acceptance.run against the live data —
 * land use, geometry, schedules, receipts → ledger, live map, scheduler, WhatsApp, documents, roles, audit trail.
 * Same checks as `bench --site realestate re-acceptance`. Problems are listed first; the tiles filter the list.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Clock, Eye, Loader2, RefreshCw, ShieldCheck, Terminal, TriangleAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { dateTime } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";

type Status = "pass" | "warn" | "fail" | "manual";
interface Result { key: string; title: string; status: Status; detail: string; evidence: string[]; seconds: number }
interface Run { project: string; ran_at: string; results: Result[]; summary: Record<Status, number> }

const ORDER: Status[] = ["fail", "warn", "manual", "pass"];
const LOOK: Record<Status, { icon: typeof CheckCircle2; label: string; text: string; pill: string; edge: string; tile: string; soft: string }> = {
  fail: { icon: XCircle, label: "Failed", text: "text-red-600 dark:text-red-400", pill: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-300",
    edge: "before:bg-gradient-to-b before:from-rose-500 before:to-red-600", tile: "from-rose-500 to-red-600 shadow-red-500/30", soft: "bg-red-500/[0.06]" },
  warn: { icon: TriangleAlert, label: "Warnings", text: "text-amber-600 dark:text-amber-400", pill: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
    edge: "before:bg-gradient-to-b before:from-amber-400 before:to-orange-500", tile: "from-amber-400 to-orange-500 shadow-orange-500/30", soft: "bg-amber-500/[0.06]" },
  manual: { icon: Eye, label: "Check by eye", text: "text-sky-600 dark:text-sky-400", pill: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
    edge: "before:bg-gradient-to-b before:from-sky-400 before:to-blue-600", tile: "from-sky-500 to-blue-600 shadow-sky-500/30", soft: "bg-sky-500/[0.06]" },
  pass: { icon: CheckCircle2, label: "Passed", text: "text-emerald-600 dark:text-emerald-400", pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
    edge: "before:bg-gradient-to-b before:from-emerald-400 before:to-teal-600", tile: "from-emerald-500 to-teal-600 shadow-emerald-500/30", soft: "bg-emerald-500/[0.05]" },
};

function ScoreRing({ pct, tone }: { pct: number; tone: Status }) {
  const r = 34, c = 2 * Math.PI * r;
  const stroke = { fail: "#f43f5e", warn: "#f59e0b", manual: "#38bdf8", pass: "#34d399" }[tone];
  return (
    <div className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute text-center leading-none"><b className="block text-2xl font-bold tabular-nums">{pct}%</b><span className="text-[10px] uppercase tracking-wider text-white/70">passed</span></span>
    </div>
  );
}

export function AcceptancePage() {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["re-acceptance"], queryFn: () => get<Run>("realestate.acceptance.run"), staleTime: Infinity, retry: false,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [only, setOnly] = useState<Status | null>(null);

  const rows = useMemo(() => [...(data?.results ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).filter((r) => !only || r.status === only), [data, only]);
  const total = data?.results.length ?? 0;
  const pct = total ? Math.round(((data?.summary.pass ?? 0) / total) * 100) : 0;
  const tone: Status = data?.summary.fail ? "fail" : data?.summary.warn ? "warn" : "pass";
  const headline = !data ? "Running the checks…" : data.summary.fail ? `${data.summary.fail} check${data.summary.fail > 1 ? "s" : ""} failed — open ${data.summary.fail > 1 ? "them" : "it"} below`
    : data.summary.warn ? "No failures — a few warnings to look at" : "All checks passed";

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl shadow-indigo-900/20 sm:p-7"
        style={{ background: "radial-gradient(circle at 90% 0%, rgb(45 212 191 / .35), transparent 45%), radial-gradient(circle at 0% 100%, rgb(129 140 248 / .45), transparent 50%), linear-gradient(135deg, #0f1e3a, #1e3a8a 55%, #0f766e)" }}>
        <div className="flex flex-wrap items-center gap-5">
          <div className="grid size-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur"><ShieldCheck className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300">Acceptance &amp; security · spec §7 and §9</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{headline}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-blue-100/90">
              {data && <span>{data.project}</span>}
              {data && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{dateTime(data.ran_at)}</span>}
              <span>Checked against live data · read-only</span>
            </p>
          </div>
          {data && <ScoreRing pct={pct} tone={tone} />}
          <button type="button" onClick={() => void refetch()} disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-70">
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Run again
          </button>
        </div>
      </section>

      {/* status tiles = filters */}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ORDER.map((s) => {
            const L = LOOK[s], n = data.summary[s] ?? 0, active = only === s;
            return (
              <button key={s} type="button" onClick={() => setOnly(active ? null : s)} aria-pressed={active}
                className={cn("group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left text-white shadow-lg ring-1 ring-inset ring-white/15 transition hover:-translate-y-0.5 hover:shadow-xl",
                  L.tile, only && !active && "opacity-45 saturate-50", active && "ring-2 ring-white/70")}>
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
                <span aria-hidden className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-white/10" />
                <L.icon className="relative size-5" />
                <b className="relative mt-2 block text-3xl font-bold tabular-nums">{n}</b>
                <span className="relative text-sm font-medium text-white/90">{L.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* checks */}
      {error ? <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">{(error as Error).message}</div>
        : !data ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        : !rows.length ? <Empty title="No checks" /> : (
          <div className="space-y-2.5">
            {only && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                Showing {rows.length} {LOOK[only].label.toLowerCase()} · <button type="button" className="font-medium text-primary hover:underline" onClick={() => setOnly(null)}>show all {total}</button>
              </p>
            )}
            {rows.map((r) => {
              const L = LOOK[r.status];
              const expanded = open === r.key;
              return (
                <div key={r.key}
                  className={cn("relative overflow-hidden rounded-2xl border bg-card transition before:absolute before:inset-y-0 before:left-0 before:w-1.5", L.edge, expanded && "ring-1 ring-primary/20")}>
                  <button className="flex w-full items-start gap-3.5 py-4 pl-5 pr-4 text-left transition hover:bg-muted/40" onClick={() => setOpen(expanded ? null : r.key)} aria-expanded={expanded}>
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", L.soft)}><L.icon className={cn("size-5", L.text)} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold leading-snug">{r.title}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", L.pill)}>{L.label.replace(/s$/, "")}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{r.detail}</span>
                    </span>
                    <span className="hidden shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground sm:block">{r.seconds}s</span>
                    <ChevronDown className={cn("mt-2.5 size-4 shrink-0 text-muted-foreground transition", expanded && "rotate-180")} />
                  </button>
                  {expanded && r.evidence.length > 0 && (
                    <ul className={cn("space-y-1.5 border-t px-5 py-3.5 sm:pl-[4.6rem]", L.soft)}>
                      {r.evidence.map((e, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                          <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", L.text.replace("text-", "bg-").split(" ")[0])} />
                          <span className="min-w-0 break-words">{e}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

      <p className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
        <Terminal className="size-3.5 shrink-0" /> Command line: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">bench --site realestate re-acceptance --verbose</code> — exits with code 1 when a check fails.
      </p>
    </div>
  );
}
