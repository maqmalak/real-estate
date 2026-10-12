import {
  Activity,
  Anchor,
  Bell,
  BedDouble,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  CheckCheck,
  ClipboardList,
  Construction,
  CreditCard,
  DoorOpen,
  FileCheck,
  FileCog,
  FileEdit,
  FileSignature,
  FileText,
  Gauge,
  Handshake,
  HardDrive,
  KeyRound,
  Landmark,
  LifeBuoy,
  LogOut,
  PackageCheck,
  Pill,
  Receipt,
  RotateCcw,
  Route,
  ScrollText,
  Server,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * "The process, start to finish" for every industry except Textile &
 * Garments (which keeps its own bespoke hand-drawn version — see
 * TextileProcessDiagram.tsx / TextileProcessSite.tsx). Each flow is a
 * literal start-to-end operational sequence for that industry, grounded in
 * that industry's own `summary`/`features` in website-data.ts rather than
 * invented — e.g. Import & Export's stages are its LC → shipment → landed
 * cost → export chain described there.
 *
 * The same 7-tone cycle textile's own stages use, for a consistent look
 * across every industry's flow.
 * ------------------------------------------------------------------ */

const TONES = [
  "bg-green-500/20 text-green-600 dark:text-green-400",
  "bg-red-500/20 text-red-600 dark:text-red-400",
  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  "bg-orange-500/20 text-orange-600 dark:text-orange-400",
  "bg-teal-500/20 text-teal-600 dark:text-teal-400",
  "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  "bg-pink-500/20 text-pink-600 dark:text-pink-400",
] as const;

// Same 7 hues as TONES above, as plain hex — Option A renders inline SVG, so
// it can't read Tailwind's bg-*/dark: classes; this is what colours its icons
// and their ring tint (see ProcessFlowDiagram in TextileProcessDiagram.tsx),
// so each stage reads as its own coloured symbol rather than one flat outline
// in the page's ink colour, closer to Textile & Garments' own hand-coloured icons.
const COLORS = ["#16a34a", "#dc2626", "#059669", "#ea580c", "#0d9488", "#4f46e5", "#db2777"] as const;

export interface ProcessStage {
  n: number;
  label: string;
  sub: string;
  icon: LucideIcon;
  tone: string;
  color: string;
}

function flow(steps: [string, string, LucideIcon][]): ProcessStage[] {
  return steps.map(([label, sub, icon], i) => ({
    n: i + 1,
    label,
    sub,
    icon,
    tone: TONES[i % TONES.length],
    color: COLORS[i % COLORS.length],
  }));
}

/** Keyed by IndustryProfile.id (see website-data.ts) — every id except "textile". */
export const PROCESS_FLOWS: Record<string, ProcessStage[]> = {
  "import-export": flow([
    ["LC Proforma", "Bank & tenor", FileSignature],
    ["Import Shipment", "Milestones tracked", Anchor],
    ["Customs Clearance", "Duty & charges", ShieldCheck],
    ["Landed Cost", "Freight allocated", Calculator],
    ["Warehouse Receipt", "Stock in", Warehouse],
    ["Export Packing", "Buyer documents", PackageCheck],
    ["Buyer Invoice", "Multi-currency", Receipt],
  ]),
  manufacturing: flow([
    ["Material Request", "Raw stock", ClipboardList],
    ["BOM & Planning", "Multi-level", FileCog],
    ["Work Order", "Shop floor", Wrench],
    ["Production", "Machine & shift", Construction],
    ["Quality Check", "Inspection hold", ShieldCheck],
    ["Finished Goods", "WIP valued", PackageCheck],
    ["Dispatch", "To customer", Truck],
  ]),
  distribution: flow([
    ["Purchase Order", "To supplier", FileText],
    ["Warehouse Receipt", "Multi-site", Warehouse],
    ["Stock Allocation", "Batch & serial", PackageCheck],
    ["Credit Check", "Limit enforced", CreditCard],
    ["Sales Order", "Tiered pricing", ShoppingBag],
    ["Delivery Note", "Route-wise", Truck],
    ["Ageing Report", "Fast/slow movers", ChartColumn],
  ]),
  retail: flow([
    ["Stock Intake", "Barcoded", PackageCheck],
    ["Counter Sale", "Touch POS", ShoppingCart],
    ["Payment", "Cash / card", CreditCard],
    ["Returns", "Credit note", RotateCcw],
    ["Shift Close", "Cash drawer", LogOut],
    ["Online Sync", "Stock & orders", Route],
    ["Daily Report", "Multi-outlet", ChartColumn],
  ]),
  finance: flow([
    ["Journal Entry", "Multi-currency", FileEdit],
    ["Ledger Posting", "Chart of accounts", Landmark],
    ["Bank Reconciliation", "Payments matched", CheckCheck],
    ["Tax Template", "Compliant invoice", ScrollText],
    ["Budget Control", "By cost centre", Calculator],
    ["Financial Statement", "P&L, balance sheet", ChartColumn],
    ["Audit Trail", "Hours, not weeks", ShieldCheck],
  ]),
  services: flow([
    ["Lead", "Pipeline entry", Handshake],
    ["Deal", "Converted to project", FileSignature],
    ["Project Setup", "Scope & team", ClipboardList],
    ["Timesheet", "Billable hours", CalendarClock],
    ["Milestone Billing", "Or retainer", Receipt],
    ["Expense Claim", "Reimbursed", CreditCard],
    ["Margin Report", "Per project", ChartColumn],
  ]),
  healthcare: flow([
    ["Registration", "Medical record no.", UserPlus],
    ["OPD Queue", "Token & schedule", Users],
    ["Clinical Notes", "Diagnosis & Rx", Stethoscope],
    ["Pharmacy & Lab", "Batch, expiry, results", Pill],
    ["IPD Admission", "Bed allocation", BedDouble],
    ["Discharge", "Summary issued", DoorOpen],
    ["Billing", "One patient ledger", Receipt],
  ]),
  education: flow([
    ["Admission", "Enquiry to enrol", UserPlus],
    ["Class Allocation", "Timetable & teacher", CalendarCheck],
    ["Attendance", "Daily record", ClipboardList],
    ["Exams", "Grading scheme", ScrollText],
    ["Fee Invoice", "Concessions applied", Receipt],
    ["Arrears Reminder", "Automated", Bell],
    ["Report Card", "Printable", FileCheck],
  ]),
  infrastructure: flow([
    ["Capacity Planning", "Server & storage", Gauge],
    ["Hosting", "On-prem or cloud", Server],
    ["Virtualization", "VM templates", HardDrive],
    ["High Availability", "Live migration", ShieldCheck],
    ["DR Drill", "Snapshots tested", LifeBuoy],
    ["Monitoring", "Power & cooling", Activity],
    ["BI Stack", "Power BI, Grafana", ChartColumn],
  ]),
  hospitality: flow([
    ["Booking", "Rate plan", CalendarCheck],
    ["Check-in", "Front desk", DoorOpen],
    ["Room / Table Service", "POS billing", Sparkles],
    ["Housekeeping", "By room & shift", ClipboardList],
    ["F&B Stock", "Wastage tracked", PackageCheck],
    ["Night Audit", "Occupancy, RevPAR", Receipt],
    ["Check-out", "Room charge closed", LogOut],
  ]),
  realestate: flow([
    ["Project Listing", "Unit / plot inventory", Building2],
    ["Booking", "Allotment", FileSignature],
    ["Instalment Plan", "Construction-linked", CalendarClock],
    ["Demand Notice", "Payment due", Bell],
    ["Commission", "Broker tracked", Handshake],
    ["Transfer", "Documentation", FileCheck],
    ["Possession", "Handover", KeyRound],
  ]),
};
