import { MastersPage } from "@/components/crm/MastersPage";
import { Quote } from "lucide-react";

/** Master data for the core `Salutation` doctype (honoric prefixes). */
export default function SalutationsPage() {
  return (
    <MastersPage
      config={{
        title: "Salutations",
        subtitle: "Honorific prefixes (Mr, Ms, Dr…) available on Contacts and Leads",
        icon: <Quote className="h-5 w-5" />,
        doctype: "Salutation",
        fields: ["name", "salutation"],
        formFields: [{ fieldname: "salutation", label: "Salutation", fieldtype: "Data" }],
        primaryField: "salutation",
        primaryLabel: "Salutation",
      }}
    />
  );
}
