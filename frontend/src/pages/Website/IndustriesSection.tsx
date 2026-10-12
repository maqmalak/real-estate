import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import "./industry-honeycomb.css";
import {
  FIG_W,
  HEX_GROUPS,
  HEXH,
  HEXPAD,
  HEXW,
  MODULE_HEX,
  layoutHoneycomb,
  onInk,
  type HexCellModel,
} from "./industry-honeycomb";
import { INDUSTRIES, MODULES, type ModuleProfile } from "./website-data";
import { ProcessFlowDiagram, TextileProcessDiagram } from "./TextileProcessDiagram";
import { ProcessFlowSite, TextileProcessSite } from "./TextileProcessSite";
import { PROCESS_FLOWS } from "./industry-process-data";

const moduleById = (id: string) => MODULES.find((m) => m.id === id);

/** How long a switched-off cell takes to fade before it is removed. */
const LEAVE_MS = 260;

/** How long the tooltip waits before closing, so moving from the cell onto the card doesn't drop it. */
const TIP_HIDE_MS = 140;

interface ActiveTip {
  module: ModuleProfile;
  groupColor: string;
  rect: DOMRect;
}

/**
 * Hover / focus card for a module cell: its own feature list, as shown in the
 * Modules section. Rendered into <body> so the honeycomb's scaling and the
 * stage's clipping never touch it, and placed beside the cell in viewport
 * coordinates (layout ported from the hero honeycomb's own hover card).
 */
function ModuleTipCard({
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

  return createPortal(
    <div
      ref={ref}
      className="cp-tip"
      role="dialog"
      aria-label={`${tip.module.label} features`}
      style={{ "--cp-gc": tip.groupColor, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" } as CSSProperties}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <p className="cp-tip-h">
        <span className="dot" />
        {tip.module.label} · features
      </p>
      <ul className="cp-tip-list">
        {tip.module.features.map((feature) => (
          <li key={feature}>
            <span className="bul" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

/** Cards per row of the picker at the current width (see the `.cp-profiles` rules), for arrow-key movement. */
function pickerColumns(): number {
  return window.matchMedia("(max-width: 520px)").matches ? 1 : 2;
}

/**
 * Industry explorer, ported from the "One platform, shaped to how you build"
 * section of website-micromax.html: a picker of industries beside a module
 * honeycomb. Hovering or focusing an industry switches it, clicking pins it,
 * arrow keys move between industries. The honeycomb's cells bloom in for the
 * modules an industry uses, glide when they stay, and fade out when they are
 * switched off. Industries, modules and features come from website-data.ts.
 */
export function IndustriesSection({ heading, className }: { heading: ReactNode; className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const industry = INDUSTRIES[activeIndex];
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const [tip, setTip] = useState<ActiveTip | null>(null);
  const hideTimer = useRef<number>();
  const showTip = useCallback((module: ModuleProfile, groupColor: string, el: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    setTip({ module, groupColor, rect: el.getBoundingClientRect() });
  }, []);
  const holdTip = useCallback(() => window.clearTimeout(hideTimer.current), []);
  const hideTip = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTip(null), TIP_HIDE_MS);
  }, []);
  // A card anchored to a cell must not outlive a scroll, a resize, a switch of industry, or Escape.
  useEffect(() => {
    setTip(null);
  }, [activeIndex]);
  useEffect(() => {
    const close = () => setTip(null);
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && close();
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

  // The comb is fitted to the shape of the stage, so the stage is measured.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setStage({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { layout, scale } = useMemo(
    () => layoutHoneycomb(industry.modules, stage.w, stage.h),
    [industry.modules, stage.w, stage.h],
  );

  // Cells that were on and are now off stay in the DOM briefly so they can fade out.
  const [leaving, setLeaving] = useState<HexCellModel[]>([]);
  const previousCells = useRef<HexCellModel[]>([]);
  useEffect(() => {
    const now = new Set(layout.cells.map((c) => c.key));
    const gone = previousCells.current.filter((c) => !now.has(c.key));
    previousCells.current = layout.cells;
    setLeaving(gone);
    if (!gone.length) return;
    const timer = window.setTimeout(() => setLeaving([]), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [layout.cells]);

  const select = useCallback((index: number, focus: boolean) => {
    setActiveIndex(index);
    if (focus) cardRefs.current[index]?.focus();
  }, []);

  const onPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const columns = pickerColumns();
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = activeIndex + 1;
        break;
      case "ArrowLeft":
        next = activeIndex - 1;
        break;
      case "ArrowDown":
        next = activeIndex + columns;
        break;
      case "ArrowUp":
        next = activeIndex - columns;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = INDUSTRIES.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(Math.max(0, Math.min(INDUSTRIES.length - 1, next)), true);
  };

  const IndustryIcon = industry.icon;
  const boxW = HEXW - HEXPAD;
  const boxH = HEXH - HEXPAD;

  const renderCell = (cell: HexCellModel, isLeaving: boolean) => {
    const module = moduleById(cell.key);
    const meta = MODULE_HEX[cell.key];
    const group = HEX_GROUPS[cell.gid];
    if (!module || !meta || !group) return null;
    // The module's own icon (same one the Modules section and the tooltip's
    // header use), not the discipline's — so the symbol matches the features
    // the hover card shows, cell by cell rather than group by group.
    const ModuleIcon = module.icon;
    const style = {
      left: `calc(50% + ${cell.cx - boxW / 2}px)`,
      top: `calc(50% + ${cell.cy - boxH / 2}px)`,
      width: boxW,
      height: boxH,
      animationDelay: `${Math.min(cell.band * 64 + cell.within * 6, 460)}ms`,
      "--cp-gc": group.color,
      "--cp-on": onInk(group.color),
    } as CSSProperties;
    return (
      <button
        key={cell.key}
        type="button"
        className={isLeaving ? "cp-hex is-leaving" : "cp-hex"}
        style={style}
        aria-label={`${module.label} · ${group.label} — see features`}
        tabIndex={isLeaving ? -1 : 0}
        onMouseEnter={(e) => !isLeaving && showTip(module, group.color, e.currentTarget)}
        onMouseLeave={hideTip}
        onFocus={(e) => !isLeaving && showTip(module, group.color, e.currentTarget)}
        onBlur={hideTip}
      >
        <span className="cp-hex-t">{meta.short}</span>
        <i className="cp-hex-i" aria-hidden="true">
          <ModuleIcon />
        </i>
      </button>
    );
  };

  return (
    <section id="industries" className={`cp-scope ${className ?? ""}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <div className="cp-wrap">
          <div className="cp-grid">
            {/* LEFT: heading, then the picker right underneath it. */}
            <div>
              {heading}
              <div
                className="cp-profiles mt-8"
                role="tablist"
                aria-label="Industries"
                onKeyDown={onPickerKeyDown}
              >
                {INDUSTRIES.map((item, index) => {
                  const Icon = item.icon;
                  const active = index === activeIndex;
                  const tags = item.modules
                    .map(moduleById)
                    .filter((m): m is NonNullable<typeof m> => Boolean(m))
                    .slice(0, 3);
                  return (
                    <button
                      key={item.id}
                      ref={(el) => {
                        cardRefs.current[index] = el;
                      }}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      className={active ? "cp-card cp-active" : "cp-card"}
                      onMouseEnter={() => select(index, false)}
                      onFocus={() => select(index, false)}
                      onClick={() => select(index, true)}
                    >
                      <span className="cp-card-ico">
                        <Icon />
                      </span>
                      <span className="cp-card-body">
                        <span className="cp-cname">{item.label}</span>
                        <span className="cp-cmeta">{item.modules.length} modules</span>
                        <span className="cp-ctags">
                          {tags.map((tag) => (
                            <span key={tag.id} className="cp-ctag">
                              {tag.label}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: module title, then every industry's own "process, start
                to finish" — Option B then Option A — then the honeycomb.
                Textile & Garments keeps its bespoke hand-drawn version; every
                other industry uses its own flow from industry-process-data.ts
                with the same two components fed generic (lucide-icon) stages. */}
            <div className="cp-stage-col">
              <div className="cp-head">
                <div className="cp-caption" aria-live="polite">
                  <b>{industry.modules.length} modules</b> <span>· {industry.label}</span>
                </div>
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {industry.label} — the process, start to finish
                  </p>
                  {industry.id === "textile" ? (
                    <>
                      <TextileProcessSite />
                      <div className="mt-6">
                        <TextileProcessDiagram />
                      </div>
                    </>
                  ) : (
                    <>
                      <ProcessFlowSite stages={PROCESS_FLOWS[industry.id]} />
                      <div className="mt-6">
                        <ProcessFlowDiagram stages={PROCESS_FLOWS[industry.id]} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Not aria-hidden: the cells are real, focusable controls (hover / focus opens a module's feature list). */}
              <div className="cp-stage" ref={stageRef}>
                <div
                  className="cp-canvas"
                  style={{ width: layout.width, height: layout.height, transform: `translate(-50%, -50%) scale(${scale})` }}
                >
                  {layout.cells.map((cell) => renderCell(cell, false))}
                  {leaving.map((cell) => renderCell(cell, true))}
                </div>
                <div className="cp-flower" style={{ width: FIG_W * scale }} aria-hidden="true">
                  <span key={industry.id} className="cp-flower-ico">
                    <IndustryIcon />
                  </span>
                </div>
                <div
                  key={industry.id}
                  className="cp-fig-name is-on"
                  aria-hidden="true"
                  style={{
                    maxWidth: FIG_W * scale * 0.86,
                    fontSize: Math.max(11, FIG_W * scale * 0.072),
                    padding: "6px 10px",
                  }}
                >
                  {industry.label}
                </div>
              </div>
              {tip && <ModuleTipCard tip={tip} onEnter={holdTip} onLeave={hideTip} />}
            </div>
          </div>

          {/* Overview / What you get — the same for every industry now that
              Option A/B live up in the right column instead of this slot. */}
          <div className="cp-gain">
            <div>
              <p className="cp-gain-h">Overview</p>
              <p className="cp-gain-summary">{industry.summary}</p>
            </div>
            <div>
              <p className="cp-gain-h">What you get</p>
              <ul className="cp-gain-list">
                {industry.features.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="cp-foot">
            <b>Every implementation starts from the standard ERPNext core.</b> Industries never lock anything away —
            they simply lead with the modules that matter most, and modules can be switched on or off per company and
            per role at any time.
          </p>
        </div>
      </div>
    </section>
  );
}
