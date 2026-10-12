import { Link } from "react-router-dom";
import { FolderKanban, ListTodo, LayoutGrid, List, Plus } from "lucide-react";
import type { DocConfig } from "@/components/doc/doc-config";
import {
  sec, colBreak, data, date, datetime, float, currency, check, link, select, ro, req, richText, when,
  nameCol, textCol, dateCol, dateTimeCol, moneyCol, statusCol, percentCol, fmt,
} from "@/components/doc/doc-helpers";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { getLinkedValues } from "@/hooks/useDoc";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { daysUntil } from "@/utils/dates";
import { asNumber } from "@/utils/cn";
import { TaskBoard } from "./TaskBoard";

/** List | Board switcher shown above the task list and on the board page. */
export function TaskViewSwitch({ active }: { active: "list" | "board" }) {
  const item = (to: string, label: string, icon: React.ReactNode, on: boolean) => (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon} {label}
    </Link>
  );
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Task view">
      {item("/projects/tasks", "List", <List className="h-3.5 w-3.5" />, active === "list")}
      {item("/projects/board", "Board", <LayoutGrid className="h-3.5 w-3.5" />, active === "board")}
    </div>
  );
}

/* ============================================================================ Project */

export const PROJECT_CONFIG: DocConfig = {
  doctype: "Project",
  base: "/projects/list",
  singular: "Project",
  plural: "Projects",
  subtitle: "Plan, track and cost your projects",
  icon: FolderKanban,
  listFields: ["name", "project_name", "status", "priority", "percent_complete", "expected_start_date", "expected_end_date", "customer", "estimated_costing", "project_type", "modified"],
  columns: [
    nameCol("Project", (r) => r.project_name),
    textCol("project_type", "Type"),
    textCol("customer", "Customer"),
    percentCol("percent_complete", "Progress"),
    dateCol("expected_end_date", "Due"),
    moneyCol("estimated_costing", "Estimated Cost"),
    statusCol("status", "Status", "Open"),
  ],
  searchFields: ["name", "project_name", "customer", "project_type", "sales_order"],
  statusField: "status",
  statuses: ["Open", "On hold", "Completed", "Cancelled"],
  filters: [
    { field: "priority", label: "Priority", options: ["Low", "Medium", "High"] },
    { field: "project_type", label: "Type", optionsFrom: "Project Type" },
  ],
  dateField: "expected_end_date",
  dateLabel: "Due",
  sort: { key: "expected_end_date", dir: "asc" },
  fields: [
    sec("Project"),
    req(select("naming_series", "Series", ["PROJ-.####"])),
    req(data("project_name", "Project Name")),
    req(link("company", "Company", "Company")),
    link("project_type", "Project Type", "Project Type"),
    colBreak(),
    select("status", "Status", ["Open", "On hold", "Completed", "Cancelled"]),
    select("priority", "Priority", ["Low", "Medium", "High"]),
    select("is_active", "Is Active", ["Yes", "No"]),
    link("department", "Department", "Department"),
    sec("Progress"),
    select("percent_complete_method", "% Complete Method", ["Manual", "Task Completion", "Task Progress", "Task Weight"]),
    when(float("percent_complete", "% Completed"), (v) => v.percent_complete_method === "Manual"),
    when(ro(float("percent_complete", "% Completed")), (v) => v.percent_complete_method !== "Manual"),
    colBreak(),
    date("expected_start_date", "Expected Start"),
    date("expected_end_date", "Expected End"),
    ro(date("actual_start_date", "Actual Start")),
    ro(date("actual_end_date", "Actual End")),
    sec("Customer"),
    link("customer", "Customer", "Customer"),
    colBreak(),
    link("sales_order", "Sales Order", "Sales Order"),
    link("cost_center", "Default Cost Center", "Cost Center"),
    sec("Costing"),
    currency("estimated_costing", "Estimated Cost"),
    ro(currency("total_costing_amount", "Timesheet Costing")),
    ro(currency("total_purchase_cost", "Purchase Cost")),
    ro(currency("total_consumed_material_cost", "Consumed Material Cost")),
    colBreak(),
    ro(currency("total_sales_amount", "Sales Amount")),
    ro(currency("total_billed_amount", "Billed Amount")),
    ro(currency("gross_margin", "Gross Margin")),
    ro(float("per_gross_margin", "Gross Margin %")),
    sec("Notes"),
    richText("notes", "Notes"),
  ],
  children: [
    {
      key: "users",
      label: "Team",
      description: "People who can see this project.",
      doctype: "Project User",
      columns: [req(link("user", "User", "User")), check("view_attachments", "View Attachments"), check("hide_timesheets", "Hide Timesheets")],
    },
  ],
  defaults: ({ company }) => ({ company, naming_series: "PROJ-.####", status: "Open", priority: "Medium", is_active: "Yes", percent_complete_method: "Manual", percent_complete: 0 }),
  summary: (v) => {
    const due = daysUntil(v.expected_end_date);
    return [
      { label: "Progress", value: `${fmt(v.percent_complete, 0)} %`, tone: "teal" },
      { label: "Due", value: due === null ? "—" : due < 0 ? `${Math.abs(due)} d overdue` : `in ${due} d`, tone: due !== null && due < 0 && v.status === "Open" ? "rose" : "sky" },
      { label: "Estimated cost", value: formatMoney(asNumber(v.estimated_costing)), tone: "amber" },
      { label: "Priority", value: v.priority || "—", tone: "indigo" },
    ];
  },
  extra: ({ name, isNew }) =>
    !isNew && name ? (
      <SectionCard
        title="Tasks"
        description="Drag a card to change its status."
        actions={
          <Link to={`/projects/tasks/new?project=${encodeURIComponent(name)}`}>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4" /> Add task
            </Button>
          </Link>
        }
      >
        <TaskBoard project={name} />
      </SectionCard>
    ) : null,
  titleOf: (v) => (v.name ? `${v.name}${v.project_name ? ` · ${v.project_name}` : ""}` : "New Project"),
};

/* ============================================================================ Task */

export const TASK_CONFIG: DocConfig = {
  doctype: "Task",
  base: "/projects/tasks",
  singular: "Task",
  plural: "Tasks",
  subtitle: "Work items across your projects",
  icon: ListTodo,
  companyScoped: false,
  baseFilters: [["is_template", "=", 0]],
  listHeaderExtra: <TaskViewSwitch active="list" />,
  listFields: ["name", "subject", "project", "status", "priority", "progress", "exp_start_date", "exp_end_date", "parent_task", "modified"],
  columns: [
    nameCol("Task", (r) => r.subject),
    textCol("project", "Project"),
    { ...statusCol("priority", "Priority", "Medium") },
    percentCol("progress", "Progress"),
    dateTimeCol("exp_end_date", "Due"),
    statusCol("status", "Status", "Open"),
  ],
  searchFields: ["name", "subject", "project", "priority"],
  statusField: "status",
  statuses: ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"],
  filters: [
    { field: "priority", label: "Priority", options: ["Low", "Medium", "High", "Urgent"] },
    { field: "project", label: "Project", optionsFrom: "Project" },
  ],
  dateField: "exp_end_date",
  dateLabel: "Due",
  sort: { key: "exp_end_date", dir: "asc" },
  fields: [
    sec("Task"),
    req(data("subject", "Subject")),
    link("project", "Project", "Project"),
    link("parent_task", "Parent Task", "Task"),
    check("is_group", "Is Group"),
    colBreak(),
    select("status", "Status", ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"]),
    select("priority", "Priority", ["Low", "Medium", "High", "Urgent"]),
    link("company", "Company", "Company"),
    link("department", "Department", "Department"),
    sec("Schedule"),
    datetime("exp_start_date", "Expected Start"),
    datetime("exp_end_date", "Expected End"),
    float("expected_time", "Expected Time (hours)"),
    colBreak(),
    float("progress", "% Progress"),
    float("task_weight", "Weight"),
    check("is_milestone", "Is Milestone"),
    when(link("completed_by", "Completed By", "User"), (v) => v.status === "Completed"),
    when(date("completed_on", "Completed On"), (v) => v.status === "Completed"),
    sec("Description"),
    richText("description", "Task Description"),
  ],
  children: [
    {
      key: "depends_on",
      label: "Depends On",
      description: "Tasks that must finish before this one can.",
      doctype: "Task Depends On",
      columns: [link("task", "Task", "Task"), { ...data("subject", "Subject"), read_only: true }],
      linkEffects: {
        task: async (task) => {
          const v = await getLinkedValues("Task", task, ["subject", "project"]);
          return { subject: v.subject, project: v.project };
        },
      },
    },
  ],
  defaults: ({ company, params }) => ({ company, status: "Open", priority: "Medium", progress: 0, ...(params.get("project") ? { project: params.get("project") } : {}) }),
  linkEffects: {
    project: async (project) => {
      const v = await getLinkedValues("Project", project, ["company", "department"]);
      return { ...(v.company ? { company: v.company } : {}), ...(v.department ? { department: v.department } : {}) };
    },
  },
  summary: (v) => {
    const due = daysUntil(v.exp_end_date);
    return [
      { label: "Progress", value: `${fmt(v.progress, 0)} %`, tone: "teal" },
      { label: "Due", value: due === null ? "—" : due < 0 ? `${Math.abs(due)} d overdue` : `in ${due} d`, tone: due !== null && due < 0 && v.status !== "Completed" ? "rose" : "sky" },
      { label: "Priority", value: <StatusBadge status={v.priority || "Medium"} />, tone: "indigo" },
    ];
  },
  titleOf: (v) => (v.subject ? String(v.subject) : "New Task"),
};
