import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ClipboardList, ExternalLink, HandCoins, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CallButtons } from "@/re/pages/Dashboard";
import { ActivityTab, AssignTab, AttachmentsTab, ConnectionsTab, EmailTab } from "@/re/components/record/RecordTabs";
import { PlotMiniMap } from "@/re/components/map/PlotMiniMap";
import { PlotPhotos } from "@/re/components/plot/PlotPhotos";
import { PlotStatusActions } from "@/re/components/plot/PlotStatusActions";
import { RemindButton } from "@/re/components/record/RemindButton";
import { Badge, StatusBadge } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Sheet } from "@/re/components/ui/sheet";
import { Skeleton } from "@/re/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/re/components/ui/tabs";
import { get } from "@/re/lib/api";
import { area, date, metres, money } from "@/re/lib/format";
import type { PlotDetail } from "@/re/lib/types";
import { deskUrl } from "@/re/lib/utils";
import { useAuth } from "@/re/providers/auth";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function PlotSheet({ plot, onClose }: { plot: string | undefined; onClose: () => void }) {
  const { boot } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["plot", plot],
    enabled: Boolean(plot),
    queryFn: () => get<PlotDetail>("realestate.spa.plot_detail", { plot: plot ?? "" }),
  });
  const p = data?.plot;
  const b = data?.booking;
  const progress = b ? Math.round((b.paid_amount * 100) / Math.max(b.net_price, 1)) : 0;

  return (
    <Sheet open={Boolean(plot)} onOpenChange={(o) => !o && onClose()} title={<span className="flex items-center gap-2">Plot {plot} {p && <StatusBadge status={p.status} />} {p?.payment_status && <StatusBadge status={p.payment_status} />}</span>}
      description={p ? `${p.plot_size} · ${p.block}${p.street ? ` · ${p.street}` : ""}` : undefined}>
      {isLoading || !p || !data ? <Skeleton className="h-96" /> : (
        <div className="space-y-4">
          <PlotMiniMap geojson={p.geojson} />
          <PlotPhotos plot={p.name} photos={data.photos ?? []} sitePlanSvg={data.site_plan_svg ?? ""} csrf={boot?.csrf_token ?? ""} canUpload={Boolean(boot?.is_staff)} />
          <div className="flex flex-wrap gap-2">
            {p.status === "Available" && (
              <Button asChild><a href={deskUrl(`re-booking/new?plot=${p.name}`)} target="_blank" rel="noreferrer"><ClipboardList /> Book plot</a></Button>
            )}
            <Button asChild variant="outline"><a href={deskUrl(`re-site-visit/new?interested_plot=${p.name}&interested_block=${encodeURIComponent(p.block)}`)} target="_blank" rel="noreferrer"><CalendarPlus /> Schedule site visit</a></Button>
            {b && b.outstanding_amount > 0 && (
              <Button asChild variant="success"><a href={deskUrl(`re-payment/new?payment_against=Booking&booking=${b.name}&customer=${encodeURIComponent(p.customer ?? "")}`)} target="_blank" rel="noreferrer"><HandCoins /> Receive payment</a></Button>
            )}
            {b && b.outstanding_amount > 0 && <RemindButton type={b.overdue_amount > 0 ? "Overdue Notice" : "Installment Reminder"} doctype="RE Booking" name={b.name}
              label={b.overdue_amount > 0 ? "Overdue notice" : "Reminder"} />}
            <PlotStatusActions plot={p.name} status={p.status} booking={b?.name} bookingStatus={b?.status} possessionDate={b?.possession_date} />
            <Button asChild variant="ghost"><a href={deskUrl(`re-plot/${p.name}`)} target="_blank" rel="noreferrer"><ExternalLink /> Desk</a></Button>
          </div>
          {p.status === "Hold" && p.hold_reason && <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm">On hold: {p.hold_reason}</p>}
          {b?.possession_date && <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm">Possession handed over on {date(b.possession_date)}</p>}

          <Tabs defaultValue="overview">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="schedule">Installments</TabsTrigger>
              <TabsTrigger value="bills">Bills & payments</TabsTrigger>
              <TabsTrigger value="prices">Price history</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="assign">Assign</TabsTrigger>
              <TabsTrigger value="files">Attachments</TabsTrigger>
            </TabsList>

            <TabsContent value="prices">
              {p.price_history?.length ? (
                <Table head={["Date", "Old price", "New price", "Change", "Reason"]} rows={[...p.price_history].reverse().map((h) => [
                  date(h.changed_on), h.old_price ? money(h.old_price) : "—", <b key="n">{money(h.new_price)}</b>,
                  h.change_percent ? <span key="c" className={h.change_percent > 0 ? "text-emerald-600" : "text-red-600"}>{h.change_percent > 0 ? "+" : ""}{h.change_percent}%</span> : "—", h.reason ?? ""])} />
              ) : <p className="text-sm text-muted-foreground">No price changes recorded.</p>}
            </TabsContent>
            <TabsContent value="overview" className="grid gap-4 md:grid-cols-2">
              <div>
                <Row label="Size">{area(p.area_marla)} ({p.plot_type})</Row>
                <Row label="List price">{money(p.list_price)}</Row>
                {b && b.discount > 0 && <Row label="Booked at">{money(b.net_price)} <span className="text-xs text-muted-foreground line-through">{money(b.total_price)}</span></Row>}
                <Row label="Category">
                  <span className="flex flex-wrap justify-end gap-1">
                    {p.is_corner ? <Badge tone="violet">Corner</Badge> : null}
                    {p.is_park_facing ? <Badge tone="green">Park facing</Badge> : null}
                    {p.is_boulevard_facing ? <Badge tone="blue">Boulevard</Badge> : null}
                    {!p.is_corner && !p.is_park_facing && !p.is_boulevard_facing && "Standard"}
                  </span>
                </Row>
                {b && (
                  <>
                    <Row label="Booking">{b.name} · {date(b.booking_date)}</Row>
                    <Row label="Plan">{b.payment_plan}</Row>
                    <Row label="Paid">{money(b.paid_amount)} ({progress}%)</Row>
                    <Row label="Outstanding">{money(b.outstanding_amount)}</Row>
                    {b.overdue_amount > 0 && <Row label="Overdue"><span className="text-destructive">{money(b.overdue_amount)}</span></Row>}
                    <Row label="Next due">{b.next_due_date ? `${date(b.next_due_date)} · ${money(b.next_due_amount)}` : "—"}</Row>
                    <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
                  </>
                )}
              </div>
              <div className="space-y-3">
                {data.owner && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase text-muted-foreground">Owner</p>
                    <div className="flex items-center justify-between gap-2">
                      <Link className="font-semibold hover:underline" to={`/re/customers/${encodeURIComponent(data.owner.name)}`}>{data.owner.customer_name}</Link>
                      <CallButtons phone={data.owner.mobile_no} />
                    </div>
                    <p className="text-sm text-muted-foreground">{data.owner.mobile_no ?? "No mobile"}</p>
                  </div>
                )}
                {data.agent && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase text-muted-foreground">Assigned agent</p>
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{data.agent.name}</span><CallButtons phone={data.agent.mobile_no} /></div>
                  </div>
                )}
                <div className="rounded-lg border p-3">
                  <p className="mb-1 text-xs uppercase text-muted-foreground">Nearby</p>
                  {data.nearby.map((n) => (
                    <p key={n.type} className="flex justify-between text-sm"><span><MapPin className="mr-1 inline size-3.5" />{n.name}</span><span className="text-muted-foreground">{metres(n.metres)}</span></p>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="schedule">
              {data.installments.length ? (
                <Table head={["Installment", "Due", "Amount", "Paid", "Status"]}
                  rows={data.installments.map((r) => [r.label, date(r.due_date), money(r.amount), money(r.paid_amount), <StatusBadge key="s" status={r.status} />])} />
              ) : <p className="text-sm text-muted-foreground">Not booked.</p>}
            </TabsContent>

            <TabsContent value="bills" className="space-y-4">
              <Table head={["Month", "Bill", "Outstanding", "Status"]}
                rows={data.bills.map((r) => [r.bill_month_label, money(r.total_amount), money(r.outstanding_amount), <StatusBadge key="s" status={r.status} />])} />
              <Table head={["Date", "Against", "Mode", "Amount"]}
                rows={data.payments.map((r) => [date(r.posting_date), r.payment_against, r.mode_of_payment, money(r.amount)])} />
            </TabsContent>

            <TabsContent value="maintenance">
              {data.tasks.length ? (
                <Table head={["Task", "Priority", "Status", "Raised"]}
                  rows={data.tasks.map((t) => [<a key="t" className="hover:underline" href={deskUrl(`task/${t.name}`)} target="_blank" rel="noreferrer">{t.subject}</a>,
                    <StatusBadge key="p" status={t.priority} />, <StatusBadge key="s" status={t.status} />, date(t.creation)])} />
              ) : <p className="text-sm text-muted-foreground">No maintenance on this plot.</p>}
            </TabsContent>

            <TabsContent value="connections">
              <ConnectionsTab name={p.name} connections={[
                { label: "Bookings", doctype: "RE Booking", field: "plot" }, { label: "Payments", doctype: "RE Payment", field: "plot" },
                { label: "Society bills", doctype: "RE Society Bill", field: "plot" }, { label: "Maintenance tasks", doctype: "Task", field: "re_plot" },
                { label: "Site visits", doctype: "RE Site Visit", field: "interested_plot" },
              ]} />
            </TabsContent>
            <TabsContent value="activity"><ActivityTab doctype="RE Plot" name={p.name} /></TabsContent>
            <TabsContent value="email"><EmailTab doctype="RE Plot" name={p.name} defaultTo={data.owner?.email_id} /></TabsContent>
            <TabsContent value="assign"><AssignTab doctype="RE Plot" name={p.name} /></TabsContent>
            <TabsContent value="files"><AttachmentsTab doctype="RE Plot" name={p.name} csrf={boot?.csrf_token ?? ""} /></TabsContent>
          </Tabs>
        </div>
      )}
    </Sheet>
  );
}
