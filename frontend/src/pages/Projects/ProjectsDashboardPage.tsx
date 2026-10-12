import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, ListTodo, AlarmClock, CheckCircle2, Activity, Gauge } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { DonutChart, BarChart } from "@/components/charts/charts";
import { StatusBadge } from "@/components/common/status-badge";
import { PercentBar } from "@/components/common/percent-bar";
import { SectionCard } from "@/components/common/section-card";
import { KpiGrid } from "@/components/doc/dashboard-kit";
import { useAggregate, useDocList, useGroupCounts, avg } from "@/hooks/useDoc";
import { useServerDocCount } from "@/hooks/useServerTable";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatShortDate, todayISO, daysUntil } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

const TASK_OPEN = ["Open", "Working", "Pending Review", "Overdue"];

/** Projects overview: what is running, how far along, and what is late. */
export function ProjectsDashboardPage() {
  const { company } = useCompanyContext();
  const projects = useMemo(() => companyFilter(company), [company]);
  const tasks = useMemo<unknown[][]>(() => [["is_template", "=", 0]], []);

  const { counts: projectStatus } = useGroupCounts("Project", "status", projects);
  const { counts: taskStatus } = useGroupCounts("Task", "status", tasks);
  const { data: avgRows } = useAggregate("Project", { fields: [avg("percent_complete", "pct")], filters: [...projects, ["status", "=", "Open"]] });
  const { data: overdue } = useServerDocCount("Task", [...tasks, ["status", "in", TASK_OPEN], ["exp_end_date", "<", `${todayISO()} 00:00:00`]]);
  const { data: active } = useDocList("Project", {
    fields: ["name", "project_name", "status", "priority", "percent_complete", "expected_end_date"],
    filters: [...projects, ["status", "=", "Open"]],
    orderBy: { field: "expected_end_date", order: "asc" },
    limit: 6,
  });
  const { data: late } = useDocList("Task", {
    fields: ["name", "subject", "project", "status", "priority", "exp_end_date"],
    filters: [...tasks, ["status", "in", TASK_OPEN], ["exp_end_date", "<", `${todayISO()} 00:00:00`]],
    orderBy: { field: "exp_end_date", order: "asc" },
    limit: 6,
  });

  const openTasks = TASK_OPEN.reduce((s, k) => s + (taskStatus[k] ?? 0), 0);
  const totalTasks = Object.values(taskStatus).reduce((a, b) => a + b, 0);
  const done = taskStatus["Completed"] ?? 0;
  const projectData = Object.entries(projectStatus).filter(([s, n]) => s && n > 0).map(([label, value]) => ({ label, value }));
  const taskData = ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"].map((s) => ({ status: s, tasks: taskStatus[s] ?? 0 }));

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle="What is running, how far along it is, and what is late" icon={<FolderKanban className="h-5 w-5" />} />

      <KpiGrid
        items={[
          { label: "Active projects", value: (projectStatus["Open"] ?? 0).toLocaleString(), icon: <Activity className="h-4 w-4" />, tone: "sky" },
          { label: "Avg. completion", value: `${Math.round(asNumber(avgRows?.[0]?.pct))} %`, icon: <Gauge className="h-4 w-4" />, tone: "teal" },
          { label: "Open tasks", value: openTasks.toLocaleString(), icon: <ListTodo className="h-4 w-4" />, tone: "indigo" },
          { label: "Overdue tasks", value: (overdue ?? 0).toLocaleString(), icon: <AlarmClock className="h-4 w-4" />, tone: overdue ? "rose" : "slate" },
          { label: "Completed tasks", value: done.toLocaleString(), icon: <CheckCircle2 className="h-4 w-4" />, tone: "emerald" },
          { label: "Task completion", value: `${totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0} %`, icon: <Gauge className="h-4 w-4" />, tone: "amber" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Tasks by status" className="lg:col-span-2">
          {totalTasks ? <BarChart data={taskData} xKey="status" series={[{ key: "tasks", label: "Tasks" }]} height={260} /> : <p className="py-16 text-center text-sm text-muted-foreground">No tasks yet.</p>}
        </ChartCard>
        <ChartCard title="Projects by status">
          {projectData.length ? <DonutChart data={projectData} height={260} innerRadius="60%" /> : <p className="py-16 text-center text-sm text-muted-foreground">No projects yet.</p>}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Active projects"
          description="Soonest due first"
          actions={
            <Link to="/projects/list" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {(active ?? []).map((p) => (
              <li key={p.name} className="space-y-1.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/projects/list/${encodeURIComponent(p.name)}`} className="min-w-0 truncate text-sm font-medium hover:text-primary hover:underline">
                    {p.project_name || p.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">Due {formatShortDate(p.expected_end_date)}</span>
                </div>
                <PercentBar value={p.percent_complete} />
              </li>
            ))}
            {!(active ?? []).length && <li className="py-6 text-center text-sm text-muted-foreground">No active projects.</li>}
          </ul>
        </SectionCard>

        <SectionCard
          title="Overdue tasks"
          description="Past their end date and not finished"
          actions={
            <Link to="/projects/board" className="text-xs font-medium text-primary hover:underline">
              Open board
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {(late ?? []).map((t) => {
              const days = daysUntil(t.exp_end_date);
              return (
                <li key={t.name} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/projects/tasks/${encodeURIComponent(t.name)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                      {t.subject}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.project || "No project"} · {days !== null ? `${Math.abs(days)} d late` : ""}
                    </p>
                  </div>
                  <StatusBadge status={t.priority || "Medium"} />
                </li>
              );
            })}
            {!(late ?? []).length && <li className="py-6 text-center text-sm text-muted-foreground">Nothing is overdue.</li>}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
