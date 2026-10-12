import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Package, Pencil, Trash2, FileText, RefreshCw, ShoppingCart, FilePlus, Coins } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { GLLedgerPanel } from "@/components/common/gl-ledger-panel";
import {
  usePurchaseReceipt,
  usePurchaseReceiptMutations,
} from "@/hooks/usePurchaseReceipts";
import { usePurchaseInvoicesForPR } from "@/hooks/usePurchaseInvoices";
import { useLandedCostVouchersFor } from "@/hooks/useLandedCostVouchers";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged, DATA_CHANGED_EVENT } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { makePurchaseInvoiceFromPR, makeLandedCostVoucher } from "@/services/api";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import type { PurchaseReceipt, PurchaseReceiptItem } from "@/types/frappe";

function lineAmount(row: Pick<PurchaseReceiptItem, "qty" | "rate">): number {
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
 * Purchase Receipt view page.
 *
 * Read-only presentation of a Purchase Receipt with an explicit Edit action
 * (→ `/purchase/receipts/:name/edit`), a "Create Purchase Invoice" action for
 * submitted receipts, and a Connections panel listing the source Purchase
 * Order(s) and any Purchase Invoices billed against this receipt.
 */
export function PurchaseReceiptDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = usePurchaseReceipt(name);
  const { deleteDoc, loading: deleteLoading } = usePurchaseReceiptMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [creatingLCV, setCreatingLCV] = useState(false);

  const {
    data: purchaseInvoices,
    isLoading: piLoading,
    error: piError,
    mutate: refreshPIs,
  } = usePurchaseInvoicesForPR(name);
  const {
    data: landedCostVouchers,
    isLoading: lcvLoading,
    error: lcvError,
    mutate: refreshLCVs,
  } = useLandedCostVouchersFor("Purchase Receipt", name);

  const refreshConnections = useCallback(() => {
    void refreshPIs();
    void refreshLCVs();
  }, [refreshPIs, refreshLCVs]);

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
      toast.success("Purchase Receipt deleted");
      notifyDataChanged();
      navigate("/purchase/receipts");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!name) return;
    setCreatingInvoice(true);
    try {
      const mapped = await makePurchaseInvoiceFromPR(name);
      navigate("/purchase/invoices/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleCreateLCV = async () => {
    if (!name) return;
    setCreatingLCV(true);
    try {
      const mapped = await makeLandedCostVoucher("Purchase Receipt", name);
      navigate("/purchase/landed-costs/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCreatingLCV(false);
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
        <PageHeader title="Purchase Receipt" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load purchase receipt {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const pr = doc as PurchaseReceipt;
  const items = pr.items ?? [];
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const editable = canWrite && (pr.docstatus ?? 0) === 0;
  const submitted = (pr.docstatus ?? 0) === 1;

  const linkedOrders = [...new Set(items.map((it) => it.purchase_order).filter(Boolean))] as string[];

  const statusLabel =
    pr.status || (pr.docstatus === 1 ? "Submitted" : pr.docstatus === 2 ? "Cancelled" : "Draft");

  return (
    <div className="space-y-6">
      <PageHeader
        title={pr.name || name!}
        subtitle="Purchase Receipt"
        icon={<Package className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/purchase/receipts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Purchase Receipts
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Purchase Receipt" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {submitted && (pr.per_billed ?? 0) < 100 && (
              <Button size="sm" onClick={() => void handleCreateInvoice()} disabled={creatingInvoice}>
                <FilePlus className="h-4 w-4" /> Create Purchase Invoice
              </Button>
            )}
            {submitted && (
              <Button size="sm" variant="outline" onClick={() => void handleCreateLCV()} disabled={creatingLCV}>
                <FilePlus className="h-4 w-4" /> Create Landed Cost Voucher
              </Button>
            )}
            {editable && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/purchase/receipts/${encodeURIComponent(name!)}/edit`)}
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
      <DocPageTabs doctype="Purchase Receipt" name={doc?.name ?? name} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Supplier</p>
          <p className="font-medium">{pr.supplier_name || pr.supplier || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Currency</p>
          <p className="font-medium">{pr.currency || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="font-bold">{formatMoney(pr.grand_total ?? pr.net_total, pr.currency)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Receipt Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Supplier" value={pr.supplier_name || pr.supplier} />
              <Row label="Company" value={pr.company} />
              <Row label="Posting Date" value={formatDate(pr.posting_date)} />
              <Row label="Supplier Delivery Note" value={pr.supplier_delivery_note} />
              <Row label="Currency" value={pr.currency} />
              <Row label="Conversion Rate" value={pr.conversion_rate ?? 1} />
              <Row label="% Billed" value={pr.per_billed != null ? `${pr.per_billed.toFixed(0)}%` : undefined} />
              <Row label="Total Accepted Qty" value={totalQty} />
              <Row label="Net Total" value={pr.net_total != null ? formatMoney(pr.net_total, pr.currency) : undefined} />
              <Row label="Grand Total" value={pr.grand_total != null ? formatMoney(pr.grand_total, pr.currency) : undefined} />
            </div>
          </SectionCard>

          <SectionCard title="Items" description={`${items.length} item(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 text-right font-medium">Received</th>
                    <th className="py-2 pr-3 text-right font-medium">Accepted</th>
                    <th className="py-2 pr-3 text-right font-medium">Rejected</th>
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
                        {it.purchase_order && (
                          <Link
                            to={`/import/purchase-orders/${encodeURIComponent(it.purchase_order)}`}
                            className="block text-xs text-primary hover:underline"
                          >
                            {it.purchase_order}
                          </Link>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{it.received_qty ?? it.qty} {it.uom}</td>
                      <td className="py-2 pr-3 text-right">{it.qty}</td>
                      <td className="py-2 pr-3 text-right">{it.rejected_qty ?? 0}</td>
                      <td className="py-2 pr-3 text-right">{formatMoney(it.rate, pr.currency)}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(it.amount ?? lineAmount(it), pr.currency)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No items on this purchase receipt.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <GLLedgerPanel voucherType="Purchase Receipt" voucherNo={pr.name ?? name} />
        </div>

        {/* Connections panel */}
        <div className="space-y-4">
          <SectionCard
            title="Connections"
            description="Documents linked to this Purchase Receipt"
            actions={
              <Button size="sm" variant="outline" onClick={refreshConnections} disabled={piLoading || lcvLoading}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            }
          >
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Coins className="h-3.5 w-3.5" /> Landed Cost Vouchers
              {landedCostVouchers && landedCostVouchers.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {landedCostVouchers.length}
                </Badge>
              )}
            </p>
            {lcvError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load landed cost vouchers: {humanizeError(lcvError)}</p>
            ) : (landedCostVouchers ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">{lcvLoading ? "Loading…" : "No linked landed cost vouchers."}</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(landedCostVouchers ?? []).map((v) => (
                  <li key={v.name}>
                    <Link
                      to={`/purchase/landed-costs/${encodeURIComponent(v.name ?? "")}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Coins className="h-3.5 w-3.5 opacity-60" /> {v.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" /> Purchase Orders
              {linkedOrders.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {linkedOrders.length}
                </Badge>
              )}
            </p>
            {linkedOrders.length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">No linked purchase orders.</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {linkedOrders.map((po) => (
                  <li key={po}>
                    <Link
                      to={`/import/purchase-orders/${encodeURIComponent(po)}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ShoppingCart className="h-3.5 w-3.5 opacity-60" /> {po}
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
        description="This permanently removes the draft Purchase Receipt."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
