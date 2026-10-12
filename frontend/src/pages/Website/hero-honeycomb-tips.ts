import { DASHBOARDS, MODULES } from "./website-data";

/* ------------------------------------------------------------------ *
 * Hover cards for the hero honeycomb cells.
 *
 * Every card lists features taken from this site's own module and
 * dashboard data, so a card can never drift from what the Modules and
 * Dashboards sections say. Keyed by the cell `title` in
 * hero-honeycomb-data.ts. The card layout is ported from the hover
 * popover in the hero of website-micromax.html.
 * ------------------------------------------------------------------ */

const moduleFeatures = (id: string): string[] => MODULES.find((m) => m.id === id)?.features ?? [];
const insights = (id: string): string[] => DASHBOARDS.find((d) => d.id === id)?.insights ?? [];
const pick = (list: string[], ...indexes: number[]): string[] =>
  indexes.map((i) => list[i]).filter((item): item is string => Boolean(item));

const trade = moduleFeatures("trade");
const buying = moduleFeatures("buying");
const selling = moduleFeatures("selling");
const production = moduleFeatures("production");
const stock = moduleFeatures("stock");
const landed = moduleFeatures("landed");
const reports = moduleFeatures("reports");
const workflow = moduleFeatures("workflow");

const profitLoss = insights("profit-loss");
const balanceSheet = insights("balance-sheet");
const productionInsights = insights("production");
const qualityInsight = DASHBOARDS.flatMap((d) => d.insights).find((i) => /quality inspection/i.test(i));

export const HEX_TIPS: Record<string, string[]> = {
  // Trade and production
  Import: trade,
  BOM: [...pick(production, 0), ...pick(productionInsights, 1), ...pick(production, 3)],
  WO: [...pick(production, 1), ...pick(productionInsights, 0, 2), ...pick(production, 3)],
  PPC: production,
  "Job Cards": [...pick(production, 2), ...pick(productionInsights, 2, 3)],
  Packing: [...pick(trade, 2, 1), ...pick(reports, 2)],
  Costing: [...pick(trade, 3), ...pick(landed, 2, 3), ...pick(profitLoss, 1)],
  LCV: landed,

  // Buying and selling
  MRQ: buying,
  RFQ: pick(buying, 1, 2, 3),
  PO: [...pick(buying, 2, 3), ...pick(workflow, 1)],
  Selling: [...selling, "Customer ledger with receivables ageing"],
  Delivery: pick(selling, 1, 0, 2),
  Invoicing: [
    "Purchase receipts & invoices",
    "Sales invoices",
    "Supplier ledger with payables ageing",
    ...pick(profitLoss, 2),
  ],
  Approvals: workflow,

  // Stock, people and assets
  Stocks: stock,
  Batches: pick(stock, 1, 0, 3),
  HR: moduleFeatures("hr"),
  POS: moduleFeatures("pos").slice(0, 5),
  Assets: ["Fixed asset register", "Depreciation schedules", "Asset maintenance"],
  Quality: [...(qualityInsight ? [qualityInsight] : []), ...pick(productionInsights, 3)],

  // Finance and administration
  Banks: [
    "Receipt and payment entries",
    "Allocate payments to invoices",
    "Bank reconciliation",
    "Cash & bank balances at a glance",
  ],
  Financial: [...pick(profitLoss, 0, 1, 3), ...pick(balanceSheet, 0, 2)],
  Budgets: pick(profitLoss, 3, 1, 0),
  Reporting: reports,
  Admin: moduleFeatures("admin"),
  CRM: moduleFeatures("crm"),
};
