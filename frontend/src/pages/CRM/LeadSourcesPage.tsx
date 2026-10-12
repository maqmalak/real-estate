import { MastersPage } from "@/components/crm/MastersPage";
import { Megaphone } from "lucide-react";
import { CRM_LEAD_SOURCE_FORM_FIELDS } from "@/components/forms/form-configs";

/** Master data for `CRM Lead Source` (crm/fcrm/doctype/crm_lead_source). */
export default function LeadSourcesPage() {
  return (
    <MastersPage
      config={{
        title: "Lead Sources",
        subtitle: "Channels that generate leads — used by the Source field on Leads and Deals",
        icon: <Megaphone className="h-5 w-5" />,
        doctype: "CRM Lead Source",
        fields: ["name", "source_name", "details"],
        formFields: CRM_LEAD_SOURCE_FORM_FIELDS,
        primaryField: "source_name",
        primaryLabel: "Source Name",
        secondaryFields: [{ field: "details", label: "Details" }],
      }}
    />
  );
}
