import {
  Activity,
  Bell,
  Boxes,
  Building2,
  Calculator,
  ChartColumn,
  CircuitBoard,
  Cloud,
  ConciergeBell,
  CreditCard,
  Database,
  Eye,
  Factory,
  Gauge,
  Globe,
  GraduationCap,
  Handshake,
  HardDrive,
  KeyRound,
  Landmark,
  Layers,
  Lock,
  Network,
  Package,
  Route,
  Scale,
  ScrollText,
  Server,
  ServerCog,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Truck,
  Warehouse,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Company profile
 *
 * Everything marketing-facing lives here so copy can be edited without
 * touching layout. Contact details are placeholders — swap them for the
 * registered address / phone before this page goes live.
 * ------------------------------------------------------------------ */

export interface CompanyFact {
  label: string;
  value: string;
}

export interface CompanyValue {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const COMPANY = {
  legalName: "MicroMax Erp Pvt Ltd",
  shortName: "MicroMax ERP",
  productName: "MicroMax ERP Suite",
  tagline: "Run trading, manufacturing, retail, healthcare and education on one platform.",
  intro:
    "MicroMax Erp Pvt Ltd builds and operates an ERPNext-powered business suite for trading, manufacturing, distribution, retail, healthcare and education",
  about: [
    "MicroMax Erp Pvt Ltd is an enterprise software and business-process company. We deliver an end-to-end ERPNext platform that unifies procurement, production, warehousing, sales, point of sale, service delivery and accounting into a single, auditable system of record.",
    "Our suite is opinionated where it matters: letters of credit, import shipments, landed-cost sheets, export packing, counter billing, patient records and student ledgers are first-class processes — not spreadsheets bolted onto a generic ERP. Everything else is standard ERPNext, which means clean upgrades, open data and no vendor lock-in.",
    "Alongside the ERP we build the analytics layer. Operational data is published to Power BI for executive reporting and to Grafana for real-time monitoring, so the same numbers that run the business also drive its decisions.",
    "Our infrastructure practice covers the ground beneath the software: datacenter build-out and hosting, server virtualization and capacity planning. That means the ERP, its database and its analytics stack can be run on hardware we specify, size and support — on your premises or ours.",
  ],
  stats: [
    { value: "18+", label: "modules" },
    { value: "1", label: "source of truth" },
    { value: "100%", label: "open data" },
    { value: "24/7", label: "ops visibility" },
  ],
  facts: [
    { label: "Legal name", value: "MicroMax Erp Pvt Ltd" },
    { label: "Product", value: "MicroMax ERP Suite (ERP / BI Analytics, Datacenter, Virtualization)" },
    { label: "Focus", value: "Import & Export, trading, manufacturing, distribution, POS, Hospital, Education" },
    { label: "Deployment", value: "On-prem datacenter, virtualized or managed cloud" },
    { label: "Analytics", value: "Microsoft Power BI + Grafana" },
    { label: "Support", value: "Implementation, training and AMC" },
  ] as CompanyFact[],
  values: [
    {
      icon: ShieldCheck,
      title: "Server-enforced control",
      description:
        "Role and permission rules live in the backend, so no screen — web, mobile or BI — can read or write outside its grant.",
    },
    {
      icon: Zap,
      title: "Real-time by default",
      description:
        "Every dashboard reads live documents. No overnight batch, no stale export, no reconciliation surprises.",
    },
    {
      icon: Network,
      title: "Open and extensible",
      description:
        "Open-source core, documented REST/RPC APIs and custom fields instead of forks — integration without lock-in.",
    },
    {
      icon: Lock,
      title: "Your data stays yours",
      description:
        "Deploy on your own infrastructure, keep read replicas for analytics and export everything at any time.",
    },
  ] as CompanyValue[],
  /**
   * Placeholder contact details — replace with the real registered address,
   * phone and mailbox before publishing.
   */
  contact: {
    address: "Head Office — 213-C Sammanabad, Faisalabad, Pakistan",
    phone: "+92 300 7212058",
    email: "info@micromax-erp.com",
    website: "www.micromax-erp.com",
  },
};

/* ------------------------------------------------------------------ *
 * Module catalogue — one entry per implemented ERP module, with the
 * capabilities we actually ship (shown as feature chips on the page).
 * ------------------------------------------------------------------ */

export interface ModuleProfile {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  features: string[];
  /** Dark-mode-safe accent pair, same convention as ui/badge.tsx. */
  tone: string;
}

export const MODULES: ModuleProfile[] = [
  {
    id: "trade",
    label: "Import & Export",
    icon: Globe,
    description: "Letter of credit to shipment closing, with full document control.",
    features: ["LC Proforma", "Import shipment", "Export shipment & packing", "Import cost sheet"],
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    id: "buying",
    label: "Buying",
    icon: Package,
    description: "Procurement from material request to purchase invoice.",
    features: ["Material requests", "RFQ comparison", "Purchase orders", "Purchase receipts & invoices"],
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "selling",
    label: "Selling",
    icon: ShoppingBag,
    description: "Order to cash for domestic and export customers.",
    features: ["Sales orders", "Delivery notes", "Sales invoices", "Buyer-wise price lists"],
    tone: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  {
    id: "production",
    label: "Production",
    icon: Factory,
    description: "Plan, issue and cost manufacturing on the shop floor.",
    features: ["Multi-level BOM", "Work orders", "Job cards", "WIP valuation"],
    tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    id: "stock",
    label: "Inventory",
    icon: Warehouse,
    description: "Real-time stock across warehouses, batches and serials.",
    features: ["Multi-warehouse", "Batch & serial tracking", "Stock ledger", "Stock reconciliation"],
    tone: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  },
  {
    id: "accounting",
    label: "Accounting",
    icon: Landmark,
    description: "Multi-currency books, tax compliance and closed-loop reporting.",
    features: ["Chart of accounts", "Journal entries", "Trial balance & P&L", "Bank reconciliation"],
    tone: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  {
    id: "landed",
    label: "Landed Cost",
    icon: Calculator,
    description: "Allocate freight, duty and clearing charges to the right unit cost.",
    features: ["Charge allocation", "Freight & duty breakup", "Cost per unit", "Valuation recalculation"],
    tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    id: "crm",
    label: "CRM",
    icon: Handshake,
    description: "Pipeline from first enquiry to repeat order.",
    features: ["Leads & deals", "Activities & events", "Targets vs. achievement", "Customer 360"],
    tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    id: "hr",
    label: "HR & Payroll",
    icon: Server,
    description: "People, attendance and salary in the same system as the ledger.",
    features: ["Employee records", "Attendance & leave", "Salary structures", "Payroll entries"],
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    id: "reports",
    label: "Reports",
    icon: ScrollText,
    description: "Audit-ready registers and query reports across every module.",
    features: ["Stock & GL ledgers", "Ageing analysis", "Shipment registers", "Custom query reports"],
    tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    id: "workflow",
    label: "Approvals & Alerts",
    icon: Workflow,
    description: "Route documents to the right approver and escalate when they stall.",
    features: ["Multi-step approval", "Amount-based routing", "Email & in-app alerts", "SLA reminders"],
    tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "admin",
    label: "Administration",
    icon: ShieldCheck,
    description: "Users, roles and audit trail for a compliant deployment.",
    features: ["Role-based access", "Field-level permissions", "Audit trail", "Backup & restore"],
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    id: "pos",
    label: "Point of Sale",
    icon: CreditCard,
    description: "Counter billing that posts straight into stock and the ledger.",
    features: [
      "Touch billing screen",
      "Barcode & weighing-scale items",
      "Multi-counter, multi-shift, multi-outlet",
      "Cash drawer, card and wallet settlement",
    ],
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "hospitality",
    label: "Hotel & Restaurant",
    icon: ConciergeBell,
    description: "Front desk, POS billing and housekeeping on one night-audit ledger.",
    features: ["Room bookings & rate plans", "Restaurant / bar POS", "Housekeeping status", "Night audit & occupancy"],
    tone: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  },
  {
    id: "realestate",
    label: "Real Estate",
    icon: KeyRound,
    description: "Units, bookings and instalments from sale to possession.",
    features: ["Project & unit inventory", "Booking & instalment plans", "Broker commission", "Possession & handover"],
    tone: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400",
  },
  {
    id: "hospital",
    label: "Hospital & Clinic",
    icon: Stethoscope,
    description: "The patient journey from registration through discharge and billing.",
    features: [
      "Patient registration & medical record number",
      "OPD appointments and token queue",
      "Clinical notes, diagnoses and service orders",
      "Pharmacy, laboratory and IPD billing",
    ],
    tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "education",
    label: "Education",
    icon: GraduationCap,
    description: "Admissions, academics and fee collection for schools and institutes.",
    features: [
      "Admission, enrolment and student records",
      "Attendance, timetable and class schedules",
      "Exams, grading and report cards",
      "Fee schedules, invoices and concessions",
    ],
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    id: "bi",
    label: "BI & Analytics",
    icon: ChartColumn,
    description: "Power BI and Grafana delivery on top of live ERP data.",
    features: [
      "Power BI semantic model & datasets",
      "Grafana real-time operations dashboards",
      "Agreed KPI definitions with data lineage",
      "Scheduled refresh, subscriptions and alerts",
    ],
    tone: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    id: "datacenter",
    label: "Datacenter",
    icon: HardDrive,
    description: "Hosting, capacity and uptime for the whole stack.",
    features: [
      "Server, storage and rack planning",
      "Power, cooling and redundancy design",
      "Backup, retention and disaster recovery",
      "Uptime and capacity reporting",
    ],
    tone: "bg-stone-500/10 text-stone-600 dark:text-stone-400",
  },
  {
    id: "virtualization",
    label: "Virtualization",
    icon: ServerCog,
    description: "Consolidate workloads and scale without re-buying hardware.",
    features: [
      "Hypervisor setup and performance tuning",
      "VM provisioning from gold templates",
      "Resource pools, clustering and high availability",
      "Snapshots, live migration and backup",
    ],
    tone: "bg-lime-500/10 text-lime-600 dark:text-lime-400",
  },
];

/* ------------------------------------------------------------------ *
 * Industries — each vertical lists the modules it uses and the features
 * it gets out of them. `modules` holds MODULES ids; `features` are the
 * outcome-oriented bullets shown beside the module chips.
 * ------------------------------------------------------------------ */

export interface IndustryProfile {
  id: string;
  label: string;
  icon: LucideIcon;
  tagline: string;
  summary: string;
  modules: string[];
  features: string[];
  tone: string;
}

export const INDUSTRIES: IndustryProfile[] = [
  {
    id: "textile",
    label: "Textile & Garments",
    icon: Layers,
    tagline: "Style, colour and size traceability from cutting to packing",
    summary:
      "Order-wise style matrices, work orders and subcontracting, with wastage and conversion cost captured at every stage of production.",
    modules: ["production", "stock", "buying", "selling", "trade", "reports"],
    features: [
      "Item variants for style, colour, size and fabric GSM",
      "Cutting, stitching and finishing tracked as work orders",
      "Job work / subcontracting issue and receipt reconciliation",
      "Wastage and rejection capture by process",
      "Order-wise costing and profitability",
      "Export packing list generated from the order matrix",
    ],
    tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    id: "import-export",
    label: "Import & Export Trading",
    icon: Globe,
    tagline: "Letter of credit to landed cost, without the spreadsheet",
    summary:
      "Our core vertical. Track proforma invoices, LCs, shipment milestones, clearing charges and export packing in one chain, so the cost that hits inventory is the true landed cost.",
    modules: ["trade", "landed", "buying", "selling", "accounting", "reports", "workflow"],
    features: [
      "LC Proforma with bank, tenor and amendment history",
      "Import shipment milestones with delay alerts",
      "Import cost sheet allocating freight, duty and clearing per unit",
      "Export packing details and shipment-wise buyer documentation",
      "Multi-currency buying, selling and realised gain/loss",
      "Shipment, LC and cost-sheet registers ready for audit",
    ],
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    icon: Factory,
    tagline: "Plan capacity, cost the shop floor, control WIP",
    summary:
      "Multi-level BOMs, production plans and work orders in the same ledger as purchase and sales, so variance is visible the day it happens.",
    modules: ["production", "stock", "buying", "accounting", "workflow", "reports"],
    features: [
      "Multi-level BOM with scrap and operation costs",
      "Production planning and work-order scheduling",
      "Material issue vs. consumption variance",
      "WIP and finished-goods valuation",
      "Quality inspection holds and rejection routing",
      "Machine and shift-wise production reporting",
    ],
    tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    id: "distribution",
    label: "Distribution & Wholesale",
    icon: Truck,
    tagline: "Multi-warehouse stock, tiered pricing, credit control",
    summary:
      "Serve dealers and wholesalers from several warehouses with real-time availability, price lists and enforced credit limits.",
    modules: ["stock", "selling", "buying", "accounting", "crm", "reports"],
    features: [
      "Multi-warehouse availability and stock transfer",
      "Batch / serial tracking with shelf-life visibility",
      "Tiered price lists and customer-specific discounts",
      "Credit limit checks and overdue blocking at order entry",
      "Delivery notes and route-wise despatch registers",
      "Ageing, reorder level and fast/slow-mover analysis",
    ],
    tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "retail",
    label: "Retail, POS & E-commerce",
    icon: ShoppingCart,
    tagline: "Fast counter billing with back-office stock truth",
    summary:
      "Counter sales, returns and online orders posting into the same inventory and accounting records the head office reports from.",
    modules: ["pos", "selling", "stock", "accounting", "crm", "reports"],
    features: [
      "Touch POS counters with barcode and scale support",
      "Shift opening, cash drawer and settlement closing",
      "Returns, exchanges and credit notes",
      "Shop-wise daily sales and cash summary",
      "Online order and stock synchronisation",
      "Consolidated multi-outlet reporting",
    ],
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    id: "finance",
    label: "Accounting & Finance",
    icon: Landmark,
    tagline: "Multi-currency books that close on time",
    summary:
      "A full general ledger with receivables, payables, tax, budgeting and payroll integration — designed for audits that take hours, not weeks.",
    modules: ["accounting", "landed", "workflow", "reports", "admin"],
    features: [
      "Multi-currency ledgers with exchange gain/loss",
      "Receivable / payable ageing and follow-up lists",
      "Tax templates and compliant invoice formats",
      "Budget vs. actual control per cost centre",
      "Bank reconciliation and payment entries",
      "Cash-flow, P&L, balance sheet and trial balance",
    ],
    tone: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  {
    id: "services",
    label: "Services & Consulting",
    icon: Handshake,
    tagline: "Project revenue tied to effort delivered",
    summary:
      "Pipeline, projects, timesheets and retainer invoicing for service businesses that bill on time and materials.",
    modules: ["crm", "hr", "selling", "accounting", "workflow"],
    features: [
      "Lead-to-project conversion with deal tracking",
      "Timesheets feeding billable and non-billable hours",
      "Milestone and retainer billing",
      "Resource utilisation and margin per project",
      "Expense claims and reimbursement workflow",
      "Contract-to-cash reporting",
    ],
    tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    id: "healthcare",
    label: "Hospitals & Clinics",
    icon: Stethoscope,
    tagline: "One patient record from registration to final bill",
    summary:
      "Registration, OPD queue, clinical documentation, pharmacy, laboratory and inpatient billing — with the same ledger the finance team closes on.",
    modules: ["hospital", "stock", "accounting", "hr", "crm", "workflow", "reports"],
    features: [
      "Patient registration with unique medical record number",
      "OPD appointments, token queue and doctor schedules",
      "Clinical notes, diagnoses, prescriptions and service orders",
      "Pharmacy stock with batch and expiry control",
      "Laboratory orders, results and report delivery",
      "IPD admissions, bed allocation and discharge billing",
    ],
    tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "education",
    label: "Schools & Institutes",
    icon: GraduationCap,
    tagline: "Admissions to fee collection on a single student ledger",
    summary:
      "Enrol students, run attendance and timetables, publish results and collect fees — with concessions, arrears and reminders handled by the system.",
    modules: ["education", "accounting", "hr", "crm", "workflow", "reports"],
    features: [
      "Admission enquiries, enrolment and student records",
      "Class, section, timetable and teacher allocation",
      "Daily attendance and leave records",
      "Exams, grading schemes and printable report cards",
      "Fee schedules, invoices, concessions and fines",
      "Arrears ageing with automated reminder letters",
    ],
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    id: "infrastructure",
    label: "Datacenter & Infrastructure",
    icon: HardDrive,
    tagline: "The hardware, hypervisor and analytics stack underneath",
    summary:
      "We size, host and support the platform itself — servers, storage, virtualization and the BI layer — so the ERP runs on infrastructure we are accountable for.",
    modules: ["datacenter", "virtualization", "bi", "admin", "reports"],
    features: [
      "On-premises, colocated or managed-cloud hosting",
      "Server, storage and rack capacity planning",
      "Hypervisor deployment, VM templates and live migration",
      "High availability, snapshots and disaster-recovery drills",
      "Power, cooling and redundancy design",
      "Power BI and Grafana stack hosted alongside the ERP",
    ],
    tone: "bg-stone-500/10 text-stone-600 dark:text-stone-400",
  },
  {
    id: "hospitality",
    label: "Hotel & Restaurant",
    icon: ConciergeBell,
    tagline: "Check-in to checkout, dine-in to room service, one ledger",
    summary:
      "Front-desk bookings, POS billing for the restaurant and bar, and housekeeping status all close into the same night-audit ledger the finance team reconciles.",
    modules: ["hospitality", "pos", "stock", "accounting", "hr", "crm", "reports"],
    features: [
      "Room bookings with rate plans, check-in and check-out",
      "Restaurant and bar POS billing, split bills and room-charge",
      "Housekeeping status by room, floor and shift",
      "F&B and amenity stock with wastage tracking",
      "Guest profiles, preferences and repeat-stay history",
      "Night audit, occupancy and RevPAR reporting",
    ],
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "realestate",
    label: "Real Estate",
    icon: KeyRound,
    tagline: "From booking to possession, on one property ledger",
    summary:
      "Track units, plots and projects from booking through instalments, transfer and possession, with commission and cost tied to the same project ledger.",
    modules: ["realestate", "crm", "accounting", "workflow", "reports"],
    features: [
      "Project, block and unit / plot inventory",
      "Booking, allotment and buyer-wise instalment schedules",
      "Broker and agent commission tracking",
      "Construction-linked payment plans with demand notices",
      "Transfer, possession and handover documentation",
      "Project-wise cost, collection and receivable ageing",
    ],
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
];

/* ------------------------------------------------------------------ *
 * Business intelligence — the platforms we ship on top of ERP data.
 * ------------------------------------------------------------------ */

export interface BiPlatform {
  id: string;
  name: string;
  role: string;
  icon: LucideIcon;
  summary: string;
  features: string[];
  tone: string;
  /** Short "how it connects" line rendered under the card header. */
  connection: string;
}

export const BI_PLATFORMS: BiPlatform[] = [
  {
    id: "powerbi",
    name: "Microsoft Power BI",
    role: "Executive & financial analytics",
    icon: Gauge,
    summary:
      "A governed semantic model on top of ERPNext. Leadership gets board-ready dashboards on desktop and mobile; finance drills from any KPI through to the voucher behind it.",
    features: [
      "Star-schema model built from ERPNext SQL views and REST endpoints",
      "Executive dashboards: sales, purchase, margin, cash and stock ageing",
      "Drill-through from any number down to the source document",
      "Row-level security mirroring ERP roles and company access",
      "Scheduled refresh with email and Teams subscriptions",
      "Budget vs. actual, what-if costing and currency scenarios",
    ],
    connection: "ERPNext SQL views → Power BI dataset → scheduled refresh",
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "grafana",
    name: "Grafana",
    role: "Real-time operations monitoring",
    icon: Activity,
    summary:
      "Live panels over a read replica of the ERP database. Operations see a stuck shipment, a lapsed LC or a queue backup while it is still fixable — not in the month-end review.",
    features: [
      "Real-time panels on shipment, LC and production milestones",
      "Threshold and anomaly alerting to email, Slack or Telegram",
      "Stock-out, credit-limit and SLA breach watchlists",
      "Platform health: database, workers, queues and sync lag",
      "Panels embeddable inside the ERP UI through signed URLs",
      "Time-series history retained beyond transactional tables",
    ],
    connection: "ERP database read replica → Grafana SQL data source",
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
];

/** Source → model → visualise → act, rendered as a pipeline strip. */
export const BI_PIPELINE: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Database,
    title: "Extract",
    description: "Read-only SQL views and API endpoints — never writes into production tables.",
  },
  {
    icon: CircuitBoard,
    title: "Model",
    description: "A documented star schema with one agreed definition per metric.",
  },
  {
    icon: Eye,
    title: "Visualise",
    description: "Power BI for analysis, Grafana for live operations and alerting.",
  },
  {
    icon: Bell,
    title: "Act",
    description: "Scheduled digests, threshold alerts and follow-up tasks raised in the ERP.",
  },
];

/** Data-governance points shown beside the BI cards. */
export const BI_GOVERNANCE: { icon: LucideIcon; label: string }[] = [
  { icon: Lock, label: "Read-only replica for analytics" },
  { icon: ShieldCheck, label: "Access mirrored from ERP roles" },
  { icon: Server, label: "Virtualized, highly-available deployment" },
  { icon: Cloud, label: "Refresh schedules you control" },
  { icon: Route, label: "Data lineage on every metric" },
  { icon: Boxes, label: "No duplication of the system of record" },
];

/* ------------------------------------------------------------------ *
 * Illustrative chart data for the hero and BI previews. Static sample
 * numbers only — the page labels them as a preview.
 * ------------------------------------------------------------------ */

export const HERO_TREND: { month: string; shipments: number; margin: number }[] = [
  { month: "Jan", shipments: 42, margin: 18 },
  { month: "Feb", shipments: 51, margin: 21 },
  { month: "Mar", shipments: 47, margin: 19 },
  { month: "Apr", shipments: 63, margin: 24 },
  { month: "May", shipments: 58, margin: 22 },
  { month: "Jun", shipments: 72, margin: 27 },
];

export const HERO_KPIS: { label: string; value: string; delta: string; up: boolean }[] = [
  { label: "Open shipments", value: "24", delta: "+3", up: true },
  { label: "LCs in transit", value: "9", delta: "-1", up: false },
  { label: "Stock value", value: "$1.42M", delta: "+6.4%", up: true },
];

export const BI_MOCK_SERIES: { day: string; docs: number; alerts: number }[] = [
  { day: "Mon", docs: 118, alerts: 3 },
  { day: "Tue", docs: 132, alerts: 5 },
  { day: "Wed", docs: 127, alerts: 2 },
  { day: "Thu", docs: 146, alerts: 6 },
  { day: "Fri", docs: 158, alerts: 4 },
  { day: "Sat", docs: 96, alerts: 1 },
  { day: "Sun", docs: 41, alerts: 0 },
];

/* ------------------------------------------------------------------ *
 * Dashboard snapshots
 *
 * The shipped dashboards, one card each: three headline figures, a chart
 * and the questions the screen answers. Numbers are illustrative samples
 * (static, no API calls) and the page marks them as previews.
 * ------------------------------------------------------------------ */

/** KPI tile on a dashboard snapshot. */
export interface DashboardKpi {
  label: string;
  value: string;
  delta: string;
  up: boolean;
}

/** Chart config — a discriminated union so the renderer can narrow on `kind`. */
export type DashboardChart =
  | {
      kind: "bar";
      caption: string;
      xKey: string;
      data: Record<string, string | number>[];
      series: { key: string; label: string }[];
    }
  | {
      kind: "area";
      caption: string;
      xKey: string;
      data: Record<string, string | number>[];
      series: { key: string; label: string }[];
    }
  | {
      kind: "donut";
      caption: string;
      slices: { label: string; value: number }[];
    };

export interface Dashboard {
  id: string;
  label: string;
  icon: LucideIcon;
  subtitle: string;
  description: string;
  kpis: DashboardKpi[];
  chart: DashboardChart;
  /** What this screen lets a user decide. */
  insights: string[];
  tone: string;
  /** Where the live dashboard lives in the app (sign-in required). */
  href?: string;
}

export const DASHBOARDS: Dashboard[] = [
  {
    id: "executive",
    label: "Executive dashboard",
    icon: Gauge,
    href: "/dashboard",
    subtitle: "The whole mill on one screen, Jul–Jun fiscal year",
    description:
      "The first screen an owner opens: sales, profit, cash, stock, production and people in glance cards, each one a click away from the documents behind it — with plain-language insights on what changed.",
    kpis: [
      { label: "Net sales", value: "₨7.08bn", delta: "+12.4%", up: true },
      { label: "Net profit", value: "₨204M", delta: "3.1% margin", up: true },
      { label: "Cash & bank", value: "₨121M", delta: "4 days cover", up: false },
    ],
    chart: {
      kind: "area",
      caption: "Net sales by month (₨ M)",
      xKey: "month",
      data: [
        { month: "Jul", sales: 548 }, { month: "Aug", sales: 612 }, { month: "Sep", sales: 575 }, { month: "Oct", sales: 603 },
        { month: "Nov", sales: 590 }, { month: "Dec", sales: 628 }, { month: "Jan", sales: 566 }, { month: "Feb", sales: 581 },
        { month: "Mar", sales: 619 }, { month: "Apr", sales: 597 }, { month: "May", sales: 588 }, { month: "Jun", sales: 570 },
      ],
      series: [{ key: "sales", label: "Net sales" }],
    },
    insights: [
      "Glance cards for every department with sparklines",
      "Click any card for the invoices, orders or entries behind it",
      "Plain-language insights ranked critical → positive",
      "Fiscal-year, quarter and custom periods; company switcher",
    ],
    tone: "bg-primary/10 text-primary",
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: Landmark,
    href: "/accounting",
    subtitle: "Income, expenses, margin, cash and ageing",
    description:
      "Where the money came from and went: income vs expenses by month, expenses by group and account, receivable and payable ageing buckets by party, and cash & bank balances.",
    kpis: [
      { label: "Income", value: "₨6.62bn", delta: "+10.8%", up: true },
      { label: "Expenses", value: "₨6.42bn", delta: "+11.3%", up: false },
      { label: "Net margin", value: "3.1%", delta: "-0.4pt", up: false },
    ],
    chart: {
      kind: "donut",
      caption: "Expenses by group (₨ M)",
      slices: [
        { label: "Cost of sale", value: 3755 },
        { label: "Utilities", value: 991 },
        { label: "Salaries & wages", value: 702 },
        { label: "Store consumption", value: 271 },
        { label: "Selling & distribution", value: 251 },
        { label: "Other", value: 447 },
      ],
    },
    insights: [
      "Receivables vs payables ageing to 365+ days, per customer and supplier",
      "Top expense accounts as a horizontal bar gauge",
      "Days sales outstanding and liquidity warnings",
      "Every figure drills down to its GL entries",
    ],
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "financials",
    label: "Financial statements",
    icon: Scale,
    href: "/accounting/reports/balance-sheet",
    subtitle: "Balance sheet, P&L, cash flow, trial balance, general ledger",
    description:
      "ERPNext's own statements with an insight header on each: ratios, working capital, cash cover, wrong-side balances — and summary cards that drill into the accounts and on to the ledger.",
    kpis: [
      { label: "Total assets", value: "₨1.00bn", delta: "+6.2%", up: true },
      { label: "Current ratio", value: "1.34×", delta: "+0.08", up: true },
      { label: "Working capital", value: "₨239M", delta: "+₨31M", up: true },
    ],
    chart: {
      kind: "donut",
      caption: "Where the assets sit (₨ M)",
      slices: [
        { label: "Inventory", value: 275 },
        { label: "Cash & bank", value: 121 },
        { label: "Receivables", value: 30 },
        { label: "Fixed assets", value: 74 },
        { label: "Other current", value: 504 },
      ],
    },
    insights: [
      "Current / quick ratio, debt-to-equity and working capital",
      "Cash in vs out by month, operating / investing / financing split",
      "Summary by account with Dr/Cr and share of activity",
      "Click any card for the accounts, then straight into the ledger",
    ],
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    id: "buying",
    label: "Buying analysis",
    icon: ShoppingCart,
    href: "/analytics/suite/purchase",
    subtitle: "Spend, suppliers, buying cycle and price variance",
    description:
      "Purchases, top suppliers and the full buying cycle — request → order → receipt → invoice in days, PO coverage, vendor rate variation against tolerance and purchase price variance.",
    kpis: [
      { label: "Purchases", value: "₨4.19bn", delta: "+8.7%", up: false },
      { label: "Buying cycle", value: "16.7 days", delta: "-2.1 d", up: true },
      { label: "On-time receipts", value: "75.7%", delta: "+4.3pt", up: true },
    ],
    chart: {
      kind: "bar",
      caption: "Buying cycle stages (days)",
      xKey: "stage",
      data: [
        { stage: "Request → order", days: 8.9 },
        { stage: "Order → receipt", days: 4.3 },
        { stage: "Receipt → invoice", days: 3.5 },
      ],
      series: [{ key: "days", label: "Days" }],
    },
    insights: [
      "Item-wise cycle days, quick purchases and odd cases",
      "Rates above / within / below tolerance per vendor",
      "Purchase price variance (PPV) by item and supplier",
      "Who entered documents out of order",
    ],
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "sales",
    label: "Sales analysis",
    icon: Handshake,
    href: "/analytics/suite/sales",
    subtitle: "Sales, order book and deliveries on one page",
    description:
      "Net sales, customers and yarn counts, then the order book (fulfilment, OTIF, overdue orders) and deliveries — one page with a quick navigation panel.",
    kpis: [
      { label: "Net sales", value: "₨7.08bn", delta: "+12.4%", up: true },
      { label: "Invoices", value: "4,928", delta: "+6.9%", up: true },
      { label: "Average rate", value: "₨212.5/lb", delta: "+3.1%", up: true },
    ],
    chart: {
      kind: "bar",
      caption: "Sales by quarter (₨ M)",
      xKey: "quarter",
      data: [
        { quarter: "Q1", sales: 1735 }, { quarter: "Q2", sales: 1821 }, { quarter: "Q3", sales: 1766 }, { quarter: "Q4", sales: 1755 },
      ],
      series: [{ key: "sales", label: "Net sales" }],
    },
    insights: [
      "Top customers and items, with concentration risk",
      "Order-book ageing, OTIF and overdue lines",
      "Delivery lead time from order to dispatch",
      "Gross margin per order, delivery and invoice",
    ],
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    id: "trade",
    label: "Import & export",
    icon: Globe,
    href: "/analytics/suite/trade",
    subtitle: "LCs, shipments, packing and landed cost",
    description:
      "Export orders by destination, letters of credit and their deadlines, shipment status from booking to delivery — and on the import side the landed cost uplift with Pakistan duties and adjustable taxes.",
    kpis: [
      { label: "Export orders", value: "₨1.97bn", delta: "21.4% of sales", up: true },
      { label: "Destinations", value: "12", delta: "+2", up: true },
      { label: "Import landing uplift", value: "18.0%", delta: "-1.2pt", up: true },
    ],
    chart: {
      kind: "donut",
      caption: "Export shipments by status",
      slices: [
        { label: "Closed", value: 485 },
        { label: "Arrived", value: 262 },
        { label: "Delivered", value: 249 },
        { label: "In transit", value: 87 },
        { label: "Booking / stuffing", value: 31 },
      ],
    },
    insights: [
      "Open LC value and days to LC expiry / latest shipment",
      "Packing lists with cartons, weights and container fill",
      "Customs duty vs adjustable sales / income tax per shipment",
      "Import cost sheets feeding landed cost vouchers",
    ],
    tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    id: "production",
    label: "Production",
    icon: Factory,
    href: "/production",
    subtitle: "Output, yield, cost per spindle, work orders and job cards",
    description:
      "Planned vs produced, yield and waste, OPS and downtime, cost per spindle — then work-order adherence and job-card efficiency by operation, plus a Gantt of every production plan.",
    kpis: [
      { label: "Plan achievement", value: "95.7%", delta: "+1.4pt", up: true },
      { label: "Actual yield", value: "95.3%", delta: "+0.4pt", up: true },
      { label: "WO on time", value: "99.7%", delta: "+0.6pt", up: true },
    ],
    chart: {
      kind: "bar",
      caption: "Planned vs produced (M lb), by quarter",
      xKey: "quarter",
      data: [
        { quarter: "Q1", planned: 5.9, produced: 5.7 }, { quarter: "Q2", planned: 6.1, produced: 5.8 },
        { quarter: "Q3", planned: 5.8, produced: 5.5 }, { quarter: "Q4", planned: 5.8, produced: 5.6 },
      ],
      series: [{ key: "planned", label: "Planned" }, { key: "produced", label: "Produced" }],
    },
    insights: [
      "Bottleneck operations and least efficient machines",
      "Queue wait, process loss and rework by operation",
      "Machine availability × efficiency and stoppage reasons",
      "Plan → work order → job card timeline (Gantt)",
    ],
    tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  {
    id: "stock",
    label: "Stock",
    icon: Warehouse,
    href: "/analytics/stock",
    subtitle: "Stock value, movements and balances",
    description:
      "Inward vs outward value by month, the highest-value items and warehouses, stock turnover, and a live balance per item and warehouse with reserved, ordered and projected quantities.",
    kpis: [
      { label: "Stock value", value: "₨711M", delta: "+3.8%", up: false },
      { label: "Items in stock", value: "1,197", delta: "+42", up: true },
      { label: "Stock entries", value: "33,874", delta: "+9.5%", up: true },
    ],
    chart: {
      kind: "bar",
      caption: "Inward vs outward value by quarter (₨ bn)",
      xKey: "quarter",
      data: [
        { quarter: "Q1", inward: 2.0, outward: 1.9 }, { quarter: "Q2", inward: 2.1, outward: 2.0 },
        { quarter: "Q3", inward: 2.0, outward: 2.0 }, { quarter: "Q4", inward: 2.1, outward: 2.1 },
      ],
      series: [{ key: "inward", label: "Inward" }, { key: "outward", label: "Outward" }],
    },
    insights: [
      "Stock cover in days per item",
      "Slow and non-moving stock by warehouse",
      "Reconciliation differences by count",
      "Batches, serial numbers and pick lists",
    ],
    tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    id: "quality",
    label: "QA / QC",
    icon: ShieldCheck,
    href: "/quality",
    subtitle: "Inspections, lab results and non-conformances",
    description:
      "Incoming fibre and outgoing yarn inspections with lab parameters, acceptance and right-first-time rates, rejected lots, non-conformances and corrective actions.",
    kpis: [
      { label: "Acceptance rate", value: "96.5%", delta: "+0.9pt", up: true },
      { label: "Yarn right first time", value: "95.4%", delta: "+1.1pt", up: true },
      { label: "Rejected lots", value: "98", delta: "-14", up: true },
    ],
    chart: {
      kind: "donut",
      caption: "Inspections by result",
      slices: [
        { label: "Accepted", value: 2733 },
        { label: "Rejected", value: 98 },
      ],
    },
    insights: [
      "Parameter-level failures (count CV%, strength, hairiness)",
      "Supplier quality for incoming fibre",
      "Open non-conformances and overdue actions",
      "Quality goals and review outcomes",
    ],
    tone: "bg-lime-500/10 text-lime-700 dark:text-lime-400",
  },
  {
    id: "people",
    label: "HR & payroll",
    icon: Workflow,
    href: "/analytics/hr",
    subtitle: "Headcount, joiners, leavers, attendance and payroll cost",
    description:
      "Headcount by department, joiners and leavers with attrition, attendance, and the payroll cost behind it — gross, deductions and net pay by month and department.",
    kpis: [
      { label: "Active employees", value: "935", delta: "-221", up: false },
      { label: "Attrition", value: "24.1%", delta: "+3.2pt", up: false },
      { label: "Gross pay", value: "₨690M", delta: "+7.4%", up: false },
    ],
    chart: {
      kind: "bar",
      caption: "Joiners vs leavers by quarter",
      xKey: "quarter",
      data: [
        { quarter: "Q1", joiners: 24, leavers: 71 }, { quarter: "Q2", joiners: 18, leavers: 80 },
        { quarter: "Q3", joiners: 16, leavers: 74 }, { quarter: "Q4", joiners: 18, leavers: 72 },
      ],
      series: [{ key: "joiners", label: "Joiners" }, { key: "leavers", label: "Leavers" }],
    },
    insights: [
      "Attrition by department and tenure",
      "Attendance rate and absenteeism",
      "Payroll cost by department and component",
      "Deduction ratio and net pay trend",
    ],
    tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    id: "assets",
    label: "Assets",
    icon: Building2,
    href: "/analytics/assets",
    subtitle: "Asset value, depreciation and maintenance",
    description:
      "Gross value, net book value and depreciation by category and location, with movements and repairs — so capital spend and machine age are in plain view.",
    kpis: [
      { label: "Gross asset value", value: "₨139.7M", delta: "+₨4.1M", up: true },
      { label: "Net book value", value: "₨73.6M", delta: "-₨15.4M", up: false },
      { label: "Depreciation", value: "₨19.5M", delta: "99.5% posted", up: true },
    ],
    chart: {
      kind: "donut",
      caption: "Net book value by category (₨ M)",
      slices: [
        { label: "Plant & machinery", value: 48.2 },
        { label: "Building", value: 12.9 },
        { label: "Electrical", value: 7.1 },
        { label: "Vehicles & other", value: 5.4 },
      ],
    },
    insights: [
      "Depreciation schedule and posting status",
      "Assets by location and custodian",
      "Repairs and their cost per asset",
      "Fully depreciated but still in use",
    ],
    tone: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  },
];

/* ------------------------------------------------------------------ *
 * Pricing — two real paths, not invented numbers. Self-hosting is free
 * because ERPNext's GPLv3 licence makes it so; the managed path is a
 * scoped quote because implementation cost genuinely depends on modules,
 * users and hosting choice, not a one-size list price.
 * ------------------------------------------------------------------ */

export interface PricingTier {
  id: string;
  name: string;
  icon: LucideIcon;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const PRICING: PricingTier[] = [
  {
    id: "self-hosted",
    name: "Self-Hosted",
    icon: Server,
    price: "Free",
    period: "forever, GNU GPLv3",
    description:
      "Run ERPNext yourself. Install it on your own server or datacenter with every module unlocked and no per-user licence fee.",
    features: [
      "All modules, unlimited users",
      "Full source code (GNU GPLv3)",
      "Your data, your infrastructure",
      "Community forum support",
      "Upgrade on your own schedule",
    ],
    cta: "Talk to us about self-hosting",
  },
  {
    id: "managed",
    name: "Managed by MicroMax",
    icon: Handshake,
    price: "Custom",
    period: "scoped to your modules & users",
    description:
      "We implement, host and support ERPNext end-to-end — on our datacenter or yours — with the Power BI and Grafana layer built in from day one.",
    features: [
      "Implementation, data migration & training",
      "Datacenter hosting or virtualized deployment",
      "Power BI + Grafana analytics included",
      "Annual Maintenance Contract (AMC)",
      "Direct line to the team that built it",
    ],
    cta: "Talk to sales",
    highlighted: true,
  },
];

/* ------------------------------------------------------------------ *
 * FAQ — the questions a prospect actually asks before a demo call.
 * ------------------------------------------------------------------ */

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: "Is MicroMax ERP open source?",
    answer:
      "Yes. The platform is built on ERPNext, licensed under the GNU GPLv3. You can read the source, self-host it, and you are never locked into a proprietary data format.",
  },
  {
    question: "Can I host it myself, or does it have to run on your servers?",
    answer:
      "Either. Run it on your own hardware or datacenter with zero licence fees, or let us host and manage it on our infrastructure — the software is identical either way.",
  },
  {
    question: "What modules are included?",
    answer:
      "All of them: Import & Export, Buying, Selling, Production, Inventory, Accounting, CRM, HR & Payroll, POS, Hospital & Clinic, Education and more — switched on per company and per role, so each business unit sees only what concerns it.",
  },
  {
    question: "Do you help with implementation and training?",
    answer:
      "Yes. Implementation, data migration and user training are delivered by our own team — the same people who build and maintain the platform — followed by an Annual Maintenance Contract (AMC).",
  },
  {
    question: "How does the Power BI / Grafana analytics layer work?",
    answer:
      "We publish read-only views from ERPNext — never writing into production tables — into a governed Power BI model for executive reporting, and Grafana panels for real-time operational monitoring and alerts.",
  },
  {
    question: "Who owns the data?",
    answer:
      "You do. Deploy on your own infrastructure, keep your own read replicas for analytics, and export everything at any time — nothing is locked behind a proprietary export format.",
  },
  {
    question: "Can I migrate from Excel, Tally, QuickBooks or another ERP?",
    answer:
      "Yes — data migration is part of the standard implementation. We map your existing masters, ledgers and open transactions into ERPNext before go-live.",
  },
  {
    question: "What if I only need one or two modules, like Accounting or POS?",
    answer:
      "Modules are switched on per company, so you can start with just what you need — Accounting and POS, for instance — and turn on Production, CRM or Hospital later without a re-implementation.",
  },
];
