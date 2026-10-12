import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/re/components/ui/card";
import { StatusBadge } from "@/re/components/ui/badge";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get } from "@/re/lib/api";
import { dateTime } from "@/re/lib/format";
import type { Dashboard } from "@/re/lib/types";
import { deskUrl } from "@/re/lib/utils";
import { CallButtons } from "./Dashboard";

export function TodayPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", "week", "installments"], queryFn: () => get<Dashboard>("realestate.spa.dashboard") });
  return (
    <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Site visits (today & tomorrow)</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {isLoading ? <Skeleton className="h-40" /> : !data?.schedule.visits.length ? <Empty title="No visits scheduled" /> : data.schedule.visits.map((v) => (
            <div key={v.name} className="flex items-center justify-between gap-3 py-2">
              <div><p className="font-medium">{v.party_name}</p><p className="text-xs text-muted-foreground">{dateTime(v.visit_on)}{v.interested_plot && ` · plot ${v.interested_plot}`}</p></div>
              <CallButtons phone={v.mobile_no} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Follow-ups due</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {isLoading ? <Skeleton className="h-40" /> : !data?.schedule.follow_ups.length ? <Empty title="All caught up" /> : data.schedule.follow_ups.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <a className="font-medium hover:underline" href={deskUrl(`crm-task/${t.name}`)} target="_blank" rel="noreferrer">{t.title}</a>
                <p className="text-xs text-muted-foreground">{dateTime(t.due_date)} · <StatusBadge status={t.priority} /></p>
              </div>
              <CallButtons phone={t.mobile_no} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
