import { Building2, Factory, Globe, Users, Landmark, MapPin } from "lucide-react";
import { WebsiteLink } from "@/components/crm/WebsiteLink";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { CRM_ORGANIZATION_FORM_FIELDS } from "@/components/forms/form-configs";
import { compactNumber } from "@/utils/currency";
import type { CrmOrganization } from "@/types/frappe";

const columns: ColumnDef<CrmOrganization>[] = [
  {
    key: "website",
    label: "Website",
    render: (r) =>
      r.website ? (
        <a href={r.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Globe className="h-3.5 w-3.5" />
          {r.website.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      ),
    getValue: (r) => r.website,
  },
  { key: "industry", label: "Industry", render: (r) => <span className="text-sm">{r.industry || "—"}</span>, getValue: (r) => r.industry },
  {
    key: "annual_revenue",
    label: "Annual Revenue",
    align: "right",
    render: (r) => <span className="text-sm tabular-nums">{r.annual_revenue ? compactNumber(Number(r.annual_revenue)) : "—"}</span>,
    getValue: (r) => r.annual_revenue,
  },
  { key: "no_of_employees", label: "Employees", align: "right", render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.no_of_employees || "—"}</span>, getValue: (r) => r.no_of_employees },
  { key: "territory", label: "Territory", render: (r) => <span className="text-sm text-muted-foreground">{r.territory || "—"}</span>, getValue: (r) => r.territory },
];

const config: CrmManagementConfig<CrmOrganization> = {
  title: "Organizations",
  subtitle: "Accounts and companies you do business with",
  icon: <Building2 className="h-5 w-5" />,
  doctype: "CRM Organization",
  fields: ["name", "organization_name", "website", "industry", "no_of_employees", "annual_revenue", "territory", "address", "currency", "organization_logo", "modified"],
  formFields: CRM_ORGANIZATION_FORM_FIELDS,
  kanbanField: "industry",
  searchField: "organization_name",
  statusField: "industry",
  columns,
  stats: (rows) => [
    { label: "Organizations", value: rows.length, icon: <Building2 className="h-4 w-4" />, tone: "sky" },
    { label: "With Website", value: rows.filter((r) => r.website).length, icon: <Globe className="h-4 w-4" />, tone: "indigo" },
    {
      label: "Total Revenue",
      value: compactNumber(rows.reduce((a, r) => a + Number(r.annual_revenue ?? 0), 0)),
      icon: <Landmark className="h-4 w-4" />,
      tone: "emerald",
    },
    { label: "Industries", value: new Set(rows.map((r) => r.industry).filter(Boolean)).size, icon: <MapPin className="h-4 w-4" />, tone: "amber" },
    { label: "Total Employees", value: rows.length ? rows.filter((r) => r.no_of_employees).length : 0, icon: <Users className="h-4 w-4" />, tone: "teal" },
  ],
  rowName: (r) => r.organization_name || r.name || "Organization",
  rowSubtitle: (r) => (r.industry ? String(r.industry) : undefined),
  rowImage: (r) => r.organization_logo || undefined,
  renderCard: (r) => (
    <div className="space-y-1.5">
      <p className="truncate text-sm font-medium">{r.organization_name || r.name}</p>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Factory className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{r.industry || "—"}</span>
        </span>
        <span className="shrink-0 tabular-nums">{r.no_of_employees || ""}</span>
      </div>
      {r.website && <WebsiteLink url={r.website} />}
      {r.address && (
        <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2 whitespace-pre-line break-words">{r.address}</span>
        </p>
      )}
    </div>
  ),
  emptyTitle: "No organizations",
  emptyDescription: "Add an organization to start building your account book",
  newLabel: "New Organization",
};

export default function OrganizationsPage() {
  return <CrmManagementPage config={config} />;
}
