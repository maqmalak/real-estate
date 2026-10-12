import { MastersPage } from "@/components/crm/MastersPage";
import { FileText } from "lucide-react";

interface ContractTemplateRow {
  name: string;
  title: string;
  contract_terms?: string;
  requires_fulfilment?: 0 | 1;
}

/**
 * ERPNext's core `Contract Template` doctype (erpnext.crm) — reusable
 * boilerplate selectable from the "Load from Template" picker on the
 * Contracts page (src/pages/CRM/ContractsPage.tsx), which fetches
 * `contract_terms` straight from here on selection.
 */
export default function ContractTemplatesPage() {
  return (
    <MastersPage<ContractTemplateRow>
      config={{
        title: "Contract Templates",
        subtitle: "Reusable terms & conditions boilerplate available from the Contracts \"Load from Template\" picker",
        icon: <FileText className="h-5 w-5" />,
        doctype: "Contract Template",
        fields: ["name", "title", "contract_terms", "requires_fulfilment"],
        formFields: [
          { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
          {
            fieldname: "contract_terms",
            label: "Contract Terms and Conditions",
            fieldtype: "Text Editor",
            reqd: true,
            description:
              "Placeholders like {{party_name}}, {{document_name}}, {{party_type}}, {{document_type}}, {{start_date}}, {{end_date}} are filled in with the Contract's actual values when this template is loaded.",
          },
          { fieldname: "requires_fulfilment", label: "Requires Fulfilment", fieldtype: "Check" },
        ],
        dialogSize: "xl",
        primaryField: "title",
        primaryLabel: "Title",
      }}
    />
  );
}
