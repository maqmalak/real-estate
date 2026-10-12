import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { Bell, Mail } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { useNotificationSettings, type NotificationSettingsDoc } from "@/hooks/useNotificationSettings";
import { humanizeError } from "@/services/frappe";

function SettingRow({
  fieldname,
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  fieldname: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={fieldname} className="text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Checkbox
        id={fieldname}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

function SettingsGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border pt-0">{children}</CardContent>
    </Card>
  );
}

export function NotificationsPage() {
  const { settings, isLoading, error, mutate, save } = useNotificationSettings();

  const toggle = async (field: keyof NotificationSettingsDoc, checked: boolean) => {
    try {
      await save({ [field]: checked ? 1 : 0 });
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }
  if (error || !settings) {
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  }

  const emailMasterOn = Boolean(settings.enable_email_notifications ?? 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Alert preferences and email digests — applies to this account only"
        icon={<Bell className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 gap-4 max-w-2xl">
        <SettingsGroup icon={<Bell className="h-4 w-4" />} title="In-app">
          <SettingRow
            fieldname="enabled"
            label="Enable in-app notifications"
            description="Powers the bell in the top bar — CRM follow-up/reminder alerts, mentions, and assignments. Turning this off stops all of them, including the CRM calendar reminder job."
            checked={Boolean(settings.enabled ?? 1)}
            onToggle={(v) => void toggle("enabled", v)}
          />
        </SettingsGroup>

        <SettingsGroup icon={<Mail className="h-4 w-4" />} title="Email">
          <SettingRow
            fieldname="enable_email_notifications"
            label="Enable email notifications"
            description="Master switch for every email notification below."
            checked={emailMasterOn}
            onToggle={(v) => void toggle("enable_email_notifications", v)}
          />
          <SettingRow
            fieldname="enable_email_mention"
            label="Mentions"
            description="Email me when someone @mentions me in a comment."
            checked={Boolean(settings.enable_email_mention ?? 1)}
            disabled={!emailMasterOn}
            onToggle={(v) => void toggle("enable_email_mention", v)}
          />
          <SettingRow
            fieldname="enable_email_assignment"
            label="Assignments"
            description="Email me when a document is assigned to me."
            checked={Boolean(settings.enable_email_assignment ?? 1)}
            disabled={!emailMasterOn}
            onToggle={(v) => void toggle("enable_email_assignment", v)}
          />
          <SettingRow
            fieldname="enable_email_event_reminders"
            label="Calendar event reminders"
            description="Daily digest email listing the day's scheduled meetings/reminders from the CRM calendar."
            checked={Boolean(settings.enable_email_event_reminders ?? 1)}
            disabled={!emailMasterOn}
            onToggle={(v) => void toggle("enable_email_event_reminders", v)}
          />
          <SettingRow
            fieldname="enable_email_share"
            label="Document shares"
            description="Email me when a document is shared with me."
            checked={Boolean(settings.enable_email_share ?? 1)}
            disabled={!emailMasterOn}
            onToggle={(v) => void toggle("enable_email_share", v)}
          />
          <SettingRow
            fieldname="enable_email_threads_on_assigned_document"
            label="Email threads on assigned documents"
            description="Include me on email threads for documents assigned to me."
            checked={Boolean(settings.enable_email_threads_on_assigned_document ?? 1)}
            disabled={!emailMasterOn}
            onToggle={(v) => void toggle("enable_email_threads_on_assigned_document", v)}
          />
        </SettingsGroup>
      </div>
    </div>
  );
}
