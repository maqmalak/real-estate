import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { SimpleListPage } from "@/pages/common/SimpleListPage";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/utils/dates";

/**
 * Import Shipments list (custom Micromax DocType).
 *
 * Field names must match the ERPNext DocType exactly — Frappe rejects unknown
 * fields in list queries (e.g. customs_status is not a field; use shipment_status).
 */
export function ImportShipmentsPage() {
  const navigate = useNavigate();
  return (
    <SimpleListPage<Record<string, any>>
      doctype="Import Shipment"
      title="Import Shipments"
      subtitle="Inbound container shipments from suppliers"
      actions={
        <Button onClick={() => navigate("/import/shipments/new")}>
          <Plus className="h-4 w-4" /> New Import Shipment
        </Button>
      }
      fields={[
        "name",
        "shipment_no",
        "supplier",
        "purchase_order",
        "container_no",
        "bill_of_lading",
        "vessel",
        "etd",
        "eta",
        "shipment_status",
        "docstatus",
      ]}
      columns={[
        {
          key: "name",
          label: "Shipment",
          render: (r) => <span className="font-medium">{r.shipment_no || r.name}</span>,
        },
        { key: "supplier", label: "Supplier" },
        { key: "purchase_order", label: "Purchase Order", render: (r) => r.purchase_order || "—" },
        { key: "container_no", label: "Container", render: (r) => r.container_no || "—" },
        { key: "bill_of_lading", label: "BL", render: (r) => r.bill_of_lading || "—" },
        { key: "etd", label: "ETD", render: (r) => formatDate(r.etd) || "—" },
        { key: "eta", label: "ETA", render: (r) => formatDate(r.eta) || "—" },
        {
          key: "shipment_status",
          label: "Status",
          render: (r) => <StatusBadge status={r.shipment_status || "Planned"} />,
        },
      ]}
      onRowClick={(r) => navigate(`/import/shipments/${encodeURIComponent(r.name)}`)}
    />
  );
}
