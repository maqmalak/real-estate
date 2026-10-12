import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Quote, Save, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeForm } from "@/components/forms/frappe-form";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import {
  RFQ_FIELDS,
  RFQ_ITEM_COLUMNS,
  RFQ_SUPPLIER_COLUMNS,
} from "@/components/forms/form-configs";
import {
  useRequestForQuotation,
  useRequestForQuotationMutations,
} from "@/hooks/useRequestForQuotations";
import { useItems } from "@/hooks/useItems";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import type { RequestForQuotation } from "@/types/frappe";

export function RequestForQuotationFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { company } = useCompanyContext();

  // A "Create RFQ" action on a Material Request routes here with an unsaved,
  // server-mapped document in router state.
  const prefill = (location.state as { prefill?: Partial<RequestForQuotation> } | null)?.prefill;

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useRequestForQuotation(
    isNew ? undefined : name,
  );
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useRequestForQuotationMutations();
  const { data: items } = useItems({ enabled: true });
  const { data: suppliers } = useSuppliers({ enabled: true });

  const itemLookup = useMemo(() => {
    const m = new Map<string, { item_name: string; stock_uom?: string }>();
    (items ?? []).forEach((it) => m.set(it.name, { item_name: it.item_name ?? it.name, stock_uom: it.stock_uom }));
    return m;
  }, [items]);

  const supplierLookup = useMemo(() => {
    const m = new Map<string, string>();
    (suppliers ?? []).forEach((s) => m.set(s.name, s.supplier_name ?? s.name));
    return m;
  }, [suppliers]);

  const [values, setValues] = useState<Partial<RequestForQuotation>>({});
  const [itemRows, setItemRows] = useState<ChildRow[]>([]);
  const [supplierRows, setSupplierRows] = useState<ChildRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = name && !isNew ? `Request for Quotation — ${name}` : "Request for Quotation";
  }, [name, isNew]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
      setItemRows((doc.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
      setSupplierRows((doc.suppliers ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
    } else if (!docLoading && isNew) {
      if (prefill) {
        setValues(prefill);
        setItemRows((prefill.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
        setSupplierRows((prefill.suppliers ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
      } else {
        setValues({
          naming_series: "PUR-RFQ-.YYYY.-",
          transaction_date: todayISO(),
          schedule_date: todayISO(),
          status: "Draft",
          company: company || undefined,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, docLoading, isNew, company]);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
  };

  const handleItemChange = (index: number, fieldname: string, value: any) => {
    setItemRows((prev) => prev.map((r, i) => (i === index ? { ...r, [fieldname]: value } : r)));
  };

  const handleItemLinkChange = (index: number, fieldname: string, value: string) => {
    if (fieldname === "item_code") {
      const meta = itemLookup.get(value);
      setItemRows((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r;
          const uom = meta?.stock_uom || r.uom || "Nos";
          return { ...r, item_code: value, item_name: meta?.item_name ?? value, stock_uom: uom, uom, conversion_factor: 1, qty: r.qty || 1 };
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
        __uuid: crypto.randomUUID(),
      },
    ]);
  const removeItemRow = (index: number) => setItemRows((prev) => prev.filter((_, i) => i !== index));
  const duplicateItemRow = (index: number) =>
    setItemRows((prev) => [...prev.slice(0, index + 1), { ...prev[index], __uuid: crypto.randomUUID(), name: undefined }, ...prev.slice(index + 1)]);

  const handleSupplierChange = (index: number, fieldname: string, value: any) => {
    setSupplierRows((prev) => prev.map((r, i) => (i === index ? { ...r, [fieldname]: value } : r)));
  };

  const handleSupplierLinkChange = (index: number, fieldname: string, value: string) => {
    if (fieldname === "supplier") {
      const supplierName = supplierLookup.get(value) ?? value;
      setSupplierRows((prev) => prev.map((r, i) => (i === index ? { ...r, supplier: value, supplier_name: supplierName } : r)));
    }
  };

  const addSupplierRow = () =>
    setSupplierRows((prev) => [...prev, { supplier: "", supplier_name: "", send_email: 0, __uuid: crypto.randomUUID() }]);
  const removeSupplierRow = (index: number) => setSupplierRows((prev) => prev.filter((_, i) => i !== index));

  const validate = useCallback((): boolean => {
    const required: [string, string][] = [
      ["subject", "Subject"],
      ["transaction_date", "Date"],
      ["company", "Company"],
    ];
    const next: Record<string, string> = {};
    required.forEach(([f, label]) => {
      if (!(values as Record<string, any>)[f]) next[f] = `${label} is required`;
    });
    if (itemRows.length === 0) next["items"] = "Add at least one line item";
    itemRows.forEach((row, i) => {
      if (!row.item_code) next[`item_${i}`] = `Row ${i + 1}: Item is required`;
      if (!row.qty || Number(row.qty) <= 0) next[`qty_${i}`] = `Row ${i + 1}: Qty must be > 0`;
    });
    if (supplierRows.length === 0) next["suppliers"] = "Add at least one supplier";
    const seen = new Set<string>();
    supplierRows.forEach((row, i) => {
      if (!row.supplier) next[`supplier_${i}`] = `Row ${i + 1}: Supplier is required`;
      else if (seen.has(row.supplier)) next[`supplier_${i}`] = `Row ${i + 1}: Duplicate supplier`;
      seen.add(row.supplier);
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values, itemRows, supplierRows]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    const schedule = values.schedule_date || values.transaction_date || todayISO();

    const items = itemRows.map(({ __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest }, i) => {
      const uom = rest.uom || rest.stock_uom || "Nos";
      const stockUom = rest.stock_uom || uom;
      const itemName = rest.item_name || rest.item_code || "";
      return {
        doctype: "Request for Quotation Item",
        item_code: rest.item_code,
        item_name: itemName,
        description: rest.description || itemName,
        qty: Number(rest.qty || 0),
        uom,
        stock_uom: stockUom,
        conversion_factor: Number(rest.conversion_factor || 1) || 1,
        schedule_date: rest.schedule_date || schedule,
        warehouse: rest.warehouse || undefined,
        material_request: rest.material_request || undefined,
        material_request_item: rest.material_request_item || undefined,
        idx: i + 1,
      };
    });

    const rfqSuppliers = supplierRows.map(({ __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest }, i) => ({
      doctype: "Request for Quotation Supplier",
      supplier: rest.supplier,
      supplier_name: rest.supplier_name || rest.supplier,
      contact: rest.contact || undefined,
      email_id: rest.email_id || undefined,
      send_email: rest.send_email ? 1 : 0,
      idx: i + 1,
    }));

    return {
      doctype: "Request for Quotation",
      naming_series: values.naming_series || "PUR-RFQ-.YYYY.-",
      title: values.title || undefined,
      subject: values.subject,
      transaction_date: values.transaction_date || todayISO(),
      schedule_date: schedule,
      company: values.company,
      message_for_supplier: values.message_for_supplier || undefined,
      status: values.status || "Draft",
      items,
      suppliers: rfqSuppliers,
    };
  }, [values, itemRows, supplierRows]);

  const persist = useCallback(async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to save Requests for Quotation");
      return;
    }

    const payload = buildPayload();
    try {
      if (isNew) {
        const created = await createDoc(payload as Partial<RequestForQuotation>);
        toast.success(`Request for Quotation ${created.name ?? ""} created`);
        notifyDataChanged();
        if (created?.name) {
          navigate(`/import/rfqs/${encodeURIComponent(created.name)}`);
        } else {
          navigate("/import/rfqs");
        }
      } else {
        const updated = await updateDoc(name!, payload as Partial<RequestForQuotation>);
        setValues(updated);
        setItemRows((updated.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
        setSupplierRows((updated.suppliers ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
        toast.success("Request for Quotation updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      console.error("Request for Quotation save failed", err);
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
      const full = await postCall<RequestForQuotation>("frappe.client.get", {
        doctype: "Request for Quotation",
        name: doc.name,
      });
      await postCall("frappe.client.submit", { doc: full });
      toast.success("Request for Quotation submitted");
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
      navigate("/import/rfqs");
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
        title="Request for Quotation"
        subtitle={isNew ? "New Request for Quotation" : name}
        icon={<Quote className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={() => (isNew ? navigate("/import/rfqs") : navigate(-1))} disabled={saving || submitting}>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={values.status || (doc?.docstatus === 1 ? "Submitted" : doc?.docstatus === 2 ? "Cancelled" : "Draft")} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Suppliers</p>
          <p className="font-bold">{supplierRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Items</p>
          <p className="font-bold">{itemRows.length}</p>
        </Card>
      </div>

      {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}
      {errors.suppliers && <p className="text-sm text-destructive">{errors.suppliers}</p>}

      <FrappeForm fields={RFQ_FIELDS} values={values} errors={errors} readOnly={readOnly} onChange={onChange} />

      <SectionCard
        title="Suppliers"
        description="Suppliers being asked to quote"
        actions={
          !readOnly ? (
            <Button size="sm" variant="outline" onClick={addSupplierRow}>
              + Add Supplier
            </Button>
          ) : undefined
        }
      >
        <EditableChildTable
          columns={RFQ_SUPPLIER_COLUMNS}
          rows={supplierRows}
          onChange={handleSupplierChange}
          onLinkChange={handleSupplierLinkChange}
          onRemoveRow={readOnly ? undefined : removeSupplierRow}
          readOnly={readOnly}
        />
      </SectionCard>

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
          columns={RFQ_ITEM_COLUMNS}
          rows={itemRows}
          onChange={handleItemChange}
          onLinkChange={handleItemLinkChange}
          onRemoveRow={readOnly ? undefined : removeItemRow}
          onDuplicateRow={readOnly ? undefined : duplicateItemRow}
          readOnly={readOnly}
        />
      </SectionCard>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit Request for Quotation"
        description='Submit this RFQ? Only suppliers with "Send Email" checked will be emailed; unchecked rows are just recorded for tracking.'
        confirmLabel="Submit"
        loading={submitting}
        onConfirm={() => void submitDoc()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc?.name}?`}
        description="This permanently removes the draft Request for Quotation."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
