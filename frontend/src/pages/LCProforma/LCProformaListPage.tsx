import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FileText, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLCProformas, useLCProformaMutations } from "@/hooks/useLCProforma";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatMoney } from "@/utils/currency";
import { formatDate, daysUntil } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { LCProforma } from "@/types/frappe";

const LC_STATUSES = ["Draft", "Submitted", "Applied", "Confirmed", "Amended", "Closed"];

export function LCProformaListPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const [buyer, setBuyer] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [expiryBefore, setExpiryBefore] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LCProforma | null>(null);

  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company), ["docstatus", "<", 2]];
    if (buyer) f.push(["customer", "=", buyer]);
    if (status) f.push(["lc_status", "=", status]);
    if (fromDate) f.push(["proforma_date", ">=", fromDate]);
    if (expiryBefore) f.push(["lc_expiry_date", "<=", expiryBefore]);
    return f;
  }, [company, buyer, status, fromDate, expiryBefore]);

  const { data, error, isLoading, mutate } = useLCProformas({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = useLCProformaMutations();

  const columns: ColumnDef<LCProforma>[] = [
    {
      key: "name",
      label: "Proforma",
      render: (r) => <span className="font-medium">{r.proforma_no || r.name}</span>,
    },
    { key: "customer", label: "Buyer" },
    { key: "lc_no", label: "LC No.", render: (r) => r.lc_no || "—" },
    {
      key: "lc_amount",
      label: "LC Amount",
      align: "right",
      getValue: (r) => Number(r.lc_amount ?? r.total_proforma_value ?? 0),
      render: (r) => formatMoney(r.lc_amount ?? r.total_proforma_value, r.lc_currency ?? r.currency),
    },
    {
      key: "total_proforma_value",
      label: "Proforma Value",
      align: "right",
      getValue: (r) => Number(r.total_proforma_value ?? 0),
      render: (r) => formatMoney(r.total_proforma_value, r.currency),
    },
    {
      key: "lc_expiry_date",
      label: "Expiry",
      render: (r) => {
        const days = daysUntil(r.lc_expiry_date);
        const critical = days !== null && days < 15;
        return (
          <span className={critical ? "font-medium text-destructive" : undefined}>
            {formatDate(r.lc_expiry_date)}
          </span>
        );
      },
    },
    {
      key: "lc_status",
      label: "Status",
      render: (r) => <StatusBadge status={r.lc_status ?? r.workflow_state} />,
    },
  ];

  const confirmDelete = async () => {
    if (!pendingDelete?.name) return;
    try {
      await deleteDoc(pendingDelete.name);
      toast.success(`${pendingDelete.name} deleted`);
      setPendingDelete(null);
      notifyDataChanged();
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="LC Proformas"
        subtitle="Letter of Credit proforma invoices"
        icon={<FileText className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/export/lc-proforma/new")}>
            <Plus className="h-4 w-4" /> New Proforma
          </Button>
        }
      />

      <FrappeDataTable<LCProforma>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/export/lc-proforma/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="lc-proformas"
        emptyTitle="No LC Proformas"
        emptyDescription="Create your first proforma to start the export cycle."
        searchPlaceholder="Search proforma, buyer, LC no…"
        rowActions={(r) => [
          { label: "Open", icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/export/lc-proforma/${encodeURIComponent(r.name ?? "")}`) },
          { separator: true, label: "" },
          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setPendingDelete(r) },
        ]}
        filters={
          <FilterBar>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Buyer</label>
              <FrappeLinkField
                className="w-56 [&_input]:h-8 [&_input]:text-xs"
                meta={{
                  fieldname: "customer",
                  label: "Buyer",
                  fieldtype: "Link",
                  options: "Customer",
                  placeholder: "All buyers — search…",
                }}
                value={buyer}
                onChange={setBuyer}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-32 text-xs">
                <option value="">All statuses</option>
                {LC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-36 text-xs" aria-label="Proforma date from" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Expiry Before</label>
              <Input type="date" value={expiryBefore} onChange={(e) => setExpiryBefore(e.target.value)} className="h-8 w-36 text-xs" aria-label="LC expiry before" />
            </div>
          </FilterBar>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This permanently removes the LC Proforma from ERPNext."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

