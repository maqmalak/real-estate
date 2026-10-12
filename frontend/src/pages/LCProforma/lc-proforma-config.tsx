import useSWR from "swr";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Landmark, Package, Receipt, Ship, ShoppingCart, Truck } from "lucide-react";
import type { DocConfig, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, int, currency, check, text, link, select, ro, req,
  nameCol, textCol, dateCol, moneyCol, statusCol, fmt,
} from "@/components/doc/doc-helpers";
import { Card } from "@/components/ui/card";
import { createSalesOrderFromLC, humanizeError, postCall } from "@/services/frappe";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { getLinkedValues } from "@/hooks/useDoc";
import { todayISO } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";
import { Tile } from "@/pages/Production/plan-panels";

const STAGES = ["Draft", "Submitted", "Buyer Approval", "LC Requested", "LC Received", "Confirmed", "Closed"];
const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

interface LcInsights {
  proforma_value: number; lc_amount: number; lc_cover: number | null; currency: string;
  days_to_shipment: number | null; days_to_expiry: number | null;
  order: { name: string; status: string; grand_total: number; currency: string; per_delivered: number; per_billed: number } | null;
  invoiced: number; invoices: number; outstanding: number; shipped: number;
  shipments: { name: string; shipment_no: string; shipment_date: string; actual_shipment_date: string; shipment_status: string; vessel?: string; bill_of_lading_no?: string }[];
}

const countdown = (d: number | null, what: string) =>
  d == null ? { v: "—", sub: `no ${what}`, tone: "primary" as const }
    : d < 0 ? { v: `${Math.abs(d)} d ago`, sub: `${what} passed`, tone: "rose" as const }
    : { v: `${d} d`, sub: `to ${what}`, tone: d <= 15 ? ("amber" as const) : ("emerald" as const) };

/** Workflow stepper + LC cover, deadlines, and execution (order, invoices, shipments). */
function LcGlancePanel({ name, isNew, values }: ExtraContext) {
  const state = String(values.workflow_state || (values.docstatus === 1 ? "Submitted" : "Draft"));
  const at = Math.max(0, STAGES.indexOf(state));
  const { data } = useSWR(!isNew && name ? `lc-insights:${name}:${values.modified ?? ""}` : null,
    () => postCall<LcInsights>("micromax.export_insights.get_lc_insights", { name }), { revalidateOnFocus: false });
  const cur = values.lc_currency || values.currency || "USD";
  const proforma = asNumber(values.total_proforma_value);
  const lc = asNumber(values.lc_amount);
  const ship = countdown(data?.days_to_shipment ?? null, "latest shipment");
  const exp = countdown(data?.days_to_expiry ?? null, "LC expiry");
  const closed = state === "Closed";
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <ol className="flex items-center gap-1.5 overflow-x-auto">
          {STAGES.map((s, i) => (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2",
                i < at || (closed && i === at) ? "bg-emerald-500 text-white ring-emerald-500/30" : i === at ? "bg-primary text-primary-foreground ring-primary/30" : "bg-muted text-muted-foreground ring-border")}>
                {i < at || (closed && i === at) ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("truncate text-[11px] font-medium", i === at ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < STAGES.length - 1 && <span className={cn("h-0.5 min-w-3 flex-1 rounded", i < at ? "bg-emerald-500" : "bg-border")} />}
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<FileText className="h-4 w-4" />} label="Proforma value" value={formatMoney(proforma, values.currency || cur)} sub={`${fmt(values.total_quantity)} qty · ${fmt(values.total_cartons, 0)} cartons`} />
        <Tile icon={<Landmark className="h-4 w-4" />} label="LC amount" value={lc ? formatMoney(lc, cur) : "—"}
          sub={lc && proforma ? `${formatNumber((lc / proforma) * 100, 1)}% cover${lc < proforma ? " · short" : ""}` : values.lc_required ? "LC not recorded yet" : "LC not required"}
          tone={!lc ? "amber" : lc + 0.005 >= proforma ? "emerald" : "rose"} />
        <Tile icon={<CalendarClock className="h-4 w-4" />} label="Latest shipment" value={ship.v} sub={values.latest_shipment_date ? `${ship.sub} · ${values.latest_shipment_date}` : ship.sub} tone={closed ? "primary" : ship.tone} />
        <Tile icon={<AlertTriangle className="h-4 w-4" />} label="LC expiry" value={exp.v} sub={values.lc_expiry_date ? `${exp.sub} · ${values.lc_expiry_date}` : exp.sub} tone={closed ? "primary" : exp.tone} />
      </div>
      {data && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="space-y-3 p-5 lg:col-span-2">
            <p className="text-sm font-semibold">Execution</p>
            {data.order ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Export order <Link className="font-medium text-primary hover:underline" to={`/selling/sales-orders/${encodeURIComponent(data.order.name)}`}>{data.order.name}</Link> · {data.order.status}
                </p>
                {[["Delivered", data.order.per_delivered, "bg-sky-500"], ["Billed", data.order.per_billed, "bg-emerald-500"]].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{l}</span><span className="tabular-nums text-muted-foreground">{formatNumber(asNumber(v), 1)}%</span></div>
                    <div className="h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", c as string)} style={{ width: `${Math.min(100, asNumber(v))}%` }} /></div>
                  </div>
                ))}
                <dl className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="rounded-lg bg-muted/40 p-2"><dt className="text-muted-foreground">Invoiced ({data.invoices})</dt><dd className="font-semibold tabular-nums">{formatMoney(data.invoiced, data.order.currency)}</dd></div>
                  <div className="rounded-lg bg-muted/40 p-2"><dt className="text-muted-foreground">Outstanding</dt><dd className={cn("font-semibold tabular-nums", data.outstanding ? "text-amber-600 dark:text-amber-400" : "")}>{formatMoney(data.outstanding, data.order.currency)}</dd></div>
                </dl>
              </>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No export order yet — use <b>Actions → Create Sales Order</b>.</p>
            )}
          </Card>
          <Card className="p-5 lg:col-span-3">
            <p className="mb-3 text-sm font-semibold">Shipments <span className="font-normal text-muted-foreground">· {data.shipped} of {data.shipments.length} shipped</span></p>
            {data.shipments.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No shipments against this proforma.</p> : (
              <ul className="max-h-60 divide-y divide-border/60 overflow-y-auto text-xs scrollbar-thin">
                {data.shipments.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 py-2">
                    <Ship className={cn("h-4 w-4 shrink-0", s.actual_shipment_date ? "text-emerald-500" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/export/shipments/${encodeURIComponent(s.name)}`} className="font-medium text-primary hover:underline">{s.shipment_no || s.name}</Link>
                      <p className="truncate text-muted-foreground">{[s.vessel, s.bill_of_lading_no].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{s.actual_shipment_date || s.shipment_date}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5">{s.shipment_status || "Draft"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export const LC_PROFORMA_CONFIG: DocConfig = {
  doctype: "LC Proforma",
  base: "/export/lc-proforma",
  singular: "LC Proforma",
  plural: "LC Proformas",
  subtitle: "Export proforma invoice, letter of credit terms and shipment conditions",
  icon: FileText,
  submittable: true,
  listFields: ["name", "proforma_no", "proforma_date", "customer", "currency", "total_proforma_value", "lc_no", "lc_amount", "lc_expiry_date", "workflow_state", "docstatus", "modified"],
  columns: [nameCol("Proforma", (r) => r.customer), dateCol("proforma_date", "Date"), textCol("lc_no", "LC No"), moneyCol("total_proforma_value", "Value"),
    dateCol("lc_expiry_date", "LC Expiry"), statusCol("workflow_state", "Stage", "Draft")],
  searchFields: ["name", "customer", "lc_no", "buyer_po_no"],
  statusField: "workflow_state",
  statuses: STAGES,
  dateField: "proforma_date",
  fields: [
    tab("Proforma"),
    sec("Proforma"),
    ro(data("proforma_no", "Proforma No")),
    req(date("proforma_date", "Proforma Date")),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(link("customer", "Buyer", "Customer")),
    data("buyer_po_no", "Buyer PO No"),
    ro(link("export_order", "Export Order", "Sales Order")),
    sec("Currency"),
    req(link("currency", "Currency", "Currency")),
    colBreak(),
    float("exchange_rate", "Exchange Rate (to PKR)"),

    tab("Items"),
    sec("Totals"),
    ro(float("total_quantity", "Total Quantity")),
    ro(int("total_cartons", "Total Cartons")),
    ro(currency("total_proforma_value", "Total Proforma Value")),
    colBreak(),
    ro(float("total_net_weight", "Total Net Weight")),
    ro(float("total_gross_weight", "Total Gross Weight")),

    tab("Letter of Credit"),
    sec("LC"),
    check("lc_required", "LC Required"),
    data("lc_no", "LC No"),
    date("lc_date", "LC Date"),
    select("lc_type", "LC Type", ["", "Irrevocable", "Revocable", "Standby", "Confirmed Irrevocable"]),
    colBreak(),
    currency("lc_amount", "LC Amount"),
    link("lc_currency", "LC Currency", "Currency"),
    date("lc_expiry_date", "LC Expiry Date"),
    data("lc_expiry_place", "Expiry Place"),
    sec("Banks"),
    data("lc_issuing_bank", "Issuing Bank"),
    data("lc_advising_bank", "Advising Bank"),
    colBreak(),
    data("lc_confirming_bank", "Confirming Bank"),

    tab("Shipment"),
    sec("Terms"),
    date("latest_shipment_date", "Latest Shipment Date"),
    select("shipment_mode", "Shipment Mode", ["", "Sea", "Air", "Road", "Rail", "Multimodal"]),
    select("incoterm", "Incoterm", INCOTERMS),
    link("payment_terms", "Payment Terms", "Payment Terms Template"),
    colBreak(),
    check("partial_shipment_allowed", "Partial Shipment Allowed"),
    check("transshipment_allowed", "Transshipment Allowed"),
    sec("Route"),
    data("port_of_loading", "Port of Loading"),
    data("port_of_discharge", "Port of Discharge"),
    colBreak(),
    data("final_destination", "Final Destination"),
    link("country_of_destination", "Country of Destination", "Country"),

    tab("Banking"),
    sec("Beneficiary"),
    data("beneficiary_bank", "Beneficiary Bank"),
    link("bank_account", "Bank Account", "Bank Account"),
    data("bank_branch", "Branch"),
    colBreak(),
    data("swift_code", "SWIFT Code"),
    data("correspondent_bank", "Correspondent Bank"),
  ],
  children: [{
    tab: "Items",
    key: "lc_proforma_items",
    label: "Proforma Items",
    description: "Yarn quoted on the proforma — quantity × rate, with customs and packing details per line.",
    doctype: "LC Proforma Item",
    minRows: 1,
    wide: true,
    columns: [req(link("item", "Item", "Item")), ro(data("item_name", "Item Name")), data("hs_code", "HS Code"), req(float("quantity", "Qty")), link("uom", "UOM", "UOM"),
      currency("rate", "Rate"), ro(currency("amount", "Amount")), int("cartons", "Cartons")],
    dialogColumns: [text("description", "Description"), data("buyer_style_no", "Buyer Style No"), data("style_no", "Style No"), data("color", "Color"), data("size", "Size"),
      link("country_of_origin", "Country of Origin", "Country"), float("net_weight", "Net Weight"), float("gross_weight", "Gross Weight")],
    newRow: () => ({ quantity: 0, rate: 0, amount: 0 }),
    linkEffects: {
      item: async (code) => {
        const v: Record<string, any> = await getLinkedValues("Item", code, ["item_name", "stock_uom", "hs_code", "country_of_origin"]).catch(() => ({}));
        return { item_name: v.item_name ?? code, uom: v.stock_uom, hs_code: v.hs_code, country_of_origin: v.country_of_origin };
      },
    },
    totals: (rows) => [
      { label: "Qty", value: fmt(rows.reduce((s, r) => s + asNumber(r.quantity), 0)), align: "right" },
      { label: "Cartons", value: fmt(rows.reduce((s, r) => s + asNumber(r.cartons), 0), 0), align: "right" },
      { label: "Value", value: formatMoney(rows.reduce((s, r) => s + asNumber(r.quantity) * asNumber(r.rate), 0), "USD", { symbol: "" }), align: "right" },
    ],
  }],
  // Live line amounts and header totals (the server recomputes them on save).
  compute: (_v, rows) => {
    const items: Record<string, any>[] = (rows.lc_proforma_items ?? []).map((r) => ({ ...r, amount: asNumber(r.quantity) * asNumber(r.rate) }));
    const sum = (k: string) => items.reduce((s, r) => s + asNumber(r[k]), 0);
    return {
      rows: { lc_proforma_items: items },
      values: { total_quantity: sum("quantity"), total_cartons: sum("cartons"), total_net_weight: sum("net_weight"), total_gross_weight: sum("gross_weight"), total_proforma_value: sum("amount") },
    };
  },
  tabIcons: { Proforma: FileText, Items: Package, "Letter of Credit": Landmark, Shipment: Truck, Banking: Receipt },
  tabPanels: { Proforma: { before: (ctx) => <LcGlancePanel {...ctx} /> } },
  actions: [
    {
      label: "Create Sales Order", icon: ShoppingCart, group: "create", show: (c) => !c.values.export_order,
      run: async (c) => {
        try {
          const so = await createSalesOrderFromLC(c.name!);
          toast.success(`Sales Order ${so} created`);
          notifyDataChanged();
          c.reload();
        } catch (e) {
          toast.error(humanizeError(e));
        }
      },
    },
  ],
  defaults: ({ company }) => ({ company, proforma_date: todayISO(), currency: "USD", lc_currency: "USD", lc_required: 1 }),
  summary: (v, rows) => [
    { label: "Buyer", value: v.customer || "—", tone: "sky" },
    { label: "Lines", value: (rows.lc_proforma_items ?? []).length, tone: "indigo" },
    { label: "Value", value: formatMoney(v.total_proforma_value, v.currency || "USD"), tone: "emerald" },
  ],
  titleOf: (v) => (v.name ? `${v.name}${v.customer ? ` · ${v.customer}` : ""}` : "New LC Proforma"),
};

