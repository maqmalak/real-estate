import useSWR from "swr";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Anchor, Boxes, CalendarClock, CheckCircle2, Circle, Container, FileCheck2, FileText, Package, Paperclip, Scale, Ship, Truck, Wand2 } from "lucide-react";
import type { DocConfig, DocValues, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, datetime, float, int, link, select, ro, req,
  nameCol, textCol, dateCol, numCol, statusCol, fmt,
} from "@/components/doc/doc-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { humanizeError, postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";
import { Tile } from "@/pages/Production/plan-panels";

const CBM_20FT = 33, CBM_40FT = 67;
const cartonCount = (no: unknown) => {
  const p = String(no ?? "").replace("–", "-").split("-").map((x) => x.trim());
  if (!no) return 0;
  return p.length === 2 && !Number.isNaN(+p[0]) && !Number.isNaN(+p[1]) ? +p[1] - +p[0] + 1 : 1;
};

/* ============================================================================ Export Packing */

function PackingGlance(c: ExtraContext) {
  const rows = c.rows.export_packing_details ?? [];
  const cartons = rows.reduce((s, r) => s + cartonCount(r.carton_no), 0);
  const net = rows.reduce((s, r) => s + asNumber(r.net_weight), 0);
  const gross = rows.reduce((s, r) => s + asNumber(r.gross_weight), 0);
  const cbm = rows.reduce((s, r) => s + asNumber(r.volume_cbm), 0);
  const fill20 = (cbm / CBM_20FT) * 100, fill40 = (cbm / CBM_40FT) * 100;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Package className="h-4 w-4" />} label="Cartons" value={formatNumber(cartons, 0)} sub={`${rows.length} lines · ${formatNumber(rows.reduce((s, r) => s + cartonCount(r.carton_no) * asNumber(r.pieces_per_carton), 0), 0)} cones`} />
        <Tile icon={<Scale className="h-4 w-4" />} label="Net / gross weight" value={`${formatNumber(net, 0)} kg`} sub={`gross ${formatNumber(gross, 0)} kg · tare ${formatNumber(gross - net, 0)} kg`} tone="sky" />
        <Tile icon={<Boxes className="h-4 w-4" />} label="Volume" value={`${formatNumber(cbm, 2)} CBM`} sub={cartons ? `${formatNumber(gross / cartons, 1)} kg / carton` : "—"} tone="violet" />
        <Tile icon={<Container className="h-4 w-4" />} label="Containers" value={cbm <= CBM_20FT ? "1 × 20 ft" : `${Math.ceil(cbm / CBM_40FT)} × 40 ft`} sub={`${formatNumber(Math.min(fill20, 999), 0)}% of a 20 ft · ${formatNumber(fill40, 0)}% of a 40 ft`} tone={fill20 > 100 ? "amber" : "emerald"} />
      </div>
      <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold">Container utilisation</p>
        {[["20 ft (≈ 33 CBM)", fill20], ["40 ft (≈ 67 CBM)", fill40]].map(([l, v]) => (
          <div key={l as string}>
            <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{l}</span><span className="tabular-nums text-muted-foreground">{formatNumber(v as number, 1)}%</span></div>
            <div className="h-2.5 rounded-full bg-muted"><div className={cn("h-2.5 rounded-full", (v as number) > 100 ? "bg-rose-500" : (v as number) > 85 ? "bg-emerald-500" : "bg-sky-500")} style={{ width: `${Math.min(100, v as number)}%` }} /></div>
          </div>
        ))}
      </Card>
      {!c.readOnly && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Wand2 className="h-5 w-5 text-primary" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">Build the carton list from the Sales Order: 100 lb cartons of 24 cones, weights in kg, 60×40×45 cm cartons.</p>
          <Button size="sm" onClick={() => void generateFromOrder(c)} disabled={!c.values.sales_order}>
            <Wand2 className="h-4 w-4" /> Generate cartons
          </Button>
        </Card>
      )}
    </div>
  );
}

/** Carton lines from the Sales Order's items (the shipment's share when an Export Shipment is linked). */
async function generateFromOrder(c: ExtraContext) {
  try {
    const so = await postCall<DocValues>("frappe.client.get", { doctype: "Sales Order", name: c.values.sales_order });
    let share = 1;
    if (c.values.export_shipment) {
      const n = await postCall<number>("frappe.client.get_count", { doctype: "Export Shipment", filters: JSON.stringify({ sales_order: c.values.sales_order }) }).catch(() => 1);
      share = 1 / Math.max(1, Number(n) || 1);
    }
    let carton = 0;
    const rows = (so.items ?? []).map((it: DocValues) => {
      let lb = asNumber(it.stock_qty) * share;
      if (String(it.stock_uom ?? "").toLowerCase().startsWith("kg")) lb *= 2.20462;
      const n = Math.max(1, Math.round(lb / 100));
      const net = Math.round(lb * 0.45359 * 100) / 100;
      const row = { carton_no: `${carton + 1}-${carton + n}`, item: it.item_code, style: String(it.item_name ?? "").slice(0, 40), size: String(it.item_name ?? "").split(" ")[0],
        quantity: Math.round(lb * 100) / 100, pieces_per_carton: 24, net_weight: net, gross_weight: Math.round((net + n * 1.35) * 100) / 100, dimensions: "60 × 40 × 45 cm", volume_cbm: Math.round(n * 0.108 * 1000) / 1000 };
      carton += n;
      return row;
    });
    c.patch({ export_packing_details: rows, customer: c.values.customer || so.customer, lc_proforma: c.values.lc_proforma || so.lc_proforma });
    toast.success(`${carton} cartons on ${rows.length} lines — save to keep them`);
  } catch (e) {
    toast.error(humanizeError(e));
  }
}

export const EXPORT_PACKING_CONFIG: DocConfig = {
  doctype: "Export Packing Details",
  base: "/export/packing",
  singular: "Packing List",
  plural: "Export Packing Lists",
  subtitle: "Carton-wise packing for export shipments — weights, volume and container fill",
  icon: Package,
  companyScoped: false,
  listFields: ["name", "packing_no", "packing_date", "sales_order", "export_shipment", "customer", "total_cartons", "total_net_weight", "total_cbm", "modified"],
  columns: [nameCol("Packing List", (r) => r.customer), dateCol("packing_date", "Date"), textCol("export_shipment", "Shipment"), textCol("sales_order", "Sales Order"),
    numCol("total_cartons", "Cartons", 0), numCol("total_net_weight", "Net kg", 0), numCol("total_cbm", "CBM", 2)],
  searchFields: ["name", "customer", "sales_order", "export_shipment"],
  dateField: "packing_date",
  sort: { key: "packing_date", dir: "desc" },
  fields: [
    tab("Packing"),
    sec("References"),
    ro(data("packing_no", "Packing No")),
    req(date("packing_date", "Packing Date")),
    link("customer", "Buyer", "Customer"),
    colBreak(),
    link("sales_order", "Sales Order", "Sales Order"),
    link("export_shipment", "Export Shipment", "Export Shipment"),
    link("lc_proforma", "LC Proforma", "LC Proforma"),
    tab("Cartons"),
    sec("Totals"),
    ro(int("total_cartons", "Total Cartons")),
    ro(float("total_pieces", "Total Pieces (cones)")),
    ro(float("total_cbm", "Total CBM")),
    colBreak(),
    ro(float("total_net_weight", "Total Net Weight (kg)")),
    ro(float("total_gross_weight", "Total Gross Weight (kg)")),
  ],
  children: [{
    tab: "Cartons",
    key: "export_packing_details",
    label: "Carton List",
    description: "One line per carton range (e.g. 1-40) of the same item.",
    doctype: "Export Packing Details Item",
    wide: true,
    columns: [req(data("carton_no", "Carton No(s)")), req(link("item", "Item", "Item")), data("style", "Style"), data("color", "Color"), float("quantity", "Qty (lb)"),
      int("pieces_per_carton", "Cones / Carton"), float("net_weight", "Net kg"), float("gross_weight", "Gross kg"), float("volume_cbm", "CBM")],
    dialogColumns: [data("size", "Count / Size"), data("dimensions", "Carton Dimensions")],
    newRow: (_v, rows) => {
      const last = rows.length ? String(rows[rows.length - 1].carton_no ?? "").split("-").pop() : "0";
      const n = (Number(last) || 0) + 1;
      return { carton_no: String(n), pieces_per_carton: 24, dimensions: "60 × 40 × 45 cm", volume_cbm: 0.108 };
    },
    totals: (rows) => [
      { label: "Cartons", value: fmt(rows.reduce((s, r) => s + cartonCount(r.carton_no), 0), 0), align: "right" },
      { label: "Net kg", value: fmt(rows.reduce((s, r) => s + asNumber(r.net_weight), 0)), align: "right" },
      { label: "CBM", value: fmt(rows.reduce((s, r) => s + asNumber(r.volume_cbm), 0), 3), align: "right" },
    ],
  }],
  compute: (_v, rows) => {
    const r = rows.export_packing_details ?? [];
    const cartons = r.reduce((s, x) => s + cartonCount(x.carton_no), 0);
    return { values: { total_cartons: cartons, total_pieces: r.reduce((s, x) => s + cartonCount(x.carton_no) * asNumber(x.pieces_per_carton), 0),
      total_net_weight: r.reduce((s, x) => s + asNumber(x.net_weight), 0), total_gross_weight: r.reduce((s, x) => s + asNumber(x.gross_weight), 0),
      total_cbm: r.reduce((s, x) => s + asNumber(x.volume_cbm), 0) } };
  },
  tabIcons: { Packing: FileText, Cartons: Boxes },
  tabPanels: { Packing: { before: (c) => <PackingGlance {...c} /> } },
  defaults: () => ({ packing_date: todayISO() }),
  titleOf: (v) => (v.name ? `${v.name}${v.customer ? ` · ${v.customer}` : ""}` : "New Packing List"),
};

/* ============================================================================ Export Shipment */

const FLOW = ["Planned", "Booking", "Stuffing", "Shipped", "In Transit", "Arrived", "Delivered", "Closed"];
interface ShipInsights {
  packing: { lists: string[]; cartons: number; pieces: number; net: number; gross: number; cbm: number; containers_20: number; containers_40: number };
  order: { name: string; status: string; grand_total: number; currency: string; per_delivered: number; per_billed: number } | null;
  lc: { name: string; lc_no?: string; lc_amount?: number; lc_currency?: string; lc_expiry_date?: string; latest_shipment_date?: string; workflow_state?: string } | null;
  days_to_etd: number | null; days_to_eta: number | null; transit_days: number | null; late_vs_lc: number | null;
}

function ShipmentGlance(c: ExtraContext) {
  const v = c.values;
  const { data } = useSWR(!c.isNew && c.name ? `ship-insights:${c.name}:${v.modified ?? ""}` : null,
    () => postCall<ShipInsights>("micromax.export_insights.get_shipment_insights", { name: c.name }), { revalidateOnFocus: false });
  const at = Math.max(0, FLOW.indexOf(String(v.shipment_status || "Planned")));
  const docs: [string, unknown][] = [["Commercial Invoice", v.commercial_invoice_no], ["Packing List", v.packing_list_no], ["Bill of Lading", v.bill_of_lading_no], ["Container No", v.container_no], ["LC", v.lc_no || v.lc_proforma]];
  const ready = docs.filter(([, x]) => x).length;
  const cd = (d: number | null, what: string) => (d == null ? "—" : d > 0 ? `in ${d} d` : d === 0 ? "today" : `${-d} d ago`) + (what ? "" : "");
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <ol className="flex items-center gap-1.5 overflow-x-auto">
          {FLOW.map((s, i) => (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2",
                i < at || (i === at && s === "Closed") ? "bg-emerald-500 text-white ring-emerald-500/30" : i === at ? "bg-primary text-primary-foreground ring-primary/30" : "bg-muted text-muted-foreground ring-border")}>
                {i < at || (i === at && s === "Closed") ? <CheckCircle2 className="h-4 w-4" /> : i === 3 ? <Ship className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("truncate text-[11px] font-medium", i === at ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < FLOW.length - 1 && <span className={cn("h-0.5 min-w-3 flex-1 rounded", i < at ? "bg-emerald-500" : "bg-border")} />}
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Anchor className="h-4 w-4" />} label="ETD" value={cd(data?.days_to_etd ?? null, "")} sub={v.etd ? String(v.etd).slice(0, 10) : "not set"} tone="sky" />
        <Tile icon={<CalendarClock className="h-4 w-4" />} label="ETA" value={cd(data?.days_to_eta ?? null, "")} sub={data?.transit_days != null ? `${data.transit_days} days in transit` : v.eta ? String(v.eta).slice(0, 10) : "not set"} tone="violet" />
        <Tile icon={<Package className="h-4 w-4" />} label="Packed" value={data ? `${formatNumber(data.packing.cartons, 0)} cartons` : "—"}
          sub={data ? `${formatNumber(data.packing.gross, 0)} kg gross · ${formatNumber(data.packing.cbm, 2)} CBM` : ""} tone="emerald" />
        <Tile icon={<FileCheck2 className="h-4 w-4" />} label="Documents" value={`${ready} / ${docs.length}`} sub={ready === docs.length ? "complete" : "missing some"} tone={ready === docs.length ? "emerald" : "amber"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 p-5">
          <p className="text-sm font-semibold">Shipping documents</p>
          {docs.map(([l, x]) => (
            <div key={l} className="flex items-center gap-2 text-sm">
              {x ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className="flex-1">{l}</span>
              <span className="truncate text-xs text-muted-foreground">{x ? String(x) : "—"}</span>
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-5">
          <p className="text-sm font-semibold">Export order</p>
          {data?.order ? (
            <>
              <Link className="text-sm font-medium text-primary hover:underline" to={`/selling/sales-orders/${encodeURIComponent(data.order.name)}`}>{data.order.name}</Link>
              <p className="text-xs text-muted-foreground">{data.order.status} · {formatMoney(data.order.grand_total, data.order.currency)}</p>
              {[["Delivered", data.order.per_delivered, "bg-sky-500"], ["Billed", data.order.per_billed, "bg-emerald-500"]].map(([l, p, col]) => (
                <div key={l as string}>
                  <div className="mb-1 flex justify-between text-xs"><span>{l}</span><span className="tabular-nums text-muted-foreground">{formatNumber(asNumber(p), 1)}%</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", col as string)} style={{ width: `${Math.min(100, asNumber(p))}%` }} /></div>
                </div>
              ))}
            </>
          ) : <p className="text-sm text-muted-foreground">No sales order linked.</p>}
        </Card>
        <Card className="space-y-2 p-5">
          <p className="text-sm font-semibold">Letter of credit</p>
          {data?.lc ? (
            <>
              <Link className="text-sm font-medium text-primary hover:underline" to={`/export/lc-proforma/${encodeURIComponent(data.lc.name)}`}>{data.lc.name}</Link>
              <p className="text-xs text-muted-foreground">LC {data.lc.lc_no ?? "—"} · {data.lc.workflow_state ?? ""}</p>
              <p className="text-xs">Latest shipment <b>{data.lc.latest_shipment_date ?? "—"}</b> · expiry <b>{data.lc.lc_expiry_date ?? "—"}</b></p>
              {data.late_vs_lc != null && (
                <p className={cn("text-xs font-medium", data.late_vs_lc > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {data.late_vs_lc > 0 ? `Shipped ${data.late_vs_lc} days after the LC's latest shipment date` : `Within the LC shipment window (${-data.late_vs_lc} days to spare)`}
                </p>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">No LC proforma linked.</p>}
        </Card>
      </div>
    </div>
  );
}

function AttachmentsPanel({ name, isNew }: ExtraContext) {
  const { data: files } = useFrappeGetDocList<{ name: string; file_name: string; file_url: string; creation: string }>("File", {
    fields: ["name", "file_name", "file_url", "creation"], filters: [["attached_to_doctype", "=", "Export Shipment"], ["attached_to_name", "=", name ?? ""]], limit: 50,
  }, !isNew && name ? `ship-files:${name}` : null);
  if (isNew) return null;
  return (
    <Card className="p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-primary" /> Attachments</p>
      {(files ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No files attached — attach BL, invoice and packing scans in the desk (Actions → Open in ERPNext desk).</p> : (
        <ul className="space-y-1.5">{(files ?? []).map((f) => <li key={f.name}><a href={f.file_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">{f.file_name}</a> <span className="text-xs text-muted-foreground">· {String(f.creation).slice(0, 10)}</span></li>)}</ul>
      )}
    </Card>
  );
}

export const EXPORT_SHIPMENT_CONFIG: DocConfig = {
  doctype: "Export Shipment",
  base: "/export/shipments",
  singular: "Export Shipment",
  plural: "Export Shipments",
  subtitle: "Container shipments — booking to delivery, documents, packing and LC compliance",
  icon: Ship,
  companyScoped: false,
  listFields: ["name", "shipment_no", "customer", "sales_order", "container_no", "vessel", "etd", "eta", "shipment_status", "modified"],
  columns: [nameCol("Shipment", (r) => r.customer), textCol("sales_order", "Sales Order"), textCol("container_no", "Container"), textCol("vessel", "Vessel"),
    dateCol("etd", "ETD"), dateCol("eta", "ETA"), statusCol("shipment_status", "Status", "Planned")],
  searchFields: ["name", "customer", "sales_order", "container_no", "vessel", "bill_of_lading_no"],
  statusField: "shipment_status",
  statuses: FLOW,
  dateField: "shipment_date",
  sort: { key: "shipment_date", dir: "desc" },
  fields: [
    tab("Shipment"),
    sec("Shipment"),
    ro(data("shipment_no", "Shipment No")),
    req(date("shipment_date", "Shipment Date")),
    select("shipment_status", "Status", ["", ...FLOW]),
    colBreak(),
    link("customer", "Buyer", "Customer"),
    link("sales_order", "Sales Order", "Sales Order"),
    link("lc_proforma", "LC Proforma", "LC Proforma"),
    tab("Vessel & Route"),
    sec("Carrier"),
    data("shipping_line", "Shipping Line"),
    data("vessel", "Vessel"),
    data("container_no", "Container No"),
    colBreak(),
    datetime("etd", "ETD"),
    datetime("eta", "ETA"),
    date("actual_shipment_date", "Actual Shipment Date"),
    sec("Route"),
    data("port_of_loading", "Port of Loading"),
    data("port_of_discharge", "Port of Discharge"),
    colBreak(),
    data("final_destination", "Final Destination"),
    tab("Documents"),
    sec("Document numbers"),
    data("commercial_invoice_no", "Commercial Invoice No"),
    data("packing_list_no", "Packing List No"),
    colBreak(),
    data("bill_of_lading_no", "Bill of Lading No"),
    data("lc_no", "LC No"),
  ],
  tabIcons: { Shipment: Ship, "Vessel & Route": Truck, Documents: FileCheck2 },
  tabPanels: { Shipment: { before: (c) => <ShipmentGlance {...c} /> }, Documents: { after: (c) => <AttachmentsPanel {...c} /> } },
  actions: [
    {
      label: "Create Packing List", icon: Package, group: "create", show: (c) => !c.isNew && !c.values.packing_list_no,
      run: async (c) => {
        try {
          const r = await postCall<DocValues>("frappe.client.insert", { doc: { doctype: "Export Packing Details", packing_date: todayISO(), export_shipment: c.name,
            sales_order: c.values.sales_order, customer: c.values.customer, lc_proforma: c.values.lc_proforma } });
          await postCall("frappe.client.set_value", { doctype: "Export Shipment", name: c.name, fieldname: "packing_list_no", value: r.name });
          toast.success(`Packing list ${r.name} created — open it and use “Generate cartons”`);
          c.reload();
          window.location.assign(`/export/packing/${encodeURIComponent(String(r.name))}`);
        } catch (e) {
          toast.error(humanizeError(e));
        }
      },
    },
  ],
  defaults: () => ({ shipment_date: todayISO(), shipment_status: "Planned" }),
  titleOf: (v) => (v.name ? `${v.name}${v.customer ? ` · ${v.customer}` : ""}` : "New Export Shipment"),
};
