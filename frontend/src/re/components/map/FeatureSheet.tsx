/** Side panel for an infrastructure / public-building feature clicked on the society map: type, status, progress,
 *  estimated cost, contractor, ERPNext Asset and Project spend, size, files; managers can update progress in place. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Sheet } from "@/re/components/ui/sheet";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get, post } from "@/re/lib/api";
import { date, money } from "@/re/lib/format";
import { Link } from "react-router-dom";
import { recordUrl } from "@/re/lib/utils";

interface Detail {
  feature: { name: string; feature_name: string; feature_type: string; category: string; asset_status: string | null; completion_pct: number;
    estimated_cost: number; contractor: string | null; asset: string | null; erp_project: string | null; notes: string | null; color: string | null; width_ft: number | null };
  contractor_name: string | null; length_m: number; area_m2: number; area_kanal: number;
  asset: { name: string; asset_name: string; asset_category: string; status: string; net_purchase_amount: number; purchase_date: string; location: string | null } | null;
  project: { name: string; project_name: string; status: string; percent_complete: number; estimated_costing: number; spent: number } | null;
  files: { file_name: string; file_url: string; creation: string }[];
  can_edit: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{children}</span></div>;
}

export function FeatureSheet({ name, onClose }: { name: string | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["feature", name], enabled: Boolean(name), queryFn: () => get<Detail>("realestate.mapedit.feature_detail", { name: name ?? "" }) });
  const [f, setF] = useState({ asset_status: "", completion_pct: 0, estimated_cost: 0, notes: "" });
  useEffect(() => {
    if (data) setF({ asset_status: data.feature.asset_status ?? "", completion_pct: data.feature.completion_pct ?? 0, estimated_cost: data.feature.estimated_cost ?? 0, notes: data.feature.notes ?? "" });
  }, [data]);
  const save = useMutation({
    mutationFn: () => post("realestate.mapedit.update_feature", { name: name!, ...f }),
    onSuccess: () => { toast.success("Progress updated"); void qc.invalidateQueries({ queryKey: ["feature", name] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = data?.feature;
  const tone = d?.asset_status === "Completed" ? "green" : d?.asset_status === "In Progress" ? "amber" : "gray";

  return (
    <Sheet open={Boolean(name)} onOpenChange={(o) => !o && onClose()}
      title={<span className="flex items-center gap-2">{d?.feature_name ?? name}{d?.asset_status && <Badge tone={tone}>{d.asset_status}</Badge>}</span>}
      description={d ? `${d.feature_type} · ${d.category}` : undefined}>
      {isLoading || !data || !d ? <Skeleton className="h-96" /> : (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-sm"><span className="font-medium">Progress</span><span className="tabular-nums">{Math.round(d.completion_pct ?? 0)}%</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${d.completion_pct ?? 0}%` }} /></div>
          </div>
          <div className="rounded-xl border px-3">
            <Row label="Estimated cost">{d.estimated_cost ? money(d.estimated_cost) : "—"}</Row>
            <Row label="Contractor">{data.contractor_name ?? "—"}</Row>
            {data.length_m > 0 && <Row label="Length">{data.length_m.toLocaleString()} m</Row>}
            {data.area_m2 > 0 && <Row label="Area">{data.area_m2.toLocaleString()} m² · {data.area_kanal} kanal</Row>}
            {d.width_ft ? <Row label="Width">{d.width_ft} ft</Row> : null}
          </div>
          {data.asset && (
            <div className="rounded-xl border p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ERPNext asset</p>
              <Link className="font-semibold text-primary hover:underline" to={recordUrl("Asset", data.asset.name)}>{data.asset.asset_name}</Link>
              <p className="text-muted-foreground">{data.asset.asset_category} · {data.asset.status} · {money(data.asset.net_purchase_amount)} · bought {date(data.asset.purchase_date)}</p>
            </div>
          )}
          {data.project && (
            <div className="rounded-xl border p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Development project</p>
              <p className="font-semibold">{data.project.project_name}</p>
              <p className="text-muted-foreground">{data.project.status} · {Math.round(data.project.percent_complete ?? 0)}% · spent {money(data.project.spent)}{data.project.estimated_costing ? ` of ${money(data.project.estimated_costing)}` : ""}</p>
            </div>
          )}
          {data.files.length > 0 && (
            <div className="space-y-1">{data.files.map((x) => <a key={x.file_url} href={x.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><FileText className="size-4" />{x.file_name}</a>)}</div>
          )}
          {d.notes && <p className="rounded-lg bg-muted/50 p-3 text-sm">{d.notes}</p>}
          {data.can_edit && (
            <form className="space-y-3 rounded-xl border p-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <p className="text-sm font-semibold">Update progress</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="fs-st">Status</Label><Select id="fs-st" value={f.asset_status} onChange={(e) => setF({ ...f, asset_status: e.target.value })}><option value="">—</option><option>Planned</option><option>In Progress</option><option>Completed</option></Select></div>
                <div><Label htmlFor="fs-pc">% complete</Label><Input id="fs-pc" type="number" min={0} max={100} value={f.completion_pct} onChange={(e) => setF({ ...f, completion_pct: Number(e.target.value) })} /></div>
              </div>
              <div><Label htmlFor="fs-cost">Estimated cost</Label><Input id="fs-cost" type="number" value={f.estimated_cost} onChange={(e) => setF({ ...f, estimated_cost: Number(e.target.value) })} /></div>
              <div><Label htmlFor="fs-notes">Notes</Label><textarea id="fs-notes" className="field h-16" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
              <Button type="submit" size="sm" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save</Button>
            </form>
          )}
          <Button asChild variant="outline" size="sm"><Link to={recordUrl("RE Map Feature", d.name)}><ExternalLink /> Open record</Link></Button>
        </div>
      )}
    </Sheet>
  );
}
