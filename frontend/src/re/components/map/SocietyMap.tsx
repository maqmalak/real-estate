import type { Feature, FeatureCollection, Geometry } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapLayerMouseEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { PAY_COLORS, STATUS_COLORS, type ColorBy } from "@/re/lib/plots";
import type { MapData, MapTask } from "@/re/lib/types";

export type BaseStyle = "default" | "streets" | "terrain" | "satellite";

export const LAYER_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "boundary", label: "Total boundary", color: "#dc2626" },
  { key: "blocks", label: "Society blocks", color: "#64748b" },
  { key: "plots", label: "Plots", color: "#3b82f6" },
  { key: "Roads and Gates", label: "Roads & gates", color: "#6b7280" },
  { key: "Public Buildings", label: "Public buildings", color: "#22c55e" },
  { key: "Infrastructure", label: "Infrastructure", color: "#eab308" },
  { key: "Waste", label: "Waste area", color: "#a16207" },
  { key: "Water Supply Line", label: "Water supply", color: "#0284c7" },
  { key: "Sewerage Line", label: "Sewerage", color: "#7c3aed" },
  { key: "Electricity Line", label: "Electricity (WAPDA)", color: "#ca8a04" },
  { key: "Internet Cable", label: "Internet cable", color: "#db2777" },
  { key: "maintenance", label: "Open maintenance", color: "#ea580c" },
];

const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

function raster(tiles: string[], attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { base: { type: "raster", tiles, tileSize: 256, attribution, maxzoom } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

/** Keyless basemaps (no API key or billing). Google Maps becomes an extra option once a key is configured (phase E). */
function baseStyle(kind: BaseStyle, dark: boolean): StyleSpecification {
  const esri = (service: string) => [`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`];
  switch (kind) {
    case "streets":
      return raster(["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], "© OpenStreetMap contributors");
    case "terrain":
      return raster(esri("World_Topo_Map"), "Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors");
    case "satellite":
      return raster(esri("World_Imagery"), "Imagery © Esri, Maxar, Earthstar Geographics");
    default:
      return raster(esri(dark ? "Canvas/World_Dark_Gray_Base" : "Canvas/World_Light_Gray_Base"), "Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors", 16);
  }
}

export interface SocietyMapProps {
  data: MapData;
  tasks: MapTask[];
  colorBy: ColorBy;
  visible: Set<string>;
  matches: Set<string>;
  style: BaseStyle;
  dark: boolean;
  selected?: string;
  onPlotClick: (plot: string) => void;
  /** Receives the MapLibre instance once (used by the map editor). */
  onReady?: (map: MLMap) => void;
  /** Clicking a non-plot feature (infrastructure, public building…) — opens its side panel instead of a popup. */
  onFeatureClick?: (docname: string) => void;
}

function fc(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

function feature(geometry: Geometry | null, properties: Record<string, string | number | boolean | null>, id?: number): Feature | null {
  return geometry ? { type: "Feature", id, geometry, properties } : null;
}

const notNull = <T,>(v: T | null): v is T => v !== null;

export function SocietyMap({ data, tasks, colorBy, visible, matches, style, dark, selected, onPlotClick, onReady, onFeatureClick }: SocietyMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const clickRef = useRef(onPlotClick);
  clickRef.current = onPlotClick;
  const featureRef = useRef(onFeatureClick);
  featureRef.current = onFeatureClick;

  const blockColor = useMemo(() => Object.fromEntries(data.blocks.map((b) => [b.name, b.color])), [data.blocks]);

  const sources = useMemo(() => {
    const plots = fc(
      data.plots.map((p, i) =>
        feature(p.geojson, {
          name: p.name, short: p.name.split("-")[1] ?? p.name, status: p.status,
          color: colorBy === "status" ? STATUS_COLORS[p.status] ?? "#9ca3af"
            : colorBy === "block" ? blockColor[p.block] ?? "#64748b"
              : p.status === "Available" ? "#ffffff" : PAY_COLORS[p.payment_status ?? ""] ?? "#9ca3af",
          dim: !matches.has(p.name), selected: p.name === selected,
        }, i + 1),
      ).filter(notNull),
    );
    const feats = data.features.map((f) =>
      feature(f.geojson, {
        name: f.feature_name, docname: f.name, type: f.feature_type, color: f.color ?? "#6b7280",
        group: f.category === "Utility Network" ? f.feature_type : f.category,
        width: f.category === "Roads and Gates" ? Math.max(2, (f.width_ft ?? 30) / 8) : 2,
      }),
    ).filter(notNull);
    return {
      boundary: fc([feature(data.project.boundary_geojson, { name: data.project.name })].filter(notNull)),
      blocks: fc(data.blocks.map((b) => feature(b.geojson, { name: b.name, color: b.color })).filter(notNull)),
      plots,
      features: fc(feats),
      tasks: fc(tasks.map((t) => feature({ type: "Point", coordinates: [t.lng, t.lat] }, {
        name: t.name, subject: t.subject, priority: t.priority, status: t.status,
        color: t.priority === "Urgent" ? "#dc2626" : t.priority === "High" ? "#ea580c" : "#ca8a04",
      })).filter(notNull)),
    };
  }, [data, tasks, colorBy, matches, selected, blockColor]);

  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // create the map once
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle(style, dark),
      center: [data.project.centre_lng, data.project.centre_lat],
      zoom: 16,
      maxZoom: 21,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    m.addControl(new maplibregl.FullscreenControl(), "top-right");
    m.on("style.load", () => addLayers(m));
    m.on("load", () => {
      const b = new maplibregl.LngLatBounds();
      for (const f of sourcesRef.current.boundary.features) {
        if (f.geometry.type === "Polygon") f.geometry.coordinates[0]?.forEach((c) => b.extend(c as [number, number]));
      }
      if (!b.isEmpty()) m.fitBounds(b, { padding: 30, duration: 0 });
    });
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" });
    m.on("click", "plots-fill", (e: MapLayerMouseEvent) => {
      const name = e.features?.[0]?.properties?.name;
      if (typeof name === "string") clickRef.current(name);
    });
    const info = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      if (p.docname && featureRef.current) {
        featureRef.current(String(p.docname));
        return;
      }
      popup.setLngLat(e.lngLat).setHTML(`<b>${String(p.name ?? p.subject)}</b><br/><span style="opacity:.75">${String(p.type ?? `${p.priority} · ${p.status}`)}</span>`).addTo(m);
    };
    for (const id of ["features-fill", "features-line", "features-point", "tasks-point"]) {
      m.on("click", id, info);
      m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
    }
    m.on("mouseenter", "plots-fill", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "plots-fill", () => (m.getCanvas().style.cursor = ""));
    map.current = m;
    onReady?.(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // base style switch keeps our layers (re-added on style.load)
  useEffect(() => {
    // diff: false -> full reload, so "style.load" fires and our layers are added back
    map.current?.setStyle(baseStyle(style, dark), { diff: false });
  }, [style, dark]);

  // data / colour / filter changes
  useEffect(() => {
    const m = map.current;
    // our layers exist once "style.load" has run; isStyleLoaded() stays false while tiles load, which skipped updates
    if (!m || !m.getLayer("plots-fill")) return;
    for (const [id, data] of Object.entries(sources)) (m.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }, [sources]);

  useEffect(() => {
    const m = map.current;
    if (m?.getLayer("plots-fill")) applyVisibility(m, visible);
  }, [visible]);

  // fly to the selected plot
  useEffect(() => {
    const m = map.current;
    const p = data.plots.find((x) => x.name === selected);
    if (!m || !p?.geojson || p.geojson.type !== "Polygon") return;
    const b = new maplibregl.LngLatBounds();
    p.geojson.coordinates[0]?.forEach((c) => b.extend(c as [number, number]));
    m.fitBounds(b, { padding: 120, maxZoom: 19.5, duration: 600 });
  }, [selected, data.plots]);

  function addLayers(m: MLMap) {
    const s = sourcesRef.current;
    for (const [id, data] of Object.entries(s)) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data });
    m.addLayer({ id: "blocks-fill", type: "fill", source: "blocks", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 } });
    m.addLayer({ id: "blocks-line", type: "line", source: "blocks", paint: { "line-color": ["get", "color"], "line-width": 2 } });
    m.addLayer({ id: "features-fill", type: "fill", source: "features", filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5, "fill-outline-color": "#111827" } });
    m.addLayer({ id: "features-line", type: "line", source: "features", filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.85 } });
    m.addLayer({ id: "plots-fill", type: "fill", source: "plots",
      paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "dim"], 0.12, 0.85] } });
    m.addLayer({ id: "plots-line", type: "line", source: "plots",
      paint: { "line-color": ["case", ["get", "selected"], "#f97316", "#334155"], "line-width": ["case", ["get", "selected"], 3, 0.6] } });
    m.addLayer({ id: "plots-label", type: "symbol", source: "plots", minzoom: 18,
      layout: { "text-field": ["get", "short"], "text-size": 10, "text-font": ["Open Sans Regular"] },
      paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1 } });
    m.addLayer({ id: "features-point", type: "circle", source: "features", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": ["get", "color"], "circle-radius": 6, "circle-stroke-color": "#111827", "circle-stroke-width": 1 } });
    m.addLayer({ id: "boundary-line", type: "line", source: "boundary", paint: { "line-color": "#dc2626", "line-width": 3, "line-dasharray": [3, 2] } });
    m.addLayer({ id: "tasks-point", type: "circle", source: "tasks",
      paint: { "circle-color": ["get", "color"], "circle-radius": 9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    applyVisibility(m, visibleRef.current);
  }

  return <div ref={el} className="h-full w-full" />;
}

function applyVisibility(m: MLMap, visible: Set<string>) {
  const show = (id: string, on: boolean) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  show("boundary-line", visible.has("boundary"));
  show("blocks-fill", visible.has("blocks"));
  show("blocks-line", visible.has("blocks"));
  for (const id of ["plots-fill", "plots-line", "plots-label"]) show(id, visible.has("plots"));
  show("tasks-point", visible.has("maintenance"));
  const groups = LAYER_GROUPS.map((g) => g.key).filter((k) => !["boundary", "blocks", "plots", "maintenance"].includes(k));
  const on = groups.filter((g) => visible.has(g));
  // feature layers show only the categories that are switched on
  const base = (geom: string) => ["all", ["==", ["geometry-type"], geom], ["in", ["get", "group"], ["literal", on]]];
  for (const [id, geom] of [["features-fill", "Polygon"], ["features-line", "LineString"], ["features-point", "Point"]] as const) {
    if (m.getLayer(id)) m.setFilter(id, base(geom) as Parameters<MLMap["setFilter"]>[1]);
  }
}
