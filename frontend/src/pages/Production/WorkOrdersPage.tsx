import { SimpleListPage } from "@/pages/common/SimpleListPage";
import { PercentBar } from "@/components/common/percent-bar";
import { formatDate } from "@/utils/dates";
import { StatusBadge } from "@/components/common/status-badge";
import { asNumber } from "@/utils/cn";

/** Work Orders (standard ERPNext DocType) — data via Frappe REST API. */
export function WorkOrdersPage() {
  return (
    <SimpleListPage<Record<string, any>>
      doctype="Work Order"
      title="Work Orders"
      subtitle="Production orders derived from export demand"
      fields={[
        "name",
        "production_item",
        "qty",
        "produced_qty",
        "planned_start_date",
        "status",
      ]}
      columns={[
        { key: "name", label: "Work Order", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "production_item", label: "Item" },
        {
          key: "qty",
          label: "Qty",
          align: "right",
          getValue: (r) => asNumber(r.qty),
        },
        {
          key: "produced_qty",
          label: "Produced %",
          getValue: (r) => {
            const qty = asNumber(r.qty);
            return qty > 0 ? (asNumber(r.produced_qty) / qty) * 100 : 0;
          },
          render: (r) => {
            const qty = asNumber(r.qty);
            const pct = qty > 0 ? (asNumber(r.produced_qty) / qty) * 100 : 0;
            return (
              <div className="flex flex-col gap-0.5">
                <PercentBar value={pct} />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {asNumber(r.produced_qty)} / {qty}
                </span>
              </div>
            );
          },
        },
        {
          key: "planned_start_date",
          label: "Planned Start",
          render: (r) => formatDate(r.planned_start_date),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => <StatusBadge status={r.status || "Draft"} />,
        },
      ]}
    />
  );
}
