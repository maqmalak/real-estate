import { CrmContactCard } from "@/components/crm/contact-card";
import { CrmCommentItem } from "@/components/crm/comment-item";
import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Handshake, Pencil, CheckSquare, MessageSquare, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { CRM_TASK_FIELDS } from "@/components/forms/form-configs";
import { useCrmDeal } from "@/hooks/useCrmDeals";
import { useCrmActivities, useCrmNotes, describeCrmActivity } from "@/hooks/useCrmActivities";
import { useCrmTasks, useCrmTaskMutations } from "@/hooks/useCrmTasks";
import { ConnectionsPanel, EmailPanel, WhatsAppPanel, useLinkedEvents, type ConnectionGroup } from "@/components/crm/doc-panels";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { humanizeError } from "@/services/frappe";
import { formatDateTime } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import { useWhatsAppCall } from "@/hooks/useWhatsAppCall";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import type { CrmTask } from "@/types/frappe";

export function DealDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { data: deal, error, isLoading, mutate } = useCrmDeal(name);
  const { activities, isLoading: activitiesLoading, addComment, mutate: mutateActivities } = useCrmActivities(name);
  const { data: notes } = useCrmNotes("CRM Deal", name);
  const { data: tasks, mutate: mutateTasks } = useCrmTasks({ referenceDoctype: "CRM Deal", referenceDocname: name, category: "Follow-up" });
  const { createDoc: createTask, setStatus, loading: taskSaving } = useCrmTaskMutations();
  const { data: leadDocs, isLoading: leadLoading } = useFrappeGetDocList<{ name: string; lead_name: string; status: string; email: string }>("CRM Lead", {
    fields: ["name", "lead_name", "status", "email"],
    filters: [["name", "=", deal?.lead ?? "none"]],
    limit: 1,
  }, deal?.lead ? `micromax.crm.deal.lead.${deal.lead}` : null);
  const { events: linkedEvents, isLoading: eventsLoading } = useLinkedEvents("CRM Deal", name);

  const connectionGroups: ConnectionGroup[] = [
    {
      title: "Linked Lead",
      items: (leadDocs ?? []).map((l) => ({
        label: l.lead_name || l.name,
        sub: `${l.status}${l.email ? ` · ${l.email}` : ""}`,
        to: `/crm/leads/${encodeURIComponent(l.name)}`,
        tone: "sky" as const,
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
  ];

  const { call } = useWhatsAppCall();
  const [comment, setComment] = useState("");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskValues, setTaskValues] = useState<Partial<CrmTask>>({ status: "Todo", priority: "Medium", assigned_to: currentUser ?? undefined });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }
  if (error || !deal) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">{humanizeError(error) || "Deal not found"}</p>
        <Button className="mt-3" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  const title = deal.organization || deal.organization_name || deal.name;

  const submitComment = async () => {
    if (!comment.trim()) return;
    try {
      await addComment(comment.trim(), "CRM Deal");
      setComment("");
      toast.success("Comment added");
    } catch (err) {
      toast.error(humanizeError(err));
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
        reference_doctype: "CRM Deal",
        reference_docname: name,
      });
      toast.success("Follow-up task created");
      notifyDataChanged();
      setTaskModalOpen(false);
      setTaskValues({ status: "Todo", priority: "Medium", assigned_to: currentUser ?? undefined });
      void mutateTasks();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const markTaskDone = async (task: CrmTask) => {
    try {
      await setStatus(task.name!, "Done");
      void mutateTasks();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title ?? "Deal"}
        subtitle={deal.lead_name || deal.email}
        icon={<Handshake className="h-5 w-5" />}
        actions={
          <>
            <DocActionsMenu doctype="CRM Deal" doc={deal as any} onChanged={() => void mutate()} />
            <Button onClick={() => navigate(`/crm/deals/${encodeURIComponent(name!)}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        }
      />
      <DocPageTabs doctype="CRM Deal" name={deal?.name ?? name} />

      <CrmContactCard
        name={deal.lead_name || [deal.first_name, deal.last_name].filter(Boolean).join(' ') || deal.organization || deal.name}
        status={deal.status}
        email={deal.email}
        phone={deal.mobile_no || deal.phone}
        onWhatsApp={() => void call(deal.mobile_no || deal.phone, "CRM Deal", name)}
        extra={<span className="font-bold tabular-nums">{formatMoney(deal.deal_value ?? deal.expected_deal_value, deal.currency)}</span>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
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
            referenceDoctype="CRM Deal"
            referenceDocname={name}
            referenceDoc={deal}
            defaultRecipient={deal.email}
          />

          <WhatsAppPanel
            referenceDoctype="CRM Deal"
            referenceDocname={name}
            defaultRecipient={deal.mobile_no || deal.phone}
          />
        </div>

        <div className="space-y-4">
          <ConnectionsPanel groups={connectionGroups} loading={leadLoading || eventsLoading} />
          <SectionCard
            title="Follow-ups"
            actions={
              <Button size="sm" variant="outline" onClick={() => setTaskModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          >
            {(tasks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {(tasks ?? []).map((t) => (
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

          <SectionCard title="Notes">
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
    </div>
  );
}
