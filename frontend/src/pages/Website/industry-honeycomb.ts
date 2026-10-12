import {
  Building2,
  Coins,
  Factory,
  Globe,
  Handshake,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Industry honeycomb — discipline groups and the layout maths.
 *
 * Ported from the "One platform, shaped to how you build" section of
 * website-micromax.html: modules are grouped into coloured disciplines
 * and laid out as a rosette around the middle of the stage, band by
 * band, nearest first. The groups and short names are this ERP's own.
 * ------------------------------------------------------------------ */

export interface HexGroup {
  label: string;
  color: string;
  icon: LucideIcon;
}

export const HEX_GROUPS: Record<string, HexGroup> = {
  trade: { label: "Trade", color: "#f59e0b", icon: Globe },
  commercial: { label: "Buy & Sell", color: "#f43f5e", icon: Handshake },
  operations: { label: "Operations", color: "#06b6d4", icon: Factory },
  finance: { label: "Finance", color: "#22c55e", icon: Coins },
  control: { label: "Control & People", color: "#6366f1", icon: ShieldCheck },
  sector: { label: "Sector", color: "#8b5cf6", icon: Building2 },
  platform: { label: "Platform", color: "#eab308", icon: Server },
};

/** Canonical order, used to hand modules out group by group. */
export const GROUP_ORDER = ["trade", "commercial", "operations", "finance", "control", "sector", "platform"];

/** Group and the short label drawn inside the hexagon, keyed by module id (see MODULES in website-data.ts). */
export const MODULE_HEX: Record<string, { group: string; short: string }> = {
  trade: { group: "trade", short: "Import & Export" },
  landed: { group: "trade", short: "Landed Cost" },
  buying: { group: "commercial", short: "Buying" },
  selling: { group: "commercial", short: "Selling" },
  crm: { group: "commercial", short: "CRM" },
  pos: { group: "commercial", short: "POS" },
  production: { group: "operations", short: "Production" },
  stock: { group: "operations", short: "Inventory" },
  accounting: { group: "finance", short: "Accounting" },
  reports: { group: "finance", short: "Reports" },
  workflow: { group: "control", short: "Approvals" },
  admin: { group: "control", short: "Admin" },
  hr: { group: "control", short: "HR" },
  hospital: { group: "sector", short: "Hospital" },
  education: { group: "sector", short: "Education" },
  hospitality: { group: "sector", short: "Hotel" },
  realestate: { group: "sector", short: "Real Estate" },
  bi: { group: "platform", short: "BI" },
  datacenter: { group: "platform", short: "Datacenter" },
  virtualization: { group: "platform", short: "Virtual" },
};

/** Readable text colour (dark or white) for a filled cell of the given #rrggbb colour. */
export function onInk(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0b1220" : "#ffffff";
}

/* ---- Honeycomb geometry (flat-top hexagons) ---- */
export const HEXW = 96;
export const HEXH = 83;
export const HEXPAD = 6;
const COLSTEP = 72;
const ROWSTEP = 83;
/** Rings the centre flower covers: the middle cell and its six neighbours. */
const CORE_RINGS = 1;
/** Lattice width of the centre flower (240 less the inset the cells carry). */
export const FIG_W = 234;
const PADX = 18;
const PADY = 12;
export const STAGE_PAD = 16;
/** Ceiling on cell size, so a small industry doesn't blow its few cells up. */
export const MAXSCALE = 1.28;

interface Site {
  px: number;
  py: number;
  ang: number;
}

interface Placed {
  px: number;
  py: number;
  band: number;
  within: number;
}

export interface HexCellModel {
  key: string;
  gid: string;
  /** Centre of the cell, relative to the middle of the comb. */
  cx: number;
  cy: number;
  band: number;
  within: number;
}

export interface HexLayout {
  cells: HexCellModel[];
  /** Canvas size the comb is drawn at, before it is scaled into the stage. */
  width: number;
  height: number;
}

/** Every lattice site outside the centre flower, in axial coordinates, far enough out to hold `n` cells. */
function latticeSites(n: number): Site[] {
  const core = 3 * CORE_RINGS * CORE_RINGS + 3 * CORE_RINGS + 1;
  let rings = CORE_RINGS + 1;
  while (3 * rings * rings + 3 * rings + 1 - core < n) rings++;
  rings += 2;
  const out: Site[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      const d = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
      if (d > rings || d <= CORE_RINGS) continue;
      const px = COLSTEP * q;
      const py = ROWSTEP * (r + q / 2);
      const ang = Math.atan2(px, -py);
      out.push({ px, py, ang: ang < 0 ? ang + 2 * Math.PI : ang });
    }
  }
  return out;
}

/**
 * Chooses `n` sites and orders them for hand-out: nearest first, measured on an
 * ellipse `k` wide for 1 tall, cut into bands of 12, 18, 24 … and read clockwise
 * from the top, so a discipline takes an arc rather than a scatter. A band that
 * only partly fills is thinned evenly instead of filled from the top.
 */
function place(sites: Site[], n: number, k: number): Placed[] {
  const scored = sites
    .map((s) => ({ s, e: (s.px / k) * (s.px / k) + s.py * s.py }))
    .sort((a, b) => a.e - b.e || a.s.ang - b.s.ang);
  const ordered: Placed[] = [];
  let from = 0;
  let size = 6 * (CORE_RINGS + 1);
  let bandIx = 0;
  while (from < scored.length && ordered.length < n) {
    const band = scored
      .slice(from, from + size)
      .map((x) => x.s)
      .sort((a, b) => a.ang - b.ang);
    const want = Math.min(n - ordered.length, band.length);
    let use = band;
    if (want < band.length) {
      use = [];
      for (let t = 0; t < want; t++) use.push(band[Math.round((t * band.length) / want)]);
    }
    use.forEach((site, within) => ordered.push({ px: site.px, py: site.py, band: bandIx, within }));
    from += size;
    size += 6;
    bandIx++;
  }
  return ordered;
}

/** Symmetric about the middle by construction, so the flower sits at the centre of the stage. */
function extent(cells: Placed[]): { w: number; h: number } {
  let ax = 0;
  let ay = 0;
  for (const c of cells) {
    ax = Math.max(ax, Math.abs(c.px) + HEXW / 2);
    ay = Math.max(ay, Math.abs(c.py) + HEXH / 2);
  }
  return { w: 2 * ax, h: 2 * ay };
}

/** Modules of one industry as an ordered sequence: group by group, in canonical group order. */
export function moduleSequence(moduleIds: string[]): { key: string; gid: string }[] {
  const seq: { key: string; gid: string }[] = [];
  for (const gid of GROUP_ORDER) {
    for (const key of moduleIds) {
      if (MODULE_HEX[key]?.group === gid) seq.push({ key, gid });
    }
  }
  return seq;
}

/**
 * Lays the modules out around the middle and returns the scale that fits them
 * into the stage. The rosette's proportion is chosen by trying a spread and
 * keeping the one that can be drawn largest; ties go to the roundest.
 */
export function layoutHoneycomb(
  moduleIds: string[],
  stageW: number,
  stageH: number,
): { layout: HexLayout; scale: number } {
  const seq = moduleSequence(moduleIds);
  const sites = latticeSites(seq.length);
  const aspect = stageW > 0 && stageH > 0 ? Math.max(0.5, Math.min(2.6, stageW / stageH)) : 0.72;
  const availW = Math.max(1, stageW - 2 * STAGE_PAD);
  const availH = Math.max(1, stageH - 2 * STAGE_PAD);

  let best: { ordered: Placed[]; box: { w: number; h: number }; s: number; t: number } | null = null;
  for (let t = -3; t <= 3; t++) {
    const ordered = place(sites, seq.length, aspect * Math.pow(1.22, t));
    const box = extent(ordered);
    const s = Math.min(availW / (box.w + 2 * PADX), availH / (box.h + 2 * PADY), MAXSCALE);
    if (!best || s > best.s + 0.005 || (s > best.s - 0.005 && Math.abs(t) < Math.abs(best.t))) {
      best = { ordered, box, s, t };
    }
  }
  const { ordered, box } = best!;
  const cells = seq.slice(0, ordered.length).map((m, i) => ({
    key: m.key,
    gid: m.gid,
    cx: ordered[i].px,
    cy: ordered[i].py,
    band: ordered[i].band,
    within: ordered[i].within,
  }));
  const scale = Number.isFinite(best!.s) && best!.s > 0 ? best!.s : 1;
  return { layout: { cells, width: box.w + 2 * PADX, height: box.h + 2 * PADY }, scale };
}
