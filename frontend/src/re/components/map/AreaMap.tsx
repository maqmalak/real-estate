/**
 * Map of one block or one plot on its record page. Block: its outline and every plot in it, coloured by status or payment.
 * Plot: the plot highlighted among its block's plots, with the roads and buildings around it. Satellite / map basemap,
 * hover for details, click a plot to open it. Uses the society map data already cached by useMapData().
 */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapLayerMouseEvent, type StyleSpecification } from "maplibre-gl";
import { Expand, Layers, MapPin, Satellite } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/re/components/ui/skeleton";
import { money } from "@/re/lib/format";
import { PAY_COLORS, STATUS_COLORS, useMapData } from "@/re/lib/plots";
import type { MapData } from "@/re/lib/types";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

type Base = "satellite" | "map";
type Paint = "status" | "payment";
const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const HIGHLIGHT = "#f59e0b";

function style(base: Base, dark: boolean): StyleSpecification {
  const esri = (s: string) => [`https://server.arcgisonline.com/ArcGIS/rest/services/${s}/MapServer/tile/{z}/{y}/{x}`];
  const tiles = base === "satellite" ? esri("World_Imagery") : esri(dark ? "Canvas/World_Dark_Gray_Base" : "Canvas/World_Light_Gray_Base");
  return {
    version: 8, glyphs: GLYPHS,
    sources: { base: { type: "raster", tiles, tileSize: 256, maxzoom: base === "satellite" ? 19 : 16, attribution: "Tiles © Esri" } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

function extend(b: maplibregl.LngLatBounds, g: Geometry | null) {
  if (!g) return;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") b.extend(c as [number, number]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  if (g.type === "GeometryCollection") g.geometries.forEach((x) => extend(b, x));
  else walk((g as { coordinates: Position | Position[] }).coordinates);
}

function collections(data: MapData, block?: string, plot?: string, paint: Paint = "status") {
  const target = plot ? data.plots.find((p) => p.name === plot) : undefined;
  const blk = block ?? target?.block;
  const plots = data.plots.filter((p) => p.geojson && (!blk || p.block === blk));
  const colour = (p: (typeof plots)[number]) => paint === "payment"
    ? (p.payment_status ? PAY_COLORS[p.payment_status] : p.status === "Available" ? "#94a3b8" : "#cbd5e1")
    : STATUS_COLORS[p.status] ?? "#9ca3af";
  const fc = (fs: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features: fs });
  return {
    target, blk,
    plots: fc(plots.map((p) => ({ type: "Feature", geometry: p.geojson as Geometry, properties: {
      name: p.name, label: p.name.split("-").pop() ?? p.name, status: p.status, pay: p.payment_status ?? "", customer: p.customer_name ?? "",
      size: p.plot_size, price: p.list_price, color: colour(p), me: p.name === plot ? 1 : 0,
    } }))),
    block: fc(data.blocks.filter((b) => b.name === blk && b.geojson).map((b) => ({ type: "Feature", geometry: b.geojson as Geometry, properties: { color: b.color, name: b.name } }))),
    features: fc(data.features.filter((f) => f.geojson).map((f) => ({ type: "Feature", geometry: f.geojson as Geometry, properties: { color: f.color ?? "#64748b", name: f.feature_name, type: f.feature_type } }))),
    colour: data.blocks.find((b) => b.name === blk)?.color ?? "#3b82f6",
  };
}

export function AreaMap({ block, plot, height = 420, title }: { block?: string; plot?: string; height?: number; title?: string }) {
  const { data, isLoading } = useMapData();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [base, setBase] = useState<Base>("satellite");
  const [paint, setPaint] = useState<Paint>("status");
  const [ready, setReady] = useState(0);
  const sets = useMemo(() => (data ? collections(data, block, plot, paint) : null), [data, block, plot, paint]);

  // (re)create the map when the basemap changes
  useEffect(() => {
    if (!el.current || !sets) return;
    const bounds = new maplibregl.LngLatBounds();
    if (sets.target?.geojson) extend(bounds, sets.target.geojson);
    else sets.block.features.forEach((f) => extend(bounds, f.geometry));
    if (bounds.isEmpty()) sets.plots.features.forEach((f) => extend(bounds, f.geometry));
    if (bounds.isEmpty()) return;
    const m = new maplibregl.Map({
      container: el.current, style: style(base, dark), bounds,
      fitBoundsOptions: { padding: plot ? Math.round(Math.min(120, height / 4)) : 30, maxZoom: plot ? 18.6 : 18 }, attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("features", { type: "geojson", data: sets.features });
      m.addSource("block", { type: "geojson", data: sets.block });
      m.addSource("plots", { type: "geojson", data: sets.plots });
      m.addLayer({ id: "feat-fill", type: "fill", source: "features", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 } });
      m.addLayer({ id: "feat-line", type: "line", source: "features", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.7 } });
      m.addLayer({ id: "block-line", type: "line", source: "block", paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [2, 1.5] } });
      m.addLayer({ id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "me"], 1], 0.85, plot ? 0.4 : 0.6] } });
      m.addLayer({ id: "plots-line", type: "line", source: "plots", paint: { "line-color": base === "satellite" ? "#ffffff" : "#334155", "line-width": 0.8, "line-opacity": 0.8 } });
      m.addLayer({ id: "plot-me", type: "line", source: "plots", filter: ["==", ["get", "me"], 1], paint: { "line-color": HIGHLIGHT, "line-width": 4 } });
      m.addLayer({ id: "plots-label", type: "symbol", source: "plots", minzoom: 17,
        layout: { "text-field": ["get", "label"], "text-size": ["interpolate", ["linear"], ["zoom"], 17, 9, 19, 12], "text-font": ["Open Sans Semibold"], "text-allow-overlap": false },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,.85)", "text-halo-width": 1.4 } });
      setReady((r) => r + 1);
    });
    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "text-xs" });
    m.on("mousemove", "plots-fill", (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      m.getCanvas().style.cursor = "pointer";
      pop.setLngLat(e.lngLat).setHTML(
        `<b>${p.name}</b> · ${p.status}${p.pay ? ` · ${p.pay}` : ""}<br/><span style="opacity:.75">${p.size} · ${money(Number(p.price), { compact: true })}${p.customer ? ` · ${p.customer}` : ""}</span>`,
      ).addTo(m);
    });
    m.on("mouseleave", "plots-fill", () => { m.getCanvas().style.cursor = ""; pop.remove(); });
    m.on("click", "plots-fill", (e: MapLayerMouseEvent) => {
      const n = e.features?.[0]?.properties?.name as string | undefined;
      if (n && n !== plot) navigate(`/re/d/re-plot/${encodeURIComponent(n)}`);
    });
    map.current = m;
    return () => { pop.remove(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(sets), base, dark, block, plot]);

  // recolour without rebuilding the map
  useEffect(() => {
    const src = map.current?.getSource("plots") as GeoJSONSource | undefined;
    if (src && sets) src.setData(sets.plots);
  }, [sets, ready]);

  if (isLoading) return <Skeleton className="w-full rounded-2xl" style={{ height }} />;
  if (!sets || (!sets.target?.geojson && !sets.block.features.length && !sets.plots.features.length)) {
    return <div className="grid place-items-center rounded-2xl border border-dashed p-8 text-sm text-muted-foreground"><MapPin className="mb-1 size-5" />No map geometry yet — import the survey (KML / GeoJSON) to draw it.</div>;
  }
  const legend = paint === "status" ? STATUS_COLORS : PAY_COLORS;
  const counts = sets.plots.features.reduce<Record<string, number>>((a, f) => {
    const k = String(paint === "status" ? f.properties?.status : f.properties?.pay || "Not booked");
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg text-white shadow-sm" style={{ background: sets.colour }}><MapPin className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">{title ?? (plot ? `${plot} on the map` : `${block} map`)}</h3>
            <p className="text-[11px] text-muted-foreground">{sets.blk} · {sets.plots.features.length} plots{plot ? " · click a neighbour to open it" : " · click a plot to open it"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Seg value={paint} onChange={setPaint} options={[["status", "Status"], ["payment", "Payment"]]} />
          <Seg value={base} onChange={setBase} options={[["satellite", <span key="s" className="inline-flex items-center gap-1"><Satellite className="size-3" />Satellite</span>], ["map", <span key="m" className="inline-flex items-center gap-1"><Layers className="size-3" />Map</span>]]} />
          <Link to={plot ? `/re/plots/${encodeURIComponent(plot)}` : "/re/map"} title="Open the society map"
            className="grid size-7 place-items-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground"><Expand className="size-3.5" /></Link>
        </div>
      </header>
      <div className="relative">
        <div ref={el} style={{ height }} className="w-full" />
        <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5 rounded-lg bg-background/85 px-2 py-1.5 text-[11px] shadow backdrop-blur">
          {Object.entries(legend).filter(([k]) => counts[k]).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: c }} />{k} <b>{counts[k]}</b></span>
          ))}
          {plot && <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm border-2" style={{ borderColor: HIGHLIGHT }} />This plot</span>}
        </div>
      </div>
    </section>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, React.ReactNode][] }) {
  return (
    <div className="flex rounded-lg border bg-muted/40 p-0.5">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cn("rounded-md px-2 py-1 text-[11px] font-medium transition", value === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {label}
        </button>
      ))}
    </div>
  );
}
