import { ListTodo } from "lucide-react";
import type { DocConfig } from "@/components/doc/doc-config";
import { colBreak, date, dateCol, link, nameCol, req, richText, sec, select, statusCol, tab, textCol, data } from "@/components/doc/doc-helpers";
import { htmlToText } from "@/utils/text";
import { isoDaysAgo } from "@/hooks/useUrlFlag";

/**
 * To-dos (Frappe's ToDo: assignments and personal tasks). Frappe already limits non-admin users to their own
 * to-dos (allocated to or assigned by them). `?overdue=1` — from the home page — shows open ones past their date.
 */
export const TODO_CONFIG: DocConfig = {
  doctype: "ToDo",
  base: "/todos",
  singular: "To-do",
  plural: "To-dos",
  subtitle: "Your assignments and reminders",
  icon: ListTodo,
  companyScoped: false,
  listFields: ["name", "description", "status", "priority", "date", "allocated_to", "reference_type", "reference_name", "modified"],
  columns: [
    nameCol("To-do", (r) => htmlToText(r.description).slice(0, 90)),
    statusCol("status", "Status", "Open"),
    textCol("priority", "Priority"),
    dateCol("date", "Due"),
    textCol("allocated_to", "Assigned To"),
    textCol("reference_name", "Document", { render: (r) => (r.reference_name ? `${r.reference_type} ${r.reference_name}` : "—") }),
  ],
  searchFields: ["description", "reference_name"],
  sort: { key: "date", dir: "asc" },
  statusField: "status",
  statuses: ["Open", "Closed", "Cancelled"],
  dateField: "date",
  dateLabel: "Due",
  // Same rule as the home card: open, assigned to me, past its date.
  urlFlags: [{ param: "overdue", label: "Overdue, assigned to me", filters: ({ user }) => [["status", "=", "Open"], ["allocated_to", "=", user ?? ""], ["date", "<", isoDaysAgo(0)]] }],
  fields: [
    tab("To-do"),
    sec("Details"),
    req(richText("description", "Description")),
    colBreak(),
    select("status", "Status", ["Open", "Closed", "Cancelled"]),
    select("priority", "Priority", ["Low", "Medium", "High"]),
    date("date", "Due Date"),
    link("allocated_to", "Assigned To", "User"),
    sec("Reference"),
    link("reference_type", "Document Type", "DocType"),
    data("reference_name", "Document"),
  ],
  defaults: () => ({ status: "Open", priority: "Medium" }),
};
