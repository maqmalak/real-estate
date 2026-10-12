import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, PencilRuler, SlidersHorizontal } from "lucide-react";
import type { Map as MLMap } from "maplibre-gl";
import type { Geometry } from "geojson";
import { useCallback, useMemo, useState } from "react";
import { GoogleSocietyMap } from "@/re/components/map/GoogleSocietyMap";
import { FeatureSheet } from "@/re/components/map/FeatureSheet";
import { MapEditor } from "@/re/components/map/MapEditor";
import { useAuth } from "@/re/providers/auth";
import { LAYER_GROUPS, SocietyMap, type BaseStyle } from "@/re/components/map/SocietyMap";
import { PlotFilterPanel } from "@/re/components/plot/PlotFilters";
import { PlotSheet } from "@/re/components/plot/PlotSheet";
import { Button } from "@/re/components/ui/button";
import { Label, Select } from "@/re/components/ui/input";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { useRealtime } from "@/re/lib/realtime";
import type { MapData, PaymentStatus, PlotStatus } from "@/re/lib/types";
import { PAY_COLORS, STATUS_COLORS, plotMatches, useFilterOptions, useMapData, useMapTasks, usePlotFilters, type ColorBy } from "@/re/lib/plots";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

const STYLES: { key: BaseStyle; label: string }[] = [
  { key: "default", label: "Default" }, { key: "streets", label: "Streets" }, { key: "terrain", label: "Terrain" }, { key: "satellite", label: "Satellite" },
];

interface MapConfig { provider: "google" | "maplibre"; google_key: string | null; google_map_id: string | null; google_available: boolean }

export function MapPage() {
  const { data: cfg } = useQuery({ queryKey: ["map-config"], queryFn: () => get<MapConfig>("realestate.spa.map_config"), staleTime: 600_000 });
  const [provider, setProvider] = useState<"google" | "maplibre">();
  const useGoogle = (provider ?? cfg?.provider) === "google" && Boolean(cfg?.google_key);
  const qc = useQueryClient();
  // Plot colours follow status changes live (publish_realtime "re_plot_status"); poll every 20 s if the socket is down.
  const live = useRealtime<{ plots: { name: string; status: PlotStatus; payment_status: PaymentStatus | null; customer_name: string | null }[] }>("re_plot_status", (msg) => {
    const known = qc.getQueryData<MapData>(["map-data"]);
    if (!known || msg.plots.some((u) => !known.plots.some((p) => p.name === u.name))) {
      void qc.invalidateQueries({ queryKey: ["map-data"] });
      return;
    }
    qc.setQueryData<MapData>(["map-data"], {
      ...known,
      plots: known.plots.map((p) => {
        const u = msg.plots.find((x) => x.name === p.name);
        return u ? { ...p, status: u.status, payment_status: u.payment_status, customer_name: u.customer_name } : p;
      }),
    });
  });
  const { data, isLoading } = useMapData(live ? false : 20_000);
  const { data: tasks } = useMapTasks(data?.project.name);
  const { data: opts } = useFilterOptions();
  const { dark } = useTheme();
  const [filters, set, clear] = usePlotFilters();
  const [style, setStyle] = useState<BaseStyle>("default");
  const [colorBy, setColorBy] = useState<ColorBy>("payment");
  const [visible, setVisible] = useState(() => new Set(LAYER_GROUPS.map((l) => l.key)));
  const [panel, setPanel] = useState<"filters" | "layers" | null>(() => (window.innerWidth >= 768 ? "filters" : null)); // phones start with the map
  const [selected, setSelected] = useState<string>();
  const [mlMap, setMlMap] = useState<MLMap | null>(null);
  const [feature, setFeature] = useState<string>();
  const [editing, setEditing] = useState(false);
  const { hasRole } = useAuth();
  const canEdit = hasRole("Sales Manager", "System Manager", "Projects Manager");

  const typeOf = useMemo(() => {
    const m = new Map(opts?.sizes.map((s) => [s.name, s.plot_type]));
    return (size: string) => m.get(size);
  }, [opts]);
  const matches = useMemo(() => new Set((data?.plots ?? []).filter((p) => plotMatches(p, filters, typeOf)).map((p) => p.name)), [data, filters, typeOf]);

  const geometryFor = useCallback((t: { doctype: string; name: string }): Geometry | null => {
    if (!data) return null;
    if (t.doctype === "RE Plot") return data.plots.find((p) => p.name === t.name)?.geojson ?? null;
    if (t.doctype === "RE Block") return data.blocks.find((b) => b.name === t.name)?.geojson ?? null;
    if (t.doctype === "RE Map Feature") return data.features.find((f) => f.name === t.name)?.geojson ?? null;
    return data.project.boundary_geojson;
  }, [data]);

  const legend = colorBy === "status" ? STATUS_COLORS
    : colorBy === "block" ? Object.fromEntries((data?.blocks ?? []).map((b) => [b.name, b.color]))
      : { Available: "#ffffff", ...PAY_COLORS };

  return (
    <div className="relative flex h-full">
      {panel && (
        <aside className="absolute inset-y-0 left-0 z-10 w-72 overflow-y-auto border-r bg-card p-4 shadow-lg md:static md:shadow-none">
          {panel === "filters" ? (
            <PlotFilterPanel filters={filters} set={set} clear={clear} count={matches.size} total={data?.plots.length ?? 0} />
          ) : (
            <div className="space-y-1">
              <p className="mb-2 font-semibold">Layers</p>
              {LAYER_GROUPS.map((l) => (
                <label key={l.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                  <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={visible.has(l.key)}
                    onChange={(e) => setVisible((v) => { const n = new Set(v); if (e.target.checked) n.add(l.key); else n.delete(l.key); return n; })} />
                  <span className="size-3 rounded-sm border" style={{ background: l.color }} />
                  {l.label}
                </label>
              ))}
            </div>
          )}
        </aside>
      )}
      <div className="relative flex-1">
        {isLoading || !data || !cfg ? <Skeleton className="m-4 h-[calc(100%-2rem)]" /> : useGoogle ? (
          <GoogleSocietyMap data={data} tasks={tasks ?? []} colorBy={colorBy} visible={visible} matches={matches} style={style} dark={dark}
            selected={selected} onPlotClick={setSelected} apiKey={cfg.google_key!} mapId={cfg.google_map_id} />
        ) : (
          <SocietyMap data={data} tasks={tasks ?? []} colorBy={colorBy} visible={visible} matches={matches} style={style} dark={dark}
            selected={selected} onPlotClick={editing ? () => undefined : setSelected} onReady={setMlMap}
            onFeatureClick={editing ? () => undefined : setFeature} />
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Button size="sm" variant={panel === "filters" ? "default" : "outline"} onClick={() => setPanel(panel === "filters" ? null : "filters")}><SlidersHorizontal /> Filters</Button>
          <Button size="sm" variant={panel === "layers" ? "default" : "outline"} onClick={() => setPanel(panel === "layers" ? null : "layers")}><Layers /> Layers</Button>
          <div className="flex rounded-md border-[1.5px] border-input bg-input-bg p-0.5 text-xs shadow">
            {STYLES.map((s) => (
              <button key={s.key} onClick={() => setStyle(s.key)} className={cn("rounded px-2 py-1", style === s.key ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{s.label}</button>
            ))}
          </div>
          {canEdit && !useGoogle && (
            <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}><PencilRuler /> {editing ? "Editing" : "Edit map"}</Button>
          )}
          {cfg?.google_available && (
            <div className="flex rounded-md border-[1.5px] border-input bg-input-bg p-0.5 text-xs shadow" role="radiogroup" aria-label="Map provider">
              {([["maplibre", "Open map"], ["google", "Google"]] as const).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={(useGoogle ? "google" : "maplibre") === k} onClick={() => setProvider(k)}
                  className={cn("rounded px-2 py-1", (useGoogle ? "google" : "maplibre") === k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <span className={cn("absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border bg-card/95 px-2 py-0.5 text-[11px] shadow", live ? "text-emerald-600" : "text-muted-foreground")}
          title={live ? "Plot colours update instantly" : "Live connection unavailable — refreshing every 20 seconds"}>
          ● {live ? "Live" : "Auto-refresh"}
        </span>
        <div className="absolute bottom-8 right-3 w-48 rounded-lg border bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
          <Label htmlFor="color-by" className="text-xs">Colour plots by</Label>
          <Select id="color-by" className="h-8 text-xs" value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="payment">Payment status</option>
            <option value="status">Plot status</option>
            <option value="block">Block</option>
          </Select>
          <div className="mt-2 space-y-1">
            {Object.entries(legend).map(([k, c]) => (
              <p key={k} className="flex items-center gap-2"><span className="size-3 rounded-sm border border-foreground/30" style={{ background: c }} />{k}</p>
            ))}
          </div>
        </div>
      </div>
      {editing && mlMap && data && !useGoogle && <MapEditor map={mlMap} geometryFor={geometryFor} onClose={() => setEditing(false)} />}
      <PlotSheet plot={selected} onClose={() => setSelected(undefined)} />
      <FeatureSheet name={feature} onClose={() => setFeature(undefined)} />
    </div>
  );
}
