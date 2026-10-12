import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ShoppingCart, Pencil, Trash2, Container, Calculator, RefreshCw, Package, FileText, FilePlus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePurchaseOrder,
  usePurchaseOrderMutations,
} from "@/hooks/usePurchaseOrders";
import {
  useImportShipments,
} from "@/hooks/useImportShipments";
import { useImportCostSheets } from "@/hooks/useImportCostSheets";
import { usePurchaseReceiptsForPO } from "@/hooks/usePurchaseReceipts";
import { usePurchaseInvoicesForPO } from "@/hooks/usePurchaseInvoices";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged, DATA_CHANGED_EVENT } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { makePurchaseReceiptFromPO, makePurchaseInvoiceFromPO } from "@/services/api";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/frappe";

function lineAmount(row: Pick<PurchaseOrderItem, "qty" | "rate">): number {
  return Number(row.qty || 0) * Number(row.rate || 0);
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
 * Purchase Order view page.
 *
 * Read-only presentation of a Purchase Order with an explicit Edit action
 * (→ `/import/purchase-orders/:name/edit`) and a "Connections" panel listing
 * the Import Shipments and Import Cost Sheets linked to this PO.
 */
export function PurchaseOrderDetailPage() {
const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = usePurchaseOrder(name);
  const { deleteDoc, loading: deleteLoading } = usePurchaseOrderMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creatingReceipt, setCreatingReceipt] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const {
    data: shipments,
    isLoading: connectLoading,
    error: connectError,
    mutate: refreshShipments,
  } = useImportShipments({
    filters: [["purchase_order", "=", name ?? ""]],
    limit: 50,
    enabled: !!name,
  });
  const {
    data: costSheets,
    error: costError,
    isLoading: costLoading,
    mutate: refreshCostSheets,
  } = useImportCostSheets({
    filters: [["purchase_order", "=", name ?? ""]],
    limit: 50,
    enabled: !!name,
  });
  const {
    data: purchaseReceipts,
    isLoading: prLoading,
    error: prError,
    mutate: refreshPRs,
  } = usePurchaseReceiptsForPO(name);
  const {
    data: purchaseInvoices,
    isLoading: piLoading,
    error: piError,
    mutate: refreshPIs,
  } = usePurchaseInvoicesForPO(name);

  // Revalidate the connection panels whenever data changes (e.g. a shipment
  // is created/edited elsewhere) or the user returns to this page.
  const refreshConnections = useCallback(() => {
    void refreshShipments();
    void refreshCostSheets();
    void refreshPRs();
    void refreshPIs();
  }, [refreshShipments, refreshCostSheets, refreshPRs, refreshPIs]);

  useEffect(() => {
    refreshConnections();
    const handler = () => refreshConnections();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handler);
      window.removeEventListener("focus", handler);
    };
  }, [refreshConnections, name]);

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Purchase Order deleted");
      notifyDataChanged();
      navigate("/import/purchase-orders");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const handleCreateReceipt = async () => {
    if (!name) return;
    setCreatingReceipt(true);
    try {
      const mapped = await makePurchaseReceiptFromPO(name);
      navigate("/purchase/receipts/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingReceipt(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!name) return;
    setCreatingInvoice(true);
    try {
      const mapped = await makePurchaseInvoiceFromPO(name);
      navigate("/purchase/invoices/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingInvoice(false);
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
        <PageHeader title="Purchase Order" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load purchase order {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const po = doc as PurchaseOrder;
  const items = po.items ?? [];
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const editable = canWrite && (po.docstatus ?? 0) === 0;

  const statusLabel =
    po.status || (po.docstatus === 1 ? "Submitted" : po.docstatus === 2 ? "Cancelled" : "Draft");

  return (
    <div className="space-y-6">
      <PageHeader
        title={po.name || name!}
        subtitle="Purchase Order"
        icon={<ShoppingCart className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/purchase-orders" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Purchase Orders
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Purchase Order" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {po.docstatus === 1 && (po.per_received ?? 0) < 100 && (
              <Button size="sm" variant="outline" onClick={() => void handleCreateReceipt()} disabled={creatingReceipt}>
                <FilePlus className="h-4 w-4" /> Create Purchase Receipt
              </Button>
            )}
            {po.docstatus === 1 && (po.per_billed ?? 0) < 100 && (
              <Button size="sm" variant="outline" onClick={() => void handleCreateInvoice()} disabled={creatingInvoice}>
                <FilePlus className="h-4 w-4" /> Create Purchase Invoice
              </Button>
            )}
            {editable && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/import/purchase-orders/${encodeURIComponent(name!)}/edit`)}
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
      <DocPageTabs doctype="Purchase Order" name={doc?.name ?? name} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Supplier</p>
          <p className="font-medium">{po.supplier_name || po.supplier || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Currency</p>
          <p className="font-medium">{po.currency || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="font-bold">{formatMoney(po.grand_total ?? po.net_total, po.currency)}</p>
        </Card>
      </div>

      {/* Connection summary strip
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Container className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Import Shipments</span>
            </div>
            <span className="text-lg font-bold">{shipments?.length ?? 0}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Import Cost Sheets</span>
            </div>
            <span className="text-lg font-bold">{costSheets?.length ?? 0}</span>
          </div>
        </Card>
      </div> */}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Order Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Supplier" value={po.supplier_name || po.supplier} />
              <Row label="Company" value={po.company} />
              <Row label="Transaction Date" value={formatDate(po.transaction_date)} />
              <Row label="Schedule Date" value={formatDate(po.schedule_date)} />
              <Row label="Currency" value={po.currency} />
              <Row label="Conversion Rate" value={po.conversion_rate ?? 1} />
              <Row label="Payment Terms" value={po.payment_terms_template} />
              <Row label="Taxes & Charges" value={po.taxes_and_charges} />
              <Row label="Total Qty" value={totalQty} />
              <Row label="Net Total" value={po.net_total != null ? formatMoney(po.net_total, po.currency) : undefined} />
              <Row label="Grand Total" value={po.grand_total != null ? formatMoney(po.grand_total, po.currency) : undefined} />
            </div>
          </SectionCard>

          <SectionCard title="Items" description={`${items.length} item(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">Amount</th>
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
                      <td className="py-2 pr-3 text-right">{formatMoney(it.rate, po.currency)}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(it.amount ?? lineAmount(it), po.currency)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No items on this purchase order.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Connections panel */}
        <div className="space-y-4">
          <SectionCard
            title="Connections"
            description="Documents linked to this Purchase Order"
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={refreshConnections}
                disabled={connectLoading || costLoading || prLoading || piLoading}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            }
          >
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Container className="h-3.5 w-3.5" /> Import Shipments
              {connectLoading && shipments !== null && (
                <span className="text-muted-foreground/40">(counting…)</span>
              )}
              {(!connectLoading && shipments && shipments.length > 0) && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {shipments.length}
                </Badge>
              )}
            </p>
            {connectError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load shipments: {humanizeError(connectError)}</p>
            ) : (shipments ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">
                {connectLoading ? "Loading…" : "No linked shipments."}
              </p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(shipments ?? []).map((s) => (
                  <li key={s.name}>
                    <Link
                      to={`/import/shipments/${encodeURIComponent(s.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Container className="h-3.5 w-3.5 opacity-60" /> {s.shipment_no || s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calculator className="h-3.5 w-3.5" /> Import Cost Sheets
              {costLoading && costSheets !== null && (
                <span className="text-muted-foreground/40">(counting…)</span>
              )}
              {(!costLoading && costSheets && costSheets.length > 0) && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {costSheets.length}
                </Badge>
              )}
            </p>
            {costError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load cost sheets: {humanizeError(costError)}</p>
            ) : (costSheets ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">
                {costLoading ? "Loading…" : "No linked cost sheets."}
              </p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(costSheets ?? []).map((c) => (
                  <li key={c.name}>
                    <Link
                      to={`/import/cost-sheets/${encodeURIComponent(c.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Calculator className="h-3.5 w-3.5 opacity-60" /> {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Purchase Receipts
              {prLoading && purchaseReceipts !== null && (
                <span className="text-muted-foreground/40">(counting…)</span>
              )}
              {(!prLoading && purchaseReceipts && purchaseReceipts.length > 0) && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {purchaseReceipts.length}
                </Badge>
              )}
            </p>
            {prError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load purchase receipts: {humanizeError(prError)}</p>
            ) : (purchaseReceipts ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">
                {prLoading ? "Loading…" : "No linked purchase receipts."}
              </p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(purchaseReceipts ?? []).map((r) => (
                  <li key={r.name}>
                    <Link
                      to={`/purchase/receipts/${encodeURIComponent(r.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Package className="h-3.5 w-3.5 opacity-60" /> {r.name}
                      {r.posting_date ? <span className="text-xs text-muted-foreground"> · {formatDate(r.posting_date)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Purchase Invoices
              {piLoading && purchaseInvoices !== null && (
                <span className="text-muted-foreground/40">(counting…)</span>
              )}
              {(!piLoading && purchaseInvoices && purchaseInvoices.length > 0) && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {purchaseInvoices.length}
                </Badge>
              )}
            </p>
            {piError ? (
              <p className="text-sm text-destructive">Failed to load purchase invoices: {humanizeError(piError)}</p>
            ) : (purchaseInvoices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {piLoading ? "Loading…" : "No linked purchase invoices."}
              </p>
            ) : (
              <ul className="space-y-1">
                {(purchaseInvoices ?? []).map((inv) => (
                  <li key={inv.name}>
                    <Link
                      to={`/purchase/invoices/${encodeURIComponent(inv.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5 opacity-60" /> {inv.name}
                      {inv.bill_no ? <span className="text-xs text-muted-foreground"> · {inv.bill_no}</span> : null}
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
        description="This permanently removes the draft Purchase Order."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
