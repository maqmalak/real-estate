import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Area,
  AreaChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calculator,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Cog,
  Factory,
  Gauge,
  Minus,
  Package,
  Plus,
  Recycle,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";

// ------------------------------------------------------------------ baseline (micromax.cost_simulator.get_plan_baseline)
interface RawRow { code: string; name: string; uom: string; qty: number; rate: number }
interface OpRow { component: string; category: "operators" | "power" | "consumables" | "machine"; hours: number; rate: number; operations: string[] }
interface Baseline {
  /** set when nothing in the plan matches the stream / item filter */
  empty?: boolean;
  message?: string;
  lines?: { item: string; item_name: string; stream: string }[];
  plan: string;
  company: string;
  currency: string;
  posting_date: string;
  stream: string;
  item: string;
  uom: string;
  output: number;
  yield: number;
  products: {
    item: string; item_name: string; qty: number; bom: string; uom: string; yield: number; stream: string;
    routing: { operation: string; workstation: string; sequence: number; hours: number; hour_rate: number }[];
  }[];
  raw_materials: RawRow[];
  operations: OpRow[];
  waste: RawRow[];
  overheads: { from: string; to: string; basis_qty: number; factory_per_unit: number; admin_per_unit: number };
}

// ------------------------------------------------------------------ drivers
interface Drivers {
  volume: number; // % change in planned output
  yieldPct: number; // absolute yield %
  efficiency: number; // machine efficiency % (100 = standard time)
  fibre: number; // % change in raw material prices
  wages: number; // % change in operator wage rates
  power: number; // % change in power tariff
  wastePrice: number; // % change in waste selling price
  factoryOh: number; // factory overhead per unit at plan volume
  adminOh: number; // admin & selling overhead per unit at plan volume
  leaf: Record<string, number>; // per-leaf % change on its rate
}
const baseDrivers = (b: Baseline): Drivers => ({
  volume: 0, yieldPct: b.yield, efficiency: 100, fibre: 0, wages: 0, power: 0, wastePrice: 0,
  factoryOh: b.overheads.factory_per_unit, adminOh: b.overheads.admin_per_unit, leaf: {},
});

const CATS: { id: OpRow["category"]; label: string }[] = [
  { id: "operators", label: "Operators (labour)" },
  { id: "power", label: "Power" },
  { id: "consumables", label: "Consumables & spares" },
  { id: "machine", label: "Machine & other" },
];

// ------------------------------------------------------------------ the cost tree
interface CostNode {
  id: string;
  label: string;
  value: number; // simulated total
  base: number; // baseline total
  detail?: string; // e.g. "4,000 Kg × Rs 417"
  leaf?: boolean; // has its own % driver
  sign?: -1; // credits (waste) reduce cost
  children?: CostNode[];
}

function simulate(b: Baseline, d: Drivers) {
  const vol = 1 + d.volume / 100;
  const out = b.output * vol;
  const y0 = b.yield || 100;
  const consume = y0 / Math.max(1, d.yieldPct); // lower yield → more fibre per kg of yarn
  const wasteFactor = y0 < 100 ? Math.max(0, 100 - d.yieldPct) / (100 - y0) : 1;
  const time = 100 / Math.max(1, d.efficiency);
  const lf = (id: string) => 1 + (d.leaf[id] ?? 0) / 100;
  const catPct: Record<OpRow["category"], number> = { operators: d.wages, power: d.power, consumables: 0, machine: 0 };

  const rm: CostNode[] = b.raw_materials.map((r) => {
    const id = `rm:${r.code}`;
    const qty = r.qty * vol * consume;
    const rate = r.rate * (1 + d.fibre / 100) * lf(id);
    return { id, label: r.name || r.code, value: qty * rate, base: r.qty * r.rate, leaf: true,
      detail: `${formatNumber(qty, 0)} ${r.uom} × ${formatNumber(rate, 1)}` };
  });
  const cats: CostNode[] = CATS.map((c) => {
    const kids = b.operations
      .filter((o) => o.category === c.id)
      .map((o) => {
        const id = `op:${o.component}`;
        const hours = o.hours * vol * time;
        const rate = o.rate * (1 + catPct[c.id] / 100) * lf(id);
        return { id, label: o.component, value: hours * rate, base: o.hours * o.rate, leaf: true,
          detail: `${formatNumber(hours, 0)} h × ${formatNumber(rate, 1)}/h · ${o.operations.length} operations` };
      });
    return { id: `cat:${c.id}`, label: c.label, value: sum(kids, "value"), base: sum(kids, "base"), children: kids };
  }).filter((c) => c.children!.length);
  const oh: CostNode[] = [
    { id: "oh:factory", label: "Factory overhead (not in machine rates)", value: d.factoryOh * b.output * lf("oh:factory"), base: b.overheads.factory_per_unit * b.output,
      leaf: true, detail: "fixed for the period — spread over more output, it falls per unit" },
    { id: "oh:admin", label: "Admin & selling", value: d.adminOh * b.output * lf("oh:admin"), base: b.overheads.admin_per_unit * b.output,
      leaf: true, detail: "fixed for the period" },
  ];
  const waste: CostNode[] = b.waste.map((w) => {
    const id = `w:${w.code}`;
    const qty = w.qty * vol * wasteFactor;
    const rate = w.rate * (1 + d.wastePrice / 100) * lf(id);
    return { id, label: w.name || w.code, value: qty * rate, base: w.qty * w.rate, leaf: true, sign: -1,
      detail: `${formatNumber(qty, 0)} ${w.uom} × ${formatNumber(rate, 1)}` };
  });
  const groups = ([
    { id: "g:rm", label: "Raw materials", value: sum(rm, "value"), base: sum(rm, "base"), children: rm },
    { id: "g:conv", label: "Conversion (operations)", value: sum(cats, "value"), base: sum(cats, "base"), children: cats },
    { id: "g:oh", label: "Overheads", value: sum(oh, "value"), base: sum(oh, "base"), children: oh },
    { id: "g:waste", label: "Waste credit", value: sum(waste, "value"), base: sum(waste, "base"), children: waste, sign: -1 },
  ] as CostNode[]).filter((g) => g.children!.length);
  const total = groups.reduce((s, g) => s + (g.sign ? -g.value : g.value), 0);
  const baseTotal = groups.reduce((s, g) => s + (g.sign ? -g.base : g.base), 0);
  return { out, total, baseTotal, groups, cats };
}
const sum = (rows: CostNode[], k: "value" | "base") => rows.reduce((s, r) => s + r[k], 0);

// ------------------------------------------------------------------ look
/** Colour + icon per branch of the tree (by node id prefix). */
const TONES: { match: (id: string) => boolean; color: string; icon: LucideIcon }[] = [
  { match: (id) => id === "root", color: "hsl(221 83% 53%)", icon: Calculator },
  { match: (id) => id === "g:rm" || id.startsWith("rm:"), color: "hsl(199 89% 48%)", icon: Package },
  { match: (id) => id === "g:conv", color: "hsl(262 83% 58%)", icon: Factory },
  { match: (id) => id === "cat:operators", color: "hsl(262 83% 58%)", icon: Users },
  { match: (id) => id === "cat:power", color: "hsl(35 92% 50%)", icon: Zap },
  { match: (id) => id === "cat:consumables", color: "hsl(173 80% 36%)", icon: Wrench },
  { match: (id) => id === "cat:machine", color: "hsl(215 20% 50%)", icon: Cog },
  { match: (id) => id === "g:oh" || id.startsWith("oh:"), color: "hsl(330 81% 55%)", icon: Building2 },
  { match: (id) => id === "g:waste" || id.startsWith("w:"), color: "hsl(160 84% 39%)", icon: Recycle },
];
const OP_TONE: Record<OpRow["category"], number> = { operators: 3, power: 4, consumables: 5, machine: 6 };
function tone(node: CostNode, parentId?: string) {
  if (node.id.startsWith("op:") && parentId) {
    const cat = parentId.replace("cat:", "") as OpRow["category"];
    return TONES[OP_TONE[cat] ?? 6];
  }
  return TONES.find((t) => t.match(node.id)) ?? TONES[0];
}

// ------------------------------------------------------------------ page
interface PlanRow {
  name: string; posting_date: string; status: string; qty: number; line_count: number; conversion_lines: number; uom: string; products: string;
}
type Stream = "" | "Own production" | "Conversion";
interface PlanFilters { stream: Stream; from: string; to: string; item: string }

/** valQ-style production cost simulator: a Production Plan's standard cost as a driver tree (cost per unit → raw
 * materials / operators / power / overheads / waste credit → individual items), with sliders to test scenarios. */
export function CostSimulatorPage() {
  const { company, companyCurrency } = useCompanyContext();
  const [params, setParams] = useSearchParams();
  const plan = params.get("plan") ?? "";
  // filters live in the URL with the plan, so a shared link opens the same view
  const filters: PlanFilters = {
    stream: (params.get("stream") as Stream) || "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    item: params.get("item") ?? "",
  };
  const update = (patch: Partial<PlanFilters & { plan: string }>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };
  const { data, error, isLoading } = useFrappeGetCall<{ message: Baseline }>(
    "micromax.cost_simulator.get_plan_baseline",
    { production_plan: plan, stream: filters.stream, item: filters.item },
    plan ? `cost-sim-${plan}-${filters.stream}-${filters.item}` : null,
    { revalidateOnFocus: false },
  );
  const b = data?.message;
  return (
    <div className="space-y-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-violet-500/10 to-sky-500/10 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary shadow-sm backdrop-blur">
              <Calculator className="h-3.5 w-3.5" /> Production · what-if
            </span>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Production Cost Simulator</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              A plan's cost per unit as a driver tree — raw materials, operators, power, overheads and waste. Move a driver, watch the end cost move.
            </p>
          </div>
          <div className="w-full lg:w-[420px]">
            <PlanPicker company={company} value={plan} filters={filters} onChange={(v) => update({ plan: v })} />
          </div>
        </div>
        <FilterRow filters={filters} onChange={update} />
        {b && !b.empty && (
          <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
            {(b.stream || b.item) && (
              <Chip>
                <SlidersHorizontal className="h-3 w-3" /> costing only {[b.stream && b.stream.toLowerCase(), b.item].filter(Boolean).join(" · ")} lines
              </Chip>
            )}
            <Chip>{b.posting_date}</Chip>
            <Chip>{formatNumber(b.output, 0)} {b.uom} planned</Chip>
            <Chip>standard yield {b.yield}%</Chip>
            {b.products.slice(0, 4).map((p) => (
              <Chip key={p.item}>
                <Tag className="h-3 w-3" /> {p.item_name || p.item} · {formatNumber(p.qty, 0)}
              </Chip>
            ))}
            {b.products.length > 4 && <Chip>+{b.products.length - 4} more</Chip>}
          </div>
        )}
      </div>

      {!plan ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SlidersHorizontal className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold">Pick a production plan to start simulating</p>
          <p className="max-w-md text-xs text-muted-foreground">Search by plan number (e.g. 00052) or by product name. Only submitted plans of the selected company are listed.</p>
        </Card>
      ) : error ? (
        <Card className="p-6 text-sm text-rose-600">{serverMessage(error) || "Could not load the plan's costs."}</Card>
      ) : isLoading || !b ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          <Skeleton className="h-[480px] rounded-xl lg:col-span-4" />
        </div>
      ) : b.empty ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <SlidersHorizontal className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold">{b.message}</p>
          {b.lines && b.lines.length > 0 && (
            <p className="max-w-lg text-xs text-muted-foreground">
              {b.plan} has: {b.lines.map((l) => `${l.item_name || l.item} (${l.stream === "Conversion" ? "conversion" : "own production"})`).join(", ")}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {(filters.stream || filters.item) && (
              <Button size="sm" onClick={() => update({ stream: "", item: "" })}>
                Cost all lines of this plan
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => update({ plan: "" })}>
              Pick another plan
            </Button>
          </div>
        </Card>
      ) : (
        <Simulator key={`${b.plan}-${b.stream}-${b.item}`} b={b} currency={b.currency || companyCurrency || "PKR"} />
      )}
    </div>
  );
}

/** The message Frappe sent with a failed call (falls back to the generic one). */
function serverMessage(error: unknown): string {
  const e = error as { exception?: string; _server_messages?: string; message?: string } | undefined;
  try {
    if (e?._server_messages) {
      const first = JSON.parse(JSON.parse(e._server_messages)[0]);
      return String(first.message ?? "").replace(/<[^>]+>/g, "");
    }
  } catch {
    /* not JSON */
  }
  if (e?.exception) return e.exception.replace(/^[\w.]+(Error|Exception):\s*/, "");
  return e?.message ?? "";
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2.5 py-1 font-medium backdrop-blur">{children}</span>;
}

// ------------------------------------------------------------------ plan picker
function FilterRow({ filters, onChange }: { filters: PlanFilters; onChange: (p: Partial<PlanFilters>) => void }) {
  const streams: { id: Stream; label: string }[] = [
    { id: "", label: "All" },
    { id: "Own production", label: "Own production" },
    { id: "Conversion", label: "Conversion" },
  ];
  const active = !!(filters.stream || filters.from || filters.to || filters.item);
  return (
    <div className="relative mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-background/60 p-3 backdrop-blur">
      <div>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stream</span>
        <div className="flex rounded-lg bg-muted p-1">
          {streams.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onChange({ stream: s.id })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                filters.stream === s.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From</span>
        <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => onChange({ from: e.target.value })}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To</span>
        <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => onChange({ to: e.target.value })}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="w-full min-w-0 sm:w-[240px]">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Item</span>
        <FrappeLinkField
          meta={{ fieldname: "item", label: "Item", fieldtype: "Link", options: "Item", placeholder: "All items" }}
          value={filters.item}
          onChange={(v) => onChange({ item: v })}
          allowCreate={false}
        />
      </div>
      {active && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange({ stream: "", from: "", to: "", item: "" })}>
          Clear
        </Button>
      )}
      <p className="w-full text-[11px] text-muted-foreground">
        Filters narrow the plan list; stream and item also cost only the matching lines of a mixed plan.
      </p>
    </div>
  );
}

function PlanPicker({ company, value, filters, onChange }: { company?: string; value: string; filters: PlanFilters; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useFrappeGetCall<{ message: PlanRow[] }>(
    "micromax.cost_simulator.list_plans",
    { company: company ?? "", txt: term, stream: filters.stream, from_date: filters.from, to_date: filters.to, item: filters.item },
    open ? `cost-sim-plans-${company ?? ""}-${term}-${filters.stream}-${filters.from}-${filters.to}-${filters.item}` : null,
    { revalidateOnFocus: false },
  );
  const rows = data?.message ?? [];
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    place();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-plan-menu]")) setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", close);
    };
  }, [open]);
  return (
    <div ref={ref}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Production plan</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-background/90 px-3 text-left text-sm shadow-sm backdrop-blur transition hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Factory className="h-4 w-4 shrink-0 text-primary" />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{value || "Choose a plan — search number or product"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && pos &&
        createPortal(
          <div
            data-plan-menu
            style={{ left: pos.left, top: pos.top, width: Math.max(pos.width, 320) }}
            className="fixed z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Plan no. (00052) or product (Mid Grey)…"
                className="h-9 w-full rounded-lg bg-muted/60 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <ul className="max-h-[360px] overflow-y-auto p-1 scrollbar-thin">
              {isLoading && <li className="p-3 text-xs text-muted-foreground">Searching…</li>}
              {!isLoading && rows.length === 0 && <li className="p-3 text-xs text-muted-foreground">No submitted plans match{term ? ` “${term}”` : ""} with these filters.</li>}
              {rows.map((r) => (
                <li key={r.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(r.name);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition hover:bg-muted",
                      r.name === value && "bg-primary/10",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{r.posting_date}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{r.products || "—"}</span>
                    <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                      {formatNumber(r.qty, 0)} {r.uom} · {r.line_count} line{r.line_count === 1 ? "" : "s"} · {r.status}
                      <StreamBadge conv={Number(r.conversion_lines) || 0} lines={Number(r.line_count) || 0} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

function StreamBadge({ conv, lines }: { conv: number; lines: number }) {
  const [label, cls] =
    conv === 0 ? ["Own", "bg-sky-500/10 text-sky-600"] : conv >= lines ? ["Conversion", "bg-emerald-500/10 text-emerald-600"] : ["Mixed", "bg-amber-500/10 text-amber-600"];
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", cls)}>{label}</span>;
}

// ------------------------------------------------------------------ simulator
function Simulator({ b, currency }: { b: Baseline; currency: string }) {
  const [d, setD] = useState<Drivers>(() => baseDrivers(b));
  const [open, setOpen] = useState<Set<string>>(() => new Set(["root", "g:rm", "g:conv"]));
  const sim = useMemo(() => simulate(b, d), [b, d]);
  const unit = sim.total / (sim.out || 1);
  const baseUnit = sim.baseTotal / (b.output || 1);
  const change = baseUnit ? ((unit - baseUnit) / baseUnit) * 100 : 0;
  const money = (v: number) => formatMoney(v, currency);
  const set = (patch: Partial<Drivers>) => setD((x) => ({ ...x, ...patch }));
  const setLeaf = (id: string, v: number) => setD((x) => ({ ...x, leaf: { ...x.leaf, [id]: v } }));
  const dirty = JSON.stringify(d) !== JSON.stringify(baseDrivers(b));

  const root: CostNode = { id: "root", label: `Cost per ${b.uom || "unit"}`, value: sim.total, base: sim.baseTotal, children: sim.groups };
  const allIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (n: CostNode) => {
      if (n.children?.length) ids.push(n.id);
      n.children?.forEach(walk);
    };
    walk(root);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);

  // waterfall: baseline cost/unit → change per branch → simulated
  const waterfall = useMemo(() => {
    const rows: { name: string; base: number; delta: number; color: string; label: string }[] = [];
    let run = baseUnit;
    rows.push({ name: "Baseline", base: 0, delta: baseUnit, color: "hsl(215 16% 65%)", label: money(baseUnit) });
    const parts = [
      ...sim.groups.filter((g) => g.id !== "g:conv").map((g) => ({ name: g.label, v: g.sign ? -g.value : g.value, b0: g.sign ? -g.base : g.base })),
      ...sim.cats.map((c) => ({ name: c.label, v: c.value, b0: c.base })),
    ];
    parts.forEach((p) => {
      const delta = p.v / (sim.out || 1) - p.b0 / (b.output || 1);
      if (Math.abs(delta) < 0.005) return;
      rows.push({ name: p.name, base: delta >= 0 ? run : run + delta, delta: Math.abs(delta),
        color: delta >= 0 ? "hsl(351 95% 59%)" : "hsl(160 84% 39%)", label: `${delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(delta), 2)}` });
      run += delta;
    });
    rows.push({ name: "Simulated", base: 0, delta: unit, color: "hsl(221 83% 53%)", label: money(unit) });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);

  // sensitivity: cost per unit across output volume, other drivers as set
  const curve = useMemo(
    () =>
      [-40, -30, -20, -10, 0, 10, 20, 30, 40].map((v) => {
        const s = simulate(b, { ...d, volume: v });
        return { volume: `${v > 0 ? "+" : ""}${v}%`, v, cpu: Math.round((s.total / (s.out || 1)) * 100) / 100 };
      }),
    [b, d],
  );
  const near = Math.max(-40, Math.min(40, Math.round(d.volume / 10) * 10));

  // composition bar (share of gross cost)
  const gross = sim.groups.filter((g) => !g.sign).reduce((s, g) => s + g.value, 0) || 1;
  const parts = [
    ...sim.groups.filter((g) => g.id === "g:rm"),
    ...sim.cats,
    ...sim.groups.filter((g) => g.id === "g:oh"),
  ];

  return (
    <div className="space-y-5">
      {/* headline */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cost per {b.uom}</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Baseline</p>
              <p className="text-2xl font-semibold tabular-nums text-muted-foreground">{money(baseUnit)}</p>
            </div>
            <ArrowRight className="mb-2 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[11px] text-muted-foreground">Simulated</p>
              <p className="text-3xl font-bold tabular-nums">{money(unit)}</p>
            </div>
            <span
              className={cn(
                "mb-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                Math.abs(change) < 0.05 ? "bg-muted text-muted-foreground" : change > 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600",
              )}
            >
              {change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : change < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
              {change > 0 ? "+" : ""}
              {formatNumber(change, 2)}%
            </span>
          </div>
          {/* composition */}
          <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {parts.map((p) => (
              <div key={p.id} title={`${p.label}: ${formatNumber((p.value / gross) * 100, 1)}%`} style={{ width: `${(p.value / gross) * 100}%`, background: tone(p).color }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {parts.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: tone(p).color }} />
                {p.label} {formatNumber((p.value / gross) * 100, 0)}%
              </span>
            ))}
          </div>
        </Card>
        <MiniStat icon={Calculator} label="Simulated total cost" value={money(sim.total)} hint={`baseline ${money(sim.baseTotal)}`} />
        <MiniStat icon={Gauge} label="Output" value={`${formatNumber(sim.out, 0)} ${b.uom}`} hint={`yield ${formatNumber(d.yieldPct, 1)}% · efficiency ${d.efficiency}%`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* drivers */}
        <Card className="h-fit space-y-5 p-4 xl:sticky xl:top-20">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Drivers
            </h3>
            <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setD(baseDrivers(b))}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <DriverGroup title="Volume & efficiency">
            <Slider label="Output volume" value={d.volume} min={-50} max={50} unit="%" signed color="hsl(221 83% 53%)" onChange={(v) => set({ volume: v })} hint="fixed overheads spread over more / fewer units" />
            <Slider label="Yield" value={d.yieldPct} min={Math.max(70, Math.floor(b.yield - 15))} max={100} step={0.1} unit="%" color="hsl(199 89% 48%)" onChange={(v) => set({ yieldPct: v })} hint={`standard ${b.yield}% · fibre used and waste`} />
            <Slider label="Machine efficiency" value={d.efficiency} min={60} max={130} unit="%" color="hsl(262 83% 58%)" onChange={(v) => set({ efficiency: v })} hint="100% = standard routing time" />
          </DriverGroup>
          <DriverGroup title="Prices & rates">
            <Slider label="Fibre price" value={d.fibre} min={-40} max={60} unit="%" signed color="hsl(199 89% 48%)" onChange={(v) => set({ fibre: v })} />
            <Slider label="Operator wage rate" value={d.wages} min={-30} max={60} unit="%" signed color="hsl(262 83% 58%)" onChange={(v) => set({ wages: v })} />
            <Slider label="Power tariff" value={d.power} min={-30} max={80} unit="%" signed color="hsl(35 92% 50%)" onChange={(v) => set({ power: v })} />
            <Slider label="Waste selling price" value={d.wastePrice} min={-50} max={100} unit="%" signed color="hsl(160 84% 39%)" onChange={(v) => set({ wastePrice: v })} />
          </DriverGroup>
          <DriverGroup title={`Overheads per ${b.uom}`}>
            <div className="grid grid-cols-2 gap-2">
              <NumberDriver label="Factory" value={d.factoryOh} onChange={(v) => set({ factoryOh: v })} />
              <NumberDriver label="Admin & selling" value={d.adminOh} onChange={(v) => set({ adminOh: v })} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              From the ledger {b.overheads.from} → {b.overheads.to}; fixed for the period. Every node in the tree also has its own rate slider.
            </p>
          </DriverGroup>
        </Card>

        {/* tree */}
        <Card className="min-w-0 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Cost driver tree</h3>
              <p className="text-xs text-muted-foreground">Per {b.uom} · bar = share of the parent · % = change vs baseline</p>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button type="button" onClick={() => setOpen(new Set(allIds))} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground">
                <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
              </button>
              <button type="button" onClick={() => setOpen(new Set(["root"]))} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground">
                <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse
              </button>
            </div>
          </div>
          <div className="overflow-x-auto pb-2 scrollbar-thin">
            <TreeNode
              node={root}
              parentValue={sim.total}
              out={sim.out}
              baseOut={b.output}
              money={money}
              open={open}
              toggle={(id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
              leaf={d.leaf}
              setLeaf={setLeaf}
              isRoot
            />
          </div>
        </Card>
      </div>

      <CostSummary sim={sim} out={sim.out} baseOut={b.output} uom={b.uom} money={money} />

      <OperationsGantt b={b} volume={d.volume} efficiency={d.efficiency} money={money} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Baseline → simulated, per {b.uom}</h3>
          <p className="mb-3 text-xs text-muted-foreground">What moved the cost: red raises it, green lowers it</p>
          <ResponsiveContainer width="100%" height={290}>
            <ComposedChart data={waterfall} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-20} textAnchor="end" height={64} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} domain={[(min: number) => Math.max(0, Math.floor(min * 0.95)), "auto"]} />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(_v: any, _n: any, p: any) => [p.payload.label, p.payload.name]} />
              <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="delta" stackId="w" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                {waterfall.map((r) => <Cell key={r.name} fill={r.color} />)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Cost per {b.uom} vs output volume</h3>
          <p className="mb-3 text-xs text-muted-foreground">Other drivers as set — fixed overheads make small lots dearer</p>
          <ResponsiveContainer width="100%" height={290}>
            <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(221 83% 53%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(221 83% 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="volume" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v: any) => [money(Number(v)), `Cost / ${b.uom}`]} />
              <Area type="monotone" dataKey="cpu" stroke="hsl(221 83% 53%)" strokeWidth={2.5} fill="url(#cpuFill)" dot={{ r: 3 }} />
              <ReferenceDot x={`${near > 0 ? "+" : ""}${near}%`} y={curve.find((c) => c.v === near)?.cpu} r={7} fill="hsl(351 95% 59%)" stroke="white" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cost value summary
function CostSummary({ sim, out, baseOut, uom, money }: {
  sim: ReturnType<typeof simulate>; out: number; baseOut: number; uom: string; money: (v: number) => string;
}) {
  // one line per cost element; operations split into their categories; waste is a credit (negative)
  const lines = [
    ...sim.groups.filter((g) => g.id === "g:rm"),
    ...sim.cats,
    ...sim.groups.filter((g) => g.id === "g:oh"),
    ...sim.groups.filter((g) => g.id === "g:waste"),
  ].map((n) => {
    const sign = n.sign ? -1 : 1;
    return { node: n, value: sign * n.value, base: sign * n.base };
  });
  const total = sim.total || 1;
  const baseTotal = sim.baseTotal || 1;
  const row = (label: ReactNode, value: number, base: number, color: string | null, strong = false) => {
    const pu = value / (out || 1);
    const bpu = base / (baseOut || 1);
    const chg = bpu ? ((pu - bpu) / Math.abs(bpu)) * 100 : 0;
    const share = (value / total) * 100;
    return (
      <tr className={cn("border-b border-border/60 last:border-0", strong && "bg-muted/40 font-semibold")}>
        <td className="py-2.5 pl-4 pr-3">
          <span className="flex items-center gap-2">
            {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />}
            {label}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(bpu)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(pu)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(value)}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-2">
            {!strong && (
              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(share))}%`, background: color ?? "hsl(var(--primary))" }} />
              </span>
            )}
            <span className="w-14 text-right tabular-nums">{formatNumber(share, 1)}%</span>
          </div>
        </td>
        <td className={cn("py-2.5 pl-3 pr-4 text-right tabular-nums", Math.abs(chg) < 0.05 ? "text-muted-foreground" : (chg > 0) !== (value < 0) ? "text-rose-600" : "text-emerald-600")}>
          {Math.abs(chg) < 0.05 ? "—" : `${chg > 0 ? "+" : ""}${formatNumber(chg, 1)}%`}
        </td>
      </tr>
    );
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">Cost value summary</h3>
          <p className="text-xs text-muted-foreground">Each cost element per {uom} and in total, its share of the total cost and its change vs baseline</p>
        </div>
        <span className="text-xs text-muted-foreground">
          baseline total {money(baseTotal)} → <span className="font-semibold text-foreground">{money(sim.total)}</span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pl-4 pr-3 text-left font-semibold">Cost element</th>
              <th className="px-3 py-2 text-right font-semibold">Baseline / {uom}</th>
              <th className="px-3 py-2 text-right font-semibold">Simulated / {uom}</th>
              <th className="px-3 py-2 text-right font-semibold">Total value</th>
              <th className="px-3 py-2 text-right font-semibold">% of cost</th>
              <th className="py-2 pl-3 pr-4 text-right font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <Fragment key={l.node.id}>{row(l.node.sign ? `${l.node.label} (credit)` : l.node.label, l.value, l.base, tone(l.node).color)}</Fragment>
            ))}
            {row(`Total cost per ${uom}`, sim.total, sim.baseTotal, null, true)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ operations Gantt
const OP_COLORS = ["hsl(199 89% 48%)", "hsl(262 83% 58%)", "hsl(35 92% 50%)", "hsl(173 80% 36%)", "hsl(221 83% 53%)", "hsl(330 81% 55%)",
  "hsl(160 84% 39%)", "hsl(15 85% 55%)"];

/** Each product's routing laid out in sequence: bar length = simulated machine hours (volume and efficiency applied);
 * the dashed marker shows where the baseline routing would end. */
function OperationsGantt({ b, volume, efficiency, money }: { b: Baseline; volume: number; efficiency: number; money: (v: number) => string }) {
  const factor = (1 + volume / 100) * (100 / Math.max(1, efficiency));
  const ops = useMemo(() => {
    const seen: string[] = [];
    b.products.forEach((p) => [...p.routing].sort((x, y) => x.sequence - y.sequence).forEach((r) => !seen.includes(r.operation) && seen.push(r.operation)));
    return seen;
  }, [b]);
  const color = (op: string) => OP_COLORS[ops.indexOf(op) % OP_COLORS.length];
  const rows = b.products
    .filter((p) => p.routing.length)
    .map((p) => {
      let t = 0;
      const segs = [...p.routing]
        .sort((x, y) => x.sequence - y.sequence)
        .map((r) => {
          const hours = r.hours * factor;
          const seg = { ...r, start: t, hours };
          t += hours;
          return seg;
        });
      return { p, segs, end: t, baseEnd: p.routing.reduce((s, r) => s + r.hours, 0) };
    });
  if (!rows.length) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Operations timeline</h3>
        <p className="mt-1 text-xs text-muted-foreground">The BOMs in this plan have no routing (operations), so there is no timeline to show.</p>
      </Card>
    );
  }
  const max = Math.max(...rows.map((r) => Math.max(r.end, r.baseEnd))) || 1;
  const inDays = max > 72;
  const unit = (h: number) => (inDays ? `${formatNumber(h / 24, 1)} d` : `${formatNumber(h, 0)} h`);
  const ticks = Array.from({ length: 6 }, (_, i) => (max / 5) * i);
  const totalHours = rows.reduce((s, r) => s + r.end, 0);
  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Operations timeline</h3>
          <p className="text-xs text-muted-foreground">
            Each product's routing in sequence · bar = machine time with volume {volume > 0 ? "+" : ""}{volume}% and efficiency {efficiency}% · dashed = baseline end
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatNumber(totalHours, 0)} machine hours in total{inDays ? ` (${formatNumber(totalHours / 24, 1)} machine-days)` : ""}
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[640px]">
          {/* axis */}
          <div className="ml-[200px] flex justify-between border-b border-border pb-1 text-[10px] tabular-nums text-muted-foreground">
            {ticks.map((t) => <span key={t}>{unit(t)}</span>)}
          </div>
          <div className="mt-2 space-y-2">
            {rows.map(({ p, segs, end, baseEnd }) => (
              <div key={p.item} className="flex items-center gap-3">
                <div className="w-[188px] shrink-0">
                  <p className="truncate text-xs font-semibold" title={p.item_name}>{p.item_name || p.item}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {formatNumber(p.qty * (1 + volume / 100), 0)} {p.uom} · {p.stream === "Conversion" ? "conversion" : "own"} · {unit(end)}
                  </p>
                </div>
                <div className="relative h-8 flex-1 rounded-lg bg-muted/50">
                  {segs.map((g) => (
                    <div
                      key={`${g.operation}-${g.sequence}`}
                      className="absolute top-1 bottom-1 overflow-hidden rounded-md border border-background/60 px-1.5 text-[10px] font-medium leading-6 text-white shadow-sm"
                      style={{ left: `${(g.start / max) * 100}%`, width: `${Math.max(0.4, (g.hours / max) * 100)}%`, background: color(g.operation) }}
                      title={`${g.operation} · ${g.workstation || "—"}\n${formatNumber(g.hours, 1)} h · ${money(g.hours * g.hour_rate)} at ${money(g.hour_rate)}/h`}
                    >
                      <span className="truncate">{g.operation}</span>
                    </div>
                  ))}
                  <div className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-foreground/40" style={{ left: `${(baseEnd / max) * 100}%` }} title={`baseline end · ${unit(baseEnd)}`} />
                </div>
              </div>
            ))}
          </div>
          <div className="ml-[200px] mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {ops.map((o) => (
              <span key={o} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(o) }} />
                {o}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ pieces
function MiniStat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

function DriverGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, step = 1, unit, signed, color, onChange, hint }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string; signed?: boolean; color: string;
  onChange: (v: number) => void; hint?: string;
}) {
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-xs font-medium">
        {label}
        <span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-foreground">
          {signed && value > 0 ? "+" : ""}
          {formatNumber(value, step < 1 ? 1 : 0)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, ${color} ${pct}%, hsl(var(--muted)) ${pct}%)`, accentColor: color }}
      />
      {hint && <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function NumberDriver({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        step="0.01"
        min={0}
        className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}

function TreeNode({ node, parentId, parentValue, out, baseOut, money, open, toggle, leaf, setLeaf, isRoot }: {
  node: CostNode; parentId?: string; parentValue: number; out: number; baseOut: number; money: (v: number) => string;
  open: Set<string>; toggle: (id: string) => void; leaf: Record<string, number>; setLeaf: (id: string, v: number) => void; isRoot?: boolean;
}) {
  const hasKids = !!node.children?.length;
  const expanded = hasKids && open.has(node.id);
  const perUnit = node.value / (out || 1);
  const basePerUnit = node.base / (baseOut || 1);
  const change = basePerUnit ? ((perUnit - basePerUnit) / Math.abs(basePerUnit)) * 100 : 0;
  const good = node.sign ? change > 0 : change < 0; // a bigger waste credit is good
  const t = tone(node, parentId);
  const Icon = t.icon;
  const share = parentValue ? Math.min(100, (Math.abs(node.value) / Math.abs(parentValue)) * 100) : 0;
  return (
    <div className="flex items-start">
      <div
        className={cn(
          "group relative w-[260px] shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md",
          isRoot ? "w-[280px] border-primary/40" : "border-border",
        )}
      >
        <div className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} />
        <div className="p-3 pl-4">
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, color: t.color }}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">
              {node.sign ? "− " : ""}
              {node.label}
            </p>
            {hasKids && (
              <button
                type="button"
                aria-label={expanded ? "Collapse" : "Expand"}
                onClick={() => toggle(node.id)}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                  expanded ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {expanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              </button>
            )}
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className={cn("font-bold tabular-nums leading-none", isRoot ? "text-2xl" : "text-lg")}>{money(perUnit)}</p>
            {Math.abs(change) >= 0.05 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", good ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>
                {change > 0 ? "+" : ""}
                {formatNumber(change, 1)}%
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">total {money(node.value)}</p>
          {!isRoot && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted" title={`${formatNumber(share, 1)}% of parent`}>
              <div className="h-full rounded-full" style={{ width: `${share}%`, background: t.color }} />
            </div>
          )}
          {node.detail && <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{node.detail}</p>}
          {node.leaf && (
            <label className="mt-2 block rounded-lg bg-muted/50 px-2 py-1.5">
              <span className="flex justify-between text-[10px] font-medium text-muted-foreground">
                rate
                <span className="tabular-nums text-foreground">
                  {(leaf[node.id] ?? 0) > 0 ? "+" : ""}
                  {leaf[node.id] ?? 0}%
                </span>
              </span>
              <input
                type="range"
                min={-50}
                max={50}
                value={leaf[node.id] ?? 0}
                onChange={(e) => setLeaf(node.id, Number(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: t.color }}
              />
            </label>
          )}
        </div>
      </div>
      {expanded && (
        <div className="relative ml-5 flex flex-col gap-3 py-1 pl-5">
          <span className="absolute bottom-6 left-0 top-6 w-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${t.color} 35%, transparent)` }} />
          {node.children!.map((c) => (
            <div key={c.id} className="relative">
              <span className="absolute -left-5 top-7 h-0.5 w-5 rounded-full" style={{ background: `color-mix(in srgb, ${t.color} 35%, transparent)` }} />
              <TreeNode
                node={c}
                parentId={node.id}
                parentValue={node.value}
                out={out}
                baseOut={baseOut}
                money={money}
                open={open}
                toggle={toggle}
                leaf={leaf}
                setLeaf={setLeaf}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
