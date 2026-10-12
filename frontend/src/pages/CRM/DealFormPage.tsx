import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Handshake, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeForm } from "@/components/forms/frappe-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CRM_DEAL_FIELDS } from "@/components/forms/form-configs";
import { useCrmDeal, useCrmDealMutations } from "@/hooks/useCrmDeals";
import { DEAL_ORGANIZATION_FIELDS, useOrganizationAutofill } from "@/hooks/useOrganizationAutofill";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { CrmDeal } from "@/types/frappe";

export function DealFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole("System Manager", "Sales Manager", "Sales User");

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useCrmDeal(isNew ? undefined : name);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useCrmDealMutations();

  const [values, setValues] = useState<Partial<CrmDeal>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    document.title = name && !isNew ? `Deal — ${name}` : "New Deal";
  }, [name, isNew]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
    } else if (!docLoading && isNew) {
      // "Qualification" is the first stage in this site's CRM Deal Status
      // pipeline — a sensible starting default, not a hard requirement.
      setValues({ status: "Qualification", currency: "USD" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, docLoading, isNew]);

  // Picking an Organization pulls in its website / employees / industry / territory / annual revenue.
  const fetchFromOrganization = useOrganizationAutofill(DEAL_ORGANIZATION_FIELDS, setValues);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    if (fieldname === "organization") void fetchFromOrganization(String(value ?? ""));
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
  };

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!values.organization) next.organization = "Organization is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values]);

  const persist = useCallback(async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to save Deals");
      return;
    }
    try {
      if (isNew) {
        const created = await createDoc(values);
        toast.success(`Deal ${created.name ?? ""} created`);
        notifyDataChanged();
        navigate(created?.name ? `/crm/deals/${encodeURIComponent(created.name)}` : "/crm/deals");
      } else {
        const updated = await updateDoc(name!, values);
        setValues(updated);
        toast.success("Deal updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      toast.error(humanizeError(err));
    }
  }, [values, validate, canWrite, isNew, createDoc, updateDoc, name, mutate, navigate]);

  const handleDelete = useCallback(async () => {
    if (!doc?.name) return;
    try {
      await deleteDoc(doc.name);
      toast.success("Deleted");
      notifyDataChanged();
      navigate("/crm/deals");
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setConfirmDelete(false);
    }
  }, [doc?.name, deleteDoc, navigate]);

  const readOnly = !canWrite;

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
        title="Deal"
        subtitle={isNew ? "New Deal" : values.organization || name}
        icon={<Handshake className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={() => (isNew ? navigate("/crm/deals") : navigate(-1))} disabled={saving}>
              Cancel
            </Button>
            {!isNew && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={saving || !canWrite}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button onClick={() => void persist()} disabled={saving || readOnly}>
              <Save className="h-4 w-4" />
              {isNew ? "Save" : "Update"}
            </Button>
          </>
        }
      />

      {!isNew && (
        <Card className="flex items-center justify-between p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={values.status} />
        </Card>
      )}

      <Card className="p-5">
        <FrappeForm fields={CRM_DEAL_FIELDS} values={values} errors={errors} readOnly={readOnly} onChange={onChange} />
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc?.name}?`}
        description="This permanently removes the deal."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
