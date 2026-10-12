import type { KeyboardEvent, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";

export const STAT_TONES = {
  primary: "bg-primary/10 text-primary",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
} as const;

export interface StatCardProps {
  label: string;
  /** A number, formatted money string, or any React node. */
  value: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof STAT_TONES;
  /** Small muted annotation shown to the right of the value (e.g. "deals"). */
  valueSuffix?: string;
  /** Makes the card a toggle button (e.g. click a KPI to filter the list by it). */
  onClick?: () => void;
  /** Highlights the card as the currently applied filter (only meaningful with `onClick`). */
  active?: boolean;
  /** "sm": compact card (document page headers) — smaller value text so long names fit. */
  size?: "sm" | "md";
}

/** Compact KPI card used across CRM list pages. */
export function StatCard({ label, value, icon, tone = "primary", valueSuffix, onClick, active, size = "md" }: StatCardProps) {
  const sm = size === "sm";
  const interactive = onClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-pressed": !!active,
        onClick,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return (
    <Card
      {...interactive}
      className={cn(
        "flex min-w-0 flex-col justify-between",
        sm ? "gap-1.5 px-3 py-2.5" : "gap-2 p-4",
        onClick && "hover-lift cursor-pointer select-none",
        active && "border-primary ring-2 ring-primary/40",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex shrink-0 items-center justify-center rounded-lg", sm ? "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5" : "h-8 w-8", STAT_TONES[tone])}>
          {icon}
        </span>
      </div>
      <p className={cn("flex min-w-0 items-baseline gap-1 leading-tight tabular-nums", sm ? "text-sm font-semibold" : "text-2xl font-bold leading-none")}>
        <span className="min-w-0 flex-1 truncate" title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}>{value}</span>
        {valueSuffix && <span className="text-xs font-medium text-muted-foreground">{valueSuffix}</span>}
      </p>
    </Card>
  );
}