import toast from "react-hot-toast";
import { CheckCircle2, CircleDot, Clock, FileText, Flag, LifeBuoy, RotateCcw, ShieldCheck, Tags } from "lucide-react";
import type { DocConfig, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, datetime, check, text, richText, link, select, ro, req, when,
  nameCol, textCol, dateCol, statusCol, yesNoCol,
} from "@/components/doc/doc-helpers";
import { humanizeError, postCall } from "@/services/frappe";

const STATUSES = ["Open", "Replied", "On Hold", "Resolved", "Closed"];

/** Quick status change from the Actions menu. */
const setStatus = (status: string) => async (c: ExtraContext) => {
  try {
    await postCall("frappe.client.set_value", { doctype: "Issue", name: c.name, fieldname: "status", value: status });
    toast.success(`Issue marked ${status}`);
    c.reload();
  } catch (e) {
    toast.error(humanizeError(e));
  }
};

export const ISSUE_CONFIG: DocConfig = {
  doctype: "Issue",
  base: "/support/issues",
  singular: "Issue",
  plural: "Issues",
  subtitle: "Customer complaints and support tickets — quality claims, delivery problems, queries",
  icon: LifeBuoy,
  companyScoped: false,
  listFields: ["name", "subject", "customer", "raised_by", "status", "priority", "issue_type", "opening_date", "agreement_status", "modified"],
  columns: [
    nameCol("Issue", (r) => r.subject),
    textCol("customer", "Customer"),
    textCol("issue_type", "Type"),
    statusCol("priority", "Priority", "Medium"),
    dateCol("opening_date", "Opened"),
    statusCol("agreement_status", "SLA", "—"),
    statusCol("status", "Status", "Open"),
  ],
  searchFields: ["name", "subject", "customer", "raised_by"],
  statusField: "status",
  statuses: STATUSES,
  dateField: "opening_date",
  dateLabel: "Opened",
  sort: { key: "opening_date", dir: "desc" },
  filters: [{ field: "priority", label: "Priority", optionsFrom: "Issue Priority" }, { field: "issue_type", label: "Type", optionsFrom: "Issue Type" }],
  fields: [
    tab("Issue"),
    sec("Ticket"),
    select("naming_series", "Series", ["ISS-.YYYY.-"]),
    req(data("subject", "Subject")),
    link("customer", "Customer", "Customer"),
    ro(data("customer_name", "Customer Name")),
    data("raised_by", "Raised By (Email)"),
    colBreak(),
    select("status", "Status", STATUSES),
    link("priority", "Priority", "Issue Priority"),
    link("issue_type", "Issue Type", "Issue Type"),
    link("project", "Project", "Project"),
    link("company", "Company", "Company"),
    sec("Description"),
    richText("description", "Description"),
    tab("SLA"),
    sec("Service level agreement"),
    link("service_level_agreement", "Service Level Agreement", "Service Level Agreement"),
    ro(select("agreement_status", "Agreement Status", ["", "First Response Due", "Resolution Due", "Fulfilled", "Failed"])),
    colBreak(),
    ro(datetime("response_by", "Response By")),
    ro(datetime("sla_resolution_by", "Resolution By")),
    sec("Response"),
    datetime("first_responded_on", "First Responded On"),
    colBreak(),
    ro(date("opening_date", "Opening Date")),
    tab("Resolution"),
    sec("Resolution"),
    richText("resolution_details", "Resolution Details"),
    ro(datetime("sla_resolution_date", "Resolution Date")),
    tab("More"),
    sec("References"),
    link("lead", "Lead", "Lead"),
    link("contact", "Contact", "Contact"),
    colBreak(),
    link("email_account", "Email Account", "Email Account"),
    check("via_customer_portal", "Via Customer Portal"),
  ],
  tabIcons: { Issue: LifeBuoy, SLA: Clock, Resolution: CheckCircle2, More: FileText },
  actions: [
    { label: "Mark Resolved", icon: CheckCircle2, show: (c) => !["Resolved", "Closed"].includes(c.values.status), run: setStatus("Resolved") },
    { label: "Put On Hold", icon: CircleDot, show: (c) => c.values.status !== "On Hold" && c.values.status !== "Closed", run: setStatus("On Hold") },
    { label: "Close", icon: ShieldCheck, show: (c) => c.values.status !== "Closed", run: setStatus("Closed") },
    { label: "Reopen", icon: RotateCcw, show: (c) => ["Resolved", "Closed"].includes(c.values.status), run: setStatus("Open") },
  ],
  defaults: () => ({ naming_series: "ISS-.YYYY.-", status: "Open" }),
  summary: (v) => [
    { label: "Priority", value: v.priority || "—", tone: v.priority === "High" || v.priority === "Urgent" ? "rose" : "sky" },
    { label: "SLA", value: v.agreement_status || "No SLA", tone: v.agreement_status === "Failed" ? "rose" : v.agreement_status === "Fulfilled" ? "emerald" : "amber" },
    { label: "Customer", value: v.customer_name || v.customer || "—", tone: "indigo" },
  ],
  titleOf: (v) => (v.name ? `${v.name} · ${v.subject ?? ""}` : "New Issue"),
};

const simpleMaster = (doctype: string, base: string, plural: string, subtitle: string, icon: DocConfig["icon"]): DocConfig => ({
  doctype,
  base,
  singular: doctype,
  plural,
  subtitle,
  icon,
  companyScoped: false,
  listFields: ["name", "description", "modified"],
  columns: [nameCol(doctype), textCol("description", "Description"), dateCol("modified", "Updated")],
  searchFields: ["name", "description"],
  // Named by prompt: the name is typed once, on create (sent as __newname).
  fields: [sec(doctype), when(req(data("__newname", "Name")), (v) => !v.name), text("description", "Description")],
  titleOf: (v) => (v.name ? String(v.name) : `New ${doctype}`),
});

export const ISSUE_TYPE_CONFIG = simpleMaster("Issue Type", "/support/issue-types", "Issue Types", "Kinds of issues — quality claim, delivery delay, billing", Tags);
export const ISSUE_PRIORITY_CONFIG = simpleMaster("Issue Priority", "/support/priorities", "Issue Priorities", "Low, medium, high, urgent", Flag);

export const SLA_CONFIG: DocConfig = {
  doctype: "Service Level Agreement",
  base: "/support/slas",
  singular: "Service Level Agreement",
  plural: "Service Level Agreements",
  subtitle: "Response and resolution targets by priority",
  icon: ShieldCheck,
  companyScoped: false,
  listFields: ["name", "service_level", "document_type", "default_priority", "enabled", "start_date", "end_date", "modified"],
  columns: [nameCol("Agreement", (r) => r.service_level), textCol("document_type", "Applies To"), textCol("default_priority", "Default Priority"), yesNoCol("enabled", "Status", "Enabled", "Disabled")],
  searchFields: ["name", "service_level"],
  fields: [
    tab("Agreement"),
    sec("Agreement"),
    req(data("service_level", "Service Level Name")),
    req(link("document_type", "Document Type", "DocType")),
    ro(link("default_priority", "Default Priority", "Issue Priority")),
    colBreak(),
    check("enabled", "Enabled"),
    check("default_service_level_agreement", "Default Agreement"),
    check("apply_sla_for_resolution", "Apply SLA for Resolution Time"),
    req(link("holiday_list", "Holiday List", "Holiday List")),
    sec("Validity"),
    date("start_date", "Valid From"),
    colBreak(),
    date("end_date", "Valid To"),
    tab("Targets"),
  ],
  children: [
    {
      tab: "Targets",
      key: "priorities",
      label: "Response & Resolution by Priority",
      doctype: "Service Level Priority",
      columns: [req(link("priority", "Priority", "Issue Priority")), check("default_priority", "Default"), req(data("response_time", "Response Time (seconds)")), data("resolution_time", "Resolution Time (seconds)")],
    },
    {
      tab: "Targets",
      key: "support_and_resolution",
      label: "Working Days",
      doctype: "Service Day",
      columns: [req(select("workday", "Day", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])), req(data("start_time", "Start (HH:MM:SS)")), req(data("end_time", "End (HH:MM:SS)"))],
    },
  ],
  defaults: () => ({ document_type: "Issue", enabled: 1 }),
  titleOf: (v) => v.service_level || v.name || "New Service Level Agreement",
};

export const SUPPORT_CONFIGS = [ISSUE_CONFIG, ISSUE_TYPE_CONFIG, ISSUE_PRIORITY_CONFIG, SLA_CONFIG];
