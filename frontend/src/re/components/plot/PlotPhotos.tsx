/** Plot gallery: the drawn site plan first, then site photos attached to the plot; staff can upload more. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { upload } from "@/re/components/record/RecordTabs";
import { Button } from "@/re/components/ui/button";
import { Dialog } from "@/re/components/ui/sheet";

export function PlotPhotos({ plot, photos, sitePlanSvg, csrf, canUpload }: {
  plot: string; photos: { file_url: string; file_name: string }[]; sitePlanSvg: string; csrf: string; canUpload: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: async (files: FileList) => { for (const f of Array.from(files)) await upload(f, "RE Plot", plot, csrf, false); /* public: owners see them in the portal */ },
    onSuccess: () => { toast.success("Photos added"); void qc.invalidateQueries({ queryKey: ["plot", plot] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Site plan & photos <span className="font-normal text-muted-foreground">({photos.length} photo{photos.length === 1 ? "" : "s"})</span></p>
        {canUpload && (
          <>
            <input ref={input} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => e.target.files?.length && add.mutate(e.target.files)} />
            <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => input.current?.click()}>{add.isPending ? <Loader2 className="animate-spin" /> : <Camera />} Add photos</Button>
          </>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sitePlanSvg && (
          <button type="button" onClick={() => setView("svg")} className="h-28 w-40 shrink-0 overflow-hidden rounded-lg border bg-white p-1" title="Site plan">
            <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: sitePlanSvg }} />
          </button>
        )}
        {photos.map((p) => (
          <button key={p.file_url} type="button" onClick={() => setView(p.file_url)} className="h-28 w-40 shrink-0 overflow-hidden rounded-lg border" title={p.file_name}>
            <img src={p.file_url} alt={p.file_name} loading="lazy" className="size-full object-cover" />
          </button>
        ))}
        {!photos.length && <div className="grid h-28 w-40 shrink-0 place-items-center rounded-lg border border-dashed text-center text-xs text-muted-foreground">No site photos yet</div>}
      </div>
      <Dialog open={Boolean(view)} onOpenChange={(o) => !o && setView(null)} title={view === "svg" ? `Site plan · ${plot}` : `Photo · ${plot}`}>
        {view === "svg" ? <div className="bg-white [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: sitePlanSvg }} />
          : view && <img src={view} alt="" className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </Dialog>
    </section>
  );
}
