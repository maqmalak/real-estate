/** Customer identity & nominee (CNIC, father/husband, address, nominee) with an edit dialog. The server validates
 *  and formats CNICs and mobiles (realestate.identity), so errors come back as readable toasts. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, Loader2, Pencil, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { Skeleton } from "@/re/components/ui/skeleton";
import { getList, post } from "@/re/lib/api";

interface Identity {
  name: string; re_cnic: string | null; re_father_name: string | null; re_postal_address: string | null;
  re_nominee_name: string | null; re_nominee_relation: string | null; re_nominee_cnic: string | null; re_nominee_mobile: string | null;
}
const FIELDS = ["re_cnic", "re_father_name", "re_postal_address", "re_nominee_name", "re_nominee_relation", "re_nominee_cnic", "re_nominee_mobile"] as const;
const RELATIONS = ["Spouse", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Other"];

export function IdentityCard({ customer }: { customer: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["identity", customer],
    queryFn: async () => (await getList<Identity>("Customer", { fields: ["name", ...FIELDS], filters: [["name", "=", customer]], limit: 1 }))[0],
  });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setForm(Object.fromEntries(FIELDS.map((f) => [f, data[f] ?? ""])));
  }, [data, open]);
  const save = useMutation({
    mutationFn: () => post("frappe.client.set_value", { doctype: "Customer", name: customer, fieldname: JSON.stringify(form) }),
    onSuccess: () => { toast.success("Identity saved"); setOpen(false); void qc.invalidateQueries({ queryKey: ["identity", customer] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading || !data) return <Skeleton className="h-28" />;
  const missing = !data.re_cnic;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><IdCard className="size-5" /></span>
        <div className="min-w-0 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</p>
          <p className={missing ? "font-semibold text-red-600 dark:text-red-400" : "font-semibold tabular-nums"}>{data.re_cnic ?? "CNIC missing — bookings cannot be submitted"}</p>
          {data.re_father_name && <p className="text-muted-foreground">s/o, d/o, w/o {data.re_father_name}</p>}
          {data.re_postal_address && <p className="truncate text-muted-foreground">{data.re_postal_address}</p>}
        </div>
      </div>
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400"><UserRound className="size-5" /></span>
        <div className="min-w-0 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nominee</p>
          <p className="font-semibold">{data.re_nominee_name ?? "Not set"}{data.re_nominee_relation && <span className="font-normal text-muted-foreground"> · {data.re_nominee_relation}</span>}</p>
          {data.re_nominee_cnic && <p className="tabular-nums text-muted-foreground">CNIC {data.re_nominee_cnic}</p>}
          {data.re_nominee_mobile && <p className="tabular-nums text-muted-foreground">{data.re_nominee_mobile}</p>}
        </div>
      </div>
      <div className="flex items-start"><Button size="sm" variant={missing ? "default" : "outline"} onClick={() => setOpen(true)}><Pencil /> Edit</Button></div>

      <Dialog open={open} onOpenChange={setOpen} title="Identity & nominee">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="id-cnic">CNIC</Label><Input id="id-cnic" placeholder="35202-1234567-1" value={form.re_cnic ?? ""} onChange={(e) => set("re_cnic", e.target.value)} /></div>
            <div><Label htmlFor="id-father">Father / husband name</Label><Input id="id-father" value={form.re_father_name ?? ""} onChange={(e) => set("re_father_name", e.target.value)} /></div>
          </div>
          <div><Label htmlFor="id-addr">Postal address</Label><textarea id="id-addr" className="field h-16" value={form.re_postal_address ?? ""} onChange={(e) => set("re_postal_address", e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="id-nom">Nominee name</Label><Input id="id-nom" value={form.re_nominee_name ?? ""} onChange={(e) => set("re_nominee_name", e.target.value)} /></div>
            <div><Label htmlFor="id-rel">Relation</Label>
              <Select id="id-rel" value={form.re_nominee_relation ?? ""} onChange={(e) => set("re_nominee_relation", e.target.value)}>
                <option value="">—</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="id-ncnic">Nominee CNIC</Label><Input id="id-ncnic" placeholder="35202-1234567-1" value={form.re_nominee_cnic ?? ""} onChange={(e) => set("re_nominee_cnic", e.target.value)} /></div>
            <div><Label htmlFor="id-nmob">Nominee mobile</Label><Input id="id-nmob" placeholder="0300-1234567" value={form.re_nominee_mobile ?? ""} onChange={(e) => set("re_nominee_mobile", e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">CNICs are formatted 12345-1234567-1 and must be unique; mobiles are saved as +92 3XX XXXXXXX.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
