import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Pencil, Trash2, ShoppingCart, Package, Wallet, Coins, FilePlus, Calculator } from "lucide-react";
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
  usePurchaseInvoice,
  usePurchaseInvoiceMutations,
} from "@/hooks/usePurchaseInvoices";
import { usePaymentEntriesForPurchaseInvoice } from "@/hooks/usePaymentEntries";
import { useLandedCostVouchersFor } from "@/hooks/useLandedCostVouchers";
import { useImportCostSheets } from "@/hooks/useImportCostSheets";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { makeLandedCostVoucher, makeLandedCostVoucherFromCostSheet } from "@/services/api";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/types/frappe";

function lineAmount(row: Pick<PurchaseInvoiceItem, "qty" | "rate">): number {
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
 * Purchase Invoice view page.
 *
 * Read-only presentation of a Purchase Invoice with an explicit Edit action
 * (→ `/purchase/invoices/:name/edit`) and a Connections panel listing the
 * source Purchase Order(s) / Purchase Receipt(s) referenced by its line items.
 */
export function PurchaseInvoiceDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = usePurchaseInvoice(name);
  const { deleteDoc, loading: deleteLoading } = usePurchaseInvoiceMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creatingLCV, setCreatingLCV] = useState(false);

  const {
    data: paymentEntries,
    isLoading: peLoading,
    error: peError,
  } = usePaymentEntriesForPurchaseInvoice(name);
  const {
    data: landedCostVouchers,
    isLoading: lcvLoading,
    error: lcvError,
  } = useLandedCostVouchersFor("Purchase Invoice", name);

  // Purchase Invoice → (its items' Purchase Order) → Import Cost Sheet.
  // Import Cost Sheet keeps `purchase_order` as a plain top-level Link field
  // (not a child table), so this is a direct filtered list query — no
  // server-side linked-doc helper needed, unlike the child-table lookups above.
  const linkedOrders = [
    ...new Set((doc?.items ?? []).map((it) => it.purchase_order).filter(Boolean)),
  ] as string[];
  const {
    data: importCostSheets,
    isLoading: costSheetsLoading,
    error: costSheetsError,
  } = useImportCostSheets({
    filters: [["purchase_order", "in", linkedOrders]],
    enabled: linkedOrders.length > 0,
  });

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Purchase Invoice deleted");
      notifyDataChanged();
      navigate("/purchase/invoices");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const handleCreateLCV = async () => {
    if (!name) return;
    setCreatingLCV(true);
    try {
      // Prefer the linked Import Cost Sheet (found via this invoice's Purchase
      // Order) so the voucher's charges come pre-filled from its Freight /
      // Insurance / Customs Duty / ... breakdown; fall back to the plain
      // ERPNext mapper (empty charges) when no cost sheet is linked.
      const costSheet = (importCostSheets ?? [])[0];
      const mapped = costSheet?.name
        ? await makeLandedCostVoucherFromCostSheet(costSheet.name, {
            receiptDoctype: "Purchase Invoice",
            receiptDocument: name,
          })
        : await makeLandedCostVoucher("Purchase Invoice", name);
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
        <PageHeader title="Purchase Invoice" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load purchase invoice {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const pi = doc as PurchaseInvoice;
  const items = pi.items ?? [];
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const editable = canWrite && (pi.docstatus ?? 0) === 0;

  const linkedReceipts = [...new Set(items.map((it) => it.purchase_receipt).filter(Boolean))] as string[];

  const statusLabel =
    pi.status || (pi.docstatus === 1 ? "Submitted" : pi.docstatus === 2 ? "Cancelled" : "Draft");

  return (
    <div className="space-y-6">
      <PageHeader
        title={pi.name || name!}
        subtitle="Purchase Invoice"
        icon={<FileText className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/purchase/invoices" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Purchase Invoices
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Purchase Invoice" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {pi.docstatus === 1 && pi.update_stock ? (
              <Button size="sm" variant="outline" onClick={() => void handleCreateLCV()} disabled={creatingLCV}>
                <FilePlus className="h-4 w-4" /> Create Landed Cost Voucher
              </Button>
            ) : null}
            {editable && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/purchase/invoices/${encodeURIComponent(name!)}/edit`)}
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
      <DocPageTabs doctype="Purchase Invoice" name={doc?.name ?? name} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Supplier</p>
          <p className="font-medium">{pi.supplier_name || pi.supplier || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Grand Total</p>
          <p className="font-bold">{formatMoney(pi.grand_total ?? pi.net_total, pi.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="font-bold">{formatMoney(pi.outstanding_amount, pi.currency)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Invoice Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Supplier" value={pi.supplier_name || pi.supplier} />
              <Row label="Company" value={pi.company} />
              <Row label="Posting Date" value={formatDate(pi.posting_date)} />
              <Row label="Due Date" value={formatDate(pi.due_date)} />
              <Row label="Supplier Invoice No" value={pi.bill_no} />
              <Row label="Supplier Invoice Date" value={formatDate(pi.bill_date)} />
              <Row label="Currency" value={pi.currency} />
              <Row label="Conversion Rate" value={pi.conversion_rate ?? 1} />
              <Row label="Update Stock" value={pi.update_stock ? "Yes" : "No"} />
              <Row label="Total Qty" value={totalQty} />
              <Row label="Net Total" value={pi.net_total != null ? formatMoney(pi.net_total, pi.currency) : undefined} />
              <Row label="Grand Total" value={pi.grand_total != null ? formatMoney(pi.grand_total, pi.currency) : undefined} />
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
                      <td className="py-2 pr-3 text-right">{formatMoney(it.rate, pi.currency)}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(it.amount ?? lineAmount(it), pi.currency)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No items on this purchase invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <GLLedgerPanel voucherType="Purchase Invoice" voucherNo={pi.name ?? name} />
        </div>

        {/* Connections panel */}
        <div className="space-y-4">
          <SectionCard title="Connections" description="Documents linked to this Purchase Invoice">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Payment Entries
              {paymentEntries && paymentEntries.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {paymentEntries.length}
                </Badge>
              )}
            </p>
            {peError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load payments: {humanizeError(peError)}</p>
            ) : (paymentEntries ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">{peLoading ? "Loading…" : "No payments recorded yet."}</p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(paymentEntries ?? []).map((pe) => (
                  <li key={pe.name}>
                    <Link
                      to={`/accounting/payment-entries/${encodeURIComponent(pe.name)}`}
                      className="flex items-center justify-between gap-1.5 text-sm text-primary hover:underline"
                    >
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 opacity-60" /> {pe.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatMoney(pe.paid_amount, pi.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

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
              <Calculator className="h-3.5 w-3.5" /> Import Cost Sheets
              {importCostSheets && importCostSheets.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {importCostSheets.length}
                </Badge>
              )}
            </p>
            {costSheetsError ? (
              <p className="mb-4 text-sm text-destructive">Failed to load cost sheets: {humanizeError(costSheetsError)}</p>
            ) : (importCostSheets ?? []).length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">
                {costSheetsLoading ? "Loading…" : "No linked import cost sheets."}
              </p>
            ) : (
              <ul className="mb-4 space-y-1">
                {(importCostSheets ?? []).map((c) => (
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
              {linkedReceipts.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {linkedReceipts.length}
                </Badge>
              )}
            </p>
            {linkedReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked purchase receipts.</p>
            ) : (
              <ul className="space-y-1">
                {linkedReceipts.map((pr) => (
                  <li key={pr}>
                    <Link
                      to={`/purchase/receipts/${encodeURIComponent(pr)}`}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Package className="h-3.5 w-3.5 opacity-60" /> {pr}
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
        description="This permanently removes the draft Purchase Invoice."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
