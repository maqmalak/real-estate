import type { ExtraContext } from "@/components/doc/doc-config";
import { Card } from "@/components/ui/card";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";

/** Cost figures to the paisa — the build-up mixes large raw-material totals with small waste credits. */
const money2 = (v: number, cur: string) => formatMoney(v, cur, { decimals: 2 });

const COLORS = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-orange-500"];

/** BOM "Costing" tab header: per-unit cost, build-up bar and the components that drive the raw-material cost. */
export function BomCostingPanel({ values, rows }: ExtraContext) {
  const cur = values.currency || "PKR";
  const qty = asNumber(values.quantity) || 1;
  const rm = asNumber(values.raw_material_cost);
  const op = asNumber(values.operating_cost);
  const sec = asNumber(values.secondary_items_cost);
  const total = asNumber(values.total_cost) || rm + op - sec;
  const gross = rm + op || 1;
  const items = (rows.items ?? [])
    .map((r) => ({ label: r.item_name || r.item_code, code: r.item_code, amount: asNumber(r.amount) || asNumber(r.qty) * asNumber(r.rate), rate: asNumber(r.rate), qty: asNumber(r.qty), uom: r.uom }))
    .filter((r) => r.label)
    .sort((a, b) => b.amount - a.amount);
  const rmTotal = items.reduce((s, r) => s + r.amount, 0) || 1;
  const tiles = [
    { label: "Cost per unit", value: money2(total / qty, cur), sub: `per ${values.uom ?? "unit"}`, tone: "text-primary" },
    { label: "Total cost", value: formatMoney(total, cur, { compact: true }), sub: `for ${formatNumber(qty, 3)} ${values.uom ?? ""}`, tone: "" },
    { label: "Raw materials", value: formatMoney(rm, cur, { compact: true }), sub: `${formatNumber((rm / gross) * 100, 1)}% of gross`, tone: "text-sky-600 dark:text-sky-400" },
    { label: "Operations", value: formatMoney(op, cur, { compact: true }), sub: values.with_operations ? `${formatNumber((op / gross) * 100, 1)}% of gross` : "“With Operations” is off", tone: "text-violet-600 dark:text-violet-400" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className={cn("truncate text-lg font-bold tabular-nums", t.tone)}>{t.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.sub}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <p className="text-sm font-semibold">Cost build-up</p>
          <p className="mb-4 text-xs text-muted-foreground">Total = raw materials + operations − secondary items</p>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted">
            <div className="bg-sky-500" style={{ width: `${(rm / gross) * 100}%` }} />
            <div className="bg-violet-500" style={{ width: `${(op / gross) * 100}%` }} />
          </div>
          <dl className="space-y-2 text-sm">
            {[["Raw materials", rm, "bg-sky-500"], ["Operations", op, "bg-violet-500"], ["Secondary items (credit)", -sec, "bg-emerald-500"]].map(([l, v, c]) => (
              <div key={l as string} className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground"><i className={cn("h-2.5 w-2.5 rounded-sm", c as string)} /> {l}</dt>
                <dd className="font-medium tabular-nums">{money2(v as number, cur)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold"><dt>Total cost</dt><dd className="tabular-nums">{money2(total, cur)}</dd></div>
          </dl>
        </Card>
        <Card className="p-5 lg:col-span-3">
          <p className="text-sm font-semibold">What drives the raw-material cost</p>
          <p className="mb-4 text-xs text-muted-foreground">Components by amount (qty × rate) — {values.rm_cost_as_per ? `rates as per ${values.rm_cost_as_per}` : "rates from the Component tab"}</p>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No components yet.</p>
          ) : (
            <ul className="max-h-72 space-y-2.5 overflow-y-auto pr-1 scrollbar-thin">
              {items.slice(0, 12).map((r, i) => (
                <li key={`${r.code}-${i}`} title={`${r.code}: ${formatNumber(r.qty, 3)} ${r.uom ?? ""} × ${money2(r.rate, cur)} = ${money2(r.amount, cur)}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate font-medium">{r.label}</span>
                    <span className="shrink-0 tabular-nums"><b>{formatMoney(r.amount, cur, { compact: true })}</b><span className="ml-1.5 inline-block w-11 text-right text-muted-foreground">{formatNumber((r.amount / rmTotal) * 100, 1)}%</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-2 rounded-full", COLORS[i % COLORS.length])} style={{ width: `${Math.max((r.amount / items[0].amount) * 100, 1.5)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
