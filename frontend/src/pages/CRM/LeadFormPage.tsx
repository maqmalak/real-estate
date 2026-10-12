import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { UserPlus, Save, Trash2, User, Building2, ListChecks, CircleOff, HeartHandshake, Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { FieldRenderer } from "@/components/forms/frappe-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CRM_LEAD_FIELDS } from "@/components/forms/form-configs";
import { useCrmLead, useCrmLeadMutations } from "@/hooks/useCrmLeads";
import { LEAD_ORGANIZATION_FIELDS, useOrganizationAutofill } from "@/hooks/useOrganizationAutofill";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { CrmLead } from "@/types/frappe";

/**
 * The Lead form is organized into titled cards (mirroring FCRM's side
 * sections): each card shows a flat subset of `CRM_LEAD_FIELDS` in a
 * 2-column grid.
 */
const LEAD_FORM_TABS = [
  {
    id: "person",
    label: "Person",
    icon: User,
    fields: ["salutation", "first_name", "last_name", "email", "mobile_no", "phone", "gender"],
  },
  {
    id: "second_contact",
    label: "Second Contact",
    icon: Users,
    fields: ["second_contact_name", "second_contact_gender", "second_contact_designation", "second_contact_email", "second_contact_mobile"],
  },
  {
    id: "organization",
    label: "Organization",
    icon: Building2,
    fields: ["organization", "job_title", "website", "no_of_employees", "annual_revenue", "industry", "address"],
  },
  {
    id: "qualification",
    label: "Qualification",
    icon: ListChecks,
    fields: ["status", "source", "lead_owner", "territory", "remarks"],
  },
  {
    id: "fundraising",
    label: "Fundraising Details",
    icon: HeartHandshake,
    fields: [
      "priority",
      "csr_department",
      "focus_area",
      "education_focus",
      "first_contact_date",
      "proposed_ask",

    ],
  },
  {
    id: "lost",
    label: "Lost Details",
    icon: CircleOff,
    fields: ["lost_reason", "lost_notes"],
  },
] as const;

export function LeadFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const isNew = !name || name === "new";
  const { hasRole, currentUser } = useAuth();
  const canWrite = hasRole("System Manager", "Sales Manager", "Sales User");

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useCrmLead(isNew ? undefined : name);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useCrmLeadMutations();

  const [values, setValues] = useState<Partial<CrmLead>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Each section renders as its own card — keeps that section's own Section Break as its title. */
  const sectionFields = useMemo(
    () =>
      LEAD_FORM_TABS.map((tab) => ({
        tab,
        fields: CRM_LEAD_FIELDS.filter((f) => (tab.fields as readonly string[]).includes(f.fieldname)),
      })),
    [],
  );


  useEffect(() => {
    document.title = name && !isNew ? `Lead — ${name}` : "New Lead";
  }, [name, isNew]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
    } else if (!docLoading && isNew) {
      // "New" is the first stage in this site's CRM Lead Status pipeline
      // (New -> Contacted -> Nurture -> Qualified -> Converted) — just a
      // sensible starting default for the create form, not a hard
      // requirement; the Status field is still a normal editable Link.
      setValues({ status: "New", lead_owner: currentUser ?? undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, docLoading, isNew]);

  // Picking an Organization pulls in its website / employees / industry / territory / address.
  const fetchFromOrganization = useOrganizationAutofill(LEAD_ORGANIZATION_FIELDS, setValues);

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
    if (!values.first_name) next.first_name = "First name is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values]);

  const persist = useCallback(async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to save Leads");
      return;
    }
    const lead_name = [values.first_name, values.last_name].filter(Boolean).join(" ") || values.first_name;
    const payload: Partial<CrmLead> = { ...values, lead_name };
    try {
      if (isNew) {
        const created = await createDoc(payload);
        toast.success(`Lead ${created.name ?? ""} created`);
        notifyDataChanged();
        navigate(created?.name ? `/crm/leads/${encodeURIComponent(created.name)}` : "/crm/leads");
      } else {
        const updated = await updateDoc(name!, payload);
        setValues(updated);
        toast.success("Lead updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      toast.error(humanizeError(err));
    }
  }, [values, errors, validate, canWrite, isNew, createDoc, updateDoc, name, mutate, navigate]);

  const handleDelete = useCallback(async () => {
    if (!doc?.name) return;
    try {
      await deleteDoc(doc.name);
      toast.success("Deleted");
      notifyDataChanged();
      navigate("/crm/leads");
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
        title="Lead"
        subtitle={isNew ? "New Lead" : values.lead_name || name}
        icon={<UserPlus className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={() => (isNew ? navigate("/crm/leads") : navigate(-1))} disabled={saving}>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sectionFields.map(({ tab, fields }) => {
          const Icon = tab.icon;
          const hasError = fields.some((f) => errors[f.fieldname]);
          return (
            <Card key={tab.id} className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                {tab.label}
                {hasError && <span className="h-1.5 w-1.5 rounded-full bg-destructive" title="Has errors" />}
              </h3>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {fields.map((meta) => (
                  <div
                    key={meta.fieldname}
                    className={
                      ["address", "remarks", "proposed_ask", "lost_notes"].includes(meta.fieldname) ? "sm:col-span-2" : undefined
                    }
                  >
                    <FieldRenderer
                      meta={meta}
                      values={values}
                      onChange={onChange}
                      errors={errors}
                      readOnly={readOnly}
                    />
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc?.name}?`}
        description="This permanently removes the lead."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
