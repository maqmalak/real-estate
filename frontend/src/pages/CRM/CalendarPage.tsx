import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Trash2, Link2, CalendarPlus } from "lucide-react";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { useCrmManagement } from "@/hooks/useCrmManagement";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/page-header";
import { cn } from "@/utils/cn";
import { todayISO } from "@/utils/dates";
import type { FrappeEvent } from "@/types/frappe";

const CATEGORIES = ["Meeting", "Call", "Event", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const CHIP_BAR: Record<string, string> = {
  Meeting: "bg-amber-500",
  Call: "bg-sky-500",
  Event: "bg-indigo-500",
  Other: "bg-slate-400",
};

function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseEventDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function fmtTime(iso?: string): string {
  const d = parseEventDate(iso);
  if (!d) return "";
  return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

/** Monday-first 6-week month grid containing every day of the view month. */
function monthGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function addHour(dateStr: string, timeStr: string): string {
  const [h, m] = timeStr.split(":").map((n) => parseInt(n, 10) || 0);
  const nh = `${(h + 1) % 24}`.padStart(2, "0");
  return `${dateStr} ${nh}:${`${m}`.padStart(2, "0")}:00`;
}

export default function CalendarPage() {
  const today = todayISO();
  const [viewDate, setViewDate] = useState(() => new Date(`${today}T00:00:00`));
  const [selected, setSelected] = useState(today);
  const [type, setType] = useState<Category>("Meeting");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [linked, setLinked] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const { rows, mutate, createDoc, deleteDoc } = useCrmManagement<FrappeEvent>({
    doctype: "Event",
    fields: ["name", "subject", "event_category", "starts_on", "ends_on", "status", "description"],
    limit: 1000,
  });

  const leads = useFrappeGetDocList<{ name: string; lead_name?: string }>("Lead", {
    fields: ["name", "lead_name"],
    limit: 200,
    orderBy: { field: "modified", order: "desc" },
  });
  const deals = useFrappeGetDocList<{ name: string; organization?: string }>("CRM Deal", {
    fields: ["name", "organization"],
    limit: 200,
    orderBy: { field: "modified", order: "desc" },
  });

  const linkedOptions = useMemo(() => {
    const l = (leads.data ?? []).map((x) => ({ value: `Lead::${x.name}`, label: `${x.name} · ${x.lead_name ?? "Lead"}` }));
    const d = (deals.data ?? []).map((x) => ({ value: `CRM Deal::${x.name}`, label: `${x.name} · ${x.organization ?? "Deal"}` }));
    return [...l, ...d];
  }, [leads.data, deals.data]);

  const byDay = useMemo(() => {
    const map: Record<string, FrappeEvent[]> = {};
    for (const r of rows ?? []) {
      const d = parseEventDate(r.starts_on);
      if (!d) continue;
      const key = ymd(d);
      (map[key] ??= []).push(r);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.starts_on ?? "").localeCompare(b.starts_on ?? ""));
    }
    return map;
  }, [rows]);

  const cells = useMemo(() => monthGrid(viewDate), [viewDate]);
  const monthLabel = viewDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const selectedList = byDay[selected] ?? [];
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    day: "numeric",
  }).toUpperCase();

  const shiftMonth = (delta: number) => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + delta);
    setViewDate(d);
  };

  const linkedLabel = linkedOptions.find((o) => o.value === linked)?.label;

  const schedule = async () => {
    if (!date || !time) {
      setFeedback({ ok: false, message: "Pick a date and time for the activity" });
      return;
    }
    setSaving(true);
    try {
      const [refType, refName] = linked ? linked.split("::") : [];
      const firstLine = note.trim().split("\n")[0];
      const subject = firstLine?.slice(0, 120) || `${type} — ${linkedLabel?.split(" · ").slice(1).join(" · ") ?? "activity"}`;
      await createDoc({
        subject,
        event_category: type,
        starts_on: `${date} ${time}:00`,
        ends_on: addHour(date, time),
        status: "Open",
        event_type: "Private",
        description: note.trim() || undefined,
        // Link to the Lead/Deal via the Event Participants child table
        // (Event itself has no reference_doctype fields).
        ...(refType && refName
          ? { participants: [{ reference_doctype: refType, reference_docname: refName }] }
          : {}),
      } as Partial<FrappeEvent> & { participants?: { reference_doctype: string; reference_docname: string }[] });
      setFeedback({ ok: true, message: "Activity scheduled" });
      setNote("");
      setSelected(date);
      mutate?.();
    } catch (e: unknown) {
      setFeedback({ ok: false, message: e instanceof Error ? e.message : "Could not schedule activity" });
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (name: string) => {
    try {
      await deleteDoc(name);
      setFeedback({ ok: true, message: "Activity removed" });
      mutate?.();
    } catch {
      setFeedback({ ok: false, message: "Could not remove activity" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle="Schedule and track meetings, calls and reminders"
        icon={<CalendarDays className="h-5 w-5" />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------- Month grid ---------- */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-base font-semibold">{monthLabel}</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewDate(new Date(`${today}T00:00:00`));
                  setSelected(today);
                }}
              >
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b bg-muted/50">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === viewDate.getMonth();
              const dayEvents = byDay[key] ?? [];
              const isToday = key === today;
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={cn(
                    "flex min-h-[104px] flex-col items-stretch gap-1 border-b border-r p-1.5 text-left transition-colors last:border-r-0 hover:bg-muted/40",
                    !inMonth && "bg-muted/20 text-muted-foreground/60",
                    isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold",
                      isToday ? "bg-foreground text-background" : inMonth ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.name}
                      className={cn(
                        "flex items-center gap-1 overflow-hidden rounded bg-muted/70 px-1 py-0.5 text-[10.5px] leading-tight",
                        ev.status === "Completed" && "opacity-60",
                        ev.status === "Cancelled" && "line-through opacity-50",
                      )}
                    >
                      <span className={cn("h-3 w-[3px] shrink-0 rounded-full", CHIP_BAR[ev.event_category ?? "Other"] ?? "bg-slate-400")} />
                      <span className="truncate">
                        <span className="font-semibold">{fmtTime(ev.starts_on)}</span> {ev.subject}
                      </span>
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[10px] font-medium text-muted-foreground">+{dayEvents.length - 3} more</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- Schedule an activity ---------- */}
        <aside className="space-y-6">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Schedule an activity</h3>
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={type} onChange={(e) => setType(e.target.value as Category)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === "Event" ? "Reminder" : c}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Time</label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Link2 className="h-3 w-3" /> Linked to
                </label>
                <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
                  <option value="">Nothing linked</option>
                  {linkedOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Note</label>
                <Textarea
                  rows={3}
                  placeholder="Agenda, next step, reminder text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {feedback && (
                <p className={cn("text-xs font-medium", feedback.ok ? "text-emerald-600" : "text-destructive")}>{feedback.message}</p>
              )}
              <Button className="w-full" loading={saving} onClick={schedule}>
                <CalendarPlus className="h-4 w-4" /> Schedule activity
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {selectedLabel} · {selectedList.length} {selectedList.length === 1 ? "ACTIVITY" : "ACTIVITIES"}
            </h3>
            {selectedList.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled for this day</p>
            ) : (
              <ul className="divide-y">
                {selectedList.map((ev) => (
                  <li key={ev.name} className="group flex items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{ev.subject}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("h-2 w-2 rounded-full", CHIP_BAR[ev.event_category ?? "Other"] ?? "bg-slate-400")} />
                        {ev.event_category === "Event" ? "Reminder" : ev.event_category ?? "Event"} · {fmtTime(ev.starts_on)}
                        {ev.reference_docname && <span className="truncate">· {ev.reference_docname}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEvent(ev.name!)}
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label="Delete activity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
