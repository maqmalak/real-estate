import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useUserMutations } from "@/hooks/useUsers";
import { useRoles } from "@/hooks/useRoles";
import { humanizeError } from "@/services/frappe";

export function UserFormPage() {
  const navigate = useNavigate();
  const { data: roles } = useRoles();
  const { createUser, loading } = useUserMutations();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const user = await createUser({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        send_welcome_email: sendWelcomeEmail,
        roles: [...selectedRoles],
      });
      toast.success("User created");
      navigate(`/admin/users/${encodeURIComponent(user.name)}`);
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="New User" subtitle="Create a system user and assign roles" />
      <Card className="max-w-2xl">
        <CardContent className="pt-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="email" required>
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane.doe@company.com"
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="first_name" required>
                  First Name
                </Label>
                <Input
                  id="first_name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <Checkbox
              label="Send welcome email with password setup link"
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
            />

            <div>
              <Label>Roles</Label>
              <div className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-border p-3 scrollbar-thin sm:grid-cols-2">
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
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/admin/users")}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={loading}>
                Create User
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
