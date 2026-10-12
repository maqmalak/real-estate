import {
  PackagePlus,
  Store,
  Ticket,
  Briefcase,
  ArrowRightLeft,
  CalendarClock,
  FileCheck2,
  CalendarHeart,
  Hourglass,
  BadgeCheck,
  XCircle,
  PlusCircle,
  LayoutDashboard,
  AlertOctagon,
  Target,
  FlaskConical,
  ClipboardCheck,
  LayoutList,
  Gauge,
  Landmark,
  Radar,
  Ship,
  FileText,
  Package,
  Factory,
  Warehouse,
  BarChart3,
  Settings as SettingsIcon,
  ShoppingCart,
  Container,
  Calculator,
  Boxes,
  ClipboardList,
  Truck,
  ArrowLeftRight,
  Percent,
  MapIcon,
  Tag,
  Hash,
  Barcode,
  PackageCheck,
  Flag,
  DoorOpen,
  DoorClosed,
  Inbox,
  ScanSearch,
  NotebookTabs,
  GitCompareArrows,
  Link2,
  HandCoins,
  ChartGantt,
  Workflow,
  BellRing,
  Shuffle,
  Shapes,
  Settings2,
  Route,
  SlidersHorizontal,
  Users,
  ShieldCheck,
  Receipt,
  Coins,
  Handshake,
  Cog,
  Building2,
  LifeBuoy,
  Users2,
  Banknote,
  UserCircle,
  Building,
  Bell,
  Lock,
  ListTree,
  Tags,
  LayoutTemplate,
  CalendarRange,
  ScrollText,
  Wallet,
  BookOpen,
  Rocket,
  Scale,
  TrendingUp,
  PieChart,
  Sliders,
  CreditCard,
  UserPlus,
  Building2 as OrgIcon,
  CheckSquare,
  StickyNote,
  Phone,
  FileSignature,
  Repeat,
  Contact2,
  CalendarDays,
  Radio,
  ListChecks,
  GanttChartSquare,
  MapPin,
  Quote,
  LayoutGrid,
  IdCard,
  GitBranch,
  CalendarCheck,
  LogIn,
  CalendarOff,
  CalendarPlus2,
  Award,
  Clock3,
  FileSpreadsheet,
  PlayCircle,
  type LucideIcon,
  Layers,
  Timer,
  Wrench,
  FolderKanban,
  ListTodo,
  MessageCircle,
  House,
} from "lucide-react";
import { APPS, APP_GROUPS } from "./apps";

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
  /** Roles allowed to see this entry. Empty = everyone (server still enforces). */
  roles?: string[];
}

export interface NavGroup {
  /** Group heading; omitted for standalone links. */
  title?: string;
  items: NavItem[];
}

// "Buying" merges the old standalone Import app (procurement planning) and
// Purchase app (receiving/billing) into one sidebar — the two titled groups
// below render as visually separated sections (see Sidebar's NavLinks),
// which is the divider between them. Both the `purchase` and `import` route
// segments point at this same array so the sidebar looks identical no
// matter which of the two (still-separate) URL prefixes you're on.
const BUYING_NAV: NavGroup[] = [
  {
    items: [
      { label: "Buying Analysis", to: "/analytics/suite/purchase", icon: LayoutDashboard },
      { label: "Buying Cycle", to: "/analytics/procurement", icon: Timer },
    ],
  },
  {
    title: "Procurement",
    items: [
      { label: "Material Requests", to: "/import/material-requests", icon: ClipboardList },
      { label: "Requests for Quotation", to: "/import/rfqs", icon: Quote },
      { label: "Purchase Orders", to: "/import/purchase-orders", icon: ShoppingCart },
      { label: "Import Shipments", to: "/import/shipments", icon: Container },
      { label: "Import Cost Sheets", to: "/import/cost-sheets", icon: Calculator },
    ],
  },
  {
    title: "Purchase",
    items: [
      { label: "Purchase Receipts", to: "/purchase/receipts", icon: Package },
      { label: "Purchase Invoices", to: "/purchase/invoices", icon: Receipt },
      { label: "Landed Cost Vouchers", to: "/purchase/landed-costs", icon: Coins },
    ],
  },
  {
    title: "Setup",
    items: [{ label: "Buying Settings", to: "/purchase/settings", icon: Sliders }],
  },
];

// Same idea for "Selling" — merges the old standalone Export app in as a
// second titled section. Both `selling` and `export` segments share this array.
const SELLING_NAV: NavGroup[] = [
  {
    items: [
      { label: "Sales Analysis", to: "/analytics/suite/sales", icon: LayoutDashboard },
      { label: "SO Analysis", to: "/analytics/so_analysis", icon: ClipboardList },
      { label: "DO Analysis", to: "/analytics/do_analysis", icon: Truck },
    ],
  },
  {
    title: "Selling",
    items: [
      { label: "Quotations", to: "/selling/quotations", icon: FileText },
      { label: "Sales Orders", to: "/selling/sales-orders", icon: Handshake },
      { label: "Delivery Notes", to: "/selling/delivery-notes", icon: Package },
      { label: "Sales Invoices", to: "/selling/sales-invoices", icon: Receipt },
      { label: "Blanket Orders", to: "/selling/blanket-orders", icon: CalendarRange },
    ],
  },
  {
    title: "Pricing",
    items: [
      { label: "Price Lists", to: "/selling/price-lists", icon: Tag },
      { label: "Item Prices", to: "/inventory/item-prices", icon: Tag },
      { label: "Pricing Rules", to: "/selling/pricing-rules", icon: Percent },
      { label: "Product Bundles", to: "/selling/product-bundles", icon: Boxes },
      { label: "Sales Taxes Templates", to: "/selling/tax-templates", icon: Receipt },
    ],
  },
  {
    title: "Sales Team",
    items: [
      { label: "Customers", to: "/masters/customers", icon: Users2 },
      { label: "Sales Persons", to: "/selling/sales-persons", icon: UserCircle },
      { label: "Sales Partners", to: "/selling/sales-partners", icon: Users2 },
      { label: "Territories", to: "/selling/territories", icon: MapIcon },
    ],
  },
  {
    title: "Export",
    items: [
      { label: "Export Dashboard", to: "/export/dashboard", icon: LayoutDashboard },
      { label: "LC Proforma", to: "/export/lc-proforma", icon: FileText },
      { label: "Export Orders", to: "/export/orders", icon: Package },
      { label: "Export Packing", to: "/export/packing", icon: Boxes },
      { label: "Export Shipments", to: "/export/shipments", icon: Ship },
    ],
  },
  {
    title: "Setup",
    items: [{ label: "Selling Settings", to: "/selling/settings", icon: Sliders }],
  },
];

const ANALYTICS_NAV: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      { label: "Executive", to: "/dashboard", icon: Gauge },
      { label: "Accounts", to: "/analytics/accounts", icon: Landmark },
    ],
  },
  {
    title: "Buying",
    items: [
      { label: "Overview (one page)", to: "/analytics/suite/purchase", icon: LayoutList },
      { label: "Purchases", to: "/analytics/purchase", icon: ShoppingCart },
      { label: "Buying Cycle", to: "/analytics/procurement", icon: Timer },
      { label: "Import", to: "/analytics/import_analysis", icon: Container },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Overview (one page)", to: "/analytics/suite/sales", icon: LayoutList },
      { label: "Sales", to: "/analytics/sales", icon: TrendingUp },
      { label: "SO Analysis", to: "/analytics/so_analysis", icon: ClipboardList },
      { label: "DO Analysis", to: "/analytics/do_analysis", icon: Truck },
      { label: "Export", to: "/analytics/export_analysis", icon: Ship },
    ],
  },
  {
    title: "Imp/Exp",
    items: [
      { label: "Overview (one page)", to: "/analytics/suite/trade", icon: LayoutList },
      { label: "Export Analysis", to: "/analytics/export_analysis", icon: Ship },
      { label: "Import Analysis", to: "/analytics/import_analysis", icon: Container },
      { label: "Trade documents", to: "/analytics/export", icon: FileText },
    ],
  },
  {
    title: "Quality",
    items: [
      { label: "QA/QC Analysis", to: "/analytics/quality", icon: ClipboardCheck },
      { label: "Quality app", to: "/quality/inspections", icon: FlaskConical },
    ],
  },
  {
    title: "Operations & Finance",
    items: [
      { label: "Production", to: "/production", icon: Factory },
      { label: "WO Analysis", to: "/production#wo_analysis--top", icon: ListChecks },
      { label: "Job Card Analysis", to: "/production#jc_analysis--top", icon: Timer },
      { label: "Stock", to: "/analytics/stock", icon: Warehouse },
      { label: "HR", to: "/analytics/hr", icon: Users2 },
      { label: "Payroll", to: "/analytics/payroll", icon: Banknote },
      { label: "Assets", to: "/analytics/assets", icon: Building2 },
      { label: "Financial", to: "/analytics/financials", icon: Scale },
    ],
  },
];

/**
 * Per-app sidebar navigation, keyed by the route's first path segment (which
 * lines up 1:1 with each tile's `to` in `app/apps.ts`, except `stock` which
 * shares the `inventory` segment/pages). The Desktop app-launcher (`/`) is
 * the one route with no entry here — it renders without a sidebar entirely.
 */
/** The Desktop launcher's sidebar: every app, in the same sections and order as the cards. */
const HOME_NAV: NavGroup[] = [...APP_GROUPS, "More"]
  .map((group) => ({
    title: group,
    items: APPS.filter((app) => (app.group ?? "More") === group).map((app) => ({ label: app.label, to: app.to, icon: app.icon, roles: app.roles })),
  }))
  .filter((g) => g.items.length > 0);

export const APP_NAVIGATION: Record<string, NavGroup[]> = {
  home: HOME_NAV,
  re: [
    { title: "Setup", items: [
      { label: "Projects", to: "/re/d/re-project", icon: Landmark, roles: ["Sales Manager", "Projects User", "Projects Manager"] },
      { label: "Blocks", to: "/re/d/re-block", icon: Boxes, roles: ["Sales Manager"] },
      { label: "Plot Records", to: "/re/d/re-plot", icon: Hash, roles: ["Sales Manager", "Sales User"] },
      { label: "Plot Sizes", to: "/re/d/re-plot-size", icon: Tag, roles: ["Sales Manager"] },
      { label: "Payment Plans", to: "/re/d/re-payment-plan", icon: CalendarClock, roles: ["Sales Manager", "Accounts User", "Accounts Manager"] },
      { label: "Map Import", to: "/re/d/re-map-import", icon: ArrowRightLeft, roles: ["Sales Manager", "Projects User", "Projects Manager"] },
      { label: "Quick Replies", to: "/re/d/re-quick-reply", icon: Ticket, roles: ["Sales Manager", "Sales User"] },
      { label: "Users & Roles", to: "/re/settings/users", icon: ShieldCheck, roles: ["System Manager"] },
      { label: "Settings", to: "/re/d/re-settings", icon: SettingsIcon, roles: ["System Manager"] },
    ] },
    { title: "Zarmeen Gardens", items: [
      { label: "Home", to: "/re/home", icon: House },
      { label: "Dashboard", to: "/re", icon: LayoutDashboard },
      { label: "Today", to: "/re/today", icon: CalendarClock },
      { label: "Society Map", to: "/re/map", icon: MapIcon },
      { label: "Plots", to: "/re/plots", icon: Boxes },
      { label: "Insights", to: "/re/insights", icon: BarChart3, roles: ["Sales Manager", "Accounts User", "Accounts Manager"] },
      { label: "Reports", to: "/re/reports", icon: FileText, roles: ["Sales Manager", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager", "Projects User", "Projects Manager"] },
      { label: "Acceptance checks", to: "/re/acceptance", icon: ShieldCheck, roles: ["System Manager"] },
    ] },
    { title: "Sales & Collections", items: [
      { label: "Bookings", to: "/re/d/re-booking", icon: ClipboardList, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer"] },
      { label: "Receipts", to: "/re/d/re-payment", icon: Calculator, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager"] },
      { label: "Sales Invoices", to: "/selling/sales-invoices", icon: FileText, roles: ["Sales Manager", "Accounts User", "Accounts Manager", "Recovery Officer"] },
      { label: "Payment Entries", to: "/accounting/payment-entries", icon: ArrowLeftRight, roles: ["Sales Manager", "Accounts User", "Accounts Manager"] },
      { label: "Customers", to: "/masters/customers", icon: Briefcase, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager"] },
    ] },
    { title: "Operations", items: [
      { label: "Operations Hub", to: "/re/operations", icon: Gauge, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer"] },
      { label: "Transfers", to: "/re/d/re-plot-transfer", icon: ArrowRightLeft, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager"] },
      { label: "Cancellations", to: "/re/d/re-booking-cancellation", icon: XCircle, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer"] },
      { label: "Re-allotments", to: "/re/d/re-re-allotment", icon: ArrowRightLeft, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager"] },
      { label: "Plot Merges", to: "/re/d/re-plot-merge", icon: Boxes, roles: ["Sales Manager", "Sales User", "Society Manager"] },
      { label: "Surcharges", to: "/re/d/re-surcharge", icon: Percent, roles: ["Sales Manager", "Accounts User", "Accounts Manager", "Recovery Officer"] },
      { label: "Commissions", to: "/re/d/re-commission", icon: Calculator, roles: ["Sales Manager", "Accounts User", "Accounts Manager", "Sales Agent"] },
    ] },
    { title: "CRM & WhatsApp", items: [
      { label: "WhatsApp Inbox", to: "/re/inbox", icon: MessageCircle, roles: ["Sales Manager", "Sales User", "Sales Agent", "Recovery Officer"] },
      { label: "Leads & Deals", to: "/crm", icon: Target, roles: ["Sales Manager", "Sales User", "Sales Agent"] },
      { label: "Site Visits", to: "/re/d/re-site-visit", icon: MapIcon, roles: ["Sales Manager", "Sales User", "Sales Agent"] },
      { label: "WhatsApp Chats", to: "/re/d/re-conversation", icon: Ticket, roles: ["Sales Manager", "Sales User", "Sales Agent", "Recovery Officer"] },
      { label: "Broadcasts", to: "/re/d/re-broadcast", icon: Radar, roles: ["Sales Manager", "Recovery Officer", "Society Manager"] },
      { label: "Reminder Log", to: "/re/d/re-reminder-log", icon: Hourglass, roles: ["Sales Manager", "Recovery Officer", "Society Manager", "Accounts User", "Accounts Manager"] },
    ] },
    { title: "Society Ops", items: [
      { label: "Society Bills", to: "/re/d/re-society-bill", icon: FileCheck2, roles: ["Society Manager", "Accounts User", "Accounts Manager", "Recovery Officer", "Sales Manager"] },
      { label: "Bulk Collection", to: "/re/society/collect", icon: HandCoins, roles: ["Society Manager", "Accounts User", "Accounts Manager", "Recovery Officer"] },
      { label: "Charge Heads", to: "/re/d/re-charge-head", icon: Percent, roles: ["Society Manager", "Accounts User", "Accounts Manager"] },
      { label: "Maintenance Plans", to: "/re/d/re-maintenance-plan", icon: ClipboardCheck, roles: ["Society Manager", "Projects User", "Projects Manager"] },
      { label: "Infrastructure", to: "/re/d/re-map-feature", icon: Factory, roles: ["Society Manager", "Projects User", "Projects Manager", "Sales Manager"] },
    ] },
    { title: "Development & Costs", items: [
      { label: "Overview", to: "/re/development", icon: Gauge, roles: ["Projects User", "Projects Manager", "Accounts User", "Accounts Manager", "Sales Manager"] },
      { label: "Material Requests", to: "/import/material-requests", icon: PackagePlus, roles: ["Projects User", "Projects Manager", "Accounts User", "Accounts Manager", "Stock User", "Purchase User"] },
      { label: "Purchase Orders", to: "/import/purchase-orders", icon: ShoppingCart, roles: ["Projects User", "Projects Manager", "Accounts User", "Accounts Manager", "Purchase User"] },
      { label: "Purchase Receipts", to: "/purchase/receipts", icon: Truck, roles: ["Projects User", "Projects Manager", "Accounts User", "Accounts Manager", "Stock User", "Purchase User"] },
      { label: "Purchase Invoices", to: "/purchase/invoices", icon: FileText, roles: ["Accounts User", "Accounts Manager", "Purchase User"] },
      { label: "Stock Entries", to: "/inventory/stock-entries", icon: Package, roles: ["Projects User", "Projects Manager", "Stock User"] },
      { label: "Assets", to: "/assets", icon: Warehouse, roles: ["Accounts User", "Accounts Manager", "Projects User", "Projects Manager"] },
    ] },
    { title: "Documents", items: [
      { label: "Documents", to: "/re/documents", icon: FileCheck2, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager"] },
      { label: "Generated", to: "/re/d/re-generated-document", icon: FileText, roles: ["Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager"] },
      { label: "Vault", to: "/re/d/re-vault-document", icon: Container, roles: ["Sales Manager", "Society Manager", "Projects User", "Projects Manager", "Accounts User", "Accounts Manager"] },
    ] },
  ],
  quality: [
    { title: "Overview", items: [{ label: "QA/QC Analysis", to: "/quality", icon: Gauge }] },
    {
      title: "Inspection",
      items: [
        { label: "Quality Inspections", to: "/quality/inspections", icon: ClipboardCheck },
        { label: "Inspection Templates", to: "/quality/templates", icon: ListChecks },
        { label: "Parameters", to: "/quality/parameters", icon: FlaskConical },
        { label: "Parameter Groups", to: "/quality/parameter-groups", icon: Layers },
      ],
    },
    {
      title: "Quality Management",
      items: [
        { label: "Procedures (SOPs)", to: "/quality/procedures", icon: ScrollText },
        { label: "Quality Goals", to: "/quality/goals", icon: Target },
        { label: "Quality Reviews", to: "/quality/reviews", icon: ClipboardList },
        { label: "Non Conformances", to: "/quality/non-conformances", icon: AlertOctagon },
        { label: "Quality Actions (CAPA)", to: "/quality/actions", icon: Wrench },
      ],
    },
  ],
  dashboard: ANALYTICS_NAV,
  analytics: ANALYTICS_NAV,
  import: BUYING_NAV,
  purchase: BUYING_NAV,
  export: SELLING_NAV,
  production: [
    {
      items: [
        { label: "Overview", to: "/production", icon: BarChart3 },
        { label: "WO Analysis", to: "/production#wo_analysis--top", icon: ListChecks },
        { label: "Job Card Analysis", to: "/production#jc_analysis--top", icon: Timer },
      ],
    },
    {
      title: "Planning",
      items: [
        { label: "Production Plans", to: "/production/production-plans", icon: CalendarRange },
        { label: "Schedule (Gantt)", to: "/production/schedule", icon: GanttChartSquare },
        { label: "Cost Simulator", to: "/production/cost-simulator", icon: Calculator },
        { label: "Bills of Materials", to: "/production/boms", icon: Layers },
      ],
    },
    {
      title: "Execution",
      items: [
        { label: "Work Orders", to: "/production/work-orders", icon: Factory },
        { label: "Job Cards", to: "/production/job-cards", icon: ListChecks },
        { label: "Downtime", to: "/production/downtime", icon: Timer },
      ],
    },
    {
      title: "Masters",
      items: [
        { label: "Workstations", to: "/production/workstations", icon: Cog },
        { label: "Workstation Types", to: "/production/workstation-types", icon: Shapes },
        { label: "Operations", to: "/production/operations", icon: Settings2 },
        { label: "Routings", to: "/production/routings", icon: Route },
        { label: "Item Alternatives", to: "/production/item-alternatives", icon: ArrowLeftRight },
      ],
    },
    {
      title: "Settings",
      items: [{ label: "Manufacturing Settings", to: "/production/settings", icon: SlidersHorizontal }],
    },
  ],
  inventory: [
    { items: [{ label: "Dashboard", to: "/analytics/stock", icon: LayoutDashboard }] },
    {
      title: "Stock",
      items: [
        { label: "Stock Balance", to: "/inventory/stock", icon: Warehouse },
        { label: "Material Movement", to: "/inventory/stock-entries", icon: ArrowLeftRight },
        { label: "Stock Reconciliation", to: "/inventory/reconciliations", icon: Scale },
        { label: "Pick Lists", to: "/inventory/pick-lists", icon: ClipboardList },
        { label: "Stock Ledger", to: "/inventory/reports/stock-ledger", icon: BookOpen },
      ],
    },
    {
      title: "Masters",
      items: [
        { label: "Warehouses", to: "/inventory/warehouses", icon: Warehouse },
        { label: "Item Prices", to: "/inventory/item-prices", icon: Tag },
        { label: "Batches", to: "/inventory/batches", icon: Hash },
        { label: "Serial Numbers", to: "/inventory/serial-nos", icon: Barcode },
      ],
    },
  ],
  subcontracting: [
    {
      title: "Subcontracting",
      items: [
        { label: "Subcontracting Orders", to: "/subcontracting/orders", icon: ArrowLeftRight },
        { label: "Subcontracting Receipts", to: "/subcontracting/receipts", icon: PackageCheck },
        { label: "Subcontracting BOMs", to: "/subcontracting/boms", icon: Layers },
      ],
    },
  ],
  support: [
    {
      title: "Support",
      items: [
        { label: "Issues", to: "/support/issues", icon: LifeBuoy },
        { label: "Service Level Agreements", to: "/support/slas", icon: ShieldCheck },
      ],
    },
    {
      title: "Setup",
      items: [
        { label: "Issue Types", to: "/support/issue-types", icon: Tag },
        { label: "Priorities", to: "/support/priorities", icon: Flag },
      ],
    },
  ],
  pos: [
    {
      title: "Point of Sale",
      items: [
        { label: "Dashboard", to: "/pos", icon: LayoutDashboard },
        { label: "POS Terminal", to: "/pos/terminal", icon: Store },
        { label: "Cash In / Out", to: "/pos/cash", icon: Wallet },
        { label: "Receive Stock", to: "/pos/stock", icon: PackagePlus },
        { label: "POS Invoices", to: "/pos/invoices", icon: ShoppingCart },
        { label: "Shift Openings", to: "/pos/openings", icon: DoorOpen },
        { label: "Shift Closings", to: "/pos/closings", icon: DoorClosed },
      ],
    },
    {
      title: "Setup",
      items: [
        { label: "POS Profiles", to: "/pos/profiles", icon: SlidersHorizontal },
        { label: "Offers (Pricing Rules)", to: "/selling/pricing-rules", icon: Percent },
        { label: "Coupons", to: "/pos/coupons", icon: Ticket },
        { label: "Loyalty Programs", to: "/pos/loyalty", icon: Award },
      ],
    },
  ],
  approvals: [
    {
      title: "Approvals & Alerts",
      items: [
        { label: "Approvals Inbox", to: "/approvals/inbox", icon: Inbox },
        { label: "Approval Workflows", to: "/approvals/workflows", icon: Workflow },
        { label: "Alerts & Notifications", to: "/approvals/notifications", icon: BellRing },
        { label: "Assignment Rules", to: "/approvals/assignment-rules", icon: Shuffle },
        { label: "Recurring Documents", to: "/approvals/auto-repeats", icon: Repeat },
      ],
    },
  ],
  reports: [
    { title: "Reports", items: [{ label: "All Reports", to: "/reports", icon: BarChart3 }] },
    {
      title: "Accounting",
      items: [
        { label: "General Ledger", to: "/accounting/reports/general-ledger", icon: FileText },
        { label: "Trial Balance", to: "/accounting/reports/trial-balance", icon: FileText },
        { label: "Accounts Receivable", to: "/reports/run/accounts-receivable", icon: FileText },
        { label: "Accounts Payable", to: "/reports/run/accounts-payable", icon: FileText },
      ],
    },
    {
      title: "Trade",
      items: [
        { label: "Sales Register", to: "/reports/run/sales-register", icon: FileText },
        { label: "Purchase Register", to: "/reports/run/purchase-register", icon: FileText },
        { label: "Stock Balance", to: "/reports/run/stock-balance", icon: FileText },
      ],
    },
    {
      // MicroMax import / export registers (micromax-only, see ROUTE_APPS).
      title: "Import & Export",
      items: [
        { label: "Import Reports", to: "/reports/import", icon: BarChart3 },
        { label: "Export Reports", to: "/reports/export", icon: BarChart3 },
        { label: "Shipment Reports", to: "/reports/shipments", icon: Truck },
        { label: "LC Reports", to: "/reports/lc", icon: FileText },
      ],
    },
  ],
  masters: [
    {
      title: "Masters",
      items: [
        { label: "Items", to: "/masters/items", icon: Boxes },
        { label: "Item Groups", to: "/masters/item-groups", icon: ListTree },
        { label: "Customers", to: "/masters/customers", icon: Users },
        { label: "Customer Groups", to: "/masters/customer-groups", icon: ListTree },
        { label: "Suppliers", to: "/masters/suppliers", icon: Users },
        { label: "Supplier Groups", to: "/masters/supplier-groups", icon: ListTree },
      ],
    },
  ],
  accounting: [
    {
      title: "Overview",
      items: [
        { label: "Dashboard", to: "/accounting", icon: LayoutDashboard },
        { label: "Getting Started", to: "/accounting/getting-started", icon: Rocket },
      ],
    },
    {
      title: "Masters",
      items: [
        { label: "Chart of Accounts", to: "/accounting/chart-of-accounts", icon: ListTree },
        { label: "Cost Centers", to: "/accounting/cost-centers", icon: Scale },
        { label: "Account Categories", to: "/accounting/account-categories", icon: Tags },
        { label: "Fiscal Years", to: "/accounting/fiscal-years", icon: CalendarRange },
      ],
    },
    {
      title: "Templates",
      items: [
        { label: "Mode of Payment", to: "/accounting/mode-of-payment", icon: Wallet },
        { label: "Payment Terms", to: "/accounting/payment-terms", icon: ScrollText },
        { label: "Terms and Conditions", to: "/accounting/terms-and-conditions", icon: FileSignature },
        { label: "Journal Entry Templates", to: "/accounting/journal-entry-templates", icon: LayoutTemplate },
        { label: "Sales Tax Templates", to: "/accounting/tax-templates/sales", icon: Receipt },
        { label: "Purchase Tax Templates", to: "/accounting/tax-templates/purchase", icon: Receipt },
      ],
    },
    {
      title: "Banking",
      items: [
        { label: "Banks", to: "/accounting/banks", icon: Building },
        { label: "Bank Accounts", to: "/accounting/bank-accounts", icon: CreditCard },
        { label: "Cheque Books", to: "/accounting/cheque-books", icon: NotebookTabs },
        { label: "Cheque Tracking", to: "/accounting/cheque-tracking", icon: ScanSearch },
        { label: "Bank Clearance", to: "/accounting/bank-clearance", icon: CalendarCheck },
        { label: "Bank Reconciliation Tool", to: "/desk/bank-reconciliation-tool", icon: GitCompareArrows },
        { label: "Bank Reconciliation Statement", to: "/reports/run/bank-reconciliation-statement", icon: FileText },
        { label: "Plaid Settings", to: "/accounting/plaid-settings", icon: Link2 },
      ],
    },
    {
      title: "Transactions",
      items: [
        { label: "Journal Entries", to: "/accounting/journal-entries", icon: BookOpen },
        { label: "Payment Entries", to: "/accounting/payment-entries", icon: CreditCard },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "General Ledger", to: "/accounting/reports/general-ledger", icon: FileText },
        { label: "Trial Balance", to: "/accounting/reports/trial-balance", icon: Scale },
        { label: "Profit and Loss", to: "/accounting/reports/profit-and-loss", icon: TrendingUp },
        { label: "Balance Sheet", to: "/accounting/reports/balance-sheet", icon: PieChart },
        { label: "Cash Flow", to: "/accounting/reports/cash-flow", icon: Wallet },
      ],
    },
    {
      title: "Setup",
      items: [
        { label: "Accounts Settings", to: "/accounting/setup/settings", icon: Sliders },
        { label: "Accounting Dimensions", to: "/accounting/setup/dimensions", icon: Sliders },
      ],
    },
  ],
  admin: [
    {
      title: "Administration",
      items: [
        { label: "Users", to: "/admin/users", icon: Users, roles: ["System Manager"] },
        { label: "Roles", to: "/admin/roles", icon: ShieldCheck, roles: ["System Manager"] },
      ],
    },
  ],
  selling: SELLING_NAV,
  crm: [
    {
      title: "Overview",
      items: [{ label: "Dashboard", to: "/crm/dashboard", icon: LayoutGrid }],
    },
    {
      title: "Relationships",
      items: [
        { label: "Contacts", to: "/crm/contacts", icon: Contact2 },
        { label: "Organizations", to: "/crm/organizations", icon: OrgIcon },
      ],
    },
    {
      title: "Pipeline",
      items: [
        { label: "Leads", to: "/crm/leads", icon: UserPlus },
        { label: "Deals", to: "/crm/deals", icon: Handshake },
        { label: "Contracts", to: "/crm/contracts", icon: FileSignature },
        { label: "Prospect Scraper", to: "/crm/prospect-scraper", icon: Radar },
      ],
    },
    {
      title: "Work",
      items: [
        { label: "Tasks", to: "/crm/tasks", icon: CheckSquare },
        { label: "Notes", to: "/crm/notes", icon: StickyNote },
        { label: "Call Logs", to: "/crm/call-logs", icon: Phone },
      ],
    },
    {
      title: "Activities",
      items: [
        { label: "Follow-ups", to: "/crm/follow-ups", icon: Repeat },
        { label: "Calendar", to: "/crm/calendar", icon: CalendarDays },
      ],
    },
    {
      title: "Masters",
      items: [
        { label: "Lead Sources", to: "/crm/masters/lead-sources", icon: Radio },
        { label: "Lead Statuses", to: "/crm/masters/lead-statuses", icon: ListChecks },
        { label: "Territories", to: "/crm/masters/territories", icon: MapPin },
        { label: "Industries", to: "/crm/masters/industries", icon: Factory },
        { label: "Salutations", to: "/crm/masters/salutations", icon: Quote },
      ],
    },
    {
      title: "Configuration",
      items: [
        { label: "Email Templates", to: "/crm/email-templates", icon: FileText },
        { label: "Contract Templates", to: "/crm/contract-templates", icon: FileText },
        { label: "Settings", to: "/crm/settings", icon: SettingsIcon },
      ],
    },
  ],
  "asset-management": [
    {
      items: [
        { label: "Dashboard", to: "/analytics/assets", icon: LayoutDashboard },
        { label: "Overview", to: "/asset-management", icon: BarChart3 },
      ],
    },
    {
      title: "Register",
      items: [
        { label: "Assets", to: "/asset-management/register", icon: Building2 },
        { label: "Asset Movements", to: "/asset-management/movements", icon: ArrowLeftRight },
        { label: "Repairs", to: "/asset-management/repairs", icon: Wrench },
      ],
    },
    {
      title: "Masters",
      items: [
        { label: "Asset Categories", to: "/asset-management/categories", icon: Tags },
        { label: "Locations", to: "/asset-management/locations", icon: MapPin },
      ],
    },
  ],
  projects: [
    {
      items: [{ label: "Overview", to: "/projects", icon: LayoutDashboard }],
    },
    {
      title: "Projects",
      items: [
        { label: "Projects", to: "/projects/list", icon: FolderKanban },
        { label: "Tasks", to: "/projects/tasks", icon: ListTodo },
        { label: "Task Board", to: "/projects/board", icon: LayoutGrid },
        { label: "Timeline (Gantt)", to: "/projects/timeline", icon: ChartGantt },
      ],
    },
  ],
  hr: [
    {
      items: [
        { label: "Overview", to: "/hr", icon: LayoutDashboard },
        { label: "Analytics", to: "/analytics/hr", icon: BarChart3 },
        { label: "Setup", to: "/hr/setup", icon: ListChecks },
      ],
    },
    {
      title: "Employees",
      items: [
        { label: "Employees", to: "/hr/employees", icon: Users2 },
        { label: "Departments", to: "/hr/departments", icon: Building2 },
        { label: "Designations", to: "/hr/designations", icon: IdCard },
        { label: "Branches", to: "/hr/branches", icon: GitBranch },
        { label: "Employment Types", to: "/hr/employment-types", icon: Briefcase },
        { label: "Employee Grades", to: "/hr/employee-grades", icon: Layers },
      ],
    },
    {
      title: "Lifecycle",
      items: [
        { label: "Promotions", to: "/hr/promotions", icon: TrendingUp },
        { label: "Transfers", to: "/hr/transfers", icon: ArrowRightLeft },
        { label: "Separations", to: "/hr/separations", icon: DoorOpen },
      ],
    },
    {
      title: "Shifts & Attendance",
      items: [
        { label: "Shifts", to: "/hr/shifts", icon: Clock3 },
        { label: "Shift Types", to: "/hr/shift-types", icon: Timer },
        { label: "Shift Assignments", to: "/hr/shift-assignments", icon: CalendarClock },
        { label: "Shift Requests", to: "/hr/shift-requests", icon: Repeat },
        { label: "Shift Locations", to: "/hr/shift-locations", icon: MapPin },
        { label: "Shift Schedules", to: "/hr/shift-schedules", icon: CalendarRange },
        { label: "Schedule Assignments", to: "/hr/shift-schedule-assignments", icon: CalendarClock },
        { label: "Roster", to: "/hr/roster", icon: LayoutGrid },
        { label: "Attendance", to: "/hr/attendance", icon: CalendarCheck },
        { label: "Attendance Requests", to: "/hr/attendance-requests", icon: FileCheck2 },
        { label: "Checkins", to: "/hr/checkins", icon: LogIn },
      ],
    },
    {
      title: "Leave",
      items: [
        { label: "Leave Applications", to: "/hr/leave-applications", icon: CalendarOff },
        { label: "Leave Allocations", to: "/hr/leave-allocations", icon: CalendarPlus2 },
        { label: "Leave Policies", to: "/hr/leave-policies", icon: ShieldCheck },
        { label: "Policy Assignments", to: "/hr/leave-policy-assignments", icon: ListChecks },
        { label: "Leave Types", to: "/hr/leave-types", icon: Tags },
        { label: "Leave Periods", to: "/hr/leave-periods", icon: CalendarRange },
        { label: "Compensatory Leave", to: "/hr/compensatory-leave", icon: CalendarHeart },
        { label: "Leave Encashment", to: "/hr/leave-encashment", icon: Coins },
        { label: "Holiday Lists", to: "/hr/holiday-lists", icon: CalendarDays },
        { label: "Holiday Assignments", to: "/hr/holiday-list-assignments", icon: CalendarRange },
      ],
    },
    {
      title: "Claims & Extras",
      items: [
        { label: "Expense Claims", to: "/hr/expense-claims", icon: Receipt },
        { label: "Expense Claim Types", to: "/hr/expense-claim-types", icon: Tags },
        { label: "Employee Advances", to: "/hr/advances", icon: Wallet },
        { label: "Salary Loans", to: "/hr/loans", icon: HandCoins },
        { label: "Gratuity", to: "/hr/gratuity", icon: Award },
      ],
    },
    {
      title: "Tools",
      items: [
        { label: "Employee Attendance Tool", to: "/desk/employee-attendance-tool", icon: CalendarCheck },
        { label: "Shift Assignment Tool", to: "/desk/shift-assignment-tool", icon: CalendarClock },
        { label: "Leave Control Panel", to: "/desk/leave-control-panel", icon: CalendarPlus2 },
        { label: "Roster", to: "/hr/roster", icon: LayoutGrid },
      ],
    },
    {
      title: "Setup",
      items: [
        { label: "HR Setup", to: "/hr/setup", icon: ListChecks },
        { label: "HR Settings", to: "/hr/settings", icon: Sliders },
      ],
    },
  ],
  payroll: [
    {
      items: [
        { label: "Overview", to: "/payroll", icon: LayoutDashboard },
        { label: "Analytics", to: "/analytics/payroll", icon: BarChart3 },
      ],
    },
    {
      title: "Run payroll",
      items: [
        { label: "Payroll Entries", to: "/payroll/entries", icon: PlayCircle },
        { label: "Salary Slips", to: "/payroll/salary-slips", icon: Banknote },
        { label: "Additional Salary", to: "/payroll/additional-salary", icon: PlusCircle },
        { label: "Salary Loans", to: "/hr/loans", icon: HandCoins },
        { label: "Incentives", to: "/payroll/incentives", icon: BadgeCheck },
        { label: "Retention Bonus", to: "/payroll/retention-bonus", icon: Award },
        { label: "Salary Withholding", to: "/payroll/salary-withholding", icon: XCircle },
      ],
    },
    {
      title: "Overtime",
      items: [
        { label: "Overtime Types", to: "/payroll/overtime-types", icon: Hourglass },
        { label: "Overtime Slips", to: "/payroll/overtime-slips", icon: Timer },
      ],
    },
    {
      title: "Structures",
      items: [
        { label: "Salary Components", to: "/payroll/salary-components", icon: Coins },
        { label: "Salary Structures", to: "/payroll/salary-structures", icon: FileSpreadsheet },
        { label: "Structure Assignments", to: "/payroll/salary-structure-assignments", icon: FileSignature },
        { label: "Gratuity Rules", to: "/payroll/gratuity-rules", icon: Award },
      ],
    },
    {
      title: "Tools",
      items: [
        { label: "Bulk Salary Structure Assignment", to: "/desk/bulk-salary-structure-assignment", icon: FileSignature },
        { label: "Payroll Entry (desk)", to: "/desk/payroll-entry/new", icon: PlayCircle },
      ],
    },
    {
      title: "Tax",
      items: [
        { label: "Payroll Periods", to: "/payroll/periods", icon: CalendarRange },
        { label: "Income Tax Slabs", to: "/payroll/income-tax-slabs", icon: Percent },
        { label: "Tax Declarations", to: "/payroll/tax-declarations", icon: ShieldCheck },
      ],
    },
    {
      title: "Setup",
      items: [
        { label: "HR & Payroll Setup", to: "/hr/setup", icon: ListChecks },
        { label: "Payroll Settings", to: "/payroll/settings", icon: Sliders },
      ],
    },
  ],
  settings: [
    {
      title: "Settings",
      items: [
        { label: "General", to: "/settings", icon: SettingsIcon },
        { label: "Company", to: "/settings/company", icon: Building },
        { label: "Notifications", to: "/settings/notifications", icon: Bell },
      ],
    },
  ],
  account: [
    {
      title: "My Account",
      items: [
        { label: "Profile", to: "/account", icon: UserCircle },
        { label: "Security", to: "/account/security", icon: Lock },
      ],
    },
  ],
};

/** Route segment -> human label for the sidebar's app header. */
export const APP_LABELS: Record<string, string> = {
  home: "Apps",
  re: "Real Estate",
  dashboard: "Dashboard",
  quality: "Quality",
  analytics: "Analytics",
  import: "Buying",
  purchase: "Buying",
  export: "Selling",
  production: "Production",
  inventory: "Stock",
  reports: "Reports",
  masters: "Masters",
  accounting: "Accounting",
  admin: "Administration",
  selling: "Selling",
  quotations: "Quotations",
  "blanket-orders": "Blanket Orders",
  "pricing-rules": "Pricing Rules",
  terminal: "Terminal",
  cash: "Cash In / Out",
  profiles: "POS Profiles",
  coupons: "Coupons",
  loyalty: "Loyalty Programs",
  "product-bundles": "Product Bundles",
  "price-lists": "Price Lists",
  "tax-templates": "Sales Taxes Templates",
  "sales-partners": "Sales Partners",
  "sales-persons": "Sales Persons",
  territories: "Territories",
  crm: "CRM",
  subcontracting: "Subcontracting",
  "asset-management": "Assets",
  projects: "Projects",
  support: "Support",
  hr: "HR",
  payroll: "Payroll",
  settings: "Settings",
  account: "My Account",
};

/** First path segment (`"/import/foo"` -> `"import"`, `"/"` -> `""`). */
export function appSegmentForPath(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

/** All sidebar nav groups flattened — used for the login page's live stat count. */
// The home sidebar only re-lists the apps, so it isn't counted as navigation of its own.
export const NAVIGATION: NavGroup[] = Object.entries(APP_NAVIGATION)
  .filter(([segment]) => segment !== "home")
  .flatMap(([, groups]) => groups);

/** Human-readable breadcrumb segments for a pathname. */
export const ROUTE_TITLES: Record<string, string> = {
  "": "Desktop",
  re: "Real Estate",
  d: "Records",
  insights: "Insights",
  development: "Development & Costs",
  home: "Desktop",
  dashboard: "Dashboard",
  schedule: "Production Schedule",
  routings: "Routings",
  operations: "Operations",
  "workstation-types": "Workstation Types",
  "item-alternatives": "Item Alternatives",
  quality: "Quality",
  inspections: "Quality Inspections",
  templates: "Inspection Templates",
  parameters: "Parameters",
  "parameter-groups": "Parameter Groups",
  procedures: "Procedures",
  goals: "Quality Goals",
  reviews: "Quality Reviews",
  "non-conformances": "Non Conformances",
  actions: "Quality Actions",
  analytics: "Analytics",
  accounts: "Accounts",
  admin: "Administration",
  users: "Users",
  roles: "Roles",
  import: "Buying",
  export: "Selling",
  production: "Production",
  inventory: "Stock",
  reports: "Reports",
  masters: "Masters",
  settings: "Settings",
  accounting: "Accounting",
  "getting-started": "Getting Started",
  "chart-of-accounts": "Chart of Accounts",
  "cost-centers": "Cost Centers",
  "account-categories": "Account Categories",
  "fiscal-years": "Fiscal Years",
  "payment-terms": "Payment Terms",
  "mode-of-payment": "Mode of Payment",
  "terms-and-conditions": "Terms and Conditions",
  "journal-entry-templates": "Journal Entry Templates",
  "tax-templates": "Tax Templates",
  sales: "Sales",
  "journal-entries": "Journal Entries",
  "payment-entries": "Payment Entries",
  "general-ledger": "General Ledger",
  "trial-balance": "Trial Balance",
  "profit-and-loss": "Profit and Loss",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow",
  setup: "Setup",
  dimensions: "Accounting Dimensions",
  selling: "Selling",
  crm: "CRM",
  subcontracting: "Subcontracting",
  "asset-management": "Assets",
  support: "Support",
  hr: "HR",
  payroll: "Payroll",
  account: "My Account",
  profile: "Profile",
  security: "Security",
  company: "Company",
  notifications: "Notifications",
  purchase: "Buying",
  "purchase-orders": "Purchase Orders",
  "material-requests": "Material Requests",
  rfqs: "Requests for Quotation",
  "stock-ledger": "Stock Ledger",
  receipts: "Purchase Receipts",
  invoices: "Purchase Invoices",
  "landed-costs": "Landed Cost Vouchers",
  shipments: "Shipments",
  "cost-sheets": "Cost Sheets",
  "lc-proforma": "LC Proforma",
  orders: "Orders",
  packing: "Packing",
  "work-orders": "Work Orders",
  boms: "Bills of Materials",
  register: "Asset Register",
  status: "Status",
  stock: "Stock",
  "stock-entries": "Stock Entries",
  items: "Items",
  "sales-orders": "Sales Orders",
  "sales-invoices": "Sales Invoices",
  "delivery-notes": "Delivery Notes",
  customers: "Customers",
  suppliers: "Suppliers",
  lc: "LC",
  new: "New",
  leads: "Leads",
  deals: "Deals",
  organizations: "Accounts",
  "follow-ups": "Follow-ups",
  calendar: "Calendar",
};

export function titleForSegment(segment: string): string {
  return (
    ROUTE_TITLES[segment] ??
    segment
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ")
  );
}
