import { CrmContactCard } from "@/components/crm/contact-card";
import { CrmCommentItem } from "@/components/crm/comment-item";
import { SecondContactCard } from "@/components/crm/second-contact-card";
import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { UserPlus, Pencil, Building2, CheckSquare, MessageSquare, Plus, Handshake, Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { CRM_TASK_FIELDS, CRM_NOTE_FIELDS } from "@/components/forms/form-configs";
import { useCrmLead } from "@/hooks/useCrmLeads";
import { useCrmActivities, useCrmNotes, useCrmCallLogs, useCrmNoteMutations, describeCrmActivity } from "@/hooks/useCrmActivities";
import { useCrmTasks, useCrmTaskMutations } from "@/hooks/useCrmTasks";
import { OrganizationPortfolioCard } from "@/components/crm/OrganizationPortfolioCard";
import { ConnectionsPanel, EmailPanel, WhatsAppPanel, AttachmentsPanel, useLinkedEvents, type ConnectionGroup } from "@/components/crm/doc-panels";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { convertCrmLeadToDeal } from "@/services/api";
import { humanizeError } from "@/services/frappe";
import { useWhatsAppCall } from "@/hooks/useWhatsAppCall";
import { formatDateTime } from "@/utils/dates";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import type { CrmTask, CrmNote } from "@/types/frappe";

export function LeadDetailPage() {
  const { name } = useParams<{ name: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { data: lead, error, isLoading, mutate } = useCrmLead(name);
  const { activities, isLoading: activitiesLoading, addComment, mutate: mutateActivities } = useCrmActivities(name);
  const { data: notes, isLoading: notesLoading, mutate: mutateNotes } = useCrmNotes("CRM Lead", name);
  const { data: callLogs, isLoading: callLogsLoading } = useCrmCallLogs("CRM Lead", name);
  // Task and Follow-up both live on CRM Task, distinguished by task_category
  // — fetched separately so the "Tasks" connections item and the
  // "Follow-ups" card each show their own bucket instead of the exact same
  // rows twice on this page.
  const { data: tasks } = useCrmTasks({ referenceDoctype: "CRM Lead", referenceDocname: name, category: "Task" });
  const { data: followUps, mutate: mutateFollowUps } = useCrmTasks({ referenceDoctype: "CRM Lead", referenceDocname: name, category: "Follow-up" });
  const { createDoc: createTask, setStatus, loading: taskSaving } = useCrmTaskMutations();
  const { createDoc: createNote, loading: noteSaving } = useCrmNoteMutations();
  const { data: linkedDeals, isLoading: dealsLoading } = useFrappeGetDocList<{ name: string; organization: string; status: string; deal_value: number }>("CRM Deal", {
    fields: ["name", "organization", "status", "deal_value"],
    filters: [["lead", "=", name ?? ""]],
    orderBy: { field: "modified", order: "desc" },
    limit: 20,
  }, name ? `micromax.crm.lead.deals.${name}` : null);
  const { events: linkedEvents, isLoading: eventsLoading } = useLinkedEvents("CRM Lead", name);

  const connectionGroups: ConnectionGroup[] = [
    {
      title: "Deals",
      items: (linkedDeals ?? []).map((d) => ({
        label: d.organization || d.name,
        sub: `${d.status}${d.deal_value ? ` · ${d.deal_value.toLocaleString()}` : ""}`,
        to: `/crm/deals/${encodeURIComponent(d.name)}`,
        tone: "emerald" as const,
      })),
    },
    {
      title: "Scheduled Activities",
      items: linkedEvents.map((e) => ({
        label: e.subject || "(untitled)",
        sub: `${e.event_type} · ${formatDateTime(e.starts_on)}`,
        to: "/crm/calendar",
        tone: "indigo" as const,
      })),
    },
    // Task/Note/Call Log have no forward Link field on CRM Lead — each is
    // looked up in reverse via its own reference_doctype/reference_docname,
    // exactly like Notes/Follow-ups above. There's no per-record detail
    // *route*, so these deep-link to the record's management list with
    // `?open=<name>`, which auto-opens that row's edit dialog (see
    // CrmManagementPage's `open` query-param handling).
    {
      title: "Tasks",
      items: (tasks ?? []).map((t) => ({
        label: t.title,
        sub: `${t.status}${t.due_date ? ` · ${formatDateTime(t.due_date)}` : ""}`,
        to: `/crm/tasks?open=${encodeURIComponent(t.name ?? "")}`,
        tone: "amber" as const,
      })),
    },
    {
      title: "Notes",
      items: (notes ?? []).map((n) => ({
        label: n.title || "(untitled note)",
        sub: formatDateTime(n.modified),
        to: `/crm/notes?open=${encodeURIComponent(n.name ?? "")}`,
        tone: "slate" as const,
      })),
    },
    {
      title: "Call Logs",
      items: (callLogs ?? []).map((c) => ({
        label: `${c.type === "Outgoing" ? c.to : c.from} · ${c.type ?? "Incoming"}`,
        sub: `${c.status}${c.start_time ? ` · ${formatDateTime(c.start_time)}` : ""}`,
        to: `/crm/call-logs?open=${encodeURIComponent(c.name ?? "")}`,
        tone: "sky" as const,
      })),
    },
  ];

  const [comment, setComment] = useState("");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskValues, setTaskValues] = useState<Partial<CrmTask>>({ status: "Todo", priority: "Medium", assigned_to: currentUser ?? undefined });
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteValues, setNoteValues] = useState<Partial<CrmNote>>({});
  const [converting, setConverting] = useState(false);
  const { call } = useWhatsAppCall();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }
  if (error || !lead) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">{humanizeError(error) || "Lead not found"}</p>
        <Button className="mt-3" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  const fullName = lead.lead_name || `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.name;

  const submitComment = async () => {
    if (!comment.trim()) return;
    try {
      await addComment(comment.trim(), "CRM Lead");
      setComment("");
      toast.success("Comment added");
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const handleConvertToDeal = async () => {
    if (!name) return;
    setConverting(true);
    try {
      const dealName = await convertCrmLeadToDeal(name, lead?.annual_revenue);
      toast.success(`Deal ${dealName} created`);
      notifyDataChanged();
      navigate(`/crm/deals/${encodeURIComponent(dealName)}`);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setConverting(false);
    }
  };

  const submitTask = async () => {
    if (!taskValues.title || !taskValues.due_date) {
      toast.error("Title and due date are required — pick both a date and a time");
      return;
    }
    try {
      await createTask({
        ...taskValues,
        task_category: "Follow-up",
        reference_doctype: "CRM Lead",
        reference_docname: name,
      });
      toast.success("Follow-up task created");
      notifyDataChanged();
      setTaskModalOpen(false);
      setTaskValues({ status: "Todo", priority: "Medium", assigned_to: currentUser ?? undefined });
      void mutateFollowUps();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const markTaskDone = async (task: CrmTask) => {
    try {
      await setStatus(task.name!, "Done");
      void mutateFollowUps();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const submitNote = async () => {
    if (!noteValues.title || !noteValues.content) {
      toast.error("Title and content are required");
      return;
    }
    try {
      await createNote(noteValues, "CRM Lead", name!);
      toast.success("Note added");
      notifyDataChanged();
      setNoteModalOpen(false);
      setNoteValues({});
      void mutateNotes();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName ?? "Lead"}
        subtitle={lead.organization || lead.email}
        icon={<UserPlus className="h-5 w-5" />}
        actions={
          <>
            <DocActionsMenu doctype="CRM Lead" doc={lead as any} onChanged={() => void mutate()} />
            {!lead.converted && (
              <Button variant="outline" onClick={() => void handleConvertToDeal()} loading={converting} disabled={converting}>
                <Handshake className="h-4 w-4" /> Convert to Deal
              </Button>
            )}
            <Button onClick={() => navigate(`/crm/leads/${encodeURIComponent(name!)}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        }
      />
      <DocPageTabs
        doctype="CRM Lead"
        name={lead?.name ?? name}
        extraTabs={[{
          id: "second_contact",
          label: "Second Contact",
          icon: Users,
          badge: lead.second_contact_name ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" /> : undefined,
          content: (
            <SecondContactCard
              organization={lead.organization}
              editUrl={`/crm/leads/${encodeURIComponent(name!)}/edit`}
              onWhatsApp={(phone) => void call(phone, "CRM Lead", name)}
              contact={{
                name: lead.second_contact_name,
                gender: lead.second_contact_gender,
                designation: lead.second_contact_designation,
                email: lead.second_contact_email,
                mobile: lead.second_contact_mobile,
              }}
            />
          ),
        }]}
      />

      <CrmContactCard
        name={fullName}
        status={lead.status}
        email={lead.email}
        phone={lead.mobile_no || lead.phone}
        onWhatsApp={() => void call(lead.mobile_no || lead.phone, "CRM Lead", name)}
        extra={lead.organization ? <span className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="h-3.5 w-3.5" />{lead.organization}</span> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <OrganizationPortfolioCard organization={lead.organization} currentLead={name} />

          <SectionCard title="Activity">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="min-h-[60px] flex-1"
                />
                <Button onClick={() => void submitComment()} disabled={!comment.trim()}>
                  <MessageSquare className="h-4 w-4" /> Post
                </Button>
              </div>
              {activitiesLoading ? (
                <div className="h-16 w-full animate-pulse rounded bg-muted" />
              ) : activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-3 border-t border-border pt-3">
                  {activities.map((a, i) => (
                    <li key={a.name ?? `${a.activity_type}-${i}`} className="text-sm">
                      {a.activity_type === "comment" ? (
                        <CrmCommentItem name={a.name} owner={a.owner} content={a.content} currentUser={currentUser} onSaved={() => void mutateActivities()} />
                      ) : (
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">{a.owner}</span> {describeCrmActivity(a)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDateTime(a.creation)}</p>
                      {a.other_versions && a.other_versions.length > 0 && (
                        <ul className="ml-3 mt-1 space-y-0.5 border-l border-border pl-2">
                          {a.other_versions.map((v, vi) => (
                            <li key={vi} className="text-xs text-muted-foreground">
                              {describeCrmActivity(v)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SectionCard>

          <EmailPanel
            referenceDoctype="CRM Lead"
            referenceDocname={name}
            referenceDoc={lead}
            defaultRecipient={lead.email}
          />

          <WhatsAppPanel
            referenceDoctype="CRM Lead"
            referenceDocname={name}
            defaultRecipient={lead.mobile_no || lead.phone}
          />

          <AttachmentsPanel doctype="CRM Lead" docname={name} />
        </div>

        <div className="space-y-4">
          <ConnectionsPanel
            groups={connectionGroups}
            loading={dealsLoading || eventsLoading || notesLoading || callLogsLoading}
          />
          <SectionCard
            title="Follow-ups"
            actions={
              <Button size="sm" variant="outline" onClick={() => setTaskModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          >
            {(followUps ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {(followUps ?? []).map((t) => (
                  <li key={t.name} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(t.due_date)}</p>
                      <Badge variant="outline" className="mt-1">{t.status}</Badge>
                    </div>
                    {t.status !== "Done" && (
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-primary"
                        title="Mark done"
                        onClick={() => void markTaskDone(t)}
                      >
                        <CheckSquare className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Notes"
            actions={
              <Button size="sm" variant="outline" onClick={() => setNoteModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          >
            {(notes ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {(notes ?? []).map((n) => (
                  <li key={n.name} className="rounded-md border border-border p-2 text-sm">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(n.modified)}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <Dialog open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="New Follow-up">
        <div className="space-y-4">
          <FrappeForm
            fields={CRM_TASK_FIELDS}
            values={taskValues}
            onChange={(f, v) => setTaskValues((prev) => ({ ...prev, [f]: v }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitTask()} disabled={taskSaving}>
              Create Follow-up
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={noteModalOpen} onClose={() => setNoteModalOpen(false)} title="New Note">
        <div className="space-y-4">
          <FrappeForm
            fields={CRM_NOTE_FIELDS}
            values={noteValues}
            onChange={(f, v) => setNoteValues((prev) => ({ ...prev, [f]: v }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitNote()} disabled={noteSaving}>
              Create Note
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
