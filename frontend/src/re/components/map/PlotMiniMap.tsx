import type { Polygon } from "geojson";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

/** Satellite thumbnail of one plot. */
export function PlotMiniMap({ geojson }: { geojson: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || !geojson) return;
    const poly = JSON.parse(geojson) as Polygon;
    const ring = poly.coordinates[0] ?? [];
    const bounds = new maplibregl.LngLatBounds();
    ring.forEach((c) => bounds.extend(c as [number, number]));
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          sat: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] },
          plot: { type: "geojson", data: { type: "Feature", geometry: poly, properties: {} } },
        },
        layers: [
          { id: "sat", type: "raster", source: "sat" },
          { id: "fill", type: "fill", source: "plot", paint: { "fill-color": "#f59e0b", "fill-opacity": 0.35 } },
          { id: "line", type: "line", source: "plot", paint: { "line-color": "#f59e0b", "line-width": 3 } },
        ],
      },
      bounds, fitBoundsOptions: { padding: 60, maxZoom: 19.5 }, interactive: false, attributionControl: false,
    });
    return () => m.remove();
  }, [geojson]);
  if (!geojson) return null;
  return <div ref={el} className="h-44 w-full overflow-hidden rounded-lg border" />;
}
