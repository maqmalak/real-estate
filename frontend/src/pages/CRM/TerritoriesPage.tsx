import { MastersPage } from "@/components/crm/MastersPage";
import { MapPin } from "lucide-react";
import { CRM_TERRITORY_FORM_FIELDS } from "@/components/forms/form-configs";

/** Master data for `CRM Territory` (crm/fcrm/doctype/crm_territory). */
export default function TerritoriesPage() {
  return (
    <MastersPage
      config={{
        title: "Territories",
        subtitle: "Sales regions used to segment leads, deals and owners",
        icon: <MapPin className="h-5 w-5" />,
        doctype: "CRM Territory",
        fields: ["name", "territory_name", "territory_manager", "is_group"],
        formFields: CRM_TERRITORY_FORM_FIELDS,
        primaryField: "territory_name",
        primaryLabel: "Territory Name",
        secondaryFields: [{ field: "territory_manager", label: "Manager" }],
        extraStats: (rows) => [
          { label: "Groups", value: rows.filter((r) => r.is_group).length, tone: "indigo" },
        ],
      }}
    />
  );
}
