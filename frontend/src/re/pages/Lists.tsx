import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Columns3, Download, ExternalLink, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StatusBadge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { getList, type Filter } from "@/re/lib/api";
import { date, dateTime, money } from "@/re/lib/format";
import { cn, deskUrl, slug } from "@/re/lib/utils";

type Cell = "text" | "money" | "date" | "datetime" | "status" | "progress";
type Row = Record<string, string | number | null>;

interface Column {
  key: string;
  label: string;
  type?: Cell;
  of?: string; // progress: denominator field
  hidden?: boolean;
}

interface QuickFilter {
  field: string;
  label: string;
  options: string[];
}

interface ListConfig {
  title: string;
  doctype: string;
  columns: Column[];
  extraFields?: string[];
  search: string[];
  base?: Filter[];
  quick?: QuickFilter[];
  orderBy: string;
  open?: (row: Row) => string; // in-app route; default opens the desk form
  newDesk?: string;
}

export function downloadCsv(filename: string, rows: object[], keys: string[]): void {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function render(c: Column, row: Row): ReactNode {
  const v = row[c.key];
  switch (c.type) {
    case "money":
      return money(Number(v ?? 0));
    case "date":
      return date(v as string | null);
    case "datetime":
      return dateTime(v as string | null);
    case "status":
      return <StatusBadge status={v as string | null} />;
    case "progress": {
      const pct = Math.min(100, Math.round((Number(v ?? 0) * 100) / Math.max(Number(row[c.of ?? ""] ?? 1), 1)));
      return (
        <div className="flex min-w-24 items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <span className="w-9 text-right text-xs">{pct}%</span>
        </div>
      );
    }
    default:
      return v ?? "—";
  }
}

const PAGE = 50;

function ListPage({ cfg }: { cfg: ListConfig }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [hidden, setHidden] = useState(() => new Set(cfg.columns.filter((c) => c.hidden).map((c) => c.key)));
  const [showCols, setShowCols] = useState(false);
  const [sort, setSort] = useState(cfg.orderBy);
  const q = params.get("q") ?? "";
  const quick = Object.fromEntries((cfg.quick ?? []).map((f) => [f.field, params.get(f.field) ?? ""]));

  const filters: Filter[] = [...(cfg.base ?? []), ...Object.entries(quick).filter(([, v]) => v).map(([k, v]) => [k, "=", v] as Filter)];
  const fields = useMemo(() => Array.from(new Set(["name", ...cfg.columns.map((c) => c.key), ...cfg.columns.flatMap((c) => (c.of ? [c.of] : [])), ...(cfg.extraFields ?? [])])), [cfg]);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, error } = useInfiniteQuery({
    queryKey: ["list", cfg.doctype, filters, q, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getList<Row>(cfg.doctype, {
      fields, filters, orderBy: sort, limit: PAGE, start: pageParam,
      orFilters: q ? cfg.search.map((f) => [f, "like", `%${q}%`] as Filter) : undefined,
    }),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const rows = data?.pages.flat() ?? [];
  const cols = cfg.columns.filter((c) => !hidden.has(c.key));
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const toggleSort = (key: string) => {
    const [cur, dir] = sort.split(" ");
    setSort(cur === key && dir === "desc" ? `${key} asc` : `${key} desc`);
  };
  const open = (row: Row) => (cfg.open ? navigate(cfg.open(row)) : window.open(deskUrl(`${slug(cfg.doctype)}/${encodeURIComponent(String(row.name))}`), "_blank"));

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{cfg.title}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCols((s) => !s)}><Columns3 /> Columns</Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(`${slug(cfg.title)}.csv`, rows, cols.map((c) => c.key))}><Download /> CSV</Button>
          {cfg.newDesk && <Button size="sm" asChild><a href={deskUrl(`${cfg.newDesk}/new`)} target="_blank" rel="noreferrer"><Plus /> New</a></Button>}
          <Button size="sm" variant="ghost" asChild><a href={deskUrl(slug(cfg.doctype))} target="_blank" rel="noreferrer"><ExternalLink /> Desk</a></Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="w-full sm:w-64">
          <Label htmlFor="l-q">Search</Label>
          <Input id="l-q" placeholder={`Search ${cfg.search.join(", ").replace(/_/g, " ")}`} value={q} onChange={(e) => setParam("q", e.target.value)} />
        </div>
        {cfg.quick?.map((f) => (
          <div key={f.field} className="w-40">
            <Label htmlFor={`l-${f.field}`}>{f.label}</Label>
            <Select id={`l-${f.field}`} value={quick[f.field]} onChange={(e) => setParam(f.field, e.target.value)}>
              <option value="">All</option>
              {f.options.map((o) => <option key={o}>{o}</option>)}
            </Select>
          </div>
        ))}
      </div>
      {showCols && (
        <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-3 text-sm">
          {cfg.columns.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={!hidden.has(c.key)}
                onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />
              {c.label}
            </label>
          ))}
        </div>
      )}
      {error ? <Empty title="Could not load" hint={(error as Error).message} /> : isLoading ? <Skeleton className="h-96" /> : !rows.length ? <Empty title="Nothing here yet" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                {cols.map((c) => {
                  const [cur, dir] = sort.split(" ");
                  return (
                    <th key={c.key} className="whitespace-nowrap px-3 py-2">
                      <button className="inline-flex items-center gap-1 font-semibold uppercase" onClick={() => toggleSort(c.key)}>
                        {c.label}{cur === c.key && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.name)} className="cursor-pointer border-t hover:bg-accent/50" onClick={() => open(r)}>
                  {cols.map((c) => <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", c.key === cols[0]?.key && "font-semibold")}>{render(c, r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasNextPage && <div className="text-center"><Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>Load more</Button></div>}
    </div>
  );
}

const BOOKING_STATUS = ["Due", "Overdue", "Paid", "Cancelled"];

export const BookingsPage = () => (
  <ListPage cfg={{
    title: "Bookings", doctype: "RE Booking", orderBy: "booking_date desc", search: ["name", "customer_name", "plot"], base: [["docstatus", "<", 2]],
    quick: [{ field: "status", label: "Status", options: BOOKING_STATUS }, { field: "block", label: "Block", options: ["A Block", "B Block", "C Block", "D Block"] }],
    newDesk: "re-booking",
    columns: [
      { key: "name", label: "Booking" }, { key: "customer_name", label: "Customer" }, { key: "plot", label: "Plot" }, { key: "block", label: "Block", hidden: true },
      { key: "booking_date", label: "Booked", type: "date" }, { key: "status", label: "Status", type: "status" }, { key: "net_price", label: "Net price", type: "money" },
      { key: "paid_amount", label: "Plan progress", type: "progress", of: "net_price" }, { key: "next_due_date", label: "Next due", type: "date" },
      { key: "overdue_amount", label: "Overdue", type: "money" }, { key: "agent", label: "Agent", hidden: true },
    ],
  }} />
);

export const PaymentsPage = () => (
  <ListPage cfg={{
    title: "Payments", doctype: "RE Payment", orderBy: "posting_date desc", search: ["name", "customer_name", "plot", "reference_no"], base: [["docstatus", "=", 1]],
    quick: [{ field: "payment_against", label: "Against", options: ["Booking", "Society Bill"] }, { field: "mode_of_payment", label: "Mode", options: ["Cash", "Bank Transfer", "Cheque"] }],
    newDesk: "re-payment",
    columns: [
      { key: "name", label: "Receipt" }, { key: "posting_date", label: "Date", type: "date" }, { key: "customer_name", label: "Customer" }, { key: "plot", label: "Plot" },
      { key: "payment_against", label: "Against" }, { key: "mode_of_payment", label: "Mode" }, { key: "amount", label: "Amount", type: "money" },
      { key: "reference_no", label: "Reference", hidden: true },
    ],
  }} />
);

export const CustomersPage = () => (
  <ListPage cfg={{
    title: "Customers", doctype: "Customer", orderBy: "customer_name asc", search: ["customer_name", "mobile_no", "name"], base: [["disabled", "=", 0]],
    open: (r) => `/re/customers/${encodeURIComponent(String(r.name))}`,
    columns: [
      { key: "customer_name", label: "Customer" }, { key: "mobile_no", label: "Mobile" }, { key: "email_id", label: "Email", hidden: true },
      { key: "account_manager", label: "Agent" }, { key: "customer_group", label: "Group", hidden: true }, { key: "creation", label: "Since", type: "date" },
    ],
  }} />
);

export const LeadsPage = () => {
  const [kind, setKind] = useState<"lead" | "deal">("lead");
  return (
    <div>
      <div className="flex gap-2 px-4 pt-4 sm:px-6">
        {(["lead", "deal"] as const).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k === "lead" ? "Leads" : "Deals (opportunities)"}</Button>
        ))}
        <Button size="sm" variant="ghost" asChild><a href="/crm" target="_blank" rel="noreferrer"><ExternalLink /> Frappe CRM (kanban)</a></Button>
      </div>
      {kind === "lead" ? (
        <ListPage key="lead" cfg={{
          title: "Leads", doctype: "CRM Lead", orderBy: "modified desc", search: ["lead_name", "mobile_no", "name"], base: [["converted", "=", 0]], newDesk: "crm-lead",
          quick: [{ field: "status", label: "Status", options: ["New", "Contacted", "Nurture", "Qualified", "Unqualified", "Junk"] },
            { field: "source", label: "Source", options: ["Walk In", "Dealer", "Facebook", "Website", "Referral", "WhatsApp"] }],
          columns: [
            { key: "lead_name", label: "Lead" }, { key: "mobile_no", label: "Mobile" }, { key: "status", label: "Status", type: "status" }, { key: "source", label: "Source" },
            { key: "re_interested_block", label: "Block" }, { key: "re_plot_size", label: "Size" }, { key: "re_budget", label: "Budget", type: "money" },
            { key: "lead_owner", label: "Agent" }, { key: "re_next_follow_up", label: "Next follow-up", type: "datetime" },
          ],
        }} />
      ) : (
        <ListPage key="deal" cfg={{
          title: "Deals", doctype: "CRM Deal", orderBy: "modified desc", search: ["lead_name", "mobile_no", "name"],
          quick: [{ field: "status", label: "Stage", options: ["Opportunity", "Site Visit", "Negotiation", "Booking", "Lost"] }],
          columns: [
            { key: "name", label: "Deal" }, { key: "lead_name", label: "Customer" }, { key: "mobile_no", label: "Mobile" }, { key: "status", label: "Stage" },
            { key: "re_interested_block", label: "Block" }, { key: "re_interested_plot", label: "Plot" }, { key: "deal_owner", label: "Agent" },
            { key: "modified", label: "Updated", type: "datetime" },
          ],
        }} />
      )}
    </div>
  );
};

export const VisitsPage = () => (
  <ListPage cfg={{
    title: "Site Visits", doctype: "RE Site Visit", orderBy: "visit_on desc", search: ["party_name", "mobile_no", "interested_plot"], newDesk: "re-site-visit",
    quick: [{ field: "status", label: "Status", options: ["Scheduled", "Completed", "No Show", "Cancelled"] }],
    columns: [
      { key: "party_name", label: "Visitor" }, { key: "visit_on", label: "When", type: "datetime" }, { key: "status", label: "Status", type: "status" },
      { key: "outcome", label: "Outcome" }, { key: "interested_block", label: "Block" }, { key: "interested_plot", label: "Plot" }, { key: "agent", label: "Agent" },
      { key: "mobile_no", label: "Mobile", hidden: true },
    ],
  }} />
);

export const SocietyBillsPage = () => (
  <ListPage cfg={{
    title: "Society Bills", doctype: "RE Society Bill", orderBy: "billing_month desc, plot asc", search: ["plot", "customer_name", "name"],
    quick: [{ field: "status", label: "Status", options: ["Unpaid", "Due", "Partly Paid", "Overdue", "Paid"] }, { field: "block", label: "Block", options: ["A Block", "B Block", "C Block", "D Block"] }],
    columns: [
      { key: "name", label: "Bill" }, { key: "bill_month_label", label: "Month" }, { key: "plot", label: "Plot" }, { key: "customer_name", label: "Owner" },
      { key: "total_amount", label: "Amount", type: "money" }, { key: "outstanding_amount", label: "Outstanding", type: "money" }, { key: "due_date", label: "Due", type: "date" },
      { key: "status", label: "Status", type: "status" },
    ],
  }} />
);

export const MaintenancePage = () => (
  <ListPage cfg={{
    title: "Complaints & Maintenance", doctype: "Task", orderBy: "modified desc", search: ["subject", "re_plot", "name"], base: [["re_project", "is", "set"]], newDesk: "task",
    quick: [{ field: "status", label: "Status", options: ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"] },
      { field: "priority", label: "Priority", options: ["Urgent", "High", "Medium", "Low"] },
      { field: "re_source", label: "Source", options: ["Customer Complaint", "WhatsApp", "Planned Maintenance", "Inspection"] }],
    columns: [
      { key: "subject", label: "Task" }, { key: "type", label: "Type" }, { key: "priority", label: "Priority", type: "status" }, { key: "status", label: "Status", type: "status" },
      { key: "re_plot", label: "Plot" }, { key: "re_block", label: "Block" }, { key: "re_source", label: "Source" }, { key: "exp_end_date", label: "Due", type: "datetime" },
    ],
  }} />
);

export const InfrastructurePage = () => (
  <ListPage cfg={{
    title: "Infrastructure & Map Features", doctype: "RE Map Feature", orderBy: "category asc, feature_name asc", search: ["feature_name", "feature_type"],
    quick: [{ field: "category", label: "Category", options: ["Roads and Gates", "Public Buildings", "Infrastructure", "Waste", "Utility Network"] }],
    columns: [
      { key: "feature_name", label: "Feature" }, { key: "feature_type", label: "Type" }, { key: "category", label: "Category" },
      { key: "geometry_type", label: "Geometry" }, { key: "area_kanal", label: "Area (Kanal)" }, { key: "width_ft", label: "Width (ft)" },
    ],
  }} />
);
