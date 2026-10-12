import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { useUser, useUserMutations } from "@/hooks/useUsers";
import { useRoles, useInvalidateRoleAssignments } from "@/hooks/useRoles";
import { formatDateTime } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";

export function UserDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: user, error, isLoading, mutate } = useUser(name);
  const { data: roles } = useRoles();
  const { updateUser, setUserRoles, loading: saving } = useUserMutations();
  const invalidateRoleAssignments = useInvalidateRoleAssignments();

  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user) {
      setSelectedRoles(new Set((user.roles ?? []).map((r) => r.role)));
      setDirty(false);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full max-w-2xl" />
      </div>
    );
  }
  if (error || !user) {
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  }

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
    setDirty(true);
  };

  const toggleEnabled = async () => {
    try {
      await updateUser(user.name, { enabled: user.enabled ? 0 : 1 });
      toast.success(user.enabled ? "User disabled" : "User enabled");
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const saveRoles = async () => {
    try {
      await setUserRoles(user, [...selectedRoles]);
      toast.success("Roles updated");
      setDirty(false);
      void mutate();
      void invalidateRoleAssignments();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={user.full_name || user.name}
        subtitle={user.email || user.name}
        breadcrumbs={
          <button
            onClick={() => navigate("/admin/users")}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Users
          </button>
        }
        actions={
          <>
            <DocActionsMenu doctype="User" doc={user as any} onChanged={() => void mutate()} />
            <Button variant={user.enabled ? "destructive" : "primary"} size="sm" onClick={() => void toggleEnabled()}>
              {user.enabled ? "Disable User" : "Enable User"}
            </Button>
          </>
        }
      />
      <DocPageTabs doctype="User" name={user?.name ?? name} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <Avatar name={user.full_name || user.name} src={user.user_image} size="lg" />
            <div>
              <p className="font-semibold">{user.full_name || user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email || user.name}</p>
            </div>
            <Badge variant={user.enabled ? "success" : "destructive"}>
              {user.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <dl className="w-full space-y-2 border-t border-border pt-3 text-left text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">User Type</dt>
                <dd className="font-medium">{user.user_type || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Last Login</dt>
                <dd className="font-medium">{formatDateTime(user.last_login)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{formatDateTime(user.creation)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Roles</CardTitle>
            <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={() => void saveRoles()}>
              Save Roles
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid max-h-96 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto scrollbar-thin sm:grid-cols-2">
              {(roles ?? [])
                .filter((r) => !r.disabled)
                .map((role) => (
                  <Checkbox
                    key={role.name}
                    label={role.name}
                    checked={selectedRoles.has(role.name)}
                    onChange={() => toggleRole(role.name)}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
