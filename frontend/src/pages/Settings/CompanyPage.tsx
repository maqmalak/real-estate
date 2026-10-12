import { useState } from "react";
import toast from "react-hot-toast";
import { Building, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { useCompanies, useCompanyMutations } from "@/hooks/useCompanies";
import { getDocument } from "@/services/api";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { Company } from "@/types/frappe";

function formFields(company?: string): FormFieldMeta[] {
  return [
    { fieldname: "sb_general", label: "General", fieldtype: "Section Break" },
    { fieldname: "company_name", label: "Company Name", fieldtype: "Data", reqd: true },
    { fieldname: "abbr", label: "Abbreviation", fieldtype: "Data", reqd: true, description: "Short code appended to account names (e.g. \"Cash - ABC\")." },
    { fieldname: "default_currency", label: "Default Currency", fieldtype: "Link", options: "Currency", reqd: true },
    { fieldname: "country", label: "Country", fieldtype: "Link", options: "Country", reqd: true },
    { fieldname: "cb_general_1", fieldtype: "Column Break" },
    { fieldname: "is_group", label: "Is Group (holding company)", fieldtype: "Check" },
    { fieldname: "parent_company", label: "Parent Company", fieldtype: "Link", options: "Company" },
    { fieldname: "domain", label: "Domain", fieldtype: "Data" },
    { fieldname: "tax_id", label: "Tax ID", fieldtype: "Data" },

    { fieldname: "sb_contact", label: "Contact", fieldtype: "Section Break" },
    { fieldname: "phone_no", label: "Phone", fieldtype: "Data" },
    { fieldname: "email", label: "Email", fieldtype: "Data" },
    { fieldname: "cb_contact_1", fieldtype: "Column Break" },
    { fieldname: "website", label: "Website", fieldtype: "Data" },

    { fieldname: "sb_accounting", label: "Accounting Defaults", fieldtype: "Section Break" },
    { fieldname: "default_bank_account", label: "Default Bank Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "default_cash_account", label: "Default Cash Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "default_receivable_account", label: "Default Receivable Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "default_payable_account", label: "Default Payable Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "default_income_account", label: "Default Income Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "cb_accounting_1", fieldtype: "Column Break" },
    { fieldname: "default_expense_account", label: "Default Expense Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "round_off_account", label: "Round Off Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "round_off_cost_center", label: "Round Off Cost Center", fieldtype: "Link", options: "Cost Center", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "write_off_account", label: "Write Off Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "cost_center", label: "Default Cost Center", fieldtype: "Link", options: "Cost Center", filters: company ? [["company", "=", company]] : undefined },

    { fieldname: "sb_terms", label: "Terms & Credit", fieldtype: "Section Break" },
    { fieldname: "credit_limit", label: "Credit Limit", fieldtype: "Currency" },
    { fieldname: "payment_terms", label: "Default Payment Terms", fieldtype: "Link", options: "Payment Term" },
    { fieldname: "cb_terms_1", fieldtype: "Column Break" },
    { fieldname: "default_selling_terms", label: "Default Selling Terms", fieldtype: "Link", options: "Terms and Conditions" },
    { fieldname: "default_buying_terms", label: "Default Buying Terms", fieldtype: "Link", options: "Terms and Conditions" },

    { fieldname: "sb_stock", label: "Stock Defaults", fieldtype: "Section Break" },
    { fieldname: "enable_perpetual_inventory", label: "Enable Perpetual Inventory", fieldtype: "Check" },
    { fieldname: "valuation_method", label: "Valuation Method", fieldtype: "Select", options: "FIFO\nMoving Average\nLIFO" },
    { fieldname: "cb_stock_1", fieldtype: "Column Break" },
    { fieldname: "default_warehouse", label: "Default Warehouse", fieldtype: "Link", options: "Warehouse" },
    { fieldname: "default_inventory_account", label: "Default Inventory Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "stock_adjustment_account", label: "Stock Adjustment Account", fieldtype: "Link", options: "Account", filters: company ? [["company", "=", company]] : undefined },
  ];
}

const COLUMNS: ColumnDef<Company>[] = [
  { key: "company_name", label: "Company", render: (r) => <span className="font-medium">{r.company_name || r.name}</span> },
  { key: "abbr", label: "Abbr" },
  { key: "default_currency", label: "Currency" },
  { key: "country", label: "Country" },
  { key: "is_group", label: "Type", render: (r) => (r.is_group ? <Badge variant="secondary">Group</Badge> : <Badge variant="outline">Company</Badge>) },
];

/** Company master — the full record behind the app's company selector, including its accounting/stock defaults. */
export function CompanyPage() {
  const { data, error, isLoading, mutate } = useCompanies();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useCompanyMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormValues({});
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = async (row: Company) => {
    setLoadingDoc(true);
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
    try {
      const full = await getDocument<Company>("Company", row.name);
      setFormValues({ ...full });
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!formValues.company_name) errors.company_name = "Company Name is required";
    if (!formValues.abbr) errors.abbr = "Abbreviation is required";
    if (!formValues.default_currency) errors.default_currency = "Default Currency is required";
    if (!formValues.country) errors.country = "Country is required";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Company updated");
      } else {
        await createDoc(formValues);
        toast.success("Company created");
      }
      setDialogOpen(false);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(deleteTarget.name);
      toast.success("Company deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<Company>[] = [
    ...COLUMNS,
    {
      key: "__actions",
      label: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => void openEdit(r)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Company"
        subtitle="Companies and their accounting/stock defaults"
        icon={<Building className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New Company
          </Button>
        }
      />

      <FrappeDataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => void openEdit(r)}
        striped
        title="Companies"
        exportFilename="companies"
        emptyTitle="No companies found"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="xl" title={editing ? "Edit Company" : "New Company"}>
        <div className="space-y-5">
          <FrappeForm
            fields={formFields(editing?.name)}
            values={formValues}
            onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            errors={formErrors}
            readOnly={loadingDoc}
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              {editing ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.company_name || deleteTarget?.name}"?`}
        description="This will permanently delete the company. Companies with transactions cannot be deleted."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
