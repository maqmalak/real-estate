import { ArrowLeftRight, Boxes, ClipboardList, Coins, Factory, PackageCheck, SlidersHorizontal, Truck, Undo2 } from "lucide-react";
import type { ChildTableSpec, DocConfig } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, currency, check, text, link, select, ro, req,
  nameCol, textCol, dateCol, moneyCol, statusCol, numCol, yesNoCol, fmt, fmtMoney,
} from "@/components/doc/doc-helpers";
import { todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

const submitted = (c: { docstatus?: number }) => c.docstatus === 1;

/* ============================================================================ Subcontracting Order */

const SCO_ITEMS: ChildTableSpec = {
  tab: "Items",
  key: "items",
  label: "Finished Goods",
  description: "What the subcontractor makes for you, from which BOM, at what service rate.",
  doctype: "Subcontracting Order Item",
  wide: true,
  columns: [
    ro(link("item_code", "Item", "Item")),
    ro(data("item_name", "Item Name")),
    req(link("bom", "BOM", "BOM")),
    req(float("qty", "Qty")),
    ro(float("received_qty", "Received")),
    ro(currency("rate", "Rate")),
    ro(currency("amount", "Amount")),
    req(link("warehouse", "Warehouse", "Warehouse")),
  ],
  dialogColumns: [date("expected_delivery_date", "Expected Delivery"), ro(currency("rm_cost_per_qty", "RM Cost / Qty")), ro(currency("service_cost_per_qty", "Service Cost / Qty")),
    ro(currency("additional_cost_per_qty", "Additional Cost / Qty")), check("include_exploded_items", "Include Exploded Items"), link("cost_center", "Cost Center", "Cost Center")],
  totals: (rows) => [
    { label: "Qty", value: fmt(rows.reduce((s, r) => s + asNumber(r.qty), 0)), align: "right" },
    { label: "Received", value: fmt(rows.reduce((s, r) => s + asNumber(r.received_qty), 0)), align: "right" },
    { label: "Amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" },
  ],
};

const SCO_SUPPLIED: ChildTableSpec = {
  tab: "Raw Materials",
  key: "supplied_items",
  label: "Raw Materials Supplied",
  description: "Fibre / material you send to the subcontractor — required, supplied and consumed so far.",
  doctype: "Subcontracting Order Supplied Item",
  readOnly: true,
  wide: true,
  columns: [link("main_item_code", "For Item", "Item"), link("rm_item_code", "Raw Material", "Item"), link("reserve_warehouse", "Reserve Warehouse", "Warehouse"),
    float("required_qty", "Required"), float("supplied_qty", "Supplied"), float("consumed_qty", "Consumed"), float("returned_qty", "Returned"), currency("amount", "Amount")],
  totals: (rows) => [
    { label: "Required", value: fmt(rows.reduce((s, r) => s + asNumber(r.required_qty), 0)), align: "right" },
    { label: "Supplied", value: fmt(rows.reduce((s, r) => s + asNumber(r.supplied_qty), 0)), align: "right" },
    { label: "Consumed", value: fmt(rows.reduce((s, r) => s + asNumber(r.consumed_qty), 0)), align: "right" },
  ],
};

const ADDITIONAL_COSTS: ChildTableSpec = {
  tab: "Costing",
  key: "additional_costs",
  label: "Additional Costs",
  description: "Freight, loading and other charges added to the finished goods' cost.",
  doctype: "Landed Cost Taxes and Charges",
  columns: [req(link("expense_account", "Expense Account", "Account")), req(data("description", "Description")), req(currency("amount", "Amount"))],
  newRow: () => ({ amount: 0 }),
  totals: (rows) => [{ label: "Total", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" }],
};

export const SUBCONTRACTING_ORDER_CONFIG: DocConfig = {
  doctype: "Subcontracting Order",
  base: "/subcontracting/orders",
  singular: "Subcontracting Order",
  plural: "Subcontracting Orders",
  subtitle: "Conversion work sent out — what the subcontractor makes and the fibre you supply",
  icon: ArrowLeftRight,
  submittable: true,
  listFields: ["name", "supplier", "supplier_name", "transaction_date", "purchase_order", "total_qty", "total", "per_received", "status", "docstatus", "modified"],
  columns: [
    nameCol("Order", (r) => r.supplier_name || r.supplier),
    dateCol("transaction_date", "Date"),
    textCol("purchase_order", "Purchase Order"),
    numCol("total_qty", "Qty", 0),
    moneyCol("total", "Total"),
    numCol("per_received", "% Received", 1),
    statusCol("status", "Status", "Draft"),
  ],
  searchFields: ["name", "supplier", "supplier_name", "purchase_order"],
  statusField: "status",
  statuses: ["Draft", "Open", "Partially Received", "Material Transferred", "Completed", "Closed", "Cancelled"],
  dateField: "transaction_date",
  dateLabel: "Order date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Order"),
    sec("Order"),
    req(select("naming_series", "Series", ["SC-ORD-.YYYY.-"])),
    req(link("company", "Company", "Company")),
    req(date("transaction_date", "Date")),
    ro(date("schedule_date", "Required By")),
    colBreak(),
    req(link("supplier", "Subcontractor", "Supplier")),
    ro(data("supplier_name", "Subcontractor Name")),
    req(link("purchase_order", "Service Purchase Order", "Purchase Order")),
    req(link("supplier_warehouse", "Subcontractor Warehouse", "Warehouse")),
    sec("Totals"),
    ro(float("total_qty", "Total Qty")),
    colBreak(),
    ro(currency("total", "Total")),
    ro(float("per_received", "% Received")),
    tab("Items"),
    sec("Default"),
    link("set_warehouse", "Accept Into Warehouse", "Warehouse"),
    tab("Raw Materials"),
    sec("Reservation"),
    link("set_reserve_warehouse", "Reserve Warehouse", "Warehouse"),
    colBreak(),
    check("reserve_stock", "Reserve Stock"),
    tab("Costing"),
    sec("Distribution"),
    select("distribute_additional_costs_based_on", "Distribute Additional Costs By", ["Qty", "Amount"]),
    colBreak(),
    ro(currency("total_additional_costs", "Total Additional Costs")),
    tab("More"),
    sec("Accounting"),
    link("cost_center", "Cost Center", "Cost Center"),
    colBreak(),
    link("project", "Project", "Project"),
    sec("Address"),
    link("supplier_address", "Subcontractor Address", "Address"),
    link("contact_person", "Contact", "Contact"),
    colBreak(),
    link("shipping_address", "Shipping Address", "Address"),
    link("billing_address", "Billing Address", "Address"),
  ],
  children: [SCO_ITEMS, SCO_SUPPLIED, ADDITIONAL_COSTS],
  tabIcons: { Order: ClipboardList, Items: Factory, "Raw Materials": Boxes, Costing: Coins, More: SlidersHorizontal },
  actions: [
    { label: "Receive Finished Goods", icon: PackageCheck, group: "create", show: (c) => submitted(c) && asNumber(c.values.per_received) < 100,
      make: "erpnext.subcontracting.doctype.subcontracting_order.subcontracting_order.make_subcontracting_receipt" },
  ],
  defaults: ({ company }) => ({ company, naming_series: "SC-ORD-.YYYY.-", transaction_date: todayISO() }),
  summary: (v, rows) => {
    const items = rows.items ?? [];
    const sup = rows.supplied_items ?? [];
    const req_ = sup.reduce((s, r) => s + asNumber(r.required_qty), 0);
    const given = sup.reduce((s, r) => s + asNumber(r.supplied_qty), 0);
    return [
      { label: "Finished goods", value: fmt(items.reduce((s, r) => s + asNumber(r.qty), 0)), tone: "sky" },
      { label: "Received", value: `${fmt(v.per_received, 1)} %`, tone: asNumber(v.per_received) >= 100 ? "emerald" : "amber" },
      { label: "Fibre supplied", value: req_ ? `${fmt((given / req_) * 100, 1)} %` : "—", tone: "indigo" },
      { label: "Service value", value: fmtMoney(v.total), tone: "emerald" },
    ];
  },
  titleOf: (v) => (v.name ? `${v.name}${v.supplier_name ? ` · ${v.supplier_name}` : ""}` : "New Subcontracting Order"),
};

/* ============================================================================ Subcontracting Receipt */

const SCR_ITEMS: ChildTableSpec = {
  tab: "Items",
  key: "items",
  label: "Received Items",
  description: "Accepted, rejected and process-loss quantities per finished good.",
  doctype: "Subcontracting Receipt Item",
  wide: true,
  columns: [
    req(link("item_code", "Item", "Item")),
    data("item_name", "Item Name"),
    ro(float("received_qty", "Received")),
    float("qty", "Accepted"),
    float("rejected_qty", "Rejected"),
    float("process_loss_qty", "Process Loss"),
    currency("rate", "Rate"),
    ro(currency("amount", "Amount")),
    link("warehouse", "Warehouse", "Warehouse"),
  ],
  dialogColumns: [ro(link("subcontracting_order", "Subcontracting Order", "Subcontracting Order")), link("bom", "BOM", "BOM"), link("rejected_warehouse", "Rejected Warehouse", "Warehouse"),
    link("quality_inspection", "Quality Inspection", "Quality Inspection"), link("batch_no", "Batch", "Batch"), ro(currency("rm_cost_per_qty", "RM Cost / Qty")),
    ro(currency("service_cost_per_qty", "Service Cost / Qty")), ro(currency("additional_cost_per_qty", "Additional Cost / Qty"))],
  totals: (rows) => [
    { label: "Accepted", value: fmt(rows.reduce((s, r) => s + asNumber(r.qty), 0)), align: "right" },
    { label: "Rejected", value: fmt(rows.reduce((s, r) => s + asNumber(r.rejected_qty), 0)), align: "right" },
    { label: "Amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" },
  ],
};

const SCR_CONSUMED: ChildTableSpec = {
  tab: "Raw Materials",
  key: "supplied_items",
  label: "Raw Materials Consumed",
  description: "Your fibre used up by this receipt, back-flushed from the subcontractor's warehouse.",
  doctype: "Subcontracting Receipt Supplied Item",
  wide: true,
  columns: [ro(link("main_item_code", "For Item", "Item")), ro(link("rm_item_code", "Raw Material", "Item")), ro(float("required_qty", "Required")),
    req(float("consumed_qty", "Consumed")), ro(float("available_qty_for_consumption", "Available")), ro(currency("rate", "Rate")), ro(currency("amount", "Amount")), link("batch_no", "Batch", "Batch")],
  totals: (rows) => [
    { label: "Consumed", value: fmt(rows.reduce((s, r) => s + asNumber(r.consumed_qty), 0)), align: "right" },
    { label: "Value", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" },
  ],
};

export const SUBCONTRACTING_RECEIPT_CONFIG: DocConfig = {
  doctype: "Subcontracting Receipt",
  base: "/subcontracting/receipts",
  singular: "Subcontracting Receipt",
  plural: "Subcontracting Receipts",
  subtitle: "Finished goods back from the subcontractor, with the fibre they consumed",
  icon: PackageCheck,
  submittable: true,
  listFields: ["name", "supplier", "supplier_name", "posting_date", "total_qty", "total", "is_return", "status", "docstatus", "modified"],
  columns: [
    nameCol("Receipt", (r) => r.supplier_name || r.supplier),
    dateCol("posting_date", "Date"),
    numCol("total_qty", "Qty", 0),
    moneyCol("total", "Total"),
    yesNoCol("is_return", "Type", "Return", "Receipt"),
    statusCol("status", "Status", "Draft"),
  ],
  searchFields: ["name", "supplier", "supplier_name", "supplier_delivery_note"],
  statusField: "status",
  statuses: ["Draft", "Completed", "Return", "Return Issued", "Closed", "Cancelled"],
  dateField: "posting_date",
  dateLabel: "Posting date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Receipt"),
    sec("Receipt"),
    req(select("naming_series", "Series", ["MAT-SCR-.YYYY.-", "MAT-SCR-RET-.YYYY.-"])),
    req(link("company", "Company", "Company")),
    req(date("posting_date", "Posting Date")),
    data("posting_time", "Posting Time"),
    check("set_posting_time", "Edit Posting Date and Time"),
    colBreak(),
    req(link("supplier", "Subcontractor", "Supplier")),
    ro(data("supplier_name", "Subcontractor Name")),
    data("supplier_delivery_note", "Subcontractor Delivery Note"),
    ro(check("is_return", "Is Return")),
    ro(link("return_against", "Return Against", "Subcontracting Receipt")),
    sec("Totals"),
    ro(float("total_qty", "Total Qty")),
    colBreak(),
    ro(currency("total", "Total")),
    tab("Items"),
    sec("Warehouses"),
    link("set_warehouse", "Accepted Warehouse", "Warehouse"),
    link("rejected_warehouse", "Rejected Warehouse", "Warehouse"),
    colBreak(),
    link("supplier_warehouse", "Subcontractor Warehouse", "Warehouse"),
    tab("Raw Materials"),
    tab("Costing"),
    sec("Distribution"),
    select("distribute_additional_costs_based_on", "Distribute Additional Costs By", ["Qty", "Amount"]),
    colBreak(),
    ro(currency("total_additional_costs", "Total Additional Costs")),
    tab("More"),
    sec("Transport"),
    data("transporter_name", "Transporter"),
    data("lr_no", "Vehicle / LR No"),
    colBreak(),
    date("lr_date", "LR Date"),
    sec("Accounting"),
    link("cost_center", "Cost Center", "Cost Center"),
    colBreak(),
    link("project", "Project", "Project"),
    sec("Remarks"),
    text("remarks", "Remarks"),
  ],
  children: [SCR_ITEMS, SCR_CONSUMED, ADDITIONAL_COSTS],
  tabIcons: { Receipt: PackageCheck, Items: Factory, "Raw Materials": Boxes, Costing: Coins, More: Truck },
  actions: [
    { label: "Make Return", icon: Undo2, group: "create", show: (c) => submitted(c) && !c.values.is_return,
      make: "erpnext.subcontracting.doctype.subcontracting_receipt.subcontracting_receipt.make_subcontract_return" },
  ],
  defaults: ({ company }) => ({ company, naming_series: "MAT-SCR-.YYYY.-", posting_date: todayISO() }),
  summary: (v, rows) => {
    const items = rows.items ?? [];
    const acc = items.reduce((s, r) => s + asNumber(r.qty), 0);
    const rej = items.reduce((s, r) => s + asNumber(r.rejected_qty), 0);
    return [
      { label: "Accepted", value: fmt(acc), tone: "emerald" },
      { label: "Rejected", value: fmt(rej), tone: rej ? "rose" : "sky" },
      { label: "Acceptance", value: acc + rej ? `${fmt((acc / (acc + rej)) * 100, 1)} %` : "—", tone: "teal" },
      { label: "Total", value: fmtMoney(v.total), tone: "indigo" },
    ];
  },
  titleOf: (v) => (v.name ? `${v.name}${v.supplier_name ? ` · ${v.supplier_name}` : ""}` : "New Subcontracting Receipt"),
};

/* ============================================================================ Subcontracting BOM */

export const SUBCONTRACTING_BOM_CONFIG: DocConfig = {
  doctype: "Subcontracting BOM",
  base: "/subcontracting/boms",
  singular: "Subcontracting BOM",
  plural: "Subcontracting BOMs",
  subtitle: "Which service item is billed for each finished good made outside",
  icon: Boxes,
  companyScoped: false,
  listFields: ["name", "finished_good", "finished_good_bom", "service_item", "is_active", "modified"],
  columns: [nameCol("Subcontracting BOM", (r) => r.finished_good), textCol("finished_good_bom", "BOM"), textCol("service_item", "Service Item"), yesNoCol("is_active", "Status", "Active", "Inactive")],
  searchFields: ["name", "finished_good", "service_item"],
  fields: [
    sec("Finished good"),
    req(link("finished_good", "Finished Good", "Item")),
    req(float("finished_good_qty", "Finished Good Qty")),
    ro(link("finished_good_uom", "UOM", "UOM")),
    colBreak(),
    req(link("finished_good_bom", "Finished Good BOM", "BOM")),
    check("is_active", "Is Active"),
    sec("Service"),
    req(link("service_item", "Service Item", "Item")),
    req(float("service_item_qty", "Service Item Qty")),
    colBreak(),
    req(link("service_item_uom", "Service UOM", "UOM")),
    ro(float("conversion_factor", "Conversion Factor")),
  ],
  defaults: () => ({ is_active: 1, finished_good_qty: 1, service_item_qty: 1 }),
  titleOf: (v) => (v.finished_good ? `${v.finished_good} → ${v.service_item ?? "…"}` : "New Subcontracting BOM"),
};

export const SUBCONTRACTING_CONFIGS = [SUBCONTRACTING_ORDER_CONFIG, SUBCONTRACTING_RECEIPT_CONFIG, SUBCONTRACTING_BOM_CONFIG];
