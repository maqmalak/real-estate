/** Price-list revision: change the list price of available / on-hold plots by block and size, with a preview first.
 *  Booked and sold plots keep their agreed price; every change is logged in the plot's price history. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { post } from "@/re/lib/api";
import { money } from "@/re/lib/format";
import { useFilterOptions } from "@/re/lib/plots";
import { useAuth } from "@/re/providers/auth";

interface Result { count: number; before: number; after: number; sample: { plot: string; old: number; new: number }[] }
const METHOD = "realestate.real_estate.doctype.re_plot.re_plot.revise_prices";

export function PriceRevision() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const { data: opts } = useFilterOptions();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ block: "", plot_size: "", percent: "5", reason: "" });
  const args = { ...f, block: f.block || undefined, plot_size: f.plot_size || undefined };
  const { data: preview, isFetching } = useQuery({
    queryKey: ["price-preview", f.block, f.plot_size, f.percent], enabled: open && Number(f.percent) !== 0,
    queryFn: () => post<Result>(METHOD, { ...args, reason: "preview", preview: 1 }),
  });
  const apply = useMutation({
    mutationFn: () => post<Result>(METHOD, { ...args, preview: 0 }),
    onSuccess: (r) => { toast.success(`${r.count} plots repriced`); setOpen(false); void qc.invalidateQueries({ queryKey: ["map-data"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!hasRole("Sales Manager", "System Manager")) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><TrendingUp /> Revise prices</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Revise plot prices">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); apply.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="rv-block">Block</Label><Select id="rv-block" value={f.block} onChange={(e) => setF({ ...f, block: e.target.value })}><option value="">All blocks</option>{opts?.blocks.map((b) => <option key={b.name}>{b.name}</option>)}</Select></div>
            <div><Label htmlFor="rv-size">Size</Label><Select id="rv-size" value={f.plot_size} onChange={(e) => setF({ ...f, plot_size: e.target.value })}><option value="">All sizes</option>{opts?.sizes.map((s) => <option key={s.name}>{s.name}</option>)}</Select></div>
            <div><Label htmlFor="rv-pct">Change %</Label><Input id="rv-pct" type="number" step="0.5" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="rv-reason">Reason</Label><Input id="rv-reason" required placeholder="e.g. Q4 price revision" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : preview ? (
              <>
                <p><b>{preview.count}</b> available / on-hold plots · stock value {money(preview.before, { compact: true })} → <b>{money(preview.after, { compact: true })}</b></p>
                <p className="mt-1 text-xs text-muted-foreground">e.g. {preview.sample.slice(0, 4).map((s) => `${s.plot}: ${money(s.old, { compact: true })} → ${money(s.new, { compact: true })}`).join(" · ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Booked and sold plots keep their agreed price.</p>
              </>
            ) : <p className="text-muted-foreground">Enter a non-zero change to preview.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={apply.isPending || !preview?.count}>{apply.isPending && <Loader2 className="animate-spin" />}Apply to {preview?.count ?? 0} plots</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
