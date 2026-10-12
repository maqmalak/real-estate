import { SimpleListPage } from "@/pages/common/SimpleListPage";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatMoney } from "@/utils/currency";
import { useNavigate } from "react-router-dom";

/** Import Cost Sheets (custom Micromax DocType) — landed-cost calculator. */
export function ImportCostSheetsPage() {
  const navigate = useNavigate();
  return (
    <SimpleListPage<Record<string, any>>
      doctype="Import Cost Sheet"
      title="Import Cost Sheets"
      subtitle="Landed-cost calculation per import shipment"
      actions={
        <Button onClick={() => navigate("/import/cost-sheets/new")}>
          <Plus className="h-4 w-4" /> New Cost Sheet
        </Button>
      }
      fields={["name", "supplier", "import_shipment", "cost_sheet_date", "total_purchase_value", "total_landed_cost", "currency", "docstatus"]}
      columns={[
        { key: "name", label: "Cost Sheet", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "supplier", label: "Supplier" },
        { key: "import_shipment", label: "Import Shipment" },
        { key: "cost_sheet_date", label: "Date" },
        {
          key: "total_purchase_value",
          label: "Purchase Value",
          align: "right",
          render: (r) => formatMoney(r.total_purchase_value, r.currency),
        },
        {
          key: "total_landed_cost",
          label: "Landed Cost",
          align: "right",
          render: (r) => formatMoney(r.total_landed_cost, r.currency),
        },
      ]}
      onRowClick={(r) => navigate(`/import/cost-sheets/${encodeURIComponent(r.name)}`)}
    />
  );
}
