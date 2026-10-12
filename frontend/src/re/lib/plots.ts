import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { get } from "@/re/lib/api";
import type { MapData, MapPlot, MapTask } from "@/re/lib/types";

export const STATUS_COLORS: Record<string, string> = {
  Available: "#22c55e", Reserved: "#a855f7", Hold: "#f97316", Booked: "#3b82f6", Sold: "#6366f1", "Possession Given": "#0ea5e9", Blocked: "#9ca3af",
};
export const PAY_COLORS: Record<string, string> = { Paid: "#16a34a", Due: "#f59e0b", Overdue: "#dc2626" };

export type ColorBy = "status" | "payment" | "block";

export interface PlotFilters {
  q: string;
  block: string;
  size: string;
  type: string;
  status: string;
  payment: string;
  category: string;
  minPrice: string;
  maxPrice: string;
}

const KEYS: (keyof PlotFilters)[] = ["q", "block", "size", "type", "status", "payment", "category", "minPrice", "maxPrice"];

/** Filters live in the URL so a filtered map / list can be shared and survives reloads. */
export function usePlotFilters(): [PlotFilters, (patch: Partial<PlotFilters>) => void, () => void] {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as unknown as PlotFilters;
  const set = (patch: Partial<PlotFilters>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const clear = () => setParams(new URLSearchParams(), { replace: true });
  return [filters, set, clear];
}

export function plotMatches(p: MapPlot, f: PlotFilters, typeOf: (size: string) => string | undefined): boolean {
  if (f.q && !`${p.name} ${p.customer_name ?? ""} ${p.street ?? ""}`.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.block && p.block !== f.block) return false;
  if (f.size && p.plot_size !== f.size) return false;
  if (f.type && typeOf(p.plot_size) !== f.type) return false;
  if (f.status && p.status !== f.status) return false;
  if (f.payment === "Clear" && p.payment_status !== "Paid") return false;
  if (f.payment && f.payment !== "Clear" && p.payment_status !== f.payment) return false;
  if (f.category === "corner" && !p.is_corner) return false;
  if (f.category === "park" && !p.is_park_facing) return false;
  if (f.category === "boulevard" && !p.is_boulevard_facing) return false;
  if (f.minPrice && p.list_price < Number(f.minPrice)) return false;
  if (f.maxPrice && p.list_price > Number(f.maxPrice)) return false;
  return true;
}

/** `pollMs` is the fallback refresh when live updates (Socket.IO) are not connected. */
export function useMapData(pollMs: number | false = false) {
  return useQuery({ queryKey: ["map-data"], queryFn: () => get<MapData>("realestate.api.get_map_data"), staleTime: 60_000, refetchInterval: pollMs });
}

export function useMapTasks(project: string | undefined) {
  return useQuery({
    queryKey: ["map-tasks", project],
    enabled: Boolean(project),
    queryFn: () => get<MapTask[]>("realestate.maintenance.get_map_tasks", { project: project ?? "" }),
  });
}

export interface FilterOptions {
  blocks: { name: string; block_code: string; color: string; block_type: string }[];
  sizes: { name: string; area_marla: number; plot_type: string }[];
}

export function useFilterOptions() {
  return useQuery({ queryKey: ["plot-filters"], queryFn: () => get<FilterOptions>("realestate.spa.plot_filters"), staleTime: 300_000 });
}
