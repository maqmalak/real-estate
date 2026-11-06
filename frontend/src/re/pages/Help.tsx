/**
 * Help & guides (/re/help?m=<manual>): the A4 guides (PDF with light-theme screenshots) and the videos, grouped by the stage
 * of the work, and the manual for each of the signed-in person's roles. Managers see everything. Data: realestate.help.
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BookOpen, Building2, ChevronLeft, ChevronRight, Clock, Coins, Crown, Download, FileText, Gavel, HandCoins, Hammer, LandPlot,
  LifeBuoy, ListTree, Network, PlayCircle, Receipt, Repeat2, Rocket, Search, Settings2, Sparkles, Users, Video, Wrench, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { cn } from "@/re/lib/utils";

interface Guide {
  slug: string; order: number; stage: string; title: string; kind: "Guide" | "Video"; summary: string; roles: string[];
  pdf_url: string | null; video_url: string | null; poster_url: string | null; seconds: number | null; mine: boolean;
}
interface ManualEntry { slug: string; title: string; roles: string[]; mine: boolean }
interface Manual { slug: string; title: string; roles: string[]; html: string; guides: Guide[] }

const STAGE: Record<string, string> = {
  "Start here": "from-sky-500 to-blue-600",
  "Land acquisition": "from-lime-500 to-emerald-600",
  "Sales & collections": "from-emerald-500 to-teal-600",
  "After the sale": "from-rose-500 to-pink-600",
  "Society & development": "from-amber-500 to-orange-600",
  "Documents, reports & portal": "from-violet-500 to-purple-600",
};
const grad = (s: string) => STAGE[s] ?? "from-slate-500 to-slate-700";
const ICON: Record<string, LucideIcon> = {
  "process-flow-dfd": Network, setup: Settings2, land: LandPlot, "video-seller-payments": HandCoins, "video-land-reports": Gavel, sales: Building2,
  "video-crm": Users, "video-day": Rocket, collections: Coins, "video-recovery": Receipt, operations: Repeat2, society: Wrench, development: Hammer,
  "documents-reports": FileText, "generated-documents": FileText, portal: LifeBuoy,
};
const MANUAL_ICON: Record<string, LucideIcon> = {
  "getting-started": Rocket, "land-manager": LandPlot, sales: Building2, accounts: Coins, recovery: Receipt, society: Wrench, projects: Hammer, admin: Crown,
};
const mmss = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
type Kind = "all" | "Guide" | "Video";

function Poster({ g, onPlay, big }: { g: Guide; onPlay: (g: Guide) => void; big?: boolean }) {
  const Icon = ICON[g.slug] ?? (g.kind === "Video" ? PlayCircle : FileText);
  if (g.poster_url)
    return (
      <button type="button" onClick={() => onPlay(g)} className="relative block aspect-video w-full overflow-hidden bg-muted" aria-label={`Play ${g.title}`}>
        <img src={g.poster_url} alt="" loading="lazy" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.04]" />
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/5 to-transparent" />
        <span className="absolute inset-0 grid place-items-center">
          <span className={cn("grid place-items-center rounded-full bg-white/95 text-slate-900 shadow-xl ring-8 ring-white/25 transition group-hover:scale-110", big ? "size-16" : "size-12")}>
            <PlayCircle className={big ? "size-9" : "size-7"} />
          </span>
        </span>
        {g.seconds ? <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-950/75 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur"><Clock className="size-3" />{mmss(g.seconds)}</span> : null}
      </button>
    );
  return (
    <div className={cn("relative grid aspect-video place-items-center overflow-hidden bg-gradient-to-br text-white", grad(g.stage))}>
      <span className="absolute -right-8 -top-8 size-32 rounded-full bg-white/15" />
      <span className="absolute -bottom-10 -left-6 size-28 rounded-full bg-black/10" />
      <span className="relative grid place-items-center gap-2 text-center">
        <span className={cn("grid place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur", big ? "size-20" : "size-16")}><Icon className={big ? "size-10" : "size-8"} /></span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">A4 guide · PDF</span>
      </span>
    </div>
  );
}

function GuideCard({ g, onPlay }: { g: Guide; onPlay: (g: Guide) => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl">
      <Poster g={g} onPlay={onPlay} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", g.kind === "Video" ? "bg-rose-500/10 text-rose-600" : "bg-sky-500/10 text-sky-700")}>
            {g.kind === "Video" ? <Video className="size-3" /> : <BookOpen className="size-3" />}{g.kind}
          </span>
          {g.pdf_url && g.video_url && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">+ Video</span>}
          {g.mine && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><Sparkles className="size-3" />Your role</span>}
        </div>
        <h3 className="font-semibold leading-snug">{g.title}</h3>
        <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">{g.summary}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {g.pdf_url && (
            <a href={g.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
              <BookOpen className="size-3.5" />Open guide
            </a>
          )}
          {g.video_url && (
            <button type="button" onClick={() => onPlay(g)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:border-primary/40 hover:bg-primary/5">
              <PlayCircle className="size-3.5" />Watch{g.seconds ? ` · ${mmss(g.seconds)}` : ""}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Featured({ g, onPlay }: { g: Guide; onPlay: (g: Guide) => void }) {
  const Icon = ICON[g.slug] ?? FileText;
  return (
    <article className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:flex-nowrap sm:p-5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 via-sky-500 to-indigo-600" />
      <span className={cn("relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-lg", grad(g.stage))}>
        <span className="absolute -right-3 -top-3 size-8 rounded-full bg-white/20" /><Icon className="relative size-7" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700"><Sparkles className="size-3" />Start here</span>
          <h2 className="text-base font-bold tracking-tight">{g.title}</h2>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{g.summary}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-md transition hover:-translate-y-0.5"><BookOpen className="size-4" />Open<ArrowRight className="size-3.5" /></a>}
        {g.pdf_url && <a href={g.pdf_url} download className="grid size-9 place-items-center rounded-xl border transition hover:bg-muted" title="Download PDF" aria-label="Download PDF"><Download className="size-4" /></a>}
        {g.video_url && <button type="button" onClick={() => onPlay(g)} className="grid size-9 place-items-center rounded-xl border transition hover:bg-muted" aria-label="Watch"><PlayCircle className="size-4" /></button>}
      </div>
    </article>
  );
}

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const manual = params.get("m");
  const tab = manual || params.get("tab") === "manuals" ? "manuals" : "guides";
  const [find, setFind] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [stage, setStage] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Guide | null>(null);
  const guides = useQuery({ queryKey: ["re-help-guides"], queryFn: () => get<Guide[]>("realestate.help.guides") });
  const manuals = useQuery({ queryKey: ["re-help-manuals"], queryFn: () => get<ManualEntry[]>("realestate.help.manuals") });
  const current = manual ?? manuals.data?.find((m) => m.mine && m.slug !== "getting-started")?.slug ?? "getting-started";
  const doc = useQuery({ queryKey: ["re-help-manual", current], enabled: tab === "manuals", queryFn: () => get<Manual>("realestate.help.manual", { slug: current }) });

  const all = useMemo(() => guides.data ?? [], [guides.data]);
  const videos = useMemo(() => all.filter((g) => g.video_url), [all]);
  const stages = useMemo(() => [...new Set(all.map((g) => g.stage))], [all]);
  const featured = all.find((g) => g.slug === "process-flow-dfd");
  const filtering = Boolean(find.trim() || kind !== "all" || stage);
  const groups = useMemo(() => {
    const q = find.trim().toLowerCase();
    const map = new Map<string, Guide[]>();
    for (const g of all) {
      if (!filtering && g === featured) continue;
      if (q && !`${g.title} ${g.summary} ${g.stage}`.toLowerCase().includes(q)) continue;
      if (kind === "Video" ? !g.video_url : kind === "Guide" ? !g.pdf_url : false) continue;
      if (stage && g.stage !== stage) continue;
      map.set(g.stage, [...(map.get(g.stage) ?? []), g]);
    }
    return [...map.entries()];
  }, [all, find, kind, stage, filtering, featured]);
  const shown = groups.reduce((n, [, r]) => n + r.length, 0);
  const go = (next: Record<string, string | null>) => setParams((p) => { const n = new URLSearchParams(p); Object.entries(next).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return n; }, { replace: true });

  // player: Esc closes, ← → step through the videos
  const at = playing ? videos.findIndex((v) => v.slug === playing.slug) : -1;
  const step = (d: number) => { if (at >= 0 && videos.length) setPlaying(videos[(at + d + videos.length) % videos.length]); };
  useEffect(() => {
    if (!playing) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPlaying(null); if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // manual: h2 headings become the "On this page" list
  const toc = useMemo(() => {
    if (!doc.data?.html) return { html: "", items: [] as { id: string; text: string }[] };
    const items: { id: string; text: string }[] = [];
    const html = doc.data.html.replace(/<h2([^>]*)>(.*?)<\/h2>/g, (_m, attrs: string, inner: string) => {
      const id = `sec-${items.length + 1}`;
      items.push({ id, text: inner.replace(/<[^>]+>/g, "") });
      return `<h2${attrs.replace(/\sid="[^"]*"/, "")} id="${id}">${inner}</h2>`;
    });
    return { html, items };
  }, [doc.data?.html]);

  const totalMin = Math.round(videos.reduce((s, v) => s + (v.seconds ?? 0), 0) / 60);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl shadow-indigo-900/20 sm:p-8"
        style={{ background: "radial-gradient(circle at 88% 0%, rgb(45 212 191 / .35), transparent 45%), radial-gradient(circle at 0% 100%, rgb(129 140 248 / .45), transparent 50%), linear-gradient(135deg, #0f1e3a, #1e3a8a 55%, #0f766e)" }}>
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300"><LifeBuoy className="size-4" />Help &amp; guides</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Learn every step, from khasra to collected installment</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-blue-100/90">Step-by-step A4 guides with screenshots, a short video of every operation, and the manual for your role.</p>
          </div>
          <div className="flex rounded-2xl bg-white/10 p-1 ring-1 ring-white/20 backdrop-blur">
            {([["guides", "Guides & videos", PlayCircle], ["manuals", "Manuals", BookOpen]] as const).map(([k, label, I]) => (
              <button key={k} type="button" onClick={() => go({ tab: k === "manuals" ? "manuals" : null, m: null })}
                className={cn("inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition", tab === k ? "bg-white text-slate-900 shadow" : "text-white/85 hover:text-white")}>
                <I className="size-4" />{label}
              </button>
            ))}
          </div>
        </div>
        {tab === "guides" && (
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
            <label className="relative block w-full max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search guides and videos — e.g. receipt, transfer, khasra…"
                className="h-12 w-full rounded-2xl border-0 bg-white pl-12 pr-10 text-[15px] text-slate-900 shadow-lg outline-none ring-4 ring-white/15 placeholder:text-slate-400 focus:ring-white/40" />
              {find && <button type="button" onClick={() => setFind("")} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Clear search"><X className="size-4" /></button>}
            </label>
            <div className="flex gap-7 text-sm">
              {([[all.filter((g) => g.pdf_url).length, "guides"], [videos.length, "videos"], [totalMin, "min of video"], [manuals.data?.length ?? 0, "manuals"]] as const).map(([n, l]) => (
                <span key={l}><b className="block text-2xl font-bold tabular-nums leading-none">{n}</b><span className="text-xs text-blue-100/80">{l}</span></span>
              ))}
            </div>
          </div>
        )}
      </section>

      {tab === "guides" ? (
        <>
          {/* filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border bg-card p-0.5 shadow-sm">
              {([["all", "All"], ["Guide", "Guides"], ["Video", "Videos"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", kind === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
              ))}
            </div>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            {stages.map((s, i) => {
              const on = stage === s;
              return (
                <button key={s} type="button" onClick={() => setStage(on ? null : s)} aria-pressed={on}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition",
                    on ? cn("border-transparent bg-gradient-to-r text-white shadow-md", grad(s)) : "bg-card hover:border-primary/40")}>
                  <span className={cn("grid size-4 place-items-center rounded-full text-[9px] font-bold text-white", on ? "bg-white/25" : cn("bg-gradient-to-br", grad(s)))}>{i + 1}</span>{s}
                </button>
              );
            })}
            {filtering && (
              <button type="button" onClick={() => { setFind(""); setKind("all"); setStage(null); }} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3.5" />Clear · {shown} shown
              </button>
            )}
          </div>

          {guides.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div>
          ) : (
            <>
              {!filtering && featured && <Featured g={featured} onPlay={setPlaying} />}
              {!groups.length && (
                <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center">
                  <Search className="mb-3 size-10 text-muted-foreground/50" />
                  <p className="font-semibold">Nothing matches{find ? ` “${find}”` : ""}</p>
                  <p className="text-sm text-muted-foreground">Try another word, or clear the filters.</p>
                </div>
              )}
              {groups.map(([s, rows]) => {
                const vids = rows.filter((r) => r.video_url).length;
                return (
                  <section key={s} className="space-y-3.5">
                    <div className="flex items-center gap-3">
                      <span className={cn("grid size-9 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-md", grad(s))}>{stages.indexOf(s) + 1}</span>
                      <div>
                        <h2 className="text-base font-bold leading-tight">{s}</h2>
                        <p className="text-xs text-muted-foreground">{rows.length} item{rows.length > 1 ? "s" : ""} · {vids} video{vids === 1 ? "" : "s"}</p>
                      </div>
                      <span className="ml-2 h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map((g) => <GuideCard key={g.slug} g={g} onPlay={setPlaying} />)}</div>
                  </section>
                );
              })}
            </>
          )}
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_220px]">
          <nav className="space-y-1 rounded-2xl border bg-card p-2 shadow-sm lg:sticky lg:top-4 lg:self-start" aria-label="Manuals">
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manuals by role</p>
            {(manuals.data ?? []).map((m) => {
              const Icon = MANUAL_ICON[m.slug] ?? BookOpen;
              const on = current === m.slug;
              return (
                <button key={m.slug} type="button" onClick={() => go({ m: m.slug, tab: null })}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition", on ? "bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground shadow-md" : "hover:bg-muted")}>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", on ? "bg-white/20" : "bg-primary/10 text-primary")}><Icon className="size-4" /></span>
                  <span className="flex-1 truncate">{m.title}</span>
                  {m.mine && !on && <span className="rounded-full bg-emerald-500/10 px-1.5 text-[9px] font-bold uppercase text-emerald-700">You</span>}
                </button>
              );
            })}
          </nav>

          <article className="min-w-0 space-y-5">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="h-1.5 bg-gradient-to-r from-sky-500 via-indigo-500 to-teal-500" />
              <div className="p-6 sm:p-8">
                {doc.isLoading || !doc.data ? <Skeleton className="h-96" /> : (
                  <div className="max-w-3xl text-[15px] leading-7 text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:scroll-mt-20 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:font-semibold [&_li::marker]:text-primary [&_li]:my-1.5 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:py-2 [&_th]:border-b-2 [&_th]:py-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6"
                    dangerouslySetInnerHTML={{ __html: toc.html }} />
                )}
              </div>
            </div>
            {doc.data?.guides?.length ? (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-base font-bold"><PlayCircle className="size-5 text-primary" />Guides and videos for this role</h2>
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">{doc.data.guides.map((g) => <GuideCard key={g.slug} g={g} onPlay={setPlaying} />)}</div>
              </section>
            ) : null}
          </article>

          {toc.items.length > 1 && (
            <aside className="hidden xl:block">
              <div className="sticky top-4 rounded-2xl border bg-card p-4 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><ListTree className="size-3.5" />On this page</p>
                <ol className="space-y-0.5 border-l">
                  {toc.items.map((t) => (
                    <li key={t.id}><a href={`#${t.id}`} className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-[13px] text-muted-foreground transition hover:border-primary hover:text-foreground">{t.text}</a></li>
                  ))}
                </ol>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* player */}
      {playing?.video_url && createPortal(
        <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={playing.title}
          onClick={(e) => e.target === e.currentTarget && setPlaying(null)}>
          <div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center gap-3 border-b px-5 py-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white", grad(playing.stage))}><PlayCircle className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{playing.title}</p>
                <p className="truncate text-xs text-muted-foreground">{playing.stage}{playing.seconds ? ` · ${mmss(playing.seconds)}` : ""} · video {at + 1} of {videos.length}</p>
              </div>
              {playing.pdf_url && <a href={playing.pdf_url} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted sm:inline-flex"><BookOpen className="size-3.5" />Guide (PDF)</a>}
              <button type="button" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-lg hover:bg-muted" aria-label="Previous video"><ChevronLeft className="size-5" /></button>
              <button type="button" onClick={() => step(1)} className="grid size-9 place-items-center rounded-lg hover:bg-muted" aria-label="Next video"><ChevronRight className="size-5" /></button>
              <button type="button" onClick={() => setPlaying(null)} className="grid size-9 place-items-center rounded-lg hover:bg-muted" aria-label="Close"><X className="size-5" /></button>
            </div>
            <video key={playing.slug} src={playing.video_url} poster={playing.poster_url ?? undefined} controls autoPlay className="aspect-video max-h-[72vh] w-full bg-black" />
            <p className="px-5 py-3 text-sm text-muted-foreground">{playing.summary}</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
