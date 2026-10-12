import { Repeat, Clock, AlertTriangle, CheckCircle2, CalendarClock } from "lucide-react";
import { CrmManagementPage, countStat, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime, todayISO } from "@/utils/dates";
import { useAuth } from "@/hooks/useAuth";
import type { CrmTask } from "@/types/frappe";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useUrlFlag, nowLocal } from "@/hooks/useUrlFlag";
import { useCrmReferenceLabels, type CrmReference } from "@/hooks/useCrmReferenceLabels";
import { htmlToText } from "@/utils/text";

const STATUSES = ["Todo", "In Progress", "Done", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High"];

interface FollowUpRow extends Omit<CrmTask, "status"> {
  status?: string;
  assigned_to?: string;
  reference_doctype?: string;
  reference_docname?: string;
}

const refHref = (doctype: string | undefined, name: string) =>
  doctype === "CRM Deal" ? `/crm/deals/${encodeURIComponent(name)}` : `/crm/leads/${encodeURIComponent(name)}`;

/** Lead / Deal the follow-up belongs to: its number (a link to the record) and its name, as two columns. */
const referenceColumns = (referenceMap: Map<string, CrmReference>): ColumnDef<FollowUpRow>[] => [
  {
    key: "reference_docname",
    label: "Lead No.",
    render: (r) =>
      r.reference_docname ? (
        <Link to={refHref(r.reference_doctype || referenceMap.get(r.reference_docname)?.doctype, r.reference_docname)} onClick={(e) => e.stopPropagation()}
          className="whitespace-nowrap text-sm font-medium text-primary hover:underline">
          {r.reference_docname}
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
    getValue: (r) => r.reference_docname,
  },
  {
    key: "lead_name",
    label: "Lead Name",
    render: (r) => <span className="text-sm">{(r.reference_docname && referenceMap.get(r.reference_docname)?.label) || "—"}</span>,
    getValue: (r) => (r.reference_docname && referenceMap.get(r.reference_docname)?.label) || "",
  },
];

const baseColumns: ColumnDef<FollowUpRow>[] = [
  {
    key: "due_date",
    label: "Due",
    render: (r) => <span className="text-sm">{r.due_date ? formatDateTime(r.due_date) : "—"}</span>,
    getValue: (r) => r.due_date,
  },
  { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "assigned_to", label: "Assigned To", render: (r) => <span className="text-sm">{r.assigned_to || "—"}</span>, getValue: (r) => r.assigned_to },
  {
    key: "description",
    label: "Notes",
    render: (r) => <p className="max-w-sm truncate text-sm text-muted-foreground">{htmlToText(r.description) || "—"}</p>,
    getValue: (r) => htmlToText(r.description),
  },
];

export default function FollowUpsPage() {
  const { currentUser } = useAuth();
  // ?overdue=1 (home page "Overdue follow-ups"): open follow-ups assigned to me, past their due time.
  const overdue = useUrlFlag("overdue", "Overdue, assigned to me");
  const { referenceMap } = useCrmReferenceLabels();
  const columns = useMemo(() => [...referenceColumns(referenceMap), ...baseColumns], [referenceMap]);

  const config: CrmManagementConfig<FollowUpRow> = {
    title: "Follow-ups",
    subtitle: "Reminders to reconnect with leads and deals at the right time",
    icon: <Repeat className="h-5 w-5" />,
    doctype: "CRM Task",
    // Plain Tasks live on this same doctype (task_category = "Task" or
    // blank/legacy default from the Tasks page) — excluded here so a task
    // created there doesn't also show up as a duplicate row on this list.
    // A blank/legacy task_category still passes this filter, so no
    // pre-existing follow-up disappears.
    filters: [
      ["task_category", "!=", "Task"],
      ...(overdue.active
        ? [["status", "in", ["Backlog", "Todo", "In Progress"]], ["assigned_to", "=", currentUser ?? ""], ["due_date", "<", nowLocal()]]
        : []),
    ],
    fields: ["name", "title", "task_category", "priority", "status", "start_date", "due_date", "description", "assigned_to", "reference_doctype", "reference_docname", "modified"],
    formFields: [
      { fieldname: "title", label: "Subject", fieldtype: "Data", reqd: true },
      { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), default: "Todo" },
      { fieldname: "priority", label: "Priority", fieldtype: "Select", options: PRIORITIES.join("\n"), default: "Medium" },
      {
        fieldname: "due_date",
        label: "Due Date & Time",
        fieldtype: "Datetime",
        description: "The reminder job checks this to the minute — a date-only value defaults to midnight, so set the actual time you want the ping.",
      },
      {
        fieldname: "assigned_to",
        label: "Assigned To",
        fieldtype: "Link",
        options: "User",
        description: "Required for the automatic overdue/due-soon reminder — a follow-up with no assignee is never notified.",
      },
      // Same rich-text editor as the follow-up form on the Lead/Deal pages (description is stored as HTML).
      { fieldname: "description", label: "Notes", fieldtype: "Text Editor" },
    ],
    defaults: { status: "Todo", priority: "Medium", assigned_to: currentUser ?? undefined, task_category: "Follow-up" },
    kanbanField: "status",
    kanbanColumns: STATUSES.map((s) => ({ value: s })),
    searchField: "title",
    statusField: "status",
    statusOptions: STATUSES,
    columns,
    exportFilename: "follow-ups",
    dateField: "due_date",
    dateLabel: "Due date",
    // Each card's count and its click-to-filter predicate come from the same function (countStat).
    stats: (rows) => {
      const today = todayISO();
      return [
        countStat(rows, { label: "Total", icon: <Repeat className="h-4 w-4" />, tone: "sky", clear: true }),
        countStat(rows, { label: "Open", icon: <Clock className="h-4 w-4" />, tone: "indigo", predicate: (r) => r.status === "Todo" }),
        countStat(rows, {
          label: "Overdue",
          icon: <AlertTriangle className="h-4 w-4" />,
          tone: "rose",
          predicate: (r) => !!r.due_date && r.status !== "Done" && r.status !== "Cancelled" && r.due_date < today,
        }),
        countStat(rows, { label: "High Priority", icon: <CalendarClock className="h-4 w-4" />, tone: "amber", predicate: (r) => r.priority === "High" && r.status !== "Done" }),
        countStat(rows, { label: "Done", icon: <CheckCircle2 className="h-4 w-4" />, tone: "emerald", predicate: (r) => r.status === "Done" }),
      ];
    },
    rowName: (r) => r.title,
    rowSubtitle: (r) => (r.due_date ? `Due ${formatDateTime(r.due_date)}` : undefined),
    renderCard: (r) => (
      <div className="space-y-2">
        <p className="truncate text-sm font-medium">{r.title}</p>
        <div className="flex items-center justify-between">
          <StatusBadge status={r.priority} />
          <span className="text-xs text-muted-foreground">{r.due_date ? formatDateTime(r.due_date) : ""}</span>
        </div>
      </div>
    ),
    showId: true,
    emptyTitle: "No follow-ups",
    emptyDescription: "Schedule a follow-up so no deal slips through the cracks",
    newLabel: "New Follow-up",
  };

  return (
    <>
      {overdue.chip && <div className="mb-3">{overdue.chip}</div>}
      <CrmManagementPage key={overdue.active ? "overdue" : "all"} config={config} />
    </>
  );
}
