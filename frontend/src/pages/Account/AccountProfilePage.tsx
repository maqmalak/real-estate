import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSWRConfig } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { useAuth } from "@/hooks/useAuth";
import { useUser, useUserMutations } from "@/hooks/useUsers";
import { formatDateTime } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";

/**
 * Every logged-in user's own profile — deliberately scoped to fields Frappe
 * lets a user edit on themselves (full name, language, time zone), not the
 * full Admin → Users form. Role/enable changes stay admin-only.
 */
export function AccountProfilePage() {
  const { currentUser, roles } = useAuth();
  const { data: user, error, isLoading, mutate } = useUser(currentUser ?? undefined);
  const { updateUser, loading: saving } = useUserMutations();
  const { mutate: mutateGlobal } = useSWRConfig();

  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? "");
      setLanguage(user.language ?? "");
      setTimeZone(user.time_zone ?? "");
      setDirty(false);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }
  if (error || !user) {
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  }

  const markDirty = () => setDirty(true);

  const onSave = async () => {
    if (!currentUser) return;
    try {
      await updateUser(currentUser, { full_name: fullName, language, time_zone: timeZone });
      toast.success("Profile updated");
      setDirty(false);
      void mutate();
      // The header reads the profile doc under its own SWR key — nudge it
      // too so the name/avatar there update without a full page reload.
      void mutateGlobal(`micromax.user.${currentUser}`);
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="My Account" subtitle="Your profile, as stored in ERPNext" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <Avatar name={user.full_name || user.name} src={user.user_image} size="lg" />
            <div>
              <p className="font-semibold">{user.full_name || user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email || user.name}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1">
              {roles.slice(0, 6).map((role) => (
                <Badge key={role} variant="outline">
                  {role}
                </Badge>
              ))}
            </div>
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
                <dt className="text-muted-foreground">Member Since</dt>
                <dd className="font-medium">{formatDateTime(user.creation)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Profile Details</CardTitle>
            <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={() => void onSave()}>
              Save Changes
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  markDirty();
                }}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email || user.name} disabled />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="language">Language</Label>
                <Input
                  id="language"
                  value={language}
                  placeholder="en"
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div>
                <Label htmlFor="time_zone">Time Zone</Label>
                <Input
                  id="time_zone"
                  value={timeZone}
                  placeholder="Asia/Karachi"
                  onChange={(e) => {
                    setTimeZone(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
