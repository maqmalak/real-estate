import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useUsers } from "@/hooks/useUsers";
import { useHasRoleRows } from "@/hooks/useRoles";
import { formatDateTime } from "@/utils/dates";
import type { FrappeUser } from "@/types/frappe";

export function UsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, error, isLoading, mutate } = useUsers({ search });
  const { data: hasRoleRows } = useHasRoleRows();

  const rolesByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    hasRoleRows.forEach((row) => {
      const list = map.get(row.parent) ?? [];
      list.push(row.role);
      map.set(row.parent, list);
    });
    return map;
  }, [hasRoleRows]);

  const columns: ColumnDef<FrappeUser>[] = [
    {
      key: "full_name",
      label: "User",
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.full_name || r.name} src={r.user_image} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.full_name || r.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.email || r.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      label: "Roles",
      sortable: false,
      render: (r) => {
        const roles = rolesByUser.get(r.name) ?? [];
        if (roles.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {roles.slice(0, 2).map((role) => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))}
            {roles.length > 2 && <Badge variant="secondary">+{roles.length - 2}</Badge>}
          </div>
        );
      },
    },
    {
      key: "enabled",
      label: "Status",
      render: (r) => (
        <Badge variant={r.enabled ? "success" : "destructive"}>{r.enabled ? "Enabled" : "Disabled"}</Badge>
      ),
    },
    { key: "user_type", label: "Type" },
    {
      key: "last_login",
      label: "Last Login",
      render: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.last_login)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="System users and their access"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate("/admin/users/new")}>
            <UserPlus className="h-4 w-4" /> New User
          </Button>
        }
      />
      <FrappeDataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/admin/users/${encodeURIComponent(r.name)}`)}
        searchPlaceholder="Search users…"
        title="Users"
        subtitle={`${data?.length ?? 0} users`}
        exportFilename="users"
        toolbar={
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or email…"
            className="hidden h-8 w-56 rounded-md border border-input bg-transparent px-2.5 text-xs sm:block"
            aria-label="Server-side user search"
          />
        }
      />
    </div>
  );
}
