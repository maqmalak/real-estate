/**
 * Khasra map for /re/land: every parcel coloured by acquisition stage over satellite or map tiles, with the project
 * boundary and the society blocks for reference. Hover for owners and area, click to open the parcel panel.
 */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapLayerMouseEvent, type StyleSpecification } from "maplibre-gl";
import { Layers, LandPlot, Satellite } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LandParcel } from "@/re/lib/land";
import { LAYER_COLORS, kanal } from "@/re/lib/land";
import { useMapData } from "@/re/lib/plots";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

type Base = "satellite" | "map";
const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

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

export function LandMap({ parcels, selected, onSelect, height = 460, filter }: {
  parcels: LandParcel[]; selected: string | null; onSelect: (name: string) => void; height?: number; filter?: string | null;
}) {
  const { data } = useMapData();
  const { dark } = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [base, setBase] = useState<Base>("satellite");
  const [showBlocks, setShowBlocks] = useState(true);
  const [ready, setReady] = useState(0);
  const pick = useRef(onSelect);
  pick.current = onSelect;

  const fc = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: parcels.filter((p) => p.geojson).map((p): Feature => ({
      type: "Feature", geometry: p.geojson as Geometry,
      properties: { name: p.name, label: p.khasra_nos, stage: p.stage, color: p.color, area: p.area_display, owners: p.owners.slice(0, 3).join(", ") + (p.owners.length > 3 ? " …" : ""),
        me: p.name === selected ? 1 : 0, dim: filter && p.layer !== filter ? 1 : 0, cases: p.open_cases.length },
    })),
  }), [parcels, selected, filter]);
  const blocks = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection", features: (data?.blocks ?? []).filter((b) => b.geojson).map((b): Feature => ({ type: "Feature", geometry: b.geojson as Geometry, properties: { name: b.name } })),
  }), [data]);
  const boundary = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection", features: data?.project?.boundary_geojson ? [{ type: "Feature", geometry: data.project.boundary_geojson, properties: {} }] : [],
  }), [data]);

  useEffect(() => {
    if (!el.current || !fc.features.length) return;
    const bounds = new maplibregl.LngLatBounds();
    fc.features.forEach((f) => extend(bounds, f.geometry));
    const m = new maplibregl.Map({ container: el.current, style: style(base, dark), bounds, fitBoundsOptions: { padding: 30, maxZoom: 18 }, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("parcels", { type: "geojson", data: fc });
      m.addSource("blocks", { type: "geojson", data: blocks });
      m.addSource("boundary", { type: "geojson", data: boundary });
      m.addLayer({ id: "parcel-fill", type: "fill", source: "parcels", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "dim"], 1], 0.08, ["==", ["get", "me"], 1], 0.7, 0.45] } });
      m.addLayer({ id: "parcel-line", type: "line", source: "parcels", paint: { "line-color": ["case", ["==", ["get", "me"], 1], "#f97316", "#ffffff"], "line-width": ["case", ["==", ["get", "me"], 1], 4, 1.2] } });
      m.addLayer({ id: "parcel-case", type: "line", source: "parcels", filter: [">", ["get", "cases"], 0], paint: { "line-color": "#dc2626", "line-width": 2.5, "line-dasharray": [1.5, 1] } });
      m.addLayer({ id: "blocks-line", type: "line", source: "blocks", paint: { "line-color": "#fde047", "line-width": 1.6, "line-dasharray": [2, 1.5], "line-opacity": 0.9 } });
      m.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": "#dc2626", "line-width": 2.5, "line-dasharray": [3, 2] } });
      m.addLayer({ id: "parcel-label", type: "symbol", source: "parcels",
        layout: { "text-field": ["get", "label"], "text-size": ["interpolate", ["linear"], ["zoom"], 15, 9, 18, 13], "text-font": ["Open Sans Semibold"] },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,.85)", "text-halo-width": 1.4 } });
      setReady((r) => r + 1);
    });
    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "text-xs" });
    m.on("mousemove", "parcel-fill", (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      m.getCanvas().style.cursor = "pointer";
      pop.setLngLat(e.lngLat).setHTML(`<b>Khasra ${p.label}</b> · ${p.stage}<br/><span style="opacity:.75">${p.area}${p.owners ? ` · ${p.owners}` : ""}${Number(p.cases) ? " · ⚖ in court" : ""}</span>`).addTo(m);
    });
    m.on("mouseleave", "parcel-fill", () => { m.getCanvas().style.cursor = ""; pop.remove(); });
    m.on("click", "parcel-fill", (e: MapLayerMouseEvent) => {
      const n = e.features?.[0]?.properties?.name as string | undefined;
      if (n) pick.current(n);
    });
    map.current = m;
    return () => { pop.remove(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc.features.length > 0, base, dark]);

  useEffect(() => {
    const m = map.current;
    (m?.getSource("parcels") as GeoJSONSource | undefined)?.setData(fc);
    (m?.getSource("blocks") as GeoJSONSource | undefined)?.setData(blocks);
    (m?.getSource("boundary") as GeoJSONSource | undefined)?.setData(boundary);
  }, [fc, blocks, boundary, ready]);
  useEffect(() => {
    const m = map.current;
    if (m?.getLayer("blocks-line")) m.setLayoutProperty("blocks-line", "visibility", showBlocks ? "visible" : "none");
  }, [showBlocks, ready]);
  useEffect(() => {
    const m = map.current;
    const p = parcels.find((x) => x.name === selected);
    if (!m || !p?.geojson) return;
    const b = new maplibregl.LngLatBounds();
    extend(b, p.geojson);
    if (!b.isEmpty()) m.fitBounds(b, { padding: 140, maxZoom: 18, duration: 600 });
  }, [selected, parcels]);

  const totals = parcels.reduce<Record<string, number>>((a, p) => ({ ...a, [p.layer]: (a[p.layer] ?? 0) + p.kanal }), {});
  if (!fc.features.length) {
    return <div className="grid place-items-center rounded-2xl border border-dashed p-10 text-sm text-muted-foreground" style={{ height }}><LandPlot className="mb-1 size-5" />No khasra outlines yet — draw them on the parcel or import KML / GeoJSON.</div>;
  }
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-lime-500 to-emerald-600 text-white shadow-sm"><LandPlot className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">Khasras by acquisition stage</h3>
            <p className="text-[11px] text-muted-foreground">{fc.features.length} khasras · dashed red = project boundary · red dashes on a khasra = court case</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setShowBlocks((v) => !v)} className={cn("rounded-lg border px-2 py-1 text-[11px] font-medium", showBlocks ? "bg-background shadow-sm" : "text-muted-foreground")}>Blocks</button>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {([["satellite", <Satellite key="s" className="size-3" />, "Satellite"], ["map", <Layers key="m" className="size-3" />, "Map"]] as const).map(([k, icon, label]) => (
              <button key={k} type="button" onClick={() => setBase(k)} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium", base === k ? "bg-background shadow-sm" : "text-muted-foreground")}>{icon}{label}</button>
            ))}
          </div>
        </div>
      </header>
      <div className="relative">
        <div ref={el} style={{ height }} className="w-full" />
        <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5 rounded-lg bg-background/90 px-2 py-1.5 text-[11px] shadow backdrop-blur">
          {Object.entries(LAYER_COLORS).filter(([k]) => totals[k]).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: c }} />{k} <b>{kanal(totals[k])}</b></span>
          ))}
        </div>
      </div>
    </section>
  );
}
