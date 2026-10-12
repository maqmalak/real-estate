import { IdCard } from "lucide-react";
import { MastersPage } from "@/components/crm/MastersPage";

interface DesignationRow {
  name: string;
  designation_name?: string;
  description?: string;
}

export default function DesignationsPage() {
  return (
    <MastersPage<DesignationRow>
      config={{
        title: "Designations",
        subtitle: "Job titles used across the organization",
        icon: <IdCard className="h-5 w-5" />,
        doctype: "Designation",
        fields: ["name", "designation_name", "description"],
        formFields: [
          { fieldname: "designation_name", label: "Designation Name", fieldtype: "Data", reqd: true },
          { fieldname: "description", label: "Description", fieldtype: "Text" },
        ],
        primaryField: "designation_name",
        primaryLabel: "Designation",
        secondaryFields: [{ field: "description", label: "Description" }],
      }}
    />
  );
}
