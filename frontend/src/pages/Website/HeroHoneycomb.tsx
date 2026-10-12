import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import "./hero-honeycomb.css";
import { IndustryCity } from "./IndustryCity";
import { AURA, HEX_CELLS, HEX_PLUGS, type HexCell } from "./hero-honeycomb-data";
import { HEX_TIPS } from "./hero-honeycomb-tips";

/** Design size of the stage. It is drawn 1:1 (the size ported from the HTML) and only scaled down if its column is narrower. */
const STAGE_W = 920;
const STAGE_H = 640;
/** The stage's left edge is empty now that the team faces are gone, so it is cropped out of the layout width. */
const VIEW_LEFT = 120;
const VIEW_W = STAGE_W - VIEW_LEFT;

const TINT: CSSProperties = { "--tint": "var(--accent)" } as CSSProperties;

interface ActiveTip {
  cell: HexCell;
  rect: DOMRect;
}

/**
 * Hover card for a module cell: the list of features it covers.
 * Rendered into <body> so the stage's scaling and clipping never touch it,
 * and placed beside the cell in viewport coordinates.
 */
function HexTipCard({
  tip,
  onEnter,
  onLeave,
}: {
  tip: ActiveTip;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const features = HEX_TIPS[tip.cell.title];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { rect } = tip;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const left = Math.max(10, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 10));
    let top = rect.bottom + 10;
    if (top + height > window.innerHeight - 10) top = rect.top - height - 10;
    setPos({ left, top: Math.max(10, top) });
  }, [tip]);

  if (!features?.length) return null;

  return createPortal(
    <div
      ref={ref}
      className="hh-tip"
      role="dialog"
      aria-label={`${tip.cell.title} features`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <p className="hh-tip-h">
        <span className="dot" />
        {tip.cell.title} · features
      </p>
      <ul className="hh-tip-list">
        {features.map((item) => (
          <li key={item}>
            <span className="bul" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <a className="hh-tip-more" href="#modules">
        See all modules
      </a>
    </div>,
    document.body,
  );
}

/** Centre-left: the brand mark every other cell is arranged around. */
function Hub() {
  return (
    <div className="hero-hub">
      <Link className="hero-hub-inner" to="/home" aria-label="Open the ERP">
        <svg className="hh-hex" viewBox="0 0 152 132" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="hhGrad" x1="0" y1="0" x2="1" y2="1">
              <stop className="hh-g1" offset="0" />
              <stop className="hh-g2" offset="0.46" />
              <stop className="hh-g3" offset="1" />
            </linearGradient>
          </defs>
          <polygon className="hh-hex-fill" points="38,0 114,0 152,66 114,132 38,132 0,66" />
          <polygon
            className="hh-hex-line"
            points="38,0.8 113.6,0.8 151.2,66 113.6,131.2 38,131.2 0.8,66"
          />
        </svg>
        <span className="hero-hub-word">
          <span className="hh-line">MicroMax</span>
          <span className="hh-line hero-hub-word-light">ERP</span>
        </span>
        <span className="hero-hub-sheen" aria-hidden="true" />
        <span className="hero-hub-burst" aria-hidden="true" />
        <span className="hero-hub-flash" aria-hidden="true" />
        <span className="hero-hub-scan" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Outgoing data-flow fan: ported from the hero-flow SVG of website-micromax.html
 * — a dotted "broken" line per path (`.hh-flow-trace`) with a small glowing
 * light packet (`.hh-flow-pulse`) racing along it on a loop. The source
 * measures the hub's real DOM position at runtime and rewrites six paths on
 * every resize; here the whole stage is one fixed 920x640 canvas that gets
 * scaled as a unit (see STAGE_W/STAGE_H), so the six paths are worked out
 * once, straight from the hub's own CSS position (`.hero-hub`: left 50%,
 * top 51% of `.hh-left`, which is 540px wide) to points fanning into the
 * module ring / city on the right, in the source's own proportions.
 */
const FLOW_HUB = { x: 270 + 84.6, y: 640 * 0.46 }; // hub centre, matching .hero-hub's top: 46% in hero-honeycomb.css
const FLOW_PATHS: { d: string; gradient: "A" | "B" | "C"; delay: string }[] = [
  { d: `M ${FLOW_HUB.x} ${FLOW_HUB.y} Q 443.9 190.4, 554.4 139.4`, gradient: "A", delay: "0s" },
  { d: `M ${FLOW_HUB.x} ${FLOW_HUB.y} Q 486.4 215.9, 630.9 181.9`, gradient: "B", delay: "0.55s" },
  { d: `M ${FLOW_HUB.x} ${FLOW_HUB.y} Q 503.4 266.9, 656.4 241.4`, gradient: "C", delay: "1.1s" },
  { d: `M ${FLOW_HUB.x} ${FLOW_HUB.y} Q 503.4 385.9, 656.4 411.4`, gradient: "A", delay: "1.65s" },
  { d: `M ${FLOW_HUB.x} ${FLOW_HUB.y} Q 486.4 436.9, 630.9 470.9`, gradient: "B", delay: "2.2s" },
  { d: `M ${FLOW_HUB.x} ${FLOW_HUB.y} Q 443.9 462.4, 554.4 513.4`, gradient: "C", delay: "2.75s" },
];

/** The light fan, positioned between the ambient glow and the hub/ring so it visibly departs from behind the hub. */
function HeroFlow() {
  return (
    <svg className="hh-flow" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="hhFlowA" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="55%" stopColor="var(--accent-3)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent-3)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hhFlowB" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent-2)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--accent-2)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hhFlowC" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent-3)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--accent-3)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent-3)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="hh-flow-trace-group">
        {FLOW_PATHS.map((p, i) => (
          <path key={i} className="hh-flow-trace" d={p.d} />
        ))}
      </g>
      {FLOW_PATHS.map((p, i) => (
        <path
          key={i}
          className="hh-flow-pulse"
          d={p.d}
          stroke={`url(#hhFlow${p.gradient})`}
          style={{ animationDelay: p.delay }}
        />
      ))}
    </svg>
  );
}

/**
 * The hero visual from website-micromax.html: a hex ring of module cells
 * around a wireframe 3D city and the brand hub, each cell flipping to a
 * fuller name on hover. The CSS is that page's own (hero-honeycomb.css); this
 * component supplies the markup, scales the fixed-size stage to its
 * container, and runs the city.
 */
export function HeroHoneycomb() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, x: 0 });
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const hideTimer = useRef<number>();

  const showTip = useCallback((cell: HexCell, el: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    setTip({ cell, rect: el.getBoundingClientRect() });
  }, []);
  const holdTip = useCallback(() => window.clearTimeout(hideTimer.current), []);
  const hideTip = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTip(null), 140);
  }, []);

  // A card anchored to a cell must not outlive a scroll, a resize or Escape.
  useEffect(() => {
    const close = () => setTip(null);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(hideTimer.current);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Draw the stage at its original size; scale down only when the column is narrower.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const scale = Math.min(1, width / VIEW_W);
      setFit({ scale, x: Math.max(0, (width - VIEW_W * scale) / 2) - VIEW_LEFT * scale });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="hh-scope" style={{ height: STAGE_H * fit.scale }}>
      <div
        className="hh-stage"
        style={{ transform: `translateX(${fit.x}px) scale(${fit.scale})` }}
      >
        {/* Soft ambient light drifting behind everything. */}
        <div className="hh-light" aria-hidden="true">
          <span className="hh-glow hh-glow-a" />
          <span className="hh-glow hh-glow-b" />
          <span className="hh-glow hh-glow-c" />
        </div>

        {/* Dashed light lines fanning from the hub into the module ring / city. */}
        <HeroFlow />

        {/* Left: the hub and the empty aura hexes growing out of it. */}
        <div className="hh-left">
          <div className="hero-hub-aura" aria-hidden="true">
            {AURA.map((group) => (
              <div key={group.side} className={`aura-side aura-${group.side}`}>
                {group.hexes.map(([col, row, delay, opacity]) => (
                  <span
                    key={`${col}:${row}`}
                    className="hub-hex"
                    style={
                      { "--col": col, "--row": row, "--d": delay, "--o": opacity } as CSSProperties
                    }
                  />
                ))}
              </div>
            ))}
          </div>

          <Hub />
        </div>

        {/* Right: the module ring around the city. */}
        <div className="hero-panel-wrap">
          <div className="hero-panel">
            <div className="module-honeycomb" aria-label="Platform modules">
              {HEX_CELLS.map((cell) => {
                const Icon = cell.icon;
                return (
                  <a
                    key={cell.pos}
                    className={`hc-cell hc-pos-${cell.pos}`}
                    style={TINT}
                    href="#modules"
                    onMouseEnter={(e) => showTip(cell, e.currentTarget)}
                    onMouseLeave={hideTip}
                    onFocus={(e) => showTip(cell, e.currentTarget)}
                    onBlur={hideTip}
                  >
                    <span className="hc-face hc-face-front">
                      <span className="hc-ico" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="hc-title">{cell.title}</span>
                      {cell.sub && <span className="hc-sub">{cell.sub}</span>}
                    </span>
                    <span className="hc-face hc-face-back">
                      <span className="hc-feature">
                        {cell.back.map((line, index) => (
                          <span key={line}>
                            {index > 0 && <br />}
                            {line}
                          </span>
                        ))}
                      </span>
                    </span>
                  </a>
                );
              })}

              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`hc-plug-link hc-plug-link-${n}`} aria-hidden="true" />
              ))}
              {HEX_PLUGS.map((plug) => {
                const Icon = plug.icon;
                return (
                  <a
                    key={plug.n}
                    className={`hc-plug hc-plug-${plug.n}`}
                    href="#modules"
                    aria-label={plug.label}
                  >
                    <svg
                      className="hc-plug-ring"
                      viewBox="0 0 100 87"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <polygon points="25,1.5 75,1.5 99,43.5 75,85.5 25,85.5 1,43.5" />
                    </svg>
                    <span className="hc-plug-face">
                      <span className="hc-ico" aria-hidden="true">
                        <Icon />
                      </span>
                      <span className="hc-title">{plug.title}</span>
                      <span className="hc-sub">{plug.sub}</span>
                    </span>
                  </a>
                );
              })}
            </div>

            <IndustryCity />
            {/* A slow band of light that passes over the ring every few seconds. */}
            <div className="hh-sweep" aria-hidden="true" />
          </div>
        </div>
      </div>
      {tip && <HexTipCard tip={tip} onEnter={holdTip} onLeave={hideTip} />}
    </div>
  );
}
