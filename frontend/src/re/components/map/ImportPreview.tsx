/**
 * Map Import preview (RE Map Import form): reads the attached GeoJSON / KML in the browser and draws it over the satellite
 * map next to the existing scheme, before (or after) running the import. Lists what the file holds — geometry types and
 * properties with sample values; click a property to use it for the name / block / size / type mapping. For plot imports
 * it dry-runs the matching (number, block, new vs existing) so problems show before anything is written.
 */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import maplibregl, { type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import { AlertTriangle, CheckCircle2, FileJson, Layers, MapPinned, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocValues, FormPatch } from "@/components/doc/doc-config";
import { useMapData } from "@/re/lib/plots";
import type { MapData } from "@/re/lib/types";
import { cn } from "@/re/lib/utils";

interface Feat { geometry: Geometry; properties: Record<string, string> }
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const MAPPING: [string, string][] = [["name_property", "Name / number"], ["block_property", "Block"], ["size_property", "Plot size"], ["type_property", "Feature type"]];

// ------------------------------------------------------------------ parsing (same rules as the server importer)
function parseGeoJSON(data: { type?: string; features?: Feature[]; geometry?: Geometry; properties?: Record<string, unknown> }): Feat[] {
  const feats: { geometry?: Geometry | null; properties?: Record<string, unknown> | null }[] =
    data.type === "FeatureCollection" ? data.features ?? [] : data.type === "Feature" ? [data] : [{ geometry: data as unknown as Geometry, properties: {} }];
  return feats.filter((f) => f.geometry).map((f) => ({ geometry: f.geometry as Geometry, properties: Object.fromEntries(Object.entries(f.properties ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])) }));
}
function parseKML(text: string): Feat[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const coords = (el: Element | null): Position[] => (el?.textContent ?? "").trim().split(/\s+/).filter(Boolean).map((t) => t.split(",").slice(0, 2).map(Number));
  const out: Feat[] = [];
  doc.querySelectorAll("Placemark").forEach((pm) => {
    const props: Record<string, string> = { name: pm.querySelector(":scope > name")?.textContent?.trim() ?? "" };
    pm.querySelectorAll("Data").forEach((d) => { props[d.getAttribute("name") ?? ""] = d.querySelector("value")?.textContent?.trim() ?? ""; });
    pm.querySelectorAll("SimpleData").forEach((d) => { props[d.getAttribute("name") ?? ""] = d.textContent?.trim() ?? ""; });
    pm.querySelectorAll("Polygon").forEach((p) => {
      const ring = coords(p.querySelector("outerBoundaryIs coordinates"));
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
      out.push({ geometry: { type: "Polygon", coordinates: [ring] }, properties: props });
    });
    pm.querySelectorAll("LineString").forEach((l) => out.push({ geometry: { type: "LineString", coordinates: coords(l.querySelector("coordinates")) }, properties: props }));
    pm.querySelectorAll("Point").forEach((p) => out.push({ geometry: { type: "Point", coordinates: coords(p.querySelector("coordinates"))[0] }, properties: props }));
  });
  return out;
}

const prop = (f: Feat, key: unknown) => {
  if (!key) return "";
  const k = String(key).toLowerCase();
  const hit = Object.entries(f.properties).find(([p]) => p.toLowerCase() === k);
  return hit ? hit[1].trim() : "";
};
function ringOf(g: Geometry): Position[] { return g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : []; }
function centre(g: Geometry): Position {
  const pts: Position[] = g.type === "Point" ? [g.coordinates] : g.type === "LineString" ? g.coordinates : ringOf(g);
  return [pts.reduce((a, p) => a + p[0], 0) / Math.max(pts.length, 1), pts.reduce((a, p) => a + p[1], 0) / Math.max(pts.length, 1)];
}
function inRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Plot import dry run: number present, block found (by property or by location), new vs existing. */
function dryRun(feats: Feat[], v: DocValues, map: MapData | undefined) {
  const polys = feats.filter((f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon");
  const existing = new Set((map?.plots ?? []).map((p) => p.name));
  const rows = polys.map((f) => {
    const no = prop(f, v.name_property);
    const wanted = prop(f, v.block_property).toLowerCase();
    let block = (map?.blocks ?? []).find((b) => wanted && (b.name.toLowerCase() === wanted || (b.block_code ?? "").toLowerCase() === wanted))?.name;
    if (!block) block = (map?.blocks ?? []).find((b) => b.geojson && inRing(centre(f.geometry), ringOf(b.geojson)))?.name;
    const status = !no ? "no number" : !block ? "no block" : existing.has(no) ? "update" : "create";
    return { no, block, status };
  });
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return { rows, create: count("create"), update: count("update"), noNumber: count("no number"), noBlock: count("no block"), skippedNonPolygons: feats.length - polys.length };
}

export function ImportPreview({ values, patch, readOnly }: { values: DocValues; patch: (p: FormPatch) => void; readOnly?: boolean }) {
  const url = String(values.import_file ?? "");
  const target = String(values.target ?? "");
  const [feats, setFeats] = useState<Feat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: scheme } = useMapData();

  useEffect(() => {
    setFeats(null); setError(null);
    if (!url) return;
    let cancelled = false;
    fetch(url, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`Could not read the file (${r.status})`); return r.text(); })
      .then((text) => {
        const t = text.replace(/^﻿/, "").trim();
        const parsed = t.startsWith("{") ? parseGeoJSON(JSON.parse(t)) : parseKML(t);
        if (!cancelled) setFeats(parsed);
      })
      .catch((e: Error) => !cancelled && setError(e.message.includes("JSON") ? "The file is not valid GeoJSON or KML" : e.message));
    return () => { cancelled = true; };
  }, [url]);

  const keys = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (feats ?? []).forEach((f) => Object.entries(f.properties).forEach(([k, v]) => { if (!m.has(k)) m.set(k, new Set()); if (v && m.get(k)!.size < 4) m.get(k)!.add(v); }));
    return [...m.entries()];
  }, [feats]);
  const types = useMemo(() => (feats ?? []).reduce<Record<string, number>>((a, f) => { a[f.geometry.type] = (a[f.geometry.type] ?? 0) + 1; return a; }, {}), [feats]);
  const dry = useMemo(() => (feats && target === "Plots" ? dryRun(feats, values, scheme) : null), [feats, target, values, scheme]);

  if (!url) return <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground"><MapPinned className="mx-auto mb-2 size-6" />Attach a KML or GeoJSON survey file to preview it on the map.</div>;
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>;
  if (!feats) return <div className="h-80 animate-pulse rounded-2xl bg-muted" />;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md"><FileJson className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">File preview{target ? ` · import as ${target}` : ""}</h3>
            <p className="text-[11px] text-muted-foreground">{feats.length} features · {Object.entries(types).map(([t, n]) => `${n} ${t}`).join(" · ")} · {decodeURIComponent(url.split("/").pop() ?? "")}</p>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", values.status === "Completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : values.status === "Failed" ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
          {String(values.status ?? "Draft")}
        </span>
      </header>

      <PreviewMap feats={feats} scheme={scheme} labelKey={values.name_property} target={target} />

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Tag className="size-3.5 text-primary" />Properties in the file {!readOnly && <span className="font-normal text-muted-foreground">— click a mapping button to use it</span>}</p>
          <ul className="max-h-56 space-y-1.5 overflow-auto pr-1 text-xs">
            {keys.map(([k, samples]) => (
              <li key={k} className="rounded-lg border bg-background/60 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="font-semibold">{k}</code>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{[...samples].join(" · ") || "—"}</span>
                </div>
                {!readOnly && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {MAPPING.filter(([f]) => f !== "type_property" || target === "Map Features").filter(([f]) => f !== "size_property" && f !== "block_property" || target === "Plots").map(([f, label]) => {
                      const on = String(values[f] ?? "").toLowerCase() === k.toLowerCase();
                      return (
                        <button key={f} type="button" onClick={() => patch({ [f]: on ? "" : k })}
                          className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                          {on ? "✓ " : ""}{label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
            {!keys.length && <li className="text-muted-foreground">No properties — names will be generated.</li>}
          </ul>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Layers className="size-3.5 text-primary" />{target === "Plots" ? "Dry run" : "What will happen"}</p>
          {dry ? (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-1.5 text-center sm:grid-cols-4">
                <Stat k="Create" v={dry.create} tone="text-emerald-600" /><Stat k="Update" v={dry.update} tone="text-sky-600" />
                <Stat k="No number" v={dry.noNumber} tone={dry.noNumber ? "text-rose-600" : undefined} /><Stat k="No block" v={dry.noBlock} tone={dry.noBlock ? "text-rose-600" : undefined} />
              </div>
              {(dry.noNumber > 0 || dry.noBlock > 0) ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {dry.noNumber > 0 && `${dry.noNumber} polygons have no plot number — set "Name / number" to the right property. `}
                  {dry.noBlock > 0 && `${dry.noBlock} plots match no block by property or location — set "Block" or import the blocks first.`}</p>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-3.5" />Every plot has a number and a block.</p>
              )}
              {dry.skippedNonPolygons > 0 && <p className="text-muted-foreground">{dry.skippedNonPolygons} non-polygon features will be ignored.</p>}
              <p className="text-muted-foreground">Blocks: {Object.entries(dry.rows.reduce<Record<string, number>>((a, r) => { if (r.block) a[r.block] = (a[r.block] ?? 0) + 1; return a; }, {})).map(([b, n]) => `${b} ${n}`).join(" · ") || "—"}</p>
            </div>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {target === "Boundary" && <li>The first polygon becomes the scheme boundary (area recalculated, map centre moved).</li>}
              {target === "Blocks" && <li>{types.Polygon ?? 0} polygons become blocks, named by "{String(values.name_property || "Block n")}"; existing blocks with the same name get the new outline.</li>}
              {target === "Map Features" && <li>{feats.length} features are added; the "{String(values.type_property || "type")}" property picks the feature type (unknown → Other).</li>}
              {!target && <li>Choose what to import as (Boundary, Blocks, Plots, Map Features).</li>}
              <li>{values.replace_existing ? "⚠ Replace existing is ON — matching records are deleted first." : "Existing records are kept (replace existing is off)."}</li>
            </ul>
          )}
          {values.result && <p className="mt-3 rounded-lg border bg-muted/40 px-2.5 py-2 text-xs"><b>Last run:</b> {String(values.result)}</p>}
        </div>
      </div>
    </section>
  );
}

function Stat({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return <div className="rounded-lg bg-muted/60 py-1.5"><p className={cn("text-base font-bold tabular-nums", tone)}>{v}</p><p className="text-[10px] text-muted-foreground">{k}</p></div>;
}

function PreviewMap({ feats, scheme, labelKey, target }: { feats: Feat[]; scheme: MapData | undefined; labelKey: unknown; target: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const fc: FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: feats.map((f) => ({ type: "Feature", geometry: f.geometry, properties: { label: prop(f, labelKey) || prop(f, "name") } })),
  }), [feats, labelKey]);

  useEffect(() => {
    if (!el.current) return;
    const bounds = new maplibregl.LngLatBounds();
    const walk = (c: unknown): void => { if (Array.isArray(c) && typeof c[0] === "number") bounds.extend(c as [number, number]); else if (Array.isArray(c)) c.forEach(walk); };
    feats.forEach((f) => walk((f.geometry as { coordinates: unknown }).coordinates));
    if (bounds.isEmpty()) return;
    const style: StyleSpecification = { version: 8, glyphs: GLYPHS, sources: { sat: { type: "raster", tiles: [ESRI], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri" } }, layers: [{ id: "sat", type: "raster", source: "sat" }] };
    const m = new maplibregl.Map({ container: el.current, style, bounds, fitBoundsOptions: { padding: 50, maxZoom: 18.5 }, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      if (scheme) {
        m.addSource("scheme", { type: "geojson", data: { type: "FeatureCollection", features: [
          ...(scheme.project.boundary_geojson ? [{ type: "Feature" as const, geometry: scheme.project.boundary_geojson, properties: { k: "boundary" } }] : []),
          ...scheme.blocks.filter((b) => b.geojson).map((b) => ({ type: "Feature" as const, geometry: b.geojson as Geometry, properties: { k: "block" } })),
          ...scheme.plots.filter((p) => p.geojson).map((p) => ({ type: "Feature" as const, geometry: p.geojson as Geometry, properties: { k: "plot" } })),
        ] } });
        m.addLayer({ id: "scheme", type: "line", source: "scheme", paint: { "line-color": ["match", ["get", "k"], "boundary", "#ef4444", "block", "#94a3b8", "#ffffff"], "line-width": ["match", ["get", "k"], "boundary", 2, "block", 1.5, 0.5], "line-opacity": 0.6 } });
      }
      m.addSource("file", { type: "geojson", data: fc });
      m.addLayer({ id: "file-fill", type: "fill", source: "file", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": target === "Boundary" ? "#ef4444" : "#22c55e", "fill-opacity": target === "Boundary" ? 0.12 : 0.4 } });
      m.addLayer({ id: "file-line", type: "line", source: "file", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#facc15", "line-width": 2.5 } });
      m.addLayer({ id: "file-point", type: "circle", source: "file", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#f43f5e", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addLayer({ id: "file-label", type: "symbol", source: "file", minzoom: 17, layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["Open Sans Semibold"] }, paint: { "text-color": "#fff", "text-halo-color": "rgba(15,23,42,.85)", "text-halo-width": 1.3 } });
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, [fc, scheme, target, feats]);

  return (
    <div className="relative">
      <div ref={el} className="h-96 w-full" />
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 rounded-lg bg-background/85 px-2 py-1 text-[11px] shadow backdrop-blur">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm border-2 border-yellow-400 bg-green-500/50" />File</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-red-500" />Scheme boundary</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-slate-400" />Existing blocks / plots</span>
      </div>
    </div>
  );
}
