import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useFrappeGetDocCount } from "frappe-react-sdk";
import {
  UserPlus,
  Plus,
  Eye,
  Trash2,
  List,
  LayoutGrid,
  Users,
  Rocket,
  TrendingUp,
  Check,
  Handshake,
  Search,
  X,
  Building2,
  Mail,
  Target,
  Pencil,
  MoreVertical,
  Phone,
  Factory,
  MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/common/stat-card";
import { avatarTone } from "@/components/common/avatar-tone";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KanbanBoard, type KanbanColumnDef } from "@/components/crm/KanbanBoard";
import { RecordId } from "@/components/crm/RecordId";
import { WebsiteLink } from "@/components/crm/WebsiteLink";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { WhatsAppIcon } from "@/components/common/whatsapp-icon";
import { useCrmLeads, useCrmLeadMutations } from "@/hooks/useCrmLeads";
import { useCrmKanban } from "@/hooks/useCrmViews";
import { useStatCardFilter } from "@/hooks/useStatCardFilter";
import { DateRangeFilterControls, useDateRangeFilter, type DateFieldOption } from "@/components/filters/date-range-filter";
import { ActiveCardFilter } from "@/components/crm/ActiveCardFilter";
import { useMonthlyLeadTarget } from "@/hooks/useMonthlyLeadTarget";
import { useWhatsAppCall } from "@/hooks/useWhatsAppCall";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { convertCrmLeadToDeal } from "@/services/api";
import { humanizeError } from "@/services/frappe";
import { relativeDays, startOfMonthISO, APP_TIME_ZONE } from "@/utils/dates";
import { whatsappUrl } from "@/utils/whatsapp";
import type { CrmLead } from "@/types/frappe";

/** Target / Achieved / Achieved% for leads created this calendar month. Target is editable inline (persisted per-browser — there's no backend concept for this to share across users). */
function LeadTargetWidget() {
  const { target, setTarget } = useMonthlyLeadTarget();
  const { data: achieved } = useFrappeGetDocCount(
    "CRM Lead",
    [["creation", ">=", startOfMonthISO()]],
    false,
    "micromax.crm.leads.achieved-this-month",
    { refreshInterval: 60_000 },
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) setTarget(n);
    setEditing(false);
  };

  const achievedCount = Number(achieved ?? 0);
  const pct = Math.round((achievedCount / target) * 100);
  const monthLabel = new Date().toLocaleDateString("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Target className="h-4 w-4 text-primary" /> Lead Target — {monthLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Target</p>
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              min={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(String(target));
                  setEditing(false);
                }
              }}
              className="w-20 rounded border border-input bg-transparent text-xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <button
              className="group flex items-center gap-1.5 text-xl font-bold tabular-nums"
              onClick={() => {
                setDraft(String(target));
                setEditing(true);
              }}
              title="Edit target"
            >
              {target}
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Achieved</p>
          <p className="text-xl font-bold tabular-nums">{achievedCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Achieved %</p>
          <p className={`text-xl font-bold tabular-nums ${pct >= 100 ? "text-emerald-600" : ""}`}>{pct}%</p>
        </div>
      </div>
      <Progress value={pct} className="mt-3" />
    </Card>
  );
}

type ViewMode = "list" | "kanban";

function leadDisplayName(r: CrmLead): string {
  return r.lead_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.name || "";
}

/** Dates a lead can be filtered on (server-side, on the doctype's own columns). */
const LEAD_DATE_FIELDS: DateFieldOption[] = [
  { value: "creation", label: "Created" },
  { value: "modified", label: "Updated" },
];

const leadStatus = (r: CrmLead) => (r.status ?? "").toLowerCase();

/**
 * Which rows each summary card stands for. Used both to COUNT a card (List view) and to FILTER by it
 * when clicked, so the two can never disagree. Status-based on purpose: the Pipeline's cards don't
 * carry the `converted` flag, only their column's status.
 */
type LeadCard = "new" | "active" | "qualified" | "converted";
const LEAD_CARD_PREDICATES: Record<LeadCard, (r: CrmLead) => boolean> = {
  new: (r) => leadStatus(r) === "new",
  active: (r) => ["contacted", "nurture", "qualified"].includes(leadStatus(r)),
  qualified: (r) => leadStatus(r) === "qualified",
  converted: (r) => r.converted === 1 || leadStatus(r).includes("convert"),
};
const LEAD_CARD_LABELS: Record<LeadCard, string> = { new: "New", active: "Active", qualified: "Qualified", converted: "Converted" };

export function LeadsPage() {
  const navigate = useNavigate();
  // Leads open in Pipeline (kanban) mode by default; List is one click away.
  const [view, setView] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CrmLead | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const cardFilter = useStatCardFilter<LeadCard, CrmLead>(LEAD_CARD_PREDICATES);
  const dateFilter = useDateRangeFilter();
  const [dateField, setDateField] = useState("creation");

  const filters = useMemo(() => {
    const f: unknown[][] = [];
    if (search) f.push(["lead_name", "like", `%${search}%`]);
    if (statusFilter) f.push(["status", "=", statusFilter]);
    f.push(...dateFilter.listFilters(dateField));
    return f;
  }, [search, statusFilter, dateFilter, dateField]);
  // The Pipeline is fetched by crm.api.doc.get_data, which takes a dict — same date range, other shape.
  const kanbanFilters = useMemo(() => dateFilter.dictFilters(dateField), [dateFilter, dateField]);

  const { data, error, isLoading, mutate } = useCrmLeads({ filters, limit: 500, enabled: view === "list" });
  const { deleteDoc, updateDoc, loading: mutating } = useCrmLeadMutations();
  const { call } = useWhatsAppCall();

  const {
    board,
    isLoading: kanbanLoading,
    mutate: mutateKanban,
  } = useCrmKanban<CrmLead>({
    doctype: "CRM Lead",
    columnField: "status",
    filters: kanbanFilters,
    // Passing kanbanFields REPLACES the server's defaults (organization, email, mobile_no, _assign,
    // modified), so those are repeated here ahead of the organization details the card now shows.
    kanbanFields: ["organization", "email", "mobile_no", "_assign", "modified", "industry", "website", "address"],
    enabled: view === "kanban",
  });

  const kanbanColumns: KanbanColumnDef[] = useMemo(
    () => board.columns.map((c) => ({ value: c.value, title: c.title, count: c.count })),
    [board.columns],
  );
  // The server groups rows per column but doesn't necessarily echo the
  // `status` field back on each row — stamp it on the way out of the map so
  // <KanbanBoard/>'s own client-side `groupField` grouping still works.
  const kanbanRows: CrmLead[] = useMemo(
    () => board.columns.flatMap((c) => (board.rowsByColumn.get(c.value) ?? []).map((r) => ({ ...r, status: c.value }))),
    [board.columns, board.rowsByColumn],
  );

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    (data ?? []).forEach((r) => {
      if (r.status) seen.add(r.status);
    });
    ["New", "Contacted", "Nurture", "Qualified", "Converted"].forEach((s) => seen.add(s));
    return [...seen];
  }, [data]);

  // Pipeline summary works from whichever dataset is live — the list rows in
  // List view, the kanban column counts in Pipeline view — so the strip stays
  // populated without a second fetch.
  const stats = useMemo(() => {
    const isList = view === "list";
    const rows = isList ? (data ?? []) : [];
    const colCount = (s: string) => board.columns.find((c) => c.value.toLowerCase() === s.toLowerCase())?.count ?? 0;
    const newLeads = isList ? rows.filter(LEAD_CARD_PREDICATES.new).length : colCount("new");
    const active = isList
      ? rows.filter(LEAD_CARD_PREDICATES.active).length
      : ["Contacted", "Nurture", "Qualified"].reduce((acc, s) => acc + colCount(s), 0);
    const qualified = isList ? rows.filter(LEAD_CARD_PREDICATES.qualified).length : colCount("qualified");
    const converted = isList ? rows.filter(LEAD_CARD_PREDICATES.converted).length : colCount("converted");
    const total = isList ? rows.length : board.columns.reduce((acc, c) => acc + (c.count ?? 0), 0);
    return { total, new: newLeads, active, qualified, converted };
  }, [view, data, board.columns]);

  // What is actually rendered: the fetched rows narrowed by the clicked summary card (if any). The card
  // counts above deliberately come from the un-narrowed rows, so picking one doesn't zero the others.
  const visibleRows = useMemo(() => cardFilter.apply(data ?? []), [cardFilter.apply, data]);
  const visibleKanbanRows = useMemo(() => cardFilter.apply(kanbanRows), [cardFilter.apply, kanbanRows]);
  // A whole column either belongs to the picked card (by its status) or is emptied — show that in its count.
  const visibleKanbanColumns = useMemo(
    () => kanbanColumns.map((c) => (cardFilter.matches({ status: c.value } as CrmLead) ? c : { ...c, count: 0 })),
    [cardFilter.matches, kanbanColumns],
  );

  const columns: ColumnDef<CrmLead>[] = [
    { key: "name", label: "ID", render: (r) => <RecordId name={r.name} />, getValue: (r) => r.name },
    {
      key: "lead_name",
      label: "Lead",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={leadDisplayName(r)} src={r.image} size="sm" className={avatarTone(leadDisplayName(r))} />
          <span className="flex min-w-0 flex-col">
            <span className="block max-w-[16rem] truncate font-medium">{leadDisplayName(r)}</span>
            {r.job_title && (
              <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">{r.job_title}</span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: "organization",
      label: "Organization",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="block max-w-[16rem] truncate">{r.organization || "—"}</span>
          {(r.industry || r.website) && (
            <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">
              {[r.industry, r.website?.replace(/^https?:\/\//i, "")].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "address",
      label: "Address",
      render: (r) => <span className="block max-w-[16rem] truncate text-muted-foreground">{r.address || "—"}</span>,
    },
    { key: "email", label: "Email", render: (r) => <span className="truncate">{r.email || "—"}</span> },
    {
      key: "mobile_no",
      label: "Mobile",
      render: (r) => <span className="whitespace-nowrap text-xs tabular-nums">{r.mobile_no || r.phone || "—"}</span>,
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "source", label: "Source", render: (r) => <span className="text-muted-foreground">{r.source || "—"}</span> },
    {
      key: "lead_owner",
      label: "Owner",
      render: (r) =>
        r.lead_owner ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={r.lead_owner} size="sm" className={avatarTone(r.lead_owner)} />
            <span className="truncate text-xs">{r.lead_owner}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "modified",
      label: "Updated",
      sortable: true,
      getValue: (r) => r.modified ?? "",
      render: (r) => {
        const d = relativeDays(r.modified);
        return <span className="whitespace-nowrap text-xs text-muted-foreground">{d || "—"}</span>;
      },
    },
  ];

  const confirmDelete = async () => {
    if (!pendingDelete?.name) return;
    try {
      await deleteDoc(pendingDelete.name);
      toast.success(`Deleted ${pendingDelete.name}`);
      setPendingDelete(null);
      notifyDataChanged();
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const handleConvertToDeal = async (row: CrmLead) => {
    if (!row.name) return;
    setConverting(row.name);
    try {
      const dealName = await convertCrmLeadToDeal(row.name, row.annual_revenue);
      toast.success(`Deal ${dealName} created`);
      notifyDataChanged();
      navigate(`/crm/deals/${encodeURIComponent(dealName)}`);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setConverting(null);
    }
  };

  const handleCardMove = async (row: CrmLead, newStatus: string) => {
    try {
      await updateDoc(row.name!, { status: newStatus });
      notifyDataChanged();
      void mutateKanban();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle="Prospects captured from any source, before they become a deal"
        icon={<UserPlus className="h-5 w-5" />}
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
              <Button variant={view === "list" ? "outline" : "ghost"} size="sm" onClick={() => setView("list")} className={view === "list" ? "bg-background shadow-sm" : ""}>
                <List className="h-4 w-4" /> List
              </Button>
              <Button variant={view === "kanban" ? "outline" : "ghost"} size="sm" onClick={() => setView("kanban")} className={view === "kanban" ? "bg-background shadow-sm" : ""}>
                <LayoutGrid className="h-4 w-4" /> Pipeline
              </Button>
            </div>
            <Button variant="primary" onClick={() => navigate("/crm/leads/new")}>
              <Plus className="h-4 w-4" /> New Lead
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {/* Clicking a card filters the List and the Pipeline to it; clicking it again (or Total) releases it. */}
        <StatCard label="Total" value={stats.total} icon={<Users className="h-4 w-4" />} tone="primary" onClick={cardFilter.clear} />
        <StatCard label="New" value={stats.new} icon={<Rocket className="h-4 w-4" />} tone="sky" onClick={() => cardFilter.toggle("new")} active={cardFilter.active === "new"} />
        <StatCard label="Active" value={stats.active} icon={<TrendingUp className="h-4 w-4" />} tone="amber" onClick={() => cardFilter.toggle("active")} active={cardFilter.active === "active"} />
        <StatCard label="Qualified" value={stats.qualified} icon={<Check className="h-4 w-4" />} tone="indigo" onClick={() => cardFilter.toggle("qualified")} active={cardFilter.active === "qualified"} />
        <StatCard label="Converted" value={stats.converted} icon={<Handshake className="h-4 w-4" />} tone="emerald" onClick={() => cardFilter.toggle("converted")} active={cardFilter.active === "converted"} />
      </div>

      <ActiveCardFilter label={cardFilter.active ? LEAD_CARD_LABELS[cardFilter.active] : null} onClear={cardFilter.clear} />

      <LeadTargetWidget />

      {view === "list" ? (
        <FrappeDataTable<CrmLead>
          columns={columns}
          rows={visibleRows}
          rowKey={(r) => r.name ?? ""}
          loading={isLoading}
          error={error}
          onRetry={() => void mutate()}
          onRowClick={(r) => navigate(`/crm/leads/${encodeURIComponent(r.name ?? "")}`)}
          exportFilename="crm-leads"
          emptyTitle="No leads yet"
          emptyDescription="Create your first lead to start the pipeline."
          striped
          searchable={false}
          rowActions={(r) => [
            { label: "Open", icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/crm/leads/${encodeURIComponent(r.name ?? "")}`) },
            {
              label: r.converted ? "Already converted" : "Convert to Deal",
              icon: <Handshake className="h-4 w-4" />,
              onClick: () => void handleConvertToDeal(r),
              disabled: !!r.converted || converting === r.name,
            },
            { separator: true, label: "" },
            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setPendingDelete(r) },
          ]}
          filters={
            <FilterBar>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Search</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email…" className="h-8 w-60 bg-transparent pl-8 text-sm" />
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-44 bg-transparent text-sm">
                    <option value="">All</option>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </label>
                <DateRangeFilterControls labeled filter={dateFilter} fields={LEAD_DATE_FIELDS} field={dateField} onFieldChange={setDateField} />
                {(search || statusFilter || cardFilter.active || dateFilter.active) && (
                  <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); cardFilter.clear(); dateFilter.reset(); }}>
                    <X className="h-4 w-4" /> Clear
                  </Button>
                )}
              </div>
            </FilterBar>
          }
        />
      ) : (
        <>
        <FilterBar>
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilterControls labeled filter={dateFilter} fields={LEAD_DATE_FIELDS} field={dateField} onFieldChange={setDateField} />
            {dateFilter.active && (
              <Button variant="outline" size="sm" onClick={dateFilter.reset}>
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </FilterBar>
        <KanbanBoard<CrmLead>
          columns={visibleKanbanColumns}
          rows={visibleKanbanRows}
          groupField="status"
          rowKey={(r) => r.name ?? ""}
          loading={kanbanLoading}
          onCardMove={handleCardMove}
          onCardClick={(r) => navigate(`/crm/leads/${encodeURIComponent(r.name ?? "")}`)}
          emptyDescription="Create your first lead to start the pipeline."
          renderCard={(r) => (
            <article className="space-y-1.5">
              <RecordId name={r.name} className="block text-[10px]" />
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={leadDisplayName(r)} src={r.image} size="sm" className={avatarTone(leadDisplayName(r))} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{leadDisplayName(r)}</p>
                <div draggable={false} onClick={(e) => e.stopPropagation()} onDragStart={(e) => e.preventDefault()}>
                  <DropdownMenu
                    trigger={
                      <button
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Lead actions"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    }
                    items={[
                      { label: "Open", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => navigate(`/crm/leads/${encodeURIComponent(r.name ?? "")}`) },
                      {
                        label: r.converted ? "Already converted" : "Convert to Deal",
                        icon: <Handshake className="h-3.5 w-3.5" />,
                        onClick: () => void handleConvertToDeal(r),
                        disabled: !!r.converted || converting === r.name,
                      },
                      { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, destructive: true, onClick: () => setPendingDelete(r) },
                    ]}
                  />
                </div>
              </div>
              {r.organization && (
                <p className="flex min-w-0 items-center gap-1 truncate text-xs font-medium text-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{r.organization}
                </p>
              )}
              {r.industry && (
                <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Factory className="h-3.5 w-3.5 shrink-0" />{r.industry}
                </p>
              )}
              {r.website && <WebsiteLink url={r.website} />}
              {r.address && (
                <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2 whitespace-pre-line break-words">{r.address}</span>
                </p>
              )}
              {r.email && (
                <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />{r.email}
                </p>
              )}
              {(r.mobile_no || r.phone) && (
                <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{r.mobile_no || r.phone}</span>
                  {whatsappUrl(r.mobile_no || r.phone) && (
                    <button
                      type="button"
                      title="Call on WhatsApp"
                      onClick={(e) => {
                        e.stopPropagation();
                        void call(r.mobile_no || r.phone, "CRM Lead", r.name);
                      }}
                      className="ml-auto shrink-0 text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </p>
              )}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <StatusBadge status={r.status} />
                {r.lead_owner && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{r.lead_owner}</span>}
              </div>
            </article>
          )}
        />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This permanently removes the lead."
        confirmLabel="Delete"
        destructive
        loading={mutating}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
