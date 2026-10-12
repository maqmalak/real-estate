import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Calculator, Pencil, Trash2, ShoppingCart, Package, Container, Coins, FilePlus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DonutChart, CHART_COLORS } from "@/components/charts/charts";
import { useImportCostSheet, useImportCostSheetMutations } from "@/hooks/useImportCostSheets";
import { useLandedCostVouchersFor } from "@/hooks/useLandedCostVouchers";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";
import { makeLandedCostVoucherFromCostSheet } from "@/services/api";
import { formatDate } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import type { ImportCostSheet, ImportCostSheetItem } from "@/types/frappe";

const COST_COMPONENTS: { key: keyof ImportCostSheetItem; label: string }[] = [
  { key: "purchase_value", label: "Purchase" },
  { key: "freight", label: "Freight" },
  { key: "insurance", label: "Insurance" },
  { key: "customs_duty", label: "Customs Duty" },
  { key: "additional_duty", label: "Additional Duty" },
  { key: "sales_tax", label: "Sales Tax" },
  { key: "regulatory_duty", label: "Regulatory Duty" },
  { key: "clearing_charges", label: "Clearing" },
  { key: "port_charges", label: "Port Charges" },
  { key: "other_charges", label: "Other" },
];

function sumBy(items: ImportCostSheetItem[], key: keyof ImportCostSheetItem): number {
  return items.reduce((s, it) => s + Number((it as Record<string, any>)[key] ?? 0), 0);
}

/** Import Cost Sheet detail: landed-cost breakdown with chart and item allocation. */
export function ImportCostSheetDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { data: sheet, error, isLoading, mutate } = useImportCostSheet(name);
  const { deleteDoc, loading: deleteLoading } = useImportCostSheetMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [generatingLCV, setGeneratingLCV] = useState(false);

  const doc = sheet as ImportCostSheet | undefined;

  const {
    data: landedCostVouchers,
    isLoading: lcvLoading,
    error: lcvError,
  } = useLandedCostVouchersFor("Purchase Receipt", doc?.purchase_receipt);

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Import Cost Sheet deleted");
      notifyDataChanged();
      navigate("/import/cost-sheets");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  const handleGenerateLCV = async () => {
    if (!name) return;
    setGeneratingLCV(true);
    try {
      const mapped = await makeLandedCostVoucherFromCostSheet(name);
      navigate("/purchase/landed-costs/new", { state: { prefill: mapped } });
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setGeneratingLCV(false);
    }
  };

  const items = doc?.import_cost_sheet_items ?? [];

  const breakdown = useMemo(
    () =>
      COST_COMPONENTS.map((c, i) => ({
        label: c.label,
        value: sumBy(items, c.key),
        color: CHART_COLORS[i % CHART_COLORS.length],
      })).filter((d) => d.value > 0),
    [items],
  );

  const landedTotal = doc?.total_landed_cost ?? sumBy(items, "total_landed_cost");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Import Cost Sheet" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load cost sheet {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={doc.name || name!}
        subtitle={`Landed cost — ${formatMoney(landedTotal, doc.currency)}`}
        icon={<Calculator className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/import/cost-sheets" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Import Cost Sheets
          </Link>
        }
        actions={(() => {
          const editable = canWrite && (doc?.docstatus ?? 0) === 0;
          return (
            <>
              <DocActionsMenu doctype="Import Cost Sheet" doc={sheet as any} onChanged={() => void mutate()} />
              {doc.purchase_receipt && (
                <Button size="sm" variant="outline" onClick={() => void handleGenerateLCV()} disabled={generatingLCV}>
                  <FilePlus className="h-4 w-4" /> Generate Landed Cost Voucher
                </Button>
              )}
              {editable && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/import/cost-sheets/${encodeURIComponent(name!)}/edit`)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteLoading}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </>
              )}
            </>
          );
        })()}
      />
      <DocPageTabs doctype="Import Cost Sheet" name={sheet?.name ?? name} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Item Allocation"
          description={`Dated ${formatDate(doc.cost_sheet_date)} — ${items.length} item(s)`}
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Purchase</th>
                  <th className="py-2 pr-3 text-right font-medium">Duty & Tax</th>
                  <th className="py-2 pr-3 text-right font-medium">Other</th>
                  <th className="py-2 pr-3 text-right font-medium">Landed</th>
                  <th className="py-2 text-right font-medium">Per Unit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const dutyTax =
                    Number(it.customs_duty ?? 0) + Number(it.additional_duty ?? 0) +
                    Number(it.sales_tax ?? 0) + Number(it.regulatory_duty ?? 0);
                  const other =
                    Number(it.freight ?? 0) + Number(it.insurance ?? 0) +
                    Number(it.clearing_charges ?? 0) + Number(it.port_charges ?? 0) +
                    Number(it.other_charges ?? 0);
                  return (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-medium">{it.item_name || it.item}</td>
                      <td className="py-2 pr-3 text-right">{it.quantity ?? 0} {it.uom}</td>
                      <td className="py-2 pr-3 text-right">{formatMoney(it.purchase_value, doc.currency)}</td>
                      <td className="py-2 pr-3 text-right">{formatMoney(dutyTax, doc.currency)}</td>
                      <td className="py-2 pr-3 text-right">{formatMoney(other, doc.currency)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatMoney(it.total_landed_cost, doc.currency)}</td>
                      <td className="py-2 text-right">{formatMoney(it.landed_cost_per_unit, doc.currency)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      No item allocation rows on this cost sheet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Cost Breakdown">
            <DonutChart data={breakdown} height={320} money currency={doc.currency} legend={false} />
            <dl className="mt-4">
              {COST_COMPONENTS.map((c) => (
                <div key={c.key} className="flex justify-between border-b border-border/60 py-1 text-sm last:border-0">
                  <dt className="text-muted-foreground">{c.label}</dt>
                  <dd className="font-medium">{formatMoney(sumBy(items, c.key), doc.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t-2 pt-2 text-sm font-bold">
                <dt>Landed Cost</dt>
                <dd>{formatMoney(landedTotal, doc.currency)}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Connections" description="Documents linked to this Import Cost Sheet">
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
              <Container className="h-3.5 w-3.5" /> Import Shipment
            </p>
            {doc.import_shipment ? (
              <Link
                to={`/import/shipments/${encodeURIComponent(doc.import_shipment)}`}
                className="mb-4 flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Container className="h-3.5 w-3.5 opacity-60" /> {doc.import_shipment}
              </Link>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">Not linked.</p>
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
              <p className="text-sm text-destructive">Failed to load landed cost vouchers: {humanizeError(lcvError)}</p>
            ) : (landedCostVouchers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {lcvLoading ? "Loading…" : "No landed cost vouchers generated yet."}
              </p>
            ) : (
              <ul className="space-y-1">
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
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Import Cost Sheet"
        description={`Delete ${name}? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
