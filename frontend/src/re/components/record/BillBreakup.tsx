/** Society bill list: the charge breakup on each row ("Maintenance 3,000 · Security 800 · …"). Rows on a page are
 *  fetched together — one realestate.spa.bill_charges call per page, not one per row. */
import { useQuery } from "@tanstack/react-query";
import { get } from "@/re/lib/api";

type Charges = [string, number][];
interface Batch { names: Set<string>; waiters: ((m: Record<string, Charges>) => void)[] }
let pending: Batch | null = null;

function load(name: string): Promise<Charges> {
  if (!pending) {
    const batch: Batch = { names: new Set<string>(), waiters: [] };
    pending = batch;
    setTimeout(() => {
      pending = null;
      void get<Record<string, Charges>>("realestate.spa.bill_charges", { names: JSON.stringify([...batch.names]) })
        .then((m) => batch.waiters.forEach((w) => w(m)), () => batch.waiters.forEach((w) => w({})));
    }, 20);
  }
  const batch = pending as Batch;
  batch.names.add(name);
  return new Promise((resolve) => batch.waiters.push((m) => resolve(m[name] ?? [])));
}

const SHORT: Record<string, string> = { "Garbage Collection": "Garbage", "Park Maintenance": "Park", "Street Light": "Lights" };
const fmt = (v: number) => v.toLocaleString("en-PK", { maximumFractionDigits: 0 });

export function BillBreakup({ name }: { name: string }) {
  const { data } = useQuery({ queryKey: ["bill-charges", name], queryFn: () => load(name), staleTime: 60_000 });
  if (!data) return <span className="inline-block h-3 w-40 animate-pulse rounded bg-muted" />;
  if (!data.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex max-w-[34rem] flex-wrap gap-1" title={data.map(([c, a]) => `${c}: Rs ${fmt(a)}`).join("\n")}>
      {data.map(([c, a]) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] leading-none">
          <span className="text-muted-foreground">{SHORT[c] ?? c}</span><span className="font-semibold tabular-nums">{fmt(a)}</span>
        </span>
      ))}
    </div>
  );
}
