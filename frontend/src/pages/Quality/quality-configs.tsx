import { ClipboardCheck, FlaskConical, Layers, ListChecks, ScrollText, Target, ClipboardList, AlertOctagon, Wrench } from "lucide-react";
import type { ChildTableSpec, DocConfig } from "@/components/doc/doc-config";
import type { ChildRow } from "@/components/tables/child-table";
import {
  sec, colBreak, data, date, float, check, text, richText, link, select, ro, req, when,
  nameCol, textCol, dateCol, statusCol, docstatusCol, yesNoCol, fmt,
} from "@/components/doc/doc-helpers";
import { getLinkedValues } from "@/hooks/useDoc";
import { postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

const READING_KEYS = ["reading_1", "reading_2", "reading_3", "reading_4", "reading_5"];
const BIG = 1e9;

/** A numeric reading row passes when every entered reading is within [min, max]; a text row when the value matches. */
function readingStatus(r: ChildRow): "Accepted" | "Rejected" | "" {
  if (asNumber(r.numeric)) {
    const vals = READING_KEYS.map((k) => r[k]).filter((v) => v !== undefined && v !== null && v !== "").map(Number);
    if (!vals.length) return "";
    const lo = r.min_value === undefined || r.min_value === null || r.min_value === "" ? -BIG : asNumber(r.min_value);
    const hi = r.max_value === undefined || r.max_value === null || r.max_value === "" ? BIG : asNumber(r.max_value);
    return vals.every((v) => v >= lo && v <= hi) ? "Accepted" : "Rejected";
  }
  if (!r.reading_value) return "";
  return !r.value || String(r.reading_value).trim().toLowerCase() === String(r.value).trim().toLowerCase() ? "Accepted" : "Rejected";
}

/** Template rows → inspection reading rows (limits copied, readings blank). */
async function templateReadings(template: string): Promise<ChildRow[]> {
  const doc = await postCall<any>("frappe.client.get", { doctype: "Quality Inspection Template", name: template });
  return ((doc?.item_quality_inspection_parameter as any[]) ?? []).map((p) => ({
    specification: p.specification,
    parameter_group: p.parameter_group,
    numeric: p.numeric,
    min_value: p.min_value,
    max_value: p.max_value,
    value: p.value,
    formula_based_criteria: p.formula_based_criteria,
    acceptance_formula: p.acceptance_formula,
  }));
}

const limitText = (r: ChildRow) => {
  if (!asNumber(r.numeric)) return r.value ? `= ${r.value}` : "";
  const lo = asNumber(r.min_value), hi = asNumber(r.max_value);
  if (lo <= -BIG / 2 && hi >= BIG / 2) return "";
  if (lo <= -BIG / 2) return `≤ ${fmt(hi)}`;
  if (hi >= BIG / 2) return `≥ ${fmt(lo)}`;
  return `${fmt(lo)} – ${fmt(hi)}`;
};

/* ============================================================================ Quality Inspection */

const READINGS: ChildTableSpec = {
  key: "readings",
  label: "Readings",
  description: "Pick a template to load its parameters and limits, then enter up to five readings per parameter. Out-of-limit rows turn the inspection Rejected.",
  doctype: "Quality Inspection Reading",
  wide: true,
  columns: [
    req(link("specification", "Parameter", "Quality Inspection Parameter")),
    ro(float("min_value", "Min")),
    ro(float("max_value", "Max")),
    data("reading_1", "Reading 1"),
    data("reading_2", "Reading 2"),
    data("reading_3", "Reading 3"),
    ro(select("status", "Result", ["", "Accepted", "Rejected"])),
  ],
  dialogColumns: [
    link("parameter_group", "Parameter Group", "Quality Inspection Parameter Group"),
    check("numeric", "Numeric"),
    data("value", "Expected value (text parameters)"),
    data("reading_value", "Reading (text parameters)"),
    data("reading_4", "Reading 4"),
    data("reading_5", "Reading 5"),
    check("manual_inspection", "Manual inspection"),
  ],
  newRow: () => ({ numeric: 1 }),
  totals: (rows) => {
    const bad = rows.filter((r) => readingStatus(r) === "Rejected").length;
    return [
      { label: "Parameters", value: rows.length },
      { label: "Out of limit", value: bad, align: "right" },
    ];
  },
};

const REF_TYPES = ["Purchase Receipt", "Purchase Invoice", "Stock Entry", "Delivery Note", "Sales Invoice", "Job Card", "Subcontracting Receipt"];

export const QUALITY_INSPECTION_CONFIG: DocConfig = {
  doctype: "Quality Inspection",
  base: "/quality/inspections",
  singular: "Quality Inspection",
  plural: "Quality Inspections",
  subtitle: "Incoming fibre, in-process and yarn lab tests, and outgoing packing checks",
  icon: ClipboardCheck,
  submittable: true,
  listFields: ["name", "report_date", "inspection_type", "reference_type", "reference_name", "item_code", "item_name", "quality_inspection_template", "status", "inspected_by", "docstatus", "modified"],
  columns: [
    nameCol("Inspection", (r) => r.item_name || r.item_code),
    dateCol("report_date", "Date"),
    textCol("inspection_type", "Stage"),
    textCol("quality_inspection_template", "Test"),
    textCol("reference_name", "Reference"),
    statusCol("status", "Result", "Accepted"),
    docstatusCol(),
  ],
  searchFields: ["name", "item_code", "item_name", "reference_name", "quality_inspection_template"],
  sort: { key: "report_date", dir: "desc" },
  statusField: "status",
  statuses: ["Accepted", "Rejected"],
  dateField: "report_date",
  dateLabel: "Inspection date",
  filters: [
    { field: "inspection_type", label: "Stage", options: ["Incoming", "In Process", "Outgoing"] },
    { field: "quality_inspection_template", label: "Test", optionsFrom: "Quality Inspection Template" },
  ],
  fields: [
    sec("Inspection"),
    req(select("inspection_type", "Inspection Type", ["Incoming", "In Process", "Outgoing"])),
    req(date("report_date", "Report Date")),
    req(link("quality_inspection_template", "Template", "Quality Inspection Template")),
    req(float("sample_size", "Sample Size")),
    colBreak(),
    req(select("reference_type", "Reference Type", REF_TYPES)),
    ...REF_TYPES.map((dt) => when(req(link("reference_name", "Reference", dt)), (v) => v.reference_type === dt)),
    req(link("item_code", "Item", "Item")),
    ro(data("item_name", "Item Name")),
    sec("Result"),
    ro(select("status", "Status", ["Accepted", "Rejected"])),
    check("manual_inspection", "Manual inspection (set result by hand)"),
    colBreak(),
    req(link("inspected_by", "Inspected By", "User")),
    data("verified_by", "Verified By"),
    sec("Remarks"),
    text("remarks", "Remarks"),
  ],
  children: [READINGS],
  defaults: () => ({ report_date: todayISO(), inspection_type: "In Process", sample_size: 1, naming_series: "MAT-QA-.YYYY.-", status: "Accepted" }),
  linkEffects: {
    quality_inspection_template: async (tpl) => (tpl ? { readings: await templateReadings(tpl) } : undefined),
    item_code: async (code, values) => {
      if (!code) return;
      const v = await getLinkedValues("Item", code, ["item_name", "quality_inspection_template"]);
      const patch: Record<string, any> = { item_name: v.item_name };
      if (!values.quality_inspection_template && v.quality_inspection_template) {
        patch.quality_inspection_template = v.quality_inspection_template;
        patch.readings = await templateReadings(v.quality_inspection_template as string);
      }
      return patch;
    },
  },
  compute: (values, rows) => {
    const readings = (rows.readings ?? []).map((r) => ({ ...r, status: readingStatus(r) }));
    const out: { rows: Record<string, ChildRow[]>; values?: Record<string, any> } = { rows: { readings } };
    if (!asNumber(values.manual_inspection) && readings.some((r) => r.status)) {
      out.values = { status: readings.some((r) => r.status === "Rejected") ? "Rejected" : "Accepted" };
    }
    return out;
  },
  summary: (v, rows) => {
    const r = rows.readings ?? [];
    const bad = r.filter((x) => readingStatus(x) === "Rejected");
    return [
      { label: "Result", value: v.status || "—", tone: v.status === "Rejected" ? "rose" : "emerald" },
      { label: "Parameters tested", value: r.length, tone: "sky" },
      { label: "Out of limit", value: bad.length ? bad.map((x) => `${x.specification} (${limitText(x)})`).join(", ") : "None", tone: bad.length ? "rose" : "emerald" },
    ];
  },
  titleOf: (v) => (v.item_name ? `${v.inspection_type ?? ""} · ${v.item_name}` : "New Quality Inspection"),
  validate: (v): Record<string, string> => (v.reference_type && !v.reference_name ? { reference_name: "Pick the document this inspection is for" } : {}),
};

/* ============================================================================ Inspection Template */

export const QI_TEMPLATE_CONFIG: DocConfig = {
  doctype: "Quality Inspection Template",
  base: "/quality/templates",
  singular: "Inspection Template",
  plural: "Inspection Templates",
  subtitle: "Test plans: which parameters to check and their acceptance limits",
  icon: ListChecks,
  companyScoped: false,
  listFields: ["name", "quality_inspection_template_name", "modified"],
  columns: [nameCol("Template"), dateCol("modified", "Updated")],
  searchFields: ["name"],
  fields: [sec("Template"), req(data("quality_inspection_template_name", "Template Name"))],
  children: [
    {
      key: "item_quality_inspection_parameter",
      label: "Parameters & limits",
      description: "Numeric parameters pass when every reading is within Min–Max (leave a side blank for one-sided limits). Text parameters must equal the expected value.",
      doctype: "Item Quality Inspection Parameter",
      minRows: 1,
      wide: true,
      columns: [
        req(link("specification", "Parameter", "Quality Inspection Parameter")),
        link("parameter_group", "Group", "Quality Inspection Parameter Group"),
        check("numeric", "Numeric"),
        float("min_value", "Min"),
        float("max_value", "Max"),
        data("value", "Expected value"),
      ],
      dialogColumns: [check("formula_based_criteria", "Formula based"), data("acceptance_formula", "Acceptance formula")],
      newRow: () => ({ numeric: 1 }),
      linkEffects: {
        specification: async (v) => {
          const p = await getLinkedValues("Quality Inspection Parameter", v, ["parameter_group"]);
          return { parameter_group: p.parameter_group };
        },
      },
      totals: (rows) => [{ label: "Parameters", value: rows.length }],
    },
  ],
  summary: (_v, rows) => [
    { label: "Parameters", value: (rows.item_quality_inspection_parameter ?? []).length, tone: "sky" },
    { label: "Numeric", value: (rows.item_quality_inspection_parameter ?? []).filter((r) => asNumber(r.numeric)).length, tone: "indigo" },
  ],
  titleOf: (v) => v.quality_inspection_template_name || "New Inspection Template",
};

/* ============================================================================ Parameters & groups */

export const QI_PARAMETER_CONFIG: DocConfig = {
  doctype: "Quality Inspection Parameter",
  base: "/quality/parameters",
  singular: "Inspection Parameter",
  plural: "Inspection Parameters",
  subtitle: "Measurable properties: denier, U%, CSP, neps / km …",
  icon: FlaskConical,
  companyScoped: false,
  listFields: ["name", "parameter", "parameter_group", "modified"],
  columns: [nameCol("Parameter"), textCol("parameter_group", "Group")],
  searchFields: ["name", "parameter_group"],
  filters: [{ field: "parameter_group", label: "Group", optionsFrom: "Quality Inspection Parameter Group" }],
  fields: [sec("Parameter"), req(data("parameter", "Parameter")), link("parameter_group", "Group", "Quality Inspection Parameter Group"), sec("Method"), richText("description", "Description / test method")],
  titleOf: (v) => v.parameter || "New Parameter",
};

export const QI_PARAMETER_GROUP_CONFIG: DocConfig = {
  doctype: "Quality Inspection Parameter Group",
  base: "/quality/parameter-groups",
  singular: "Parameter Group",
  plural: "Parameter Groups",
  subtitle: "Families of parameters (fibre, sliver, yarn evenness, IPI …)",
  icon: Layers,
  companyScoped: false,
  listFields: ["name", "group_name", "modified"],
  columns: [nameCol("Group"), dateCol("modified", "Updated")],
  searchFields: ["name"],
  fields: [sec("Group"), req(data("group_name", "Group Name"))],
  titleOf: (v) => v.group_name || "New Parameter Group",
};

/* ============================================================================ Quality module */

export const QUALITY_PROCEDURE_CONFIG: DocConfig = {
  doctype: "Quality Procedure",
  base: "/quality/procedures",
  singular: "Quality Procedure",
  plural: "Quality Procedures",
  subtitle: "SOPs of the quality management system",
  icon: ScrollText,
  companyScoped: false,
  listFields: ["name", "quality_procedure_name", "parent_quality_procedure", "process_owner", "is_group", "modified"],
  columns: [nameCol("Procedure", (r) => r.parent_quality_procedure || undefined), textCol("process_owner", "Owner"), yesNoCol("is_group", "Type", "Group", "Procedure")],
  searchFields: ["name", "parent_quality_procedure", "process_owner"],
  fields: [
    sec("Procedure"),
    req(data("quality_procedure_name", "Procedure Name")),
    link("parent_quality_procedure", "Parent Procedure", "Quality Procedure"),
    check("is_group", "Is Group"),
    colBreak(),
    link("process_owner", "Process Owner", "User"),
    ro(data("process_owner_full_name", "Owner Name")),
  ],
  children: [
    { key: "processes", label: "Process steps", doctype: "Quality Procedure Process", columns: [text("process_description", "Step")], newRow: () => ({}) },
  ],
  summary: (_v, rows) => [{ label: "Steps", value: (rows.processes ?? []).length, tone: "sky" }],
  titleOf: (v) => v.quality_procedure_name || "New Quality Procedure",
};

export const QUALITY_GOAL_CONFIG: DocConfig = {
  doctype: "Quality Goal",
  base: "/quality/goals",
  singular: "Quality Goal",
  plural: "Quality Goals",
  subtitle: "Measurable targets, reviewed on a schedule",
  icon: Target,
  companyScoped: false,
  listFields: ["name", "goal", "procedure", "frequency", "modified"],
  columns: [nameCol("Goal", (r) => r.procedure || undefined), textCol("frequency", "Review")],
  searchFields: ["name", "procedure"],
  fields: [
    sec("Goal"),
    req(data("goal", "Goal")),
    link("procedure", "Procedure", "Quality Procedure"),
    colBreak(),
    select("frequency", "Review Frequency", ["None", "Daily", "Weekly", "Monthly", "Quarterly"]),
    when(select("weekday", "Weekday", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]), (v) => v.frequency === "Weekly"),
    when(data("date", "Day of month"), (v) => v.frequency === "Monthly" || v.frequency === "Quarterly"),
  ],
  children: [
    {
      key: "objectives",
      label: "Objectives",
      doctype: "Quality Goal Objective",
      minRows: 1,
      columns: [req(text("objective", "Objective")), data("target", "Target"), link("uom", "UOM", "UOM")],
      newRow: () => ({}),
    },
  ],
  defaults: () => ({ frequency: "Monthly", date: "1" }),
  titleOf: (v) => v.goal || "New Quality Goal",
};

export const QUALITY_REVIEW_CONFIG: DocConfig = {
  doctype: "Quality Review",
  base: "/quality/reviews",
  singular: "Quality Review",
  plural: "Quality Reviews",
  subtitle: "Periodic check of each goal against its targets",
  icon: ClipboardList,
  companyScoped: false,
  listFields: ["name", "goal", "date", "procedure", "status", "modified"],
  columns: [nameCol("Review", (r) => r.goal), dateCol("date", "Date"), statusCol("status", "Status", "Open")],
  searchFields: ["name", "goal", "procedure"],
  sort: { key: "date", dir: "desc" },
  statusField: "status",
  statuses: ["Open", "Passed", "Failed"],
  dateField: "date",
  filters: [{ field: "goal", label: "Goal", optionsFrom: "Quality Goal" }],
  fields: [
    sec("Review"),
    req(link("goal", "Goal", "Quality Goal")),
    date("date", "Date"),
    colBreak(),
    link("procedure", "Procedure", "Quality Procedure"),
    select("status", "Status", ["Open", "Passed", "Failed"]),
    sec("Notes"),
    text("additional_information", "Additional information"),
  ],
  children: [
    {
      key: "reviews",
      label: "Objectives reviewed",
      doctype: "Quality Review Objective",
      columns: [text("objective", "Objective"), data("target", "Target"), link("uom", "UOM", "UOM"), select("status", "Status", ["Open", "Passed", "Failed"]), text("review", "Finding")],
      newRow: () => ({ status: "Open" }),
    },
  ],
  linkEffects: {
    goal: async (goal) => {
      if (!goal) return;
      const g = await postCall<any>("frappe.client.get", { doctype: "Quality Goal", name: goal });
      return {
        procedure: g?.procedure,
        reviews: ((g?.objectives as any[]) ?? []).map((o) => ({ objective: o.objective, target: o.target, uom: o.uom, status: "Open" })),
      };
    },
  },
  compute: (_v, rows) => {
    const r = rows.reviews ?? [];
    if (!r.length || r.some((x) => !x.status || x.status === "Open")) return;
    return { values: { status: r.some((x) => x.status === "Failed") ? "Failed" : "Passed" } };
  },
  defaults: () => ({ date: todayISO(), status: "Open" }),
  titleOf: (v) => (v.goal ? `${v.goal} · ${v.date ?? ""}` : "New Quality Review"),
};

export const NON_CONFORMANCE_CONFIG: DocConfig = {
  doctype: "Non Conformance",
  base: "/quality/non-conformances",
  singular: "Non Conformance",
  plural: "Non Conformances",
  subtitle: "Failed lots and process deviations, with corrective and preventive action",
  icon: AlertOctagon,
  companyScoped: false,
  listFields: ["name", "subject", "procedure", "status", "full_name", "creation", "modified"],
  columns: [nameCol("Non conformance", (r) => r.subject), textCol("procedure", "Procedure"), statusCol("status", "Status", "Open"), dateCol("creation", "Raised")],
  searchFields: ["name", "subject", "procedure"],
  sort: { key: "creation", dir: "desc" },
  statusField: "status",
  statuses: ["Open", "Resolved", "Cancelled"],
  filters: [{ field: "procedure", label: "Procedure", optionsFrom: "Quality Procedure" }],
  fields: [
    sec("Non conformance"),
    req(data("subject", "Subject")),
    req(link("procedure", "Procedure", "Quality Procedure")),
    colBreak(),
    req(select("status", "Status", ["Open", "Resolved", "Cancelled"])),
    ro(data("process_owner", "Process Owner")),
    sec("What happened"),
    richText("details", "Details"),
    sec("CAPA"),
    richText("corrective_action", "Corrective action"),
    richText("preventive_action", "Preventive action"),
  ],
  defaults: () => ({ status: "Open" }),
  summary: (v) => [{ label: "Status", value: v.status || "Open", tone: v.status === "Resolved" ? "emerald" : v.status === "Cancelled" ? "slate" : "rose" }],
  titleOf: (v) => v.subject || "New Non Conformance",
};

export const QUALITY_ACTION_CONFIG: DocConfig = {
  doctype: "Quality Action",
  base: "/quality/actions",
  singular: "Quality Action",
  plural: "Quality Actions",
  subtitle: "Corrective and preventive actions (CAPA) from reviews and non-conformances",
  icon: Wrench,
  companyScoped: false,
  listFields: ["name", "corrective_preventive", "goal", "procedure", "date", "status", "modified"],
  columns: [nameCol("Action", (r) => r.goal || r.procedure), textCol("corrective_preventive", "Type"), dateCol("date", "Date"), statusCol("status", "Status", "Open")],
  searchFields: ["name", "goal", "procedure", "review"],
  sort: { key: "date", dir: "desc" },
  statusField: "status",
  statuses: ["Open", "Completed"],
  dateField: "date",
  filters: [{ field: "corrective_preventive", label: "Type", options: ["Corrective", "Preventive"] }],
  fields: [
    sec("Action"),
    req(select("corrective_preventive", "Type", ["Corrective", "Preventive"])),
    date("date", "Date"),
    select("status", "Status", ["Open", "Completed"]),
    colBreak(),
    link("goal", "Goal", "Quality Goal"),
    link("procedure", "Procedure", "Quality Procedure"),
    link("review", "Review", "Quality Review"),
  ],
  children: [
    {
      key: "resolutions",
      label: "Problems & resolutions",
      doctype: "Quality Action Resolution",
      wide: true,
      columns: [text("problem", "Problem"), text("resolution", "Resolution"), select("status", "Status", ["Open", "Completed"]), link("responsible", "Responsible", "User"), date("completion_by", "Complete by")],
      newRow: () => ({ status: "Open" }),
      totals: (rows) => [{ label: "Open", value: rows.filter((r) => r.status !== "Completed").length, align: "right" }],
    },
  ],
  compute: (_v, rows) => {
    const r = rows.resolutions ?? [];
    if (!r.length) return;
    return { values: { status: r.every((x) => x.status === "Completed") ? "Completed" : "Open" } };
  },
  defaults: () => ({ corrective_preventive: "Corrective", date: todayISO(), status: "Open" }),
  titleOf: (v) => (v.goal || v.procedure ? `${v.corrective_preventive} · ${v.goal || v.procedure}` : "New Quality Action"),
};

export const QUALITY_CONFIGS = [
  QUALITY_INSPECTION_CONFIG,
  QI_TEMPLATE_CONFIG,
  QI_PARAMETER_CONFIG,
  QI_PARAMETER_GROUP_CONFIG,
  QUALITY_PROCEDURE_CONFIG,
  QUALITY_GOAL_CONFIG,
  QUALITY_REVIEW_CONFIG,
  NON_CONFORMANCE_CONFIG,
  QUALITY_ACTION_CONFIG,
];
