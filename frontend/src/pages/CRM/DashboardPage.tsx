import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { LayoutGrid, HandCoins, CalendarClock, CheckSquare, Mail, Reply, Target } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { CrmDashboardWidgetCard } from "@/components/crm/CrmDashboardWidgetCard";
import { useCrmDashboard } from "@/hooks/useCrmDashboard";
import { useCrmManagement } from "@/hooks/useCrmManagement";
import { useCrmTasks, bucketCrmTasks } from "@/hooks/useCrmTasks";
import { useCrmEmailActivity } from "@/hooks/useCrmEmailActivity";
import { useMonthlyLeadTarget } from "@/hooks/useMonthlyLeadTarget";
import { useCrmReferenceLabels } from "@/hooks/useCrmReferenceLabels";
import { formatMoney } from "@/utils/currency";
import { formatDateTime, formatDate, startOfMonthISO, todayISO } from "@/utils/dates";
import type { FrappeEvent, CrmTask } from "@/types/frappe";

/**
 * This deployment is a donor/fundraising CRM (see the "Donations by
 * Fundraiser"-style relabeling in CrmDashboardWidgetCard) — this page mixes
 * the stock Frappe CRM app's own real backend-aggregated analytics
 * (`crm.api.dashboard.get_dashboard` — sales trend, funnel, deals by stage/
 * source/territory/salesperson, lost reasons, etc.) with a few
 * fundraising-specific widgets that endpoint doesn't cover: total funds
 * raised, a monthly prospect target, today's follow-ups, upcoming meetings,
 * and per-prospect email activity.
 */
export function CrmDashboardPage() {
  const { widgets, isLoading: widgetsLoading } = useCrmDashboard();
  const { target } = useMonthlyLeadTarget();
  const { referenceMap } = useCrmReferenceLabels();

  // Total funds raised — sum of Won deals' value. The dashboard endpoint only
  // gives an *average* won deal value, not a running total.
  const { data: wonDeals } = useFrappeGetDocList<{ deal_value?: number; expected_deal_value?: number; currency?: string }>(
    "CRM Deal",
    { fields: ["deal_value", "expected_deal_value", "currency"], filters: [["status", "=", "Won"]], limit: 5000 },
    "micromax.crm.dashboard.won-deals",
  );
  const totalRaised = useMemo(
    () => (wonDeals ?? []).reduce((sum, d) => sum + Number(d.deal_value ?? d.expected_deal_value ?? 0), 0),
    [wonDeals],
  );

  // Total prospects this month, for the target/achieved widget below.
  const { data: newLeadsThisMonth } = useFrappeGetDocList<{ name: string }>(
    "CRM Lead",
    { fields: ["name"], filters: [["creation", ">=", startOfMonthISO()]], limit: 5000 },
    "micromax.crm.dashboard.new-leads-month",
  );
  const achieved = (newLeadsThisMonth ?? []).length;
  const achievedPct = Math.round((achieved / target) * 100);

  // Upcoming meetings/reminders (core Event doctype, no CRM-specific calendar doctype exists).
  const { rows: upcomingEvents, isLoading: eventsLoading } = useCrmManagement<FrappeEvent>({
    doctype: "Event",
    fields: ["name", "subject", "event_category", "starts_on", "status"],
    filters: [
      ["starts_on", ">=", todayISO()],
      ["status", "=", "Open"],
    ],
    orderBy: { field: "starts_on", order: "asc" },
    limit: 8,
  });

  // Today's + overdue follow-ups, across every prospect (not scoped to one lead/deal).
  const { data: openTasks, isLoading: tasksLoading } = useCrmTasks({ status: ["Backlog", "Todo", "In Progress"], limit: 200 });
  const { overdue, dueToday } = useMemo(() => bucketCrmTasks(openTasks), [openTasks]);
  const todayAndOverdue = [...overdue, ...dueToday];

  // Per-prospect email activity — "mail received" vs "replied".
  const { rows: emailRows, totals: emailTotals, replyRate, isLoading: emailLoading } = useCrmEmailActivity();

  const numberWidgets = widgets.filter((w) => w.type === "number_chart");
  const chartWidgets = widgets.filter((w) => w.type === "axis_chart" || w.type === "donut_chart");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Fundraising pipeline analytics"
        icon={<LayoutGrid className="h-5 w-5" />}
      />

      {/* Hero: total funds raised */}
      <Card className="flex flex-col items-start gap-1 bg-gradient-to-br from-primary/10 to-transparent p-5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <HandCoins className="h-4 w-4" /> Total Funds Raised
        </span>
        <span className="text-3xl font-bold tabular-nums">{formatMoney(totalRaised)}</span>
        <span className="text-xs text-muted-foreground">{(wonDeals ?? []).length} closed donations, all time</span>
      </Card>

      {/* Stock CRM analytics — number cards */}
      {widgetsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {numberWidgets.map((w) => (
            <CrmDashboardWidgetCard key={w.name} widget={w} />
          ))}
        </div>
      )}

      {/* Monthly prospect target */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Target className="h-4 w-4 text-primary" /> Monthly Prospect Target
          </span>
          <Link to="/crm/leads" className="text-xs text-primary hover:underline">
            Manage leads
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="text-xl font-bold tabular-nums">{target}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Achieved</p>
            <p className="text-xl font-bold tabular-nums">{achieved}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Achieved %</p>
            <p className={`text-xl font-bold tabular-nums ${achievedPct >= 100 ? "text-emerald-600" : ""}`}>{achievedPct}%</p>
          </div>
        </div>
        <Progress value={achievedPct} className="mt-3" />
      </Card>

      {/* Stock CRM analytics — charts */}
      {widgetsLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {chartWidgets.map((w) => (
            <CrmDashboardWidgetCard key={w.name} widget={w} />
          ))}
        </div>
      )}

      {/* Upcoming Schedule + Today's Follow-ups */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-primary" /> Upcoming Schedule
            </span>
            <Link to="/crm/calendar" className="text-xs text-primary hover:underline">
              Open calendar
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {eventsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (upcomingEvents ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              (upcomingEvents ?? []).map((e) => (
                <div key={e.name} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.subject}</p>
                    <p className="text-xs text-muted-foreground">{e.event_category ?? "Event"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.starts_on)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <CheckSquare className="h-4 w-4 text-primary" /> Today's Follow-ups
            </span>
            <Link to="/crm/follow-ups" className="text-xs text-primary hover:underline">
              Open follow-ups
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {tasksLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : todayAndOverdue.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing due today — you're all caught up.</p>
            ) : (
              todayAndOverdue.slice(0, 8).map((t: CrmTask) => (
                <div key={t.name} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.due_date ? formatDateTime(t.due_date) : "—"}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Email activity per prospect */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Mail className="h-4 w-4 text-primary" /> Email Activity by Prospect
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <StatCard label="Received" value={emailTotals.received} icon={<Mail className="h-4 w-4" />} tone="sky" />
          <StatCard label="Replied" value={emailTotals.replied} icon={<Reply className="h-4 w-4" />} tone="emerald" />
          <StatCard label="Reply Rate" value={`${replyRate}%`} icon={<Reply className="h-4 w-4" />} tone="indigo" />
        </div>
        <div className="mt-4 overflow-x-auto">
          {emailLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : emailRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No email activity yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Prospect</th>
                  <th className="pb-2 text-right font-medium">Received</th>
                  <th className="pb-2 text-right font-medium">Replied</th>
                  <th className="pb-2 text-right font-medium">Reply Rate</th>
                  <th className="pb-2 text-right font-medium">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {emailRows.slice(0, 10).map((r) => {
                  const ref = referenceMap.get(r.referenceDocname);
                  // "Reply rate" only means something once there's something
                  // to reply to — with 0 received, `r.replied` is outbound-only
                  // outreach, not a reply, so "0%" would misleadingly read as
                  // "nobody replied" rather than "not applicable".
                  const rate = r.received > 0 ? `${Math.round((r.replied / r.received) * 100)}%` : "—";
                  const href = ref?.doctype === "CRM Deal" ? `/crm/deals/${encodeURIComponent(r.referenceDocname)}` : `/crm/leads/${encodeURIComponent(r.referenceDocname)}`;
                  return (
                    <tr key={r.referenceDocname} className="border-b border-border last:border-0">
                      <td className="py-2">
                        <Link to={href} className="font-medium text-primary hover:underline">
                          {ref?.label ?? r.referenceDocname}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.received}</td>
                      <td className="py-2 text-right tabular-nums">{r.replied}</td>
                      <td className="py-2 text-right tabular-nums">{rate}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">{r.lastActivity ? formatDate(r.lastActivity) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
