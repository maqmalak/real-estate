import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Boxes, Loader2, RefreshCw } from "lucide-react";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { postCall } from "@/services/frappe";
import { asNumber } from "@/utils/cn";
import { formatNumber } from "@/utils/currency";

type Row = Record<string, any>;

/**
 * Raw-material summary and "Get raw materials" for a Production Plan. ERPNext only fills the Raw Materials
 * (mr_items) table on demand, so plans often arrive empty: on a draft the rows are computed from the BOMs and
 * dropped into the form (save to keep them); on a submitted plan they are written straight to the plan.
 */
export function RawMaterialsPanel({ name, isNew, docstatus, values, rows, patch, reload }: ExtraContext) {
  const [busy, setBusy] = useState(false);
  const mr = (rows.mr_items ?? []) as Row[];
  const hasAssemblies = ((rows.po_items ?? []) as Row[]).some((r) => r.item_code && r.bom_no && asNumber(r.planned_qty) > 0);
  const short = mr.filter((r) => asNumber(r.quantity) > asNumber(r.actual_qty));
  const totalQty = mr.reduce((s, r) => s + asNumber(r.quantity), 0);
  const cancelled = docstatus === 2;

  const run = async () => {
    setBusy(true);
    try {
      if (!isNew && name && docstatus === 1) {
        const n = await postCall<number>("micromax.production_plan.fill_raw_materials", { name });
        toast.success(n ? `${n} raw materials loaded from the BOMs` : "The BOMs have no raw materials to plan");
        reload();
      } else {
        const doc = { ...values, doctype: "Production Plan", po_items: rows.po_items ?? [], sub_assembly_items: rows.sub_assembly_items ?? [] };
        const out = await postCall<Row[]>("micromax.production_plan.get_raw_materials", { doc: JSON.stringify(doc) });
        patch({ mr_items: (out ?? []).map((r) => ({ ...r })) });
        toast.success(out?.length ? `${out.length} raw materials added — save the plan to keep them` : "The BOMs have no raw materials to plan");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not get raw materials");
    } finally {
      setBusy(false);
    }
  };

  if (cancelled) return null;
  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Boxes className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Raw materials</p>
        {mr.length ? (
          <p className="text-xs text-muted-foreground">
            {mr.length} materials · {formatNumber(totalQty, 0)} required
            {short.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-medium text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {short.length} short of stock in the raw-material warehouse
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {hasAssemblies ? "Not calculated yet — get them from the assembly items' BOMs." : "Add assembly items with a BOM first."}
          </p>
        )}
      </div>
      <Button size="sm" variant={mr.length ? "outline" : "default"} onClick={run} disabled={busy || !hasAssemblies}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
        {mr.length ? "Recalculate raw materials" : "Get raw materials"}
      </Button>
    </Card>
  );
}
