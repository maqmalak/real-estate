import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  Ship,
  FileText,
  AlertTriangle,
  Package,
  Factory,
  Container,
  Landmark,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, PieChart, DonutChart, LineChart } from "@/components/charts/charts";
import { KpiCard } from "./KpiCard";
import { AnalyticsTabs } from "@/pages/Analytics/analytics-kit";
import { useSalesOrders } from "@/hooks/useSalesOrders";
import { useLCProformas, lcStatusDistribution } from "@/hooks/useLCProforma";
import { useExportShipments } from "@/hooks/useExportShipments";
import { useImportShipments } from "@/hooks/useImportShipments";
import { useImportCostSheets } from "@/hooks/useImportCostSheets";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { asNumber } from "@/utils/cn";
import { daysUntil, monthKeyAndLabel } from "@/utils/dates";

/** Group a numeric field by month label for the last 12 months. */
function monthlySeries<T extends Record<string, any>>(
  rows: T[] | undefined,
  dateKey: string,
  valueKey: string,
  seriesKey: string,
) {
  const map = new Map<string, Record<string, any>>();
  (rows ?? []).forEach((r) => {
    const bucket = monthKeyAndLabel(r[dateKey]);
    if (!bucket) return;
    const { key, label } = bucket;
    const entry = map.get(key) ?? { month: label, [seriesKey]: 0 };
    entry[seriesKey] = asNumber(entry[seriesKey]) + asNumber(r[valueKey]);
    map.set(key, entry);
  });
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, v]) => v)
    .slice(-12);
}

/** Group by a categorical field, summing a value (or counting). */
function groupBy<T extends Record<string, any>>(rows: T[] | undefined, key: string, valueKey?: string) {
  const map = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const label = String(r[key] ?? "Unspecified") || "Unspecified";
    map.set(label, (map.get(label) ?? 0) + (valueKey ? asNumber(r[valueKey]) : 1));
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/** Export & import trade dashboard — orders, LCs, shipments and landed cost (formerly the Executive Dashboard). */
export function ExportDashboardPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const coFilter = companyFilter(company);

  const { data: orders, isLoading: ordersLoading } = useSalesOrders({
    filters: [...coFilter, ["docstatus", "<", 2]],
    limit: 500,
  });
  const { data: lcs, isLoading: lcsLoading } = useLCProformas({
    filters: [...coFilter, ["docstatus", "<", 2]],
    limit: 500,
  });
  const { data: expShipments, isLoading: expLoading } = useExportShipments({ limit: 500 });
  const { data: impShipments, isLoading: impLoading } = useImportShipments({ limit: 500 });
  const { data: costSheets, isLoading: costLoading } = useImportCostSheets({
    filters: coFilter,
    limit: 500,
  });

  const kpis = useMemo(() => {
    const exportValue = (orders ?? []).reduce((s, o) => s + asNumber(o.grand_total), 0);
    const importValue = (costSheets ?? []).reduce((s, c) => s + asNumber(c.total_landed_cost), 0);

    const openLcs = (lcs ?? []).filter(
      (l) => !["Closed", "Cancelled", "Expired"].includes(l.lc_status ?? l.workflow_state ?? ""),
    );
    const lcValue = openLcs.reduce((s, l) => s + asNumber(l.lc_amount || l.total_proforma_value), 0);

    const inTransit =
      (expShipments ?? []).filter((s) => s.shipment_status === "In Transit").length +
      (impShipments ?? []).filter((s) => s.shipment_status === "In Transit").length;

    // Delayed = ETA in the past but not yet Arrived/Delivered/Closed.
    const isDelayed = (eta?: string, status?: string) => {
      const d = daysUntil(eta);
      return d !== null && d < 0 && !["Arrived", "Delivered", "Closed"].includes(status ?? "");
    };
    const delayed =
      (expShipments ?? []).filter((s) => isDelayed(s.eta, s.shipment_status)).length +
      (impShipments ?? []).filter((s) => isDelayed(s.eta, s.shipment_status)).length;

    const pendingOrders = (orders ?? []).filter(
      (o) => !["Closed", "Completed", "Cancelled"].includes(o.status ?? ""),
    ).length;

    const totalQty = (orders ?? []).reduce((s, o) => s + asNumber(o.total_qty), 0);
    const shippedOrders = (orders ?? []).filter((o) =>
      ["Shipped", "Closed", "Completed"].includes(o.export_status ?? o.status ?? ""),
    ).length;
    const completion =
      (orders ?? []).length > 0 ? Math.round((shippedOrders / (orders ?? []).length) * 100) : 0;

    return {
      exportValue,
      importValue,
      openLcCount: openLcs.length,
      lcValue,
      inTransit,
      delayed,
      pendingOrders,
      completion,
      totalQty,
    };
  }, [orders, lcs, expShipments, impShipments, costSheets]);

  const monthlyExport = monthlySeries(orders, "transaction_date", "grand_total", "value");
  const monthlyImport = monthlySeries(costSheets, "cost_sheet_date", "total_landed_cost", "value");
  const buyerExport = groupBy(orders, "customer", "grand_total");
  const countryExport = groupBy(orders, "country_of_destination", "grand_total");
  const lcStatus = lcStatusDistribution(lcs);
  const shipmentStatus = groupBy(expShipments, "shipment_status");
  const productionStatus = groupBy(orders, "export_status");

  const costBreakdown = useMemo(() => {
    const totals: Record<string, number> = { Purchase: 0, Duty: 0, Tax: 0, Other: 0 };
    (costSheets ?? []).forEach((c) => {
      totals.Purchase += asNumber(c.total_purchase_value);
      const delta = asNumber(c.total_landed_cost) - asNumber(c.total_purchase_value);
      if (delta > 0) totals.Other += delta;
    });
    (impShipments ?? []).forEach((s) => {
      totals.Duty += asNumber(s.duty_amount);
      totals.Tax += asNumber(s.tax_amount);
    });
    return Object.entries(totals)
      .map(([label, value]) => ({ label, value }))
      .filter((d) => d.value > 0);
  }, [costSheets, impShipments]);

  const loading = ordersLoading || lcsLoading || expLoading || impLoading || costLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Export & Import Dashboard"
        subtitle={company ? `Company: ${company}` : "All companies"}
      />

      <div className="-mt-2">
        <AnalyticsTabs />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Export Value" value={formatMoney(kpis.exportValue, undefined, { compact: true })} icon={DollarSign} tone="success" loading={loading} onClick={() => navigate("/export/orders")} />
        <KpiCard label="Import Value" value={formatMoney(kpis.importValue, undefined, { compact: true })} icon={Container} tone="info" loading={loading} onClick={() => navigate("/import/cost-sheets")} />
        <KpiCard label="Open LC" value={kpis.openLcCount} icon={FileText} loading={loading} onClick={() => navigate("/export/lc-proforma")} />
        <KpiCard label="LC Value" value={formatMoney(kpis.lcValue, undefined, { compact: true })} icon={Landmark} tone="warning" loading={loading} onClick={() => navigate("/reports/lc")} />
        <KpiCard label="Shipments In Transit" value={kpis.inTransit} icon={Ship} tone="info" loading={loading} onClick={() => navigate("/export/shipments")} />
        <KpiCard label="Delayed Shipments" value={kpis.delayed} icon={AlertTriangle} tone="destructive" loading={loading} onClick={() => navigate("/reports/shipments")} />
        <KpiCard label="Pending Export Orders" value={kpis.pendingOrders} icon={Package} loading={loading} onClick={() => navigate("/export/orders")} />
        <KpiCard label="Production Completion" value={`${kpis.completion}%`} hint={`${compactNumber(kpis.totalQty)} pcs ordered`} icon={Factory} tone="success" loading={loading} onClick={() => navigate("/production/status")} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Monthly Export Value" subtitle="Sales Orders by month">
          <BarChart data={monthlyExport} xKey="month" series={[{ key: "value", label: "Export" }]} money />
        </ChartCard>
        <ChartCard title="Monthly Import Value" subtitle="Landed cost by month">
          <LineChart data={monthlyImport} xKey="month" series={[{ key: "value", label: "Import" }]} money />
        </ChartCard>
        <ChartCard title="Buyer-wise Export" subtitle="Top buyers by order value">
          <PieChart data={buyerExport} money />
        </ChartCard>
        <ChartCard title="Country-wise Export" subtitle="Destination markets">
          <PieChart data={countryExport} money />
        </ChartCard>
        <ChartCard title="LC Status" subtitle="Distribution of LC Proformas">
          <DonutChart data={lcStatus} />
        </ChartCard>
        <ChartCard title="Shipment Status" subtitle="Export shipments by stage">
          <DonutChart data={shipmentStatus} />
        </ChartCard>
        <ChartCard title="Production Status" subtitle="Export orders by production stage">
          <BarChart
            data={productionStatus.map((d) => ({ label: d.label, count: d.value }))}
            xKey="label"
            series={[{ key: "count", label: "Orders" }]}
          />
        </ChartCard>
        <ChartCard title="Import Cost Breakdown" subtitle="Purchase vs duties, taxes and charges">
          <DonutChart data={costBreakdown} money />
        </ChartCard>
      </div>
    </div>
  );
}
