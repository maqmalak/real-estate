import { useMemo } from "react";
import { CheckSquare, Flag, ListChecks, Clock, AlertTriangle } from "lucide-react";
import { CrmManagementPage, countStat, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import { CrmReferenceCell } from "@/components/crm/CrmReferenceCell";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { avatarTone } from "@/components/common/avatar-tone";
import { formatDateTime, relativeDays } from "@/utils/dates";
import { useCrmReferenceLabels } from "@/hooks/useCrmReferenceLabels";
import type { CrmTask } from "@/types/frappe";

const STATUSES = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High"];

const PRIORITY_BADGE: Record<string, string> = {
  High: "text-rose-600 bg-rose-500/10",
  Medium: "text-amber-600 bg-amber-500/10",
  Low: "text-slate-600 bg-slate-500/10",
};

export default function TasksPage() {
  const { referenceMap } = useCrmReferenceLabels();

  const columns: ColumnDef<CrmTask>[] = useMemo(
    () => [
      {
        key: "priority",
        label: "Priority",
        render: (r) => (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[r.priority ?? "Low"] ?? PRIORITY_BADGE.Low}`}>
            {r.priority ?? "Low"}
          </span>
        ),
        getValue: (r) => r.priority ?? "Low",
      },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      {
        key: "reference",
        label: "Lead / Deal",
        render: (r) => <CrmReferenceCell referenceDocname={r.reference_docname} referenceMap={referenceMap} />,
        getValue: (r) => r.reference_docname,
      },
      {
        key: "due_date",
        label: "Due Date",
        render: (r) => <span className="text-sm text-muted-foreground">{r.due_date ? formatDateTime(r.due_date) : "—"}</span>,
        getValue: (r) => r.due_date,
      },
      {
        key: "assigned_to",
        label: "Assigned To",
        render: (r) =>
          r.assigned_to ? (
            <div className="flex items-center gap-2">
              <Avatar name={r.assigned_to} className={`h-6 w-6 text-[10px] ${avatarTone(r.assigned_to)}`} />
              <span className="text-sm">{r.assigned_to}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          ),
        getValue: (r) => r.assigned_to,
      },
      {
        key: "modified",
        label: "Updated",
        render: (r) => <span className="text-xs text-muted-foreground">{relativeDays(r.modified)}</span>,
        getValue: (r) => r.modified,
      },
    ],
    [referenceMap],
  );

  const config: CrmManagementConfig<CrmTask> = useMemo(
    () => ({
      title: "Tasks",
      subtitle: "Track and manage your team's CRM tasks",
      icon: <CheckSquare className="h-5 w-5" />,
      doctype: "CRM Task",
      // Follow-ups live on this same doctype (task_category = "Follow-up") —
      // excluded here so a follow-up created on a Lead/Deal doesn't also
      // show up as a duplicate row on this generic Tasks list. A blank/
      // legacy task_category (rows from before this field existed) still
      // passes this filter, so no pre-existing task disappears.
      filters: [["task_category", "!=", "Follow-up"]],
      fields: ["name", "title", "task_category", "priority", "status", "start_date", "due_date", "assigned_to", "description", "modified", "reference_doctype", "reference_docname"],
      formFields: [
        { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
        { fieldname: "priority", label: "Priority", fieldtype: "Select", options: PRIORITIES.join("\n"), default: "Medium" },
        { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), default: "Todo" },
        { fieldname: "due_date", label: "Due Date & Time", fieldtype: "Datetime" },
        { fieldname: "assigned_to", label: "Assigned To", fieldtype: "Link", options: "User" },
        // Rich text, like the follow-up form on the Lead/Deal pages (description is stored as HTML).
        { fieldname: "description", label: "Description", fieldtype: "Text Editor" },
      ],
      defaults: { status: "Todo", priority: "Medium", task_category: "Task" },
      kanbanField: "status",
      kanbanColumns: STATUSES.map((s) => ({ value: s })),
      searchField: "title",
      statusField: "status",
      statusOptions: STATUSES,
      columns,
      dateField: "due_date",
      dateLabel: "Due date",
      // Each card's count and its click-to-filter predicate come from the same function (countStat).
      stats: (rows) => [
        countStat(rows, { label: "Total Tasks", icon: <ListChecks className="h-4 w-4" />, tone: "sky", clear: true }),
        countStat(rows, { label: "Open", icon: <Clock className="h-4 w-4" />, tone: "indigo", predicate: (r) => r.status !== "Done" && r.status !== "Cancelled" }),
        countStat(rows, { label: "In Progress", icon: <Flag className="h-4 w-4" />, tone: "amber", predicate: (r) => r.status === "In Progress" }),
        countStat(rows, { label: "High Priority", icon: <AlertTriangle className="h-4 w-4" />, tone: "rose", predicate: (r) => r.priority === "High" && r.status !== "Done" }),
        countStat(rows, { label: "Done", icon: <CheckSquare className="h-4 w-4" />, tone: "emerald", predicate: (r) => r.status === "Done" }),
      ],
      rowName: (r) => r.title,
      rowSubtitle: (r) => (r.due_date ? `Due ${formatDateTime(r.due_date)}` : undefined),
      renderCard: (r) => (
        <div className="space-y-2">
          <p className="truncate text-sm font-medium">{r.title}</p>
          <CrmReferenceCell referenceDocname={r.reference_docname} referenceMap={referenceMap} />
          <div className="flex items-center justify-between">
            <StatusBadge status={r.status} />
            {r.assigned_to && (
              <Avatar name={r.assigned_to} className={`h-6 w-6 text-[10px] ${avatarTone(r.assigned_to)}`} />
            )}
          </div>
        </div>
      ),
      showId: true,
      emptyTitle: "No tasks yet",
      emptyDescription: "Create your first task to start tracking work",
      newLabel: "New Task",
    }),
    [columns, referenceMap],
  );

  return <CrmManagementPage config={config} />;
}
