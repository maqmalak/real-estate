import toast from "react-hot-toast";
import { FileSignature, CalendarRange, Building2, PartyPopper, Ban } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import { FrappeLinkField, linkTitleField, type FormFieldMeta } from "@/components/forms/field-primitives";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatShortDate } from "@/utils/dates";
import { printDocument } from "@/utils/print";
import { getCall, humanizeError } from "@/services/frappe";

interface CrmContractRow {
  name?: string;
  party_type?: string;
  party_name?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  contract_template?: string;
  contract_terms?: string;
  document_type?: string;
  document_name?: string;
  modified?: string;
}

const STATUSES = ["Unsigned", "Active", "Inactive", "Cancelled"];

/**
 * Contract Template has no rendering endpoint of its own (unlike Email
 * Template's `get_email_template`, which runs real server-side Jinja) — so
 * `{{ placeholder }}` tokens in a template's boilerplate are substituted
 * client-side, once, at load time, against the Contract fields already
 * filled in (party_name, document_name, ...). Simple named substitution
 * only — no Jinja conditionals/filters/loops.
 */
function fillContractPlaceholders(html: string, context: Record<string, any>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = context[key];
    return value === undefined || value === null || value === "" ? match : String(value);
  });
}

// Property Setters widen Contract's core party_type/document_type Select
// options on the backend to include these CRM doctypes (Frappe validates a
// Select field's value against its declared options server-side, so the
// dropdown alone isn't enough — see crm-setup.sh's "widen Contract options" step).
const PARTY_TYPES = ["Customer", "Supplier", "Employee", "CRM Lead", "CRM Deal", "CRM Organization"];
const DOCUMENT_TYPES = ["Quotation", "Project", "Sales Order", "Purchase Order", "Sales Invoice", "Purchase Invoice", "CRM Lead", "CRM Deal"];

const columns: ColumnDef<CrmContractRow>[] = [
  { key: "party_type", label: "Party Type", render: (r) => <span className="text-sm text-muted-foreground">{r.party_type || "—"}</span>, getValue: (r) => r.party_type },
  { key: "party_name", label: "Party", render: (r) => <span className="text-sm">{r.party_name || "—"}</span>, getValue: (r) => r.party_name },
  {
    key: "document_name",
    label: "Linked Lead/Deal",
    render: (r) =>
      r.document_type && r.document_name ? (
        <span className="text-sm text-muted-foreground">{r.document_type}: {r.document_name}</span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
    getValue: (r) => r.document_name,
  },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "start_date", label: "Start", render: (r) => <span className="text-sm">{r.start_date ? formatShortDate(r.start_date) : "—"}</span>, getValue: (r) => r.start_date },
  { key: "end_date", label: "End", render: (r) => <span className="text-sm">{r.end_date ? formatShortDate(r.end_date) : "—"}</span>, getValue: (r) => r.end_date },
  { key: "contract_template", label: "Template", render: (r) => <span className="text-sm text-muted-foreground">{r.contract_template || "—"}</span>, getValue: (r) => r.contract_template },
];

const config: CrmManagementConfig<CrmContractRow> = {
  title: "Contracts",
  subtitle: "Agreements with customers, suppliers, employees — or a CRM Lead/Deal/Organization",
  icon: <FileSignature className="h-5 w-5" />,
  doctype: "Contract",
  fields: ["name", "party_type", "party_name", "status", "start_date", "end_date", "contract_template", "contract_terms", "document_type", "document_name", "modified"],
  formFields: [
    { fieldname: "party_type", label: "Party Type", fieldtype: "Select", options: PARTY_TYPES.join("\n"), reqd: true },
    { fieldname: "party_name", label: "Party", fieldtype: "Dynamic Link", options: "party_type", reqd: true },
    { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), default: "Unsigned" },
    { fieldname: "start_date", label: "Start Date", fieldtype: "Date" },
    { fieldname: "end_date", label: "End Date", fieldtype: "Date" },
    { fieldname: "document_type", label: "Document Type", fieldtype: "Select", options: DOCUMENT_TYPES.join("\n") },
    { fieldname: "document_name", label: "Document Name", fieldtype: "Dynamic Link", options: "document_type" },
    { fieldname: "contract_template", label: "Load from Template", fieldtype: "Link", options: "Contract Template" },
    { fieldname: "contract_terms", label: "Contract Terms", fieldtype: "Text Editor", reqd: true },
  ],
  defaults: { status: "Unsigned" },
  dialogSize: "xl",
  // Dynamic Link fields resolve their target doctype from a sibling field's
  // current value (party_name -> party_type, document_name -> document_type),
  // which FrappeForm's generic fieldtype switch can't express on its own.
  // contract_template also needs a side effect beyond its own value: picking
  // one loads that template's boilerplate straight into contract_terms
  // (mirroring the Email Template picker's "load & render" behavior).
  renderField: (meta: FormFieldMeta, { values, onChange }) => {
    if (meta.fieldtype === "Dynamic Link") {
      const targetDoctype = String(values[meta.options ?? ""] ?? "");
      if (!targetDoctype) {
        return <p className="flex h-9 items-center text-sm text-muted-foreground">Select {meta.options === "party_type" ? "a party type" : "a document type"} first</p>;
      }
      return (
        <FrappeLinkField
          meta={{ ...meta, fieldtype: "Link", options: targetDoctype }}
          value={String(values[meta.fieldname] ?? "")}
          onChange={async (v) => {
            onChange(meta.fieldname, v);
            // ERPNext's own Contract.set_missing_values() fills party_full_name
            // by guessing the field name as `party_type.lower() + "_name"` —
            // works for the original single-word types (Customer/Supplier/
            // Employee) but produces an invalid field string like
            // "crm organization_name" for our added multi-word CRM doctypes,
            // and fails outright on save. Pre-filling it here (using the
            // correct per-doctype title field) means that guess never runs,
            // since it only fires when party_full_name is still empty.
            if (meta.fieldname !== "party_name") return;
            if (!v) {
              onChange("party_full_name", "");
              return;
            }
            const titleField = linkTitleField(targetDoctype);
            if (titleField === "name") {
              onChange("party_full_name", v);
              return;
            }
            try {
              const result = await getCall<Record<string, string>>("frappe.client.get_value", {
                doctype: targetDoctype,
                filters: v,
                fieldname: titleField,
              });
              onChange("party_full_name", result?.[titleField] ?? v);
            } catch (err) {
              toast.error(humanizeError(err));
            }
          }}
        />
      );
    }
    if (meta.fieldname === "contract_template") {
      return (
        <FrappeLinkField
          meta={meta}
          value={String(values.contract_template ?? "")}
          onChange={async (v) => {
            onChange("contract_template", v);
            if (!v) return;
            try {
              // as_dict (the default) returns {contract_terms: "..."} —
              // getCall already unwraps the RPC envelope's own `.message`.
              const result = await getCall<{ contract_terms?: string }>("frappe.client.get_value", {
                doctype: "Contract Template",
                filters: v,
                fieldname: "contract_terms",
              });
              const raw = result?.contract_terms ?? "";
              onChange("contract_terms", raw ? fillContractPlaceholders(raw, values) : raw);
            } catch (err) {
              toast.error(humanizeError(err));
            }
          }}
        />
      );
    }
    return undefined;
  },
  kanbanField: "status",
  kanbanColumns: STATUSES.map((s) => ({ value: s })),
  searchField: "party_name",
  statusField: "status",
  statusOptions: STATUSES,
  columns,
  exportFilename: "contracts",
  onPrintRow: (r) => {
    printDocument(
      `Contract — ${r.party_name || r.name}`,
      r.party_type,
      [
        { label: "Party Type", value: r.party_type || "—" },
        { label: "Party", value: r.party_name || "—" },
        { label: "Status", value: r.status || "—" },
        { label: "Start Date", value: r.start_date ? formatShortDate(r.start_date) : "—" },
        { label: "End Date", value: r.end_date ? formatShortDate(r.end_date) : "—" },
        {
          label: "Linked Reference",
          value: r.document_type && r.document_name ? `${r.document_type}: ${r.document_name}` : "—",
        },
      ],
      r.contract_terms || "<p>No terms recorded.</p>",
      [
        { label: r.party_type || "Participant", name: r.party_name },
        { label: "For the Company" },
      ],
    );
  },
  stats: (rows) => [
    { label: "Total", value: rows.length, icon: <FileSignature className="h-4 w-4" />, tone: "sky" },
    { label: "Unsigned", value: rows.filter((r) => r.status === "Unsigned").length, icon: <CalendarRange className="h-4 w-4" />, tone: "slate" },
    { label: "Active", value: rows.filter((r) => r.status === "Active").length, icon: <PartyPopperIcon />, tone: "emerald" },
    { label: "Inactive", value: rows.filter((r) => r.status === "Inactive").length, icon: <Building2 className="h-4 w-4" />, tone: "amber" },
    { label: "Cancelled", value: rows.filter((r) => r.status === "Cancelled").length, icon: <Ban className="h-4 w-4" />, tone: "rose" },
  ],
  rowName: (r) => r.party_name || r.name || "Contract",
  rowSubtitle: (r) => (r.end_date ? `Ends ${formatShortDate(r.end_date)}` : undefined),
  renderCard: (r) => (
    <div className="space-y-2">
      <p className="truncate text-sm font-medium">{r.party_name || r.name}</p>
      <div className="flex items-center justify-between">
        <StatusBadge status={r.status} />
        <span className="text-xs text-muted-foreground">{r.end_date ? formatShortDate(r.end_date) : ""}</span>
      </div>
    </div>
  ),
  emptyTitle: "No contracts",
  emptyDescription: "Create a contract to track agreements in one place",
  newLabel: "New Contract",
};

function PartyPopperIcon() {
  return <PartyPopper className="h-4 w-4" />;
}

export default function ContractsPage() {
  return <CrmManagementPage config={config} />;
}
