import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { ArrowLeft, Container, FileText, ExternalLink, Pencil, Trash2, ShoppingCart, Package, Calculator } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusTimeline, StatusTimelineCompact } from "@/components/common/status-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useImportShipment, useImportShipmentMutations, IMPORT_SHIPMENT_FLOW } from "@/hooks/useImportShipments";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";
import { formatDate } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import type { ImportShipment } from "@/types/frappe";

interface FrappeFile {
  name: string;
  file_name: string;
  file_url: string;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value == null || value === "" ? "—" : value}</span>
    </div>
  );
}

/**
 * Import Shipment detail: inbound container tracking with the
 * PO → Shipment → Arrived → Customs → Cleared → Warehouse lifecycle.
 */
export function ImportShipmentDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { data: shipment, error, isLoading, mutate } = useImportShipment(name);
  const { deleteDoc, loading: deleteLoading } = useImportShipmentMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Import Shipment deleted");
      notifyDataChanged();
      navigate("/import/shipments");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const { data: files } = useFrappeGetDocList<FrappeFile>("File", {
    fields: ["name", "file_name", "file_url"],
    filters: [["attached_to_doctype", "=", "Import Shipment"], ["attached_to_name", "=", name ?? ""]],
    limit: 50,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="space-y-4">
        <PageHeader title="Import Shipment" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load shipment {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const doc = shipment as ImportShipment;
  // Map the shipment lifecycle onto the import flow for the timeline.
  const status = (doc.shipment_status ?? doc.workflow_state ?? "").toString();
  const flowIndex = (() => {
    switch (status) {
      case "Planned":
      case "Booking":
        return -1;
      case "Shipped":
      case "In Transit":
        return 0; // Shipment
      case "Arrived":
        return 1;
      case "Customs":
        return 2;
      case "Cleared":
        return 3;
      case "Delivered":
      case "Closed":
        return IMPORT_SHIPMENT_FLOW.length; // Warehouse done
      default:
        return -1;
    }
  })();


  return (
    <div className="space-y-4">
      <PageHeader
        title={doc.shipment_no || doc.name || name!}
        subtitle="Import Shipment"
        icon={<Container className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/shipments" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Import Shipments
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Import Shipment" doc={shipment as any} onChanged={() => void mutate()} />
            <StatusBadge status={status || "Draft"} />
            {canWrite && (doc?.docstatus ?? 0) === 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/import/shipments/${encodeURIComponent(name!)}/edit`)}
                >
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
      <DocPageTabs doctype="Import Shipment" name={shipment?.name ?? name} />

      <div className="lg:hidden">
        <StatusTimelineCompact steps={IMPORT_SHIPMENT_FLOW} currentIndex={flowIndex} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Shipment Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Supplier" value={doc.supplier} />
              <Row label="Container" value={doc.container_no} />
              <Row label="Bill of Lading" value={doc.bill_of_lading} />
              <Row label="Vessel" value={doc.vessel} />
              <Row label="Shipping Line" value={doc.shipping_line} />
              <Row label="Port of Loading" value={doc.port_of_loading} />
              <Row label="Port of Discharge" value={doc.port_of_discharge} />
            </div>
          </SectionCard>

          <SectionCard title="Schedule & Customs">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="ETD" value={formatDate(doc.etd)} />
              <Row label="ETA" value={formatDate(doc.eta)} />
              <Row label="Actual Arrival" value={formatDate(doc.actual_arrival)} />
              <Row label="Clearance Date" value={formatDate(doc.clearance_date)} />
              <Row label="Clearing Agent" value={doc.clearing_agent} />
              <Row label="Customs Declaration" value={doc.customs_declaration_no} />
              <Row label="Duty" value={doc.duty_amount ? formatMoney(doc.duty_amount) : "—"} />
              <Row label="Tax" value={doc.tax_amount ? formatMoney(doc.tax_amount) : "—"} />
            </div>
          </SectionCard>

          <SectionCard title="Attachments">
            {(files ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No files attached in ERPNext.</p>
            ) : (
              <ul className="space-y-1">
                {(files ?? []).map((f) => (
                  <li key={f.name}>
                    <a
                      href={f.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" /> {f.file_name}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <div className="hidden lg:block">
            <SectionCard title="Clearance Progress">
              <StatusTimeline steps={IMPORT_SHIPMENT_FLOW} currentIndex={flowIndex} />
            </SectionCard>
          </div>

          <SectionCard title="Connections" description="Documents linked to this Import Shipment">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" /> Purchase Order
            </p>
            {doc.purchase_order ? (
              <Link
                to={`/import/purchase-orders/${encodeURIComponent(doc.purchase_order)}`}
                className="mb-4 flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ShoppingCart className="h-3.5 w-3.5 opacity-60" /> {doc.purchase_order}
              </Link>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">Not linked.</p>
            )}

            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Purchase Receipt
            </p>
            {doc.purchase_receipt ? (
              <Link
                to={`/purchase/receipts/${encodeURIComponent(doc.purchase_receipt)}`}
                className="mb-4 flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Package className="h-3.5 w-3.5 opacity-60" /> {doc.purchase_receipt}
              </Link>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">Not linked.</p>
            )}

            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calculator className="h-3.5 w-3.5" /> Import Cost Sheet
            </p>
            {doc.import_cost_sheet ? (
              <Link
                to={`/import/cost-sheets/${encodeURIComponent(doc.import_cost_sheet)}`}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Calculator className="h-3.5 w-3.5 opacity-60" /> {doc.import_cost_sheet}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Not linked.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Import Shipment"
        description={`Delete ${name}? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
