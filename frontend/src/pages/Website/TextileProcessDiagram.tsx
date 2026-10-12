import { useEffect, useState } from "react";
import type { ProcessStage } from "./industry-process-data";
import "./textile-process.css";

/* ------------------------------------------------------------------ *
 * Process diagram ("Option A") — a dark-teal-infographic-styled card, a
 * zigzag connector with circular joints, and one icon per stage. A glowing
 * pulse travels the connector on a loop, lighting each stage's icon as it
 * arrives, so the diagram narrates the flow on its own.
 *
 * `ProcessFlowDiagram` is the reusable version for every industry (see
 * industry-process-data.ts) — a lucide icon per stage, since a bespoke
 * hand-drawn illustration for every stage of all twelve industries isn't
 * practical. `TextileProcessDiagram` is Textile & Garments' own version,
 * kept exactly as first built (seven hand-drawn stage illustrations), since
 * it was tuned first and other call sites already import it by that name.
 * Both share the same seven-slot zigzag layout, connector and card styling.
 * ------------------------------------------------------------------ */

interface Stage {
  n: number;
  label: string;
  sub: string;
  x: number;
  y: number;
  icon: (color: string) => JSX.Element;
}

const TEAL_LINE = "#d7ece9";
const RED = "#e2483c";
const ORANGE = "#f5a623";
const GREEN = "#3fa76a";
const TEAL_ACCENT = "#3fb8b0";
const CREAM = "#f4ede1";
const NAVY = "#1a2f3a";

function CottonIcon() {
  return (
    <g>
      <path d="M0 24 Q -3 8 0 -4" stroke={GREEN} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <circle cx="-9" cy="-8" r="9" fill={CREAM} stroke="#e4d8c2" strokeWidth={1} />
      <circle cx="7" cy="-13" r="10" fill={CREAM} stroke="#e4d8c2" strokeWidth={1} />
      <circle cx="0" cy="-22" r="8" fill={CREAM} stroke="#e4d8c2" strokeWidth={1} />
      <ellipse cx="18" cy="10" rx="13" ry="10" fill="#8a8f98" opacity={0.85} />
      <ellipse cx="18" cy="10" rx="8" ry="6" fill="#a7abb2" opacity={0.7} />
    </g>
  );
}

function CollectionIcon() {
  return (
    <g>
      <rect x="-24" y="-4" width="30" height="16" rx="2" fill={RED} />
      <rect x="-24" y="-14" width="16" height="12" rx="2" fill={RED} />
      <rect x="-21" y="-11" width="9" height="7" rx="1" fill={TEAL_LINE} opacity={0.85} />
      <circle cx="-16" cy="14" r="5" fill={NAVY} />
      <circle cx="0" cy="14" r="5" fill={NAVY} />
      <circle cx="-16" cy="14" r="2" fill={TEAL_LINE} />
      <circle cx="0" cy="14" r="2" fill={TEAL_LINE} />
      <rect x="8" y="-2" width="16" height="12" rx="1.5" fill={ORANGE} />
      <rect x="10" y="2" width="12" height="3" rx="1" fill={CREAM} opacity={0.8} />
    </g>
  );
}

function ProcessingIcon() {
  return (
    <g>
      <rect x="-24" y="-14" width="48" height="30" rx="3" fill={GREEN} />
      <rect x="-20" y="-9" width="18" height="20" rx="2" fill="#2f8552" />
      <circle cx="10" cy="-2" r="8" fill={NAVY} opacity={0.7} />
      <circle cx="10" cy="-2" r="4" fill={CREAM} opacity={0.9} />
      <rect x="-20" y="18" width="40" height="4" rx="2" fill={NAVY} opacity={0.5} />
    </g>
  );
}

function ThreadsIcon() {
  const cols = [RED, ORANGE, TEAL_ACCENT];
  return (
    <g>
      {cols.map((c, i) => (
        <g key={c} transform={`translate(${(i - 1) * 15}, 0)`}>
          <rect x="-7" y="-20" width="14" height="4" rx="1.5" fill={CREAM} opacity={0.9} />
          <rect x="-9" y="-16" width="18" height="30" rx="6" fill={c} />
          <rect x="-9" y="-16" width="18" height="5" rx="2.5" fill="#00000022" />
          <rect x="-7" y="12" width="14" height="4" rx="1.5" fill={CREAM} opacity={0.9} />
        </g>
      ))}
    </g>
  );
}

function FabricIcon() {
  return (
    <g>
      <rect x="-22" y="-16" width="44" height="18" rx="2" fill={GREEN} />
      <circle cx="-14" cy="-7" r="3.5" fill={CREAM} opacity={0.85} />
      <circle cx="14" cy="-7" r="3.5" fill={CREAM} opacity={0.85} />
      <rect x="-20" y="4" width="40" height="8" fill={ORANGE} />
      <rect x="-20" y="12" width="40" height="8" fill={TEAL_ACCENT} />
      <rect x="-20" y="20" width="40" height="6" fill={RED} opacity={0.9} />
    </g>
  );
}

function TailoringIcon() {
  return (
    <g>
      <path d="M-18 14 h36 a4 4 0 0 0 4-4 v-2 a4 4 0 0 0-4-4 h-22 l-8-10 h-8 z" fill={NAVY} />
      <circle cx="16" cy="8" r="5" fill={CREAM} />
      <circle cx="16" cy="8" r="2" fill={NAVY} />
      <rect x="-24" y="14" width="48" height="5" rx="2" fill="#25404d" />
      <path d="M-6 -10 l3 10 M0 -10 l0 10 M6 -10 l-3 10" stroke={RED} strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </g>
  );
}

function GarmentIcon() {
  return (
    <g>
      <rect x="-24" y="-20" width="48" height="4" rx="2" fill={CREAM} />
      <line x1="-24" y1="-18" x2="-24" y2="4" stroke={CREAM} strokeWidth={2.5} />
      <line x1="24" y1="-18" x2="24" y2="4" stroke={CREAM} strokeWidth={2.5} />
      {[-13, 0, 13].map((cx, i) => (
        <g key={cx} transform={`translate(${cx}, 6)`}>
          <line x1="0" y1="-6" x2="0" y2="0" stroke={CREAM} strokeWidth={1.4} />
          <path
            d="M-8 0 l4 -6 h8 l4 6 v16 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 z"
            fill={[RED, ORANGE, TEAL_ACCENT][i]}
          />
        </g>
      ))}
    </g>
  );
}

// Spaced so every stage's ring + number badge + two-line label clears its
// neighbours with real margin, and the leftmost/topmost stages sit well
// clear of the viewBox edges rather than flush against the card's corner.
// This is also the generic seven-slot layout ProcessFlowDiagram reuses below
// — the zigzag shape is generic; only each stage's own content changes.
const POSITIONS: { x: number; y: number }[] = [
  { x: 140, y: 170 },
  { x: 420, y: 120 },
  { x: 700, y: 170 },
  { x: 560, y: 340 },
  { x: 210, y: 340 },
  { x: 470, y: 460 },
  { x: 750, y: 460 },
];

const STAGES: Stage[] = [
  { n: 1, label: "Raw Material", sub: "cotton & fibre", ...POSITIONS[0], icon: () => <CottonIcon /> },
  { n: 2, label: "Collection", sub: "of raw materials", ...POSITIONS[1], icon: () => <CollectionIcon /> },
  { n: 3, label: "Processing", sub: "of raw materials", ...POSITIONS[2], icon: () => <ProcessingIcon /> },
  { n: 4, label: "Threads", sub: "spun & dyed", ...POSITIONS[3], icon: () => <ThreadsIcon /> },
  { n: 5, label: "Fabric Manufacture", sub: "weaving & folding", ...POSITIONS[4], icon: () => <FabricIcon /> },
  { n: 6, label: "Tailoring", sub: "cut & sewn", ...POSITIONS[5], icon: () => <TailoringIcon /> },
  { n: 7, label: "Ready-Made Clothes", sub: "garment manufacturing", ...POSITIONS[6], icon: () => <GarmentIcon /> },
];

/** Elbow path between two stage centres — flat runs with one bend, like a circuit trace. */
function elbow(a: { x: number; y: number }, b: { x: number; y: number }): { d: string; corner: { x: number; y: number } | null } {
  const midX = (a.x + b.x) / 2;
  const corner = a.y === b.y ? null : { x: midX, y: b.y };
  return { d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`, corner };
}

const CYCLE_MS = 900;

/** The shared card/connector/pulse chrome — only the per-stage icon nodes differ between the two exports below. */
function DiagramShell({
  positioned,
  ariaLabel,
  renderIcon,
}: {
  positioned: { n: number; label: string; sub: string; x: number; y: number }[];
  ariaLabel: string;
  renderIcon: (stage: { n: number; label: string; sub: string; x: number; y: number }, index: number) => JSX.Element;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    const id = window.setInterval(() => setActive((a) => (a + 1) % positioned.length), CYCLE_MS);
    return () => window.clearInterval(id);
  }, [positioned]);

  const links = positioned.slice(1).map((stage, i) => {
    const { d, corner } = elbow(positioned[i], stage);
    return { d, corner };
  });

  return (
    <div className="tpd-scope">
      <div className="tpd-card">
        {/* Wider/taller than the stage layout itself (which still spans roughly
            0..900 x 0..580) — the extra margin on every side "zooms out" the
            diagram within the card and, since the card's height follows this
            viewBox's own aspect ratio, also makes the card noticeably shorter.
            (Margin trimmed down from an earlier, more zoomed-out pass.) */}
        <svg viewBox="-60 25 1020 565" className="tpd-svg" role="img" aria-label={ariaLabel}>
          <defs>
            <pattern id="tpdGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" className="tpd-grid-line" strokeWidth={1} />
            </pattern>
          </defs>
          <rect x="-60" y="25" width="1020" height="565" className="tpd-bg-rect" />
          <rect x="-60" y="25" width="1020" height="565" fill="url(#tpdGrid)" />

          {links.map((link, i) => (
            <g key={i}>
              <path d={link.d} className="tpd-trace" />
              <path d={link.d} className="tpd-pulse" style={{ animationDelay: `${i * (CYCLE_MS / 1000)}s` }} />
              {link.corner && <circle cx={link.corner.x} cy={link.corner.y} r={4} className="tpd-joint" />}
            </g>
          ))}

          {positioned.map((stage, i) => (
            // Position is a plain SVG `transform` attribute (translate only) —
            // simple and unambiguous. The active-state "grow" effect drives the
            // ring's own `r`, not a CSS transform: scale() on this group, because
            // that CSS transform replaces the translate attribute outright rather
            // than combining with it (SVG's transform-origin default for CSS
            // transforms is also inconsistent across engines), which was leaving
            // the active stage scaled up near the SVG's origin — the top-left
            // corner — instead of in place. `r` has no such ambiguity: it's
            // always centred on the circle's own (untransformed) position.
            <g key={stage.n} transform={`translate(${stage.x}, ${stage.y})`} className={i === active ? "tpd-stage is-active" : "tpd-stage"}>
              <circle r={i === active ? 44 : 40} className="tpd-stage-ring" />
              {renderIcon(stage, i)}
              <circle cx={-31} cy={-31} r={12} className="tpd-num-badge" />
              <text x={-31} y={-27} className="tpd-num-text" textAnchor="middle">
                {stage.n}
              </text>
              <text y={56} textAnchor="middle" className="tpd-stage-label">
                {stage.label}
              </text>
              <text y={71} textAnchor="middle" className="tpd-stage-sub">
                {stage.sub}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** Any industry's process flow (see industry-process-data.ts) — a lucide icon per stage. */
export function ProcessFlowDiagram({ stages }: { stages: ProcessStage[] }) {
  const positioned = stages.map((s, i) => ({ ...s, ...POSITIONS[i % POSITIONS.length] }));
  return (
    <DiagramShell
      positioned={positioned}
      ariaLabel={`Process: ${stages.map((s) => s.label).join(", ")}`}
      renderIcon={(stage) => {
        const match = positioned.find((p) => p.n === stage.n)!;
        const Icon = match.icon;
        return (
          <g>
            {/* A soft disc in the stage's own colour behind the icon, plus the
                icon itself in that same colour (via currentColor) — a coloured
                symbol on a coloured badge, the same idea as Textile & Garments'
                own hand-coloured icons, rather than one flat outline in the
                page's neutral ink colour for every stage. */}
            <circle r={30} fill={match.color} fillOpacity={0.16} />
            <g style={{ color: match.color }}>
              <Icon x={-19} y={-19} width={38} height={38} strokeWidth={2} />
            </g>
          </g>
        );
      }}
    />
  );
}

/** Textile & Garments' own process flow — its seven hand-drawn stage illustrations, unchanged. */
export function TextileProcessDiagram() {
  return (
    <DiagramShell
      positioned={STAGES}
      ariaLabel="Textile process: raw material, collection, processing, threads, fabric manufacture, tailoring, ready-made clothes"
      renderIcon={(stage) => {
        const match = STAGES.find((s) => s.n === stage.n)!;
        return (
          <g className="tpd-stage-icon" transform="scale(1.25)">
            {match.icon(NAVY)}
          </g>
        );
      }}
    />
  );
}
