import {
  Award,
  Building2,
  Calculator,
  ChartColumn,
  ClipboardCheck,
  Code,
  Cog,
  Factory,
  Globe,
  Hammer,
  Landmark,
  ListTree,
  PackageOpen,
  PackagePlus,
  PiggyBank,
  ReceiptText,
  ScanBarcode,
  Scale,
  Ship,
  ShoppingCart,
  SlidersHorizontal,
  SquarePlus,
  Store,
  Truck,
  UserCheck,
  UserCog,
  Users,
  Warehouse,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Hero honeycomb — data for the hex module ring, plug cells and aura.
 * Layout and slot positions come from the hero of website-micromax.html
 * (`pos` refers to lattice rules in hero-honeycomb.css); the modules
 * shown are this ERP's own. Hover-card features live in
 * hero-honeycomb-tips.ts, keyed by `title`.
 * ------------------------------------------------------------------ */

export interface HexCell {
  /** Lattice slot, e.g. "a1" -> `.hc-pos-a1`. */
  pos: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  /** One or two short lines shown on the flipped face. */
  back: string[];
}

export const HEX_CELLS: HexCell[] = [
  // Cluster A — shop floor and production planning
  { pos: "a1", icon: Hammer, title: "Job Cards", sub: "", back: ["Shop", "Floor"] },
  { pos: "a2", icon: ListTree, title: "BOM", sub: "", back: ["Multi-level", "BOM"] },
  { pos: "a3", icon: Cog, title: "WO", sub: "", back: ["Work", "Orders"] },
  { pos: "a4", icon: Users, title: "CRM", sub: "pipeline", back: ["Leads", "& deals"] },
  { pos: "ppc", icon: Factory, title: "PPC", sub: "", back: ["Production", "Planning"] },
  { pos: "mrq", icon: PackagePlus, title: "MRQ", sub: "", back: ["Material", "Request"] },
  // Cluster B — trade, buying, selling and costing
  { pos: "b1", icon: Ship, title: "LCV", sub: "", back: ["Landed Cost", "Voucher"] },
  { pos: "b2", icon: ReceiptText, title: "Invoicing", sub: "", back: ["Supplier", "Ledger"] },
  { pos: "b3", icon: Calculator, title: "Costing", sub: "", back: ["Import", "Cost Sheet"] },
  { pos: "b4", icon: Workflow, title: "Approvals", sub: "", back: ["Workflow &", "Alerts"] },
  { pos: "b5", icon: ClipboardCheck, title: "RFQ", sub: "", back: ["Compare", "Quotes"] },
  { pos: "b6", icon: ShoppingCart, title: "Selling", sub: "", back: ["Customer", "Ledger"] },
  { pos: "b8", icon: ClipboardCheck, title: "PO", sub: "", back: ["Purchase", "Order"] },
  { pos: "stocks", icon: Globe, title: "Import", sub: "", back: ["LC", "Proforma"] },
  // Cluster C — stock, delivery and people
  { pos: "c1", icon: Truck, title: "Delivery", sub: "", back: ["Delivery", "Notes"] },
  { pos: "c2", icon: ScanBarcode, title: "Batches", sub: "", back: ["Batch &", "Serial"] },
  { pos: "c3", icon: UserCheck, title: "HR", sub: "", back: ["Attendance", "& Payroll"] },
  { pos: "c4", icon: PackageOpen, title: "Packing", sub: "", back: ["Export", "Packing"] },
  { pos: "c5", icon: Warehouse, title: "Stocks", sub: "", back: ["Warehouse"] },
  { pos: "fin", icon: Scale, title: "Financial", sub: "", back: ["P&L /", "Balance Sheet"] },
  // Cluster D — retail, assets and finance
  { pos: "d1", icon: Store, title: "POS", sub: "", back: ["Counter", "Sales"] },
  { pos: "d6", icon: Building2, title: "Assets", sub: "", back: ["Fixed", "Assets"] },
  { pos: "d2", icon: Award, title: "Quality", sub: "QA · QC", back: ["Defects", "& audits"] },
  { pos: "d3", icon: PiggyBank, title: "Budgets", sub: "", back: ["Cost", "Centres"] },
  { pos: "d4", icon: ChartColumn, title: "Reporting", sub: "exports", back: ["Stock & GL", "ledgers"] },
  { pos: "d5", icon: UserCog, title: "Admin", sub: "", back: ["Roles &", "Audit"] },
  { pos: "banks", icon: Landmark, title: "Banks", sub: "", back: ["Receipts /", "Payments"] },
];

export interface HexPlug {
  n: 1 | 2 | 3;
  icon: LucideIcon;
  title: string;
  sub: string;
  label: string;
}

/** The green "bring your own module" column to the right of the city. */
export const HEX_PLUGS: HexPlug[] = [
  { n: 1, icon: SlidersHorizontal, title: "Custom", sub: "plug-in", label: "Custom module - plug in your own" },
  { n: 2, icon: SquarePlus, title: "Your module", sub: "add your own", label: "Add your own module - build it on the platform" },
  { n: 3, icon: Code, title: "Build", sub: "SDK · API", label: "Build a module with the SDK and API" },
];

/** Empty hexes growing out of the hub (`--col`, `--row`, delay, opacity). */
export const AURA: { side: "top" | "bottom" | "left"; hexes: [number, number, string, number][] }[] = [
  {
    side: "top",
    hexes: [
      [0, 0, ".18s", 0.4],
      [-1, -1, ".28s", 0.32],
      [0, -2, ".34s", 0.42],
      [1, -3, ".42s", 0.44],
      [2, -2, ".46s", 0.34],
      [1, -5, ".50s", 0.46],
      [2, -6, ".60s", 0.48],
    ],
  },
  {
    side: "bottom",
    hexes: [
      [0, 0, ".18s", 0.4],
      [-1, 1, ".28s", 0.32],
      [0, 2, ".34s", 0.42],
      [1, 3, ".42s", 0.44],
      [2, 2, ".46s", 0.34],
      [1, 5, ".50s", 0.46],
      [2, 6, ".60s", 0.48],
    ],
  },
  {
    side: "left",
    hexes: [
      [0, 0, ".24s", 0.36],
      [0, -2, ".34s", 0.3],
      [0, 2, ".34s", 0.3],
    ],
  },
];
