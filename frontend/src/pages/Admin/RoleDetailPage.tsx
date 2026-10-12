import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, UserPlus, X } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsersForRole, useInvalidateRoleAssignments } from "@/hooks/useRoles";
import { useUsers } from "@/hooks/useUsers";
import { getCall, postCall, humanizeError } from "@/services/frappe";
import type { FrappeUser } from "@/types/frappe";

async function getFullUser(name: string): Promise<FrappeUser> {
  return getCall<FrappeUser>("frappe.client.get", { doctype: "User", name });
}

async function replaceUserRoles(roleNames: string[], doc: FrappeUser): Promise<void> {
  await postCall("frappe.client.save", {
    doc: JSON.stringify({ ...doc, doctype: "User", roles: roleNames.map((role) => ({ role })) }),
  });
}

export function RoleDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { userNames, isLoading: rolesLoading } = useUsersForRole(name);
  const { data: allUsers, isLoading: usersLoading, mutate } = useUsers({ limit: 0 });
  const invalidateRoleAssignments = useInvalidateRoleAssignments();

  const refresh = () => {
    void mutate();
    void invalidateRoleAssignments();
  };

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<FrappeUser | null>(null);
  const [busy, setBusy] = useState(false);

  const assignedUsers = useMemo(
    () => (allUsers ?? []).filter((u) => userNames.includes(u.name)),
    [allUsers, userNames],
  );
  const candidateUsers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return (allUsers ?? [])
      .filter((u) => !userNames.includes(u.name))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.full_name ?? "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [allUsers, userNames, assignSearch]);

  const isLoading = rolesLoading || usersLoading;

  const assignUser = async (user: FrappeUser) => {
    if (!name) return;
    setBusy(true);
    try {
      const existingDoc = await getFullUser(user.name);
      const existingRoles = (existingDoc.roles ?? []).map((r) => r.role);
      await replaceUserRoles([...new Set([...existingRoles, name])], existingDoc);
      toast.success(`Added ${user.full_name || user.name} to ${name}`);
      setAssignOpen(false);
      setAssignSearch("");
      refresh();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async () => {
    if (!removeTarget || !name) return;
    setBusy(true);
    try {
      const existingDoc = await getFullUser(removeTarget.name);
      const remaining = (existingDoc.roles ?? []).map((r) => r.role).filter((r) => r !== name);
      await replaceUserRoles(remaining, existingDoc);
      toast.success(`Removed ${removeTarget.full_name || removeTarget.name} from ${name}`);
      setRemoveTarget(null);
      refresh();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={name ?? ""}
        subtitle={`${assignedUsers.length} user${assignedUsers.length === 1 ? "" : "s"} assigned`}
        breadcrumbs={
          <button
            onClick={() => navigate("/admin/roles")}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Roles
          </button>
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setAssignOpen(true)}>
            <UserPlus className="h-4 w-4" /> Assign User
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : assignedUsers.length === 0 ? (
            <EmptyState
              title="No users assigned"
              description="Assign this role to a user to grant it to them."
              actionLabel="Assign User"
              onAction={() => setAssignOpen(true)}
            />
          ) : (
            <ul className="divide-y divide-border">
              {assignedUsers.map((u) => (
                <li key={u.name} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={u.full_name || u.name} src={u.user_image} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.full_name || u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email || u.name}</p>
                    </div>
                    <Badge variant={u.enabled ? "success" : "destructive"} className="ml-1 shrink-0">
                      {u.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${u.full_name || u.name} from ${name}`}
                    onClick={() => setRemoveTarget(u)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign user"
        description={`Add a user to the ${name} role.`}
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={assignSearch}
            onChange={(e) => setAssignSearch(e.target.value)}
            placeholder="Search users by name or email…"
          />
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border scrollbar-thin">
            {candidateUsers.length === 0 ? (
              <li className="p-4 text-center text-sm text-muted-foreground">No matching users</li>
            ) : (
              candidateUsers.map((u) => (
                <li key={u.name}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void assignUser(u)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Avatar name={u.full_name || u.name} src={u.user_image} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.full_name || u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email || u.name}</p>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove role"
        description={`Remove ${removeTarget?.full_name || removeTarget?.name} from ${name}?`}
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={() => void removeUser()}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
