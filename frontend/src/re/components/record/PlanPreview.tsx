/**
 * Payment-plan schedule, live while the plan is edited: pick a plot-size price (or type one) and a booking date, then read
 * the plan as summary tiles, a composition bar, a cumulative chart (each payment as a bar coloured by kind, the running
 * total as a line) and a year-by-year schedule — with plain-language insights. Server: re_payment_plan.preview.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarRange, ChevronDown, Coins, Flag, Landmark, Repeat, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DocValues } from "@/components/doc/doc-config";
import { axisShort, Highlights, useChartTheme, type Highlight } from "@/re/components/analytics/kit";
import { get } from "@/re/lib/api";
import { date, money, num, todayISO } from "@/re/lib/format";
import { cn } from "@/re/lib/utils";
import { useTheme } from "@/re/providers/theme";

interface Row { label: string; due_date: string; amount: number }
interface Preview { rows: Row[]; total: number; count: number }

const KINDS: { re: RegExp; key: string; color: string }[] = [
  { re: /^Booking/, key: "Booking", color: "#0ea5e9" },
  { re: /^Down/, key: "Down payment", color: "#6366f1" },
  { re: /^Balloon/, key: "Balloon", color: "#f59e0b" },
  { re: /^Development/, key: "Development", color: "#e11d48" },
  { re: /^On Possession|^Possession/, key: "Possession", color: "#8b5cf6" },
  { re: /^Installment/, key: "Installment", color: "#14b8a6" },
];
const kindOf = (label: string) => KINDS.find((k) => k.re.test(label)) ?? KINDS[KINDS.length - 1];
const monthsBetween = (a: string, b: string) => {
  const x = new Date(`${a}T00:00:00`), y = new Date(`${b}T00:00:00`);
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
};

function insights(rows: Row[], total: number, start: string): Highlight[] {
  if (!rows.length || !total) return [];
  const out: Highlight[] = [];
  const upfront = rows.filter((r) => /^Booking|^Down/.test(r.label)).reduce((a, r) => a + r.amount, 0);
  out.push({ tone: "info", text: `${((upfront * 100) / total).toFixed(0)}% (${money(upfront, { compact: true })}) is paid upfront — booking plus down payment.` });
  let run = 0;
  const half = rows.find((r) => (run += r.amount) >= total / 2);
  if (half) out.push({ tone: "info", text: `Half the price is collected by ${date(half.due_date)} — ${monthsBetween(start, half.due_date)} months after booking.` });
  const inst = rows.filter((r) => /^Installment/.test(r.label));
  const last = rows[rows.length - 1];
  const tenure = Math.max(1, monthsBetween(start, last.due_date));
  if (inst.length) out.push({ tone: "good", text: `${inst.length} installments of ${money(inst[0].amount, { compact: true })}; the buyer's average outlay is ${money((total - upfront) / tenure, { compact: true })} a month after the upfront part.` });
  const big = [...rows].sort((a, b) => b.amount - a.amount)[0];
  if (!/^Booking|^Down/.test(big.label)) out.push({ tone: "warn", text: `Largest single payment after booking: ${big.label} ${money(big.amount, { compact: true })} on ${date(big.due_date)} — remind the buyer ahead of it.` });
  out.push({ tone: "info", text: `Fully paid by ${date(last.due_date)} (${tenure} months) in ${rows.length} payments.` });
  return out;
}

export function PlanPreview({ values }: { values: DocValues }) {
  const [price, setPrice] = useState(10_000_000);
  const [start, setStart] = useState(todayISO());
  const [plan, setPlan] = useState("");
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  useEffect(() => {
    const id = setTimeout(() => setPlan(JSON.stringify({ doctype: "RE Payment Plan", ...values })), 350);
    return () => clearTimeout(id);
  }, [values]);
  const { data: sizes } = useQuery({ queryKey: ["plan-prices"], queryFn: () => get<{ prices: { name: string; price: number }[] }>("realestate.spa.plan_overview"), staleTime: 300_000 });
  const { data, error, isFetching } = useQuery({
    queryKey: ["plan-preview", plan, price, start], enabled: Boolean(plan && price > 0), retry: false, placeholderData: (p) => p,
    queryFn: () => get<Preview>("realestate.real_estate.doctype.re_payment_plan.re_payment_plan.preview", { plan, price, booking_date: start }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const byKind = useMemo(() => {
    const m = new Map<string, { amount: number; n: number; color: string }>();
    rows.forEach((r) => { const k = kindOf(r.label); const v = m.get(k.key) ?? { amount: 0, n: 0, color: k.color }; v.amount += r.amount; v.n += 1; m.set(k.key, v); });
    return [...m.entries()];
  }, [rows]);
  const chart = useMemo(() => {
    let run = 0;
    return rows.map((r) => { run += r.amount; return { ...r, x: date(r.due_date), cum: total ? (run * 100) / total : 0, color: kindOf(r.label).color }; });
  }, [rows, total]);
  const years = useMemo(() => {
    const m = new Map<string, Row[]>();
    rows.forEach((r) => { const y = r.due_date.slice(0, 4); m.set(y, [...(m.get(y) ?? []), r]); });
    let run = 0;
    return [...m.entries()].map(([y, rs]) => { const sum = rs.reduce((a, r) => a + r.amount, 0); run += sum; return { y, rs, sum, cum: total ? (run * 100) / total : 0 }; });
  }, [rows, total]);
  const inst = rows.filter((r) => /^Installment/.test(r.label));
  const upfront = rows.filter((r) => /^Booking|^Down/.test(r.label)).reduce((a, r) => a + r.amount, 0);
  const last = rows[rows.length - 1];
  const tenure = last ? Math.max(0, monthsBetween(start, last.due_date)) : 0;
  const toggleYear = (y: string) => setOpenYears((s) => { const n = new Set(s); if (n.has(y)) n.delete(y); else n.add(y); return n; });

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      {/* header & controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-white shadow-md shadow-teal-500/30"><CalendarRange className="size-4" /></span>
          <div>
            <h3 className="font-semibold">Schedule preview {isFetching && <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-primary align-middle" />}</h3>
            <p className="text-xs text-muted-foreground">Updates as you edit the plan · pick a plot price and booking date</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">Price
            <input type="number" className="field h-8 w-36" value={price} step={100000} min={0} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
          </label>
          <label className="flex items-center gap-1.5">Booked on
            <input type="date" className="field h-8 w-36" value={start} onChange={(e) => setStart(e.target.value || todayISO())} />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(sizes?.prices ?? []).map((s) => (
          <button key={s.name} type="button" onClick={() => setPrice(s.price)}
            className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition", price === s.price ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {s.name} · {money(s.price, { compact: true })}
          </button>
        ))}
        <input type="range" min={1_000_000} max={50_000_000} step={100_000} value={Math.min(price, 50_000_000)} onChange={(e) => setPrice(Number(e.target.value))}
          className="ml-auto w-48 accent-[hsl(var(--primary))]" aria-label="Sample price" />
      </div>

      {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{(error as Error).message}</p> : !rows.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Fill in the plan's percentages to see its schedule.</p>
      ) : (
        <>
          {/* tiles */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <Tile icon={Coins} label="Upfront" value={money(upfront, { compact: true })} sub={`${((upfront * 100) / total).toFixed(0)}% · booking + down`} color="#6366f1" />
            <Tile icon={Repeat} label="Installment" value={inst.length ? money(inst[0].amount, { compact: true }) : "—"} sub={inst.length ? `× ${inst.length} · ${String(values.frequency ?? "Monthly").toLowerCase()}` : "none"} color="#14b8a6" />
            <Tile icon={Flag} label="Balloons & charges" value={money(byKind.filter(([k]) => k === "Balloon" || k === "Development").reduce((a, [, v]) => a + v.amount, 0), { compact: true })}
              sub={`${byKind.filter(([k]) => k === "Balloon" || k === "Development").reduce((a, [, v]) => a + v.n, 0)} payments`} color="#f59e0b" />
            <Tile icon={Landmark} label="On possession" value={money(byKind.find(([k]) => k === "Possession")?.[1].amount ?? 0, { compact: true })} sub="last payment" color="#8b5cf6" />
            <Tile icon={CalendarClock} label="Tenure" value={`${tenure} months`} sub={last ? `ends ${date(last.due_date)} · ${num(rows.length)} payments` : ""} color="#0ea5e9" />
          </div>

          {/* composition */}
          <div>
            <div className="flex h-3.5 overflow-hidden rounded-full ring-1 ring-inset ring-border">
              {byKind.map(([k, v]) => <div key={k} title={`${k}: ${money(v.amount)}`} style={{ width: `${(v.amount * 100) / total}%`, background: v.color }} className="transition-all" />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {byKind.map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: v.color }} />{k}
                  <b>{money(v.amount, { compact: true })}</b><span className="text-muted-foreground">{((v.amount * 100) / total).toFixed(0)}%{v.n > 1 ? ` · ${v.n}×` : ""}</span></span>
              ))}
            </div>
          </div>

          {/* cumulative chart */}
          <div className="h-60 rounded-xl border bg-background/50 p-2">
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="x" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={30} />
                <YAxis yAxisId="a" tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={46} />
                <YAxis yAxisId="c" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={38} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (Row & { cum: number }) | undefined;
                  if (!active || !r) return null;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold">{r.label}</p><p className="text-muted-foreground">{date(r.due_date)}</p>
                      <p className="mt-1 tabular-nums">{money(r.amount)} · <span className="text-muted-foreground">{r.cum.toFixed(0)}% paid</span></p>
                    </div>
                  );
                }} />
                <Bar yAxisId="a" dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={18}>
                  {chart.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
                <Line yAxisId="c" dataKey="cum" type="stepAfter" stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <Highlights items={insights(rows, total, start)} />

          {/* year by year */}
          <div className="overflow-hidden rounded-xl border">
            {years.map(({ y, rs, sum, cum }) => {
              const open = openYears.has(y);
              return (
                <div key={y} className="border-b last:border-0">
                  <button type="button" onClick={() => toggleYear(y)} aria-expanded={open}
                    className="flex w-full items-center gap-3 bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted/70">
                    <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
                    <b className="w-12">{y}</b>
                    <span className="flex flex-1 gap-[2px]">{rs.map((r, i) => <span key={i} title={`${r.label} · ${money(r.amount, { compact: true })}`} className="h-2.5 flex-1 rounded-[2px]" style={{ background: kindOf(r.label).color, maxWidth: 18 }} />)}</span>
                    <span className="text-xs text-muted-foreground">{rs.length} payments</span>
                    <b className="w-24 text-right tabular-nums">{money(sum, { compact: true })}</b>
                    <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{cum.toFixed(0)}%</span>
                  </button>
                  {open && (
                    <table className="w-full text-sm">
                      <tbody>{rs.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 pl-10"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: kindOf(r.label).color }} />{r.label}</td>
                          <td className="px-3 text-muted-foreground">{date(r.due_date)}</td>
                          <td className="px-3 text-right tabular-nums">{money(r.amount)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between bg-muted/60 px-3 py-2 text-sm font-semibold">
              <span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-primary" />{num(rows.length)} payments</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Click a year to see its payments. <button type="button" className="text-primary hover:underline" onClick={() => setOpenYears(new Set(years.map((y) => y.y)))}>Expand all</button></p>
        </>
      )}
    </section>
  );
}

function Tile({ icon: Icon, label, value, sub, color }: { icon: typeof Coins; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-background/60 p-3">
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Icon className="size-3.5" style={{ color }} />{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums tracking-tight">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
