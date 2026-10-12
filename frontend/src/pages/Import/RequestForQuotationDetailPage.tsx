import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Quote, Pencil, Trash2, FilePlus, Mail, MailCheck } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequestForQuotation, useRequestForQuotationMutations } from "@/hooks/useRequestForQuotations";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { buildPurchaseOrderPrefillFromRFQ } from "@/services/api";
import { formatDate } from "@/utils/dates";
import type { RequestForQuotation } from "@/types/frappe";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value == null || value === "" ? "—" : value}</span>
    </div>
  );
}

/**
 * Request for Quotation view page. "Create Purchase Order" is a client-side
 * prefill only (no server mapped-doc, no traceable link back here — see
 * services/api.ts::buildPurchaseOrderPrefillFromRFQ) and asks which of this
 * RFQ's suppliers the new PO is for, since an RFQ can target several.
 */
export function RequestForQuotationDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = useRequestForQuotation(name);
  const { deleteDoc, loading: deleteLoading } = useRequestForQuotationMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickSupplierOpen, setPickSupplierOpen] = useState(false);
  const [chosenSupplier, setChosenSupplier] = useState("");

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Request for Quotation deleted");
      notifyDataChanged();
      navigate("/import/rfqs");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const handleCreatePO = () => {
    if (!doc) return;
    const prefill = buildPurchaseOrderPrefillFromRFQ(doc as RequestForQuotation, chosenSupplier);
    navigate("/import/purchase-orders/new", { state: { prefill } });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Request for Quotation" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load RFQ {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const rfq = doc as RequestForQuotation;
  const items = rfq.items ?? [];
  const rfqSuppliers = rfq.suppliers ?? [];
  const editable = canWrite && (rfq.docstatus ?? 0) === 0;

  const statusLabel = rfq.status || (rfq.docstatus === 1 ? "Submitted" : rfq.docstatus === 2 ? "Cancelled" : "Draft");

  return (
    <div className="space-y-6">
      <PageHeader
        title={rfq.name || name!}
        subtitle="Request for Quotation"
        icon={<Quote className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/rfqs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Requests for Quotation
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Request for Quotation" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {rfq.docstatus === 1 && rfqSuppliers.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setChosenSupplier(rfqSuppliers[0]?.supplier ?? "");
                  setPickSupplierOpen(true);
                }}
              >
                <FilePlus className="h-4 w-4" /> Create Purchase Order
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/import/rfqs/${encodeURIComponent(name!)}/edit`)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteLoading}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </>
        }
      />
      <DocPageTabs doctype="Request for Quotation" name={doc?.name ?? name} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Required By</p>
          <p className="font-medium">{formatDate(rfq.schedule_date)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Suppliers Asked</p>
          <p className="font-bold">{rfqSuppliers.length}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="RFQ Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Subject" value={rfq.subject} />
              <Row label="Company" value={rfq.company} />
              <Row label="Transaction Date" value={formatDate(rfq.transaction_date)} />
              <Row label="Required By" value={formatDate(rfq.schedule_date)} />
            </div>
          </SectionCard>

          <SectionCard title="Items" description={`${items.length} item(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 font-medium">Required By</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="block font-medium">{it.item_name || it.item_code}</span>
                        {it.item_code && <span className="text-xs text-muted-foreground">{it.item_code}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{it.qty} {it.uom}</td>
                      <td className="py-2">{formatDate(it.schedule_date)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No items on this RFQ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Suppliers" description="Asked to quote on this RFQ">
            {rfqSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suppliers added.</p>
            ) : (
              <ul className="space-y-2">
                {rfqSuppliers.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{s.supplier_name || s.supplier}</p>
                      {s.quote_status && <p className="text-xs text-muted-foreground">{s.quote_status}</p>}
                    </div>
                    {s.email_sent ? (
                      <MailCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="Email sent" />
                    ) : s.send_email ? (
                      <Mail className="h-4 w-4 text-muted-foreground" aria-label="Email pending" />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <Dialog
        open={pickSupplierOpen}
        onClose={() => setPickSupplierOpen(false)}
        title="Create Purchase Order"
        description="Choose which supplier this Purchase Order is for. This RFQ has no Supplier Quotation step in this app, so the new PO isn't linked back to this RFQ — review rates before saving."
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier</label>
            <Select value={chosenSupplier} onChange={(e) => setChosenSupplier(e.target.value)}>
              {rfqSuppliers.map((s) => (
                <option key={s.supplier} value={s.supplier}>
                  {s.supplier_name || s.supplier}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPickSupplierOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePO} disabled={!chosenSupplier}>
              <FilePlus className="h-4 w-4" /> Continue
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${name}?`}
        description="This permanently removes the draft Request for Quotation."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
