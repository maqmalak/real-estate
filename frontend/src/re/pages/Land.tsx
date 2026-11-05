/**
 * Land acquisition (/re/land): land bank KPIs (Kanal acquired / targeted, paid / payable to sellers, cost per Kanal),
 * khasras on the map by stage, the acquisition pipeline as a board (drag a khasra to move it) or a list, alerts (overdue
 * owners, maturing dues, hearings, registry deadlines, plots planned on land not yet acquired) and the deals.
 * Server: realestate.land_api.overview.
 */
import {
  AlertTriangle, CalendarClock, Coins, FileText, Gavel, HandCoins, LandPlot, LayoutGrid, List, MapPinned, Scale, ScrollText, Ruler, Wallet,
} from "lucide-react";
import { useState, type DragEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { C, DataTable, Highlights, KpiCard, type Highlight } from "@/re/components/analytics/kit";
import { LandMap } from "@/re/components/land/LandMap";
import { ParcelSheet } from "@/re/components/land/ParcelSheet";
import { Panel } from "@/re/components/record/ProjectProfile";
import { GlossyIcon } from "@/components/ui/app-icon";
import { Skeleton } from "@/re/components/ui/skeleton";
import { post } from "@/re/lib/api";
import { date, money } from "@/re/lib/format";
import { LAYER_COLORS, kanal, stageColor, useLandOverview, useMoveParcel, type LandDealRow, type LandOverview, type LandParcel } from "@/re/lib/land";
import { cn } from "@/re/lib/utils";
import { useAuth } from "@/re/providers/auth";
import { humanizeError } from "@/services/frappe";

const BOARD = ["Identified", "Under Negotiation", "Due Diligence", "Token Paid", "Agreement Signed", "Payment in Progress", "Registry / Mutation Done", "Possession Taken", "Acquired", "Disputed", "Dropped"];

export const LAND_LINKS = [
  { label: "Overview", to: "/re/land", icon: LandPlot, hue: "emerald" },
  { label: "Sellers & payments", to: "/re/land/payments", icon: Wallet, hue: "sky" },
  { label: "Due diligence & cases", to: "/re/land/legal", icon: Scale, hue: "violet" },
  { label: "Land deals", to: "/re/d/re-land-deal", icon: ScrollText, hue: "amber" },
  { label: "Khasras", to: "/re/d/re-land-parcel", icon: MapPinned, hue: "teal" },
  { label: "Seller payments", to: "/re/d/re-land-payment", icon: HandCoins, hue: "blue" },
  { label: "Court cases", to: "/re/d/re-land-case", icon: Gavel, hue: "rose" },
  { label: "Land Purchase Status", to: "/re/reports?r=Land%20Purchase%20Status", icon: FileText, hue: "stone" },
];

export function LandHeader({ title, sub, icon: Icon = LandPlot, active }: { title: string; sub: string; icon?: typeof LandPlot; active: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-lime-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/25"><Icon className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {LAND_LINKS.map((l) => (
          <Link key={l.to} to={l.to}
            className={cn("group inline-flex shrink-0 items-center gap-2 rounded-full border bg-card py-1.5 pl-1.5 pr-3 text-xs font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
              active === l.to && "border-primary/60 bg-primary/5 text-primary")}>
            <GlossyIcon icon={l.icon} hue={l.hue} size="sm" /><span>{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function insights(d: LandOverview): Highlight[] {
  const out: Highlight[] = [];
  const pctAcq = d.target_kanal ? (d.acquired_kanal * 100) / d.target_kanal : 0;
  if (d.project_kanal && d.acquired_kanal + 0.01 >= d.project_kanal) {
    out.push({ tone: "good", text: `All ${kanal(d.project_kanal)} of the project's land is acquired — the acquired khasras are the project map. ${kanal(d.target_kanal - d.acquired_kanal)} more (Phase 2) is in the pipeline.` });
  } else {
    out.push({ tone: pctAcq >= 90 ? "good" : "info", text: `${kanal(d.acquired_kanal)} of the ${kanal(d.target_kanal)} target is acquired (${pctAcq.toFixed(0)}%); ${kanal(d.process_kanal)} is in process.` });
  }
  if (d.overdue.length) {
    const total = d.overdue.reduce((a, r) => a + r.balance, 0);
    out.push({ tone: "bad", text: `${d.overdue.length} owner${d.overdue.length > 1 ? "s are" : " is"} past the mature date with ${money(total, { compact: true })} unpaid — oldest since ${date(d.overdue[0].due)}.` });
  }
  if (d.disputed_kanal) out.push({ tone: "warn", text: `${kanal(d.disputed_kanal)} is disputed${d.hearings.length ? `; next hearing ${date(d.hearings[0].next_hearing)} (${d.hearings[0].court})` : ""}.` });
  if (d.conflicts.checked && (d.conflicts.plot_count || d.conflicts.blocks.length)) {
    out.push({ tone: "warn", text: `${d.conflicts.plot_count} plots${d.conflicts.blocks.length ? ` and ${d.conflicts.blocks.length} blocks` : ""} are planned on land not yet acquired — don't sell them before the registry.` });
  }
  if (d.money.per_kanal) out.push({ tone: "info", text: `Average cost ${money(d.money.per_kanal, { compact: true })} per Kanal (${money(d.money.per_marla)} per marla) across ${d.deals.length} deals.` });
  if (d.money.adjusted) out.push({ tone: "info", text: `${money(d.money.adjusted, { compact: true })} of land cost was settled with plots instead of cash.` });
  return out;
}

export function LandPage() {
  const { data: d, isLoading } = useLandOverview();
  const { hasRole } = useAuth();
  const canMove = hasRole("Land Manager");  // System Manager passes hasRole too
  const [params, setParams] = useSearchParams();
  const selected = params.get("parcel");
  const select = (name: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (name) n.set("parcel", name); else n.delete("parcel"); return n; }, { replace: true });
  const [view, setView] = useState<"board" | "list">("board");
  const [layer, setLayer] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const move = useMoveParcel();
  const qc = useQueryClient();

  const header = <LandHeader active="/re/land" title="Land acquisition" sub="Khasra-wise land purchase — land bank, acquisition pipeline, sellers and the map" />;
  if (isLoading || !d) return <div className="space-y-5 p-4 sm:p-6">{header}<div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div><Skeleton className="h-[460px] rounded-2xl" /></div>;

  const pctAcq = d.target_kanal ? (d.acquired_kanal * 100) / d.target_kanal : 0;
  const payable = d.money.net_due;
  const paidPct = payable ? ((d.money.paid + d.money.adjusted) * 100) / payable : 0;

  const onDrop = async (e: DragEvent, stage: string) => {
    e.preventDefault();
    const name = e.dataTransfer.getData("text/parcel");
    const p = d.parcels.find((x) => x.name === name);
    if (!p || p.stage === stage) return;
    try {
      await move(name, stage);
      toast.success(`Khasra ${p.khasra_nos} → ${stage}`);
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };
  const merge = async () => {
    try {
      const r = await post<{ parcels: number; old_area_kanal: number; new_area_kanal: number }>("realestate.land_api.merge_into_boundary", {});
      toast.success(`Boundary = ${r.parcels} acquired khasras (${Number(r.new_area_kanal).toFixed(1)} K, was ${Number(r.old_area_kanal).toFixed(1)} K)`);
      await qc.invalidateQueries({ queryKey: ["map-data"] });
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {header}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={LandPlot} label="Kanal acquired / targeted" value={`${kanal(d.acquired_kanal)} / ${kanal(d.target_kanal)}`}
          sub={d.acquired_kanal + 0.01 >= d.project_kanal ? `Project land ${kanal(d.project_kanal)} fully acquired · ${kanal(d.target_kanal - d.acquired_kanal)} more in the pipeline` : `${pctAcq.toFixed(1)}% acquired · ${kanal(d.process_kanal)} in process`}
          progress={pctAcq} color={C.emerald} />
        <KpiCard icon={Coins} label="Paid to sellers" value={money(d.money.paid + d.money.adjusted, { compact: true })}
          sub={`of ${money(payable, { compact: true })} payable · ${paidPct.toFixed(0)}%${d.money.adjusted ? ` · ${money(d.money.adjusted, { compact: true })} in plots` : ""}`} progress={paidPct} color={C.sky} to="/re/land/payments" />
        <KpiCard icon={Wallet} label="Balance owed to sellers" value={money(d.money.balance, { compact: true })} sub={d.overdue.length ? `${d.overdue.length} owners overdue` : "Nothing overdue"} color={d.overdue.length ? C.rose : C.amber} to="/re/land/payments" />
        <KpiCard icon={Ruler} label="Average cost" value={`${money(d.money.per_kanal, { compact: true })} / Kanal`} sub={`${money(d.money.per_marla)} per marla · ${d.deals.length} deals`} color={C.violet} />
      </div>

      <Highlights items={insights(d)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LandMap parcels={d.parcels} selected={selected} onSelect={select} filter={layer} />
        <Panel title="Land bank" sub="Targeted land by acquisition status (Kanal)" icon={Scale}
          action={d.can_merge ? <button type="button" onClick={() => setConfirmMerge(true)} className="rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-muted" title="Replace the project boundary with the acquired khasras">Merge into boundary</button> : undefined}>
          {confirmMerge && (
            <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <p className="font-semibold">Replace the project boundary with the acquired khasras?</p>
              <p className="mt-1 text-muted-foreground">
                Acquired land is {kanal(d.acquired_kanal)} of the {kanal(d.target_kanal)} target.{d.acquired_kanal + 0.01 < d.target_kanal ? " The boundary will shrink, and blocks or plots outside it will fail the layout checks." : ""} The old boundary stays in the project's version history.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => { setConfirmMerge(false); void merge(); }} className="rounded-lg bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700">Replace boundary</button>
                <button type="button" onClick={() => setConfirmMerge(false)} className="rounded-lg border bg-background px-2.5 py-1 font-medium hover:bg-muted">Keep current boundary</button>
              </div>
            </div>
          )}
          <div className="flex h-4 overflow-hidden rounded-full bg-muted">
            {d.bank.map((b) => <div key={b.layer} title={`${b.layer}: ${kanal(b.kanal)}`} style={{ width: `${(b.kanal * 100) / Math.max(d.total_kanal, 1)}%`, background: b.color }} />)}
          </div>
          <ul className="mt-3 space-y-1.5">
            {[...d.bank].sort((a, b) => b.kanal - a.kanal).map((b) => (
              <li key={b.layer} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                <span className="min-w-0 flex-1 truncate">{b.layer}<span className="ml-1 text-[11px] text-muted-foreground">{b.parcels} khasras</span></span>
                <span className="shrink-0 font-semibold tabular-nums">{kanal(b.kanal)}</span>
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{((b.kanal * 100) / Math.max(d.target_kanal || d.total_kanal, 1)).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setLayer(null)} className={cn("rounded-full border px-2.5 py-1 text-[11px]", !layer && "bg-primary text-primary-foreground")}>All on map</button>
            {Object.keys(LAYER_COLORS).filter((k) => d.bank.some((b) => b.layer === k)).map((k) => (
              <button key={k} type="button" onClick={() => setLayer(layer === k ? null : k)} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]", layer === k && "ring-2 ring-primary")}>
                <span className="size-2 rounded-full" style={{ background: LAYER_COLORS[k] }} />{k}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <section className="rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <div>
            <h3 className="font-semibold tracking-tight">Acquisition pipeline</h3>
            <p className="text-xs text-muted-foreground">{canMove ? "Drag a khasra to another stage — the agreement stages need the due diligence checks first" : "Khasras by stage"} · click one for owners, payments and papers</p>
          </div>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {([["board", LayoutGrid, "Board"], ["list", List, "List"]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => setView(k)} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", view === k ? "bg-background shadow-sm" : "text-muted-foreground")}><Icon className="size-3.5" />{label}</button>
            ))}
          </div>
        </header>
        {view === "board" ? (
          <div className="flex gap-3 overflow-x-auto p-4 scrollbar-thin">
            {BOARD.map((stage) => {
              const rows = d.parcels.filter((p) => p.stage === stage);
              const area = rows.reduce((a, p) => a + p.kanal, 0);
              if (!rows.length && ["Identified", "Dropped"].includes(stage)) return null;
              return (
                <div key={stage} onDragOver={(e) => canMove && e.preventDefault()} onDrop={(e) => canMove && onDrop(e, stage)}
                  className="flex w-56 shrink-0 flex-col rounded-xl border bg-muted/30">
                  <div className="flex items-center justify-between gap-2 rounded-t-xl border-b px-3 py-2" style={{ background: `${stageColor(stage)}18` }}>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><span className="size-2 shrink-0 rounded-full" style={{ background: stageColor(stage) }} /><span className="truncate">{stage}</span></span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{rows.length} · {kanal(area)}</span>
                  </div>
                  <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto p-2">
                    {rows.map((p) => <ParcelCard key={p.name} p={p} onOpen={() => select(p.name)} draggable={canMove} />)}
                    {!rows.length && <p className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">Drop here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4">
            <DataTable<LandParcel> rows={d.parcels} rowKey={(r) => r.name} dense maxHeight="520px" initialSort={{ key: "khasra_nos", dir: "asc" }}
              cols={[
                { key: "khasra_nos", label: "Khasra", render: (r) => <button type="button" onClick={() => select(r.name)} className="text-left font-medium hover:underline">{r.khasra_nos}<span className="block text-[10px] font-normal text-muted-foreground">{r.mauza}</span></button> },
                { key: "stage", label: "Stage", render: (r) => <span className="inline-flex items-center gap-1.5 text-xs"><span className="size-2 rounded-full" style={{ background: r.color }} />{r.stage}</span> },
                { key: "kanal", label: "Area", align: "right", value: (r) => r.kanal, render: (r) => <span className="tabular-nums">{r.area_display}</span>, bar: { color: (r) => r.color } },
                { key: "owners", label: "Owners", value: (r) => r.owners.length, render: (r) => <span className="text-xs">{r.owners.slice(0, 2).join(", ")}{r.owners.length > 2 ? ` +${r.owners.length - 2}` : ""}</span>, hideSm: true },
                { key: "pending_checks", label: "Checks", align: "center", render: (r) => r.pending_checks ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700">{r.pending_checks} pending</span> : <span className="text-[11px] text-emerald-600">Clear</span> },
                { key: "deals", label: "Deals", value: (r) => r.deals.length, render: (r) => <span className="text-xs">{r.deals.map((x) => x.name).join(", ") || "—"}</span>, hideSm: true },
                { key: "open_cases", label: "Court", align: "center", value: (r) => r.open_cases.length, render: (r) => r.open_cases.length ? <Gavel className="mx-auto size-4 text-red-600" /> : null },
              ]} />
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Owners past the mature date" sub="Balance still unpaid after the mature / extended date" icon={AlertTriangle}>
          <ul className="divide-y text-sm">
            {d.overdue.slice(0, 8).map((r) => (
              <li key={`${r.deal}-${r.ser}`} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/re/d/re-land-deal/${encodeURIComponent(r.deal)}`} className="min-w-0"><span className="block truncate font-medium hover:underline">{r.owner_name}</span><span className="text-[11px] text-muted-foreground">{r.deal} · due {date(r.due)}</span></Link>
                <span className="shrink-0 font-semibold tabular-nums text-red-600">{money(r.balance, { compact: true })}</span>
              </li>
            ))}
            {!d.overdue.length && <li className="py-3 text-muted-foreground">No owner is overdue.</li>}
          </ul>
        </Panel>
        <Panel title="Hearings and deadlines" sub="Court dates in the next three weeks; registry deadlines" icon={CalendarClock}>
          <ul className="divide-y text-sm">
            {d.hearings.map((h) => (
              <li key={h.name} className="flex items-start gap-2 py-2">
                <Gavel className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <Link to={`/re/d/re-land-case/${encodeURIComponent(h.name)}`} className="min-w-0"><span className="block truncate font-medium hover:underline">{h.case_title}</span><span className="text-[11px] text-muted-foreground">{date(h.next_hearing)} · {h.court} · {h.status}</span></Link>
              </li>
            ))}
            {d.deadlines.map((x) => (
              <li key={x.name} className="flex items-start gap-2 py-2">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <Link to={`/re/d/re-land-deal/${encodeURIComponent(x.name)}`} className="min-w-0"><span className="block truncate font-medium hover:underline">Registry deadline — {x.name}</span><span className="text-[11px] text-muted-foreground">{date(x.registry_deadline)} · {x.description}</span></Link>
              </li>
            ))}
            {!d.hearings.length && !d.deadlines.length && <li className="py-3 text-muted-foreground">Nothing coming up.</li>}
          </ul>
        </Panel>
        <Panel title="Planned on land not yet acquired" sub="Blocks and plots outside the acquired khasras" icon={MapPinned}>
          {!d.conflicts.checked ? <p className="text-sm text-muted-foreground">Draw the khasra outlines to check the layout against the acquired land.</p> : (
            <div className="space-y-2 text-sm">
              <p><b className="tabular-nums">{d.conflicts.plot_count}</b> plots and <b className="tabular-nums">{d.conflicts.blocks.length}</b> blocks extend beyond acquired land.</p>
              <div className="flex flex-wrap gap-1.5">
                {d.conflicts.blocks.map((b) => <Link key={b.name} to={`/re/d/re-block/${encodeURIComponent(b.name)}`} className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted">{b.name} · {b.outside_pct}% outside</Link>)}
              </div>
              <div className="flex flex-wrap gap-1">
                {d.conflicts.plots.slice(0, 18).map((x) => <Link key={x.name} to={`/re/plots/${encodeURIComponent(x.name)}`} className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", x.status === "Available" ? "bg-muted" : "bg-red-500/10 text-red-700")}>{x.name}</Link>)}
                {d.conflicts.plot_count > 18 && <span className="text-[11px] text-muted-foreground">+{d.conflicts.plot_count - 18} more</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">Red = already booked or sold on land that is not yet registered.</p>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Land deals" sub="Deal sheet with contract status, paid and balance per deal (from the ledger)" icon={ScrollText}>
        <DataTable<LandDealRow> rows={d.deals} rowKey={(r) => r.name} dense maxHeight="460px" initialSort={{ key: "deal_date", dir: "desc" }}
          onRow={(r) => `/re/d/re-land-deal/${encodeURIComponent(r.name)}`}
          cols={[
            { key: "name", label: "Deal", render: (r) => <span className="font-medium">{r.name}<span className="block text-[10px] text-muted-foreground">{date(r.deal_date)}</span></span> },
            { key: "description", label: "Description", render: (r) => <span className="line-clamp-2 text-xs">{r.description}</span> },
            { key: "land_for", label: "Land for", hideSm: true },
            { key: "land_owners_type", label: "Owners", align: "center", render: (r) => <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{r.land_owners_type}</span> },
            { key: "deal_area_sqft", label: "Area", align: "right", value: (r) => r.deal_area_sqft, render: (r) => <span className="tabular-nums">{r.deal_area_display}</span> },
            { key: "net_due_amount", label: "Net due", align: "right", value: (r) => r.net_due_amount, render: (r) => money(r.net_due_amount, { compact: true }) },
            { key: "balance_amount", label: "Balance", align: "right", value: (r) => r.balance_amount, render: (r) => <span className={cn("font-semibold tabular-nums", r.overdue_lines ? "text-red-600" : r.balance_amount <= 0.5 ? "text-emerald-600" : "")}>{money(r.balance_amount, { compact: true })}</span>, bar: { color: C.amber } },
            { key: "status", label: "Status", render: (r) => <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", r.status === "Completed" || r.status === "Closed" ? "bg-emerald-500/10 text-emerald-700" : r.status === "Disputed" || r.status === "Cancelled" ? "bg-red-500/10 text-red-700" : "bg-sky-500/10 text-sky-700")}>{r.status}</span> },
          ]} />
      </Panel>

      <ParcelSheet name={selected} onClose={() => select(null)} canMove={canMove} />
    </div>
  );
}

function ParcelCard({ p, onOpen, draggable }: { p: LandParcel; onOpen: () => void; draggable: boolean }) {
  return (
    <button type="button" onClick={onOpen} draggable={draggable} onDragStart={(e) => e.dataTransfer.setData("text/parcel", p.name)}
      className="group w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">Khasra {p.khasra_nos}</span>
        {p.open_cases.length > 0 && <Gavel className="size-3.5 shrink-0 text-red-600" />}
      </div>
      <p className="text-[11px] text-muted-foreground">{p.area_display} · {p.mauza.replace("Mauza ", "")}</p>
      <p className="mt-1 truncate text-[11px]">{p.owners.slice(0, 2).join(", ")}{p.owners.length > 2 ? ` +${p.owners.length - 2}` : ""}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {p.pending_checks > 0 && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{p.pending_checks} checks</span>}
        {p.deals.slice(0, 2).map((x) => <span key={x.name} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{x.name}</span>)}
      </div>
    </button>
  );
}
