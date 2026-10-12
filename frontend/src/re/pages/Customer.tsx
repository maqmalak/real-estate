import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Eye, FileText, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams } from "react-router-dom";
import { CustomerInsights, SegmentBadge, useCustomerProfile } from "@/re/components/record/CustomerInsights";
import { openGenerateDocs } from "@/re/components/record/GenerateDocs";
import { IdentityCard } from "@/re/components/record/IdentityCard";
import { RemindButton } from "@/re/components/record/RemindButton";
import { ActivityTimeline, DocActionsPanel } from "@/components/common/activity-panel";
import { ConnectionsPanel } from "@/components/doc/connections-panel";
import { StatusBadge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Card } from "@/re/components/ui/card";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/re/components/ui/tabs";
import { get, getList, post } from "@/re/lib/api";
import { date, dateTime, money } from "@/re/lib/format";
import type { TimelineItem } from "@/re/lib/types";
import { recordUrl } from "@/re/lib/utils";
import { useAuth } from "@/re/providers/auth";
import { CallButtons } from "./Dashboard";

interface CustomerRow { name: string; customer_name: string; mobile_no: string | null; email_id: string | null; account_manager: string | null; creation: string; re_portal_user: string | null }
interface BookingRow { name: string; plot: string; status: string; net_price: number; paid_amount: number; outstanding_amount: number; overdue_amount: number; next_due_date: string | null }
interface PaymentRow { name: string; posting_date: string; amount: number; payment_against: string; plot: string; mode_of_payment: string }

const ICON: Record<string, string> = { whatsapp: "💬", call: "📞", visit: "📍", payment: "💰", booking: "🏠", bill: "🧾", document: "📎", reminder: "🔔", task: "✅", note: "📝", maintenance: "🛠" };

/** Owner-portal login for this customer: shows the linked login, or lets a sales manager create one (welcome email). */
function PortalInvite({ customer, email, portalUser }: { customer: string; email: string | null; portalUser: string | null }) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const invite = useMutation({
    mutationFn: () => post<string>("realestate.portal.invite", { customer }),
    onSuccess: (u) => { toast.success(`Owner portal login ready for ${u} — a welcome email was queued`); void qc.invalidateQueries({ queryKey: ["customer", customer] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (portalUser) {
    const url = `${window.location.origin}/portal`;
    const copy = () => void navigator.clipboard.writeText(url).then(() => toast.success("Portal link copied — the owner signs in with " + portalUser), () => toast.error("Could not copy"));
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs shadow-sm" title="Owner portal: the owner signs in with this email">
        <UserCheck className="size-3.5 text-emerald-600" />
        <span className="text-muted-foreground">{portalUser}</span>
        <span className="mx-0.5 h-3.5 w-px bg-border" />
        <a href={url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline" title="Open the owner portal">{url.replace(/^https?:\/\//, "")}</a>
        <button type="button" onClick={copy} title="Copy the portal link" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="size-3.5" /></button>
      </span>
    );
  }
  if (!hasRole("Sales Manager")) return null;
  return (
    <Button variant="outline" disabled={!email || invite.isPending} title={email ? `Create a portal login for ${email}` : "Add an email address to the customer first"}
      onClick={() => { if (window.confirm(`Create an owner-portal login for ${email} and send the welcome email?`)) invite.mutate(); }}>
      <UserPlus /> Invite to owner portal
    </Button>
  );
}

export function CustomerPage() {
  const { customer = "" } = useParams();
  const { data: c, isLoading } = useQuery({
    queryKey: ["customer", customer],
    queryFn: async () => (await getList<CustomerRow>("Customer", { fields: ["name", "customer_name", "mobile_no", "email_id", "account_manager", "creation", "re_portal_user"], filters: [["name", "=", customer]], limit: 1 }))[0],
  });
  const { data: bookings } = useQuery({
    queryKey: ["customer-bookings", customer],
    queryFn: () => getList<BookingRow>("RE Booking", { fields: ["name", "plot", "status", "net_price", "paid_amount", "outstanding_amount", "overdue_amount", "next_due_date"],
      filters: [["customer", "=", customer], ["docstatus", "=", 1]], orderBy: "booking_date desc" }),
  });
  const { data: payments } = useQuery({
    queryKey: ["customer-payments", customer],
    queryFn: () => getList<PaymentRow>("RE Payment", { fields: ["name", "posting_date", "amount", "payment_against", "plot", "mode_of_payment"],
      filters: [["customer", "=", customer], ["docstatus", "=", 1]], orderBy: "posting_date desc", limit: 200 }),
  });
  const { data: timeline } = useQuery({
    queryKey: ["timeline", customer],
    queryFn: () => get<TimelineItem[]>("realestate.api.get_timeline", { party_type: "Customer", party: customer }),
  });

  const { data: profile } = useCustomerProfile(customer);

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!c) return <div className="p-6"><Empty title="Customer not found" /></div>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">{c.customer_name}{profile && <SegmentBadge segment={profile.segment} />}</h1>
          <p className="text-sm text-muted-foreground">{c.mobile_no ?? "No mobile"} · customer since {date(c.creation)}{c.account_manager ? ` · agent ${c.account_manager}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <CallButtons phone={c.mobile_no} partyType="Customer" party={c.name} />
          <PortalInvite customer={c.name} email={c.email_id} portalUser={c.re_portal_user} />
          <Button variant="outline" onClick={() => openGenerateDocs({ doctype: "Customer", name: c.name, types: ["Customer Account Statement"] })}
            title="Account statement on the letterhead, in English or Urdu"><FileText /> Statement</Button>
          <Button variant="outline" asChild title="See the owner portal exactly as this owner sees it (read-only)">
            <a href={`/portal?as=${encodeURIComponent(c.name)}`} target="_blank" rel="noreferrer"><Eye /> View portal as owner</a>
          </Button>
          <Button variant="outline" asChild><Link to={`/masters/customers/${encodeURIComponent(c.name)}`}><ExternalLink /> Customer record</Link></Button>
        </div>
      </div>
      <CustomerInsights customer={c.name} />
      <IdentityCard customer={c.name} />
      <Tabs defaultValue="plots">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="plots">Plots & bookings</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="plots" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {bookings?.map((b) => {
            const pct = Math.round((b.paid_amount * 100) / Math.max(b.net_price, 1));
            return (
              <Card key={b.name} className="p-4">
                <div className="flex items-start justify-between">
                  <Link to={`/re/plots/${b.plot}`} className="text-lg font-bold hover:underline">{b.plot}</Link>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-xs text-muted-foreground">{b.name}</p>
                <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1 text-sm">{money(b.paid_amount)} of {money(b.net_price)} ({pct}%)</p>
                {b.overdue_amount > 0 && <p className="text-sm font-semibold text-destructive">Overdue {money(b.overdue_amount)}</p>}
                {b.status !== "Paid" && (
                  <div className="mt-2"><RemindButton type={b.overdue_amount > 0 ? "Overdue Notice" : "Installment Reminder"} doctype="RE Booking" name={b.name}
                    label={b.overdue_amount > 0 ? "Send overdue notice" : "Send reminder"} /></div>
                )}
                <p className="text-xs text-muted-foreground">Next due {date(b.next_due_date)}</p>
              </Card>
            );
          })}
          {!bookings?.length && <Empty title="No bookings" />}
        </TabsContent>
        <TabsContent value="ledger">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Date", "Receipt", "Plot", "Against", "Mode", "Amount"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {payments?.map((p) => (
                  <tr key={p.name} className="border-t"><td className="px-3 py-1.5">{date(p.posting_date)}</td><td className="px-3">{p.name}</td><td className="px-3">{p.plot}</td>
                    <td className="px-3">{p.payment_against}</td><td className="px-3">{p.mode_of_payment}</td><td className="px-3 font-medium">{money(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          {!timeline?.length ? <Empty title="Nothing yet" /> : (
            <ol className="space-y-2">
              {timeline.map((t, i) => (
                <li key={`${t.doctype}-${t.name}-${i}`} className="flex gap-3 rounded-md border bg-card p-3 text-sm">
                  <span className="text-lg">{ICON[t.kind] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.doctype && t.name ? <Link className="font-medium hover:underline" to={recordUrl(t.doctype, t.name)}>{t.title}</Link> : <span className="font-medium">{t.title}</span>}
                      <StatusBadge status={t.status} />
                    </div>
                    {t.body && <p className="truncate text-muted-foreground">{t.body}</p>}
                    <p className="text-xs text-muted-foreground">{dateTime(t.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
        {/* same Connections and Activity as every form (booking, plot …): linked-record chips + field picker, comments + activity chain
            with assignments / attachments / tags / sharing on the right */}
        <TabsContent value="connections"><ConnectionsPanel doctype="Customer" name={c.name} /></TabsContent>
        <TabsContent value="activity">
          <ActivityTimeline doctype="Customer" docname={c.name}
            aside={<DocActionsPanel doctype="Customer" docname={c.name} title={c.customer_name} caption="Customer · assignments, files & sharing" />} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
