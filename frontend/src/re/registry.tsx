/** The real-estate DocTypes that get generated React lists / forms, their sidebar group, icon and extras. */
import {
  Archive, Building, CalendarCheck, ClipboardList, FileBadge, FileText, Grid3x3, HandCoins, Layers, ListChecks, Map, MapPinned,
  Megaphone, MessageCircle, MessagesSquare, Receipt, Ruler, Settings, Upload, Wallet, Wrench, Zap, Repeat2, Ban, Combine, BadgePercent,
  CheckCircle2, XCircle, Send, type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import type { DocConfig, DocValues, ExtraContext, FormAction } from "@/components/doc/doc-config";
import { get } from "@/re/lib/api";
import { callDocMethod, humanizeError, postCall } from "@/services/frappe";
import { slugOf, type Enhancer } from "./meta/buildConfig";
import { PlanPreview } from "./components/record/PlanPreview";
import { PlanCards, PlanUsage } from "./components/record/PlanInsights";
import { CommissionPay } from "./components/record/CommissionPay";
import { openGenerateDocs } from "./components/record/GenerateDocs";
import { ProjectCards, ProjectProfile } from "./components/record/ProjectProfile";
import { BlockCards, BlockGauge, BlockProfile, BlockStock } from "./components/record/BlockProfile";
import { PlotInsights } from "./components/record/PlotInsights";
import { SizeInsights } from "./components/record/SizeInsights";
import { SocietyInsights } from "./components/record/SocietyInsights";
import { BillBreakup } from "./components/record/BillBreakup";
import { ChargeHeadCell, ChargeHeadInsights, FeatureCell, InfrastructureInsights, MaintenancePlanInsights, PlanCell } from "./components/record/OpsInsights";
import { AreaMap } from "./components/map/AreaMap";
import { LocationCapture } from "./components/map/LocationCapture";
import { ImportPreview } from "./components/map/ImportPreview";
import { PlotProfile } from "./components/record/PlotProfile";

export interface ReDoc {
  doctype: string;
  label: string;
  group: "Society" | "Sales & Collections" | "Operations" | "CRM & WhatsApp" | "Society Ops" | "Documents" | "Setup";
  icon: LucideIcon;
}

export const RE_DOCS: ReDoc[] = [
  { doctype: "RE Project", label: "Projects", group: "Setup", icon: Building },
  { doctype: "RE Block", label: "Blocks", group: "Society", icon: Layers },
  { doctype: "RE Plot", label: "Plots (records)", group: "Society", icon: Grid3x3 },
  { doctype: "RE Plot Size", label: "Plot Sizes & Prices", group: "Setup", icon: Ruler },
  { doctype: "RE Map Feature", label: "Infrastructure & Map Features", group: "Society", icon: MapPinned },
  { doctype: "RE Map Import", label: "Map Import (KML / GeoJSON)", group: "Setup", icon: Upload },
  { doctype: "RE Booking", label: "Bookings", group: "Sales & Collections", icon: ClipboardList },
  { doctype: "RE Payment", label: "Receipts", group: "Sales & Collections", icon: Wallet },
  { doctype: "RE Payment Plan", label: "Payment Plans", group: "Setup", icon: CalendarCheck },
  { doctype: "RE Plot Transfer", label: "Plot Transfers", group: "Operations", icon: Repeat2 },
  { doctype: "RE Booking Cancellation", label: "Cancellations & Refunds", group: "Operations", icon: Ban },
  { doctype: "RE Plot Merge", label: "Plot Merges", group: "Operations", icon: Combine },
  { doctype: "RE Surcharge", label: "Late Payment Surcharges", group: "Operations", icon: BadgePercent },
  { doctype: "RE Surcharge Waiver", label: "Surcharge Waivers", group: "Operations", icon: BadgePercent },
  { doctype: "RE Re-allotment", label: "Re-allotments", group: "Operations", icon: Repeat2 },
  { doctype: "RE Commission", label: "Commissions", group: "Operations", icon: HandCoins },
  { doctype: "RE Society Bill", label: "Society Bills", group: "Society Ops", icon: Receipt },
  { doctype: "RE Charge Head", label: "Charge Heads", group: "Society Ops", icon: HandCoins },
  { doctype: "RE Maintenance Plan", label: "Maintenance Plans", group: "Society Ops", icon: Wrench },
  { doctype: "RE Site Visit", label: "Site Visits", group: "CRM & WhatsApp", icon: Map },
  { doctype: "RE Conversation", label: "WhatsApp Chats", group: "CRM & WhatsApp", icon: MessageCircle },
  { doctype: "RE Broadcast", label: "Broadcasts", group: "CRM & WhatsApp", icon: Megaphone },
  { doctype: "RE Quick Reply", label: "Quick Replies", group: "CRM & WhatsApp", icon: Zap },
  { doctype: "RE Reminder Log", label: "Reminder Log", group: "CRM & WhatsApp", icon: MessagesSquare },
  { doctype: "RE Generated Document", label: "Generated Documents", group: "Documents", icon: FileBadge },
  { doctype: "RE Vault Document", label: "Document Vault", group: "Documents", icon: Archive },
  { doctype: "RE Settings", label: "Settings", group: "Setup", icon: Settings },
];

export const docBase = (doctype: string) => `/re/d/${slugOf(doctype)}`;
export const bySlug = (slug: string) => RE_DOCS.find((d) => slugOf(d.doctype) === slug);

const money = (v: unknown) => `Rs ${Number(v ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

/** "Generate <document>" actions (PDF on the letterhead, stored as a new version and opened). */
/** One-click messages from a form: WhatsApp template, then SMS / email fallback. */
const sendActions = (doctype: string, items: [string, ((c: ExtraContext) => boolean)?][]): FormAction[] =>
  items.map(([type, show]) => ({
    label: `Send ${type}`,
    icon: Send,
    show: (c: ExtraContext) => !c.isNew && (show ? show(c) : c.docstatus === 1),
    run: async (c: ExtraContext) => {
      try {
        const status = await postCall<string>("realestate.whatsapp.channel.send_now", { reminder_type: type, reference_doctype: doctype, reference_name: c.name });
        (status === "Failed" ? toast.error : toast.success)(`${type}: ${status}`);
      } catch (e) {
        toast.error(humanizeError(e));
      }
    },
  }));

/** One "Generate document…" entry: a dialog to pick the document and English / Urdu, with earlier versions. */
const docActions = (doctype: string, types: string[]): FormAction[] => (types.length ? [{
  label: "Generate Letters & forms (English / اردو)…",  // shown under "Documents" without the verb
  icon: FileText,
  show: (c: ExtraContext) => !c.isNew,
  run: (c: ExtraContext) => openGenerateDocs({ doctype, name: c.name ?? "", types, reload: c.reload }),
}] : []);

const open = (url: string) => () => {
  window.open(url, "_blank");
};
/** In-app navigation from a form action (BrowserRouter listens to popstate). */
const go = (path: string) => () => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const run = (doctype: string, method: string, done: string) => async (c: ExtraContext) => {
  try {
    await callDocMethod(method, doctype, c.name ?? "");
    toast.success(done);
    c.reload();
  } catch (e) {
    toast.error(humanizeError(e));
  }
};

const extend = (patch: (c: DocConfig) => Partial<DocConfig>) => (c: DocConfig): DocConfig => ({ ...c, ...patch(c) });

/** Approval workflow buttons (Draft → Pending Approval → Approved / Rejected); the server enforces who may do what. */
const workflowActions = (doctype: string): FormAction[] => {
  const act = (action: string) => async (c: ExtraContext) => {
    try {
      const r = await postCall<{ state: string }>("realestate.operations.act", { doctype, name: c.name, action });
      toast.success(`${action}: ${r.state}`);
      c.reload();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };
  const state = (x: ExtraContext) => String(x.values.workflow_state ?? "Draft");
  return [
    { label: "Submit for approval", icon: Send, show: (x) => !x.isNew && state(x) === "Draft", run: act("Submit for Approval") },
    { label: "Approve", icon: CheckCircle2, show: (x) => state(x) === "Pending Approval", run: act("Approve") },
    { label: "Reject", icon: XCircle, show: (x) => state(x) === "Pending Approval", run: act("Reject") },
    { label: "Revise", icon: Send, show: (x) => state(x) === "Rejected", run: act("Revise") },
  ];
};
const wf = (doctype: string, icon: LucideIcon, subtitle: string, docs: string[] = []): Enhancer => ({
  icon, subtitle, extend: extend(() => ({ actions: [...workflowActions(doctype), ...docActions(doctype, docs)], summary: (v) => [{ label: "Approval", value: String(v.workflow_state ?? "Draft"), tone: v.workflow_state === "Approved" ? "emerald" : v.workflow_state === "Rejected" ? "rose" : "amber" }] })),
});

export const ENHANCERS: Record<string, Enhancer> = {
  "RE Map Feature": {
    icon: MapPinned,
    subtitle: "Infrastructure on the scheme map — build-out, network lengths, cost, assets and upkeep",
    extend: extend((c) => ({
      listHeaderExtra: <InfrastructureInsights />,
      topFilters: { searchLabel: "Feature name", fields: [{ field: "category", label: "Category" }, { field: "asset_status", label: "Status" }] },
      listFields: Array.from(new Set([...c.listFields, "feature_name", "feature_type", "category", "contractor", "asset_status"])),
      columns: [
        c.columns[0],
        { key: "feature_type", label: "Type", render: (r: Record<string, unknown>) => <span className="flex flex-col leading-tight"><span>{String(r.feature_type ?? "")}</span><span className="text-[10px] text-muted-foreground">{String(r.category ?? "")}</span></span> },
        { key: "__progress", label: "Progress", sortable: false, render: (r: Record<string, unknown>) => <FeatureCell name={String(r.name)} part="progress" /> },
        { key: "__size", label: "Length / area", sortable: false, render: (r: Record<string, unknown>) => <FeatureCell name={String(r.name)} part="size" /> },
        { key: "contractor", label: "Contractor", render: (r: Record<string, unknown>) => <span className="text-xs">{String(r.contractor ?? "—")}</span> },
        { key: "__upkeep", label: "Asset · upkeep", sortable: false, align: "right" as const, render: (r: Record<string, unknown>) => <FeatureCell name={String(r.name)} part="upkeep" /> },
      ],
      tabPanels: { Details: { after: (ctx: ExtraContext) => (
        <LocationCapture mode="shape" values={ctx.values} patch={ctx.patch} readOnly={ctx.readOnly} geoField="geojson" shapes={["Point", "LineString", "Polygon"]} title="Feature location" />
      ) } },
    })),
  },
  "RE Plot Size": {
    icon: Ruler,
    subtitle: "Plot sizes and prices — compare sell-through, stock, pace, price per marla and collections",
    extend: extend(() => ({
      listHeaderExtra: <SizeInsights />,
      tabPanels: { Details: { before: (ctx: ExtraContext) => (ctx.isNew ? null : <SizeInsights fixed={ctx.name} />) } },
    })),
  },
  "RE Block": {
    icon: Layers,
    subtitle: "Blocks — sell-through, plot sizes, streets, collections, overdue and society bills",
    extend: extend((c) => ({
      listHeaderExtra: <BlockCards />,
      columns: [
        ...c.columns,
        { key: "__sold", label: "Sold · availability", sortable: false, render: (r: Record<string, unknown>) => <BlockGauge block={String(r.name)} /> },
        { key: "__stock", label: "Unsold stock", sortable: false, align: "right" as const, render: (r: Record<string, unknown>) => <BlockStock block={String(r.name)} /> },
      ],
      tabPanels: { Details: {
        before: (ctx: ExtraContext) => (ctx.isNew ? null : <BlockProfile block={ctx.name} />),
        after: (ctx: ExtraContext) => <LocationCapture mode="shape" values={ctx.values} patch={ctx.patch} readOnly={ctx.readOnly} geoField="geojson" title="Block outline" />,
      } },
    })),
  },
  "RE Project": {
    icon: Building,
    subtitle: "Housing schemes — land use, sell-through, collections and development progress",
    extend: extend(() => ({
      listHeaderExtra: <ProjectCards />,
      tabPanels: { Details: {
        before: (ctx: ExtraContext) => (ctx.isNew ? null : <ProjectProfile project={ctx.name} />),
        after: (ctx: ExtraContext) => <LocationCapture mode="point" values={ctx.values} patch={ctx.patch} readOnly={ctx.readOnly} latField="centre_lat" lngField="centre_lng" title="Scheme centre (map default view)" />,
      } },
    })),
  },
  "RE Payment Plan": {
    subtitle: "Booking amount, down payment, installments, balloon payments, development charges and possession — schedules always total the net price",
    icon: CalendarCheck,
    extend: extend(() => ({
      listHeaderExtra: <PlanCards />,
      sectionRows: [["Booking & down payment", "Balloon payments", "Development charges"]],
      tabPanels: { Details: { before: (ctx: ExtraContext) => (ctx.isNew ? null : <PlanUsage plan={ctx.name} />) } },
      extra: (ctx: ExtraContext) => <PlanPreview values={ctx.values} />,
    })),
  },
  "RE Booking": {
    icon: ClipboardList,
    subtitle: "Plot bookings with installment plans — each posts a Sales Invoice; receipts post Payment Entries",
    extend: extend((c) => ({
      // only plots that can be booked; the dropdown shows status, block, size and price
      fields: c.fields.map((f) => (f.fieldname === "plot" ? { ...f, filters: [["status", "in", ["Available", "Reserved"]]] } : f)),
      linkEffects: {
        ...c.linkEffects,
        // block / size / project come from fetch_from; the plot's list price becomes the total price
        plot: async (v: unknown, vals: DocValues) => {
          const base = (await c.linkEffects?.plot?.(v, vals)) ?? {};
          if (!v) return base;
          const p = await get<{ list_price?: number } | null>("frappe.client.get_value", { doctype: "RE Plot", filters: String(v), fieldname: JSON.stringify(["list_price"]) });
          return { ...base, ...(p?.list_price ? { total_price: p.list_price } : {}) };
        },
        customer: async (v: unknown, vals: DocValues) => {
          const base = (await c.linkEffects?.customer?.(v, vals)) ?? {};
          if (!v) return base;
          const r = await get<{ mobile_no?: string; account_manager?: string } | null>("frappe.client.get_value", { doctype: "Customer", filters: String(v), fieldname: JSON.stringify(["mobile_no", "account_manager"]) });
          return { ...base, ...(r?.mobile_no ? { mobile_no: r.mobile_no } : {}), ...(!vals.agent && r?.account_manager ? { agent: r.account_manager } : {}) };
        },
      },
      summary: (v) => [
        { label: "Net price", value: money(v.net_price), tone: "indigo" },
        { label: "Paid", value: money(v.paid_amount), tone: "emerald" },
        { label: "Outstanding", value: money(v.outstanding_amount), tone: "amber" },
        { label: "Overdue", value: money(v.overdue_amount), tone: Number(v.overdue_amount) > 0 ? "rose" : "sky" },
      ],
      actions: [
        { label: "Record payment", icon: Wallet, group: "create", show: (x) => x.docstatus === 1 && Number(x.values.outstanding_amount) > 0,
          run: (x) => go(`${docBase("RE Payment")}/new?payment_against=Booking&booking=${encodeURIComponent(x.name ?? "")}&customer=${encodeURIComponent(String(x.values.customer ?? ""))}`)() },
        { label: "Open Sales Invoice", icon: Receipt, show: (x) => Boolean(x.values.sales_invoice), run: (x) => go(`/selling/sales-invoices/${encodeURIComponent(String(x.values.sales_invoice))}`)() },
        { label: "Show plot on map", icon: Map, show: (x) => Boolean(x.values.plot), run: (x) => go(`/re/plots/${encodeURIComponent(String(x.values.plot))}`)() },
        { label: "Give possession", icon: CheckCircle2, show: (x) => x.docstatus === 1 && x.values.status === "Paid" && !x.values.possession_date,
          run: run("RE Booking", "give_possession", "Possession given — letter issued") },
        { label: "Approve discount", icon: CheckCircle2, show: (x) => x.docstatus === 0 && Number(x.values.discount) > 0 && !x.values.discount_approved_by, run: run("RE Booking", "approve_discount", "Discount approved") },
        { label: "Transfer this plot…", icon: Repeat2, show: (x) => x.docstatus === 1 && x.values.status !== "Cancelled", run: (x) => go(`/re/operations?tab=transfers&wizard=transfer&booking=${encodeURIComponent(x.name ?? "")}`)() },
        { label: "Cancel booking & refund…", icon: Ban, show: (x) => x.docstatus === 1 && x.values.status !== "Cancelled", run: (x) => go(`/re/operations?tab=cancellations&wizard=cancel&booking=${encodeURIComponent(x.name ?? "")}`)() },
        ...sendActions("RE Booking", [["Installment Reminder", (c) => c.docstatus === 1 && Number(c.values.outstanding_amount) > 0],
          ["Overdue Notice", (c) => c.docstatus === 1 && Number(c.values.overdue_amount) > 0], ["Booking Confirmation"]]),
        ...docActions("RE Booking", ["Allotment Letter", "Payment Schedule", "Booking Application Form", "Sale Agreement", "Installment Reminder", "Final Notice",
          "No Demand Certificate", "Possession Letter", "Cancellation Letter"]),
      ],
    })),
  },
  "RE Payment": {
    icon: Wallet,
    subtitle: "Receipts against bookings and society bills — each posts a Payment Entry",
    extend: extend(() => ({
      summary: (v) => [{ label: "Amount", value: money(v.amount), tone: "emerald" }, { label: "Against", value: String(v.payment_against ?? "—"), tone: "sky" }],
      actions: [
        { label: "Open Payment Entry", icon: Receipt, show: (x) => Boolean(x.values.payment_entry), run: (x) => go(`/accounting/payment-entries/${encodeURIComponent(String(x.values.payment_entry))}`)() },
        { label: "Print receipt", icon: FileText, show: (x) => x.docstatus === 1, run: (x) => open(`/printview?doctype=RE%20Payment&name=${encodeURIComponent(x.name ?? "")}&format=RE%20Payment%20Receipt`)() },
        ...sendActions("RE Payment", [["Payment Receipt"]]),
        ...docActions("RE Payment", ["Payment Receipt"]),
      ],
    })),
  },
  "RE Society Bill": {
    icon: Receipt,
    subtitle: "Monthly society bills — billing, collection, arrears by age, blocks and defaulters",
    extend: extend((c) => ({
      topFilters: { searchLabel: "Plot # (e.g. A-003)", status: true, fields: [{ field: "block", label: "Block" }] },
      listHeaderExtra: <SocietyInsights />,
      listFields: Array.from(new Set([...c.listFields, "customer_name", "plot", "bill_month_label", "billing_month", "total_amount", "arrears", "paid_amount", "outstanding_amount", "status"])),
      // one row per bill: owner, plot, month, the charges that make up the bill, then the money
      columns: [
        c.columns[0],
        { key: "plot", label: "Plot", render: (r: Record<string, unknown>) => <span className="font-medium">{String(r.plot ?? "")}</span> },
        { key: "billing_month", label: "Month", render: (r: Record<string, unknown>) => String(r.bill_month_label ?? r.billing_month ?? "") },
        { key: "__charges", label: "Charges breakup", sortable: false, render: (r: Record<string, unknown>) => <BillBreakup name={String(r.name)} /> },
        { key: "total_amount", label: "Bill", align: "right" as const, getValue: (r: Record<string, unknown>) => Number(r.total_amount ?? 0),
          render: (r: Record<string, unknown>) => (
            <span className="flex flex-col items-end leading-tight"><span className="font-semibold tabular-nums">{money(Number(r.total_amount ?? 0))}</span>
              {Number(r.arrears) > 0 && Number(r.outstanding_amount) > 0 && <span className="text-[10px] text-red-600 dark:text-red-400" title="Unpaid earlier bills when this bill was issued">+ arrears {money(Number(r.arrears))}</span>}</span>) },
        { key: "paid_amount", label: "Paid", align: "right" as const, getValue: (r: Record<string, unknown>) => Number(r.paid_amount ?? 0),
          render: (r: Record<string, unknown>) => <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{money(Number(r.paid_amount ?? 0))}</span> },
        { key: "outstanding_amount", label: "Outstanding", align: "right" as const, getValue: (r: Record<string, unknown>) => Number(r.outstanding_amount ?? 0),
          render: (r: Record<string, unknown>) => <span className={Number(r.outstanding_amount) > 0 ? "font-semibold tabular-nums text-red-600 dark:text-red-400" : "tabular-nums text-muted-foreground"}>{money(Number(r.outstanding_amount ?? 0))}</span> },
        ...c.columns.filter((x) => x.key === "status"),
      ],
      summary: (v) => [
        { label: "This month", value: money(v.total_amount), tone: "indigo" },
        { label: "Arrears", value: money(v.arrears), tone: Number(v.arrears) > 0 ? "rose" : "sky" },
        { label: "Payable", value: money(v.total_payable ?? v.outstanding_amount), tone: "amber" },
      ],
      actions: [
        { label: "Record payment", icon: Wallet, group: "create", show: (x) => Number(x.values.outstanding_amount) > 0,
          run: (x) => go(`${docBase("RE Payment")}/new?payment_against=Society%20Bill&society_bill=${encodeURIComponent(x.name ?? "")}&customer=${encodeURIComponent(String(x.values.customer ?? ""))}`)() },
        ...sendActions("RE Society Bill", [["Society Bill", (c) => !c.isNew]]),
        ...docActions("RE Society Bill", ["Maintenance Bill"]),
      ],
    })),
  },
  "RE Plot": {
    icon: Grid3x3,
    subtitle: "Plot inventory — status, blocks, sizes, premium plots, pricing and payment health",
    extend: extend(() => ({
      topFilters: { searchLabel: "Plot # (e.g. A-003)", status: true, fields: [{ field: "block", label: "Block" }, { field: "plot_size", label: "Plot size" }] },
      // plots merged into another (e.g. A-118 + A-119 → A-118/119) are superseded: hidden here, reachable from the merged plot
      baseFilters: [["merged_into", "is", "not set"]],
      listHeaderExtra: <PlotInsights />,
      tabPanels: {
        Details: { before: (ctx: ExtraContext) => (ctx.isNew ? null : <><PlotProfile plot={ctx.name} /><AreaMap plot={ctx.name} height={340} /></>) },
        Map: { before: (ctx: ExtraContext) => (<>
          <LocationCapture mode="shape" values={ctx.values} patch={ctx.patch} readOnly={ctx.readOnly} geoField="geojson" latField="centre_lat" lngField="centre_lng" title="Plot location & outline" />
          {!ctx.isNew && <AreaMap plot={ctx.name} height={480} />}
        </>) },
      },
      actions: [
        { label: "Show on map", icon: Map, run: (x) => go(`/re/plots/${encodeURIComponent(x.name ?? "")}`)() },
        { label: "Book this plot", icon: ClipboardList, show: (x) => x.values.status === "Available", run: (x) => go(`${docBase("RE Booking")}/new?plot=${encodeURIComponent(x.name ?? "")}`)() },
        ...docActions("RE Plot", ["Site Plan", "NOC for Construction"]),
      ],
    })),
  },
  "RE Map Import": {
    icon: Upload,
    subtitle: "Survey files (KML / GeoJSON) → boundary, blocks, plots or map features — preview on the map before importing",
    extend: extend(() => ({
      actions: [{ label: "Run import", icon: Upload, run: run("RE Map Import", "run_import", "Import finished") }],
      tabPanels: { Details: { before: (ctx: ExtraContext) => <ImportPreview values={ctx.values} patch={ctx.patch} readOnly={ctx.readOnly} /> } },
    })),
  },
  "RE Broadcast": {
    icon: Megaphone,
    extend: extend(() => ({
      actions: [
        { label: "Fetch recipients", icon: ListChecks, run: run("RE Broadcast", "fetch_recipients", "Recipients fetched") },
        { label: "Start broadcast", icon: Megaphone, show: (x) => x.values.status === "Draft", run: run("RE Broadcast", "start", "Broadcast queued") },
      ],
    })),
  },
  "RE Generated Document": {
    icon: FileBadge,
    extend: extend(() => ({ actions: [{ label: "Open PDF", icon: FileText, show: (x) => Boolean(x.values.file), run: (x) => open(String(x.values.file))() }] })),
  },
  "RE Plot Transfer": wf("RE Plot Transfer", Repeat2, "Transfer of a booked plot to a new owner — fee invoice, credit note and a new invoice on approval",
    ["Transfer Application", "Transfer Letter"]),
  "RE Booking Cancellation": wf("RE Booking Cancellation", Ban, "Booking cancellation with deduction and refund (Credit Notes + Payment Entry) on approval"),
  "RE Plot Merge": wf("RE Plot Merge", Combine, "Merge adjacent plots into one on approval"),
  "RE Surcharge Waiver": wf("RE Surcharge Waiver", BadgePercent, "Waive a late-payment surcharge (Credit Note) on approval"),
  "RE Re-allotment": wf("RE Re-allotment", Repeat2, "Re-allot a cancelled plot to a new buyer — new booking and fee invoice on approval"),
  "RE Surcharge": { icon: BadgePercent, subtitle: "Monthly late-payment surcharge on overdue installments — billed as a Sales Invoice" },
  "RE Commission": {
    icon: HandCoins,
    subtitle: "Agent & dealer commissions — accrue on booking, payable after the customer pays the set share, paid by Payment Entry with a printable voucher",
    extend: extend(() => ({
      tabPanels: { Details: { before: (ctx: ExtraContext) => <CommissionPay ctx={ctx} /> } },
    })),
  },

  "RE Maintenance Plan": {
    icon: Wrench,
    subtitle: "Planned upkeep — what is due, who does it and how reliably it gets done",
    extend: extend((c) => ({
      listHeaderExtra: <MaintenancePlanInsights />,
      listFields: Array.from(new Set([...c.listFields, "title", "maintenance_type", "frequency", "next_due", "enabled"])),
      columns: [
        c.columns[0],
        { key: "maintenance_type", label: "Type", render: (r: Record<string, unknown>) => <span className="inline-flex rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs">{String(r.maintenance_type ?? "")}</span> },
        { key: "__who", label: "Assigned · frequency", sortable: false, render: (r: Record<string, unknown>) => <PlanCell name={String(r.name)} part="who" /> },
        { key: "next_due", label: "Next due", render: (r: Record<string, unknown>) => <PlanCell name={String(r.name)} part="due" /> },
        { key: "__rel", label: "Reliability (6 m)", sortable: false, render: (r: Record<string, unknown>) => <PlanCell name={String(r.name)} part="reliability" /> },
        { key: "__last", label: "Last job", sortable: false, render: (r: Record<string, unknown>) => <PlanCell name={String(r.name)} part="last" /> },
      ],
      actions: [{ label: "Create task now", icon: Wrench, run: run("RE Maintenance Plan", "create_task_now", "Task created") }],
    })),
  },
  "RE Charge Head": {
    icon: HandCoins,
    subtitle: "Society charge heads — rates, what each plot size pays, and what each head brings in",
    extend: extend((c) => ({
      listHeaderExtra: <ChargeHeadInsights />,
      listFields: Array.from(new Set([...c.listFields, "applies_to", "rate_type", "enabled", "sequence"])),
      columns: [
        c.columns[0],
        { key: "__rate", label: "Rate", sortable: false, render: (r: Record<string, unknown>) => <ChargeHeadCell name={String(r.name)} part="rate" /> },
        { key: "applies_to", label: "Applies to", render: (r: Record<string, unknown>) => <span className="text-xs">{String(r.applies_to ?? "")}</span> },
        { key: "__share", label: "Share of billing", sortable: false, render: (r: Record<string, unknown>) => <ChargeHeadCell name={String(r.name)} part="share" /> },
        { key: "__trend", label: "12-month trend", sortable: false, render: (r: Record<string, unknown>) => <ChargeHeadCell name={String(r.name)} part="trend" /> },
        { key: "__billed", label: "This month", sortable: false, align: "right" as const, render: (r: Record<string, unknown>) => <ChargeHeadCell name={String(r.name)} part="billed" /> },
        { key: "enabled", label: "Active", render: (r: Record<string, unknown>) => (Number(r.enabled) ? <span className="text-xs font-semibold text-emerald-600">Active</span> : <span className="text-xs text-muted-foreground">Off</span>) },
      ],
    })),
  },
};
