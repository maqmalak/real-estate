import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams } from "react-router-dom";
import { IdentityCard } from "@/re/components/record/IdentityCard";
import { RemindButton } from "@/re/components/record/RemindButton";
import { ActivityTab, AssignTab, AttachmentsTab, ConnectionsTab, EmailTab } from "@/re/components/record/RecordTabs";
import { StatusBadge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Card, CardContent } from "@/re/components/ui/card";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/re/components/ui/tabs";
import { get, getList, post } from "@/re/lib/api";
import { date, dateTime, money } from "@/re/lib/format";
import type { TimelineItem } from "@/re/lib/types";
import { deskUrl, slug } from "@/re/lib/utils";
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
  if (portalUser) return <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground" title="Owner portal login"><UserCheck className="size-3.5 text-emerald-600" />{portalUser}</span>;
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
  const { boot } = useAuth();
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

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!c) return <div className="p-6"><Empty title="Customer not found" /></div>;
  const totals = (bookings ?? []).reduce((a, b) => ({ net: a.net + b.net_price, paid: a.paid + b.paid_amount, overdue: a.overdue + b.overdue_amount }), { net: 0, paid: 0, overdue: 0 });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c.customer_name}</h1>
          <p className="text-sm text-muted-foreground">{c.mobile_no ?? "No mobile"} · customer since {date(c.creation)}{c.account_manager ? ` · agent ${c.account_manager}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <CallButtons phone={c.mobile_no} />
          <PortalInvite customer={c.name} email={c.email_id} portalUser={c.re_portal_user} />
          <Button variant="outline" asChild><a href={deskUrl(`customer/${encodeURIComponent(c.name)}`)} target="_blank" rel="noreferrer"><ExternalLink /> Desk (chat & timeline)</a></Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total booked</p><p className="text-xl font-bold">{money(totals.net)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Paid</p><p className="text-xl font-bold">{money(totals.paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Overdue</p><p className="text-xl font-bold text-destructive">{money(totals.overdue)}</p></CardContent></Card>
      </div>
      <IdentityCard customer={c.name} />
      <Tabs defaultValue="plots">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="plots">Plots & bookings</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="assign">Assign</TabsTrigger>
          <TabsTrigger value="files">Attachments</TabsTrigger>
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
                      {t.doctype && t.name ? <a className="font-medium hover:underline" href={deskUrl(`${slug(t.doctype)}/${encodeURIComponent(t.name)}`)} target="_blank" rel="noreferrer">{t.title}</a> : <span className="font-medium">{t.title}</span>}
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
        <TabsContent value="connections">
          <ConnectionsTab name={c.name} connections={[
            { label: "Bookings", doctype: "RE Booking", field: "customer" }, { label: "Payments", doctype: "RE Payment", field: "customer" },
            { label: "Society bills", doctype: "RE Society Bill", field: "customer" }, { label: "Complaints", doctype: "Task", field: "re_customer" },
            { label: "Calls", doctype: "CRM Call Log", field: "reference_docname" }, { label: "Reminders", doctype: "RE Reminder Log", field: "party" },
            { label: "Plots owned", doctype: "RE Plot", field: "customer" },
          ]} />
        </TabsContent>
        <TabsContent value="activity"><ActivityTab doctype="Customer" name={c.name} /></TabsContent>
        <TabsContent value="email"><EmailTab doctype="Customer" name={c.name} defaultTo={c.email_id} /></TabsContent>
        <TabsContent value="assign"><AssignTab doctype="Customer" name={c.name} /></TabsContent>
        <TabsContent value="files"><AttachmentsTab doctype="Customer" name={c.name} csrf={boot?.csrf_token ?? ""} /></TabsContent>
      </Tabs>
    </div>
  );
}
