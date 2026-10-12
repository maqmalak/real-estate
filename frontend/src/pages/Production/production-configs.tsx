import { ArrowRightLeft, PackageCheck, Wrench, Activity, AlertTriangle, ArrowLeftRight, Boxes, Gauge, Route, Settings2, Shapes, Users, CalendarClock, CalendarRange, ClipboardList, Clock, Cog, Coins, Factory, FlaskConical, Layers, ListChecks, Network, Package, SlidersHorizontal, Timer } from "lucide-react";
import type { DocConfig, ChildTableSpec } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, datetime, int, float, currency, check, text, link, select, ro, req, when,
  nameCol, textCol, dateCol, dateTimeCol, numCol, moneyCol, statusCol, yesNoCol, progressCol, docstatusCol, fmt, fmtMoney,
} from "@/components/doc/doc-helpers";
import { getLinkedValues, type Doc } from "@/hooks/useDoc";
import { humanizeError, postCall, postCallForDoc } from "@/services/frappe";
import toast from "react-hot-toast";
import type { ExtraContext } from "@/components/doc/doc-config";
import { todayISO, nowERPDateTime } from "@/utils/dates";
import { asNumber } from "@/utils/cn";
import { computeBom, computeWorkOrder, totalBlend } from "./mfg-calc";
import { RawMaterialsPanel } from "./RawMaterialsPanel";
import { PlanCostingPanel, PlanOperationsPanel } from "./plan-panels";
import { BomCostingPanel } from "./bom-panels";
import {
  JcProgressPanel, JcTimePanel, WoCostingPanel, WoMaterialsPanel, WoOperationsPanel, WoPerformancePanel, WoProgressPanel, WoSchedulePanel,
} from "./wo-jc-panels";
import { DowntimeHistoryPanel, DowntimeSummaryPanel, RoutingFlowPanel, WorkstationPerformancePanel } from "./masters-panels";

/** "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DDTHH:mm" → Date (local), or null. */
const parseDT = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
};
const pad = (n: number) => String(n).padStart(2, "0");
const fmtDT = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Item → the fields a row/header needs (name, unit, and a starting rate). */
async function itemInfo(code: string) {
  const v = await getLinkedValues("Item", code, ["item_name", "stock_uom", "valuation_rate", "standard_rate", "description"]);
  return { name: v.item_name as string | undefined, uom: (v.stock_uom as string | undefined) ?? "Nos", rate: asNumber(v.valuation_rate) || asNumber(v.standard_rate), description: v.description as string | undefined };
}

/* ============================================================================ form actions */

const submitted = (c: ExtraContext) => c.docstatus === 1;
/** Run a whitelisted method of the saved document (the desk's doc.call), then reload the form. */
async function docMethod(c: ExtraContext, doctype: string, method: string, done: string) {
  try {
    await postCallForDoc(method, { ...c.values, doctype });
    toast.success(done);
    c.reload();
  } catch (e) {
    toast.error(humanizeError(e));
  }
}

/* ============================================================================ Workstation */

const WORKSTATION_COSTS: ChildTableSpec = {
  tab: "Costing",
  key: "workstation_costs",
  label: "Operating Components Cost",
  description: "What one hour on this workstation costs — the net hour rate is the sum of these.",
  doctype: "Workstation Cost",
  columns: [req(link("operating_component", "Operating Component", "Workstation Operating Component")), req(currency("operating_cost", "Operating Cost"))],
  newRow: () => ({ operating_cost: 0 }),
  totals: (rows) => [{ label: "Net hour rate", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.operating_cost), 0)), align: "right" }],
};

export const WORKSTATION_CONFIG: DocConfig = {
  doctype: "Workstation",
  base: "/production/workstations",
  singular: "Workstation",
  plural: "Workstations",
  subtitle: "Machines and work centres, their capacity and hourly cost",
  icon: Cog,
  companyScoped: false,
  listFields: ["name", "workstation_name", "workstation_type", "plant_floor", "status", "hour_rate", "production_capacity", "spindles", "shifts_per_day", "disabled", "modified"],
  columns: [
    nameCol("Workstation", (r) => r.workstation_type || undefined),
    textCol("plant_floor", "Plant Floor"),
    statusCol("status", "Status", "Off"),
    moneyCol("hour_rate", "Hour Rate"),
    numCol("production_capacity", "Job Capacity", 0),
    numCol("spindles", "Spindles", 0),
    yesNoCol("disabled", "Enabled", "Disabled", "Enabled"),
  ],
  searchFields: ["name", "workstation_name", "workstation_type", "plant_floor"],
  statusField: "status",
  statuses: ["Production", "Idle", "Setup", "Maintenance", "Problem", "Off"],
  fields: [
    tab("Details"),
    sec("Workstation"),
    req(data("workstation_name", "Workstation Name")),
    link("workstation_type", "Workstation Type", "Workstation Type"),
    link("plant_floor", "Plant Floor", "Plant Floor"),
    colBreak(),
    select("status", "Status", ["Production", "Off", "Idle", "Problem", "Maintenance", "Setup"]),
    link("operation", "Default Operation", "Operation"),
    link("warehouse", "Warehouse", "Warehouse"),
    check("disabled", "Disabled"),
    sec("Notes"),
    text("description", "Description"),

    tab("Performance"),

    tab("Capacity"),
    sec("Machine"),
    req(int("spindles", "Spindles")),
    req(int("out_of_order", "Spindles Out Of Order")),
    colBreak(),
    req(int("production_capacity", "Job Capacity")),
    int("capacity_per_day", "Capacity Per Day"),
    int("shifts_per_day", "Shifts Per Day"),

    tab("Costing"),
    sec("Rate"),
    ro(currency("hour_rate", "Net Hour Rate")),

    tab("Working Hours"),
    sec("Calendar"),
    link("holiday_list", "Holiday List", "Holiday List"),
    colBreak(),
    ro(float("total_working_hours", "Total Working Hours")),

    tab("People"),
    sec("Crew"),
    link("operator", "Operator", "Employee"),
    colBreak(),
    link("assistant", "Assistant", "Employee"),
  ],
  tabIcons: { Details: Factory, Performance: Gauge, Capacity: Activity, Costing: Coins, "Working Hours": Clock, People: Users },
  tabPanels: { Performance: { before: (ctx) => <WorkstationPerformancePanel {...ctx} /> } },
  connections: true,
  children: [
    WORKSTATION_COSTS,
    {
      tab: "Working Hours",
      key: "working_hours",
      label: "Shifts",
      description: "When this machine runs each day.",
      doctype: "Workstation Working Hour",
      columns: [data("start_time", "Start (HH:MM:SS)"), data("end_time", "End (HH:MM:SS)"), float("hours", "Hours"), check("enabled", "Enabled")],
      newRow: () => ({ start_time: "06:00:00", end_time: "14:00:00", hours: 8, enabled: 1 }),
      totals: (rows) => [{ label: "Hours / day", value: fmt(rows.filter((r) => r.enabled).reduce((s, r) => s + asNumber(r.hours), 0), 1), align: "right" }],
    },
  ],
  defaults: () => ({ status: "Off", production_capacity: 1, spindles: 0, out_of_order: 0, shifts_per_day: 3 }),
  summary: (v, rows) => [
    { label: "Net hour rate", value: fmtMoney((rows.workstation_costs ?? []).reduce((s, r) => s + asNumber(r.operating_cost), 0) || v.hour_rate), tone: "emerald" },
    { label: "Job capacity", value: fmt(v.production_capacity, 0), tone: "sky" },
    { label: "Spindles", value: fmt(v.spindles, 0), tone: "indigo" },
    ...(asNumber(v.out_of_order) ? [{ label: "Out of order", value: `${fmt(v.out_of_order, 0)} (${fmt((asNumber(v.out_of_order) / (asNumber(v.spindles) || 1)) * 100, 1)}%)`, tone: "rose" as const }] : []),
  ],
  titleOf: (v) => v.workstation_name || "New Workstation",
};

/* ============================================================================ BOM */

const BOM_ITEMS: ChildTableSpec = {
  tab: "Component",
  key: "items",
  label: "Components",
  description: "Raw materials that go into one batch. For a Spinning BOM the blend ratio sets each quantity and the mix's yield.",
  doctype: "BOM Item",
  // Kept to the columns you actually type in so the grid fits without sideways scrolling; the read-only
  // helpers (name, UOM, gross-up quantity) and extras live in the row editor (pencil icon).
  columns: [
    req(link("item_code", "Item Code", "Item")),
    req(float("qty", "Qty")),
    { ...float("blend_ratio", "Blend %"), reqd: true },
    float("item_yield", "Yield %"),
    req(currency("rate", "Rate")),
    ro(currency("amount", "Amount")),
  ],
  dialogColumns: [
    data("item_name", "Item Name", { read_only: true }),
    req(link("uom", "UOM", "UOM")),
    ro(float("gross_up_qty", "Gross-up Qty")),
    link("source_warehouse", "Source Warehouse", "Warehouse"),
    check("allow_alternative_item", "Allow Alternative Item"),
    check("do_not_explode", "Do Not Explode"),
    text("description", "Description"),
  ],
  newRow: (_v, rows) => ({ qty: 1, rate: 0, uom: "Nos", conversion_factor: 1, blend_ratio: rows.length === 0 ? 100 : 0, item_yield: 0 }),
  linkEffects: {
    item_code: async (code) => {
      const i = await itemInfo(code);
      return { item_name: i.name ?? code, uom: i.uom, stock_uom: i.uom, conversion_factor: 1, rate: i.rate, description: i.description };
    },
  },
  totals: (rows) => [
    { label: "Blend total", value: `${fmt(totalBlend(rows))} %`, align: "right" },
    { label: "Amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" },
  ],
};

const BOM_OPERATIONS: ChildTableSpec = {
  tab: "Operation",
  key: "operations",
  label: "Operations",
  description: "Routing steps — used when \"With Operations\" is on.",
  showIf: (v) => Boolean(v.with_operations),
  doctype: "BOM Operation",
  columns: [
    req(link("operation", "Operation", "Operation")),
    link("workstation", "Workstation", "Workstation"),
    req(float("time_in_mins", "Time (mins)")),
    currency("hour_rate", "Hour Rate"),
    ro(currency("operating_cost", "Operating Cost")),
  ],
  dialogColumns: [link("workstation_type", "Workstation Type", "Workstation Type"), float("batch_size", "Batch Size"), check("fixed_time", "Fixed Time"), text("description", "Description")],
  newRow: () => ({ time_in_mins: 0 }),
  linkEffects: {
    workstation: async (ws) => {
      const v = await getLinkedValues("Workstation", ws, ["hour_rate"]);
      return { hour_rate: asNumber(v.hour_rate) };
    },
  },
};

const BOM_SECONDARY: ChildTableSpec = {
  tab: "Costing",
  key: "secondary_items",
  label: "Secondary Items",
  description: "Scrap, by-products and co-products this BOM also produces.",
  doctype: "BOM Secondary Item",
  columns: [
    req(link("item_code", "Item Code", "Item")),
    data("item_name", "Item Name", { read_only: true }),
    req(select("secondary_item_type", "Type", ["Co-Product", "By-Product", "Scrap", "Additional Finished Good"])),
    float("qty", "Qty"),
    req(link("uom", "UOM", "UOM")),
    select("valuation_type", "Valuation", ["Valuation Rate", "% of Component Cost", "Manual"]),
    // Display only (the doctype stores the row's total cost): cost ÷ stock qty, see `derive`.
    ro(currency("rate_per_unit", "Rate")),
    currency("cost", "Cost"),
  ],
  derive: (r) => {
    const q = asNumber(r.stock_qty) || asNumber(r.qty);
    return { ...r, rate_per_unit: q ? asNumber(r.cost) / q : 0 };
  },
  totals: (rows) => [{ label: "Secondary items cost", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.cost), 0)), align: "right" }],
  newRow: () => ({ secondary_item_type: "Scrap", qty: 1, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, valuation_type: "Manual", cost_allocation_per: 0, process_loss_per: 0, cost: 0, base_cost: 0, process_loss_qty: 0 }),
  linkEffects: {
    item_code: async (code) => {
      const i = await itemInfo(code);
      return { item_name: i.name ?? code, uom: i.uom, stock_uom: i.uom };
    },
  },
};

/** Fully exploded raw materials (sub-assembly BOMs expanded) — rebuilt by the server on every save. */
const BOM_EXPLODED: ChildTableSpec = {
  tab: "Exploded Items",
  key: "exploded_items",
  label: "Exploded Items",
  description: "Every leaf raw material after expanding sub-assembly BOMs, per BOM quantity. Rebuilt automatically when the BOM is saved.",
  doctype: "BOM Explosion Item",
  readOnly: true,
  wide: true,
  columns: [
    link("item_code", "Item Code", "Item"),
    data("item_name", "Item Name"),
    float("stock_qty", "Stock Qty"),
    data("stock_uom", "UOM"),
    float("qty_consumed_per_unit", "Qty per Unit"),
    currency("rate", "Rate"),
    currency("amount", "Amount"),
    link("source_warehouse", "Source Warehouse", "Warehouse"),
  ],
  totals: (rows) => [{ label: "Amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" }],
};

export const BOM_CONFIG: DocConfig = {
  doctype: "BOM",
  base: "/production/boms",
  singular: "BOM",
  plural: "Bills of Materials",
  subtitle: "What goes into a product — components, blend ratios, operations and cost",
  icon: Layers,
  submittable: true,
  listFields: ["name", "item", "item_name", "bom_type", "bom_category", "quantity", "uom", "is_active", "is_default", "total_cost", "target_yield", "docstatus", "modified"],
  columns: [
    nameCol("BOM", (r) => r.item_name || r.item),
    {
      key: "bom_category",
      label: "Category",
      render: (r) =>
        r.bom_category ? (
          <span
            className={
              r.bom_category === "Conversion"
                ? "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300"
                : "inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-teal-500/30 dark:text-teal-300"
            }
            title={r.bom_category === "Conversion" ? "Customer-supplied fibre — the mill charges for processing only" : "Own fibre, mill-owned yarn"}
          >
            <span className={r.bom_category === "Conversion" ? "h-1.5 w-1.5 rounded-full bg-amber-500" : "h-1.5 w-1.5 rounded-full bg-teal-500"} />
            {r.bom_category}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    textCol("bom_type", "Type"),
    numCol("quantity", "Qty", 3),
    numCol("target_yield", "Yield %", 2),
    moneyCol("total_cost", "Total Cost"),
    yesNoCol("is_active", "Active", "Active", "Inactive"),
    yesNoCol("is_default", "Default", "Default", "—"),
    docstatusCol(),
  ],
  searchFields: ["name", "item", "item_name", "bom_type"],
  // Tabs: All · Production (own yarn) · Conversion (customer-supplied fibre), with live counts.
  statusField: "bom_category",
  statuses: ["Production", "Conversion"],
  filters: [
    { field: "bom_category", label: "Category", options: ["Production", "Conversion"] },
    { field: "bom_type", label: "BOM Type", options: ["Spinning", "Weaving", "Dyeing", "Cutting", "Stitching", "Packing"] },
  ],
  fields: [
    tab("Production Item"),
    sec("Product"),
    req(link("item", "Item to Manufacture", "Item")),
    data("item_name", "Item Name", { read_only: true }),
    req(float("quantity", "Output Quantity")),
    link("uom", "Unit of Measure", "UOM", { read_only: true }),
    colBreak(),
    req(link("company", "Company", "Company")),
    select("bom_type", "BOM Type", ["", "Spinning", "Weaving", "Dyeing", "Cutting", "Stitching", "Packing"]),
    ro(select("bom_category", "BOM Category", ["Production", "Conversion"])),
    check("is_active", "Is Active"),
    check("is_default", "Is Default"),
    sec("Spinning"),
    when(float("target_ops", "Target OPS"), (v) => v.bom_type === "Spinning"),
    when(float("invisible_lose_percentage", "Invisible Loss %"), (v) => v.bom_type === "Spinning"),
    when(ro(float("target_yield", "Target Yield %")), (v) => v.bom_type === "Spinning"),
    when(ro(float("target_waste_percentage", "Target Waste %")), (v) => v.bom_type === "Spinning"),
    colBreak(),
    when(ro(float("material_required", "Material Required")), (v) => v.bom_type === "Spinning"),
    when(ro(float("material_issued", "Material Issued")), (v) => v.bom_type === "Spinning"),
    when(ro(float("target_waste", "Target Waste")), (v) => v.bom_type === "Spinning"),
    when(ro(float("invisible_lose_qty", "Invisible Loss Qty")), (v) => v.bom_type === "Spinning"),
    sec("Machines"),
    when(ro(float("spindle_required", "Spindles Required")), (v) => v.bom_type === "Spinning"),
    when(ro(float("frame_required", "Frames Required")), (v) => v.bom_type === "Spinning"),
    colBreak(),
    when(ro(float("per_shift_frame_required", "Frames Per Shift")), (v) => v.bom_type === "Spinning"),

    tab("Operation"),
    sec("Routing"),
    check("with_operations", "With Operations"),
    when(link("routing", "Routing", "Routing"), (v) => Boolean(v.with_operations)),
    when(link("main_operation", "Main Operation", "Operation"), (v) => Boolean(v.with_operations) || v.bom_type === "Spinning"),
    colBreak(),
    when(select("transfer_material_against", "Transfer Material Against", ["", "Work Order", "Job Card"]), (v) => Boolean(v.with_operations)),
    when(check("fg_based_operating_cost", "Finished-Good Based Operating Cost"), (v) => Boolean(v.with_operations)),
    when(currency("operating_cost_per_bom_quantity", "Operating Cost per BOM Qty"), (v) => Boolean(v.with_operations) && Boolean(v.fg_based_operating_cost)),

    tab("Component"),
    sec("Warehouses"),
    link("default_source_warehouse", "Default Source Warehouse", "Warehouse"),
    colBreak(),
    link("default_target_warehouse", "Default Target Warehouse", "Warehouse"),

    tab("Exploded Items"),

    tab("Costing"),
    sec("Rate of materials"),
    select("rm_cost_as_per", "Rate Of Materials Based On", ["Valuation Rate", "Last Purchase Rate", "Price List"]),
    when(link("buying_price_list", "Price List", "Price List"), (v) => v.rm_cost_as_per === "Price List"),
    colBreak(),
    req(link("currency", "Currency", "Currency")),
    req(float("conversion_rate", "Conversion Rate")),
    sec("Cost"),
    ro(currency("raw_material_cost", "Raw Material Cost")),
    ro(currency("operating_cost", "Operating Cost")),
    colBreak(),
    ro(currency("secondary_items_cost", "Secondary Items Cost")),
    ro(currency("total_cost", "Total Cost")),

    tab("More"),
    sec("Options"),
    check("allow_alternative_item", "Allow Alternative Item"),
    check("set_rate_of_sub_assembly_item_based_on_bom", "Rate of Sub-assemblies from their BOM"),
    check("is_phantom_bom", "Phantom BOM"),
    colBreak(),
    check("inspection_required", "Quality Inspection Required"),
    when(link("quality_inspection_template", "Inspection Template", "Quality Inspection Template"), (v) => Boolean(v.inspection_required)),
    select("backflush_based_on", "Backflush Raw Materials Based On", ["", "BOM", "Material Transferred for Manufacture"]),
    sec("Reference"),
    link("project", "Project", "Project"),
    colBreak(),
    link("sales_order", "Sales Order", "Sales Order"),
    sec("Description"),
    text("description", "Description"),
  ],
  tabIcons: { "Production Item": Package, Operation: Cog, Component: Boxes, "Exploded Items": Network, Costing: Coins, More: SlidersHorizontal },
  tabPanels: { Costing: { before: (ctx) => <BomCostingPanel {...ctx} /> } },
  actions: [
    {
      label: "Create Work Order", icon: Factory, group: "create", show: (c) => submitted(c) && Boolean(c.values.is_active),
      make: "erpnext.manufacturing.doctype.work_order.work_order.make_work_order",
      makeArgs: (c) => ({ bom_no: c.name, item: c.values.item, qty: c.values.quantity, company: c.values.company }),
    },
  ],
  connections: true,
  children: [{ ...BOM_ITEMS, minRows: 1 }, BOM_OPERATIONS, BOM_EXPLODED, BOM_SECONDARY],
  defaults: ({ company }) => ({ company, quantity: 1, currency: "PKR", conversion_rate: 1, is_active: 1, is_default: 0, with_operations: 0 }),
  linkEffects: {
    item: async (item) => {
      const i = await itemInfo(item);
      return { item_name: i.name ?? item, uom: i.uom };
    },
    company: async (company) => {
      const v = await getLinkedValues("Company", company, ["default_currency"]);
      return v.default_currency ? { currency: v.default_currency, conversion_rate: 1 } : undefined;
    },
  },
  compute: (v, rows) => {
    const out = computeBom(v, rows.items ?? []);
    return { values: out.values, rows: { items: out.rows ?? rows.items ?? [] } };
  },
  summary: (v, rows) => {
    const blend = totalBlend(rows.items ?? []);
    return [
      { label: "Output", value: `${fmt(v.quantity, 3)} ${v.uom ?? ""}`.trim(), tone: "sky" },
      { label: "Components", value: (rows.items ?? []).length, tone: "indigo" },
      ...(v.bom_type === "Spinning"
        ? [
            { label: "Blend total", value: `${fmt(blend)} %`, tone: (Math.abs(blend - 100) < 0.01 ? "emerald" : "amber") as "emerald" | "amber" },
            { label: "Target yield", value: `${fmt(v.target_yield)} %`, tone: "teal" as const },
          ]
        : []),
      { label: "Total cost", value: fmtMoney(v.total_cost), tone: "emerald" },
    ];
  },
  validate: (v, rows) => {
    const errs: Record<string, string> = {};
    const items = rows.items ?? [];
    if (v.bom_type === "Spinning" && items.some((r) => asNumber(r.blend_ratio) > 0) && Math.abs(totalBlend(items) - 100) > 0.01) {
      errs.blend = `Blend ratios add up to ${fmt(totalBlend(items))} %, not 100 %`;
    }
    return errs;
  },
  titleOf: (v) => (v.name ? String(v.name) : "New BOM"),
};

/* ============================================================================ Work Order */

const WORK_ORDER_ITEMS: ChildTableSpec = {
  tab: "Materials",
  key: "required_items",
  label: "Required Items",
  description: "Materials this order consumes — loaded from the BOM, adjust if needed.",
  doctype: "Work Order Item",
  columns: [
    link("item_code", "Item", "Item"),
    ro(data("item_name", "Item Name")),
    link("source_warehouse", "Source Warehouse", "Warehouse"),
    float("required_qty", "Required Qty"),
    ro(float("transferred_qty", "Transferred")),
    ro(float("consumed_qty", "Consumed")),
    ro(float("blend_ratio", "Blend %")),
    ro(currency("rate", "Rate")),
    ro(currency("amount", "Amount")),
  ],
  newRow: () => ({ required_qty: 1, include_item_in_manufacturing: 1 }),
  linkEffects: {
    item_code: async (code) => {
      const i = await itemInfo(code);
      return { item_name: i.name ?? code, stock_uom: i.uom, rate: i.rate, description: i.description };
    },
  },
};

const WORK_ORDER_OPERATIONS: ChildTableSpec = {
  tab: "Operations",
  key: "operations",
  label: "Operations",
  doctype: "Work Order Operation",
  columns: [
    req(link("operation", "Operation", "Operation")),
    link("workstation", "Workstation", "Workstation"),
    req(float("time_in_mins", "Time (mins)")),
    select("status", "Status", ["Pending", "Work in Progress", "Completed"]),
    float("completed_qty", "Completed Qty"),
    ro(currency("planned_operating_cost", "Planned Cost")),
    ro(currency("actual_operating_cost", "Actual Cost")),
  ],
  dialogColumns: [link("bom", "BOM", "BOM"), link("source_warehouse", "Source Warehouse", "Warehouse"), link("wip_warehouse", "WIP Warehouse", "Warehouse"), link("fg_warehouse", "FG Warehouse", "Warehouse")],
  newRow: () => ({ status: "Pending", time_in_mins: 0, completed_qty: 0 }),
};

const WORK_ORDER_WORKSTATIONS: ChildTableSpec = {
  tab: "Operations",
  key: "workstations",
  label: "Workstations",
  description: "Spindles allocated and downtime per machine (maintained by the system).",
  doctype: "Work Order Workstations",
  readOnly: true,
  columns: [ro(link("workstation", "Workstation", "Workstation")), ro(float("spindles_allocated", "Spindles Allocated")), ro(float("downtime", "Downtime (mins)"))],
};

/** BOM → the rows and targets a Work Order starts from (the desk's "get items and operations from BOM"). */
async function loadFromBom(bom: string, v: Doc) {
  const targets = await getLinkedValues("BOM", bom, ["target_yield", "target_waste_percentage", "target_ops", "bom_type"]);
  const patch: Doc = {};
  if (targets.bom_type === "Spinning") {
    patch.target_yield = targets.target_yield;
    patch.target_waste_percentage = targets.target_waste_percentage;
    patch.target_ops = targets.target_ops;
  }
  if (v.production_item && v.company && asNumber(v.qty) > 0) {
    const loaded = await postCallForDoc<Doc>("get_items_and_operations_from_bom", {
      doctype: "Work Order",
      production_item: v.production_item,
      bom_no: bom,
      qty: v.qty,
      company: v.company,
      use_multi_level_bom: v.use_multi_level_bom ?? 1,
      project: v.project,
      source_warehouse: v.source_warehouse,
      wip_warehouse: v.wip_warehouse,
      required_items: [],
      operations: [],
    });
    if (loaded?.required_items) patch.required_items = loaded.required_items;
    if (loaded?.operations) patch.operations = loaded.operations;
  }
  return patch;
}

export const WORK_ORDER_CONFIG: DocConfig = {
  doctype: "Work Order",
  base: "/production/work-orders",
  singular: "Work Order",
  plural: "Work Orders",
  subtitle: "Production orders — what to make, from which BOM, on which machines",
  icon: Factory,
  submittable: true,
  listFields: ["name", "production_item", "item_name", "qty", "produced_qty", "status", "planned_start_date", "planned_end_date", "bom_no", "sales_order", "production_plan", "docstatus", "modified"],
  // ?running=1 (home page "Work orders running"): in process on the floor.
  urlFlags: [{ param: "running", label: "Running (in process)", filters: () => [["docstatus", "=", 1], ["status", "=", "In Process"]] }],
  columns: [
    nameCol("Work Order", (r) => r.item_name || r.production_item),
    textCol("bom_no", "BOM"),
    progressCol("produced_qty", "qty", "Produced"),
    dateTimeCol("planned_start_date", "Planned Start"),
    textCol("sales_order", "Sales Order"),
    statusCol("status", "Status", "Draft"),
  ],
  searchFields: ["name", "production_item", "item_name", "bom_no", "sales_order", "production_plan"],
  statusField: "status",
  statuses: ["Draft", "Not Started", "In Process", "Completed", "Stopped", "Closed", "Cancelled"],
  dateField: "planned_start_date",
  dateLabel: "Planned start",
  sort: { key: "planned_start_date", dir: "desc" },
  fields: [
    tab("Order"),
    sec("Order"),
    req(select("naming_series", "Series", ["MFG-WO-.YYYY.-"])),
    req(link("company", "Company", "Company")),
    req(link("production_item", "Item To Manufacture", "Item")),
    ro(data("item_name", "Item Name")),
    colBreak(),
    req(link("bom_no", "BOM No", "BOM")),
    req(float("qty", "Qty To Manufacture")),
    req(int("spindle_allocated", "Spindles Allocated")),
    ro(link("production_plan", "Production Plan", "Production Plan")),
    sec("References"),
    link("sales_order", "Sales Order", "Sales Order"),
    colBreak(),
    link("project", "Project", "Project"),

    tab("Schedule"),
    sec("Plan"),
    req(datetime("planned_start_date", "Planned Start")),
    datetime("planned_end_date", "Planned End"),
    date("expected_delivery_date", "Expected Delivery"),
    colBreak(),
    ro(date("work_order_date", "Work Order Date")),
    datetime("actual_start_date", "Actual Start", { read_only: true }),
    datetime("actual_end_date", "Actual End", { read_only: true }),

    tab("Materials"),
    sec("Warehouses"),
    link("source_warehouse", "Source Warehouse", "Warehouse"),
    link("wip_warehouse", "Work-in-Progress Warehouse", "Warehouse"),
    colBreak(),
    link("fg_warehouse", "Target Warehouse", "Warehouse"),
    link("scrap_warehouse", "Scrap Warehouse", "Warehouse"),
    sec("Material"),
    ro(float("material_required", "Material Required")),
    ro(float("material_issued", "Material To Issue")),
    colBreak(),
    ro(float("material_transferred_for_manufacturing", "Transferred for Manufacture")),
    ro(float("process_loss_qty", "Process Loss Qty")),

    tab("Operations"),
    sec("Transfer"),
    select("transfer_material_against", "Transfer Material Against", ["", "Work Order", "Job Card"]),
    colBreak(),
    check("skip_transfer", "Skip Material Transfer to WIP"),

    tab("Performance"),
    sec("Spinning — plan"),
    ro(float("target_yield", "Target Yield %")),
    ro(float("target_waste_percentage", "Target Waste %")),
    ro(float("target_ops", "Target OPS")),
    colBreak(),
    ro(float("spindle_required", "Spindles Required")),
    ro(float("frame_required", "Frames Required")),
    ro(float("per_shift_frame_required", "Frames Per Shift")),
    sec("Spinning — actual"),
    ro(float("produced_qty", "Manufactured Qty")),
    ro(float("actual_yield", "Actual Yield %")),
    ro(float("actual_waste", "Actual Waste")),
    ro(float("actual_waste_percentage", "Actual Waste %")),
    colBreak(),
    ro(float("actual_ops", "Actual OPS")),
    ro(float("spindle_worked", "Spindles Worked")),
    ro(float("actual_frame_required", "Frames Worked")),
    ro(float("total_downtime", "Total Downtime")),

    tab("Costing"),
    sec("Operating cost"),
    ro(currency("planned_operating_cost", "Planned Operating Cost")),
    currency("additional_operating_cost", "Additional Operating Cost"),
    colBreak(),
    ro(currency("actual_operating_cost", "Actual Operating Cost")),
    ro(currency("corrective_operation_cost", "Corrective Operation Cost")),
    ro(currency("total_operating_cost", "Total Operating Cost")),

    tab("More"),
    sec("Options"),
    check("use_multi_level_bom", "Use Multi-Level BOM"),
    check("allow_alternative_item", "Allow Alternative Item"),
    colBreak(),
    check("reserve_stock", "Reserve Stock"),
    check("update_consumed_material_cost_in_project", "Update Consumed Material Cost in Project"),
  ],
  tabIcons: { Order: ClipboardList, Schedule: CalendarClock, Materials: Boxes, Operations: Cog, Performance: Activity, Costing: Coins, More: SlidersHorizontal },
  tabPanels: {
    Order: { before: (ctx) => <WoProgressPanel {...ctx} /> },
    Schedule: { before: (ctx) => <WoSchedulePanel {...ctx} /> },
    Materials: { before: (ctx) => <WoMaterialsPanel {...ctx} /> },
    Operations: { before: (ctx) => <WoOperationsPanel {...ctx} /> },
    Performance: { before: (ctx) => <WoPerformancePanel {...ctx} /> },
    Costing: { before: (ctx) => <WoCostingPanel {...ctx} /> },
  },
  actions: [
    {
      label: "Transfer Materials for Manufacture", icon: ArrowRightLeft, group: "create",
      show: (c) => submitted(c) && !["Completed", "Closed", "Stopped"].includes(c.values.status),
      make: "erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
      makeArgs: (c) => ({ work_order_id: c.name, purpose: "Material Transfer for Manufacture", qty: Math.max(0, asNumber(c.values.qty) - asNumber(c.values.material_transferred_for_manufacturing)) }),
    },
    {
      label: "Finish (Manufacture entry)", icon: PackageCheck, group: "create",
      show: (c) => submitted(c) && !["Completed", "Closed", "Stopped"].includes(c.values.status),
      make: "erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
      makeArgs: (c) => ({ work_order_id: c.name, purpose: "Manufacture", qty: Math.max(0, asNumber(c.values.qty) - asNumber(c.values.produced_qty)) }),
    },
    {
      label: "Material Request for shortages", icon: ClipboardList, group: "create", show: submitted,
      make: "erpnext.manufacturing.doctype.work_order.work_order.make_material_request",
    },
  ],
  connections: true,
  children: [WORK_ORDER_ITEMS, WORK_ORDER_OPERATIONS, WORK_ORDER_WORKSTATIONS],
  defaults: ({ company }) => ({ company, naming_series: "MFG-WO-.YYYY.-", qty: 1, use_multi_level_bom: 1, spindle_allocated: 0, work_order_date: todayISO(), planned_start_date: nowERPDateTime() }),
  linkEffects: {
    production_item: async (item, v) => {
      const d = await postCall<Doc>("erpnext.manufacturing.doctype.work_order.work_order.get_item_details", { item, project: v.project }).catch(() => undefined);
      const i = await itemInfo(item);
      return { item_name: i.name ?? item, stock_uom: i.uom, description: i.description, ...(d?.bom_no ? { bom_no: d.bom_no } : {}) };
    },
    bom_no: (bom, v) => loadFromBom(bom, v),
  },
  compute: (v) => {
    const patch = computeWorkOrder(v);
    // With no operations the server can't derive an end date (the desk fills one in), and an order with no end
    // — or one before its start — is rejected. Keep it at least a day after the start.
    const start = parseDT(v.planned_start_date);
    const end = parseDT(v.planned_end_date);
    if (start && (!end || end < start)) patch.planned_end_date = fmtDT(new Date(start.getTime() + 24 * 3600 * 1000));
    return { values: patch };
  },
  summary: (v) => {
    const qty = asNumber(v.qty);
    const done = asNumber(v.produced_qty);
    return [
      { label: "Quantity", value: fmt(qty), tone: "sky" },
      { label: "Produced", value: fmt(done), tone: "emerald" },
      { label: "Balance", value: fmt(Math.max(0, qty - done)), tone: "amber" },
      { label: "Progress", value: `${fmt(qty > 0 ? Math.min(100, (done / qty) * 100) : 0, 0)} %`, tone: "teal" },
      ...(asNumber(v.spindle_required) > 0 ? [{ label: "Spindles", value: fmt(v.spindle_required, 0), tone: "indigo" as const }] : []),
    ];
  },
  titleOf: (v) => (v.name ? String(v.name) : "New Work Order"),
};

/* ============================================================================ Production Plan */

export const PRODUCTION_PLAN_CONFIG: DocConfig = {
  doctype: "Production Plan",
  base: "/production/production-plans",
  singular: "Production Plan",
  plural: "Production Plans",
  subtitle: "Plan what to produce from sales orders and material requests",
  icon: CalendarRange,
  submittable: true,
  listFields: ["name", "posting_date", "status", "total_planned_qty", "total_produced_qty", "get_items_from", "docstatus", "modified"],
  columns: [
    nameCol("Production Plan"),
    dateCol("posting_date", "Date"),
    textCol("get_items_from", "Items From"),
    progressCol("total_produced_qty", "total_planned_qty", "Produced"),
    statusCol("status", "Status", "Draft"),
  ],
  searchFields: ["name", "get_items_from", "status"],
  statusField: "status",
  statuses: ["Draft", "Submitted", "Not Started", "In Process", "Completed", "Closed", "Stopped", "Cancelled"],
  dateField: "posting_date",
  dateLabel: "Posting date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Plan"),
    sec("Plan"),
    req(select("naming_series", "Series", ["MFG-PP-.YYYY.-"])),
    req(link("company", "Company", "Company")),
    req(date("posting_date", "Posting Date")),
    colBreak(),
    select("get_items_from", "Get Items From", ["", "Sales Order", "Material Request"]),
    link("project", "Project", "Project"),
    sec("Progress"),
    ro(float("total_planned_qty", "Total Planned Qty")),
    colBreak(),
    ro(float("total_produced_qty", "Total Produced Qty")),

    tab("Raw Material"),
    sec("Where and how to plan"),
    link("for_warehouse", "Raw Materials Warehouse", "Warehouse"),
    check("ignore_existing_ordered_qty", "Consider Projected Qty (raw materials)"),
    check("include_safety_stock", "Include Safety Stock"),
    colBreak(),
    check("include_non_stock_items", "Include Non Stock Items"),
    check("include_subcontracted_items", "Include Subcontracted Items"),
    check("consider_minimum_order_qty", "Consider Minimum Order Qty"),

    tab("Operation"),

    tab("Costing"),

    tab("More"),
    sec("Sub-assemblies"),
    link("sub_assembly_warehouse", "Sub Assembly Warehouse", "Warehouse"),
    check("skip_available_sub_assembly_item", "Skip Available Sub-assembly Items"),
    colBreak(),
    check("combine_sub_items", "Combine Sub-assembly Items"),
    check("combine_items", "Combine Items"),
    sec("Stock"),
    check("reserve_stock", "Reserve Stock"),
  ],
  tabIcons: { Plan: ClipboardList, "Raw Material": Boxes, Operation: Cog, Costing: Coins, More: SlidersHorizontal },
  tabPanels: {
    "Raw Material": { before: (ctx) => <RawMaterialsPanel {...ctx} /> },
    Operation: { before: (ctx) => <PlanOperationsPanel {...ctx} /> },
    Costing: { before: (ctx) => <PlanCostingPanel {...ctx} /> },
  },
  actions: [
    { label: "Create Work Orders", icon: Factory, group: "create", show: submitted, run: (c) => docMethod(c, "Production Plan", "make_work_order", "Work orders created") },
    { label: "Create Material Requests", icon: ClipboardList, group: "create", show: submitted, run: (c) => docMethod(c, "Production Plan", "make_material_request", "Material requests created") },
  ],
  connections: true,
  children: [
    {
      tab: "Plan",
      key: "po_items",
      label: "Assembly Items",
      description: "What this plan produces.",
      doctype: "Production Plan Item",
      minRows: 1,
      columns: [
        req(link("item_code", "Item Code", "Item")),
        req(link("bom_no", "BOM No", "BOM")),
        req(float("planned_qty", "Planned Qty")),
        link("warehouse", "FG Warehouse", "Warehouse"),
        req(datetime("planned_start_date", "Planned Start")),
        ro(float("produced_qty", "Produced")),
        ro(float("pending_qty", "Pending")),
        ro(data("sales_order", "Sales Order")),
      ],
      dialogColumns: [check("include_exploded_items", "Include Exploded Items"), float("ops", "OPS"), float("frame_allocated_per_day", "Frames Allocated Per Day")],
      newRow: () => ({ planned_qty: 1, include_exploded_items: 1, planned_start_date: nowERPDateTime() }),
      linkEffects: {
        item_code: async (code) => {
          const i = await itemInfo(code);
          const bom = await postCall<Doc>("erpnext.manufacturing.doctype.work_order.work_order.get_item_details", { item: code }).catch(() => undefined);
          return { item_name: i.name ?? code, stock_uom: i.uom, description: i.description, ...(bom?.bom_no ? { bom_no: bom.bom_no } : {}) };
        },
      },
      totals: (rows) => [{ label: "Planned qty", value: fmt(rows.reduce((s, r) => s + asNumber(r.planned_qty), 0)), align: "right" }],
    },
    {
      tab: "Plan",
      key: "sales_orders",
      label: "Sales Orders",
      doctype: "Production Plan Sales Order",
      columns: [req(link("sales_order", "Sales Order", "Sales Order")), ro(date("sales_order_date", "Order Date")), ro(link("customer", "Customer", "Customer")), ro(currency("grand_total", "Grand Total"))],
      linkEffects: {
        sales_order: async (so) => {
          const v = await getLinkedValues("Sales Order", so, ["transaction_date", "customer", "grand_total"]);
          return { sales_order_date: v.transaction_date, customer: v.customer, grand_total: v.grand_total };
        },
      },
    },
    {
      tab: "Raw Material",
      key: "mr_items",
      label: "Raw Materials",
      description: "Exploded from the assembly items' BOMs — use “Get raw materials” above to (re)calculate. Material requests are raised from these rows.",
      doctype: "Material Request Plan Item",
      columns: [
        req(link("item_code", "Item Code", "Item")),
        ro(data("item_name", "Item Name")),
        req(float("quantity", "Required Qty")),
        ro(data("uom", "UOM")),
        ro(float("actual_qty", "In Stock")),
        ro(float("projected_qty", "Projected Qty")),
        ro(data("main_item_code", "For Item")),
        req(link("warehouse", "For Warehouse", "Warehouse")),
        select("material_request_type", "Type", ["Purchase", "Material Transfer", "Material Issue", "Manufacture", "Customer Provided"]),
        date("schedule_date", "Required By"),
      ],
      dialogColumns: [ro(float("required_bom_qty", "Reqd Qty (BOM, stock UOM)")), ro(link("from_bom", "From BOM", "BOM")), ro(float("ordered_qty", "Ordered Qty")),
                      ro(float("reserved_qty_for_production", "Reserved for Production")), ro(float("safety_stock", "Safety Stock")), ro(float("min_order_qty", "Min Order Qty"))],
      wide: true,
      totals: (rows) => [{ label: "Required qty", value: fmt(rows.reduce((s, r) => s + asNumber(r.quantity), 0)), align: "right" }],
      newRow: () => ({ quantity: 1, material_request_type: "Purchase" }),
    },
    {
      tab: "Operation",
      key: "workstation_allocation",
      label: "Workstation Allocation",
      description: "Machine capacity reserved for each item.",
      doctype: "Workstation Allocation",
      columns: [req(link("item_code", "Item", "Item")), req(link("workstation", "Workstation", "Workstation")), ro(float("capacity", "Capacity")), req(float("allocated", "Allocated")), req(date("from_date", "From")), req(date("to_date", "To"))],
      newRow: () => ({ allocated: 0 }),
      wide: true,
    },
  ],
  defaults: ({ company }) => ({ company, naming_series: "MFG-PP-.YYYY.-", posting_date: todayISO() }),
  summary: (v) => {
    const planned = asNumber(v.total_planned_qty);
    const done = asNumber(v.total_produced_qty);
    return [
      { label: "Planned", value: fmt(planned), tone: "sky" },
      { label: "Produced", value: fmt(done), tone: "emerald" },
      { label: "Progress", value: `${fmt(planned > 0 ? Math.min(100, (done / planned) * 100) : 0, 0)} %`, tone: "teal" },
    ];
  },
  titleOf: (v) => (v.name ? String(v.name) : "New Production Plan"),
};

/* ============================================================================ Job Card */

export const JOB_CARD_CONFIG: DocConfig = {
  doctype: "Job Card",
  base: "/production/job-cards",
  singular: "Job Card",
  plural: "Job Cards",
  subtitle: "Shop-floor tracking of each operation on a work order",
  icon: ListChecks,
  submittable: true,
  listFields: ["name", "work_order", "production_item", "operation", "workstation", "for_quantity", "total_completed_qty", "status", "posting_date", "docstatus", "modified"],
  columns: [
    nameCol("Job Card", (r) => r.production_item),
    textCol("work_order", "Work Order"),
    textCol("operation", "Operation"),
    textCol("workstation", "Workstation"),
    progressCol("total_completed_qty", "for_quantity", "Completed"),
    statusCol("status", "Status", "Open"),
  ],
  searchFields: ["name", "work_order", "production_item", "operation", "workstation"],
  statusField: "status",
  statuses: ["Open", "Work In Progress", "Material Transferred", "On Hold", "Completed", "Submitted", "Cancelled"],
  dateField: "posting_date",
  dateLabel: "Posting date",
  fields: [
    tab("Job"),
    sec("Job"),
    req(select("naming_series", "Series", ["PO-JOB.#####"])),
    req(link("company", "Company", "Company")),
    date("posting_date", "Posting Date"),
    req(link("work_order", "Work Order", "Work Order")),
    ro(link("production_item", "Final Product", "Item")),
    ro(link("bom_no", "BOM", "BOM")),
    colBreak(),
    req(link("operation", "Operation", "Operation")),
    req(link("workstation", "Workstation", "Workstation")),
    link("workstation_type", "Workstation Type", "Workstation Type"),
    float("for_quantity", "Qty To Manufacture"),
    link("employee", "Employee", "Employee"),

    tab("Time"),
    sec("Schedule"),
    datetime("expected_start_date", "Expected Start"),
    datetime("expected_end_date", "Expected End"),
    float("time_required", "Expected Time (mins)"),
    colBreak(),
    ro(datetime("actual_start_date", "Actual Start")),
    ro(datetime("actual_end_date", "Actual End")),
    ro(float("total_time_in_mins", "Total Time (mins)")),

    tab("Materials"),
    sec("Warehouses"),
    link("source_warehouse", "Source Warehouse", "Warehouse"),
    link("wip_warehouse", "WIP Warehouse", "Warehouse"),
    colBreak(),
    link("target_warehouse", "Target Warehouse", "Warehouse"),
    check("skip_material_transfer", "Skip Material Transfer"),
    sec("Quantities"),
    ro(float("transferred_qty", "Transferred Qty")),
    ro(float("requested_qty", "Requested Qty")),
    colBreak(),
    ro(float("manufactured_qty", "Manufactured Qty")),

    tab("Quality & Output"),
    sec("Output"),
    ro(float("total_completed_qty", "Total Completed Qty")),
    ro(float("process_loss_qty", "Process Loss Qty")),
    colBreak(),
    ro(float("pending_qty", "Pending Qty")),
    ro(select("status", "Status", ["Open", "Work In Progress", "Partially Transferred", "Material Transferred", "On Hold", "Submitted", "Cancelled", "Completed"])),
    sec("Quality"),
    link("quality_inspection_template", "Inspection Template", "Quality Inspection Template"),
    colBreak(),
    link("quality_inspection", "Quality Inspection", "Quality Inspection"),

    tab("More"),
    sec("Corrective"),
    check("is_corrective_job_card", "Corrective Job Card"),
    when(link("for_job_card", "For Job Card", "Job Card"), (v) => Boolean(v.is_corrective_job_card)),
    when(link("for_operation", "For Operation", "Operation"), (v) => Boolean(v.is_corrective_job_card)),
    colBreak(),
    ro(currency("hour_rate", "Hour Rate")),
    link("project", "Project", "Project"),
    sec("Remarks"),
    text("remarks", "Remarks"),
  ],
  children: [
    {
      tab: "Time",
      key: "time_logs",
      label: "Time Logs",
      description: "Who worked on this operation, when, and what they completed.",
      doctype: "Job Card Time Log",
      columns: [link("employee", "Employee", "Employee"), datetime("from_time", "From"), datetime("to_time", "To"), float("time_in_mins", "Time (mins)"), float("completed_qty", "Completed Qty")],
      newRow: () => ({ completed_qty: 0 }),
      totals: (rows) => [
        { label: "Time", value: `${fmt(rows.reduce((s, r) => s + asNumber(r.time_in_mins), 0) / 60, 1)} h`, align: "right" },
        { label: "Completed", value: fmt(rows.reduce((s, r) => s + asNumber(r.completed_qty), 0)), align: "right" },
      ],
    },
    {
      tab: "Materials",
      key: "items",
      label: "Required Materials",
      description: "Material this operation draws.",
      doctype: "Job Card Item",
      columns: [link("item_code", "Item", "Item"), ro(data("item_name", "Item Name")), link("source_warehouse", "Source Warehouse", "Warehouse"), float("required_qty", "Required"), ro(float("transferred_qty", "Transferred")), ro(float("consumed_qty", "Consumed"))],
      newRow: () => ({ required_qty: 1 }),
    },
    {
      tab: "Quality & Output",
      key: "secondary_items",
      label: "Secondary Items",
      description: "Waste and by-products from this operation.",
      doctype: "Job Card Secondary Item",
      columns: [link("item_code", "Item", "Item"), ro(data("item_name", "Item Name")), select("secondary_item_type", "Type", ["Co-Product", "By-Product", "Scrap", "Additional Finished Good"]), float("stock_qty", "Qty"), ro(data("stock_uom", "UOM"))],
      newRow: () => ({ secondary_item_type: "Scrap", stock_qty: 0 }),
    },
  ],
  tabIcons: { Job: ListChecks, Time: Clock, Materials: Boxes, "Quality & Output": FlaskConical, More: SlidersHorizontal },
  tabPanels: {
    Job: { before: (ctx) => <JcProgressPanel {...ctx} /> },
    Time: { before: (ctx) => <JcTimePanel {...ctx} /> },
  },
  actions: [
    { label: "Material Transfer (Stock Entry)", icon: ArrowRightLeft, group: "create", show: (c) => (c.docstatus ?? 0) < 2, make: "erpnext.manufacturing.doctype.job_card.job_card.make_stock_entry" },
    { label: "Material Request", icon: ClipboardList, group: "create", show: (c) => (c.docstatus ?? 0) < 2, make: "erpnext.manufacturing.doctype.job_card.job_card.make_material_request" },
    { label: "Corrective Job Card", icon: Wrench, group: "create", show: submitted, make: "erpnext.manufacturing.doctype.job_card.job_card.make_corrective_job_card" },
  ],
  connections: true,
  defaults: ({ company }) => ({ company, naming_series: "PO-JOB.#####", posting_date: todayISO() }),
  linkEffects: {
    work_order: async (wo) => {
      const v = await getLinkedValues("Work Order", wo, ["production_item", "qty", "wip_warehouse", "source_warehouse", "fg_warehouse"]);
      return { production_item: v.production_item, for_quantity: v.qty, wip_warehouse: v.wip_warehouse, source_warehouse: v.source_warehouse, target_warehouse: v.fg_warehouse };
    },
  },
  summary: (v) => [
    { label: "To manufacture", value: fmt(v.for_quantity), tone: "sky" },
    { label: "Completed", value: fmt(v.total_completed_qty), tone: "emerald" },
    { label: "Time (mins)", value: fmt(v.total_time_in_mins, 0), tone: "amber" },
  ],
  titleOf: (v) => (v.name ? String(v.name) : "New Job Card"),
};

/* ============================================================================ Downtime Entry */

const STOP_REASONS = ["Excessive machine set up time", "Unplanned machine maintenance", "On-machine press checks", "Machine operator errors", "Machine malfunction", "Electricity down", "Other"];

export const DOWNTIME_CONFIG: DocConfig = {
  doctype: "Downtime Entry",
  base: "/production/downtime",
  singular: "Downtime Entry",
  plural: "Downtime",
  subtitle: "Machine stoppages — what stopped, for how long, and why",
  icon: Timer,
  companyScoped: false,
  listFields: ["name", "workstation", "operator", "from_time", "to_time", "downtime", "stop_reason", "work_order", "modified"],
  columns: [
    nameCol("Entry", (r) => r.workstation),
    textCol("operator", "Operator"),
    dateTimeCol("from_time", "From"),
    dateTimeCol("to_time", "To"),
    numCol("downtime", "Downtime (mins)", 1),
    statusCol("stop_reason", "Reason", "Other"),
  ],
  searchFields: ["name", "workstation", "operator", "stop_reason", "work_order"],
  statusField: "stop_reason",
  statuses: STOP_REASONS,
  dateField: "from_time",
  dateLabel: "Stopped",
  sort: { key: "from_time", dir: "desc" },
  fields: [
    tab("Stoppage"),
    sec("When"),
    req(select("naming_series", "Series", ["DT-"])),
    req(datetime("from_time", "From")),
    req(datetime("to_time", "To")),
    ro(float("downtime", "Downtime (mins)")),
    colBreak(),
    req(link("workstation", "Workstation / Machine", "Workstation")),
    req(link("operator", "Operator", "Employee")),
    link("work_order", "Work Order", "Work Order"),
    sec("Why"),
    req(select("stop_reason", "Stop Reason", ["", ...STOP_REASONS])),
    colBreak(),
    text("remarks", "Remarks"),

    tab("Machine History"),
  ],
  tabIcons: { Stoppage: AlertTriangle, "Machine History": Activity },
  tabPanels: {
    Stoppage: { before: (ctx) => <DowntimeSummaryPanel {...ctx} /> },
    "Machine History": { before: (ctx) => <DowntimeHistoryPanel {...ctx} /> },
  },
  connections: true,
  defaults: () => ({ naming_series: "DT-", from_time: nowERPDateTime(), to_time: nowERPDateTime() }),
  compute: (v) => {
    const a = v.from_time ? new Date(String(v.from_time).replace(" ", "T")).getTime() : NaN;
    const b = v.to_time ? new Date(String(v.to_time).replace(" ", "T")).getTime() : NaN;
    return Number.isFinite(a) && Number.isFinite(b) && b >= a ? { values: { downtime: (b - a) / 60000 } } : undefined;
  },
  titleOf: (v) => (v.name ? `${v.name}${v.workstation ? ` · ${v.workstation}` : ""}` : "New Downtime Entry"),
};

/* ============================================================================ Routing */

const ROUTING_OPERATIONS: ChildTableSpec = {
  tab: "Operations",
  key: "operations",
  label: "Operations",
  description: "The steps in order — time per unit and the machine's hour rate set each step's cost.",
  doctype: "BOM Operation",
  wide: true,
  columns: [
    int("sequence_id", "Seq"),
    req(link("operation", "Operation", "Operation")),
    link("workstation_type", "Workstation Type", "Workstation Type"),
    link("workstation", "Workstation", "Workstation"),
    req(float("time_in_mins", "Time / unit (mins)")),
    currency("hour_rate", "Hour Rate"),
    ro(currency("step_cost", "Cost / unit")),
  ],
  dialogColumns: [float("batch_size", "Batch Size"), check("fixed_time", "Fixed Time"), text("description", "Description")],
  derive: (r) => ({ ...r, step_cost: (asNumber(r.time_in_mins) / 60) * asNumber(r.hour_rate) }),
  newRow: (_v, rows) => ({ sequence_id: rows.length + 1, time_in_mins: 0, batch_size: 1 }),
  linkEffects: {
    workstation: async (ws) => {
      const v = await getLinkedValues("Workstation", ws, ["hour_rate", "workstation_type"]);
      return { hour_rate: asNumber(v.hour_rate), workstation_type: v.workstation_type };
    },
    workstation_type: async (t) => {
      const v = await getLinkedValues("Workstation Type", t, ["hour_rate"]);
      return { hour_rate: asNumber(v.hour_rate) };
    },
  },
  totals: (rows) => [
    { label: "Time / unit", value: `${fmt(rows.reduce((s, r) => s + asNumber(r.time_in_mins), 0), 3)} min`, align: "right" },
    { label: "Cost / unit", value: fmtMoney(rows.reduce((s, r) => s + (asNumber(r.time_in_mins) / 60) * asNumber(r.hour_rate), 0)), align: "right" },
  ],
};

export const ROUTING_CONFIG: DocConfig = {
  doctype: "Routing",
  base: "/production/routings",
  singular: "Routing",
  plural: "Routings",
  subtitle: "Reusable operation sequences — pull them into a BOM instead of retyping the steps",
  icon: Route,
  companyScoped: false,
  listFields: ["name", "routing_name", "disabled", "modified"],
  columns: [nameCol("Routing"), yesNoCol("disabled", "Status", "Disabled", "Enabled"), dateCol("modified", "Updated")],
  searchFields: ["name", "routing_name"],
  fields: [
    tab("Routing"),
    sec("Routing"),
    req(data("routing_name", "Routing Name")),
    colBreak(),
    check("disabled", "Disabled"),
    tab("Operations"),
  ],
  children: [ROUTING_OPERATIONS],
  tabIcons: { Routing: Route, Operations: Cog },
  tabPanels: { Routing: { after: (ctx) => <RoutingFlowPanel {...ctx} /> } },
  connections: true,
  defaults: () => ({ disabled: 0 }),
  summary: (_v, rows) => {
    const ops = rows.operations ?? [];
    return [
      { label: "Steps", value: ops.length, tone: "sky" },
      { label: "Time / unit", value: `${fmt(ops.reduce((s, r) => s + asNumber(r.time_in_mins), 0), 3)} min`, tone: "indigo" },
      { label: "Cost / unit", value: fmtMoney(ops.reduce((s, r) => s + (asNumber(r.time_in_mins) / 60) * asNumber(r.hour_rate), 0)), tone: "emerald" },
    ];
  },
  titleOf: (v) => v.routing_name || v.name || "New Routing",
};

/* ============================================================================ Operation */

export const OPERATION_CONFIG: DocConfig = {
  doctype: "Operation",
  base: "/production/operations",
  singular: "Operation",
  plural: "Operations",
  subtitle: "Process steps — blow room, carding, drawing, simplex, ring, winding, packing",
  icon: Settings2,
  companyScoped: false,
  listFields: ["name", "workstation", "operation_type", "batch_size", "total_operation_time", "is_corrective_operation", "modified"],
  columns: [nameCol("Operation", (r) => r.operation_type || undefined), textCol("workstation", "Default Workstation"), numCol("batch_size", "Batch Size", 0),
    numCol("total_operation_time", "Sub-op Time (mins)", 2), yesNoCol("is_corrective_operation", "Corrective", "Yes", "—")],
  searchFields: ["name", "workstation", "operation_type"],
  filters: [{ field: "operation_type", label: "Type", options: ["Spinning", "Weaving", "Dying", "Cutting", "Stitching"] }],
  fields: [
    tab("Operation"),
    sec("Operation"),
    select("operation_type", "Operation Type", ["", "Spinning", "Weaving", "Dying", "Cutting", "Stitching"]),
    link("workstation", "Default Workstation", "Workstation"),
    float("capacity", "Capacity"),
    colBreak(),
    int("batch_size", "Batch Size"),
    check("create_job_card_based_on_batch_size", "Job Card per Batch"),
    check("is_corrective_operation", "Corrective Operation"),
    sec("Quality"),
    link("quality_inspection_template", "Inspection Template", "Quality Inspection Template"),
    sec("Description"),
    text("description", "Description"),
    tab("Sub Operations"),
    sec("Total"),
    ro(float("total_operation_time", "Total Operation Time (mins)")),
  ],
  children: [{
    tab: "Sub Operations",
    key: "sub_operations",
    label: "Sub Operations",
    description: "Finer steps inside this operation (e.g. doffing, piecing) — their times add up to the total.",
    doctype: "Sub Operation",
    columns: [req(link("operation", "Operation", "Operation")), float("time_in_mins", "Time (mins)"), text("description", "Description")],
    newRow: () => ({ time_in_mins: 0 }),
    totals: (rows) => [{ label: "Total", value: `${fmt(rows.reduce((s, r) => s + asNumber(r.time_in_mins), 0), 2)} min`, align: "right" }],
  }],
  tabIcons: { Operation: Settings2, "Sub Operations": ListChecks },
  connections: true,
  defaults: () => ({ batch_size: 1 }),
  titleOf: (v) => (v.name ? String(v.name) : "New Operation"),
};

/* ============================================================================ Workstation Type */

export const WORKSTATION_TYPE_CONFIG: DocConfig = {
  doctype: "Workstation Type",
  base: "/production/workstation-types",
  singular: "Workstation Type",
  plural: "Workstation Types",
  subtitle: "Machine families and their standard hourly cost",
  icon: Shapes,
  companyScoped: false,
  listFields: ["name", "workstation_type", "hour_rate", "modified"],
  columns: [nameCol("Workstation Type"), moneyCol("hour_rate", "Hour Rate"), dateCol("modified", "Updated")],
  searchFields: ["name", "workstation_type"],
  fields: [
    tab("Details"),
    sec("Type"),
    req(data("workstation_type", "Workstation Type")),
    colBreak(),
    ro(currency("hour_rate", "Net Hour Rate")),
    sec("Description"),
    text("description", "Description"),
    tab("Costing"),
  ],
  children: [{ ...WORKSTATION_COSTS, tab: "Costing" }],
  tabIcons: { Details: Shapes, Costing: Coins },
  connections: true,
  summary: (v, rows) => [{ label: "Net hour rate", value: fmtMoney((rows.workstation_costs ?? []).reduce((s, r) => s + asNumber(r.operating_cost), 0) || v.hour_rate), tone: "emerald" }],
  titleOf: (v) => v.workstation_type || "New Workstation Type",
};

/* ============================================================================ Item Alternative */

export const ITEM_ALTERNATIVE_CONFIG: DocConfig = {
  doctype: "Item Alternative",
  base: "/production/item-alternatives",
  singular: "Item Alternative",
  plural: "Item Alternatives",
  subtitle: "Substitute fibres and materials a work order may use when the BOM item is short",
  icon: ArrowLeftRight,
  companyScoped: false,
  listFields: ["name", "item_code", "item_name", "alternative_item_code", "alternative_item_name", "two_way", "modified"],
  columns: [textCol("item_code", "Item"), textCol("item_name", "Item Name"), textCol("alternative_item_code", "Alternative"), textCol("alternative_item_name", "Alternative Name"), yesNoCol("two_way", "Two-way", "Yes", "No")],
  searchFields: ["item_code", "alternative_item_code", "item_name", "alternative_item_name"],
  fields: [
    sec("Substitution"),
    req(link("item_code", "Item", "Item")),
    ro(data("item_name", "Item Name")),
    colBreak(),
    req(link("alternative_item_code", "Alternative Item", "Item")),
    ro(data("alternative_item_name", "Alternative Item Name")),
    sec("Options"),
    check("two_way", "Two-way (either can replace the other)"),
  ],
  linkEffects: {
    item_code: async (c) => ({ item_name: (await itemInfo(c)).name }),
    alternative_item_code: async (c) => ({ alternative_item_name: (await itemInfo(c)).name }),
  },
  titleOf: (v) => (v.item_code ? `${v.item_code} ⇄ ${v.alternative_item_code ?? "…"}` : "New Item Alternative"),
};

/* ============================================================================ Manufacturing Settings */

export const MANUFACTURING_SETTINGS_CONFIG: DocConfig = {
  doctype: "Manufacturing Settings",
  base: "/production",
  singular: "Manufacturing Settings",
  plural: "Manufacturing Settings",
  subtitle: "How BOMs, work orders, job cards and capacity planning behave",
  icon: Settings2,
  single: true,
  companyScoped: false,
  listFields: [],
  columns: [],
  searchFields: [],
  fields: [
    tab("BOM & Work Order"),
    sec("Raw materials"),
    select("backflush_raw_materials_based_on", "Backflush Raw Materials Based On", ["BOM", "Material Transferred for Manufacture"]),
    check("material_consumption", "Allow Multiple Material Consumption"),
    check("get_rm_cost_from_consumption_entry", "Raw-material Cost from Consumption Entry"),
    colBreak(),
    check("validate_components_quantities_per_bom", "Validate Component Quantities per BOM"),
    check("update_bom_costs_automatically", "Update BOM Costs Automatically"),
    check("allow_editing_of_items_and_quantities_in_work_order", "Allow Editing Items / Quantities in Work Order"),
    sec("Tolerances"),
    float("overproduction_percentage_for_sales_order", "Overproduction % for Sales Order"),
    float("overproduction_percentage_for_work_order", "Overproduction % for Work Order"),
    colBreak(),
    float("transfer_extra_materials_percentage", "Transfer Extra Materials %"),
    check("make_serial_no_batch_from_work_order", "Make Serial No / Batch from Work Order"),
    tab("Job Card & Capacity"),
    sec("Job cards"),
    check("enforce_time_logs", "Enforce Time Logs"),
    check("job_card_excess_transfer", "Allow Excess Material Transfer"),
    check("add_corrective_operation_cost_in_finished_good_valuation", "Corrective Cost in Finished-Good Valuation"),
    colBreak(),
    check("set_op_cost_and_secondary_items_from_sub_assemblies", "Operating Cost & Secondary Items from Sub-assemblies"),
    sec("Capacity planning"),
    check("disable_capacity_planning", "Disable Capacity Planning"),
    check("allow_overtime", "Allow Overtime"),
    check("allow_production_on_holidays", "Allow Production on Holidays"),
    colBreak(),
    int("capacity_planning_for_days", "Capacity Planning For (days)"),
    int("mins_between_operations", "Time Between Operations (mins)"),
  ],
  tabIcons: { "BOM & Work Order": Layers, "Job Card & Capacity": ListChecks },
  titleOf: () => "Manufacturing Settings",
};
