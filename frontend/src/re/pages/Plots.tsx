import { Download, LayoutGrid, List, Map as MapIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PriceRevision } from "@/re/components/plot/PriceRevision";
import { PlotCard } from "@/re/components/plot/PlotCard";
import { PlotFilterPanel } from "@/re/components/plot/PlotFilters";
import { PlotSheet } from "@/re/components/plot/PlotSheet";
import { StatusBadge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { money } from "@/re/lib/format";
import { plotMatches, useFilterOptions, useMapData, usePlotFilters } from "@/re/lib/plots";
import { cn } from "@/re/lib/utils";
import { downloadCsv } from "./Lists";

const PAGE = 60;

export function PlotsPage() {
  const { plot } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, isLoading } = useMapData();
  const { data: opts } = useFilterOptions();
  const [filters, set, clear] = usePlotFilters();
  const [view, setView] = useState<"cards" | "table">("cards");
  const [shown, setShown] = useState(PAGE);
  const areaOf = useMemo(() => new Map(opts?.sizes.map((s) => [s.name, s.area_marla])), [opts]);
  const typeOf = useMemo(() => {
    const m = new Map(opts?.sizes.map((s) => [s.name, s.plot_type]));
    return (size: string) => m.get(size);
  }, [opts]);
  const rows = useMemo(() => (data?.plots ?? []).filter((p) => plotMatches(p, filters, typeOf)).sort((a, b) => a.name.localeCompare(b.name)), [data, filters, typeOf]);
  const open = (name: string) => navigate({ pathname: `/re/plots/${name}`, search: params.toString() });

  return (
    <div className="flex h-full">
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-r bg-card p-4 md:block">
        <PlotFilterPanel filters={filters} set={set} clear={clear} count={rows.length} total={data?.plots.length ?? 0} />
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Plots <span className="text-base font-normal text-muted-foreground">({rows.length})</span></h1>
          <div className="flex gap-2">
            <PriceRevision />
            <Button variant="outline" size="sm" onClick={() => downloadCsv("plots.csv", rows, ["name", "block", "plot_size", "status", "payment_status", "customer_name", "list_price", "outstanding_amount", "overdue_amount"])}><Download /> CSV</Button>
            <Button variant="outline" size="sm" asChild><Link to={{ pathname: "/re/map", search: params.toString() }}><MapIcon /> Map</Link></Button>
            <div className="flex rounded-md border-[1.5px] border-input bg-input-bg p-0.5">
              <button aria-label="Cards" onClick={() => setView("cards")} className={cn("rounded p-1.5", view === "cards" && "bg-primary text-primary-foreground")}><LayoutGrid className="size-4" /></button>
              <button aria-label="Table" onClick={() => setView("table")} className={cn("rounded p-1.5", view === "table" && "bg-primary text-primary-foreground")}><List className="size-4" /></button>
            </div>
          </div>
        </div>
        <details className="mb-3 md:hidden">
          <summary className="cursor-pointer text-sm font-medium">Filters</summary>
          <div className="mt-2 rounded-lg border bg-card p-3"><PlotFilterPanel filters={filters} set={set} clear={clear} count={rows.length} total={data?.plots.length ?? 0} /></div>
        </details>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-36" />)}</div>
        ) : !rows.length ? <Empty title="No plots match" hint="Clear some filters." /> : view === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.slice(0, shown).map((p) => <PlotCard key={p.name} p={p} areaMarla={areaOf.get(p.plot_size)} onOpen={() => open(p.name)} />)}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>{["Plot", "Block", "Size", "Status", "Payment", "Owner", "Price", "Due"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((p) => (
                  <tr key={p.name} className="cursor-pointer border-t hover:bg-accent/50" onClick={() => open(p.name)}>
                    <td className="px-3 py-1.5 font-semibold">{p.name}</td><td className="px-3">{p.block}</td><td className="px-3">{p.plot_size}</td>
                    <td className="px-3"><StatusBadge status={p.status} /></td><td className="px-3"><StatusBadge status={p.payment_status} /></td>
                    <td className="px-3">{p.customer_name ?? "—"}</td><td className="px-3">{money(p.list_price, { compact: true })}</td>
                    <td className={cn("px-3", p.overdue_amount ? "text-destructive" : "")}>{p.outstanding_amount ? money(p.outstanding_amount, { compact: true }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && <div className="mt-4 text-center"><Button variant="outline" onClick={() => setShown((s) => s + PAGE)}>Show more</Button></div>}
      </div>
      <PlotSheet plot={plot} onClose={() => navigate({ pathname: "/re/plots", search: params.toString() })} />
    </div>
  );
}

