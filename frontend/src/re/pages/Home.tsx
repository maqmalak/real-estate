/**
 * Real-estate home (/re/home), styled like the Desktop launcher: glossy app icons with a label and a short hint,
 * grouped like the sidebar under "SECTION · count ———" headers and filtered by role. Built from APP_NAVIGATION.re,
 * so it always matches the menu. Search narrows the icons; Enter opens the first match.
 */
import { LayoutGrid, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { APP_NAVIGATION, type NavGroup } from "@/app/navigation";
import { Logo } from "@/components/common/logo";
import { GlossyIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/useAuth";
import { useAuth as useReAuth } from "@/re/providers/auth";
import { cn } from "@/re/lib/utils";

/** A colour per destination (falls back to a per-section cycle) — mirrors the Desktop's colourful launcher. */
const HUE: Record<string, string> = {
  Dashboard: "blue", Today: "amber", "Society Map": "emerald", Plots: "indigo", Insights: "violet", Reports: "rose", "Acceptance checks": "teal",
  Bookings: "blue", Receipts: "green", "Sales Invoices": "sky", "Payment Entries": "cyan", Customers: "violet",
  "Operations Hub": "purple", Transfers: "sky", Cancellations: "red", "Re-allotments": "indigo", "Plot Merges": "teal", Surcharges: "orange", Commissions: "amber",
  "WhatsApp Inbox": "green", "Leads & Deals": "violet", "Site Visits": "emerald", "WhatsApp Chats": "teal", Broadcasts: "pink", "Reminder Log": "amber",
  "Society Bills": "orange", "Bulk Collection": "green", "Charge Heads": "sky", "Maintenance Plans": "indigo", Infrastructure: "stone",
  Overview: "orange", "Material Requests": "amber", "Purchase Orders": "blue", "Purchase Receipts": "teal", "Purchase Invoices": "rose", "Stock Entries": "cyan", Assets: "stone",
  Documents: "violet", Generated: "pink", Vault: "purple",
  Projects: "emerald", Blocks: "sky", "Plot Records": "indigo", "Plot Sizes": "lime", "Payment Plans": "amber", "Map Import": "cyan", "Quick Replies": "yellow",
  "Users & Roles": "red", Settings: "slate",
};
const CYCLE = ["blue", "emerald", "violet", "amber", "rose", "teal", "orange", "indigo", "pink", "sky"];

/** Short hint under each icon (like "Society Dashboard" / "GPS Plot Map" on the Desktop). */
const HINT: Record<string, string> = {
  Dashboard: "KPIs · Collections", Today: "Visits · Follow-ups", "Society Map": "GPS Plot Map", Plots: "Inventory · Cards", Insights: "Analytics",
  Reports: "Excel · PDF", "Acceptance checks": "Spec checks", Bookings: "Plans · Schedules", Receipts: "Payment Entries", "Sales Invoices": "Installments",
  "Payment Entries": "Ledger postings", Customers: "Owners · CNIC", "Operations Hub": "Approvals · Recovery", Transfers: "Change of owner",
  Cancellations: "Refunds", "Re-allotments": "New buyer", "Plot Merges": "Combine plots", Surcharges: "Late payment", Commissions: "Agents · Dealers",
  "WhatsApp Inbox": "Team chats", "Leads & Deals": "CRM pipeline", "Site Visits": "Schedule · Outcome", "WhatsApp Chats": "Conversations",
  Broadcasts: "Campaigns", "Reminder Log": "WhatsApp · SMS", "Society Bills": "Monthly · Plot-wise", "Bulk Collection": "Collect many",
  "Charge Heads": "Rates", "Maintenance Plans": "Recurring jobs", Infrastructure: "Assets · Progress", Overview: "Budgets · Costs",
  "Material Requests": "Site needs", "Purchase Orders": "Suppliers", "Purchase Receipts": "Goods in", "Purchase Invoices": "Bills", "Stock Entries": "Issues",
  Assets: "Fixed assets", Documents: "Letters", Generated: "Versions", Vault: "NOCs · Expiry", Projects: "Scheme", Blocks: "Layout", "Plot Records": "Master",
  "Plot Sizes": "Marla · Price", "Payment Plans": "Templates", "Map Import": "KML · GeoJSON", "Quick Replies": "Chat snippets", "Users & Roles": "Access",
  Settings: "Rates · WhatsApp",
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{count}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export function HomePage() {
  const { hasRole } = useAuth();
  const { boot } = useReAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (APP_NAVIGATION.re ?? [])
      .map((g: NavGroup) => ({
        ...g,
        items: g.items.filter((i) => i.to !== "/re/home" && (!i.roles || i.roles.length === 0 || hasRole(...i.roles))
          && (!term || `${i.label} ${HINT[i.label] ?? ""} ${g.title ?? ""}`.toLowerCase().includes(term))),
      }))
      .filter((g) => g.items.length > 0);
  }, [q, hasRole]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const first = boot?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* greeting row, as on the Desktop */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo variant="mark" className="h-10 w-auto shrink-0" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{greeting()}, {first}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Zarmeen Gardens · {total} places you can open</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input aria-label="Find a page" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { const hit = groups[0]?.items[0]; if (e.key === "Enter" && hit) navigate(hit.to); }}
              placeholder="Find… (Enter opens)" className="field h-9 pl-8 text-sm" />
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      {groups.map((g, gi) => (
        <section key={g.title}>
          <SectionTitle count={g.items.length}>{g.title}</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,120px)]">
            {g.items.map((i, ii) => {
              const hue = HUE[i.label] ?? CYCLE[(gi * 3 + ii) % CYCLE.length];
              return (
                <Link key={i.to + i.label} to={i.to} title={`${i.label} — ${HINT[i.label] ?? g.title}`}
                  className={cn("group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center outline-none transition",
                    "hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary")}>
                  <GlossyIcon icon={i.icon ?? LayoutGrid} hue={hue} />
                  <span className="w-full truncate text-[13px] font-semibold leading-tight">{i.label}</span>
                  <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{HINT[i.label] ?? g.title}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="py-10 text-center text-sm text-muted-foreground">No page matches “{q}”.</p>}
    </div>
  );
}
