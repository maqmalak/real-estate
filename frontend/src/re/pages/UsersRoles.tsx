/**
 * Users & Roles (/re/settings/users, System Manager): the spec's roles as ERPNext Role Profiles — what each profile
 * may do, who has it, change a user's profile, enable / disable, and add a staff user. Server: realestate.rbac.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, ShieldCheck, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/re/components/analytics/kit";
import { Badge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Dialog } from "@/re/components/ui/sheet";
import { Skeleton } from "@/re/components/ui/skeleton";
import { get, post } from "@/re/lib/api";
import { dateTime } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";

interface Profile { name: string; roles: string[]; description: string }
interface UserRow { name: string; full_name: string; user_type: string; enabled: 0 | 1; last_login: string | null; mobile_no: string | null; profiles: string[]; roles: string[] }
interface Overview { profiles: Profile[]; users: UserRow[]; counts: Record<string, number> }

const TONE: Record<string, "red" | "blue" | "violet" | "green" | "amber" | "orange" | "gray"> = {
  "RE Admin": "red", "RE Accounts": "blue", "RE Sales Manager": "violet", "RE Sales Agent": "green", "RE Recovery Officer": "orange",
  "RE Society Manager": "amber", "RE Projects Manager": "blue", "RE Maintenance Staff": "gray", "RE Customer": "gray",
};
const short = (p: string) => p.replace(/^RE /, "");

export function UsersRolesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["rbac"], queryFn: () => get<Overview>("realestate.rbac.overview"), retry: false });
  const [filter, setFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["rbac"] });
  const setProfile = useMutation({
    mutationFn: (v: { user: string; profile: string }) => post("realestate.rbac.set_profile", v),
    onSuccess: (_r, v) => { toast.success(`${v.user} → ${short(v.profile)}`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setEnabled = useMutation({
    mutationFn: (v: { user: string; enabled: number }) => post("realestate.rbac.set_enabled", v),
    onSuccess: refresh, onError: (e: Error) => toast.error(e.message),
  });
  const users = useMemo(() => (data?.users ?? []).filter((u) => (!filter || u.profiles.includes(filter))
    && (!q || `${u.full_name} ${u.name}`.toLowerCase().includes(q.toLowerCase()))), [data, filter, q]);

  if (error) return <div className="p-6 text-sm text-red-600">{(error as Error).message}</div>;
  if (isLoading || !data) return <div className="space-y-3 p-6"><Skeleton className="h-32" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="size-6 text-primary" /> Users & roles</h1>
          <p className="text-sm text-muted-foreground">Each user gets one role profile; the server enforces what it may see and do</p>
        </div>
        <Button onClick={() => setAdding(true)}><UserPlus /> Add user</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.profiles.map((p) => (
          <button key={p.name} type="button" onClick={() => setFilter(filter === p.name ? "" : p.name)}
            className={cn("rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50", filter === p.name && "border-primary ring-2 ring-primary/30")}>
            <div className="flex items-center justify-between gap-2">
              <Badge tone={TONE[p.name] ?? "gray"}>{short(p.name)}</Badge>
              <span className="text-sm font-semibold tabular-nums">{data.counts[p.name] ?? 0} user{(data.counts[p.name] ?? 0) === 1 ? "" : "s"}</span>
            </div>
            <p className="mt-2 text-sm">{p.description}</p>
            <p className="mt-2 flex flex-wrap gap-1">{p.roles.map((r) => <span key={r} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{r}</span>)}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <p className="font-semibold">{filter ? `${short(filter)} users` : "All users"} <span className="text-sm font-normal text-muted-foreground">({users.length})</span></p>
          <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">User</th><th className="px-3">Profile</th><th className="hidden px-3 lg:table-cell">Roles</th><th className="hidden px-3 md:table-cell">Last login</th><th className="px-3 text-center">Active</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.name} className={cn("border-t", !u.enabled && "opacity-50")}>
                  <td className="px-3 py-2"><span className="flex items-center gap-2"><Avatar name={u.full_name || u.name} />
                    <span><span className="block font-medium">{u.full_name}</span><span className="block text-xs text-muted-foreground">{u.name}{u.user_type === "Website User" ? " · portal" : ""}</span></span></span></td>
                  <td className="px-3">
                    <Select aria-label={`Profile for ${u.name}`} className="h-8 w-48 text-xs" value={u.profiles.find((p) => p.startsWith("RE ")) ?? ""}
                      onChange={(e) => e.target.value && setProfile.mutate({ user: u.name, profile: e.target.value })}>
                      <option value="">— none —</option>
                      {data.profiles.map((p) => <option key={p.name} value={p.name}>{short(p.name)}</option>)}
                    </Select>
                  </td>
                  <td className="hidden max-w-md px-3 lg:table-cell"><span className="line-clamp-2 text-xs text-muted-foreground">{u.roles.join(", ") || "—"}</span></td>
                  <td className="hidden px-3 text-xs text-muted-foreground md:table-cell">{u.last_login ? dateTime(u.last_login) : "never"}</td>
                  <td className="px-3 text-center"><input type="checkbox" aria-label={`Active ${u.name}`} className="size-4" checked={Boolean(u.enabled)}
                    onChange={(e) => setEnabled.mutate({ user: u.name, enabled: e.target.checked ? 1 : 0 })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <AddUser open={adding} onClose={() => setAdding(false)} profiles={data.profiles} onDone={refresh} />
    </div>
  );
}

function AddUser({ open, onClose, profiles, onDone }: { open: boolean; onClose: () => void; profiles: Profile[]; onDone: () => void }) {
  const [v, setV] = useState({ email: "", first_name: "", last_name: "", mobile_no: "", profile: "RE Sales Agent", send_welcome: false });
  const save = useMutation({
    mutationFn: () => post<string>("realestate.rbac.add_user", { ...v, send_welcome: v.send_welcome ? 1 : 0 }),
    onSuccess: (u) => { toast.success(`${u} added`); onClose(); onDone(); setV({ ...v, email: "", first_name: "", last_name: "", mobile_no: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add user">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="au-first">First name</Label><Input id="au-first" required value={v.first_name} onChange={(e) => setV({ ...v, first_name: e.target.value })} /></div>
          <div><Label htmlFor="au-last">Last name</Label><Input id="au-last" value={v.last_name} onChange={(e) => setV({ ...v, last_name: e.target.value })} /></div>
          <div><Label htmlFor="au-email">Email</Label><Input id="au-email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
          <div><Label htmlFor="au-mob">Mobile</Label><Input id="au-mob" placeholder="0300-1234567" value={v.mobile_no} onChange={(e) => setV({ ...v, mobile_no: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="au-prof">Role profile</Label>
          <Select id="au-prof" value={v.profile} onChange={(e) => setV({ ...v, profile: e.target.value })}>{profiles.map((p) => <option key={p.name} value={p.name}>{short(p.name)} — {p.description}</option>)}</Select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.send_welcome} onChange={(e) => setV({ ...v, send_welcome: e.target.checked })} /> Send the welcome email (sets their password)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}Add user</Button></div>
      </form>
    </Dialog>
  );
}
