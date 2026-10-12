/**
 * Team WhatsApp inbox (/re/inbox): every RE Conversation with views Mine / Unassigned / Unread / All / Resolved,
 * the thread with delivery ticks, reply box with quick replies, templates and plot location pins, assignment,
 * resolve / reopen, opt-out, and call logging (CRM Call Log). Polls every few seconds (no socket server needed).
 * In mock mode a "Simulate" button injects an incoming customer message through the real webhook handler.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban, Check, CheckCheck, CheckCircle2, Paperclip, Clock, ExternalLink, FlaskConical, Loader2, MapPin, MessageCircle, Phone, RotateCcw, Search, Send, TriangleAlert, Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get, post } from "@/re/lib/api";
import { upload } from "@/re/components/record/RecordTabs";
import { useAuth } from "@/re/providers/auth";
import { dateTime, time } from "@/re/lib/format";
import { cn, deskUrl, slug } from "@/re/lib/utils";

interface Conversation {
  name: string; contact_name: string; phone: string; party_type: string | null; party: string | null; agent: string | null; status: string;
  unread_count: number; last_message: string | null; last_message_at: string | null; last_direction: string | null; opted_out: 0 | 1;
}
interface Message {
  name: string; direction: "Incoming" | "Outgoing"; message: string; status: string | null; at: string; file_url?: string; file_name?: string;
  template_label?: string; error?: string; agent?: string | null; re_latitude?: number; re_longitude?: number; re_location_name?: string;
}
interface Ctx {
  party_type: string | null; party: string | null; party_name: string | null; phone: string; wa_link: string | null; mock: boolean; opted_out: boolean;
  plots: { name: string; block: string; plot_size: string; status: string }[];
  template_refs: { templates: { name: string; template_label?: string; reference_doctype?: string }[]; refs: Record<string, string[]> };
}
type View = "mine" | "unassigned" | "unread" | "all" | "resolved";
const VIEWS: [View, string, string][] = [["mine", "Mine", "mine"], ["unassigned", "Unassigned", "unassigned"], ["unread", "Unread", "unread"], ["all", "All open", "all"], ["resolved", "Resolved", ""]];
const OUTCOMES = ["Answered", "Promised to Pay", "Call Back Later", "Not Interested", "No Answer", "Busy"];

function initials(s: string) {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function Ticks({ status: raw }: { status: string | null }) {
  const status = raw?.toLowerCase() ?? null;
  if (status === "read") return <CheckCheck className="size-3.5 text-sky-400" />;
  if (status === "delivered") return <CheckCheck className="size-3.5 opacity-70" />;
  if (status === "sent" || status === "success") return <Check className="size-3.5 opacity-70" />;
  if (status === "failed") return <TriangleAlert className="size-3.5 text-red-300" />;
  return <Clock className="size-3.5 opacity-60" />;
}

// ------------------------------------------------------------------ call logging
function CallDialog({ conv, open, onOpenChange }: { conv: Conversation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [direction, setDirection] = useState("Outgoing");
  const [outcome, setOutcome] = useState("Answered");
  const [minutes, setMinutes] = useState("2");
  const [notes, setNotes] = useState("");
  const [promised, setPromised] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [followUp, setFollowUp] = useState("");
  const save = useMutation({
    mutationFn: () => post<string>("realestate.whatsapp.calls.log_call", {
      party_type: conv.party_type!, party: conv.party!, direction, outcome, duration: Math.round(Number(minutes || 0) * 60), notes, phone: conv.phone,
      promised_amount: promised || undefined, promised_date: promisedDate || undefined, next_follow_up: followUp || undefined,
    }),
    onSuccess: (n) => { toast.success(`Call logged (${n})`); onOpenChange(false); setNotes(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Log call · ${conv.contact_name}`}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-3 gap-3">
          <div><Label htmlFor="c-dir">Direction</Label><Select id="c-dir" value={direction} onChange={(e) => setDirection(e.target.value)}><option>Outgoing</option><option>Incoming</option></Select></div>
          <div><Label htmlFor="c-out">Outcome</Label><Select id="c-out" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</Select></div>
          <div><Label htmlFor="c-min">Minutes</Label><Input id="c-min" type="number" min={0} step="0.5" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
        </div>
        {outcome === "Promised to Pay" && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="c-amt">Promised amount</Label><Input id="c-amt" type="number" min={0} value={promised} onChange={(e) => setPromised(e.target.value)} /></div>
            <div><Label htmlFor="c-pd">Promised date</Label><Input id="c-pd" type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} /></div>
          </div>
        )}
        <div><Label htmlFor="c-fu">Next follow-up</Label><Input id="c-fu" type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value.replace("T", " "))} /></div>
        <div><Label htmlFor="c-notes">Notes</Label><textarea id="c-notes" className="field h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Missed / no-answer calls and follow-up dates create a CRM task for the agent automatically.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Save call</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ thread
function Thread({ conv, agents }: { conv: Conversation; agents: { name: string; full_name: string }[] }) {
  const qc = useQueryClient();
  const bottom = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [callOpen, setCallOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { boot } = useAuth();
  const sendFile = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 16 * 1024 * 1024) throw new Error("WhatsApp accepts files up to 16 MB");
      const url = await upload(file, "RE Conversation", conv.name, boot?.csrf_token ?? "", true);
      return post<string>("realestate.whatsapp.api.send", { doctype: "RE Conversation", name: conv.name, profile: conv.name, attach: url, message: text });
    },
    onSuccess: () => { setText(""); toast.success("File sent"); void qc.invalidateQueries({ queryKey: ["wa-thread", conv.name] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const { data: msgs, isLoading } = useQuery({
    queryKey: ["wa-thread", conv.name], refetchInterval: 4000,
    queryFn: () => get<Message[]>("realestate.whatsapp.api.get_thread", { profile: conv.name, limit: 200 }),
  });
  const { data: ctx } = useQuery({ queryKey: ["wa-ctx", conv.name], queryFn: () => get<Ctx>("realestate.whatsapp.api.get_context", { doctype: "RE Conversation", name: conv.name }) });
  const { data: replies } = useQuery({ queryKey: ["wa-quick"], queryFn: () => get<{ title: string; shortcut: string; message: string }[]>("realestate.whatsapp.api.quick_replies"), staleTime: 600_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["wa-thread", conv.name] });
    void qc.invalidateQueries({ queryKey: ["wa-convs"] });
    void qc.invalidateQueries({ queryKey: ["wa-counts"] });
  };
  useEffect(() => {
    if (conv.unread_count) void post("realestate.whatsapp.inbox.mark_read", { conversation: conv.name }).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.name, conv.unread_count]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length, conv.name]);

  const send = useMutation({
    mutationFn: (args: Record<string, string>) => post<string>("realestate.whatsapp.api.send", { doctype: "RE Conversation", name: conv.name, profile: conv.name, ...args }),
    onSuccess: () => { setText(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (args: Record<string, string>) => post("realestate.whatsapp.inbox.assign", { conversation: conv.name, ...args }),
    onSuccess: () => { toast.success("Updated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const optOut = useMutation({
    mutationFn: (v: number) => post("realestate.whatsapp.inbox.set_opted_out", { conversation: conv.name, opted_out: v }),
    onSuccess: refresh, onError: (e: Error) => toast.error(e.message),
  });
  const simulate = useMutation({
    mutationFn: (msg: string) => post("realestate.whatsapp.mock.simulate_incoming_message", { phone: conv.phone, text: msg, name: conv.contact_name }),
    onSuccess: refresh, onError: (e: Error) => toast.error(e.message),
  });
  const plots = (ctx?.plots ?? []).map((p) => p.name);
  const onText = (v: string) => {
    setText(v);
    setQuick(v.startsWith("/"));
  };
  const matches = (replies ?? []).filter((r) => !text.startsWith("/") || `/${r.shortcut.replace(/^\//, "")}`.startsWith(text.toLowerCase()) || r.title.toLowerCase().includes(text.slice(1).toLowerCase()));
  const partyUrl = conv.party_type === "Customer" ? `/re/customers/${encodeURIComponent(conv.party!)}` : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <span className="grid size-10 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white">{initials(conv.contact_name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conv.contact_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conv.phone}
            {conv.party && <> · {conv.party_type}: {partyUrl ? <Link className="text-primary hover:underline" to={partyUrl}>{conv.party}</Link> : <a className="text-primary hover:underline" href={conv.party_type === "CRM Lead" ? `/crm/leads/${encodeURIComponent(conv.party)}` : deskUrl(`${slug(conv.party_type!)}/${encodeURIComponent(conv.party)}`)}>{conv.party}</a>}</>}
          </p>
        </div>
        <Select aria-label="Assigned agent" className="h-9 w-44" value={conv.agent ?? ""} onChange={(e) => update.mutate({ agent: e.target.value })}>
          <option value="">Unassigned</option>
          {agents.map((a) => <option key={a.name} value={a.name}>{a.full_name}</option>)}
        </Select>
        {conv.party && <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}><Phone /> Log call</Button>}
        {ctx?.wa_link && <Button size="sm" variant="outline" asChild><a href={ctx.wa_link} target="_blank" rel="noreferrer"><ExternalLink /> wa.me</a></Button>}
        {conv.status === "Open"
          ? <Button size="sm" variant="success" onClick={() => update.mutate({ status: "Resolved" })}><CheckCircle2 /> Resolve</Button>
          : <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "Open" })}><RotateCcw /> Reopen</Button>}
      </div>
      {conv.opted_out ? (
        <div className="flex items-center justify-between gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          <span className="flex items-center gap-2"><Ban className="size-4" />Opted out of WhatsApp — reminders and broadcasts skip this number.</span>
          <Button size="sm" variant="outline" onClick={() => optOut.mutate(0)}>Opt back in</Button>
        </div>
      ) : null}

      {/* messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted))_1px,transparent_0)] bg-[length:18px_18px] px-4 py-4">
        {isLoading && <Skeleton className="h-40" />}
        {msgs?.map((m) => {
          const out = m.direction === "Outgoing";
          return (
            <div key={m.name} className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", out ? "rounded-br-sm bg-emerald-600 text-white" : "rounded-bl-sm border bg-card")}>
                {m.template_label && <p className={cn("mb-1 text-[11px] font-semibold uppercase", out ? "text-emerald-100" : "text-muted-foreground")}>Template · {m.template_label}</p>}
                {m.re_latitude ? (
                  <a href={`https://www.google.com/maps?q=${m.re_latitude},${m.re_longitude}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><MapPin className="size-4" />{m.re_location_name || m.message}</a>
                ) : <p className="whitespace-pre-wrap break-words">{m.message}</p>}
                {m.file_url && (/\.(png|jpe?g|webp|gif)$/i.test(m.file_url)
                  ? <a href={m.file_url} target="_blank" rel="noreferrer" className="mt-1 block"><img src={m.file_url} alt={m.file_name ?? ""} loading="lazy" className="max-h-56 rounded-lg object-cover" /></a>
                  : <a href={m.file_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs underline">📎 {m.file_name ?? "attachment"}</a>)}
                {m.error && <p className="mt-1 text-xs text-red-200">⚠ {m.error}</p>}
                <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", out ? "text-emerald-100" : "text-muted-foreground")}>
                  {m.agent && <span>{m.agent} ·</span>}{time(m.at)}{out && <Ticks status={m.status} />}
                </p>
              </div>
            </div>
          );
        })}
        {!isLoading && !msgs?.length && <Empty title="No messages yet" hint="Send a template to start the conversation (24-hour window rules apply)." />}
        <div ref={bottom} />
      </div>

      {/* composer */}
      <div className="relative border-t bg-card p-3">
        {quick && matches.length > 0 && (
          <div className="absolute inset-x-3 bottom-full mb-2 max-h-60 overflow-y-auto rounded-xl border bg-card shadow-xl">
            {matches.map((r) => (
              <button key={r.shortcut} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setText(r.message); setQuick(false); }}>
                <span className="font-medium">/{r.shortcut.replace(/^\//, "")}</span> <span className="text-muted-foreground">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.message}</span>
              </button>
            ))}
          </div>
        )}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate({ message: text }); }}>
          <Button type="button" size="icon" variant="outline" title="Quick replies (type /)" onClick={() => setQuick((q) => !q)}><Zap /></Button>
          <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,video/mp4"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile.mutate(f); e.target.value = ""; }} />
          <Button type="button" size="icon" variant="outline" title="Send a document or image (the message box becomes its caption)"
            disabled={Boolean(conv.opted_out) || sendFile.isPending} onClick={() => fileRef.current?.click()}>
            {sendFile.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}
          </Button>
          <textarea
            aria-label="Message" rows={1} placeholder={conv.opted_out ? "Customer opted out" : "Message · / for quick replies"} disabled={Boolean(conv.opted_out)}
            className="field max-h-32 min-h-10 flex-1 resize-none" value={text} onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              if (quick && matches[0]) { setText(matches[0].message); setQuick(false); }
              else if (text.trim()) send.mutate({ message: text });
            }}
          />
          <Button type="submit" size="icon" disabled={send.isPending || !text.trim() || Boolean(conv.opted_out)} aria-label="Send">{send.isPending ? <Loader2 className="animate-spin" /> : <Send />}</Button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {(ctx?.template_refs?.templates?.length ?? 0) > 0 && (
            <Select aria-label="Send template" className="h-8 w-56 text-xs" value="" disabled={Boolean(conv.opted_out)}
              onChange={(e) => { const t = ctx!.template_refs.templates.find((x) => x.name === e.target.value); if (t) send.mutate({ template: t.name, template_ref: ctx!.template_refs.refs[t.reference_doctype ?? ""]?.[0] ?? "" }); }}>
              <option value="">Send a template…</option>
              {ctx!.template_refs.templates.map((t) => <option key={t.name} value={t.name}>{t.template_label || t.name}</option>)}
            </Select>
          )}
          {plots.length > 0 && (
            <Select aria-label="Share plot location" className="h-8 w-44 text-xs" value="" disabled={Boolean(conv.opted_out)} onChange={(e) => e.target.value && send.mutate({ plot: e.target.value })}>
              <option value="">📍 Share plot location…</option>
              {plots.map((p) => <option key={p}>{p}</option>)}
            </Select>
          )}
          {!conv.opted_out && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => optOut.mutate(1)}><Ban className="size-3.5" /> Mark opted out</Button>}
          {ctx?.mock && (
            <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" disabled={simulate.isPending}
              onClick={() => simulate.mutate(window.prompt("Simulated customer message", "Assalam o Alaikum, what is my next installment?") ?? "")}>
              <FlaskConical className="size-3.5" /> Simulate reply (mock)
            </Button>
          )}
        </div>
      </div>
      {conv.party && <CallDialog conv={conv} open={callOpen} onOpenChange={setCallOpen} />}
    </div>
  );
}

// ------------------------------------------------------------------ page
export function InboxPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "mine";
  const selected = params.get("c");
  const [search, setSearch] = useState("");
  const { data: counts } = useQuery({ queryKey: ["wa-counts"], queryFn: () => get<Record<string, number>>("realestate.whatsapp.inbox.get_counts"), refetchInterval: 10_000 });
  const { data: convs, isLoading } = useQuery({
    queryKey: ["wa-convs", view, search], refetchInterval: 8000,
    queryFn: () => get<Conversation[]>("realestate.whatsapp.inbox.get_conversations", { view, search: search || undefined, limit: 200 }),
  });
  const { data: agents } = useQuery({ queryKey: ["wa-agents"], queryFn: () => get<{ name: string; full_name: string }[]>("realestate.whatsapp.inbox.agents"), staleTime: 600_000 });
  const { data: picked } = useQuery({
    queryKey: ["wa-conv", selected], enabled: Boolean(selected) && !convs?.some((c) => c.name === selected), refetchInterval: 8000,
    queryFn: () => get<Conversation[]>("realestate.whatsapp.inbox.get_conversations", { view: "everything", search: selected!, limit: 1 }),
  });
  const conv = useMemo(() => convs?.find((c) => c.name === selected) ?? picked?.find((c) => c.name === selected), [convs, picked, selected]);
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const agentName = (u: string | null) => agents?.find((a) => a.name === u)?.full_name ?? u;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><MessageCircle className="size-5 text-emerald-600" /> WhatsApp inbox</h1>
          <p className="text-xs text-muted-foreground">Shared team inbox · {counts?.unread ?? 0} unread · {counts?.unassigned ?? 0} unassigned</p>
        </div>
        <Button size="sm" variant="outline" asChild><Link to="/re/d/re-broadcast">Broadcasts</Link></Button>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[22rem_1fr]">
        {/* list */}
        <aside className={cn("flex min-h-0 flex-col border-r", conv && "hidden md:flex")}>
          <div className="space-y-2 border-b p-3">
            <div className="flex flex-wrap gap-1">
              {VIEWS.map(([v, label, key]) => (
                <button key={v} onClick={() => set("view", v)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                  {label}{key && counts?.[key] ? ` ${counts[key]}` : ""}
                </button>
              ))}
            </div>
            <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search chats" className="pl-8" placeholder="Name, phone or customer" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto">
            {isLoading && <div className="space-y-2 p-3"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
            {convs?.map((c) => (
              <button key={c.name} onClick={() => set("c", c.name)} className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent", c.name === selected && "bg-accent")}>
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white", c.opted_out ? "bg-slate-400" : "bg-emerald-600")}>{initials(c.contact_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread_count ? "font-bold" : "font-medium")}>{c.contact_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{c.last_message_at ? dateTime(c.last_message_at) : ""}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{c.last_direction === "Outgoing" ? "You: " : ""}{c.last_message}</span>
                    {c.unread_count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {c.party_type && <Badge tone={c.party_type === "Customer" ? "blue" : "violet"}>{c.party_type === "CRM Lead" ? "Lead" : c.party_type}</Badge>}
                    {c.agent ? <span className="text-[10px] text-muted-foreground">→ {agentName(c.agent)}</span> : <Badge tone="amber">Unassigned</Badge>}
                    {c.opted_out ? <Badge tone="red">Opted out</Badge> : null}
                  </span>
                </span>
              </button>
            ))}
            {!isLoading && !convs?.length && <Empty title="No chats here" hint="Try another view." />}
          </div>
        </aside>
        {/* thread */}
        <section className={cn("min-h-0", !conv && "hidden md:block")}>
          {conv ? (
            <div className="flex h-full min-h-0 flex-col">
              <button className="border-b px-4 py-2 text-left text-sm text-primary md:hidden" onClick={() => set("c", null)}>← All chats</button>
              <div className="min-h-0 flex-1"><Thread conv={conv} agents={agents ?? []} /></div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center text-muted-foreground">
              <div><MessageCircle className="mx-auto mb-2 size-10 opacity-40" /><p className="text-sm">Pick a conversation</p></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
