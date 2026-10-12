import { useEffect, useState } from "react";
import { Cog, Disc3, Layers, Scissors, Shirt, Sprout, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";
import type { ProcessStage } from "./industry-process-data";
import "./textile-process.css";

/* ------------------------------------------------------------------ *
 * Process flow — site-styled variant ("Option B"). Same seven-stage shape
 * as ProcessDiagram (the infographic-styled "Option A"), rebuilt with this
 * page's own components: Card, lucide icons, the module `tone` convention
 * (bg-*-500/20 text-*-600 dark:text-*-400 — bumped from the module system's
 * usual /10 so the icon circles read as boldly as Option A's own icon
 * backgrounds) and theme-aware colors, so it sits consistently with the
 * rest of the page instead of carrying its own fixed look.
 *
 * `ProcessFlowSite` is the reusable component (any industry's stages, see
 * industry-process-data.ts); `TextileProcessSite` is Textile & Garments'
 * own hand-picked seven stages, kept as its own export since it was tuned
 * first and other call sites already import it by that name.
 * ------------------------------------------------------------------ */

// `color` isn't used by this (site-styled) component — Option B colours its
// icons via the Tailwind `tone` classes below — but the shared ProcessStage
// type carries it too, for Option A's SVG rendering when reused elsewhere.
const TEXTILE_STAGES: ProcessStage[] = [
  { n: 1, label: "Raw Material", sub: "Cotton & fibre", icon: Sprout, tone: "bg-green-500/20 text-green-600 dark:text-green-400", color: "#16a34a" },
  { n: 2, label: "Collection", sub: "Of raw materials", icon: Truck, tone: "bg-red-500/20 text-red-600 dark:text-red-400", color: "#dc2626" },
  { n: 3, label: "Processing", sub: "Of raw materials", icon: Cog, tone: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400", color: "#059669" },
  { n: 4, label: "Threads", sub: "Spun & dyed", icon: Disc3, tone: "bg-orange-500/20 text-orange-600 dark:text-orange-400", color: "#ea580c" },
  { n: 5, label: "Fabric Manufacture", sub: "Weaving & folding", icon: Layers, tone: "bg-teal-500/20 text-teal-600 dark:text-teal-400", color: "#0d9488" },
  { n: 6, label: "Tailoring", sub: "Cut & sewn", icon: Scissors, tone: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400", color: "#4f46e5" },
  { n: 7, label: "Ready-Made Clothes", sub: "Garment manufacturing", icon: Shirt, tone: "bg-pink-500/20 text-pink-600 dark:text-pink-400", color: "#db2777" },
];

const CYCLE_MS = 900;

/** Animated seven-stage process flow, built from this page's own Card / icon / colour system. */
export function ProcessFlowSite({ stages }: { stages: ProcessStage[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    const id = window.setInterval(() => setActive((a) => (a + 1) % stages.length), CYCLE_MS);
    return () => window.clearInterval(id);
  }, [stages]);

  return (
    <div className="mt-2.5">
      {/* Single row, seven text labels — needs more horizontal room than the infographic
          card's one graphic, so it gets its own cap rather than matching that width.
          dark:bg-card overrides the Card component's own dark:bg-white/5 (a translucent
          overlay, not the same solid colour Option A uses via hsl(var(--card))) so both
          cards are the same solid colour in dark theme, not just "both dark". */}
      <Card className="relative max-w-[700px] overflow-hidden p-3 dark:bg-card sm:p-4">
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-4 sm:flex-nowrap">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            const isActive = i === active;
            return (
              <div key={stage.n} className="flex flex-1 basis-[5.5rem] items-start sm:basis-0">
                <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                  <div className="relative">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
                        stage.tone,
                        isActive && "ring-2 ring-primary ring-offset-1 ring-offset-card scale-110",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                      {stage.n}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold leading-tight">{stage.label}</p>
                  <p className="mt-0.5 text-[8px] uppercase leading-tight tracking-wide text-muted-foreground">{stage.sub}</p>
                </div>

                {stage.n < stages.length && (
                  <div className="relative mt-4 hidden h-px flex-1 shrink-0 bg-border sm:block dark:bg-white/10">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out",
                        i < active ? "w-full" : i === active ? "w-1/2" : "w-0",
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** Textile & Garments' own process flow — its seven stages, unchanged. */
export function TextileProcessSite() {
  return <ProcessFlowSite stages={TEXTILE_STAGES} />;
}
