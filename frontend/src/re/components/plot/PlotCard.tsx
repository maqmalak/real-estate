/** Plot card for the listing: the plot's real outline on a status-coloured header, size in Marla and sq ft, category
 *  chips, price with price-per-Marla, and for sold plots the owner, payment progress and next / overdue amount. */
import type { Geometry, Position } from "geojson";
import { ArrowUpRight, CalendarClock, CornerDownRight, Trees, Route } from "lucide-react";
import { StatusBadge } from "@/re/components/ui/badge";
import { date, money } from "@/re/lib/format";
import { STATUS_COLORS } from "@/re/lib/plots";
import type { MapPlot } from "@/re/lib/types";
import { cn } from "@/re/lib/utils";

const SQFT_PER_MARLA = 272.25;

function outline(g: Geometry | null): Position[] {
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates[0];
  if (g.type === "MultiPolygon") return g.coordinates[0][0];
  return [];
}

/** The plot polygon scaled into a 100×64 box (equirectangular, true proportions). */
function PlotShape({ geojson, color }: { geojson: Geometry | null; color: string }) {
  const ring = outline(geojson);
  if (ring.length < 3) return null;
  const lat0 = ring[0][1];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const pts = ring.map(([x, y]) => [x * k, -y]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(76 / Math.max(maxX - minX, 1e-9), 46 / Math.max(maxY - minY, 1e-9));
  const ox = (100 - (maxX - minX) * s) / 2, oy = (64 - (maxY - minY) * s) / 2;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(ox + (p[0] - minX) * s).toFixed(1)},${(oy + (p[1] - minY) * s).toFixed(1)}`).join(" ") + "Z";
  return (
    <svg viewBox="0 0 100 64" className="h-full w-full" aria-hidden>
      <path d={d} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function PlotCard({ p, areaMarla, onOpen }: { p: MapPlot; areaMarla?: number; onOpen: () => void }) {
  const color = STATUS_COLORS[p.status] ?? "#64748b";
  const sold = Boolean(p.booking) && p.status !== "Available";
  const outstanding = p.outstanding_amount ?? 0;
  const paidPct = sold && p.list_price ? Math.max(0, Math.min(100, Math.round(((p.list_price - outstanding) * 100) / p.list_price))) : 0;
  const perMarla = areaMarla ? p.list_price / areaMarla : 0;
  const chips: [boolean, string, typeof Trees][] = [[Boolean(p.is_corner), "Corner", CornerDownRight], [Boolean(p.is_park_facing), "Park facing", Trees], [Boolean(p.is_boulevard_facing), "Boulevard", Route]];

  return (
    <button type="button" onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {/* header: outline on a status-tinted backdrop */}
      <div className="relative h-24 shrink-0" style={{ background: `linear-gradient(135deg, ${color}26, ${color}08)` }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted-foreground)/0.15)_1px,transparent_0)] bg-[length:12px_12px]" />
        <div className="absolute inset-y-2 right-3 w-28"><PlotShape geojson={p.geojson} color={color} /></div>
        <div className="absolute left-4 top-3">
          <p className="text-2xl font-bold tracking-tight">{p.name}</p>
          <p className="text-xs text-muted-foreground">{p.block}{p.street ? ` · ${p.street}` : ""}</p>
        </div>
        <div className="absolute bottom-2 left-4 flex gap-1"><StatusBadge status={p.status} />{p.payment_status && <StatusBadge status={p.payment_status} />}</div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{p.plot_size}</span>
          {areaMarla ? <span className="tabular-nums text-muted-foreground">{Math.round(areaMarla * SQFT_PER_MARLA).toLocaleString()} sq ft</span> : null}
        </div>
        {chips.some(([on]) => on) && (
          <div className="flex flex-wrap gap-1.5">
            {chips.filter(([on]) => on).map(([, label, Icon]) => (
              <span key={label} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium"><Icon className="size-3" />{label}</span>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xl font-bold tabular-nums">{money(p.list_price, { compact: true })}</p>
              {perMarla > 0 && <p className="text-[11px] text-muted-foreground">{money(perMarla, { compact: true })} / Marla</p>}
            </div>
            <ArrowUpRight className="size-5 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>

          {!sold && p.status === "Available" && (
            <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />Ready to book · open for site visit &amp; booking
            </p>
          )}
          {!sold && p.status === "Hold" && <p className="mt-3 border-t pt-3 text-xs text-orange-700 dark:text-orange-400">On hold — not for sale right now</p>}
          {sold && (
            <div className="mt-3 space-y-1.5 border-t pt-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{(p.customer_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                  <span className="truncate font-medium">{p.customer_name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{paidPct}% paid</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", p.overdue_amount ? "bg-red-500" : paidPct >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${paidPct}%` }} />
              </div>
              {p.overdue_amount ? (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">Overdue {money(p.overdue_amount, { compact: true })}</p>
              ) : outstanding > 0 && p.next_due_date ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3" />Next due {date(p.next_due_date)} · {money(outstanding, { compact: true })} left</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
