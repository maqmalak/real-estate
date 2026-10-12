import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ClipboardList, Pencil, Trash2, ShoppingCart, Quote, RefreshCw, FilePlus, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMaterialRequest,
  useMaterialRequestMutations,
  usePurchaseOrdersForMR,
  useRFQsForMR,
  useStockEntriesForMR,
} from "@/hooks/useMaterialRequests";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged, DATA_CHANGED_EVENT } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { makePurchaseOrderFromMR, makeRequestForQuotationFromMR, makeStockEntryFromMR } from "@/services/api";
import { formatDate } from "@/utils/dates";
import type { MaterialRequest } from "@/types/frappe";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value == null || value === "" ? "—" : value}</span>
    </div>
  );
}

/**
 * Material Request view page. A submitted "Purchase" type request can chain
 * into a Purchase Order or a Request for Quotation via mapped-doc "Create"
 * actions; a submitted "Material Issue" / "Material Transfer" type request
 * can instead chain into a Stock Entry. All three are linked back here
 * through Material Request's real link fields, so the Connections panel is
 * server-traceable (unlike RFQ -> PO).
 */
export function MaterialRequestDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = useMaterialRequest(name);
  const { deleteDoc, loading: deleteLoading } = useMaterialRequestMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creatingPO, setCreatingPO] = useState(false);
  const [creatingRFQ, setCreatingRFQ] = useState(false);
  const [creatingSE, setCreatingSE] = useState(false);

  const {
    data: purchaseOrders,
    isLoading: poLoading,
    error: poError,
    mutate: refreshPOs,
  } = usePurchaseOrdersForMR(name);
  const {
    data: rfqs,
    isLoading: rfqLoading,
    error: rfqError,
    mutate: refreshRFQs,
  } = useRFQsForMR(name);
  const {
    data: stockEntries,
    isLoading: seLoading,
    error: seError,
    mutate: refreshSEs,
  } = useStockEntriesForMR(name);

  const refreshConnections = useCallback(() => {
    void refreshPOs();
    void refreshRFQs();
    void refreshSEs();
  }, [refreshPOs, refreshRFQs, refreshSEs]);

  useEffect(() => {
    refreshConnections();
    const handler = () => refreshConnections();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handler);
      window.removeEventListener("focus", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshConnections, name]);

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Material Request deleted");
      notifyDataChanged();
      navigate("/import/material-requests");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const handleCreatePO = async () => {
    if (!name) return;
    setCreatingPO(true);
    try {
      const mapped = await makePurchaseOrderFromMR(name);
      navigate("/import/purchase-orders/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingPO(false);
    }
  };

  const handleCreateRFQ = async () => {
    if (!name) return;
    setCreatingRFQ(true);
    try {
      const mapped = await makeRequestForQuotationFromMR(name);
      navigate("/import/rfqs/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingRFQ(false);
    }
  };

  const handleCreateSE = async () => {
    if (!name) return;
    setCreatingSE(true);
    try {
      const mapped = await makeStockEntryFromMR(name);
      navigate("/inventory/stock-entries/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingSE(false);
    }
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
        <PageHeader title="Material Request" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load material request {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const mr = doc as MaterialRequest;
  const items = mr.items ?? [];
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const editable = canWrite && (mr.docstatus ?? 0) === 0;
  const isPurchaseType = mr.material_request_type === "Purchase";
  const isStockMovementType =
    mr.material_request_type === "Material Issue" || mr.material_request_type === "Material Transfer";

  const statusLabel = mr.status || (mr.docstatus === 1 ? "Submitted" : mr.docstatus === 2 ? "Cancelled" : "Draft");

  return (
    <div className="space-y-6">
      <PageHeader
        title={mr.name || name!}
        subtitle="Material Request"
        icon={<ClipboardList className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/material-requests" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Material Requests
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Material Request" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {mr.docstatus === 1 && isPurchaseType && (mr.per_ordered ?? 0) < 100 && (
              <Button size="sm" variant="outline" onClick={() => void handleCreatePO()} disabled={creatingPO}>
                <FilePlus className="h-4 w-4" /> Create Purchase Order
              </Button>
            )}
            {mr.docstatus === 1 && isPurchaseType && (
              <Button size="sm" variant="outline" onClick={() => void handleCreateRFQ()} disabled={creatingRFQ}>
                <FilePlus className="h-4 w-4" /> Create RFQ
              </Button>
            )}
            {mr.docstatus === 1 && isStockMovementType && (mr.per_ordered ?? 0) < 100 && (
              <Button size="sm" variant="outline" onClick={() => void handleCreateSE()} disabled={creatingSE}>
                <ArrowLeftRight className="h-4 w-4" /> Create Stock Entry
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/import/material-requests/${encodeURIComponent(name!)}/edit`)}>
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
      <DocPageTabs doctype="Material Request" name={doc?.name ?? name} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Type</p>
          <p className="font-medium">{mr.material_request_type || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Required By</p>
          <p className="font-medium">{formatDate(mr.schedule_date)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Qty</p>
          <p className="font-bold">{totalQty}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Request Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Title" value={mr.title} />
              <Row label="Company" value={mr.company} />
              <Row label="Transaction Date" value={formatDate(mr.transaction_date)} />
              <Row label="Schedule Date" value={formatDate(mr.schedule_date)} />
              <Row label="Target Warehouse" value={mr.set_warehouse} />
              <Row label="Source Warehouse" value={mr.set_from_warehouse} />
              <Row label="Ordered %" value={mr.per_ordered != null ? `${mr.per_ordered}%` : undefined} />
              <Row label="Received %" value={mr.per_received != null ? `${mr.per_received}%` : undefined} />
            </div>
          </SectionCard>

          <SectionCard title="Items" description={`${items.length} item(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Required By</th>
                    <th className="py-2 font-medium">Warehouse</th>
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
                      <td className="py-2 pr-3">{formatDate(it.schedule_date)}</td>
                      <td className="py-2">{it.warehouse || it.from_warehouse || "—"}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No items on this material request.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Connections"
            description="Documents linked to this Material Request"
            actions={
              <Button size="sm" variant="outline" onClick={refreshConnections} disabled={poLoading || rfqLoading || seLoading}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            }
          >
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ArrowLeftRight className="h-3.5 w-3.5" /> Stock Entries
              {(stockEntries ?? []).length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {stockEntries!.length}
                </Badge>
              )}
            </p>
            {seError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load stock entries: {humanizeError(seError)}</p>
            ) : (stockEntries ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">{seLoading ? "Loading…" : "No linked stock entries."}</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(stockEntries ?? []).map((se) => (
                  <li key={se.name}>
                    <Link
                      to={`/inventory/stock-entries/${encodeURIComponent(se.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 opacity-60" /> {se.name}
                      {se.purpose ? <span className="text-xs text-muted-foreground"> · {se.purpose}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" /> Purchase Orders
              {(purchaseOrders ?? []).length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {purchaseOrders!.length}
                </Badge>
              )}
            </p>
            {poError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load purchase orders: {humanizeError(poError)}</p>
            ) : (purchaseOrders ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">{poLoading ? "Loading…" : "No linked purchase orders."}</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(purchaseOrders ?? []).map((po) => (
                  <li key={po.name}>
                    <Link
                      to={`/import/purchase-orders/${encodeURIComponent(po.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ShoppingCart className="h-3.5 w-3.5 opacity-60" /> {po.name}
                      {po.supplier_name ? <span className="text-xs text-muted-foreground"> · {po.supplier_name}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Quote className="h-3.5 w-3.5" /> Requests for Quotation
              {(rfqs ?? []).length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {rfqs!.length}
                </Badge>
              )}
            </p>
            {rfqError ? (
              <p className="text-sm text-destructive">Failed to load RFQs: {humanizeError(rfqError)}</p>
            ) : (rfqs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{rfqLoading ? "Loading…" : "No linked RFQs."}</p>
            ) : (
              <ul className="space-y-1">
                {(rfqs ?? []).map((r) => (
                  <li key={r.name}>
                    <Link
                      to={`/import/rfqs/${encodeURIComponent(r.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Quote className="h-3.5 w-3.5 opacity-60" /> {r.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${name}?`}
        description="This permanently removes the draft Material Request."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
