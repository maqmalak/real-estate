import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Calculator, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FrappeForm } from "@/components/forms/frappe-form";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IMPORT_COST_SHEET_FIELDS,
  IMPORT_COST_ITEM_COLUMNS,
} from "@/components/forms/form-configs";
import {
  useImportCostSheet,
  useImportCostSheetMutations,
} from "@/hooks/useImportCostSheets";
import { useItems } from "@/hooks/useItems";
import { calculateImportCostSheet, importCostItemTotals } from "@/utils/calculations";
import { formatMoney } from "@/utils/currency";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import type { ImportCostSheet, ImportCostSheetItem } from "@/types/frappe";

const BASE_VALUES: Partial<ImportCostSheet> = {
  cost_sheet_date: todayISO(),
  currency: "USD",
};

const ITEM_DEFAULTS = (): ChildRow => ({
  item: "",
  item_name: "",
  quantity: 0,
  uom: "",
  purchase_value: 0,
  freight: 0,
  insurance: 0,
  customs_duty: 0,
  additional_duty: 0,
  sales_tax: 0,
  regulatory_duty: 0,
  clearing_charges: 0,
  port_charges: 0,
  other_charges: 0,
  __uuid: crypto.randomUUID(),
});
/**
 * Import Cost Sheet create / edit page.
 *
 * - `/import/cost-sheets/new`         → create
 * - `/import/cost-sheets/:name/edit`  → update / delete
 *
 * Master-detail: header fields via the form engine + an editable child table
 * for the item cost allocation. Totals are recomputed on the client.
 */
export function ImportCostSheetFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useImportCostSheet(isNew ? undefined : name);  const { createDoc, updateDoc, deleteDoc, loading: saving } = useImportCostSheetMutations();
  const { data: items } = useItems({ enabled: true });

  const itemLookup = useMemo(() => {
    const m = new Map<string, string>();
    (items ?? []).forEach((it) => m.set(it.name, it.item_name ?? it.name));
    return m;
  }, [items]);

  const [values, setValues] = useState<Partial<ImportCostSheet>>({});
  const [itemRows, setItemRows] = useState<ChildRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = isNew ? "New Import Cost Sheet" : `Import Cost Sheet — ${name}`;
  }, [isNew, name]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
      setItemRows((doc.import_cost_sheet_items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
    } else if (!docLoading && isNew) {
      setValues((v) => ({ ...BASE_VALUES, ...v }));
    }
  }, [doc, docLoading, isNew]);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
  };

  const handleItemChange = (index: number, fieldname: string, value: any) => {
    setItemRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, [fieldname]: value };
        const totals = importCostItemTotals(next as unknown as ImportCostSheetItem);
        next.total_landed_cost = totals.totalLandedCost;
        next.landed_cost_per_unit = totals.landedCostPerUnit;
        return next;
      }),
    );
  };
  const handleLinkChange = (index: number, fieldname: string, value: string) => {
    if (fieldname === "item") {
      const itemName = itemLookup.get(value);
      setItemRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, item_name: itemName ?? value } : r)),
      );
    }
  };
  const addItemRow = () => setItemRows((prev) => [...prev, ITEM_DEFAULTS()]);
  const removeItemRow = (index: number) => setItemRows((prev) => prev.filter((_, i) => i !== index));
  const duplicateItemRow = (index: number) =>
    setItemRows((prev) => [...prev.slice(0, index), { ...prev[index], __uuid: crypto.randomUUID() }, ...prev.slice(index + 1)]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!values.company) next.company = "Company is required";
    if (!values.supplier) next.supplier = "Supplier is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const totals = useMemo(() => calculateImportCostSheet(itemRows as unknown as ImportCostSheetItem[]), [itemRows]);
  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    const recalculated = calculateImportCostSheet(itemRows as unknown as ImportCostSheetItem[]);
    const payload = {
      ...values,
      total_purchase_value: recalculated.totalPurchaseValue,
      total_landed_cost: recalculated.totalLandedCost,
      import_cost_sheet_items: recalculated.items.map((row) => {
        const { __uuid: _uu, ...rest } = row as ChildRow;
        return rest;
      }),
    } as unknown as Partial<ImportCostSheet>;
    try {
      if (isNew) {
        const created = await createDoc(payload);
        toast.success("Import Cost Sheet created");
        notifyDataChanged();
        navigate(`/import/cost-sheets/${encodeURIComponent(created.name)}/edit`, { replace: true });
      } else {
        const updated = await updateDoc(name!, payload);
        setValues(updated);
        setItemRows(((updated as ImportCostSheet).import_cost_sheet_items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
        toast.success("Import Cost Sheet updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      toast.error(humanizeError(err));
    }
  }, [canWrite, values, itemRows, isNew, name, createDoc, updateDoc, mutate, navigate]);

  const handleDelete = useCallback(async () => {
    if (!name) return;
    setDeleting(true);
    try {
      await deleteDoc(name);
      toast.success("Import Cost Sheet deleted");
      notifyDataChanged();
      navigate("/import/cost-sheets");
    } catch (err) {
      toast.error(humanizeError(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [name, deleteDoc, navigate]);

  if (!isNew && docLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (docError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Import Cost Sheet" />
        <Card className="p-4">
          <p className="text-sm text-destructive">{humanizeError(docError)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const editable = canWrite && (isNew || (doc?.docstatus ?? 0) === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? "New Import Cost Sheet" : doc?.name || name!}
        subtitle="Import Cost Sheet"
        icon={<Calculator className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/cost-sheets" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            ← Import Cost Sheets
          </Link>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => (isNew ? navigate("/import/cost-sheets") : navigate(`/import/cost-sheets/${encodeURIComponent(name!)}`))}
              disabled={saving}
            >
              Cancel
            </Button>
            {!isNew && editable && (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={saving || deleting}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button onClick={() => void handleSave()} disabled={saving || !editable}>
              <Save className="h-4 w-4" /> {isNew ? "Create" : "Update"}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Currency</p>
          <p className="font-medium">{values.currency || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Supplier</p>
          <p className="font-medium">{values.supplier || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Purchase Value</p>
          <p className="font-bold">{formatMoney(totals.totalPurchaseValue, values.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Landed Cost</p>
          <p className="font-bold">{formatMoney(totals.totalLandedCost, values.currency)}</p>
        </Card>
      </div>

      {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}

      <FrappeForm
        fields={IMPORT_COST_SHEET_FIELDS}
        values={values}
        errors={errors}
        readOnly={!editable}
        onChange={onChange}
      />

      <SectionCard
        title="Item Cost Allocation"
        actions={
          editable ? (
            <Button size="sm" variant="outline" onClick={addItemRow}>
              + Add Row
            </Button>
          ) : undefined
        }
      >
        <EditableChildTable
          columns={IMPORT_COST_ITEM_COLUMNS}
          rows={itemRows}
          onChange={handleItemChange}
          onLinkChange={handleLinkChange}
          onAddRow={editable ? addItemRow : undefined}
          onRemoveRow={editable ? removeItemRow : undefined}
          onDuplicateRow={editable ? duplicateItemRow : undefined}
          readOnly={!editable}
        />
      </SectionCard>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Import Cost Sheet"
        description={`Delete ${name}? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
