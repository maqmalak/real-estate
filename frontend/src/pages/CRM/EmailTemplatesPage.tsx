import { MastersPage } from "@/components/crm/MastersPage";
import { FileText } from "lucide-react";

interface EmailTemplateRow {
  name: string;
  subject: string;
  response?: string;
  crm_template?: 0 | 1;
}

/**
 * Core `Email Template` doctype (frappe.email.doctype.email_template) —
 * reusable subject/body pairs selectable from the template picker in
 * `EmailPanel`'s compose box on Lead/Deal detail pages.
 */
export default function EmailTemplatesPage() {
  return (
    <MastersPage<EmailTemplateRow>
      config={{
        title: "Email Templates",
        subtitle: "Reusable subject/body pairs available from the template picker when composing an email",
        icon: <FileText className="h-5 w-5" />,
        doctype: "Email Template",
        // Email Template is a core, desk-wide doctype (HR/Payroll notification
        // templates live in the same table) — `crm_template` is a custom field
        // added specifically to scope this list, and the compose-box template
        // picker (useEmailTemplates), to CRM's own templates only.
        fields: ["name", "subject", "response", "crm_template"],
        filters: [["crm_template", "=", 1]],
        formFields: [
          { fieldname: "name", label: "Template Name", fieldtype: "Data", reqd: true },
          { fieldname: "subject", label: "Subject", fieldtype: "Data", reqd: true },
          { fieldname: "response", label: "Body", fieldtype: "Text Editor" },
        ],
        defaults: { crm_template: 1 },
        dialogSize: "xl",
        primaryField: "name",
        primaryLabel: "Template Name",
        secondaryFields: [{ field: "subject", label: "Subject" }],
      }}
    />
  );
}
