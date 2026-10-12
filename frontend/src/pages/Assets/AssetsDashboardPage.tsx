import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Building2, Coins, TrendingDown, Percent, Wrench, MapPin } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { DonutChart, BarChart } from "@/components/charts/charts";
import { StatusBadge } from "@/components/common/status-badge";
import { SectionCard } from "@/components/common/section-card";
import { KpiGrid, BarList } from "@/components/doc/dashboard-kit";
import { useAggregate, useDocList, useGroupCounts, count, sum } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { formatDateTime } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

/** Asset register overview: what we own, what it cost, what it is worth now, and what needs attention. */
export function AssetsDashboardPage() {
  const { company } = useCompanyContext();
  const base = useMemo(() => [...companyFilter(company), ["docstatus", "<", 2]], [company]);
  const live = useMemo(() => [...companyFilter(company), ["docstatus", "=", 1]], [company]);

  const { data: totals } = useAggregate("Asset", { fields: [count("name", "n"), sum("total_asset_cost", "cost"), sum("value_after_depreciation", "book")], filters: live });
  const { counts: byStatus } = useGroupCounts("Asset", "status", base);
  const { data: byCategory } = useAggregate("Asset", { fields: ["asset_category", count("name", "n"), sum("total_asset_cost", "cost")], filters: base, groupBy: "asset_category" });
  const { data: byLocation } = useAggregate("Asset", { fields: ["location", count("name", "n")], filters: base, groupBy: "location" });
  const { data: attention } = useDocList("Asset", {
    fields: ["name", "asset_name", "status", "location"],
    filters: [...base, ["status", "in", ["Out of Order", "In Maintenance", "Issue"]]],
    limit: 8,
  });
  const { data: movements } = useDocList("Asset Movement", {
    fields: ["name", "purpose", "transaction_date", "docstatus"],
    filters: [...companyFilter(company), ["docstatus", "<", 2]],
    orderBy: { field: "transaction_date", order: "desc" },
    limit: 6,
  });
  const { data: repairs } = useAggregate("Asset Repair", { fields: [count("name", "n"), sum("total_repair_cost", "cost")], filters: [["docstatus", "<", 2]] });

  const cost = asNumber(totals?.[0]?.cost);
  const book = asNumber(totals?.[0]?.book);
  const assetCount = asNumber(totals?.[0]?.n);
  const depreciated = Math.max(0, cost - book);
  const issues = (byStatus["Out of Order"] ?? 0) + (byStatus["In Maintenance"] ?? 0) + (byStatus["Issue"] ?? 0);

  const statusData = Object.entries(byStatus).filter(([s, n]) => s && n > 0).map(([label, value]) => ({ label, value }));
  const categories = [...(byCategory ?? [])].map((c) => ({ label: c.asset_category || "Uncategorised", cost: asNumber(c.cost), n: asNumber(c.n) })).sort((a, b) => b.cost - a.cost);
  const locations = [...(byLocation ?? [])].sort((a, b) => asNumber(b.n) - asNumber(a.n)).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" subtitle="Fixed asset register — cost, book value, depreciation and condition" icon={<Building2 className="h-5 w-5" />} />

      <KpiGrid
        items={[
          { label: "Assets in service", value: assetCount.toLocaleString(), icon: <Building2 className="h-4 w-4" />, tone: "sky" },
          { label: "Gross cost", value: compactNumber(cost), icon: <Coins className="h-4 w-4" />, tone: "indigo" },
          { label: "Book value", value: compactNumber(book), icon: <Coins className="h-4 w-4" />, tone: "emerald" },
          { label: "Depreciated", value: compactNumber(depreciated), icon: <TrendingDown className="h-4 w-4" />, tone: "amber" },
          { label: "% depreciated", value: `${cost > 0 ? Math.round((depreciated / cost) * 100) : 0} %`, icon: <Percent className="h-4 w-4" />, tone: "teal" },
          { label: "Need attention", value: issues.toLocaleString(), icon: <Wrench className="h-4 w-4" />, tone: issues ? "rose" : "slate" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Cost by category" subtitle="Gross cost of assets in service" className="lg:col-span-2">
          {categories.length ? (
            <BarChart data={categories.slice(0, 10)} xKey="label" series={[{ key: "cost", label: "Cost" }]} money currency="PKR" height={280} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No assets yet.</p>
          )}
        </ChartCard>
        <ChartCard title="Assets by status">
          {statusData.length ? <DonutChart data={statusData} height={280} innerRadius="60%" /> : <p className="py-16 text-center text-sm text-muted-foreground">No assets yet.</p>}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Where they are" description="Assets per location, top 8">
          <BarList rows={locations.map((l) => ({ label: l.location || "No location", value: asNumber(l.n) }))} format={(v) => `${v} assets`} tone="bg-sky-500" />
        </SectionCard>

        <SectionCard title="Needs attention" description="Out of order, in maintenance or with an issue" actions={<MapPin className="h-4 w-4 text-muted-foreground" />}>
          <ul className="divide-y divide-border">
            {(attention ?? []).map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link to={`/asset-management/register/${encodeURIComponent(a.name)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                    {a.asset_name || a.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.name} · {a.location || "—"}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
            {!(attention ?? []).length && <li className="py-6 text-center text-sm text-muted-foreground">Everything is in working order.</li>}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent movements"
          actions={
            <Link to="/asset-management/movements" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {(movements ?? []).map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link to={`/asset-management/movements/${encodeURIComponent(m.name)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                    {m.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDateTime(m.transaction_date)}</p>
                </div>
                <StatusBadge status={m.purpose} />
              </li>
            ))}
            {!(movements ?? []).length && <li className="py-6 text-center text-sm text-muted-foreground">No movements yet.</li>}
          </ul>
        </SectionCard>
      </div>

      <p className="text-xs text-muted-foreground">
        {asNumber(repairs?.[0]?.n).toLocaleString()} repair{asNumber(repairs?.[0]?.n) === 1 ? "" : "s"} on record · {formatMoney(asNumber(repairs?.[0]?.cost))} total repair cost
      </p>
    </div>
  );
}
