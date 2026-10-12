import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Radar, Search, Upload, Pencil, Trash2, UserPlus, X, AlertTriangle, CheckCircle2, Clock, List, LayoutGrid, MoreVertical, Eye, Copy,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { KanbanBoard, type KanbanColumnDef } from "@/components/crm/KanbanBoard";
import { ProspectScrapeForm } from "@/components/crm/ProspectScrapeForm";
import { useCrmManagement } from "@/hooks/useCrmManagement";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { scrapeCrmProspectUrls, convertCrmProspectScrapeToLead, duplicateCrmProspectScrape } from "@/services/api";
import { humanizeError } from "@/services/frappe";
import type { CrmProspectScrape } from "@/types/frappe";

const FIELDS: (keyof CrmProspectScrape)[] = [
  "name", "source_url", "status", "donor_name", "donor_type", "segment", "website",
  "donor_profile_url", "country", "city", "address", "csr_department", "focus_area",
  "proposed_ask", "focal_person", "designation", "email", "phone", "contact_source", "social_media",
  "research_source", "last_research_date", "raw_extract", "scrape_error", "converted_lead", "modified",
];

const STATUS_COLUMNS: KanbanColumnDef[] = [
  { value: "Pending Review", title: "Pending Review" },
  { value: "Approved", title: "Approved" },
  { value: "Converted", title: "Converted" },
  { value: "Rejected", title: "Rejected" },
];

/** Parse one URL per line (or comma-separated) from the paste box / uploaded file. */
function parseUrls(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

export default function ProspectScraperPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlText, setUrlText] = useState("");
  const [scraping, setScraping] = useState(false);
  const [editing, setEditing] = useState<CrmProspectScrape | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmProspectScrape | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");

  const { rows, isLoading, error, mutate, updateDoc, deleteDoc } = useCrmManagement<CrmProspectScrape>({
    doctype: "CRM Prospect Scrape",
    fields: FIELDS,
    orderBy: { field: "modified", order: "desc" },
  });

  const handleScrape = async () => {
    const urls = parseUrls(urlText);
    if (urls.length === 0) {
      toast.error("Paste at least one URL");
      return;
    }
    if (urls.length > 12) {
      toast.error("Scrape at most 12 at a time");
      return;
    }
    setScraping(true);
    try {
      const names = await scrapeCrmProspectUrls(urls);
      toast.success(`Scraped ${names.length} URL${names.length === 1 ? "" : "s"} — review below`);
      setUrlText("");
      await mutate?.();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setScraping(false);
    }
  };

  const handleFileUpload = (file: File) => {
    file.text().then((text) => {
      const urls = parseUrls(text);
      setUrlText((prev) => [...new Set([...parseUrls(prev), ...urls])].join("\n"));
      toast.success(`Loaded ${urls.length} URL${urls.length === 1 ? "" : "s"} from ${file.name}`);
    });
  };

  /** Row / card click: the full-page view of this prospect (the quick-edit dialog is in the row menu). */
  const openDetail = (row: CrmProspectScrape) => {
    if (row.name) navigate(`/crm/prospect-scraper/${encodeURIComponent(row.name)}`);
  };

  const openEdit = (row: CrmProspectScrape) => {
    setEditing(row);
    setFormValues({ ...row });
  };

  const handleSaveEdit = async () => {
    if (!editing?.name) return;
    setSaving(true);
    try {
      await updateDoc(editing.name, formValues);
      toast.success("Saved");
      setEditing(null);
      await mutate?.();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (row: CrmProspectScrape) => {
    if (!row.name) return;
    setConverting(row.name);
    try {
      const leadName = await convertCrmProspectScrapeToLead(row.name);
      toast.success(`Lead ${leadName} created`);
      notifyDataChanged();
      await mutate?.();
      navigate(`/crm/leads/${encodeURIComponent(leadName)}`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setConverting(null);
    }
  };

  /** Copy this company's row so another contact person there can become a second lead; opens it ready to edit. */
  const handleDuplicate = async (row: CrmProspectScrape) => {
    if (!row.name) return;
    try {
      const newName = await duplicateCrmProspectScrape(row.name);
      toast.success("Duplicated — enter the next contact person");
      notifyDataChanged();
      await mutate?.();
      navigate(`/crm/prospect-scraper/${encodeURIComponent(newName)}?edit=1`);
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.name) return;
    try {
      await deleteDoc(deleteTarget.name);
      toast.success("Deleted");
      setDeleteTarget(null);
      await mutate?.();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const handleBulkDelete = async () => {
    const names = [...selectedKeys];
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(names.map((n) => deleteDoc(n)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) {
        toast.error(`Deleted ${names.length - failed} of ${names.length} — ${failed} failed`);
      } else {
        toast.success(`Deleted ${names.length} row${names.length === 1 ? "" : "s"}`);
      }
      setSelectedKeys(new Set());
      setBulkDeleteCount(0);
      await mutate?.();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleStatusMove = async (row: CrmProspectScrape, newStatus: string) => {
    if (!row.name) return;
    try {
      await updateDoc(row.name, { status: newStatus } as Partial<CrmProspectScrape>);
      await mutate?.();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const rowMenuItems = (r: CrmProspectScrape) => [
    { label: "Open full page", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openDetail(r) },
    { label: "Quick edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(r) },
    { label: "Duplicate (another contact)", icon: <Copy className="h-3.5 w-3.5" />, onClick: () => void handleDuplicate(r) },
    {
      label: r.status === "Converted" ? "Already converted" : "Convert to Lead",
      icon: <UserPlus className="h-3.5 w-3.5" />,
      onClick: () => void handleConvert(r),
      disabled: r.status === "Converted" || converting === r.name,
    },
    { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteTarget(r), destructive: true },
  ];

  const list = rows ?? [];
  const pending = list.filter((r) => r.status === "Pending Review").length;
  const failed = list.filter((r) => !!r.scrape_error).length;
  const converted = list.filter((r) => r.status === "Converted").length;

  // Every field gets its own column (rather than a couple of combined
  // "friendly" cells) so the built-in Export button — which only exports
  // currently *visible* columns — can produce a complete download without
  // the user having to unhide fields first.
  const columns: ColumnDef<CrmProspectScrape>[] = [
    {
      key: "donor_name",
      label: "Donor",
      render: (r) => <span className="text-sm font-medium">{r.donor_name || "—"}</span>,
      getValue: (r) => r.donor_name,
    },
    { key: "donor_type", label: "Type", render: (r) => <span className="text-sm">{r.donor_type || "—"}</span> },
    { key: "segment", label: "Segment", render: (r) => <span className="text-sm">{r.segment || "—"}</span> },
    { key: "website", label: "Website", render: (r) => <span className="text-sm">{r.website || "—"}</span> },
    { key: "country", label: "Country", render: (r) => <span className="text-sm">{r.country || "—"}</span> },
    { key: "city", label: "City", render: (r) => <span className="text-sm">{r.city || "—"}</span> },
    { key: "address", label: "Address", render: (r) => <span className="text-sm">{r.address || "—"}</span> },
    { key: "donor_profile_url", label: "Donor Profile URL", render: (r) => <span className="text-sm">{r.donor_profile_url || "—"}</span> },
    { key: "csr_department", label: "CSR/ESG Department", render: (r) => <span className="text-sm">{r.csr_department || "—"}</span> },
    { key: "focus_area", label: "Focus Area", render: (r) => <span className="text-sm">{r.focus_area || "—"}</span> },
    { key: "proposed_ask", label: "Proposed Ask", render: (r) => <span className="text-sm">{r.proposed_ask || "—"}</span> },
    { key: "focal_person", label: "Focal Person", render: (r) => <span className="text-sm">{r.focal_person || "—"}</span> },
    { key: "designation", label: "Designation", render: (r) => <span className="text-sm">{r.designation || "—"}</span> },
    { key: "email", label: "Email", render: (r) => <span className="text-sm">{r.email || "—"}</span> },
    { key: "phone", label: "Phone", render: (r) => <span className="text-sm">{r.phone || "—"}</span> },
    { key: "contact_source", label: "Contact Source", render: (r) => <span className="text-sm">{r.contact_source || "—"}</span> },
    {
      key: "social_media",
      label: "Social Media",
      render: (r) => (
        <span className="text-sm">
          {r.social_media ? r.social_media.split("\n").map((l) => l.split(":")[0]).join(", ") : "—"}
        </span>
      ),
      getValue: (r) => r.social_media,
    },
    { key: "research_source", label: "Research Source", render: (r) => <span className="text-sm">{r.research_source || "—"}</span> },
    { key: "last_research_date", label: "Last Research Date", render: (r) => <span className="text-sm">{r.last_research_date || "—"}</span> },
    { key: "source_url", label: "Source URL", render: (r) => <span className="text-sm">{r.source_url || "—"}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) =>
        r.scrape_error ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" /> Failed
          </span>
        ) : (
          <StatusBadge status={r.status} />
        ),
    },
    { key: "scrape_error", label: "Scrape Error", render: (r) => <span className="text-sm text-destructive">{r.scrape_error || "—"}</span> },
    { key: "converted_lead", label: "Converted Lead", render: (r) => <span className="text-sm">{r.converted_lead || "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospect Scraper"
        subtitle="Pull donor/CSR contact info from public company & NGO websites into a review queue"
        icon={<Radar className="h-5 w-5" />}
        actions={
          <div className="flex rounded-lg border border-input bg-popover p-0.5 shadow-sm">
            <button
              onClick={() => setView("list")}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                view === "kanban" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Pipeline
            </button>
          </div>
        }
      />

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Search className="h-4 w-4 text-primary" /> Scrape URLs or Names
          </span>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload list
            </Button>
          </div>
        </div>
        <Textarea
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder={"One company/NGO per line — a URL or just a name, e.g.\nUnilever Pakistan\nhttps://www.example-ngo.org\nSave the Children"}
          className="min-h-[100px] font-mono text-xs"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {parseUrls(urlText).length} entr{parseUrls(urlText).length === 1 ? "y" : "ies"} ready — up to 12 per run (a
            larger batch risks a request timeout). A bare name is looked up via Wikipedia/Wikidata to find its official
            site; public pages only, and some sites
            block automated requests.
          </p>
          <Button onClick={() => void handleScrape()} loading={scraping} disabled={scraping}>
            <Search className="h-4 w-4" /> Scrape
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={list.length} icon={<Radar className="h-4 w-4" />} tone="sky" />
        <StatCard label="Pending Review" value={pending} icon={<Clock className="h-4 w-4" />} tone="amber" />
        <StatCard label="Scrape Failed" value={failed} icon={<AlertTriangle className="h-4 w-4" />} tone="rose" />
        <StatCard label="Converted" value={converted} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
      </div>

      {view === "list" ? (
        <FrappeDataTable
          columns={columns}
          rows={list}
          rowKey={(r) => String(r.name)}
          loading={isLoading}
          error={error}
          onRetry={() => mutate?.()}
          onRowClick={openDetail}
          exportFilename="prospect-scrape-queue"
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          bulkActions={(selected) => [
            {
              label: `Delete ${selected.length} selected`,
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: () => setBulkDeleteCount(selected.length),
              destructive: true,
            },
          ]}
          rowActions={rowMenuItems}
          emptyTitle="No scraped prospects yet"
          emptyDescription="Paste company/NGO names or website URLs above and click Scrape to start building the review queue."
        />
      ) : (
        <KanbanBoard
          columns={STATUS_COLUMNS}
          rows={list}
          groupField="status"
          rowKey={(r) => String(r.name)}
          loading={isLoading}
          onCardMove={(row, newStatus) => void handleStatusMove(row, newStatus)}
          onCardClick={openDetail}
          emptyDescription="Paste company/NGO names or website URLs above and click Scrape to start building the review queue."
          renderCard={(r) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{r.donor_name || r.source_url || "—"}</p>
                <div className="flex shrink-0 items-center gap-1">
                  {r.scrape_error && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  <div draggable={false} onClick={(e) => e.stopPropagation()} onDragStart={(e) => e.preventDefault()}>
                    <DropdownMenu
                      trigger={
                        <button
                          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Row actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      }
                      items={rowMenuItems(r)}
                    />
                  </div>
                </div>
              </div>
              <p className="truncate text-xs text-muted-foreground">{r.website || r.source_url}</p>
              {(r.email || r.phone) && (
                <p className="truncate text-xs text-muted-foreground">{r.email || r.phone}</p>
              )}
            </div>
          )}
        />
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} size="xl">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Review Scraped Prospect</h2>
            <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <ProspectScrapeForm
              values={formValues}
              onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this scraped row?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteCount > 0}
        title={`Delete ${bulkDeleteCount} selected row${bulkDeleteCount === 1 ? "" : "s"}?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={bulkDeleting}
        onConfirm={() => void handleBulkDelete()}
        onClose={() => setBulkDeleteCount(0)}
      />
    </div>
  );
}
