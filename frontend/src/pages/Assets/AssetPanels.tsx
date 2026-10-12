import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { TrendingDown, ArrowLeftRight } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { AreaChart } from "@/components/charts/charts";
import { Select } from "@/components/ui/select";
import { useDocList, useDocument, type Doc } from "@/hooks/useDoc";
import { formatDate, formatDateTime } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import { asNumber } from "@/utils/cn";

/**
 * Depreciation schedule of one asset (v16: a separate "Asset Depreciation Schedule" document per asset and
 * finance book). Shows how much is booked vs still to come, the accumulated-depreciation curve, and every row.
 */
export function AssetDepreciationPanel({ asset }: { asset: string }) {
  const { data: schedules, isLoading } = useDocList("Asset Depreciation Schedule", {
    fields: ["name", "finance_book", "status", "depreciation_method", "total_number_of_depreciations", "frequency_of_depreciation", "docstatus"],
    filters: [["asset", "=", asset], ["docstatus", "<", 2]],
    limit: 20,
  });
  const [picked, setPicked] = useState("");
  const active = picked || schedules?.[0]?.name;
  const { data: ads, isLoading: loadingRows } = useDocument("Asset Depreciation Schedule", active as string | undefined);

  const rows: Doc[] = useMemo(
    () =>
      ((ads?.depreciation_schedule as Doc[] | undefined) ?? [])
        .map((r): Doc => ({ ...r, booked: Boolean(r.journal_entry) }))
        .sort((a, b) => String(a.schedule_date).localeCompare(String(b.schedule_date))),
    [ads],
  );

  const total = rows.reduce((s, r) => s + asNumber(r.depreciation_amount), 0);
  const booked = rows.filter((r) => r.booked).reduce((s, r) => s + asNumber(r.depreciation_amount), 0);
  const next = rows.find((r) => !r.booked);

  const columns: ColumnDef<Doc>[] = [
    { key: "schedule_date", label: "Schedule Date", render: (r) => formatDate(r.schedule_date) },
    { key: "depreciation_amount", label: "Depreciation", align: "right", getValue: (r) => asNumber(r.depreciation_amount), render: (r) => formatMoney(r.depreciation_amount) },
    { key: "accumulated_depreciation_amount", label: "Accumulated", align: "right", getValue: (r) => asNumber(r.accumulated_depreciation_amount), render: (r) => formatMoney(r.accumulated_depreciation_amount) },
    { key: "booked", label: "Posting", render: (r) => <StatusBadge status={r.booked ? "Booked" : "Scheduled"} /> },
    { key: "journal_entry", label: "Journal Entry", render: (r) => r.journal_entry || <span className="text-muted-foreground">—</span> },
  ];

  if (isLoading) return null;
  if (!schedules?.length) {
    return (
      <SectionCard title="Depreciation schedule" description="No depreciation schedule for this asset.">
        <p className="text-sm text-muted-foreground">
          A schedule is created when an asset with "Calculate Depreciation" and a finance book is submitted.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Depreciation schedule"
      description={ads ? `${ads.depreciation_method || "—"} · ${ads.total_number_of_depreciations ?? rows.length} depreciations every ${ads.frequency_of_depreciation ?? "—"} month(s)` : undefined}
      actions={
        schedules.length > 1 ? (
          <Select value={active ?? ""} onChange={(e) => setPicked(e.target.value)} className="h-8 w-56 text-xs">
            {schedules.map((s) => (
              <option key={s.name} value={s.name}>
                {s.finance_book || "Default book"} · {s.name}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Scheduled" value={formatMoney(total)} icon={<TrendingDown className="h-4 w-4" />} tone="sky" />
          <StatCard label="Booked" value={formatMoney(booked)} icon={<TrendingDown className="h-4 w-4" />} tone="emerald" />
          <StatCard label="Still to book" value={formatMoney(Math.max(0, total - booked))} icon={<TrendingDown className="h-4 w-4" />} tone="amber" />
          <StatCard label="Next depreciation" value={next ? formatDate(next.schedule_date) : "—"} icon={<TrendingDown className="h-4 w-4" />} tone="indigo" />
        </div>

        {rows.length > 1 && (
          <AreaChart
            data={rows.map((r) => ({ date: String(r.schedule_date).slice(0, 7), accumulated: asNumber(r.accumulated_depreciation_amount) }))}
            series={[{ key: "accumulated", label: "Accumulated depreciation" }]}
            xKey="date"
            money
            currency="PKR"
            height={220}
          />
        )}

        <FrappeDataTable<Doc>
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.name ?? r.idx)}
          loading={loadingRows}
          searchable={false}
          initialPageSize={12}
          pageSizeOptions={[12, 24, 60]}
          striped
          exportFilename={`depreciation-${asset}`}
          emptyTitle="No depreciation rows"
        />
      </div>
    </SectionCard>
  );
}

/** Movements this asset has been through (Asset Movement Item → Asset Movement). */
export function AssetMovementsPanel({ asset }: { asset: string }) {
  const { data: raw } = useFrappeGetCall<string[]>(
    "mm_core.api.get_linked_parent_docs",
    { doctype: "Asset Movement Item", parenttype: "Asset Movement", link_field: "asset", link_value: asset },
    `micromax.asset-movements.${asset}`,
  );
  const rawList = raw as unknown;
  const names: string[] = Array.isArray(rawList)
    ? rawList
    : Array.isArray((rawList as { message?: unknown } | undefined)?.message)
      ? (rawList as { message: string[] }).message
      : [];

  const { data, isLoading } = useDocList("Asset Movement", {
    fields: ["name", "purpose", "transaction_date", "docstatus"],
    filters: names.length ? [["name", "in", names]] : [["name", "=", ""]],
    orderBy: { field: "transaction_date", order: "desc" },
    limit: 50,
    enabled: names.length > 0,
  });

  if (!names.length && !isLoading) return null;

  const columns: ColumnDef<Doc>[] = [
    { key: "name", label: "Movement", render: (r) => <Link className="font-medium text-primary hover:underline" to={`/asset-management/movements/${encodeURIComponent(r.name)}`}>{r.name}</Link> },
    { key: "purpose", label: "Purpose" },
    { key: "transaction_date", label: "Date", render: (r) => formatDateTime(r.transaction_date) },
    { key: "docstatus", label: "State", render: (r) => <StatusBadge status={["Draft", "Submitted", "Cancelled"][r.docstatus ?? 0]} /> },
  ];

  return (
    <SectionCard title="Movement history" description="Locations and custodians this asset has moved between.">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowLeftRight className="h-3.5 w-3.5" /> {names.length} movement{names.length === 1 ? "" : "s"}
      </div>
      <FrappeDataTable<Doc> columns={columns} rows={data ?? []} rowKey={(r) => String(r.name)} loading={isLoading} searchable={false} initialPageSize={10} exportFilename={`movements-${asset}`} />
    </SectionCard>
  );
}
