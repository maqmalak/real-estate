/** Connections · Activity · Email · Assign · Attachments for any Frappe document (desk-style form sidebar, as tabs). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Mail, Paperclip, Send, Trash2, UserPlus, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/re/components/ui/button";
import { Input, Label } from "@/re/components/ui/input";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { getCount, getList, post, type Filter } from "@/re/lib/api";
import { dateTime } from "@/re/lib/format";
import type { Communication, FileRow, ToDoRow, Version } from "@/re/lib/types";
import { deskUrl, slug } from "@/re/lib/utils";

export interface Connection {
  label: string;
  doctype: string;
  field: string;
  value?: string;
}

export function ConnectionsTab({ name, connections }: { name: string; connections: Connection[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ["connections", name, connections.map((c) => c.doctype + c.field).join()],
    queryFn: () => Promise.all(connections.map((c) => getCount(c.doctype, [[c.field, "=", c.value ?? name]]).catch(() => 0))),
  });
  if (isLoading) return <Skeleton className="h-24" />;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {connections.map((c, i) => (
        <a key={c.label} href={deskUrl(`${slug(c.doctype)}?${c.field}=${encodeURIComponent(c.value ?? name)}`)} target="_blank" rel="noreferrer"
          className="flex items-center justify-between rounded-md border-[1.5px] border-input bg-input-bg px-3 py-2 text-sm hover:border-primary">
          <span>{c.label}</span>
          <span className="flex items-center gap-2 font-semibold">{data?.[i] ?? 0}<ExternalLink className="size-3.5 text-muted-foreground" /></span>
        </a>
      ))}
    </div>
  );
}

interface CommentRow {
  name: string;
  comment_type: string;
  content: string;
  owner: string;
  creation: string;
}

function describeVersion(v: Version): string {
  try {
    const d = JSON.parse(v.data) as { changed?: [string, unknown, unknown][]; added?: [string, unknown][]; removed?: [string, unknown][] };
    const parts = (d.changed ?? []).slice(0, 4).map(([f, a, b]) => `${f.replace(/_/g, " ")}: ${String(a ?? "—")} → ${String(b ?? "—")}`);
    if (d.added?.length) parts.push(`${d.added.length} row(s) added`);
    if (d.removed?.length) parts.push(`${d.removed.length} row(s) removed`);
    return parts.join(" · ") || "Updated";
  } catch {
    return "Updated";
  }
}

export function ActivityTab({ doctype, name }: { doctype: string; name: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["activity", doctype, name],
    queryFn: async () => {
      const [versions, comments] = await Promise.all([
        getList<Version>("Version", { fields: ["name", "owner", "creation", "data"], filters: [["ref_doctype", "=", doctype], ["docname", "=", name]], orderBy: "creation desc", limit: 50 }),
        getList<CommentRow>("Comment", { fields: ["name", "comment_type", "content", "owner", "creation"],
          filters: [["reference_doctype", "=", doctype], ["reference_name", "=", name], ["comment_type", "in", ["Comment", "Info", "Assigned", "Attachment", "Edit"]]], orderBy: "creation desc", limit: 50 }),
      ]);
      return [
        ...versions.map((v) => ({ key: v.name, at: v.creation, who: v.owner, kind: "change", text: describeVersion(v) })),
        ...comments.map((c) => ({ key: c.name, at: c.creation, who: c.owner, kind: c.comment_type.toLowerCase(), text: c.content.replace(/<[^>]+>/g, "") })),
      ].sort((a, b) => b.at.localeCompare(a.at));
    },
  });
  const add = useMutation({
    mutationFn: () => post("frappe.desk.form.utils.add_comment", { reference_doctype: doctype, reference_name: name, content: text, comment_email: "", comment_by: "" }),
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["activity", doctype, name] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Comment" />
        <Button type="submit" disabled={add.isPending}>{add.isPending ? <Loader2 className="animate-spin" /> : <Send />}</Button>
      </form>
      {isLoading ? <Skeleton className="h-24" /> : !data?.length ? <Empty title="No activity yet" /> : (
        <ol className="space-y-2 border-l-2 pl-4">
          {data.map((a) => (
            <li key={a.key} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
              <p>{a.text}</p>
              <p className="text-xs text-muted-foreground">{a.kind} · {a.who} · {dateTime(a.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function EmailTab({ doctype, name, defaultTo }: { doctype: string; name: string; defaultTo?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["emails", doctype, name],
    queryFn: () => getList<Communication>("Communication", {
      fields: ["name", "subject", "sender", "recipients", "communication_date", "sent_or_received", "content"],
      filters: [["reference_doctype", "=", doctype], ["reference_name", "=", name], ["communication_medium", "=", "Email"]], orderBy: "communication_date desc", limit: 30,
    }),
  });
  const send = useMutation({
    mutationFn: () => post("frappe.core.doctype.communication.email.make", {
      recipients: to, subject, content: body.replace(/\n/g, "<br>"), doctype, name, send_email: 1,
    }),
    onSuccess: () => { toast.success("Email queued"); setOpen(false); setSubject(""); setBody(""); void qc.invalidateQueries({ queryKey: ["emails", doctype, name] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => setOpen((o) => !o)}><Mail /> {open ? "Cancel" : "New email"}</Button>
      {open && (
        <form className="space-y-2 rounded-md border p-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
          <div><Label htmlFor="em-to">To</Label><Input id="em-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label htmlFor="em-sub">Subject</Label><Input id="em-sub" required value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div><Label htmlFor="em-body">Message</Label><textarea id="em-body" className="field h-28" required value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <Button type="submit" disabled={send.isPending}>{send.isPending && <Loader2 className="animate-spin" />} Send</Button>
        </form>
      )}
      {isLoading ? <Skeleton className="h-20" /> : !data?.length ? <Empty title="No emails" hint="Emails sent from here are linked to this record." /> : data.map((c) => (
        <div key={c.name} className="rounded-md border p-3 text-sm">
          <div className="flex justify-between gap-2"><b className="truncate">{c.subject}</b><span className="shrink-0 text-xs text-muted-foreground">{dateTime(c.communication_date)}</span></div>
          <p className="text-xs text-muted-foreground">{c.sent_or_received === "Sent" ? `To ${c.recipients}` : `From ${c.sender}`}</p>
          <p className="mt-1 line-clamp-3">{c.content.replace(/<[^>]+>/g, " ")}</p>
        </div>
      ))}
    </div>
  );
}

export function AssignTab({ doctype, name }: { doctype: string; name: string }) {
  const qc = useQueryClient();
  const [user, setUser] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const key = ["assign", doctype, name];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getList<ToDoRow>("ToDo", { fields: ["name", "allocated_to", "status", "date", "description", "priority"],
      filters: [["reference_type", "=", doctype], ["reference_name", "=", name], ["status", "!=", "Cancelled"]], orderBy: "creation desc" }),
  });
  const { data: users } = useQuery({
    queryKey: ["system-users"],
    queryFn: () => getList<{ name: string; full_name: string }>("User", { fields: ["name", "full_name"], filters: [["user_type", "=", "System User"], ["enabled", "=", 1]], limit: 200 }),
    staleTime: 300_000,
  });
  const add = useMutation({
    mutationFn: () => post("frappe.desk.form.assign_to.add", { assign_to: [user], doctype, name, description: note || undefined, date: due || undefined }),
    onSuccess: () => { toast.success("Assigned"); setUser(""); setNote(""); setDue(""); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (u: string) => post("frappe.desk.form.assign_to.remove", { doctype, name, assign_to: u }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <form className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (user) add.mutate(); }}>
        <div>
          <Label htmlFor="as-user">Assign to</Label>
          <Input id="as-user" list="re-users" placeholder="Type a name or email" value={user} onChange={(e) => setUser(e.target.value)} />
          <datalist id="re-users">{users?.map((u) => <option key={u.name} value={u.name}>{u.full_name}</option>)}</datalist>
        </div>
        <div><Label htmlFor="as-date">Due</Label><Input id="as-date" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <Button type="submit" disabled={!user || add.isPending}><UserPlus /> Assign</Button>
        <div className="sm:col-span-3"><Input placeholder="Note (optional)" aria-label="Assignment note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </form>
      {isLoading ? <Skeleton className="h-16" /> : !data?.length ? <Empty title="Not assigned" /> : data.map((t) => (
        <div key={t.name} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{users?.find((u) => u.name === t.allocated_to)?.full_name ?? t.allocated_to}</p>
            <p className="truncate text-xs text-muted-foreground">{t.status}{t.date ? ` · due ${t.date}` : ""} · {t.description.replace(/<[^>]+>/g, "")}</p>
          </div>
          {t.status === "Open" && (
            <Button size="icon" variant="ghost" title="Remove assignment" onClick={() => remove.mutate(t.allocated_to)}><X /></Button>
          )}
        </div>
      ))}
    </div>
  );
}

export async function upload(file: File, doctype: string, name: string, token: string, isPrivate = true): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("doctype", doctype);
  form.append("docname", name);
  form.append("is_private", isPrivate ? "1" : "0");
  const res = await fetch("/api/method/upload_file", { method: "POST", body: form, credentials: "include", headers: { "X-Frappe-CSRF-Token": token } });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const body = (await res.json()) as { message?: { file_url?: string } };
  return body.message?.file_url ?? "";
}

export function AttachmentsTab({ doctype, name, csrf }: { doctype: string; name: string; csrf: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["files", doctype, name];
  const filters: Filter[] = [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", name]];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getList<FileRow>("File", { fields: ["name", "file_name", "file_url", "creation", "is_private"], filters, orderBy: "creation desc" }),
  });
  const add = useMutation({
    mutationFn: async (files: FileList) => { for (const f of Array.from(files)) await upload(f, doctype, name, csrf); },
    onSuccess: () => { toast.success("Uploaded"); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (file: string) => post("frappe.client.delete", { doctype: "File", name: file }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && add.mutate(e.target.files)} />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={add.isPending}>
        {add.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />} Attach files
      </Button>
      {isLoading ? <Skeleton className="h-16" /> : !data?.length ? <Empty title="No attachments" /> : data.map((f) => (
        <div key={f.name} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <a href={f.file_url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">{f.file_name}</a>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {dateTime(f.creation)}
            <Button size="icon" variant="ghost" title="Delete" onClick={() => del.mutate(f.name)}><Trash2 /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
