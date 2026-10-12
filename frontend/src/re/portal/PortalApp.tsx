/**
 * Owner portal (/portal) — mobile-first, English / Urdu (RTL). A plot owner sees their plots on the map, payment
 * progress and schedule, receipts and society bills, downloads their documents and raises complaints.
 * Data: realestate.portal.* (scoped server-side to the customer linked to this login).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import maplibregl from "maplibre-gl";
import { Building, ChevronLeft, Download, FileText, Home, LifeBuoy, Loader2, LogOut, MapPin, MessageCircle, Phone, Receipt, Wallet } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge, type Tone } from "@/re/components/ui/badge";
import { Button } from "@/re/components/ui/button";
import { Input, Label, Select } from "@/re/components/ui/input";
import { Empty, Skeleton } from "@/re/components/ui/skeleton";
import { get, logout, post } from "@/re/lib/api";
import { area, date, money, waNumber } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { I18nProvider, LangSwitch, useI18n } from "@/re/i18n";
import { ReProviders } from "@/re/ReProviders";

interface PortalPlot {
  name: string; plot: string; plot_size: string; block: string; status: string; net_price: number; paid_amount: number; outstanding_amount: number;
  overdue_amount: number; next_due_date: string | null; next_due_amount: number; surcharge_due: number; payment_plan: string; booking_date: string;
  photos?: string[];
  area_marla?: number;
  geojson: GeoJSON.Polygon | null; centre_lat: number; centre_lng: number; street: string | null; plot_status: string; is_corner: 0 | 1; is_park_facing: 0 | 1;
}
interface PortalHome {
  customer: { name: string; customer_name: string; mobile_no: string | null; email_id: string | null };
  plots: PortalPlot[];
  bills: { name: string; plot: string; bill_month_label: string; total_amount: number; outstanding_amount: number; status: string; due_date: string }[];
  agent: { full_name: string; mobile_no: string | null } | null;
  boundary: GeoJSON.Polygon | null;
  totals: { price: number; paid: number; outstanding: number; overdue: number; society_due: number; surcharge_due: number };
  complaints: { name: string; subject: string; status: string; priority: string; re_plot: string | null; creation: string; completed_on: string | null }[];
  receipts: { name: string; posting_date: string; amount: number; payment_against: string; plot: string; mode_of_payment: string }[];
  documents: { name: string; document_type: string; version: number; issued_on: string; plot: string | null }[];
}
interface Row { label: string; due_date: string; amount: number; paid_amount: number; status: string }

const TONE: Record<string, Tone> = { Paid: "green", Due: "amber", Overdue: "red", Unpaid: "amber", "Partly Paid": "orange", Open: "blue", Working: "amber", Completed: "green" };
const docUrl = (type: string, ref: string) => `/api/method/realestate.portal.document?document_type=${encodeURIComponent(type)}&reference_name=${encodeURIComponent(ref)}`;

function useHome() {
  return useQuery({ queryKey: ["portal-home"], queryFn: () => get<PortalHome>("realestate.portal.home") });
}

function Money({ v, className = "" }: { v: number; className?: string }) {
  return <span className={cn("tabular-nums", className)} dir="ltr">{money(v)}</span>;
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between"><h2 className="text-base font-bold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ map of my plots
function MyPlotsMap({ home }: { home: PortalHome }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const plots: FeatureCollection = { type: "FeatureCollection", features: home.plots.filter((p) => p.geojson).map((p) => ({
      type: "Feature", geometry: p.geojson!, properties: { name: p.plot, color: p.status === "Overdue" ? "#dc2626" : p.status === "Paid" ? "#16a34a" : "#f59e0b" } })) };
    const m = new maplibregl.Map({
      container: el.current, attributionControl: { compact: true },
      style: { version: 8, glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] },
          plots: { type: "geojson", data: plots }, boundary: { type: "geojson", data: home.boundary ? { type: "Feature", geometry: home.boundary, properties: {} } : { type: "FeatureCollection", features: [] } } },
        layers: [
          { id: "sat", type: "raster", source: "sat" },
          { id: "boundary", type: "line", source: "boundary", paint: { "line-color": "#f97316", "line-width": 2, "line-dasharray": [3, 2] } },
          { id: "fill", type: "fill", source: "plots", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.75 } },
          { id: "line", type: "line", source: "plots", paint: { "line-color": "#ffffff", "line-width": 2 } },
          { id: "label", type: "symbol", source: "plots", layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Open Sans Regular"], "text-offset": [0, -1.4] },
            paint: { "text-color": "#ffffff", "text-halo-color": "#0f172a", "text-halo-width": 1.5 } },
        ] },
      center: [home.plots[0]?.centre_lng ?? 74.2, home.plots[0]?.centre_lat ?? 31.36], zoom: 16, maxZoom: 20,
    });
    m.on("load", () => {
      const b = new maplibregl.LngLatBounds();
      home.plots.forEach((p) => p.geojson?.coordinates[0]?.forEach((c) => b.extend(c as [number, number])));
      if (!b.isEmpty()) m.fitBounds(b, { padding: 60, maxZoom: 18.5, duration: 0 });
    });
    return () => m.remove();
  }, [home]);
  return <div ref={el} className="h-56 w-full overflow-hidden rounded-2xl border shadow-sm" />;
}

// ------------------------------------------------------------------ screens
function HomeScreen() {
  const { t } = useI18n();
  const { data: h, isLoading } = useHome();
  if (isLoading || !h) return <div className="space-y-3"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;
  const pct = h.totals.price ? Math.round((h.totals.paid * 100) / h.totals.price) : 0;
  const nextDue = h.plots.filter((p) => p.next_due_date).sort((a, b) => String(a.next_due_date).localeCompare(String(b.next_due_date)))[0];
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-800 p-5 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
        <p className="text-sm opacity-90">{t("Welcome")},</p>
        <p className="text-2xl font-bold">{h.customer.customer_name}</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div><p className="text-xs uppercase opacity-80">{t("Paid")}</p><Money v={h.totals.paid} className="text-xl font-bold" /><p className="text-xs opacity-80">{pct}% {t("of")} <span dir="ltr">{money(h.totals.price, { compact: true })}</span></p></div>
          <div className="text-end"><p className="text-xs uppercase opacity-80">{t("Outstanding")}</p><Money v={h.totals.outstanding} className="text-lg font-semibold" /></div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/25"><div className="h-2 rounded-full bg-white" style={{ width: `${pct}%` }} /></div>
      </div>

      {(h.totals.overdue > 0 || h.totals.society_due > 0 || h.totals.surcharge_due > 0) && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3"><p className="text-[11px] text-muted-foreground">{t("Overdue")}</p><Money v={h.totals.overdue} className="text-sm font-bold text-red-600 dark:text-red-400" /></div>
          <div className="rounded-2xl border bg-card p-3"><p className="text-[11px] text-muted-foreground">{t("Society dues")}</p><Money v={h.totals.society_due} className="text-sm font-bold" /></div>
          <div className="rounded-2xl border bg-card p-3"><p className="text-[11px] text-muted-foreground">{t("Surcharge")}</p><Money v={h.totals.surcharge_due} className="text-sm font-bold" /></div>
        </div>
      )}
      {nextDue && (
        <div className="flex items-center justify-between rounded-2xl border bg-card p-4 shadow-sm">
          <div><p className="text-xs text-muted-foreground">{t("Next due")} · {t("Plot")} {nextDue.plot}</p><Money v={nextDue.next_due_amount} className="text-lg font-bold" /></div>
          <div className="text-end text-sm"><p className="text-muted-foreground">{t("on")}</p><p className="font-semibold" dir="ltr">{date(nextDue.next_due_date)}</p></div>
        </div>
      )}

      <Section title={t("Location on the map")}><MyPlotsMap home={h} /></Section>

      <Section title={t("My plots")}>
        <div className="space-y-2">
          {h.plots.map((p) => {
            const pp = p.net_price ? Math.round((p.paid_amount * 100) / p.net_price) : 0;
            return (
              <Link key={p.name} to={`/portal/plot/${encodeURIComponent(p.name)}`} className="block rounded-2xl border bg-card p-4 shadow-sm transition active:scale-[0.99]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold" dir="ltr">{p.plot}</p>
                    <p className="text-sm text-muted-foreground">{p.plot_size} · {p.block}{p.street ? ` · ${p.street}` : ""}</p>
                  </div>
                  <Badge tone={TONE[p.status] ?? "gray"}>{t(p.status)}</Badge>
                </div>
                <div className="mt-3 h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", p.status === "Overdue" ? "bg-red-500" : "bg-primary")} style={{ width: `${pp}%` }} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{pp}% {t("paid")} · {t("Outstanding")} <span dir="ltr">{money(p.outstanding_amount, { compact: true })}</span></p>
              </Link>
            );
          })}
          {!h.plots.length && <Empty title={t("Nothing yet")} />}
        </div>
      </Section>

      {h.agent && (
        <Section title={t("Your agent")}>
          <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
            <p className="font-semibold">{h.agent.full_name}</p>
            {h.agent.mobile_no && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild><a href={`tel:${h.agent.mobile_no}`}><Phone /> {t("Call")}</a></Button>
                <Button size="sm" variant="success" asChild><a href={`https://wa.me/${waNumber(h.agent.mobile_no)}`} target="_blank" rel="noreferrer"><MessageCircle /> {t("WhatsApp")}</a></Button>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function PlotScreen() {
  const { t } = useI18n();
  const { booking = "" } = useParams();
  const navigate = useNavigate();
  const { data: h } = useHome();
  const p = h?.plots.find((x) => x.name === booking);
  const { data: rows, isLoading } = useQuery({ queryKey: ["portal-schedule", booking], queryFn: () => get<Row[]>("realestate.portal.schedule", { booking }) });
  if (!p) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4 rtl:rotate-180" />{t("Back")}</button>
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between"><div><p className="text-2xl font-bold" dir="ltr">{p.plot}</p><p className="text-sm text-muted-foreground">{p.plot_size} · {p.block}</p><p className="text-xs text-muted-foreground" dir="ltr">{area(p.area_marla)}</p></div><Badge tone={TONE[p.status] ?? "gray"}>{t(p.status)}</Badge></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted-foreground">{t("Total price")}</p><Money v={p.net_price} className="font-semibold" /></div>
          <div><p className="text-muted-foreground">{t("Paid")}</p><Money v={p.paid_amount} className="font-semibold text-emerald-600 dark:text-emerald-400" /></div>
          <div><p className="text-muted-foreground">{t("Outstanding")}</p><Money v={p.outstanding_amount} className="font-semibold" /></div>
          <div><p className="text-muted-foreground">{t("Overdue")}</p><Money v={p.overdue_amount} className="font-semibold text-red-600 dark:text-red-400" /></div>
          <div><p className="text-muted-foreground">{t("Payment plan")}</p><p className="font-semibold">{p.payment_plan}</p></div>
          <div><p className="text-muted-foreground">{t("Booked on")}</p><p className="font-semibold" dir="ltr">{date(p.booking_date)}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild><a href={docUrl("Payment Schedule", p.name)}><Download /> {t("Payment schedule")}</a></Button>
          <Button size="sm" variant="outline" asChild><a href={docUrl("Allotment Letter", p.name)}><Download /> {t("Allotment letter")}</a></Button>
          <Button size="sm" variant="outline" asChild><a href={docUrl("Site Plan", p.plot)}><MapPin /> {t("Site plan")}</a></Button>
          {p.status === "Paid" && <Button size="sm" variant="outline" asChild><a href={docUrl("No Demand Certificate", p.name)}><Download /> {t("No demand certificate")}</a></Button>}
        </div>
      </div>
      {Boolean(p.photos?.length) && (
        <Section title={t("Site photos")}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {p.photos!.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="h-28 w-40 shrink-0 overflow-hidden rounded-xl border"><img src={u} alt="" loading="lazy" className="size-full object-cover" /></a>)}
          </div>
        </Section>
      )}
      <Section title={t("Installment schedule")}>
        {isLoading ? <Skeleton className="h-48" /> : (
          <div className="divide-y rounded-2xl border bg-card">
            {rows?.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div><p className="font-medium">{r.label}</p><p className="text-xs text-muted-foreground" dir="ltr">{date(r.due_date)}</p></div>
                <div className="text-end"><Money v={r.amount} className="font-semibold" /><div><Badge tone={TONE[r.status] ?? "gray"}>{t(r.status)}</Badge></div></div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <p className="text-center text-xs text-muted-foreground">{t("Pay at the society office or by bank transfer quoting your booking number.")} <span dir="ltr">({p.name})</span></p>
    </div>
  );
}

function PaymentsScreen() {
  const { t } = useI18n();
  const { data: h, isLoading } = useHome();
  if (isLoading || !h) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <div className="space-y-5">
      <Section title={t("Society bills")}>
        <div className="divide-y rounded-2xl border bg-card">
          {h.bills.map((b) => (
            <div key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div><p className="font-medium">{b.bill_month_label}</p><p className="text-xs text-muted-foreground" dir="ltr">{b.plot}</p></div>
              <div className="flex items-center gap-2">
                <div className="text-end"><Money v={b.outstanding_amount || b.total_amount} className="font-semibold" /><div><Badge tone={TONE[b.status] ?? "gray"}>{t(b.status)}</Badge></div></div>
                <a href={docUrl("Maintenance Bill", b.name)} className="rounded-lg p-2 hover:bg-accent" aria-label={t("Download")}><Download className="size-4" /></a>
              </div>
            </div>
          ))}
          {!h.bills.length && <Empty title={t("Nothing yet")} />}
        </div>
      </Section>
      <Section title={t("Receipts")}>
        <div className="divide-y rounded-2xl border bg-card">
          {h.receipts.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div><p className="font-medium" dir="ltr">{date(r.posting_date)}</p><p className="text-xs text-muted-foreground" dir="ltr">{r.plot} · {r.mode_of_payment}</p></div>
              <div className="flex items-center gap-2">
                <Money v={r.amount} className="font-semibold text-emerald-600 dark:text-emerald-400" />
                <a href={docUrl("Payment Receipt", r.name)} className="rounded-lg p-2 hover:bg-accent" aria-label={t("Download")}><Download className="size-4" /></a>
              </div>
            </div>
          ))}
          {!h.receipts.length && <Empty title={t("Nothing yet")} />}
        </div>
      </Section>
    </div>
  );
}

function DocumentsScreen() {
  const { t } = useI18n();
  const { data: h } = useHome();
  if (!h) return <Skeleton className="h-64 rounded-2xl" />;
  const items: [string, string, string][] = [["Account statement", "Customer Account Statement", h.customer.name],
    ...h.plots.flatMap((p): [string, string, string][] => [[`${t("Payment schedule")} · ${p.plot}`, "Payment Schedule", p.name], [`${t("Allotment letter")} · ${p.plot}`, "Allotment Letter", p.name], [`${t("Site plan")} · ${p.plot}`, "Site Plan", p.plot]])];
  return (
    <div className="space-y-5">
      <Section title={t("Get your documents")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map(([label, type, ref]) => (
            <a key={`${type}-${ref}`} href={docUrl(type, ref)} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm hover:border-primary">
              <span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-4" /></span><span className="text-sm font-medium">{t(label)}</span></span>
              <Download className="size-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      </Section>
      {h.documents.length > 0 && (
        <Section title={t("Generated documents")}>
          <div className="divide-y rounded-2xl border bg-card text-sm">
            {h.documents.map((d) => <div key={d.name} className="flex justify-between px-4 py-2.5"><span>{d.document_type} <span className="text-xs text-muted-foreground">v{d.version}</span></span><span className="text-xs text-muted-foreground" dir="ltr">{date(d.issued_on)}</span></div>)}
          </div>
        </Section>
      )}
    </div>
  );
}

function HelpScreen() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: h } = useHome();
  const { data: types } = useQuery({ queryKey: ["portal-ctypes"], queryFn: () => get<string[]>("realestate.portal.complaint_types") });
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("Street Lights");
  const [plot, setPlot] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [details, setDetails] = useState("");
  const submit = useMutation({
    mutationFn: () => post<string>("realestate.portal.complaint", { subject, maintenance_type: type, plot: plot || undefined, description: details, priority }),
    onSuccess: (name) => { toast.success(`${t("Complaint submitted")} (${name})`); setSubject(""); setDetails(""); void qc.invalidateQueries({ queryKey: ["portal-home"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-5">
      <Section title={t("Raise a complaint")}>
        <form className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (subject.trim()) submit.mutate(); }}>
          <div><Label htmlFor="p-subject">{t("What is the problem?")}</Label><Input id="p-subject" required value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="p-type">{t("Type")}</Label><Select id="p-type" value={type} onChange={(e) => setType(e.target.value)}>{types?.map((x) => <option key={x}>{x}</option>)}</Select></div>
            <div><Label htmlFor="p-plot">{t("Plot")}</Label><Select id="p-plot" value={plot} onChange={(e) => setPlot(e.target.value)}><option value="">—</option>{h?.plots.map((p) => <option key={p.plot} value={p.plot}>{p.plot}</option>)}</Select></div>
          </div>
          <div><Label htmlFor="p-pri">{t("Priority")}</Label><Select id="p-pri" value={priority} onChange={(e) => setPriority(e.target.value)}>{["Critical", "High", "Normal"].map((x) => <option key={x} value={x}>{t(x)}</option>)}</Select></div>
          <div><Label htmlFor="p-details">{t("Details")}</Label><textarea id="p-details" className="field h-24" value={details} onChange={(e) => setDetails(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={submit.isPending}>{submit.isPending && <Loader2 className="animate-spin" />} {t("Submit")}</Button>
        </form>
      </Section>
      <Section title={t("Your complaints")}>
        <div className="divide-y rounded-2xl border bg-card">
          {h?.complaints.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{c.subject}</p><p className="text-xs text-muted-foreground" dir="ltr">{c.re_plot} · {date(c.creation)}</p></div>
              <Badge tone={TONE[c.status] ?? "gray"}>{t(c.status)}</Badge>
            </div>
          ))}
          {!h?.complaints.length && <Empty title={t("No complaints yet")} />}
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ shell
function Shell() {
  const { t, dir } = useI18n();
  const nav: [string, string, typeof Home][] = [["/portal", "Home", Home], ["/portal/payments", "Payments", Wallet], ["/portal/documents", "Documents", Receipt], ["/portal/help", "Help", LifeBuoy]];
  return (
    <div dir={dir} className={cn("min-h-screen bg-background pb-20", dir === "rtl" && "[font-family:'Noto_Nastaliq_Urdu',serif] leading-loose")}>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-card/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 text-white shadow"><Building className="size-5" /></span>
          <div className="leading-tight"><p className="text-sm font-bold">Zarmeen Gardens</p><p className="text-[11px] text-muted-foreground">{t("Owner portal")}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <button onClick={() => void logout().then(() => window.location.assign("/login"))} className="rounded-lg p-2 hover:bg-accent" aria-label={t("Sign out")}><LogOut className="size-4 rtl:rotate-180" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">
        <Routes>
          <Route index element={<HomeScreen />} />
          <Route path="plot/:booking" element={<PlotScreen />} />
          <Route path="payments" element={<PaymentsScreen />} />
          <Route path="documents" element={<DocumentsScreen />} />
          <Route path="help" element={<HelpScreen />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/portal"} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
              <Icon className="size-5" />{t(label)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Only a login linked to a Customer gets in; guests go to sign-in, staff are told where the owner view lives. */
function Gate() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-whoami"], retry: false, staleTime: 300_000,
    queryFn: () => get<{ customer: string | null; is_staff: boolean }>("realestate.portal.whoami"),
  });
  if (isLoading) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <Navigate to="/login" replace state={{ from: "/portal" }} />;
  if (!data?.customer)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-bold">{t("Owner portal")}</p>
          <p className="text-sm text-muted-foreground">This login is not linked to a plot owner. Staff can invite an owner from the Customer record (Owner Portal Login).</p>
          <Button asChild><Link to={data?.is_staff ? "/re" : "/login"}>{data?.is_staff ? "Open the staff app" : "Sign in"}</Link></Button>
        </div>
      </div>
    );
  return <Shell />;
}

export function PortalApp() {
  return (
    <ReProviders>
      <I18nProvider>
        <Gate />
      </I18nProvider>
    </ReProviders>
  );
}
