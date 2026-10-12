import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/page-header";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { useRoles, useRoleUserCounts } from "@/hooks/useRoles";
import type { FrappeRole } from "@/types/frappe";

export function RolesPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useRoles();
  const { counts } = useRoleUserCounts();

  const columns: ColumnDef<FrappeRole>[] = [
    { key: "name", label: "Role", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "users",
      label: "Users",
      getValue: (r) => counts.get(r.name) ?? 0,
      render: (r) => <Badge variant="secondary">{counts.get(r.name) ?? 0}</Badge>,
    },
    {
      key: "desk_access",
      label: "Desk Access",
      render: (r) => (r.desk_access ? <Badge variant="info">Yes</Badge> : <Badge variant="outline">No</Badge>),
    },
    {
      key: "disabled",
      label: "Status",
      render: (r) => (
        <Badge variant={r.disabled ? "destructive" : "success"}>{r.disabled ? "Disabled" : "Active"}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles"
        subtitle="Assign users to roles. For custom permission rules, use ERPNext desk's Role Permission Manager."
      />
      <FrappeDataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/admin/roles/${encodeURIComponent(r.name)}`)}
        searchPlaceholder="Search roles…"
        title="Roles"
        subtitle={`${data?.length ?? 0} roles`}
        exportFilename="roles"
        initialPageSize={20}
      />
    </div>
  );
}
