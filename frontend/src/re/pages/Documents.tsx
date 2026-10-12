import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileBadge, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/re/components/ui/card";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { getList, post } from "@/re/lib/api";
import { date, dateTime } from "@/re/lib/format";

const TYPES: Record<string, string> = {
  "Booking Application Form": "RE Booking", "Allotment Letter": "RE Booking", "Payment Schedule": "RE Booking", "Installment Reminder": "RE Booking",
  "Final Notice": "RE Booking", "Cancellation Letter": "RE Booking", "No Demand Certificate": "RE Booking", "Possession Letter": "RE Booking",
  "Sale Agreement": "RE Booking", "Payment Receipt": "RE Payment", "Site Plan": "RE Plot", "NOC for Construction": "RE Plot",
  "Maintenance Bill": "RE Society Bill", "Customer Account Statement": "Customer",
  "Transfer Application": "RE Plot Transfer", "Transfer Letter": "RE Plot Transfer",
};

interface Gen { name: string; document_type: string; reference_doctype: string; reference_name: string; version: number; customer: string | null; plot: string | null; issued_on: string; file: string | null }
interface Vault { name: string; title: string; document_type: string; authority: string | null; reference_no: string | null; issue_date: string | null; expiry_date: string | null; status: string; file: string | null }

export function DocumentsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState("Allotment Letter");
  const [ref, setRef] = useState("");
  const gen = useQuery({ queryKey: ["re-gen-docs"], queryFn: () => getList<Gen>("RE Generated Document", {
    fields: ["name", "document_type", "reference_doctype", "reference_name", "version", "customer", "plot", "issued_on", "file"], orderBy: "issued_on desc", limit: 40 }) });
  const vault = useQuery({ queryKey: ["re-vault"], queryFn: () => getList<Vault>("RE Vault Document", {
    fields: ["name", "title", "document_type", "authority", "reference_no", "issue_date", "expiry_date", "status", "file"], orderBy: "expiry_date asc", limit: 100 }) });
  const make = useMutation({
    mutationFn: () => post<{ file_url: string; version: number }>("realestate.documents.generate", { document_type: type, reference_name: ref.trim() }),
    onSuccess: (r) => { toast.success(`${type} v${r.version} generated`); window.open(r.file_url, "_blank"); void qc.invalidateQueries({ queryKey: ["re-gen-docs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground">Letters and forms on the project letterhead (versioned PDFs) and the document vault with expiry alerts</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Generate a document</CardTitle><CardDescription>Also available from the Actions menu of a booking, plot, bill or receipt</CardDescription></CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[16rem_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (ref.trim()) make.mutate(); }}>
            <div>
              <Label htmlFor="d-type">Document</Label>
              <Select id="d-type" value={type} onChange={(e) => setType(e.target.value)}>{Object.keys(TYPES).map((t) => <option key={t}>{t}</option>)}</Select>
            </div>
            <div>
              <Label htmlFor="d-ref">{TYPES[type]} name</Label>
              <Input id="d-ref" required value={ref} onChange={(e) => setRef(e.target.value)} placeholder={TYPES[type] === "RE Plot" ? "e.g. A-012" : TYPES[type] === "Customer" ? "Customer name" : "e.g. RE-BK-2026-00001"} />
            </div>
            <Button type="submit" disabled={make.isPending}>{make.isPending ? <Loader2 className="animate-spin" /> : <FileText />} Generate PDF</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileBadge className="size-4" /> Generated documents</CardTitle><CardDescription><Link className="underline" to="/re/d/re-generated-document">All versions</Link></CardDescription></CardHeader>
          <CardContent className="divide-y">
            {gen.isLoading ? <Skeleton className="h-40" /> : !gen.data?.length ? <Empty title="None yet" /> : gen.data.map((g) => (
              <div key={g.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{g.document_type} <span className="text-xs text-muted-foreground">v{g.version}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{g.reference_name}{g.plot ? ` · plot ${g.plot}` : ""} · {dateTime(g.issued_on)}</p>
                </div>
                {g.file && <Button size="sm" variant="outline" asChild><a href={g.file} target="_blank" rel="noreferrer">PDF</a></Button>}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Archive className="size-4" /> Document vault</CardTitle><CardDescription>NOCs, approvals, fard, registry, mutation, layout plans, demand notices — <Link className="underline" to="/re/d/re-vault-document/new">add</Link></CardDescription></CardHeader>
          <CardContent className="divide-y">
            {vault.isLoading ? <Skeleton className="h-40" /> : !vault.data?.length ? <Empty title="Vault is empty" /> : vault.data.map((v) => (
              <Link key={v.name} to={`/re/d/re-vault-document/${v.name}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-accent/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{v.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.document_type} · {v.authority ?? ""}{v.reference_no ? ` · ${v.reference_no}` : ""}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <Badge tone={v.status === "Expired" ? "red" : v.status === "Expiring Soon" ? "amber" : v.status === "Valid" ? "green" : "gray"}>{v.status}</Badge>
                  <p className="mt-1 text-muted-foreground">{v.expiry_date ? `expires ${date(v.expiry_date)}` : "no expiry"}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
