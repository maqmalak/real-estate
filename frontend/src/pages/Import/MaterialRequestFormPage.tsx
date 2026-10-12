import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ClipboardList, Save, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeForm } from "@/components/forms/frappe-form";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import {
  MATERIAL_REQUEST_FIELDS,
  MATERIAL_REQUEST_ITEM_COLUMNS,
} from "@/components/forms/form-configs";
import {
  useMaterialRequest,
  useMaterialRequestMutations,
} from "@/hooks/useMaterialRequests";
import { useItems } from "@/hooks/useItems";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import type { MaterialRequest } from "@/types/frappe";

/** Purchase needs a target (receiving) warehouse only; Material Issue needs a source only; Material Transfer needs both. */
function warehouseRequirement(type?: string): { needsFrom: boolean; needsTo: boolean } {
  if (type === "Material Issue") return { needsFrom: true, needsTo: false };
  if (type === "Material Transfer") return { needsFrom: true, needsTo: true };
  return { needsFrom: false, needsTo: true }; // Purchase
}

export function MaterialRequestFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { company } = useCompanyContext();

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useMaterialRequest(
    isNew ? undefined : name,
  );
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useMaterialRequestMutations();
  const { data: items } = useItems({ enabled: true });

  const itemLookup = useMemo(() => {
    const m = new Map<string, { item_name: string; stock_uom?: string }>();
    (items ?? []).forEach((it) => m.set(it.name, { item_name: it.item_name ?? it.name, stock_uom: it.stock_uom }));
    return m;
  }, [items]);

  const [values, setValues] = useState<Partial<MaterialRequest>>({});
  const [itemRows, setItemRows] = useState<ChildRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { needsFrom, needsTo } = warehouseRequirement(values.material_request_type);

  useEffect(() => {
    document.title = name && !isNew ? `Material Request — ${name}` : "Material Request";
  }, [name, isNew]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
      setItemRows((doc.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
    } else if (!docLoading && isNew) {
      setValues({
        naming_series: "MAT-MR-.YYYY.-",
        material_request_type: "Purchase",
        transaction_date: todayISO(),
        schedule_date: todayISO(),
        status: "Draft",
        company: company || undefined,
      });
    }
  }, [doc, docLoading, isNew, company]);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => {
      const next = { ...v, [fieldname]: value };
      if (fieldname === "material_request_type") {
        const req = warehouseRequirement(value);
        if (!req.needsFrom) next.set_from_warehouse = undefined;
        if (!req.needsTo) next.set_warehouse = undefined;
      }
      return next;
    });
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
    if (fieldname === "set_from_warehouse") {
      setItemRows((prev) => prev.map((r) => ({ ...r, from_warehouse: value || undefined })));
    }
    if (fieldname === "set_warehouse") {
      setItemRows((prev) => prev.map((r) => ({ ...r, warehouse: value || undefined })));
    }
  };

  const handleItemChange = (index: number, fieldname: string, value: any) => {
    setItemRows((prev) => prev.map((r, i) => (i === index ? { ...r, [fieldname]: value } : r)));
  };

  const handleLinkChange = (index: number, fieldname: string, value: string) => {
    if (fieldname === "item_code") {
      const meta = itemLookup.get(value);
      setItemRows((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r;
          const uom = meta?.stock_uom || r.uom || "Nos";
          return {
            ...r,
            item_code: value,
            item_name: meta?.item_name ?? value,
            stock_uom: uom,
            uom,
            conversion_factor: 1,
            qty: r.qty || 1,
          };
        }),
      );
    }
  };

  const addItemRow = () =>
    setItemRows((prev) => [
      ...prev,
      {
        item_code: "",
        item_name: "",
        qty: 1,
        uom: "Nos",
        stock_uom: "Nos",
        conversion_factor: 1,
        schedule_date: values.schedule_date || todayISO(),
        warehouse: needsTo ? values.set_warehouse : undefined,
        from_warehouse: needsFrom ? values.set_from_warehouse : undefined,
        __uuid: crypto.randomUUID(),
      },
    ]);

  const removeItemRow = (index: number) => setItemRows((prev) => prev.filter((_, i) => i !== index));
  const duplicateItemRow = (index: number) =>
    setItemRows((prev) => [
      ...prev.slice(0, index + 1),
      { ...prev[index], __uuid: crypto.randomUUID(), name: undefined },
      ...prev.slice(index + 1),
    ]);

  const validate = useCallback((): boolean => {
    const required: [string, string][] = [
      ["material_request_type", "Type"],
      ["transaction_date", "Date"],
      ["company", "Company"],
    ];
    const next: Record<string, string> = {};
    required.forEach(([f, label]) => {
      if (!(values as Record<string, any>)[f]) next[f] = `${label} is required`;
    });
    if (needsFrom && !values.set_from_warehouse) next.set_from_warehouse = "Source Warehouse is required for this type";
    if (needsTo && !values.set_warehouse) next.set_warehouse = "Target Warehouse is required for this type";
    if (itemRows.length === 0) next["items"] = "Add at least one line item";
    itemRows.forEach((row, i) => {
      if (!row.item_code) next[`item_${i}`] = `Row ${i + 1}: Item is required`;
      if (!row.qty || Number(row.qty) <= 0) next[`qty_${i}`] = `Row ${i + 1}: Qty must be > 0`;
      if (needsFrom && !row.from_warehouse) next[`from_warehouse_${i}`] = `Row ${i + 1}: From Warehouse is required`;
      if (needsTo && !row.warehouse) next[`warehouse_${i}`] = `Row ${i + 1}: Warehouse is required`;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values, itemRows, needsFrom, needsTo]);

  const totals = useMemo(() => {
    const quantity = itemRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    return { quantity };
  }, [itemRows]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    const schedule = values.schedule_date || values.transaction_date || todayISO();

    const items = itemRows.map(({ __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest }, i) => {
      const uom = rest.uom || rest.stock_uom || "Nos";
      const stockUom = rest.stock_uom || uom;
      const itemName = rest.item_name || rest.item_code || "";
      return {
        doctype: "Material Request Item",
        item_code: rest.item_code,
        item_name: itemName,
        description: rest.description || itemName,
        qty: Number(rest.qty || 0),
        uom,
        stock_uom: stockUom,
        conversion_factor: Number(rest.conversion_factor || 1) || 1,
        schedule_date: rest.schedule_date || schedule,
        warehouse: needsTo ? rest.warehouse || values.set_warehouse || undefined : undefined,
        from_warehouse: needsFrom ? rest.from_warehouse || values.set_from_warehouse || undefined : undefined,
        idx: i + 1,
      };
    });

    return {
      doctype: "Material Request",
      naming_series: values.naming_series || "MAT-MR-.YYYY.-",
      title: values.title || undefined,
      material_request_type: values.material_request_type || "Purchase",
      transaction_date: values.transaction_date || todayISO(),
      schedule_date: schedule,
      company: values.company,
      set_warehouse: needsTo ? values.set_warehouse : undefined,
      set_from_warehouse: needsFrom ? values.set_from_warehouse : undefined,
      status: values.status || "Draft",
      items,
    };
  }, [values, itemRows, needsFrom, needsTo]);

  const persist = useCallback(async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to save Material Requests");
      return;
    }

    const payload = buildPayload();
    try {
      if (isNew) {
        const created = await createDoc(payload as Partial<MaterialRequest>);
        toast.success(`Material Request ${created.name ?? ""} created`);
        notifyDataChanged();
        if (created?.name) {
          navigate(`/import/material-requests/${encodeURIComponent(created.name)}`);
        } else {
          navigate("/import/material-requests");
        }
      } else {
        const updated = await updateDoc(name!, payload as Partial<MaterialRequest>);
        setValues(updated);
        setItemRows((updated.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
        toast.success("Material Request updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      console.error("Material Request save failed", err);
      toast.error(humanizeError(err));
    }
  }, [canWrite, validate, buildPayload, isNew, createDoc, updateDoc, name, mutate, navigate]);

  const submitDoc = useCallback(async () => {
    if (!doc?.name || doc.docstatus !== 0) return;
    setSubmitting(true);
    try {
      if (canWrite) {
        await updateDoc(doc.name, buildPayload());
      }
      const full = await postCall<MaterialRequest>("frappe.client.get", {
        doctype: "Material Request",
        name: doc.name,
      });
      await postCall("frappe.client.submit", { doc: full });
      toast.success("Material Request submitted");
      notifyDataChanged();
      void mutate();
      setConfirmSubmit(false);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }, [doc, canWrite, updateDoc, buildPayload, mutate]);

  const handleDelete = useCallback(async () => {
    if (!doc?.name) return;
    try {
      await deleteDoc(doc.name);
      toast.success("Deleted");
      notifyDataChanged();
      navigate("/import/material-requests");
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setConfirmDelete(false);
    }
  }, [doc?.name, deleteDoc, navigate]);

  const readOnly = !canWrite || (doc?.docstatus !== undefined && doc.docstatus > 0);

  if (!isNew && docLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-72 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (docError) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">{humanizeError(docError)}</p>
        <Button className="mt-3" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Request"
        subtitle={isNew ? "New Material Request" : name}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => (isNew ? navigate("/import/material-requests") : navigate(-1))}
              disabled={saving || submitting}
            >
              Cancel
            </Button>
            {!isNew && doc?.docstatus === 0 && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={saving || !canWrite}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button onClick={() => void persist()} disabled={saving || readOnly || submitting}>
              <Save className="h-4 w-4" />
              {isNew ? "Save" : "Update"}
            </Button>
            {!isNew && doc?.docstatus === 0 && (
              <Button variant="default" onClick={() => setConfirmSubmit(true)} disabled={saving || !canWrite || submitting}>
                <Send className="h-4 w-4" />
                Submit
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge
            status={values.status || (doc?.docstatus === 1 ? "Submitted" : doc?.docstatus === 2 ? "Cancelled" : "Draft")}
          />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Type</p>
          <p className="font-medium">{values.material_request_type || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Required By</p>
          <p className="font-medium">{values.schedule_date || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Qty</p>
          <p className="font-bold">{totals.quantity}</p>
        </Card>
      </div>

      {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}

      <FrappeForm fields={MATERIAL_REQUEST_FIELDS} values={values} errors={errors} readOnly={readOnly} onChange={onChange} />

      <SectionCard
        title="Items"
        actions={
          !readOnly ? (
            <Button size="sm" variant="outline" onClick={addItemRow}>
              + Add Row
            </Button>
          ) : undefined
        }
      >
        <EditableChildTable
          columns={MATERIAL_REQUEST_ITEM_COLUMNS}
          rows={itemRows}
          onChange={handleItemChange}
          onLinkChange={handleLinkChange}
          onRemoveRow={readOnly ? undefined : removeItemRow}
          onDuplicateRow={readOnly ? undefined : duplicateItemRow}
          readOnly={readOnly}
        />
      </SectionCard>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit Material Request"
        description="Submit this Material Request? After submit it can no longer be edited (only cancelled/amended)."
        confirmLabel="Submit"
        loading={submitting}
        onConfirm={() => void submitDoc()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc?.name}?`}
        description="This permanently removes the draft Material Request."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
