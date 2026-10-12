import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FileText, ImageIcon, Pencil, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { WhatsAppIcon } from "@/components/common/whatsapp-icon";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import {
  useCrmGeneralSettings,
  useWhatsAppAccountMutations,
  useWhatsAppAccounts,
  useWhatsAppDefaults,
  type CrmGeneralSettings,
  type CrmWhatsAppAccount,
  type CrmWhatsAppSettings,
} from "@/hooks/useCrmSettings";
import { humanizeError, uploadFile, fileURL } from "@/services/frappe";

function SettingsGroup({ icon, title, subtitle, actions, children }: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
          <div>
            <CardTitle>{title}</CardTitle>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Checkbox checked={checked} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5 shrink-0" />
    </div>
  );
}

/** Upload widget for a FCRM Settings image field (brand_logo/favicon — both plain "Attach" fields with no dedicated FrappeForm case yet). */
function LogoField({ label, value, docname, onUploaded }: {
  label: string;
  value?: string;
  docname: string;
  onUploaded: (fileUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, { doctype: "FCRM Settings", docname, isPrivate: false });
      onUploaded(uploaded.file_url);
      toast.success(`${label} updated`);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 py-2">
      {value ? (
        <img src={fileURL(value)} alt={label} className="h-12 w-12 shrink-0 rounded border border-border bg-white object-contain" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : value ? "Change" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

const emptyAccountForm = {
  account_name: "",
  status: "Active" as "Active" | "Inactive",
  phone_id: "",
  business_id: "",
  app_id: "",
  access_token: "",
  auto_read_receipts: false,
};

type AccountForm = typeof emptyAccountForm;

function accountToForm(account: CrmWhatsAppAccount): AccountForm {
  return {
    account_name: account.account_name ?? "",
    status: account.status === "Inactive" ? "Inactive" : "Active",
    phone_id: account.phone_id ?? "",
    business_id: account.business_id ?? "",
    app_id: account.app_id ?? "",
    access_token: "",
    auto_read_receipts: Boolean(account.auto_read_receipts),
  };
}

function WhatsAppAccountDialog({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: CrmWhatsAppAccount | null;
  onSaved: () => void;
}) {
  const { create, update, saving } = useWhatsAppAccountMutations();
  const [form, setForm] = useState<AccountForm>(editing ? accountToForm(editing) : emptyAccountForm);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever a different account (or "new") is opened.
  const [seededFor, setSeededFor] = useState(editing?.name ?? null);
  if (open && seededFor !== (editing?.name ?? null)) {
    setForm(editing ? accountToForm(editing) : emptyAccountForm);
    setSeededFor(editing?.name ?? null);
    setError(null);
  }

  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload: Partial<CrmWhatsAppAccount> = {
      account_name: form.account_name.trim(),
      status: form.status,
      phone_id: form.phone_id.trim(),
      business_id: form.business_id.trim(),
      app_id: form.app_id.trim(),
      auto_read_receipts: form.auto_read_receipts ? 1 : 0,
    };
    // Password field: only send it when the user actually typed a new one —
    // an empty string here means "leave the stored token alone", not "clear it".
    if (form.access_token.trim()) payload.access_token = form.access_token.trim();

    try {
      if (editing) {
        await update(editing.name, payload);
        toast.success("WhatsApp account updated");
      } else {
        await create(payload);
        toast.success("WhatsApp account added");
      }
      onSaved();
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit WhatsApp account" : "Add WhatsApp account"}
      description="Meta WhatsApp Business Cloud API credentials for this number."
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="account_name" required>Account name</Label>
            <Input
              id="account_name"
              value={form.account_name}
              onChange={(e) => set("account_name", e.target.value)}
              placeholder="e.g. Support Line"
              required
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={form.status} onChange={(e) => set("status", e.target.value as AccountForm["status"])}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="phone_id" required>Phone number ID</Label>
            <Input id="phone_id" value={form.phone_id} onChange={(e) => set("phone_id", e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="business_id">WhatsApp Business Account ID</Label>
            <Input id="business_id" value={form.business_id} onChange={(e) => set("business_id", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="app_id">Meta App ID</Label>
            <Input id="app_id" value={form.app_id} onChange={(e) => set("app_id", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="access_token">
              Access token{editing && <span className="ml-1 font-normal normal-case text-muted-foreground">(leave blank to keep current)</span>}
            </Label>
            <Input
              id="access_token"
              type="password"
              value={form.access_token}
              onChange={(e) => set("access_token", e.target.value)}
              placeholder={editing ? "••••••••" : ""}
              autoComplete="new-password"
              required={!editing}
            />
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border p-3">
          <Checkbox
            label="Auto-mark incoming messages as read"
            checked={form.auto_read_receipts}
            onChange={(e) => set("auto_read_receipts", e.target.checked)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {editing ? "Save changes" : "Add account"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function WhatsAppSection() {
  const { accounts, error, isLoading, mutate } = useWhatsAppAccounts();
  const { settings: defaults, isLoading: defaultsLoading, save: saveDefaults } = useWhatsAppDefaults();
  const { remove, deleting } = useWhatsAppAccountMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmWhatsAppAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmWhatsAppAccount | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (account: CrmWhatsAppAccount) => {
    setEditing(account);
    setDialogOpen(true);
  };

  const onSaved = () => {
    setDialogOpen(false);
    void mutate();
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.name);
      toast.success("WhatsApp account removed");
      setDeleteTarget(null);
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const onDefaultsChange = async (values: Partial<CrmWhatsAppSettings>) => {
    try {
      await saveDefaults(values);
      toast.success("Updated");
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <SettingsGroup
      icon={<WhatsAppIcon className="h-4 w-4" />}
      title="WhatsApp"
      subtitle="Meta WhatsApp Business accounts used for CRM messaging"
      actions={
        <Button variant="primary" size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add account
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void mutate()} />
      ) : accounts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No WhatsApp accounts configured yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {accounts.map((account) => (
            <div key={account.name} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{account.account_name || account.name}</p>
                  <Badge variant={account.status === "Active" ? "success" : "secondary"}>{account.status ?? "Active"}</Badge>
                  {defaults?.default_account === account.name && (
                    <Badge variant="outline"><Star className="h-3 w-3" /> Default</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">Phone ID: {account.phone_id || "—"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(account)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(account)} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!defaultsLoading && defaults && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {accounts.length > 0 && (
            <div>
              <Label htmlFor="default_account">Default account</Label>
              <Select
                id="default_account"
                value={defaults.default_account ?? ""}
                onChange={(e) => void onDefaultsChange({ default_account: e.target.value || undefined })}
              >
                <option value="">— None —</option>
                {accounts.map((a) => (
                  <option key={a.name} value={a.name}>{a.account_name || a.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="whatsapp_api_url">API URL</Label>
              <Input
                id="whatsapp_api_url"
                value={defaults.whatsapp_api_url ?? ""}
                onChange={(e) => void onDefaultsChange({ whatsapp_api_url: e.target.value })}
                placeholder="https://graph.facebook.com"
              />
            </div>
            <div>
              <Label htmlFor="whatsapp_api_version">API version</Label>
              <Input
                id="whatsapp_api_version"
                value={defaults.whatsapp_api_version ?? ""}
                onChange={(e) => void onDefaultsChange({ whatsapp_api_version: e.target.value })}
                placeholder="v20.0"
              />
            </div>
            <div>
              <Label htmlFor="webhook_verify_token">Webhook verify token</Label>
              <Input
                id="webhook_verify_token"
                value={defaults.webhook_verify_token ?? ""}
                onChange={(e) => void onDefaultsChange({ webhook_verify_token: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="webhook_secret">Webhook secret</Label>
              <Input
                id="webhook_secret"
                type="password"
                value={defaults.webhook_secret ?? ""}
                onChange={(e) => void onDefaultsChange({ webhook_secret: e.target.value })}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>
      )}

      <WhatsAppAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} onSaved={onSaved} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove WhatsApp account?"
        description={`"${deleteTarget?.account_name || deleteTarget?.name}" will stop sending and receiving messages immediately.`}
        confirmLabel="Remove"
        destructive
        loading={deleting}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </SettingsGroup>
  );
}

function GeneralSection() {
  const { settings, isLoading, error, mutate, save } = useCrmGeneralSettings();

  const set = async (values: Partial<CrmGeneralSettings>) => {
    try {
      await save(values);
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !settings) return <ErrorState error={error} onRetry={() => void mutate()} />;

  return (
    <SettingsGroup icon={<Settings2 className="h-4 w-4" />} title="General" subtitle="Defaults that apply across the CRM app">
      <div className="divide-y divide-border">
        <ToggleRow
          label="Enable forecasting"
          description="Makes a deal's expected closure date and value mandatory, for accurate forecasting."
          checked={Boolean(settings.enable_forecasting)}
          onToggle={(v) => void set({ enable_forecasting: v ? 1 : 0 })}
        />
        <ToggleRow
          label="Enable sales hierarchy permissions"
          description="Restricts lead/deal visibility to the sales hierarchy tree — managers see reports' records too."
          checked={Boolean(settings.enable_sales_hierarchy)}
          onToggle={(v) => void set({ enable_sales_hierarchy: v ? 1 : 0 })}
        />
        <ToggleRow
          label="Auto-update expected deal value"
          description="Recalculates a deal's expected value from its line-item products."
          checked={Boolean(settings.auto_update_expected_deal_value)}
          onToggle={(v) => void set({ auto_update_expected_deal_value: v ? 1 : 0 })}
        />
        <ToggleRow
          label="Update timestamp on new communication"
          description="Bumps a lead/deal's modified time whenever a new email or comment lands."
          checked={Boolean(settings.update_timestamp_on_new_communication)}
          onToggle={(v) => void set({ update_timestamp_on_new_communication: v ? 1 : 0 })}
        />
        <ToggleRow
          label="Mark lead/deal as replied on response"
          description="Sets communication status to Replied automatically. Only applies when SLA is enabled."
          checked={Boolean(settings.auto_mark_replied_on_response)}
          onToggle={(v) => void set({ auto_mark_replied_on_response: v ? 1 : 0 })}
        />
        <ToggleRow
          label="Reopen lead/deal on new communication"
          description="Sets communication status back to Open on new activity. Only applies when SLA is enabled."
          checked={Boolean(settings.auto_reopen_on_new_communication)}
          onToggle={(v) => void set({ auto_reopen_on_new_communication: v ? 1 : 0 })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="timeline_format">Timeline timestamp format</Label>
          <Select
            id="timeline_format"
            value={settings.crm_timeline_timestamp_format ?? "Relative"}
            onChange={(e) => void set({ crm_timeline_timestamp_format: e.target.value as CrmGeneralSettings["crm_timeline_timestamp_format"] })}
          >
            <option value="Relative">Relative</option>
            <option value="Exact">Exact</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="timeline_sort">Timeline sort order</Label>
          <Select
            id="timeline_sort"
            value={settings.crm_timeline_sort_order ?? "Oldest First"}
            onChange={(e) => void set({ crm_timeline_sort_order: e.target.value as CrmGeneralSettings["crm_timeline_sort_order"] })}
          >
            <option value="Oldest First">Oldest First</option>
            <option value="Newest First">Newest First</option>
          </Select>
        </div>
      </div>
    </SettingsGroup>
  );
}

function BrandingSection() {
  const { settings, isLoading, error, mutate, save } = useCrmGeneralSettings();

  const set = async (values: Partial<CrmGeneralSettings>) => {
    try {
      await save(values);
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error || !settings) return <ErrorState error={error} onRetry={() => void mutate()} />;

  return (
    <SettingsGroup icon={<ImageIcon className="h-4 w-4" />} title="Branding" subtitle="Shown in the CRM's own header/tab, separate from the wider app's branding">
      <div className="py-2">
        <Label htmlFor="brand_name">Brand name</Label>
        <Input
          id="brand_name"
          value={settings.brand_name ?? ""}
          onChange={(e) => void set({ brand_name: e.target.value })}
          placeholder="e.g. MicroMax CRM"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-border pt-2 sm:grid-cols-2">
        <LogoField label="Logo" value={settings.brand_logo} docname={settings.name} onUploaded={(url) => void set({ brand_logo: url })} />
        <LogoField label="Favicon" value={settings.favicon} docname={settings.name} onUploaded={(url) => void set({ favicon: url })} />
      </div>
    </SettingsGroup>
  );
}

function CurrencySection() {
  const { settings, isLoading, error, mutate, save } = useCrmGeneralSettings();

  const set = async (values: Partial<CrmGeneralSettings>) => {
    try {
      await save(values);
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error || !settings) return <ErrorState error={error} onRetry={() => void mutate()} />;

  return (
    <SettingsGroup icon={<Settings2 className="h-4 w-4" />} title="Currency" subtitle="Default currency and the exchange-rate provider used for multi-currency deals">
      <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="crm_currency">Currency</Label>
          <FrappeLinkField
            meta={{ fieldname: "currency", fieldtype: "Link", options: "Currency", label: "Currency" }}
            value={settings.currency ?? ""}
            onChange={(v) => void set({ currency: v })}
          />
        </div>
        <div>
          <Label htmlFor="service_provider">Exchange rate provider</Label>
          <Select
            id="service_provider"
            value={settings.service_provider ?? "frankfurter.app"}
            onChange={(e) => void set({ service_provider: e.target.value as CrmGeneralSettings["service_provider"] })}
          >
            <option value="frankfurter.app">frankfurter.app</option>
            <option value="fawazahmed-exchange-api">fawazahmed-exchange-api</option>
            <option value="exchangerate.host">exchangerate.host</option>
            <option value="exchangerate-api">exchangerate-api</option>
          </Select>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <Label htmlFor="access_key">Access key</Label>
        <Input
          id="access_key"
          type="password"
          value={settings.access_key ?? ""}
          onChange={(e) => void set({ access_key: e.target.value })}
          placeholder="Required by some providers, e.g. exchangerate-api"
          autoComplete="new-password"
        />
      </div>
    </SettingsGroup>
  );
}

function TemplatesSection() {
  return (
    <SettingsGroup icon={<FileText className="h-4 w-4" />} title="Templates" subtitle="Reusable boilerplate for mail and contracts">
      <div className="divide-y divide-border">
        <Link to="/crm/email-templates" className="flex items-center justify-between gap-4 py-3 hover:text-primary">
          <div className="min-w-0">
            <p className="text-sm font-medium">Email Templates</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Subject/body pairs available from the Lead/Deal compose box</p>
          </div>
        </Link>
        <Link to="/crm/contract-templates" className="flex items-center justify-between gap-4 py-3 hover:text-primary">
          <div className="min-w-0">
            <p className="text-sm font-medium">Contract Templates</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Terms &amp; conditions boilerplate available from the Contracts "Load from Template" picker</p>
          </div>
        </Link>
      </div>
    </SettingsGroup>
  );
}

export function CrmSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="CRM Settings"
        subtitle="WhatsApp connections and general CRM defaults — System Manager only"
        icon={<Settings2 className="h-5 w-5" />}
      />
      <div className="grid grid-cols-1 gap-4 max-w-3xl">
        <WhatsAppSection />
        <GeneralSection />
        <CurrencySection />
        <BrandingSection />
        <TemplatesSection />
      </div>
    </div>
  );
}
