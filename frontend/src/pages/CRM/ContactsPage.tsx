import { Contact2, Mail, Phone, Building2, Sparkles } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { WhatsAppIcon } from "@/components/common/whatsapp-icon";
import { relativeDays } from "@/utils/dates";
import { whatsappUrl } from "@/utils/whatsapp";

interface ContactRow {
  name?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email_id?: string;
  mobile_no?: string;
  phone?: string;
  status?: string;
  designation?: string;
  company_name?: string;
  gender?: string;
  image?: string;
  owner?: string;
  modified?: string;
}

const STATUSES = ["Passive", "Open", "Replied"];

function displayName(r: ContactRow): string {
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ");
  return name || r.full_name || r.name || "Contact";
}

const columns: ColumnDef<ContactRow>[] = [
  {
    key: "email_id",
    label: "Email",
    render: (r) =>
      r.email_id ? (
        <a href={`mailto:${r.email_id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Mail className="h-3.5 w-3.5" />
          {r.email_id}
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
    getValue: (r) => r.email_id,
  },
  {
    key: "mobile_no",
    label: "Phone",
    render: (r) => {
      const v = r.mobile_no || r.phone;
      if (!v) return <span className="text-sm text-muted-foreground">—</span>;
      const wa = whatsappUrl(v);
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <a href={`tel:${v}`} className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {v}
          </a>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              title="Call on WhatsApp"
              onClick={(e) => e.stopPropagation()}
              className="text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
            >
              <WhatsAppIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </span>
      );
    },
    getValue: (r) => r.mobile_no || r.phone,
  },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  { key: "designation", label: "Designation", render: (r) => <span className="text-sm">{r.designation || "—"}</span>, getValue: (r) => r.designation },
  {
    key: "company_name",
    label: "Company",
    render: (r) =>
      r.company_name ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {r.company_name}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
    getValue: (r) => r.company_name,
  },
  {
    key: "modified",
    label: "Updated",
    render: (r) => <span className="text-xs text-muted-foreground">{relativeDays(r.modified)}</span>,
    getValue: (r) => r.modified,
  },
];

const config: CrmManagementConfig<ContactRow> = {
  title: "Contacts",
  subtitle: "People behind your leads, deals and organizations",
  icon: <Contact2 className="h-5 w-5" />,
  doctype: "Contact",
  fields: ["name", "first_name", "last_name", "full_name", "email_id", "mobile_no", "phone", "status", "designation", "company_name", "gender", "image", "owner", "modified"],
  formFields: [
    { fieldname: "first_name", label: "First Name", fieldtype: "Data", reqd: true },
    { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
    { fieldname: "email_id", label: "Email", fieldtype: "Data" },
    { fieldname: "mobile_no", label: "Mobile No", fieldtype: "Data" },
    { fieldname: "phone", label: "Phone", fieldtype: "Data" },
    { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), default: "Passive" },
    { fieldname: "designation", label: "Designation", fieldtype: "Data" },
    { fieldname: "company_name", label: "Company", fieldtype: "Data" },
    { fieldname: "image", label: "Photo", fieldtype: "Attach Image" },
  ],
  defaults: { status: "Passive" },
  kanbanField: "status",
  kanbanColumns: STATUSES.map((s) => ({ value: s })),
  searchField: "first_name",
  statusField: "status",
  statusOptions: STATUSES,
  columns,
  stats: (rows) => [
    { label: "Contacts", value: rows.length, icon: <Contact2 className="h-4 w-4" />, tone: "sky" },
    { label: "With Email", value: rows.filter((r) => r.email_id).length, icon: <Mail className="h-4 w-4" />, tone: "indigo" },
    { label: "With Phone", value: rows.filter((r) => r.mobile_no || r.phone).length, icon: <Phone className="h-4 w-4" />, tone: "emerald" },
    { label: "Companies", value: new Set(rows.map((r) => r.company_name).filter(Boolean)).size, icon: <Building2 className="h-4 w-4" />, tone: "amber" },
    { label: "Open", value: rows.filter((r) => r.status === "Open").length, icon: <Sparkles className="h-4 w-4" />, tone: "teal" },
  ],
  rowName: displayName,
  rowImage: (r) => r.image || undefined,
  rowSubtitle: (r) => r.email_id || r.designation || undefined,
  renderCard: (r) => (
    <div className="space-y-2">
      <p className="truncate text-sm font-medium">{displayName(r)}</p>
      <div className="flex items-center justify-between">
        <StatusBadge status={r.status} />
        <span className="truncate text-xs text-muted-foreground">{r.email_id || r.mobile_no || ""}</span>
      </div>
    </div>
  ),
  showId: true,
  emptyTitle: "No contacts",
  emptyDescription: "Add a contact to connect people to your pipeline",
  newLabel: "New Contact",
};

export default function ContactsPage() {
  return <CrmManagementPage config={config} />;
}
