import { Building2, MapPin, ArrowLeftRight, Wrench, Tags } from "lucide-react";
import type { DocConfig, ChildTableSpec } from "@/components/doc/doc-config";
import {
  sec, colBreak, data, date, datetime, int, float, currency, check, text, link, select, ro, req, when,
  nameCol, textCol, dateCol, dateTimeCol, moneyCol, statusCol, yesNoCol, docstatusCol, fmtMoney,
} from "@/components/doc/doc-helpers";
import { getLinkedValues } from "@/hooks/useDoc";
import { todayISO, nowERPDateTime } from "@/utils/dates";
import { asNumber } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { AssetDepreciationPanel, AssetMovementsPanel } from "./AssetPanels";

const DEPRECIATION_METHODS = ["", "Straight Line", "Double Declining Balance", "Written Down Value", "Manual"];

/** Finance books = how (and how fast) an asset depreciates. Used on both Asset and Asset Category. */
const FINANCE_BOOKS: ChildTableSpec = {
  key: "finance_books",
  label: "Finance Books",
  description: "Depreciation method, number of depreciations and their frequency.",
  doctype: "Asset Finance Book",
  columns: [
    link("finance_book", "Finance Book", "Finance Book"),
    req(select("depreciation_method", "Method", DEPRECIATION_METHODS)),
    req(int("total_number_of_depreciations", "No. of Depreciations")),
    req(int("frequency_of_depreciation", "Every (months)")),
    date("depreciation_start_date", "First Depreciation"),
    float("rate_of_depreciation", "Rate %"),
    float("salvage_value_percentage", "Salvage %"),
    currency("expected_value_after_useful_life", "Salvage Value"),
  ],
  dialogColumns: [check("daily_prorata_based", "Depreciate on daily pro-rata"), check("shift_based", "Depreciate based on shifts")],
  newRow: () => ({ depreciation_method: "Straight Line", total_number_of_depreciations: 12, frequency_of_depreciation: 12 }),
  wide: true,
};

/* ============================================================================ Asset */

export const ASSET_CONFIG: DocConfig = {
  doctype: "Asset",
  base: "/asset-management/register",
  singular: "Asset",
  plural: "Assets",
  subtitle: "The fixed asset register — cost, book value and depreciation",
  icon: Building2,
  submittable: true,
  listFields: ["name", "asset_name", "asset_category", "location", "purchase_date", "net_purchase_amount", "total_asset_cost", "value_after_depreciation", "status", "custodian", "docstatus", "modified"],
  columns: [
    nameCol("Asset", (r) => r.asset_name),
    textCol("asset_category", "Category"),
    textCol("location", "Location"),
    dateCol("purchase_date", "Purchased"),
    moneyCol("total_asset_cost", "Cost"),
    moneyCol("value_after_depreciation", "Book Value"),
    statusCol("status", "Status", "Draft"),
  ],
  searchFields: ["name", "asset_name", "item_code", "asset_category", "location", "custodian"],
  statusField: "status",
  statuses: ["Draft", "Submitted", "Partially Depreciated", "Fully Depreciated", "In Maintenance", "Out of Order", "Sold", "Scrapped", "Capitalized", "Work In Progress"],
  filters: [
    { field: "asset_category", label: "Category", optionsFrom: "Asset Category" },
    { field: "location", label: "Location", optionsFrom: "Location" },
  ],
  dateField: "purchase_date",
  dateLabel: "Purchase date",
  sort: { key: "purchase_date", dir: "desc" },
  fields: [
    sec("Asset"),
    select("naming_series", "Series", ["ACC-ASS-.YYYY.-"]),
    req(link("item_code", "Item Code", "Item")),
    ro(data("item_name", "Item Name")),
    req(data("asset_name", "Asset Name")),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(link("location", "Location", "Location")),
    ro(link("asset_category", "Asset Category", "Asset Category")),
    select("asset_type", "Asset Type", ["", "Existing Asset", "Composite Asset", "Composite Component"]),
    sec("Purchase"),
    req(date("purchase_date", "Purchase Date")),
    date("available_for_use_date", "Available for Use Date"),
    int("asset_quantity", "Asset Quantity"),
    colBreak(),
    currency("net_purchase_amount", "Net Purchase Amount"),
    ro(currency("purchase_amount", "Purchase Amount")),
    ro(currency("additional_asset_cost", "Additional Asset Cost")),
    ro(currency("total_asset_cost", "Total Asset Cost")),
    sec("Source documents"),
    link("purchase_receipt", "Purchase Receipt", "Purchase Receipt"),
    colBreak(),
    link("purchase_invoice", "Purchase Invoice", "Purchase Invoice"),
    sec("Depreciation"),
    check("calculate_depreciation", "Calculate Depreciation"),
    check("maintenance_required", "Maintenance Required"),
    when(check("is_fully_depreciated", "Is Fully Depreciated"), (v) => v.asset_type === "Existing Asset" && !v.calculate_depreciation),
    colBreak(),
    when(currency("opening_accumulated_depreciation", "Opening Accumulated Depreciation"), (v) => v.asset_type === "Existing Asset"),
    when(int("opening_number_of_booked_depreciations", "Opening Booked Depreciations"), (v) => v.asset_type === "Existing Asset"),
    ro(currency("value_after_depreciation", "Value After Depreciation")),
    sec("Ownership"),
    select("asset_owner", "Asset Owner", ["Company", "Supplier", "Customer"]),
    link("custodian", "Custodian", "Employee"),
    link("department", "Department", "Department"),
    colBreak(),
    link("cost_center", "Cost Center", "Cost Center"),
    when(link("supplier", "Supplier", "Supplier"), (v) => v.asset_owner === "Supplier"),
    when(link("customer", "Customer", "Customer"), (v) => v.asset_owner === "Customer"),
    sec("Insurance"),
    data("insurer", "Insurer"),
    data("policy_number", "Policy Number"),
    data("comprehensive_insurance", "Comprehensive Insurance"),
    colBreak(),
    data("insured_value", "Insured Value"),
    date("insurance_start_date", "Insurance Start"),
    date("insurance_end_date", "Insurance End"),
    sec("Make"),
    data("manufacturer", "Manufacturer"),
    data("make", "Make"),
    colBreak(),
    data("model", "Model"),
  ],
  children: [{ ...FINANCE_BOOKS, showIf: (v) => Boolean(v.calculate_depreciation) }],
  defaults: ({ company }) => ({ company, naming_series: "ACC-ASS-.YYYY.-", purchase_date: todayISO(), asset_quantity: 1, calculate_depreciation: 1, asset_owner: "Company" }),
  linkEffects: {
    item_code: async (code, v) => {
      const i = await getLinkedValues("Item", code, ["item_name", "asset_category"]);
      return { item_name: i.item_name, asset_category: i.asset_category, asset_name: v.asset_name || i.item_name };
    },
  },
  summary: (v) => {
    const cost = asNumber(v.total_asset_cost) || asNumber(v.net_purchase_amount);
    const book = v.value_after_depreciation === undefined || v.value_after_depreciation === null ? cost : asNumber(v.value_after_depreciation);
    return [
      { label: "Cost", value: formatMoney(cost), tone: "sky" },
      { label: "Book value", value: formatMoney(book), tone: "emerald" },
      { label: "Depreciated", value: formatMoney(Math.max(0, cost - book)), tone: "amber" },
      { label: "Location", value: v.location || "—", tone: "indigo" },
    ];
  },
  extra: ({ name, isNew }) =>
    !isNew && name ? (
      <>
        <AssetDepreciationPanel asset={name} />
        <AssetMovementsPanel asset={name} />
      </>
    ) : null,
  titleOf: (v) => (v.name ? `${v.name}${v.asset_name ? ` · ${v.asset_name}` : ""}` : "New Asset"),
};

/* ============================================================================ Asset Category */

export const ASSET_CATEGORY_CONFIG: DocConfig = {
  doctype: "Asset Category",
  base: "/asset-management/categories",
  singular: "Asset Category",
  plural: "Asset Categories",
  subtitle: "Groups of assets that share depreciation rules and accounts",
  icon: Tags,
  companyScoped: false,
  listFields: ["name", "asset_category_name", "enable_cwip_accounting", "non_depreciable_category", "modified"],
  columns: [nameCol("Category"), yesNoCol("enable_cwip_accounting", "CWIP Accounting", "On", "Off"), yesNoCol("non_depreciable_category", "Depreciable", "No", "Yes")],
  searchFields: ["name", "asset_category_name"],
  fields: [
    sec("Category"),
    req(data("asset_category_name", "Asset Category Name")),
    colBreak(),
    check("enable_cwip_accounting", "Enable Capital Work in Progress Accounting"),
    check("non_depreciable_category", "Non Depreciable Category"),
  ],
  children: [
    FINANCE_BOOKS,
    {
      key: "accounts",
      label: "Accounts",
      description: "The ledger accounts assets in this category post to, per company.",
      doctype: "Asset Category Account",
      minRows: 1,
      columns: [
        req(link("company_name", "Company", "Company")),
        req(link("fixed_asset_account", "Fixed Asset Account", "Account")),
        link("accumulated_depreciation_account", "Accumulated Depreciation", "Account"),
        link("depreciation_expense_account", "Depreciation Expense", "Account"),
        link("capital_work_in_progress_account", "CWIP Account", "Account"),
      ],
      wide: true,
    },
  ],
  titleOf: (v) => v.asset_category_name || v.name || "New Asset Category",
};

/* ============================================================================ Location */

export const LOCATION_CONFIG: DocConfig = {
  doctype: "Location",
  base: "/asset-management/locations",
  singular: "Location",
  plural: "Locations",
  subtitle: "Where assets sit — sites, buildings, floors and rooms",
  icon: MapPin,
  companyScoped: false,
  listFields: ["name", "location_name", "parent_location", "is_group", "is_container", "modified"],
  columns: [nameCol("Location"), textCol("parent_location", "Parent"), yesNoCol("is_group", "Group", "Group", "Leaf"), yesNoCol("is_container", "Container", "Yes", "No")],
  searchFields: ["name", "location_name", "parent_location"],
  fields: [
    sec("Location"),
    req(data("location_name", "Location Name")),
    link("parent_location", "Parent Location", "Location"),
    colBreak(),
    check("is_group", "Is Group"),
    check("is_container", "Is Container"),
    sec("Coordinates"),
    float("latitude", "Latitude"),
    colBreak(),
    float("longitude", "Longitude"),
  ],
  titleOf: (v) => v.location_name || v.name || "New Location",
};

/* ============================================================================ Asset Movement */

export const ASSET_MOVEMENT_CONFIG: DocConfig = {
  doctype: "Asset Movement",
  base: "/asset-management/movements",
  singular: "Asset Movement",
  plural: "Asset Movements",
  subtitle: "Transfers, issues and receipts of assets between locations and people",
  icon: ArrowLeftRight,
  submittable: true,
  listFields: ["name", "purpose", "transaction_date", "company", "docstatus", "modified"],
  columns: [nameCol("Movement"), textCol("purpose", "Purpose"), dateTimeCol("transaction_date", "Date"), docstatusCol()],
  searchFields: ["name", "purpose"],
  filters: [{ field: "purpose", label: "Purpose", options: ["Issue", "Receipt", "Transfer", "Transfer and Issue"] }],
  dateField: "transaction_date",
  dateLabel: "Date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    sec("Movement"),
    req(link("company", "Company", "Company")),
    req(select("purpose", "Purpose", ["", "Issue", "Receipt", "Transfer", "Transfer and Issue"])),
    colBreak(),
    req(datetime("transaction_date", "Transaction Date")),
    link("reference_doctype", "Reference Document Type", "DocType"),
    data("reference_name", "Reference Document Name"),
  ],
  children: [
    {
      key: "assets",
      label: "Assets",
      description: "Which assets move, from where and to where.",
      doctype: "Asset Movement Item",
      minRows: 1,
      columns: [
        req(link("asset", "Asset", "Asset")),
        ro(data("asset_name", "Asset Name")),
        link("source_location", "From Location", "Location"),
        link("target_location", "To Location", "Location"),
        link("from_employee", "From Employee", "Employee"),
        link("to_employee", "To Employee", "Employee"),
      ],
      linkEffects: {
        asset: async (asset) => {
          const v = await getLinkedValues("Asset", asset, ["asset_name", "location", "custodian"]);
          return { asset_name: v.asset_name, source_location: v.location, from_employee: v.custodian };
        },
      },
    },
  ],
  defaults: ({ company }) => ({ company, purpose: "Transfer", transaction_date: nowERPDateTime() }),
  summary: (_v, rows) => [{ label: "Assets moved", value: (rows.assets ?? []).length, tone: "indigo" }],
  titleOf: (v) => (v.name ? String(v.name) : "New Asset Movement"),
};

/* ============================================================================ Asset Repair */

export const ASSET_REPAIR_CONFIG: DocConfig = {
  doctype: "Asset Repair",
  base: "/asset-management/repairs",
  singular: "Asset Repair",
  plural: "Asset Repairs",
  subtitle: "Breakdowns and repairs, what they cost, and how long the asset was down",
  icon: Wrench,
  submittable: true,
  listFields: ["name", "asset", "asset_name", "repair_status", "failure_date", "completion_date", "total_repair_cost", "docstatus", "modified"],
  columns: [
    nameCol("Repair", (r) => r.asset_name || r.asset),
    textCol("asset", "Asset"),
    dateTimeCol("failure_date", "Failed On"),
    dateTimeCol("completion_date", "Completed"),
    moneyCol("total_repair_cost", "Cost"),
    statusCol("repair_status", "Status", "Pending"),
  ],
  searchFields: ["name", "asset", "asset_name", "description"],
  statusField: "repair_status",
  statuses: ["Pending", "Completed", "Cancelled"],
  dateField: "failure_date",
  dateLabel: "Failure date",
  sort: { key: "failure_date", dir: "desc" },
  fields: [
    sec("Repair"),
    req(select("naming_series", "Series", ["ACC-ASR-.YYYY.-"])),
    req(link("asset", "Asset", "Asset")),
    ro(data("asset_name", "Asset Name")),
    link("company", "Company", "Company"),
    colBreak(),
    select("repair_status", "Repair Status", ["Pending", "Completed", "Cancelled"]),
    req(datetime("failure_date", "Failure Date")),
    datetime("completion_date", "Completion Date"),
    link("cost_center", "Cost Center", "Cost Center"),
    link("project", "Project", "Project"),
    sec("What happened"),
    text("description", "Error Description"),
    text("actions_performed", "Actions Performed"),
    sec("Cost"),
    ro(currency("repair_cost", "Repair Cost")),
    currency("consumed_items_cost", "Consumed Items Cost"),
    colBreak(),
    ro(currency("total_repair_cost", "Total Repair Cost")),
    check("capitalize_repair_cost", "Capitalize Repair Cost"),
    when(int("increase_in_asset_life", "Increase In Asset Life (months)"), (v) => Boolean(v.capitalize_repair_cost)),
  ],
  children: [
    {
      key: "invoices",
      label: "Repair Purchase Invoices",
      doctype: "Asset Repair Purchase Invoice",
      columns: [link("purchase_invoice", "Purchase Invoice", "Purchase Invoice"), req(link("expense_account", "Expense Account", "Account")), req(currency("repair_cost", "Repair Cost"))],
      newRow: () => ({ repair_cost: 0 }),
      totals: (rows) => [{ label: "Repair cost", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.repair_cost), 0)), align: "right" }],
    },
    {
      key: "stock_items",
      label: "Consumed Stock Items",
      doctype: "Asset Repair Consumed Item",
      columns: [req(link("item_code", "Item", "Item")), req(link("warehouse", "Warehouse", "Warehouse")), currency("valuation_rate", "Valuation Rate"), data("consumed_quantity", "Consumed Qty"), ro(currency("total_value", "Total Value"))],
      newRow: () => ({ consumed_quantity: "1" }),
    },
  ],
  defaults: ({ company }) => ({ company, naming_series: "ACC-ASR-.YYYY.-", repair_status: "Pending", failure_date: nowERPDateTime() }),
  linkEffects: {
    asset: async (asset) => {
      const v = await getLinkedValues("Asset", asset, ["asset_name", "company"]);
      return { asset_name: v.asset_name, ...(v.company ? { company: v.company } : {}) };
    },
  },
  summary: (v) => [{ label: "Repair cost", value: formatMoney(asNumber(v.total_repair_cost) || asNumber(v.repair_cost)), tone: "rose" }],
  titleOf: (v) => (v.name ? String(v.name) : "New Asset Repair"),
};
