import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  Globe,
  HelpCircle,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { AreaChart, BarChart, DonutChart } from "@/components/charts/charts";
import { cn } from "@/utils/cn";
import { HeroHoneycomb } from "./HeroHoneycomb";
import { IndustriesSection } from "./IndustriesSection";
import { HEX_CELLS } from "./hero-honeycomb-data";
import {
  BI_GOVERNANCE,
  BI_MOCK_SERIES,
  BI_PIPELINE,
  BI_PLATFORMS,
  COMPANY,
  DASHBOARDS,
  FAQS,
  MODULES,
  PRICING,
} from "./website-data";

/** Anchor targets used by the sticky header. Kept at module scope so the
 * scroll-spy hook sees a stable dependency. */
const SECTIONS = [
  { id: "profile", label: "Company" },
  { id: "industries", label: "Industries" },
  { id: "modules", label: "Modules" },
  { id: "dashboards", label: "Dashboards" },
  { id: "bi", label: "Business Intelligence" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

/** All sections share this so the sticky header never covers a heading. */
const SECTION_CLASS = "scroll-mt-24";

/** Highlights whichever section currently occupies the upper viewport band. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      // Bias the band towards the top of the viewport so a section becomes
      // "current" as it scrolls in, rather than once it fills the screen.
      { rootMargin: "-96px 0px -60% 0px", threshold: [0.05, 0.3, 0.7] },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

/** Sticky, glassy header with anchor navigation, theme toggle and a CTA. */
function SiteHeader({ active }: { active: string }) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl dark:border-white/10 dark:bg-transparent">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <a href="#top" className="flex items-center gap-2.5" aria-label={COMPANY.legalName}>
          <Logo variant="full" className="h-9 w-auto" />
        </a>

        <nav className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active === section.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="primary" size="sm" onClick={() => navigate("/login")}>
            <Sparkles className="h-4 w-4" />
            Sign in to ERP
          </Button>
        </div>
      </div>
    </header>
  );
}
/** Shared section heading: small eyebrow, big title, muted description. */
function SectionHeading({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  /** Optional icon shown in a small chip before the eyebrow text. */
  eyebrowIcon?: LucideIcon;
  title: ReactNode;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary dark:border-white/10 dark:bg-white/5"
      >
        {EyebrowIcon && <EyebrowIcon className="h-3.5 w-3.5 shrink-0" />}
        {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/** Hexagon used by the hub mark — same proportions as the hero hub in website-micromax.html. */
const HEXAGON_CLIP = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";

/**
 * Centre image: the MicroMax hub over a line drawing of a skyline. Both are
 * ported from the hero of website-micromax.html (its hub mark and its
 * static city scene) and recoloured with the app's theme tokens.
 */
function HeroHub() {
  return (
    <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card/40 dark:border-white/10 dark:bg-white/5">
      <svg
        aria-hidden
        viewBox="0 0 520 360"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
        className="absolute inset-0 h-full w-full"
      >
        <g className="stroke-primary" strokeWidth="1" opacity="0.55">
          <rect x="80" y="200" width="50" height="70" />
          <rect x="140" y="170" width="50" height="100" />
          <rect x="200" y="140" width="60" height="130" />
          <rect x="270" y="110" width="50" height="160" />
          <rect x="330" y="170" width="60" height="100" />
          <rect x="400" y="190" width="50" height="80" />
        </g>
        <g className="stroke-sky-500" strokeWidth="1" opacity="0.4">
          <line x1="0" y1="280" x2="520" y2="280" />
          <line x1="0" y1="300" x2="520" y2="300" />
          <line x1="250" y1="80" x2="250" y2="340" />
        </g>
      </svg>

      <Link
        to="/home"
        aria-label="Open the ERP"
        className="group relative flex h-[6.5rem] w-[7.5rem] items-center justify-center bg-gradient-to-br from-primary via-emerald-500 to-sky-500 text-white shadow-lg transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-none"
        style={{ clipPath: HEXAGON_CLIP }}
      >
        <span className="flex flex-col items-center text-lg font-semibold leading-[1.05] tracking-tight">
          <span>MicroMax</span>
          <span className="text-sm font-medium opacity-80">ERP</span>
        </span>
      </Link>
    </div>
  );
}

/** Cells shown in the compact card, by title; they are looked up in the honeycomb's own data. */
const SHOWCASE_TITLES = [
  "Invoicing",
  "Selling",
  "MRQ",
  "Stocks",
  "PPC",
  "Banks",
  "Financial",
  "Import",
  "LCV",
  "Approvals",
  "POS",
];
const SHOWCASE_CELLS = SHOWCASE_TITLES.flatMap((title) => HEX_CELLS.filter((cell) => cell.title === title));

/**
 * Compact hero card for screens too narrow for the honeycomb: the brand hub
 * and the same module cells, from the same data, as a plain grid.
 */
function HeroShowcase() {
  return (
    <Card className="animate-fade-in border-primary/20 p-5 shadow-lg dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{MODULES.length} modules, one system of record</p>
          <p className="text-xs text-muted-foreground">From buying to the ledger, on one platform</p>
        </div>
        <Badge variant="info" dot>
          ERPNext core
        </Badge>
      </div>

      <div className="mt-4">
        <HeroHub />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SHOWCASE_CELLS.map((cell) => {
          const Icon = cell.icon;
          return (
            <a
              key={cell.title}
              href="#modules"
              className="hover-lift flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 p-2 dark:border-white/10 dark:bg-white/5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{cell.title}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {cell.back.join(" ")}
                </span>
              </span>
            </a>
          );
        })}
        <a
          href="#modules"
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-2 text-center transition-colors hover:border-primary/40 hover:text-primary dark:border-white/20"
        >
          <span className="text-sm font-semibold">All modules</span>
          <span className="text-[10px] text-muted-foreground">see the full list</span>
        </a>
      </div>
    </Card>
  );
}

/** Below this width the hero shows the compact card instead of the honeycomb (matches the `xl:` grid). */
const HONEYCOMB_MIN_WIDTH = "(min-width: 1280px)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Hero — brand promise on the left, the module / role showcase on the right.
 */
function HeroSection() {
  const navigate = useNavigate();
  const wide = useMediaQuery(HONEYCOMB_MIN_WIDTH);

  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow — echoes the app's dark-mode teal/indigo treatment. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-[-6rem] h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24 xl:max-w-[88rem] xl:grid-cols-[minmax(27rem,1fr)_minmax(0,810px)] xl:gap-8">
        <div className="animate-fade-in">
          <Badge variant="primary" dot className="px-3 py-1">
            {COMPANY.legalName}
          </Badge>

          <h1 className="mt-5 max-w-[36rem] text-balance text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl xl:text-[2.15rem] min-[1360px]:text-[2.4rem]">
            One system of record for{" "}
            <span className="bg-gradient-to-r from-primary via-emerald-500 to-sky-500 bg-clip-text text-transparent">
              trading, manufacturing, distribution, POS, hospitals and education
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {COMPANY.intro}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => navigate("/home")}>
              Open the ERP
              <ArrowRight className="h-4 w-4" />
            </Button>
            <a
              href="#industries"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-6 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              See it by industry
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {COMPANY.stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* The full honeycomb needs room (and loads Three.js); narrower screens get the compact card. */}
        {wide ? <HeroHoneycomb /> : <HeroShowcase />}
      </div>
    </section>
  );
}

/** Company profile — who we are, what we run on, and how we operate. */
function ProfileSection() {
  return (
    <section
      id="profile"
      className={cn("border-t border-border/70 dark:border-white/10", SECTION_CLASS)}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <SectionHeading
          eyebrow="Company profile"
          title={`Built by ${COMPANY.legalName}`}
          description={COMPANY.tagline}
        />

        <div className="mt-10 lg:columns-2 lg:gap-12">
          {COMPANY.about.map((paragraph) => (
            <p
              key={paragraph.slice(0, 24)}
              className="mb-4 break-inside-avoid text-sm leading-relaxed text-muted-foreground sm:text-base"
            >
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMPANY.values.map((value) => {
            const Icon = value.icon;
            return (
              <Card key={value.title} className="hover-lift p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-semibold">{value.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {value.description}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Full module & feature catalogue — the scope available in every deployment. */
function ModulesSection() {
  const totalFeatures = MODULES.reduce((sum, module) => sum + module.features.length, 0);

  return (
    <section id="modules" className={cn("border-t border-border/70 dark:border-white/10", SECTION_CLASS)}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            eyebrow="Modules & features"
            title="Everything included in the platform"
            description="Modules can be switched on per company and per role, so a trading house, a hospital and a school on the same instance each see only what concerns them."
          />
          <Badge variant="outline" className="w-fit px-3 py-1">
            {MODULES.length} modules · {totalFeatures} features
          </Badge>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.id} className="flex flex-col overflow-hidden">
                <div className={cn("flex items-center gap-3 border-b border-border/60 px-5 py-3 dark:border-white/10", module.tone)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="min-w-0 break-words text-sm font-semibold">{module.label}</h3>
                </div>

                <CardContent className="flex-1 p-5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {module.description}
                  </p>

                  <ul className="mt-4 space-y-1.5 border-t border-dashed border-border/60 pt-3 dark:border-white/10">
                    {module.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Renders whichever chart a dashboard snapshot declares. The `chart` field
 * is a discriminated union on `kind`, so TypeScript narrows to the right
 * branch — a donut dashboard cannot be given bar series, and vice versa.
 */
function DashboardChartView({ chart }: { chart: (typeof DASHBOARDS)[number]["chart"] }) {
  if (chart.kind === "donut") {
    return <DonutChart data={chart.slices} height={236} legend />;
  }
  if (chart.kind === "area") {
    return (
      <AreaChart data={chart.data} xKey={chart.xKey} series={chart.series} height={236} legend />
    );
  }
  return <BarChart data={chart.data} xKey={chart.xKey} series={chart.series} height={236} legend />;
}

/**
 * Dashboard snapshots — the standard screens we hand over, one tab each.
 * Figures are static illustrative samples (no API calls from a public
 * page); the panel says so rather than implying live numbers.
 */
function DashboardsSection() {
  const [activeId, setActiveId] = useState(DASHBOARDS[0].id);
  const dashboard = DASHBOARDS.find((d) => d.id === activeId) ?? DASHBOARDS[0];
  const Icon = dashboard.icon;

  return (
    <section
      id="dashboards"
      className={cn("border-t border-border/70 dark:border-white/10", SECTION_CLASS)}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            eyebrow="Dashboard snapshots"
            title="The screens your team runs the business from"
            description="Each dashboard ships ready to use on your own data — the same figures drive the on-screen view, the Power BI model and the Grafana panels."
          />
          <Badge variant="outline" className="w-fit px-3 py-1">
            {DASHBOARDS.length} dashboards
          </Badge>
        </div>

        {/* Dashboard switcher — wraps on desktop, scrolls on narrow screens. */}
        <div className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {DASHBOARDS.map((item) => {
            const ItemIcon = item.icon;
            const isActive = item.id === dashboard.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                aria-pressed={isActive}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground dark:border-white/10 dark:bg-white/5",
                )}
              >
                <ItemIcon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <Card className="mt-6 animate-fade-in p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  dashboard.tone,
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold">{dashboard.label}</h3>
                <p className="text-xs text-muted-foreground">{dashboard.subtitle}</p>
              </div>
            </div>
            <Badge variant="info" dot>
              Illustrative snapshot
            </Badge>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {dashboard.description}
          </p>

          {/* Headline figures */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {dashboard.kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-border/70 bg-card/60 p-3.5 dark:border-white/10 dark:bg-white/5"
              >
                <p className="text-[11px] font-medium text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 flex items-baseline gap-1.5 text-xl font-semibold tabular-nums">
                  {kpi.value}
                  <span
                    className={cn(
                      "inline-flex items-center text-[11px] font-medium",
                      kpi.up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500",
                    )}
                  >
                    {kpi.up ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {kpi.delta}
                  </span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-border/70 bg-card/40 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                {dashboard.chart.caption}
              </p>
              <DashboardChartView chart={dashboard.chart} />
            </div>

            <div className="rounded-lg border border-dashed border-border/70 p-4 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What it answers
              </p>
              <ul className="mt-3 space-y-2">
                {dashboard.insights.map((insight) => (
                  <li
                    key={insight}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="leading-relaxed">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

/**
 * Business Intelligence — the two platforms we ship on top of ERP data.
 * Power BI covers governed analytical reporting; Grafana covers real-time
 * operational monitoring and alerting.
 */
function BiSection() {
  return (
    <section
      id="bi"
      className={cn(
        "border-t border-border/70 bg-muted/30 dark:border-white/10 dark:bg-white/[0.02]",
        SECTION_CLASS,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <SectionHeading
          eyebrow="BI section"
          title="Analytics on top of the ledger — Power BI and Grafana"
          description="The ERP is the system of record; analytics never fork it. We publish read-only views and build two complementary layers on top: governed executive reporting in Microsoft Power BI, and live operational monitoring in Grafana."
        />

        {/* Source → model → visualise → act */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BI_PIPELINE.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="relative p-5">
                <span className="absolute right-4 top-4 text-xs font-semibold text-muted-foreground/60 tabular-nums">
                  0{index + 1}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-semibold">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {BI_PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            return (
              <Card key={platform.id} className="flex flex-col overflow-hidden">
                <div className="flex items-start gap-3 border-b border-border/70 bg-card/60 p-5 dark:border-white/10 dark:bg-white/5">
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                      platform.tone,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight">{platform.name}</h3>
                    <p className="text-xs font-medium text-primary">{platform.role}</p>
                  </div>
                </div>

                <CardContent className="flex flex-1 flex-col p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">{platform.summary}</p>

                  <ul className="mt-5 space-y-2">
                    {platform.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="leading-relaxed text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex items-start gap-2 rounded-lg bg-primary/5 p-3 dark:bg-white/5">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {platform.connection}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Governance + a live-looking operations preview */}
        <div className="mt-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="p-5">
            <p className="text-sm font-semibold">Governance built in</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Analytics access mirrors ERP access — nothing more, nothing less.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {BI_GOVERNANCE.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.label}
                    className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-xs dark:border-white/10"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item.label}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Operations monitoring</p>
                <p className="text-xs text-muted-foreground">
                  Documents posted vs. alerts raised — illustrative preview
                </p>
              </div>
              <Badge variant="success" dot>
                Grafana
              </Badge>
            </div>
            <div className="mt-4">
              <BarChart
                data={BI_MOCK_SERIES}
                xKey="day"
                height={200}
                legend
                series={[
                  { key: "docs", label: "Documents posted" },
                  { key: "alerts", label: "Alerts raised" },
                ]}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />
              Threshold breaches notify email, Slack or Telegram within seconds.
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

/**
 * Pricing — two real paths: free self-hosting under ERPNext's GPLv3 licence,
 * or a scoped, custom-quoted implementation managed by MicroMax end to end.
 * No invented list prices; the managed tier is honestly a "talk to us".
 */
function PricingSection() {
  return (
    <section
      id="pricing"
      className={cn(
        "border-t border-border/70 bg-muted/30 dark:border-white/10 dark:bg-white/[0.02]",
        SECTION_CLASS,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <SectionHeading
          eyebrow="Pricing"
          title="Two paths. Run it yourself, or let us run it for you."
          description="ERPNext's core is open source, so self-hosting never costs a licence fee. When you want us to implement, host and support it, the quote is scoped to your modules, users and hosting choice — not a one-size list price."
          align="center"
        />

        <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
          {PRICING.map((tier) => {
            const Icon = tier.icon;
            return (
              <Card
                key={tier.id}
                className={cn(
                  "relative flex flex-col overflow-hidden p-6",
                  tier.highlighted && "border-primary/40 shadow-lg dark:border-primary/40",
                )}
              >
                {tier.highlighted && (
                  <Badge variant="primary" className="absolute right-5 top-5 w-fit">
                    Recommended
                  </Badge>
                )}

                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>

                <h3 className="mt-4 text-lg font-semibold tracking-tight">{tier.name}</h3>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
                  <span className="text-xs text-muted-foreground">{tier.period}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {tier.description}
                </p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="leading-relaxed text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#contact"
                  className={cn(
                    "mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-6 text-sm font-medium transition-colors",
                    tier.highlighted
                      ? "bg-primary text-primary-foreground hover:brightness-110"
                      : "border border-input hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {tier.cta}
                </a>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** FAQ — an accordion of the questions a prospect asks before a demo call. */
function FaqSection() {
  return (
    <section id="faq" className={cn("border-t border-border/70 dark:border-white/10", SECTION_CLASS)}>
      <div className="mx-auto w-full max-w-3xl px-4 py-16 lg:py-20">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions we get before the first call"
          align="center"
        />

        <div className="mt-10 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border border-border/70 bg-card/60 open:bg-card px-5 py-4 dark:border-white/10 dark:bg-white/5 dark:open:bg-white/[0.07]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium marker:content-none">
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                  {item.question}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 pl-[26px] text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Contact / closing CTA — the conversion block at the end of the page. */
function ContactSection() {
  const navigate = useNavigate();
  const details = [
    { icon: MapPin, label: "Head office", value: COMPANY.contact.address },
    { icon: Phone, label: "Phone", value: COMPANY.contact.phone },
    { icon: Mail, label: "Email", value: COMPANY.contact.email },
    { icon: Globe, label: "Web", value: COMPANY.contact.website },
  ];

  return (
    <section id="contact" className={cn("border-t border-border/70 dark:border-white/10", SECTION_CLASS)}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:py-20">
        <Card className="relative overflow-hidden border-primary/25 p-6 sm:p-10 dark:border-white/10">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
            <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <SectionHeading
                eyebrow="Contact us"
                title="Talk to the team that builds it"
                description="Tell us how you buy, produce and ship today. We will map it onto the platform and come back with a scoped implementation plan — modules, data migration, dashboards and timeline."
              />

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg" onClick={() => navigate("/login")}>
                  Sign in to the ERP
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <a
                  href={`mailto:${COMPANY.contact.email}`}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-6 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Mail className="h-4 w-4" />
                  Request a demo
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {details.map((detail) => {
                const Icon = detail.icon;
                return (
                  <div
                    key={detail.label}
                    className="flex items-start gap-3 rounded-lg border border-border/70 bg-card/60 p-3.5 dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{detail.label}</p>
                      <p className="break-words text-sm font-medium">{detail.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border/70 dark:border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo variant="full" className="h-8 w-auto" />
          <span className="text-xs text-muted-foreground">© {new Date().getFullYear()}</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
          <a
            href="/login"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            ERP login
          </a>
        </nav>

        <p className="text-xs text-muted-foreground">
          Built on ERPNext / Frappe · Analytics by Power BI &amp; Grafana
        </p>
      </div>
    </footer>
  );
}

/**
 * Public company website for MicroMax Erp Pvt Ltd.
 *
 * Marketing page (no session required) covering the company profile, the
 * industries and modules we implement, and the Power BI / Grafana analytics
 * layer. All copy and data live in ./website-data.ts so the layout never has
 * to change to keep the content current.
 */
export function CompanyWebsitePage() {
  const active = useActiveSection(SECTION_IDS);

  return (
    <div
      id="top"
      className="min-h-screen bg-background text-foreground dark:bg-transparent"
    >
      <SiteHeader active={active} />
      <main>
        <HeroSection />
        <ProfileSection />
        <IndustriesSection
          className={cn(
            "border-t border-border/70 bg-muted/30 dark:border-white/10 dark:bg-white/[0.02]",
            SECTION_CLASS,
          )}
          heading={
            <SectionHeading
              eyebrow="Built for your industry"
              eyebrowIcon={Building2}
              title={
                <>
                  One platform, shaped to how you <span className="italic text-primary">build</span>.
                </>
              }
              description="Pick the kind of business you run and the platform switches on exactly the modules it needs, already wired together in one shared database. Hover or tap an industry to watch its module honeycomb light up, grouped by discipline and linked as a single connected system."
            />
          }
        />
        <ModulesSection />
        <DashboardsSection />
        <BiSection />
        <PricingSection />
        <FaqSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
