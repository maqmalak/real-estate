/**
 * Map editing on the React society map (MapLibre, no extra library): draw polygons, lines and points, or pick an existing
 * plot / block / feature / the boundary and drag its corners. Every change is checked live on the server (inside its
 * block / boundary, no overlaps) and saved through realestate.mapedit.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Feature, Geometry, LineString, Point, Polygon, Position } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapMouseEvent } from "maplibre-gl";
import { Check, Loader2, MousePointer2, PenLine, Pentagon, MapPin, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { post } from "@/re/lib/api";
import { useFilterOptions } from "@/re/lib/plots";
import { cn } from "@/re/lib/utils";

type Tool = "select" | "polygon" | "line" | "point";
interface Target { doctype: "RE Plot" | "RE Block" | "RE Map Feature" | "RE Project"; name: string; kind: "plot" | "block" | "feature" | "boundary" }
interface Check { problems: string[]; block: string | null; area_m2: number; area_marla: number; area_sqft: number }
const FEATURE_TYPES = ["Main Gate", "Back Gate", "Boulevard", "Street", "Perimeter Road", "Central Park", "Park", "School", "Masjid", "Graveyard",
  "Community Centre", "Water Tank", "Water Supply Line", "Sewerage Line", "Sewerage Disposal", "Electricity Line", "Grid Station", "Transformer",
  "Internet Cable", "Garbage Point", "Disposal Site", "Green Belt", "Other"];
const SRC = "re-draw";

function geometryOf(tool: Tool, pts: Position[]): Geometry | null {
  if (tool === "point" && pts.length) return { type: "Point", coordinates: pts[0] } as Point;
  if (tool === "line" && pts.length >= 2) return { type: "LineString", coordinates: pts } as LineString;
  if (tool === "polygon" && pts.length >= 3) return { type: "Polygon", coordinates: [[...pts, pts[0]]] } as Polygon;
  return null;
}

function ringOf(g: Geometry | null | undefined): { tool: Tool; pts: Position[] } | null {
  if (!g) return null;
  if (g.type === "Polygon") return { tool: "polygon", pts: g.coordinates[0].slice(0, -1) };
  if (g.type === "MultiPolygon") return { tool: "polygon", pts: g.coordinates[0][0].slice(0, -1) };
  if (g.type === "LineString") return { tool: "line", pts: g.coordinates };
  if (g.type === "Point") return { tool: "point", pts: [g.coordinates] };
  return null;
}

export function MapEditor({ map, geometryFor, onClose }: {
  map: MLMap; geometryFor: (t: Target) => Geometry | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: opts } = useFilterOptions();
  const [tool, setTool] = useState<Tool>("polygon");
  const [pts, setPts] = useState<Position[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const markers = useRef<maplibregl.Marker[]>([]);
  const geom = geometryOf(tool, pts);
  const geomKey = geom ? JSON.stringify(geom) : "";
  const kindForCheck = target?.kind ?? (tool === "polygon" ? "plot" : "feature");

  // live server check (debounced by the query key changing only when geometry changes)
  const { data: chk, isFetching: checking } = useQuery({
    queryKey: ["shape-check", geomKey, kindForCheck, target?.name], enabled: Boolean(geom), staleTime: 60_000,
    queryFn: () => post<Check>("realestate.mapedit.validate_shape", { kind: kindForCheck, geojson: geomKey, exclude: target?.name }),
  });

  // draw layers (re-added after base-style switches)
  const ensureLayers = useCallback(() => {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    if (!map.getLayer("re-draw-fill")) map.addLayer({ id: "re-draw-fill", type: "fill", source: SRC, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#f97316", "fill-opacity": 0.25 } });
    if (!map.getLayer("re-draw-line")) map.addLayer({ id: "re-draw-line", type: "line", source: SRC, paint: { "line-color": "#f97316", "line-width": 3, "line-dasharray": [2, 1] } });
    if (!map.getLayer("re-draw-point")) map.addLayer({ id: "re-draw-point", type: "circle", source: SRC, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": "#f97316", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  }, [map]);

  useEffect(() => {
    const onStyle = () => ensureLayers();
    if (map.getLayer("plots-fill")) ensureLayers();
    map.on("style.load", onStyle);
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("style.load", onStyle);
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      markers.current.forEach((m) => m.remove());
      for (const id of ["re-draw-fill", "re-draw-line", "re-draw-point"]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
  }, [map, ensureLayers]);

  // render shape + draggable corner markers
  useEffect(() => {
    const features: Feature[] = [];
    const g = geometryOf(tool, pts);
    if (g) features.push({ type: "Feature", geometry: g, properties: {} });
    else if (pts.length >= 2) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} });
    if (!map.getSource(SRC)) {
      try {
        ensureLayers();
      } catch {
        /* style still loading — "style.load" adds the layers */
      }
    }
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    markers.current.forEach((m) => m.remove());
    markers.current = pts.map((p, i) => {
      const el = document.createElement("div");
      el.className = "size-3.5 rounded-full border-2 border-white bg-orange-500 shadow cursor-move";
      const m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(p as [number, number]).addTo(map);
      m.on("dragend", () => {
        const ll = m.getLngLat();
        setPts((prev) => prev.map((q, j) => (j === i ? [ll.lng, ll.lat] : q)));
      });
      el.addEventListener("contextmenu", (e) => { e.preventDefault(); setPts((prev) => prev.filter((_q, j) => j !== i)); });
      return m;
    });
  }, [pts, tool, map, ensureLayers]);

  // clicks: add corners while drawing, or pick a shape to edit
  useEffect(() => {
    const onClick = (e: MapMouseEvent) => {
      if (tool === "select") {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["plots-fill", "features-fill", "features-line", "features-point", "blocks-fill", "boundary-line"].filter((l) => map.getLayer(l)) })[0];
        if (!hit) return;
        const name = String(hit.properties?.name ?? "");
        const layer = hit.layer.id;
        const t: Target = layer.startsWith("plots") ? { doctype: "RE Plot", name, kind: "plot" }
          : layer.startsWith("blocks") ? { doctype: "RE Block", name, kind: "block" }
            : layer.startsWith("boundary") ? { doctype: "RE Project", name, kind: "boundary" }
              : { doctype: "RE Map Feature", name: String(hit.properties?.docname ?? name), kind: "feature" };
        const r = ringOf(geometryFor(t));
        if (!r) return toast.error("This shape has no editable outline");
        setTarget(t);
        setTool(r.tool);
        setPts(r.pts);
        toast.info(`Editing ${t.doctype.replace("RE ", "")} ${t.name} — drag the corners, right-click a corner to remove it`);
        return;
      }
      const p: Position = [e.lngLat.lng, e.lngLat.lat];
      if (tool === "point") setPts([p]);
      else setPts((prev) => [...prev, p]);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, tool, geometryFor]);

  const reset = () => { setPts([]); setTarget(null); };
  const pick = (t: Tool) => { reset(); setTool(t); };
  const saveEdit = useMutation({
    mutationFn: () => post("realestate.mapedit.save_geometry", { doctype: target!.doctype, name: target!.name, geojson: geomKey }),
    onSuccess: () => { toast.success(`${target!.name} outline saved`); reset(); setTool("select"); void qc.invalidateQueries({ queryKey: ["map-data"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="absolute left-3 top-14 z-20 w-80 space-y-3 rounded-2xl border bg-card/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Edit map</p>
        <button aria-label="Close editor" className="rounded-md p-1 hover:bg-accent" onClick={onClose}><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {([["select", MousePointer2, "Edit shape"], ["polygon", Pentagon, "Polygon"], ["line", PenLine, "Line"], ["point", MapPin, "Point"]] as const).map(([t, Icon, label]) => (
          <button key={t} onClick={() => pick(t)} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px]", tool === t && !target ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {target ? `Editing ${target.doctype.replace("RE ", "")} ${target.name}. Drag corners; right-click a corner to delete it.`
          : tool === "select" ? "Click a plot, block, feature or the boundary to edit its outline."
            : tool === "point" ? "Click the map to place the point." : "Click to add corners; drag to adjust; right-click a corner to remove it."}
      </p>
      {geom && (
        <div className="rounded-xl border bg-muted/40 p-2 text-xs">
          {checking ? <Loader2 className="size-3.5 animate-spin" /> : chk && (
            <>
              {chk.area_m2 > 0 && <p><b>{chk.area_marla} Marla</b> · {chk.area_sqft.toLocaleString()} sq ft · {chk.area_m2.toLocaleString()} m²{chk.block ? ` · in ${chk.block}` : ""}</p>}
              {chk.problems.length ? <ul className="mt-1 list-disc pl-4 text-red-600 dark:text-red-400">{chk.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                : <p className="mt-1 text-emerald-600 dark:text-emerald-400">✓ Geometry checks pass</p>}
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!pts.length} onClick={() => setPts((p) => p.slice(0, -1))}><Undo2 /> Undo</Button>
        <Button size="sm" variant="outline" disabled={!pts.length} onClick={reset}><Trash2 /> Clear</Button>
        {target ? (
          <Button size="sm" disabled={!geom || saveEdit.isPending || Boolean(chk?.problems.length)} onClick={() => saveEdit.mutate()}>
            {saveEdit.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save outline
          </Button>
        ) : (
          <Button size="sm" disabled={!geom} onClick={() => setSaveOpen(true)}><Check /> Save as…</Button>
        )}
      </div>
      {geom && <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} geom={geom} detectedBlock={chk?.block ?? null}
        blocks={opts?.blocks.map((b) => b.name) ?? []} sizes={opts?.sizes.map((s) => s.name) ?? []}
        onSaved={() => { reset(); void qc.invalidateQueries({ queryKey: ["map-data"] }); }} />}
    </div>
  );
}

function SaveDialog({ open, onClose, geom, detectedBlock, blocks, sizes, onSaved }: {
  open: boolean; onClose: () => void; geom: Geometry; detectedBlock: string | null; blocks: string[]; sizes: string[]; onSaved: () => void;
}) {
  const isPolygon = geom.type === "Polygon";
  const [kind, setKind] = useState<"plot" | "block" | "feature" | "boundary">(isPolygon ? "plot" : "feature");
  const [v, setV] = useState<Record<string, string>>({ feature_type: "Other", block_type: "Residential", color: "#60a5fa", asset_status: "Planned" });
  useEffect(() => { if (!isPolygon) setKind("feature"); }, [isPolygon]);
  useEffect(() => { if (detectedBlock) setV((x) => ({ ...x, block: x.block || detectedBlock })); }, [detectedBlock]);
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => post<{ doctype: string; name: string }>("realestate.mapedit.create_from_drawing", { kind, geojson: JSON.stringify(geom), values: JSON.stringify(v) }),
    onSuccess: (r) => { toast.success(`${r.doctype.replace("RE ", "")} ${r.name} created`); onClose(); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Save drawing">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div><Label htmlFor="sv-kind">Save as</Label>
          <Select id="sv-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {isPolygon && <option value="plot">New plot</option>}
            {isPolygon && <option value="block">New block</option>}
            <option value="feature">Infrastructure / public feature</option>
            {isPolygon && <option value="boundary">Project boundary (replace)</option>}
          </Select>
        </div>
        {kind === "plot" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sv-no">Plot no</Label><Input id="sv-no" required placeholder="A-121" value={v.plot_no ?? ""} onChange={(e) => set("plot_no", e.target.value)} /></div>
            <div><Label htmlFor="sv-blk">Block</Label><Select id="sv-blk" value={v.block ?? ""} onChange={(e) => set("block", e.target.value)}><option value="">Detect</option>{blocks.map((b) => <option key={b}>{b}</option>)}</Select></div>
            <div><Label htmlFor="sv-size">Size</Label><Select id="sv-size" required value={v.plot_size ?? ""} onChange={(e) => set("plot_size", e.target.value)}><option value="">Choose…</option>{sizes.map((s) => <option key={s}>{s}</option>)}</Select></div>
            <div><Label htmlFor="sv-st">Street</Label><Input id="sv-st" value={v.street ?? ""} onChange={(e) => set("street", e.target.value)} /></div>
            <div><Label htmlFor="sv-price">List price (blank = size price)</Label><Input id="sv-price" type="number" value={v.list_price ?? ""} onChange={(e) => set("list_price", e.target.value)} /></div>
          </div>
        )}
        {kind === "block" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sv-bn">Block name</Label><Input id="sv-bn" required placeholder="E Block" value={v.block_name ?? ""} onChange={(e) => set("block_name", e.target.value)} /></div>
            <div><Label htmlFor="sv-bc">Code</Label><Input id="sv-bc" required placeholder="E" value={v.block_code ?? ""} onChange={(e) => set("block_code", e.target.value)} /></div>
            <div><Label htmlFor="sv-bt">Type</Label><Select id="sv-bt" value={v.block_type} onChange={(e) => set("block_type", e.target.value)}><option>Residential</option><option>Commercial</option></Select></div>
            <div><Label htmlFor="sv-bcol">Colour</Label><Input id="sv-bcol" type="color" value={v.color} onChange={(e) => set("color", e.target.value)} /></div>
          </div>
        )}
        {kind === "feature" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sv-fn">Name</Label><Input id="sv-fn" required placeholder="Transformer T-7" value={v.feature_name ?? ""} onChange={(e) => set("feature_name", e.target.value)} /></div>
            <div><Label htmlFor="sv-ft">Type</Label><Select id="sv-ft" value={v.feature_type} onChange={(e) => set("feature_type", e.target.value)}>{FEATURE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></div>
            <div><Label htmlFor="sv-fs">Status</Label><Select id="sv-fs" value={v.asset_status} onChange={(e) => set("asset_status", e.target.value)}><option>Planned</option><option>In Progress</option><option>Completed</option></Select></div>
            <div><Label htmlFor="sv-fc">Colour</Label><Input id="sv-fc" type="color" value={v.color} onChange={(e) => set("color", e.target.value)} /></div>
          </div>
        )}
        {kind === "boundary" && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">This replaces the project boundary; land-use areas are recalculated from it.</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Save</Button></div>
      </form>
    </Dialog>
  );
}
