import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users2, Crown, Banknote, CircleSlash } from "lucide-react";
import { CrmManagementPage, countStat, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { SectionCard } from "@/components/common/section-card";
import { BarList } from "@/components/doc/dashboard-kit";
import { useAggregate, useDocList, count, sum } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { formatDate, startOfMonthISO, todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

interface DepartmentRow {
  name: string;
  department_name?: string;
  parent_department?: string;
  company?: string;
  is_group?: number;
  disabled?: number;
}

const label = (name: string) => name.replace(/ - [A-Z0-9]{2,6}$/, "");

/** One bar per department, split male / female / other, scaled to the largest department. */
function GenderSplitList({ rows }: { rows: { dept: string; male: number; female: number; other: number }[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No active employees yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.male + r.female + r.other));
  const seg = [
    { k: "male" as const, c: "bg-sky-500", l: "Male" },
    { k: "female" as const, c: "bg-pink-500", l: "Female" },
    { k: "other" as const, c: "bg-slate-400", l: "Other / not set" },
  ];
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((r) => {
          const total = r.male + r.female + r.other;
          return (
            <li key={r.dept} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{r.dept}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{total}</span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(4, (total / max) * 100)}%` }}>
                {seg.map((x) => (r[x.k] ? <div key={x.k} className={x.c} style={{ width: `${(r[x.k] / total) * 100}%` }} title={`${x.l}: ${r[x.k]}`} /> : null))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
        {seg.map((x) => (
          <span key={x.k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${x.c}`} />{x.l}</span>
        ))}
      </div>
    </div>
  );
}

/** Per-department figures for the list and the insight cards. */
function useDepartmentInsights(company?: string) {
  const co = useMemo(() => companyFilter(company), [company]);
  const active = useMemo(() => [...co, ["status", "=", "Active"]], [co]);
  const { data: heads } = useAggregate("Employee", { fields: ["department", count("name", "n")], filters: active, groupBy: "department" });
  const { data: genders } = useAggregate("Employee", { fields: ["department", "gender", count("name", "n")], filters: active, groupBy: "department, gender" });

  // Latest payroll month with submitted slips → gross pay per department for that month.
  const { data: latest } = useDocList("Salary Slip", {
    fields: ["start_date"],
    filters: [...co, ["docstatus", "=", 1]],
    orderBy: { field: "start_date", order: "desc" },
    limit: 1,
  });
  const payMonth = latest?.[0]?.start_date as string | undefined;
  const { data: pay } = useAggregate("Salary Slip", {
    fields: ["department", sum("base_gross_pay", "gross"), count("name", "n")],
    filters: [...co, ["docstatus", "=", 1], ["start_date", "=", payMonth ?? ""]],
    groupBy: "department",
    enabled: Boolean(payMonth),
  });

  const attFilters = useMemo(() => [...co, ["docstatus", "=", 1], ["attendance_date", ">=", startOfMonthISO()], ["attendance_date", "<=", todayISO()]], [co]);
  // Attendance.department is often blank (not fetched on older records) — attribute by the employee's current department.
  const { data: att } = useAggregate("Attendance", { fields: ["employee", "status", count("name", "n")], filters: attFilters, groupBy: "employee, status" });
  const { data: empDept } = useDocList("Employee", { fields: ["name", "department"], filters: active, limit: 20000 });

  return useMemo(() => {
    const headcount: Record<string, number> = {};
    (heads ?? []).forEach((r) => (headcount[r.department ?? ""] = asNumber(r.n)));
    const gender: Record<string, { male: number; female: number; other: number }> = {};
    (genders ?? []).forEach((r) => {
      const g = (gender[r.department ?? ""] ??= { male: 0, female: 0, other: 0 });
      if (r.gender === "Male") g.male += asNumber(r.n);
      else if (r.gender === "Female") g.female += asNumber(r.n);
      else g.other += asNumber(r.n);
    });
    const payroll: Record<string, number> = {};
    (pay ?? []).forEach((r) => (payroll[r.department ?? ""] = asNumber(r.gross)));
    const deptOf: Record<string, string> = Object.fromEntries((empDept ?? []).map((e) => [e.name, e.department ?? ""]));
    const attendance: Record<string, { present: number; total: number }> = {};
    (att ?? []).forEach((r) => {
      if (!(r.employee in deptOf)) return; // left / other company
      const a = (attendance[deptOf[r.employee]] ??= { present: 0, total: 0 });
      const n = asNumber(r.n);
      a.total += n;
      if (r.status === "Present" || r.status === "Work From Home") a.present += n;
      else if (r.status === "Half Day") a.present += n / 2;
    });
    return { headcount, gender, payroll, attendance, payMonth };
  }, [heads, genders, pay, att, empDept, payMonth]);
}

export default function DepartmentsPage() {
  const { company, companyCurrency } = useCompanyContext();
  const navigate = useNavigate();
  const ins = useDepartmentInsights(company);
  const currency = companyCurrency ?? "PKR";

  const insights = useMemo(() => {
    const depts = Object.entries(ins.headcount).sort((a, b) => b[1] - a[1]);
    const genderData = depts.slice(0, 8).map(([d]) => ({
      dept: d ? label(d) : "Not set",
      male: ins.gender[d]?.male ?? 0,
      female: ins.gender[d]?.female ?? 0,
      other: ins.gender[d]?.other ?? 0,
    }));
    const payRows = Object.entries(ins.payroll).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const attRows = Object.entries(ins.attendance)
      .filter(([, a]) => a.total > 0)
      .map(([d, a]) => ({ d, rate: (a.present / a.total) * 100, total: a.total }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8);
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Headcount & gender by department" description="Active employees, largest departments first">
          <GenderSplitList rows={genderData} />
        </SectionCard>
        <SectionCard title="Payroll cost by department" description={ins.payMonth ? `Gross pay, payroll month of ${formatDate(ins.payMonth, { month: "long", year: "numeric", day: undefined })}` : "No submitted salary slips yet"}>
          <BarList
            rows={payRows.map(([d, v]) => ({ label: d ? label(d) : "Not set", value: v, hint: ins.headcount[d] ? `${formatMoney(v / ins.headcount[d], currency, { compact: true })} per head` : undefined }))}
            format={(v) => formatMoney(v, currency, { compact: true })}
            tone="bg-indigo-500"
            empty="No payroll processed yet."
          />
        </SectionCard>
        <SectionCard title="Attendance this month" description="Lowest attendance rate first — present ÷ marked days, half days count ½">
          <BarList
            rows={attRows.map((r) => ({ label: r.d ? label(r.d) : "Not set", value: Math.round(r.rate * 10) / 10, hint: `${r.total} attendance records` }))}
            format={(v) => `${v}%`}
            tone="bg-emerald-500"
            empty="No attendance marked this month."
          />
        </SectionCard>
      </div>
    );
  }, [ins, currency]);

  const columns: ColumnDef<DepartmentRow>[] = useMemo(
    () => [
      { key: "parent_department", label: "Parent", getValue: (r) => (r.parent_department ? label(r.parent_department) : "") },
      { key: "headcount", label: "Headcount", align: "right", getValue: (r) => ins.headcount[r.name] ?? 0, render: (r) => <span className="text-sm font-medium tabular-nums">{ins.headcount[r.name] ?? 0}</span> },
      {
        key: "gender",
        label: "M / F",
        align: "right",
        getValue: (r) => `${ins.gender[r.name]?.male ?? 0} / ${ins.gender[r.name]?.female ?? 0}`,
        render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{ins.gender[r.name]?.male ?? 0} / {ins.gender[r.name]?.female ?? 0}</span>,
      },
      {
        key: "attendance",
        label: "Attendance (month)",
        align: "right",
        getValue: (r) => {
          const a = ins.attendance[r.name];
          return a?.total ? Math.round((a.present / a.total) * 100) : null;
        },
        render: (r) => {
          const a = ins.attendance[r.name];
          if (!a?.total) return <span className="text-sm text-muted-foreground">—</span>;
          const pct = Math.round((a.present / a.total) * 100);
          return <span className={`text-sm font-medium tabular-nums ${pct < 80 ? "text-rose-600" : pct < 90 ? "text-amber-600" : "text-emerald-600"}`}>{pct}%</span>;
        },
      },
      {
        key: "payroll",
        label: "Gross pay (last run)",
        align: "right",
        getValue: (r) => ins.payroll[r.name] ?? 0,
        render: (r) => <span className="text-sm tabular-nums">{ins.payroll[r.name] ? formatMoney(ins.payroll[r.name], currency) : "—"}</span>,
      },
      { key: "disabled", label: "Status", render: (r) => <span className={`text-xs font-medium ${r.disabled ? "text-muted-foreground" : "text-emerald-600"}`}>{r.disabled ? "Disabled" : "Active"}</span> },
    ],
    [ins, currency],
  );

  const config: CrmManagementConfig<DepartmentRow> = useMemo(
    () => ({
      title: "Departments",
      subtitle: "Organizational departments — headcount, attendance and payroll cost at a glance",
      icon: <Building2 className="h-5 w-5" />,
      doctype: "Department",
      fields: ["name", "department_name", "parent_department", "company", "is_group", "disabled"],
      filters: companyFilter(company),
      formFields: [
        { fieldname: "department_name", label: "Department Name", fieldtype: "Data", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "parent_department", label: "Parent Department", fieldtype: "Link", options: "Department" },
        { fieldname: "is_group", label: "Is Group", fieldtype: "Check" },
        { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
      ],
      defaults: { company },
      kanbanField: "parent_department",
      searchField: "department_name",
      statusField: "parent_department",
      columns,
      exportFilename: "departments",
      insights,
      stats: (rows) => {
        const sized = rows.map((r) => ({ r, n: ins.headcount[r.name] ?? 0 }));
        const largest = [...sized].sort((a, b) => b.n - a.n)[0];
        const staffed = sized.filter((x) => x.n > 0);
        const totalHeads = staffed.reduce((s, x) => s + x.n, 0);
        const totalPay = rows.reduce((s, r) => s + (ins.payroll[r.name] ?? 0), 0);
        return [
          countStat(rows, { label: "Departments", icon: <Building2 className="h-4 w-4" />, tone: "sky", clear: true }),
          { label: "Active employees", value: totalHeads, icon: <Users2 className="h-4 w-4" />, tone: "emerald", valueSuffix: staffed.length ? `avg ${Math.round(totalHeads / staffed.length)} / dept` : undefined },
          { label: "Largest", value: largest?.n ? label(largest.r.department_name || largest.r.name) : "—", icon: <Crown className="h-4 w-4" />, tone: "amber", valueSuffix: largest?.n ? `${largest.n}` : undefined },
          { label: "Payroll (last run)", value: compactNumber(totalPay), icon: <Banknote className="h-4 w-4" />, tone: "indigo" },
          countStat(rows, { label: "No employees", icon: <CircleSlash className="h-4 w-4" />, tone: "rose", predicate: (r) => !r.is_group && !(ins.headcount[r.name] ?? 0) }),
        ];
      },
      rowName: (r) => r.department_name || r.name,
      rowSubtitle: (r) => `${ins.headcount[r.name] ?? 0} active employees${r.parent_department ? ` · under ${label(r.parent_department)}` : ""}`,
      onOpen: (r) => navigate(`/hr/employees?department=${encodeURIComponent(r.name)}`),
      emptyTitle: "No departments",
      emptyDescription: "Add your first department",
      newLabel: "New Department",
    }),
    [company, columns, insights, ins, navigate],
  );

  return <CrmManagementPage config={config} />;
}
