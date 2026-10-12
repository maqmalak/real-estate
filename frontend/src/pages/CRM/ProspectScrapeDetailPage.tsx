import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useFrappeDeleteDoc, useFrappeGetDoc, useFrappeUpdateDoc } from "frappe-react-sdk";
import {
  Radar, ArrowLeft, Pencil, Save, Trash2, UserPlus, X, AlertTriangle, ExternalLink, Building2, MapPin, HeartHandshake,
  User, Check, Ban, Mail, Phone, FileText, Copy,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ProspectScrapeForm } from "@/components/crm/ProspectScrapeForm";
import { convertCrmProspectScrapeToLead, duplicateCrmProspectScrape } from "@/services/api";
import { humanizeError } from "@/services/frappe";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatDate, formatDateTime } from "@/utils/dates";
import type { CrmProspectScrape } from "@/types/frappe";

const Empty = () => <span className="font-normal text-muted-foreground">—</span>;

function Info({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 min-w-0 break-words text-sm font-medium">{children}</div>
    </div>
  );
}

/** An external URL as a compact link; the scraper stores bare "https://…" strings, sometimes without a scheme. */
function Ext({ url }: { url?: string | null }) {
  if (!url) return <Empty />;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-primary hover:underline">
      <span className="truncate">{url.replace(/^https?:\/\//i, "")}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** social_media is stored as "Platform: url" lines. */
function parseSocial(text?: string): { label: string; url: string }[] {
  return (text ?? "")
    .split("\n")
    .map((line) => {
      const i = line.indexOf(":");
      return i > 0 ? { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() } : null;
    })
    .filter((x): x is { label: string; url: string } => !!x && !!x.url);
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
      {children}
    </span>
  );
}

/** Full-page view of one scraped prospect (opened by clicking a row / card on the Prospect Scraper list). */
export default function ProspectScrapeDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: doc, error, isLoading, mutate } = useFrappeGetDoc<CrmProspectScrape>("CRM Prospect Scrape", name);
  const { updateDoc } = useFrappeUpdateDoc();
  const { deleteDoc } = useFrappeDeleteDoc();

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // `?edit=1` (set right after Duplicate) opens the page already in edit mode, so the next contact person
  // can be typed straight in. Handled once, then dropped from the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("edit") === "1" && doc) {
      setValues({ ...doc });
      setEditing(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("edit");
        return next;
      }, { replace: true });
    }
  }, [searchParams, doc, setSearchParams]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-72 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">{humanizeError(error) || "Prospect not found"}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={() => navigate("/crm/prospect-scraper")}>
            Back to list
          </Button>
          <Button onClick={() => void mutate()}>Retry</Button>
        </div>
      </div>
    );
  }

  const title = doc.donor_name || doc.website || doc.source_url || doc.name || "Prospect";
  const converted = doc.status === "Converted";
  const social = parseSocial(doc.social_media);
  const place = [doc.city, doc.country].filter(Boolean).join(", ");

  const startEdit = () => {
    setValues({ ...doc });
    setEditing(true);
  };

  const save = async () => {
    if (!doc.name) return;
    setSaving(true);
    try {
      await updateDoc("CRM Prospect Scrape", doc.name, values);
      toast.success("Saved");
      setEditing(false);
      notifyDataChanged();
      await mutate();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: CrmProspectScrape["status"]) => {
    if (!doc.name) return;
    try {
      await updateDoc("CRM Prospect Scrape", doc.name, { status });
      toast.success(`Marked ${status}`);
      notifyDataChanged();
      await mutate();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const convert = async () => {
    if (!doc.name) return;
    setConverting(true);
    try {
      const leadName = await convertCrmProspectScrapeToLead(doc.name);
      toast.success(`Lead ${leadName} created`);
      notifyDataChanged();
      navigate(`/crm/leads/${encodeURIComponent(leadName)}`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setConverting(false);
    }
  };

  const duplicate = async () => {
    if (!doc.name) return;
    setDuplicating(true);
    try {
      const newName = await duplicateCrmProspectScrape(doc.name);
      toast.success("Duplicated — enter the next contact person");
      notifyDataChanged();
      navigate(`/crm/prospect-scraper/${encodeURIComponent(newName)}?edit=1`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDuplicating(false);
    }
  };

  const remove = async () => {
    if (!doc.name) return;
    try {
      await deleteDoc("CRM Prospect Scrape", doc.name);
      toast.success("Deleted");
      notifyDataChanged();
      navigate("/crm/prospect-scraper");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={doc.website || doc.source_url}
        icon={<Radar className="h-5 w-5" />}
        actions={
          editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button onClick={() => void save()} loading={saving}>
                <Save className="h-4 w-4" /> Save changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => navigate("/crm/prospect-scraper")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button
                variant="outline"
                onClick={() => void duplicate()}
                loading={duplicating}
                disabled={duplicating}
                title="Copy this company's details to add another contact person — converts to a separate lead"
              >
                <Copy className="h-4 w-4" /> Duplicate
              </Button>
              <Button variant="outline" onClick={startEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              {!converted && (
                <Button variant="primary" onClick={() => void convert()} loading={converting} disabled={converting}>
                  <UserPlus className="h-4 w-4" /> Convert to Lead
                </Button>
              )}
            </>
          )
        }
      />

      {doc.scrape_error && (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">This site couldn't be read completely</p>
            <p className="mt-0.5 break-words text-sm text-muted-foreground">{doc.scrape_error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fill in the missing details with Edit, or scrape a corrected URL from the Prospect Scraper page.
            </p>
          </div>
        </Card>
      )}

      {editing ? (
        <ProspectScrapeForm
          layout="grid"
          values={values}
          onChange={(fieldname, value) => setValues((v) => ({ ...v, [fieldname]: value }))}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={doc.status} />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="mt-1 flex items-center gap-1.5 truncate font-medium">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {place || "—"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="mt-1 flex items-center gap-1.5 truncate font-medium">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {doc.phone ? (
                  <a href={`tel:${doc.phone.replace(/[^\d+]/g, "")}`} className="truncate hover:underline">
                    {doc.phone}
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="mt-1 flex items-center gap-1.5 truncate font-medium">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {doc.email ? (
                  <a href={`mailto:${doc.email}`} className="truncate hover:underline">
                    {doc.email}
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <SectionCard title={undefined}>
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">
                      <SectionTitle icon={<Building2 className="h-3.5 w-3.5" />}>Identity</SectionTitle>
                    </h3>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <Info label="Donor name">{doc.donor_name || <Empty />}</Info>
                      <Info label="Donor type">{doc.donor_type || <Empty />}</Info>
                      <Info label="Segment">{doc.segment || <Empty />}</Info>
                      <Info label="Website">
                        <Ext url={doc.website} />
                      </Info>
                      <Info label="Profile / deeper page" wide>
                        <Ext url={doc.donor_profile_url} />
                      </Info>
                    </div>
                  </div>

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold">
                      <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />}>Location</SectionTitle>
                    </h3>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <Info label="Country">{doc.country || <Empty />}</Info>
                      <Info label="City">{doc.city || <Empty />}</Info>
                      <Info label="Address" wide>
                        {doc.address ? <span className="whitespace-pre-line">{doc.address}</span> : <Empty />}
                      </Info>
                    </div>
                  </div>

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold">
                      <SectionTitle icon={<HeartHandshake className="h-3.5 w-3.5" />}>Fundraising</SectionTitle>
                    </h3>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <Info label="CSR / ESG department">{doc.csr_department || <Empty />}</Info>
                      <Info label="Focus area">{doc.focus_area || <Empty />}</Info>
                      <Info label="Proposed ask" wide>
                        {doc.proposed_ask ? <span className="whitespace-pre-line">{doc.proposed_ask}</span> : <Empty />}
                      </Info>
                    </div>
                  </div>

                  <div className="border-t border-border pt-5">
                    <h3 className="mb-3 text-sm font-semibold">
                      <SectionTitle icon={<User className="h-3.5 w-3.5" />}>Contact</SectionTitle>
                    </h3>
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <Info label="Focal person">{doc.focal_person || <Empty />}</Info>
                      <Info label="Designation">{doc.designation || <Empty />}</Info>
                      <Info label="Email">
                        {doc.email ? (
                          <a href={`mailto:${doc.email}`} className="text-primary hover:underline">
                            {doc.email}
                          </a>
                        ) : (
                          <Empty />
                        )}
                      </Info>
                      <Info label="Phone">{doc.phone || <Empty />}</Info>
                      <Info label="Contact source" wide>
                        <Ext url={doc.contact_source} />
                      </Info>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Raw extract" description="What the scraper read from the page (page description, or the start of its text).">
                {doc.raw_extract ? (
                  <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                    {doc.raw_extract}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing was extracted.</p>
                )}
              </SectionCard>
            </div>

            <div className="space-y-4">
              <SectionCard title="Review">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <StatusBadge status={doc.status} />
                  </div>
                  {converted ? (
                    doc.converted_lead ? (
                      <Link
                        to={`/crm/leads/${encodeURIComponent(doc.converted_lead)}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <span className="flex items-center gap-1.5">
                          <UserPlus className="h-4 w-4 text-muted-foreground" /> Converted to lead
                        </span>
                        <span className="font-medium text-primary">{doc.converted_lead}</span>
                      </Link>
                    ) : null
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void setStatus("Approved")} disabled={doc.status === "Approved"}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void setStatus("Rejected")} disabled={doc.status === "Rejected"}>
                        <Ban className="h-3.5 w-3.5" /> Reject
                      </Button>
                      {doc.status !== "Pending Review" && (
                        <Button size="sm" variant="ghost" onClick={() => void setStatus("Pending Review")}>
                          Back to pending
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Social media">
                {social.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No social profiles found.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {social.map((s) => (
                      <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{s.label}</span>
                        <Ext url={s.url} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Research">
                <div className="space-y-3">
                  <Info label="Source URL">
                    <Ext url={doc.source_url} />
                  </Info>
                  <Info label="Found via">{doc.research_source ? <span className="break-all">{doc.research_source}</span> : <Empty />}</Info>
                  <Info label="Last researched">{doc.last_research_date ? formatDate(doc.last_research_date) : <Empty />}</Info>
                  <Info label="Record">
                    <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" /> {doc.name}
                    </span>
                  </Info>
                  <Info label="Created">{doc.creation ? formatDateTime(doc.creation) : <Empty />}</Info>
                  <Info label="Updated">{doc.modified ? formatDateTime(doc.modified) : <Empty />}</Info>
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this scraped prospect?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
