/**
 * Google Maps rendering of the society map — same props as the MapLibre SocietyMap, so MapPage can switch providers.
 * Used only when RE Settings → Map has provider "Google Maps" and a browser API key (realestate.spa.map_config).
 * The Maps JavaScript API is loaded on demand; everything is drawn with google.maps.Data from our GeoJSON.
 */
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { PAY_COLORS, STATUS_COLORS } from "@/re/lib/plots";
import type { BaseStyle, SocietyMapProps } from "./SocietyMap";

/// <reference types="google.maps" />
type GMaps = typeof google.maps;
declare global {
  interface Window {
    __reGoogleMaps?: Promise<GMaps>;
  }
}

function loadGoogle(key: string): Promise<GMaps> {
  if (typeof google !== "undefined" && google.maps?.Map) return Promise.resolve(google.maps);
  if (!window.__reGoogleMaps) {
    window.__reGoogleMaps = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=marker`;
      s.async = true;
      s.onload = () => (typeof google !== "undefined" && google.maps ? resolve(google.maps) : reject(new Error("Google Maps failed to load")));
      s.onerror = () => reject(new Error("Google Maps script could not be loaded"));
      document.head.appendChild(s);
    });
  }
  return window.__reGoogleMaps;
}

const MAP_TYPE: Record<BaseStyle, string> = { default: "roadmap", streets: "roadmap", terrain: "terrain", satellite: "hybrid" };

function feature(geometry: Geometry | null, properties: Record<string, string | number | boolean | null>): Feature | null {
  return geometry ? { type: "Feature", geometry, properties } : null;
}

export function GoogleSocietyMap({ data, tasks, colorBy, visible, matches, style, selected, onPlotClick, apiKey, mapId }: SocietyMapProps & { apiKey: string; mapId?: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [error, setError] = useState<string>();
  const clickRef = useRef(onPlotClick);
  clickRef.current = onPlotClick;
  const blockColor = useMemo(() => Object.fromEntries(data.blocks.map((b) => [b.name, b.color])), [data.blocks]);

  const collection = useMemo<FeatureCollection>(() => {
    const out: (Feature | null)[] = [feature(data.project.boundary_geojson, { layer: "boundary", name: data.project.name, color: "#dc2626" })];
    for (const b of data.blocks) out.push(feature(b.geojson, { layer: "blocks", name: b.name, color: b.color }));
    for (const f of data.features) {
      out.push(feature(f.geojson, { layer: f.category === "Utility Network" ? f.feature_type : f.category, name: f.feature_name, type: f.feature_type,
        color: f.color ?? "#6b7280", width: f.category === "Roads and Gates" ? Math.max(2, (f.width_ft ?? 30) / 8) : 2 }));
    }
    for (const p of data.plots) {
      out.push(feature(p.geojson, {
        layer: "plots", name: p.name, status: p.status, dim: !matches.has(p.name), selected: p.name === selected,
        color: colorBy === "status" ? STATUS_COLORS[p.status] ?? "#9ca3af"
          : colorBy === "block" ? blockColor[p.block] ?? "#64748b"
            : p.status === "Available" ? "#ffffff" : PAY_COLORS[p.payment_status ?? ""] ?? "#9ca3af",
      }));
    }
    for (const t of tasks) {
      out.push(feature({ type: "Point", coordinates: [t.lng, t.lat] }, { layer: "maintenance", name: t.subject, type: `${t.priority} · ${t.status}`,
        color: t.priority === "Urgent" ? "#dc2626" : t.priority === "High" ? "#ea580c" : "#ca8a04" }));
    }
    return { type: "FeatureCollection", features: out.filter((f): f is Feature => f !== null) };
  }, [data, tasks, colorBy, matches, selected, blockColor]);

  // create once
  useEffect(() => {
    let cancelled = false;
    let info: google.maps.InfoWindow | undefined;
    loadGoogle(apiKey).then((g) => {
      if (cancelled || !el.current) return;
      const m = new g.Map(el.current, {
        center: { lat: data.project.centre_lat, lng: data.project.centre_lng }, zoom: 16, mapTypeId: MAP_TYPE[style], tilt: 0,
        mapId: mapId || undefined, streetViewControl: false, fullscreenControl: true, clickableIcons: false,
      });
      info = new g.InfoWindow();
      m.data.addListener("click", (e: google.maps.Data.MouseEvent) => {
        const f = e.feature;
        if (f.getProperty("layer") === "plots") {
          clickRef.current(String(f.getProperty("name")));
          return;
        }
        const box = document.createElement("div");
        box.innerHTML = "<b></b><br/><span style=\"opacity:.75\"></span>";
        (box.firstChild as HTMLElement).textContent = String(f.getProperty("name") ?? "");
        (box.lastChild as HTMLElement).textContent = String(f.getProperty("type") ?? "");
        info?.setContent(box);
        info?.setPosition(e.latLng);
        info?.open({ map: m });
      });
      const bounds = new g.LatLngBounds();
      const ring = data.project.boundary_geojson?.type === "Polygon" ? data.project.boundary_geojson.coordinates[0] : [];
      ring?.forEach((c) => bounds.extend({ lat: c[1], lng: c[0] }));
      if (!bounds.isEmpty()) m.fitBounds(bounds, 30);
      map.current = m;
      setError(undefined);
    }).catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      info?.close();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId]);

  // (re)load features whenever data / colours / filters change
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.data.forEach((f) => m.data.remove(f));
    m.data.addGeoJson(collection);
  }, [collection, error]);

  useEffect(() => {
    map.current?.setMapTypeId(MAP_TYPE[style]);
  }, [style]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.data.setStyle((f): google.maps.Data.StyleOptions => {
      const layer = String(f.getProperty("layer") ?? "");
      const color = String(f.getProperty("color") ?? "#64748b");
      const on = visible.has(layer);
      if (layer === "plots") {
        const sel = f.getProperty("selected");
        return { visible: on, fillColor: color, fillOpacity: f.getProperty("dim") ? 0.12 : 0.85, strokeColor: sel ? "#f97316" : "#334155", strokeWeight: sel ? 3 : 0.6, zIndex: 3 };
      }
      if (layer === "boundary") return { visible: on, fillOpacity: 0, strokeColor: color, strokeWeight: 3, zIndex: 5, clickable: false };
      if (layer === "blocks") return { visible: on, fillColor: color, fillOpacity: 0.12, strokeColor: color, strokeWeight: 2, zIndex: 1, clickable: false };
      if (layer === "maintenance") {
        return { visible: on, zIndex: 6, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } };
      }
      return { visible: on, fillColor: color, fillOpacity: 0.5, strokeColor: color, strokeWeight: Number(f.getProperty("width") ?? 2), zIndex: 2,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 1, strokeColor: "#111827", strokeWeight: 1 } };
    });
  }, [visible, collection, error]);

  // fly to the selected plot
  useEffect(() => {
    const m = map.current;
    const g = typeof google !== "undefined" ? google.maps : undefined;
    const p = data.plots.find((x) => x.name === selected);
    if (!m || !g || !p?.geojson || p.geojson.type !== "Polygon") return;
    const b = new g.LatLngBounds();
    p.geojson.coordinates[0]?.forEach((c) => b.extend({ lat: c[1], lng: c[0] }));
    m.fitBounds(b, 120);
    if ((m.getZoom() ?? 0) > 19) m.setZoom(19);
  }, [selected, data.plots]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center text-sm">
          <div><p className="font-semibold">Google Maps could not load</p><p className="text-muted-foreground">{error}. Check the API key in RE Settings → Map, or switch to the open map.</p></div>
        </div>
      )}
    </div>
  );
}
