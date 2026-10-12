import { MastersPage } from "@/components/crm/MastersPage";
import { Factory } from "lucide-react";
import { CRM_INDUSTRY_FORM_FIELDS } from "@/components/forms/form-configs";

/** Master data for `CRM Industry` (crm/fcrm/doctype/crm_industry). */
export default function IndustriesPage() {
  return (
    <MastersPage
      config={{
        title: "Industries",
        subtitle: "Industry verticals available on Leads and Organizations",
        icon: <Factory className="h-5 w-5" />,
        doctype: "CRM Industry",
        fields: ["name", "industry"],
        formFields: CRM_INDUSTRY_FORM_FIELDS,
        primaryField: "industry",
        primaryLabel: "Industry",
      }}
    />
  );
}
