/**
 * Capture coordinates on a record — on site with the phone's GPS (several readings averaged, accuracy shown), by dropping
 * a pin on a satellite map, or by pasting a Google Maps link / "lat, lng" / degrees-minutes-seconds text.
 * Shape mode (plots, blocks, map features) builds the outline from corners — walk the corners with GPS or tap them on
 * the map — and shows the area in marla / sq ft before applying. Changes go into the form; Save / Update stores them.
 */
import type { Geometry, Position } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import { Check, ClipboardPaste, Copy, Crosshair, ExternalLink, Locate, MapPin, Navigation, Pentagon, Spline, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { DocValues, FormPatch } from "@/components/doc/doc-config";
import { useMapData } from "@/re/lib/plots";
import { cn } from "@/re/lib/utils";

type LngLat = [number, number];
type Shape = "Point" | "LineString" | "Polygon";
const MARLA_M2 = 25.2929; // same factor as the survey importer
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// ------------------------------------------------------------------ parsing a Google pin / pasted text
/** Coordinates from a Google Maps URL (…/@lat,lng,17z, ?q=lat,lng, !3dlat!4dlng, ll=), "lat, lng", or DMS text. */
export function parseCoordinates(text: string): LngLat | null {
  let t = text.trim();
  try { t = decodeURIComponent(t); } catch { /* half-typed or not URL-encoded — parse as is */ }
  const ok = (lat: number, lng: number): LngLat | null => (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? [lng, lat] : null);
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const pin = new RegExp(String.raw`!3d${num}!4d${num}`).exec(t); // the dropped pin itself (preferred over the view centre)
  if (pin) return ok(+pin[1], +pin[2]);
  for (const re of [new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=${num},\s*${num}`), new RegExp(String.raw`@${num},${num}`), new RegExp(String.raw`^${num}\s*[, ]\s*${num}$`)]) {
    const m = re.exec(t);
    if (m) return ok(+m[1], +m[2]);
  }
  // 31°21'36.5"N 74°12'03.2"E
  const dms = /(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([NS])[\s,]+(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([EW])/i.exec(t);
  if (dms) {
    const f = (d: string, m: string, s: string, h: string) => (+d + +m / 60 + +s / 3600) * (/[SW]/i.test(h) ? -1 : 1);
    return ok(f(dms[1], dms[2], dms[3], dms[4]), f(dms[5], dms[6], dms[7], dms[8]));
  }
  return null;
}

// ------------------------------------------------------------------ geometry helpers
const metres = (pts: LngLat[]) => {
  const lat0 = (pts.reduce((a, p) => a + p[1], 0) / Math.max(pts.length, 1)) * (Math.PI / 180);
  return pts.map(([x, y]) => [x * 111_320 * Math.cos(lat0), y * 110_540] as [number, number]);
};
export function areaM2(pts: LngLat[]) {
  if (pts.length < 3) return 0;
  const m = metres(pts);
  let a = 0;
  for (let i = 0; i < m.length; i++) { const [x1, y1] = m[i], [x2, y2] = m[(i + 1) % m.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
const lengthM = (pts: LngLat[], closed = false) => {
  const m = metres(pts);
  let d = 0;
  for (let i = 1; i < m.length + (closed ? 1 : 0); i++) { const a = m[i - 1], b = m[i % m.length]; d += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return d;
};
const centroid = (pts: LngLat[]): LngLat => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
const fmt = (v: number) => v.toFixed(6);

function toGeometry(shape: Shape, pts: LngLat[]): Geometry | null {
  if (!pts.length) return null;
  if (shape === "Point") return { type: "Point", coordinates: pts[pts.length - 1] };
  if (shape === "LineString") return pts.length >= 2 ? { type: "LineString", coordinates: pts } : null;
  return pts.length >= 3 ? { type: "Polygon", coordinates: [[...pts, pts[0]]] } : null;
}
function fromGeometry(raw: unknown): { shape: Shape; pts: LngLat[] } | null {
  try {
    const g = (typeof raw === "string" ? JSON.parse(raw) : raw) as Geometry | null;
    if (!g) return null;
    if (g.type === "Point") return { shape: "Point", pts: [g.coordinates as LngLat] };
    if (g.type === "LineString") return { shape: "LineString", pts: g.coordinates as LngLat[] };
    if (g.type === "Polygon") { const r = (g.coordinates[0] ?? []) as LngLat[]; return { shape: "Polygon", pts: r.slice(0, r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? -1 : undefined) }; }
  } catch { /* not geometry */ }
  return null;
}

// ------------------------------------------------------------------ GPS
interface Fix { lng: number; lat: number; accuracy: number; n: number }
/** Watch the GPS for a few seconds and average the good readings (accuracy ≤ 2 × the best). */
function useGps() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const stop = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setBusy(false); };
  useEffect(() => stop, []);
  const start = (seconds = 8) => new Promise<Fix | null>((resolve) => {
    if (!("geolocation" in navigator)) { setErr("This device has no GPS / location service."); resolve(null); return; }
    if (!window.isSecureContext) { setErr("Location needs a secure (https) connection."); resolve(null); return; }
    setErr(null); setBusy(true); setFix(null);
    const reads: GeolocationCoordinates[] = [];
    const finish = () => {
      stop();
      if (!reads.length) { resolve(null); return; }
      const best = Math.min(...reads.map((r) => r.accuracy));
      const good = reads.filter((r) => r.accuracy <= best * 2);
      const f = { lng: good.reduce((a, r) => a + r.longitude, 0) / good.length, lat: good.reduce((a, r) => a + r.latitude, 0) / good.length, accuracy: best, n: good.length };
      setFix(f); resolve(f);
    };
    watch.current = navigator.geolocation.watchPosition(
      (p) => { reads.push(p.coords); const best = Math.min(...reads.map((r) => r.accuracy)); setFix({ lng: p.coords.longitude, lat: p.coords.latitude, accuracy: best, n: reads.length }); },
      (e) => { setErr(e.code === 1 ? "Location permission was denied — allow it in the browser to use GPS." : e.message); stop(); resolve(null); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: seconds * 1000 },
    );
    setTimeout(finish, seconds * 1000);
  });
  return { fix, busy, err, start, stop };
}

// ------------------------------------------------------------------ component
export function LocationCapture({ values, patch, readOnly, mode, latField, lngField, geoField, shapes = ["Polygon"], title }: {
  values: DocValues; patch: (p: FormPatch) => void; readOnly?: boolean; mode: "point" | "shape";
  latField?: string; lngField?: string; geoField?: string; shapes?: Shape[]; title?: string;
}) {
  const existing = useMemo(() => (geoField ? fromGeometry(values[geoField]) : null), [geoField, values]);
  const lat0 = latField ? Number(values[latField]) || null : null;
  const lng0 = lngField ? Number(values[lngField]) || null : null;
  const [shape, setShape] = useState<Shape>(existing?.shape && shapes.includes(existing.shape) ? existing.shape : shapes[0]);
  const [pts, setPts] = useState<LngLat[]>(() => (mode === "shape" ? existing?.pts ?? [] : lat0 && lng0 ? [[lng0, lat0]] : []));
  const [tab, setTab] = useState<"gps" | "map" | "paste">("map");
  const [pasted, setPasted] = useState("");
  const gps = useGps();
  const parsed = pasted ? parseCoordinates(pasted) : null;
  const point = mode === "point" || shape === "Point";
  const current: LngLat | null = point ? pts[pts.length - 1] ?? null : pts.length ? centroid(pts) : null;

  const add = (p: LngLat) => setPts((prev) => (point ? [p] : [...prev, p]));
  const apply = () => {
    const out: FormPatch = {};
    if (mode === "shape" && geoField) {
      const g = toGeometry(shape, pts);
      if (!g) { toast.error(shape === "Polygon" ? "An outline needs at least 3 corners" : shape === "LineString" ? "A line needs at least 2 points" : "Set a point first"); return; }
      out[geoField] = JSON.stringify(g);
    }
    const c = current;
    if (c && latField && lngField) { out[latField] = Number(fmt(c[1])); out[lngField] = Number(fmt(c[0])); }
    if (!Object.keys(out).length) { toast.error("Set a location first"); return; }
    patch(out);
    toast.success("Location set — press Update to save");
  };
  const area = shape === "Polygon" ? areaM2(pts) : 0;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30"><Crosshair className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">{title ?? "Location"}</h3>
            <p className="text-[11px] text-muted-foreground">
              {current ? <>Lat <b className="tabular-nums text-foreground">{fmt(current[1])}</b> · Lng <b className="tabular-nums text-foreground">{fmt(current[0])}</b></> : "Not set yet"}
              {mode === "shape" && shape !== "Point" && pts.length > 0 && <> · {pts.length} {shape === "Polygon" ? "corners" : "points"}</>}
              {area > 0 && <> · <b className="text-foreground">{(area / MARLA_M2).toFixed(2)} marla</b> ({Math.round(area * 10.7639).toLocaleString()} sq ft)</>}
              {shape === "LineString" && pts.length > 1 && <> · {Math.round(lengthM(pts))} m</>}
            </p>
          </div>
        </div>
        {current && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(`${fmt(current[1])}, ${fmt(current[0])}`).then(() => toast.success("Copied"))}
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium hover:bg-muted"><Copy className="size-3" />Copy</button>
            <a href={`https://www.google.com/maps?q=${fmt(current[1])},${fmt(current[0])}`} target="_blank" rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium hover:bg-muted"><ExternalLink className="size-3" />Google Maps</a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${fmt(current[1])},${fmt(current[0])}`} target="_blank" rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium hover:bg-muted"><Navigation className="size-3" />Directions</a>
          </div>
        )}
      </header>

      <div className="space-y-3 p-4">
        {mode === "shape" && shapes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {shapes.map((s) => {
              const Icon = s === "Point" ? MapPin : s === "LineString" ? Spline : Pentagon;
              return (
                <button key={s} type="button" disabled={readOnly} onClick={() => { setShape(s); if (s === "Point") setPts((p) => p.slice(-1)); }}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", shape === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  <Icon className="size-3.5" />{s === "LineString" ? "Line" : s === "Polygon" ? "Area" : "Point"}
                </button>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1">
            {([["map", MapPin, point ? "Pin on map" : "Tap corners on map"], ["gps", Locate, point ? "GPS on site" : "Walk corners (GPS)"], ["paste", ClipboardPaste, "Google pin / paste"]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition", tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
        )}

        {!readOnly && tab === "gps" && (
          <div className="space-y-2 rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{point ? "Stand at the spot and capture — the phone takes readings for a few seconds and averages them." : "Stand on each corner in turn and press Capture corner. Go round the plot in order."}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={gps.busy} onClick={async () => { const f = await gps.start(8); if (f) { add([f.lng, f.lat]); toast.success(`${point ? "Point" : `Corner ${pts.length + 1}`} captured · ±${Math.round(f.accuracy)} m`); } }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow disabled:opacity-60">
                <Locate className={cn("size-4", gps.busy && "animate-spin")} />{gps.busy ? "Reading GPS…" : point ? "Capture my location" : `Capture corner ${pts.length + 1}`}
              </button>
              {gps.busy && <button type="button" onClick={gps.stop} className="text-xs text-muted-foreground hover:underline">Stop</button>}
              {gps.fix && (
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  gps.fix.accuracy <= 5 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : gps.fix.accuracy <= 15 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>
                  ±{Math.round(gps.fix.accuracy)} m · {gps.fix.n} readings
                </span>
              )}
            </div>
            {gps.err && <p className="text-xs text-rose-600">{gps.err}</p>}
            <p className="text-[11px] text-muted-foreground">Tip: open in the open sky; ±5 m or better is good for a corner. Accuracy shown is the best reading.</p>
          </div>
        )}

        {!readOnly && tab === "paste" && (
          <div className="space-y-2 rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">In Google Maps, drop a pin → Share → Copy link (or copy the coordinates), then paste here.</p>
            <div className="flex flex-wrap gap-2">
              <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://www.google.com/maps/…@31.3601,74.1987  or  31.3601, 74.1987"
                className="field h-9 min-w-0 flex-1 text-xs" aria-label="Google Maps link or coordinates" />
              <button type="button" disabled={!parsed} onClick={() => { if (parsed) { add(parsed); setPasted(""); toast.success(point ? "Pin set" : `Corner ${pts.length + 1} added`); } }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="size-3.5" />{point ? "Use" : "Add corner"}</button>
            </div>
            {pasted && <p className={cn("text-[11px]", parsed ? "text-emerald-600" : "text-rose-600")}>{parsed ? `Found ${fmt(parsed[1])}, ${fmt(parsed[0])}` : "No coordinates found — short links (maps.app.goo.gl) must be opened first, then copy the full link or the coordinates."}</p>}
          </div>
        )}

        <PickerMap pts={pts} shape={mode === "point" ? "Point" : shape} gpsFix={gps.fix} readOnly={readOnly || tab !== "map"} onAdd={add}
          onMove={(i, p) => setPts((prev) => prev.map((q, k) => (k === i ? p : q)))} />

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {!point && <button type="button" disabled={!pts.length} onClick={() => setPts((p) => p.slice(0, -1))} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs disabled:opacity-40"><Undo2 className="size-3.5" />Undo</button>}
              <button type="button" disabled={!pts.length} onClick={() => setPts([])} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs disabled:opacity-40"><Trash2 className="size-3.5" />Clear</button>
            </div>
            <button type="button" onClick={apply} disabled={!pts.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50">
              <Check className="size-4" />{mode === "shape" && !point ? `Use this ${shape === "Polygon" ? "outline" : "line"}` : "Use this location"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ map
function PickerMap({ pts, shape, gpsFix, readOnly, onAdd, onMove }: {
  pts: LngLat[]; shape: Shape; gpsFix: Fix | null; readOnly?: boolean; onAdd: (p: LngLat) => void; onMove: (i: number, p: LngLat) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const addRef = useRef(onAdd); addRef.current = onAdd;
  const moveRef = useRef(onMove); moveRef.current = onMove;
  const roRef = useRef(readOnly); roRef.current = readOnly;
  const { data } = useMapData();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!el.current || !data || map.current) return;
    const centre: LngLat = pts.length ? centroid(pts) : [data.project.centre_lng, data.project.centre_lat];
    const style: StyleSpecification = { version: 8, sources: { sat: { type: "raster", tiles: [ESRI], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri" } }, layers: [{ id: "sat", type: "raster", source: "sat" }] };
    const m = new maplibregl.Map({ container: el.current, style, center: centre, zoom: pts.length ? 18.3 : data.project.default_zoom || 16, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("plots", { type: "geojson", data: { type: "FeatureCollection", features: data.plots.filter((p) => p.geojson).map((p) => ({ type: "Feature", geometry: p.geojson as Geometry, properties: {} })) } });
      m.addLayer({ id: "plots", type: "line", source: "plots", paint: { "line-color": "#ffffff", "line-width": 0.7, "line-opacity": 0.55 } });
      m.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#10b981", "fill-opacity": 0.3 } });
      m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#10b981", "line-width": 3 } });
      m.addSource("gps", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "gps", type: "circle", source: "gps", paint: { "circle-radius": 7, "circle-color": "#3b82f6", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      setReady(true);
    });
    m.on("click", (e) => { if (!roRef.current) addRef.current([Number(e.lngLat.lng.toFixed(7)), Number(e.lngLat.lat.toFixed(7))]); });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // draft shape + draggable vertex markers
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const g = toGeometry(shape === "Point" ? "Point" : shape, pts) ?? (pts.length >= 2 ? { type: "LineString", coordinates: pts } as Geometry : null);
    (m.getSource("draft") as GeoJSONSource).setData({ type: "FeatureCollection", features: g && g.type !== "Point" ? [{ type: "Feature", geometry: g, properties: {} }] : [] });
    markers.current.forEach((x) => x.remove());
    markers.current = pts.map((p, i) => {
      const dot = document.createElement("div");
      dot.className = "grid size-6 place-items-center rounded-full border-2 border-white bg-emerald-600 text-[10px] font-bold text-white shadow-lg";
      dot.textContent = shape === "Point" ? "" : String(i + 1);
      if (shape === "Point") { dot.className = "size-5 rounded-full border-[3px] border-white bg-rose-600 shadow-lg ring-4 ring-rose-500/30"; }
      const mk = new maplibregl.Marker({ element: dot, draggable: !roRef.current }).setLngLat(p as Position as [number, number]).addTo(m);
      mk.on("dragend", () => { const ll = mk.getLngLat(); moveRef.current(i, [Number(ll.lng.toFixed(7)), Number(ll.lat.toFixed(7))]); });
      return mk;
    });
  }, [pts, shape, ready]);

  // live GPS dot; follow it
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("gps") as GeoJSONSource).setData({ type: "FeatureCollection", features: gpsFix ? [{ type: "Feature", geometry: { type: "Point", coordinates: [gpsFix.lng, gpsFix.lat] }, properties: {} }] : [] });
    if (gpsFix) m.easeTo({ center: [gpsFix.lng, gpsFix.lat], zoom: Math.max(m.getZoom(), 18) });
  }, [gpsFix, ready]);

  return (
    <div className="relative overflow-hidden rounded-xl border">
      <div ref={el} className="h-80 w-full" />
      {!readOnly && <p className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-1 text-[11px] shadow backdrop-blur">
        {shape === "Point" ? "Tap the map to drop the pin · drag to adjust" : "Tap each corner in order · drag a numbered corner to adjust"}</p>}
    </div>
  );
}
