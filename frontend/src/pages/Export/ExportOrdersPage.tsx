import { useNavigate } from "react-router-dom";
import { SimpleListPage } from "@/pages/common/SimpleListPage";
import { PercentBar } from "@/components/common/percent-bar";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { StatusBadge } from "@/components/common/status-badge";

/**
 * Export Orders — modern React view on standard ERPNext Sales Order.
 * Rows open the real Sales Order detail/edit page under Selling (see
 * `SalesOrderDetailPage`) — the same document, viewed through an export lens.
 */
export function ExportOrdersPage() {
  const navigate = useNavigate();
  return (
    <SimpleListPage<Record<string, any>>
      doctype="Sales Order"
      title="Export Orders"
      subtitle="Buyer sales orders (ERPNext Sales Order)"
      onRowClick={(r) => navigate(`/selling/sales-orders/${encodeURIComponent(String(r.name))}`)}
      fields={[
        "name",
        "customer",
        "transaction_date",
        "delivery_date",
        "grand_total",
        "currency",
        "status",
        "per_delivered",
        "per_billed",
      ]}
      columns={[
        { key: "name", label: "Order", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "customer", label: "Buyer" },
        {
          key: "transaction_date",
          label: "Order Date",
          render: (r) => formatDate(r.transaction_date),
        },
        {
          key: "delivery_date",
          label: "Delivery Date",
          render: (r) => formatDate(r.delivery_date),
        },
        {
          key: "grand_total",
          label: "Value",
          align: "right",
          getValue: (r) => Number(r.grand_total ?? 0),
          render: (r) => formatMoney(r.grand_total, r.currency),
        },
        {
          key: "per_delivered",
          label: "Shipped %",
          getValue: (r) => Number(r.per_delivered ?? 0),
          render: (r) => <PercentBar value={r.per_delivered} />,
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
