import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, Flag, GripVertical } from "lucide-react";
import { PercentBar } from "@/components/common/percent-bar";
import { statusDotClass } from "@/components/common/status-color";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { useDocList, useDocMutations, type Doc } from "@/hooks/useDoc";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatShortDate, daysUntil } from "@/utils/dates";

export const TASK_STATUSES = ["Open", "Working", "Pending Review", "Overdue", "Completed"] as const;

const PRIORITY_TONE: Record<string, string> = {
  Urgent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  High: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Medium: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Low: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

/**
 * Kanban board of tasks by status. Drag a card to another column (or use the "Move to" menu, which also works
 * with a keyboard and on touch screens) and the task's status is saved straight away.
 * Pass `project` to scope the board to one project.
 */
export function TaskBoard({ project, className }: { project?: string; className?: string }) {
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { updateDoc } = useDocMutations("Task");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const { data, isLoading, mutate } = useDocList("Task", {
    fields: ["name", "subject", "status", "priority", "project", "exp_end_date", "progress", "is_group"],
    filters: [["is_template", "=", 0], ["status", "!=", "Cancelled"], ...(project ? [["project", "=", project]] : [])],
    orderBy: { field: "modified", order: "desc" },
    limit: 500,
  });

  const columns = useMemo(() => {
    const by: Record<string, Doc[]> = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
    (data ?? []).forEach((t) => (by[t.status] ??= []).push(t));
    return by;
  }, [data]);

  const move = async (task: Doc, status: string) => {
    if (!canWrite || task.status === status) return;
    try {
      await updateDoc(String(task.name), { status });
      notifyDataChanged();
      await mutate();
      toast.success(`${task.name} → ${status}`);
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {TASK_STATUSES.map((s) => (
          <Skeleton key={s} className="h-64 w-full" />
        ))}
      </div>
    );
  }
  if (!(data ?? []).length) {
    return <EmptyState title="No tasks yet" description={project ? "Add a task to this project to see it on the board." : "Create a task to see it on the board."} />;
  }

  return (
    <div className={cn("grid gap-3 md:grid-cols-3 xl:grid-cols-5", className)}>
      {TASK_STATUSES.map((status) => (
        <div
          key={status}
          onDragOver={(e) => {
            if (!canWrite || !dragging) return;
            e.preventDefault();
            setOver(status);
          }}
          onDragLeave={() => setOver((o) => (o === status ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            const task = (data ?? []).find((t) => t.name === dragging);
            setOver(null);
            setDragging(null);
            if (task) void move(task, status);
          }}
          className={cn("flex min-h-[16rem] flex-col rounded-lg border border-border bg-muted/30 transition-colors", over === status && "border-primary bg-primary/5")}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <span className={cn("h-2 w-2 rounded-full", statusDotClass(status))} aria-hidden="true" />
              {status}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{columns[status].length}</span>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "32rem" }}>
            {columns[status].map((t) => {
              const due = daysUntil(t.exp_end_date);
              const late = due !== null && due < 0 && t.status !== "Completed";
              return (
                <Card
                  key={t.name}
                  draggable={canWrite}
                  onDragStart={() => setDragging(String(t.name))}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  className={cn("space-y-2 p-3 shadow-sm", canWrite && "cursor-grab active:cursor-grabbing", dragging === t.name && "opacity-50")}
                >
                  <div className="flex items-start gap-1.5">
                    {canWrite && <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                    <Link to={`/projects/tasks/${encodeURIComponent(t.name)}`} className="min-w-0 flex-1 text-sm font-medium leading-snug hover:text-primary hover:underline">
                      {t.subject}
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {t.priority && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", PRIORITY_TONE[t.priority] ?? PRIORITY_TONE.Low)}>
                        <Flag className="h-3 w-3" /> {t.priority}
                      </span>
                    )}
                    {t.project && !project && <span className="truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t.project}</span>}
                    {t.exp_end_date && (
                      <span className={cn("inline-flex items-center gap-1", late ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                        <CalendarDays className="h-3 w-3" /> {formatShortDate(t.exp_end_date)}
                      </span>
                    )}
                  </div>
                  <PercentBar value={t.progress} size="sm" />
                  {canWrite && (
                    <select
                      aria-label={`Move ${t.subject} to another status`}
                      value=""
                      onChange={(e) => e.target.value && void move(t, e.target.value)}
                      className="h-6 w-full rounded border border-input bg-transparent text-[11px] text-muted-foreground"
                    >
                      <option value="">Move to…</option>
                      {TASK_STATUSES.filter((s) => s !== t.status).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                </Card>
              );
            })}
            {columns[status].length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No tasks</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
