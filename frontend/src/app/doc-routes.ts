/**
 * Where each DocType's record opens in the React app: `${base}${name}`.
 * Anything not listed opens in the ERPNext desk (`/desk/<doctype-slug>/<name>` — Frappe v16; proxied in dev and nginx).
 */
export const DOC_ROUTES: Record<string, string> = {
  ToDo: "/todos/",
  // Real estate (realestate app) — generated forms
  "RE Plot Transfer": "/re/d/re-plot-transfer/",
  "RE Booking Cancellation": "/re/d/re-booking-cancellation/",
  "RE Plot Merge": "/re/d/re-plot-merge/",
  "RE Surcharge": "/re/d/re-surcharge/",
  "RE Surcharge Waiver": "/re/d/re-surcharge-waiver/",
  "RE Commission": "/re/d/re-commission/",
  "RE Project": "/re/d/re-project/",
  "RE Block": "/re/d/re-block/",
  "RE Plot": "/re/d/re-plot/",
  "RE Plot Size": "/re/d/re-plot-size/",
  "RE Map Feature": "/re/d/re-map-feature/",
  "RE Map Import": "/re/d/re-map-import/",
  "RE Booking": "/re/d/re-booking/",
  "RE Payment": "/re/d/re-payment/",
  "RE Payment Plan": "/re/d/re-payment-plan/",
  "RE Society Bill": "/re/d/re-society-bill/",
  "RE Charge Head": "/re/d/re-charge-head/",
  "RE Maintenance Plan": "/re/d/re-maintenance-plan/",
  "RE Site Visit": "/re/d/re-site-visit/",
  "RE Conversation": "/re/d/re-conversation/",
  "RE Broadcast": "/re/d/re-broadcast/",
  "RE Quick Reply": "/re/d/re-quick-reply/",
  "RE Reminder Log": "/re/d/re-reminder-log/",
  "RE Generated Document": "/re/d/re-generated-document/",
  "RE Vault Document": "/re/d/re-vault-document/",
  // Buying / import
  "Material Request": "/import/material-requests/",
  "Request for Quotation": "/import/rfqs/",
  "Purchase Order": "/import/purchase-orders/",
  "Leave Application": "/hr/leave-applications/",
  "Expense Claim": "/hr/expense-claims/",
  "Employee Advance": "/hr/advances/",
  "Bank": "/accounting/banks/",
  "Bank Account": "/accounting/bank-accounts/",
  "Cheque Book": "/accounting/cheque-books/",
  "Shift Request": "/hr/shift-requests/",
  "Import Shipment": "/import/shipments/",
  "Import Cost Sheet": "/import/cost-sheets/",
  "Purchase Receipt": "/purchase/receipts/",
  "Purchase Invoice": "/purchase/invoices/",
  "Landed Cost Voucher": "/purchase/landed-costs/",
  // Selling / export
  "Sales Order": "/selling/sales-orders/",
  Quotation: "/selling/quotations/",
  "Blanket Order": "/selling/blanket-orders/",
  "Pricing Rule": "/selling/pricing-rules/",
  "Product Bundle": "/selling/product-bundles/",
  "Price List": "/selling/price-lists/",
  "Sales Taxes and Charges Template": "/selling/tax-templates/",
  "Sales Partner": "/selling/sales-partners/",
  "Sales Person": "/selling/sales-persons/",
  Territory: "/selling/territories/",
  "Delivery Note": "/selling/delivery-notes/",
  "Sales Invoice": "/selling/sales-invoices/",
  "LC Proforma": "/export/lc-proforma/",
  "Export Shipment": "/export/shipments/",
  "Export Packing Details": "/export/packing/",
  // Stock
  "Stock Entry": "/inventory/stock-entries/",
  Warehouse: "/inventory/warehouses/",
  "Stock Reconciliation": "/inventory/reconciliations/",
  "Item Price": "/inventory/item-prices/",
  Batch: "/inventory/batches/",
  "Serial No": "/inventory/serial-nos/",
  "Pick List": "/inventory/pick-lists/",
  // Masters
  Item: "/masters/items/",
  "Item Group": "/masters/item-groups/",
  Customer: "/masters/customers/",
  "Customer Group": "/masters/customer-groups/",
  Supplier: "/masters/suppliers/",
  "Supplier Group": "/masters/supplier-groups/",
  // Accounting
  "Journal Entry": "/accounting/journal-entries/",
  "Payment Entry": "/accounting/payment-entries/",
  // Production
  BOM: "/production/boms/",
  "Work Order": "/production/work-orders/",
  "Production Plan": "/production/production-plans/",
  "Job Card": "/production/job-cards/",
  "Downtime Entry": "/production/downtime/",
  Workstation: "/production/workstations/",
  "Workstation Type": "/production/workstation-types/",
  Routing: "/production/routings/",
  Operation: "/production/operations/",
  "Item Alternative": "/production/item-alternatives/",
  // Subcontracting
  "Subcontracting Order": "/subcontracting/orders/",
  "Subcontracting Receipt": "/subcontracting/receipts/",
  "Subcontracting BOM": "/subcontracting/boms/",
  // Quality
  "Quality Inspection": "/quality/inspections/",
  "Quality Inspection Template": "/quality/templates/",
  "Quality Procedure": "/quality/procedures/",
  "Quality Goal": "/quality/goals/",
  "Quality Review": "/quality/reviews/",
  "Non Conformance": "/quality/non-conformances/",
  "Quality Action": "/quality/actions/",
  // Assets / projects
  Asset: "/asset-management/register/",
  "Asset Category": "/asset-management/categories/",
  "Asset Movement": "/asset-management/movements/",
  "Asset Repair": "/asset-management/repairs/",
  Location: "/asset-management/locations/",
  Project: "/projects/list/",
  Task: "/projects/tasks/",
  // Support / POS / approvals
  Issue: "/support/issues/",
  "Issue Type": "/support/issue-types/",
  "Service Level Agreement": "/support/slas/",
  "POS Invoice": "/pos/invoices/",
  "POS Profile": "/pos/profiles/",
  "POS Opening Entry": "/pos/openings/",
  "POS Closing Entry": "/pos/closings/",
  Workflow: "/approvals/workflows/",
  Notification: "/approvals/notifications/",
  "Assignment Rule": "/approvals/assignment-rules/",
  "Auto Repeat": "/approvals/auto-repeats/",
  // People / CRM / admin
  Employee: "/hr/employees/",
  "Salary Slip": "/payroll/salary-slips/",
  "CRM Lead": "/crm/leads/",
  "CRM Deal": "/crm/deals/",
  User: "/admin/users/",
  Role: "/admin/roles/",
};

export const slug = (doctype: string) => doctype.toLowerCase().replace(/ /g, "-");

/** React route for a record, or the desk URL (external) when the app has no screen for it. */
export function docUrl(doctype: string, name: string): { href: string; external: boolean } {
  const base = DOC_ROUTES[doctype];
  return base ? { href: `${base}${encodeURIComponent(name)}`, external: false } : { href: deskUrl(doctype, name), external: true };
}

export const deskUrl = (doctype: string, name?: string) => `/desk/${slug(doctype)}${name ? `/${encodeURIComponent(name)}` : ""}`;
export const printUrl = (doctype: string, name: string, format?: string) =>
  `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&trigger_print=1${format ? `&format=${encodeURIComponent(format)}` : ""}`;
