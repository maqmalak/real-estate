/** Hold / release a plot and hand over possession — the same rules as the desk buttons (server-side checks). */
import { todayISO } from "@/re/lib/format";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/re/components/ui/button";
import { Input, Label } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { post } from "@/re/lib/api";
import { useAuth } from "@/re/providers/auth";

const runDoc = (dt: string, dn: string, method: string, args: Record<string, unknown> = {}) =>
  post<{ file_url?: string } | null>("run_doc_method", { dt, dn, method, args: JSON.stringify(args) });

export function PlotStatusActions({ plot, status, booking, bookingStatus, possessionDate }: {
  plot: string; status: string; booking?: string; bookingStatus?: string; possessionDate?: string | null;
}) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [dialog, setDialog] = useState<"hold" | "possession" | null>(null);
  const [reason, setReason] = useState("");
  const [on, setOn] = useState(todayISO());
  const done = (msg: string) => () => {
    toast.success(msg);
    setDialog(null);
    void qc.invalidateQueries({ queryKey: ["plot", plot] });
    void qc.invalidateQueries({ queryKey: ["map-data"] });
  };
  const fail = (e: Error) => toast.error(e.message);
  const hold = useMutation({ mutationFn: () => runDoc("RE Plot", plot, "put_on_hold", { reason }), onSuccess: done("Plot put on hold"), onError: fail });
  const release = useMutation({ mutationFn: () => runDoc("RE Plot", plot, "release_hold"), onSuccess: done("Hold released — plot available"), onError: fail });
  const possession = useMutation({
    mutationFn: () => runDoc("RE Booking", booking!, "give_possession", { possession_date: on, remarks: reason }),
    onSuccess: (r) => { done("Possession given — letter issued")(); if (r?.file_url) window.open(r.file_url, "_blank"); },
    onError: fail,
  });
  const manager = hasRole("Sales Manager", "System Manager");
  const canPossess = hasRole("Sales Manager", "System Manager", "Society Manager") && booking && bookingStatus === "Paid" && !possessionDate;

  return (
    <>
      {manager && ["Available", "Reserved"].includes(status) && <Button variant="outline" onClick={() => { setReason(""); setDialog("hold"); }}><PauseCircle /> Put on hold</Button>}
      {manager && status === "Hold" && <Button variant="outline" disabled={release.isPending} onClick={() => release.mutate()}><PlayCircle /> Release hold</Button>}
      {canPossess && <Button variant="success" onClick={() => { setReason(""); setDialog("possession"); }}><KeyRound /> Give possession</Button>}

      <Dialog open={dialog === "hold"} onOpenChange={(o) => !o && setDialog(null)} title={`Put plot ${plot} on hold`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); hold.mutate(); }}>
          <div><Label htmlFor="hold-reason">Reason</Label><textarea id="hold-reason" required className="field h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. price review, corner premium, dispute" /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" disabled={hold.isPending}>{hold.isPending && <Loader2 className="animate-spin" />}Put on hold</Button></div>
        </form>
      </Dialog>
      <Dialog open={dialog === "possession"} onOpenChange={(o) => !o && setDialog(null)} title={`Hand over plot ${plot}`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); possession.mutate(); }}>
          <p className="text-sm text-muted-foreground">Allowed only when the price is fully paid and the plot has no society dues. The Possession Letter is issued automatically.</p>
          <div><Label htmlFor="pos-date">Possession date</Label><Input id="pos-date" type="date" required value={on} onChange={(e) => setOn(e.target.value)} /></div>
          <div><Label htmlFor="pos-rem">Remarks</Label><textarea id="pos-rem" className="field h-16" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" variant="success" disabled={possession.isPending}>{possession.isPending && <Loader2 className="animate-spin" />}Give possession</Button></div>
        </form>
      </Dialog>
    </>
  );
}
