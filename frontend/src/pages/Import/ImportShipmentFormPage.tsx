import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Container, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeForm } from "@/components/forms/frappe-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { IMPORT_SHIPMENT_FIELDS } from "@/components/forms/form-configs";
import {
  useImportShipment,
  useImportShipmentMutations,
  customsStatus,
} from "@/hooks/useImportShipments";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import type { ImportShipment } from "@/types/frappe";

const BASE_VALUES: Partial<ImportShipment> = {
  shipment_date: todayISO(),
  shipment_status: "Planned" as ImportShipment["shipment_status"],
};

/**
 * Import Shipment create / edit page.
 *
 * - `/import/shipments/new`         → create
 * - `/import/shipments/:name/edit`  → update / delete
 *
 * Persists via frappe-react-sdk mutations (cookie/session auth); the form
 * fields mirror the `Import Shipment` DocType JSON in the `micromax` app.
 */
export function ImportShipmentFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useImportShipment(isNew ? undefined : name);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useImportShipmentMutations();

  const [values, setValues] = useState<Partial<ImportShipment>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = isNew ? "New Import Shipment" : `Import Shipment — ${name}`;
  }, [isNew, name]);

  useEffect(() => {
    if (doc) setValues(doc);
    else if (!docLoading && isNew) setValues((v) => ({ ...BASE_VALUES, ...v }));
  }, [doc, docLoading, isNew]);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!values.supplier) next.supplier = "Supplier is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = useCallback(async () => {
    if (!canWrite) return;
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    try {
      if (isNew) {
        const created = await createDoc(values);
        toast.success("Import Shipment created");
        notifyDataChanged();
        navigate(`/import/shipments/${encodeURIComponent(created.name)}/edit`, { replace: true });
      } else {
        await updateDoc(name!, values);
        toast.success("Import Shipment updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      toast.error(humanizeError(err));
    }
  }, [canWrite, values, isNew, name, createDoc, updateDoc, mutate, navigate]);

  const handleDelete = useCallback(async () => {
    if (!name) return;
    setDeleting(true);
    try {
      await deleteDoc(name);
      toast.success("Import Shipment deleted");
      notifyDataChanged();
      navigate("/import/shipments");
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
        <PageHeader title="Import Shipment" />
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
        title={isNew ? "New Import Shipment" : values.shipment_no || name!}
        subtitle="Import Shipment"
        icon={<Container className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/shipments" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            ← Import Shipments
          </Link>
        }
        actions={
          <>
            {!isNew && <StatusBadge status={String(values.shipment_status || "Draft")} />}
            <Button
              variant="outline"
              onClick={() => (isNew ? navigate("/import/shipments") : navigate(`/import/shipments/${encodeURIComponent(name!)}`))}
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

      {!isNew && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Customs Status</p>
            <p className="font-medium">{customsStatus(doc as ImportShipment | undefined)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Supplier</p>
            <p className="font-medium">{values.supplier || "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Vessel / Container</p>
            <p className="font-medium">{values.vessel || values.container_no || "—"}</p>
          </Card>
        </div>
      )}

      <FrappeForm
        fields={IMPORT_SHIPMENT_FIELDS}
        values={values}
        errors={errors}
        readOnly={!editable}
        onChange={onChange}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Import Shipment"
        description={`Delete ${name}? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
