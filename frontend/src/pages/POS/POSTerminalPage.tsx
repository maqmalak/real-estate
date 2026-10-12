import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  Award, Banknote, CalendarClock, ChevronDown, CreditCard, Gift, History, Keyboard, LayoutDashboard, LayoutGrid, List, LogOut, MessageSquare,
  Minus, PauseCircle, Percent, Phone, Plus, Printer, ScanBarcode, ShoppingBag, Store, Tag, Ticket, Trash2, User,
  UserPlus, Wallet, X, ReceiptText, PackagePlus, MonitorDown, Bell, BellRing, CheckCheck, AlertTriangle, PackageX, PackageMinus, Eye, Undo2, Lock, Clock, CheckCircle2, Search, Landmark, Smartphone, SplitSquareHorizontal, CloudOff, Wifi, RefreshCw, HandCoins, FileText, Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationLog } from "@/hooks/useNotificationLog";
import { docUrl } from "@/app/doc-routes";
import { formatMoney } from "@/utils/currency";
import {
  consumeBundleStock, isNetworkError, kvGet, kvSet, loadBundle, localDate, localTime, localTotals, refreshBundle,
  searchBundle, usePosSync, usePwaInstall, uuid, type OfflineBundle, type QueuedSale, type ReceiptData, type SyncState,
} from "./pos-offline";
import { desktop, loadPrinter, printHtml, printReceipt, PrinterSettingsDialog, receiptHtml, ReceiptPreview, shiftReportHtml, type ShiftReport } from "./pos-receipt";
import { InvoicesDialog, printUrl, ReceiveDuesDialog, SyncDialog } from "./pos-panels";

interface Profile {
  name: string; company: string; warehouse: string; price_list: string; currency: string; customer: string;
  allow_rate_change?: number; allow_discount_change?: number; print_format?: string; allow_partial_payment?: number; write_off_limit?: number;
  hide_unavailable_items?: number; hide_images?: number; auto_add_item_to_cart?: number; print_receipt_on_order_complete?: number;
  payments: { mode_of_payment: string; default: number }[]; item_groups: string[];
}
interface Ctx { profiles: { name: string; company: string }[]; shift: { name: string; pos_profile: string; period_start_date: string } | null; profile: Profile | null; cashier: string }
interface Item { item_code: string; item_name: string; price_list_rate: number; actual_qty: number; uom: string; stock_uom?: string; item_image?: string; is_stock_item?: number; batch_no?: string; serial_no?: string }
interface Line {
  key: string; item_code: string; item_name: string; qty: number; uom: string; price_list_rate: number; rate?: number;
  discount_percentage?: number; stock: number; batch_no?: string; serial_no?: string;
  /** Discount entered as "%" (discount_percentage) or "amt" — Rs off the whole line (discount_line_amt). */
  disc_mode?: "pct" | "amt"; discount_line_amt?: number;   // default "amt" (Rs) — see lineMode()
  /** Half portion: each counted unit is 0.5 qty (qty stays the number of portions on screen). */
  half?: boolean;
  /** Menu portion (Plate / non-stock Kg items): see PORTIONS. qty = number of such portions. */
  portion?: string;
  /** Rs portion: the amount for one portion (qty becomes amount ÷ price). */
  rs?: number;
  stockItem?: boolean;
}

/** Menu portions by unit: Plate → Single / Full / Rs; Kg (non-stock dishes) → ½ / ¾ / 1 / 1½ Kg / Rs. Nos → plain quantity. */
const PORTIONS: Record<string, { key: string; label: string; factor?: number }[]> = {
  Plate: [{ key: "single", label: "Single", factor: 0.5 }, { key: "full", label: "Full", factor: 1 }, { key: "rs", label: "Rs" }],
  Kg: [{ key: "half", label: "½ Half", factor: 0.5 }, { key: "qtr", label: "¾ Qtr", factor: 0.75 }, { key: "full", label: "Kg Full", factor: 1 },
    { key: "one_half", label: "1½ Kgs", factor: 1.5 }, { key: "rs", label: "Rs" }],
};
const portionsFor = (l: Pick<Line, "uom" | "stockItem">) => (l.uom === "Plate" ? PORTIONS.Plate : l.uom === "Kg" && !l.stockItem ? PORTIONS.Kg : null);
/** Plate → Single; Kg dishes → ½ Half, except fish which is sold by the full Kg. */
const defaultPortion = (uom: string, stockItem?: boolean, isFish?: boolean) =>
  uom === "Plate" ? "single" : uom === "Kg" && !stockItem ? (isFish ? "full" : "half") : undefined;
/** One Rs portion → (qty per portion rounded to 3 places, rate that makes the amount exact). */
const rsPortion = (amount: number, price: number) => {
  const q = Math.max(0.001, Math.round((amount / Math.max(price, 0.01)) * 1000) / 1000);
  return { q, rate: Math.round((amount / q) * 100) / 100 };
};
/** Per-item POS quantity presets (Item.mm_pos_default_qty / mm_pos_qty_options). */
type QtyPresets = Record<string, { default: number; options: number[] }>;
/** A line's discount mode — Rs unless the cashier switched it to %. */
const lineMode = (l: Pick<Line, "disc_mode">) => l.disc_mode ?? "amt";
/** Quantity actually sold for a line (portions × 0.5 when half). */
const soldQty = (l: Pick<Line, "qty" | "half" | "portion" | "rs" | "price_list_rate">) => {
  if (l.portion === "rs") return l.rs ? Math.round(rsPortion(l.rs, l.price_list_rate).q * l.qty * 1000) / 1000 : 0;
  const f = l.portion ? [...PORTIONS.Plate, ...PORTIONS.Kg].find((p) => p.key === l.portion)?.factor : undefined;
  if (f) return Math.round(f * l.qty * 1000) / 1000;
  return l.half ? l.qty * 0.5 : l.qty;
};
/** Short label for the portion badge on the cart line. */
const portionLabel = (l: Line) => (l.portion === "rs" ? (l.rs ? `Rs ${l.rs}` : "Rs") : portionsFor(l)?.find((p) => p.key === l.portion)?.label);
interface PreviewRow { item_code: string; item_name: string; qty: number; uom: string; rate: number; amount: number; price_list_rate: number; discount_percentage: number; pricing_rules?: string; is_free_item?: number }
interface Preview {
  net_total: number; total: number; discount_amount: number; total_taxes_and_charges: number; grand_total: number; rounded_total: number;
  additional_discount_percentage: number; items: PreviewRow[]; taxes: { description: string; tax_amount: number }[];
}
interface ItemOptions { item_code: string; stock_uom: string; has_batch_no: number; has_serial_no: number; uoms: { uom: string; conversion_factor: number }[];
  batches: { batch_no: string; qty: number; expiry_date?: string }[]; serials: string[]; actual_qty: number }
interface CustomerInfo { name: string; customer_name: string; mobile_no?: string; email_id?: string; customer_group?: string; outstanding: number; credit_limit: number;
  loyalty_program?: string; loyalty_points: number; conversion_factor?: number; tier_name?: string; last_purchase?: { name: string; posting_date: string; grand_total: number } }
interface Coupon { name: string; coupon_code: string; title?: string }
type Money = (v?: number) => string;

const unwrap = <T,>(r: unknown) => (r as { message?: T })?.message as T;
const initials = (s: string) => s.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const TINTS = ["from-sky-500 to-blue-600", "from-emerald-500 to-teal-600", "from-violet-500 to-indigo-600", "from-amber-500 to-orange-600", "from-rose-500 to-pink-600"];
const tint = (s: string) => TINTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const hasRules = (r?: string) => !!r && r !== "[]";
const today = () => new Date().toISOString().slice(0, 10);
const VIEW_KEY = "pos.view";
const readView = (): "grid" | "list" => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; } };

// item options (UOMs / batches / serials) are fetched once per item per session
const optionsCache = new Map<string, Promise<ItemOptions>>();
const itemOptions = (code: string, warehouse: string) => {
  const k = `${warehouse}|${code}`;
  if (!optionsCache.has(k)) optionsCache.set(k, getCall<ItemOptions>("mm_core.pos.item_options", { item_code: code, warehouse }));
  return optionsCache.get(k)!;
};

/**
 * /pos/terminal — the counter, modelled on POS Awesome: shift open / close with cash count, item grid or list with barcode,
 * batch and serial scan, UOM / batch / serial per line, ERPNext pricing rules and coupons, loyalty points, new customer from
 * the counter, multi-tender payment with change, credit sale and write-off, hold / resume, orders with full or partial returns.
 */
export default function POSTerminalPage() {
  const sync = usePosSync();
  const { data: ctxData, mutate: reloadCtx, isLoading, error: ctxError } = useFrappeGetCall<{ message: Ctx }>("mm_core.pos.get_context", undefined, "mm_core.pos.ctx",
    { shouldRetryOnError: false });
  const [cachedCtx, setCachedCtx] = useState<Ctx>();
  useEffect(() => { void kvGet<Ctx>("ctx").then(setCachedCtx); }, []);
  const liveCtx = unwrap<Ctx>(ctxData);
  useEffect(() => { if (liveCtx) void kvSet("ctx", liveCtx); }, [liveCtx]);
  useEffect(() => { if (ctxError && isNetworkError(ctxError)) sync.markOffline(); }, [ctxError, sync.markOffline]);
  const offline = !sync.online;
  const ctx = liveCtx ?? (offline || ctxError ? cachedCtx : undefined);
  const profile = ctx?.profile;
  const [bundle, setBundle] = useState<OfflineBundle>();
  const pullBundle = useCallback(async () => {
    if (!profile) return;
    try { setBundle(await refreshBundle(profile.name)); } catch (e) { if (isNetworkError(e)) sync.markOffline(); }
  }, [profile?.name, sync.markOffline]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!profile) return;
    void loadBundle(profile.name).then((b) => { if (b) setBundle(b); });
    if (sync.online) void pullBundle();
    const t = setInterval(() => { if (navigator.onLine) void pullBundle(); }, 10 * 60_000);
    return () => clearInterval(t);
  }, [profile?.name, sync.online, pullBundle]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = useCallback((v?: number) => formatMoney(v ?? 0, profile?.currency ?? "PKR"), [profile?.currency]);

  const [group, setGroup] = useState("");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"grid" | "list">(readView);
  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim()), 220); return () => clearTimeout(t); }, [term]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);
  const { data: itemData, isLoading: itemsLoading } = useFrappeGetCall<{ message: { items: Item[] } }>(
    "erpnext.selling.page.point_of_sale.point_of_sale.get_items",
    profile && !offline ? { start: 0, page_length: 80, price_list: profile.price_list, item_group: group, pos_profile: profile.name, search_term: debounced } : undefined,
    profile && !offline ? `pos.items.${profile.name}.${group}.${debounced}` : null, { keepPreviousData: true });
  const allItems: Item[] = offline ? searchBundle(bundle, debounced, group) : unwrap<{ items: Item[] }>(itemData)?.items ?? [];
  const items = profile?.hide_unavailable_items ? allItems.filter((i) => !i.is_stock_item || i.actual_qty > 0) : allItems;
  const { data: offerData } = useFrappeGetCall<{ message: unknown[] }>("mm_core.pos.offers", profile && !offline ? { pos_profile: profile.name } : undefined, profile && !offline ? `pos.offers.${profile.name}` : null);
  const offerCount = (unwrap<unknown[]>(offerData) ?? []).length;
  const { data: presetData } = useFrappeGetCall<{ message: QtyPresets }>("mm_core.pos.qty_presets", profile && !offline ? { pos_profile: profile.name } : undefined,
    profile && !offline ? `pos.qtypresets.${profile.name}` : null, { revalidateOnFocus: false });
  const presets: QtyPresets = unwrap<QtyPresets>(presetData) ?? (bundle as (OfflineBundle & { qty_presets?: QtyPresets }) | undefined)?.qty_presets ?? {};

  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [discount, setDiscount] = useState(0);
  const [billMode, setBillMode] = useState<"pct" | "amt">("amt");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [remarks, setRemarks] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pay, setPay] = useState(false);
  const [panel, setPanel] = useState<"held" | "orders" | "close" | "offers" | "customer" | "keys" | "sync" | "printer" | "dues" | "shift" | null>(null);
  const [invoiceTab, setInvoiceTab] = useState("all");
  const [locked, setLockedState] = useState(() => { try { return sessionStorage.getItem("pos.locked") === "1"; } catch { return false; } });
  const setLocked = (v: boolean) => { setLockedState(v); try { sessionStorage.setItem("pos.locked", v ? "1" : "0"); } catch { /* private mode */ } };
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (profile && !customer) setCustomer(profile.customer); }, [profile, customer]);
  const { data: custData, mutate: reloadCustomer } = useFrappeGetCall<{ message: CustomerInfo }>("mm_core.pos.customer_info",
    customer && profile && !offline ? { customer, company: profile.company } : undefined, customer && profile && !offline ? `pos.cust.${customer}` : null);
  const cust = unwrap<CustomerInfo>(custData);

  const add = async (it: Item) => {
    if (!profile) return;
    let batch = it.batch_no || undefined;
    const serial = it.serial_no || undefined;
    let needsSerial = false;
    if (!offline) try {
      const o = await itemOptions(it.item_code, profile.warehouse);
      if (o.has_batch_no && !batch) batch = o.batches[0]?.batch_no;          // first-expiry-first-out
      if (o.has_batch_no && !batch) { toast.error(`${it.item_name}: no batch in stock here`); return; }
      needsSerial = !!o.has_serial_no && !serial;
    } catch { /* options are a nicety; the server validates */ }
    const same = (l: Line) => l.item_code === it.item_code && l.batch_no === batch && !l.serial_no && !serial;
    if (!needsSerial && lines.some(same)) {
      setLines((ls) => ls.map((l) => (same(l) ? { ...l, qty: l.qty + 1 } : l)));
      return;
    }
    const key = `${it.item_code}-${Date.now()}`;
    setLines((ls) => [...ls, { key, item_code: it.item_code, item_name: it.item_name, qty: presets[it.item_code]?.default ?? 1,
      portion: defaultPortion(it.uom || it.stock_uom || "Nos", !!it.is_stock_item,
        /fish/i.test(it.item_name) || bundle?.items.find((b) => b.item_code === it.item_code)?.item_group === "Fish"), stockItem: !!it.is_stock_item, uom: it.uom || it.stock_uom || "Nos", price_list_rate: it.price_list_rate,
      stock: it.actual_qty, batch_no: batch, serial_no: serial }]);
    if (needsSerial) { setOpen(key); toast("Pick the serial number(s)", { icon: "🔢" }); }
  };
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.qty > 0));
  const clear = () => { setLines([]); setDiscount(0); setBillMode("amt"); setCoupon(null); setRemarks(""); setDraft(null); setPreview(null); setOpen(null); setCustomer(profile?.customer ?? ""); };

  const payload = useMemo(() => ({
    pos_profile: profile?.name, customer, coupon_code: coupon?.name, remarks: remarks || undefined,
    ...(billMode === "amt" ? { discount_amount: discount || undefined, discount_percentage: 0 } : { discount_percentage: discount }),
    items: lines.map((l) => ({ item_code: l.item_code, qty: soldQty(l), uom: l.uom, batch_no: l.batch_no, serial_no: l.serial_no,
      ...(l.portion === "rs" && l.rs ? { rate: rsPortion(l.rs, l.price_list_rate).rate, price_list_rate: l.price_list_rate } : {}),
      ...(lineMode(l) === "amt" && l.discount_line_amt !== undefined ? { discount_amount: soldQty(l) ? l.discount_line_amt / soldQty(l) : 0 }
        : l.discount_percentage !== undefined ? { discount_percentage: l.discount_percentage } : {}),
      ...(l.rate !== undefined ? { rate: l.rate, price_list_rate: l.price_list_rate } : {}) })),
  }), [profile?.name, customer, discount, billMode, coupon, remarks, lines]);

  // ERPNext's own totals (price list, pricing rules, coupon, taxes, rounding), refreshed as the cart changes
  useEffect(() => {
    if (!profile || !lines.length) { setPreview(null); return; }
    const local = () => {
      const t = localTotals(lines.map((l) => { const q = soldQty(l); return lineMode(l) === "amt" && l.discount_line_amt !== undefined ? { ...l, qty: q, discount_percentage: undefined, discount_amount: q ? (l.discount_line_amt ?? 0) / q : 0 } : { ...l, qty: q }; }),
        billMode === "pct" ? discount : 0, bundle?.taxes ?? [], bundle?.profile.disable_rounded_total, billMode === "amt" ? discount : 0);
      setPreview({ ...t, items: t.items.map((i) => ({ ...i, pricing_rules: undefined, is_free_item: 0 })) });
    };
    if (offline) { local(); return; }
    const t = setTimeout(() => {
      postCall<Preview>("mm_core.pos.preview", { data: JSON.stringify(payload) }).then(setPreview)
        .catch((e) => { if (isNetworkError(e)) { sync.markOffline(); local(); } else toast.error(humanizeError(e), { id: "pos-preview" }); });
    }, 250);
    return () => clearTimeout(t);
  }, [payload, profile, lines, offline, discount, billMode, bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = useCallback(async () => {
    if (offline) { toast.error("Holding a sale needs the server — finish it or wait for the connection."); return; }
    try {
      const r = (await postCall<{ name: string }>("mm_core.pos.submit_invoice", { data: JSON.stringify({ ...payload, hold: 1, draft }) }));
      toast.success(`Held as ${r.name}`);
      clear();
    } catch (e) { toast.error(humanizeError(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, draft, offline]);

  // keyboard (POS Awesome style): F2 search, F4 customer, F8 hold, F9 pay, F10 orders, Ctrl+Del clear, ? help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pay || (panel && panel !== "keys")) return;
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); customerRef.current?.focus(); }
      else if (e.key === "F8" && lines.length) { e.preventDefault(); void hold(); }
      else if (e.key === "F9" && lines.length && preview) { e.preventDefault(); setPay(true); }
      else if (e.key === "F10") { e.preventDefault(); setPanel("orders"); }
      else if (e.key === "F12") { e.preventDefault(); setPanel("sync"); }
      else if (e.key === "Delete" && e.ctrlKey) { e.preventDefault(); clear(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, preview, pay, panel, hold]);

  const printShiftX = async () => {
    try { printHtml(shiftReportHtml(await getCall<ShiftReport>("mm_core.pos.shift_report"), loadPrinter())); } catch (e) { toast.error(humanizeError(e)); }
  };
  const resume = async (name: string) => {
    try {
      const r = await getCall<{ name: string; customer: string; discount_percentage: number; coupon_code?: string; remarks?: string; items: (Line & { name: string })[] }>(
        "mm_core.pos.load_invoice", { name });
      setLines(r.items.map((i) => ({ key: i.name, item_code: i.item_code, item_name: i.item_name, uom: i.uom, price_list_rate: i.price_list_rate,
        ...((() => {
          const menu = i.uom === "Plate" || i.uom === "Kg";
          const hit = menu ? (i.uom === "Plate" ? PORTIONS.Plate : PORTIONS.Kg).find((p) => p.factor === i.qty) : undefined;
          if (hit) return { qty: 1, portion: hit.key };
          const r = i.rate ?? i.price_list_rate;
          if (menu && Math.abs(i.qty * r - Math.round(i.qty * r)) < 0.05 && r !== i.price_list_rate) return { qty: 1, portion: "rs", rs: Math.round(i.qty * r) };
          return i.qty % 1 !== 0 && (i.qty * 2) % 1 === 0 && !menu ? { qty: i.qty * 2, half: true } : { qty: i.qty, portion: menu ? "full" : undefined };
        })()),
        rate: i.rate !== i.price_list_rate && !i.discount_percentage ? i.rate : undefined, discount_percentage: i.discount_percentage || undefined, disc_mode: i.discount_percentage ? "pct" as const : undefined, stock: 0,
        batch_no: i.batch_no || undefined, serial_no: i.serial_no || undefined })));
      setCustomer(r.customer); setDiscount(r.discount_percentage || 0); setBillMode(r.discount_percentage ? "pct" : "amt"); setRemarks(r.remarks || ""); setDraft(r.name); setPanel(null);
      setCoupon(r.coupon_code ? { name: r.coupon_code, coupon_code: r.coupon_code } : null);
    } catch (e) { toast.error(humanizeError(e)); }
  };

  if (isLoading && !ctx && !ctxError) return <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-96" /></div>;
  if (!ctx && (ctxError || offline)) {
    return (
      <Card className="mx-auto mt-10 max-w-lg space-y-2 p-6 text-center">
        <CloudOff className="mx-auto h-8 w-8 text-rose-500" />
        <h2 className="text-lg font-semibold">Can't reach the server</h2>
        <p className="text-sm text-muted-foreground">This device has no offline data yet. Open the terminal once while online — after that it keeps selling offline.</p>
        <Button variant="outline" onClick={() => void reloadCtx()}><RefreshCw className="h-4 w-4" /> Retry</Button>
      </Card>
    );
  }
  if (!ctx?.profiles.length) {
    return (
      <Card className="mx-auto mt-10 max-w-lg space-y-2 p-6 text-center">
        <Store className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No POS profile for you</h2>
        <p className="text-sm text-muted-foreground">Ask an administrator to add you to a POS Profile (Point of Sale → POS Profiles).</p>
      </Card>
    );
  }
  if (!ctx.shift) {
    if (offline) return <Card className="mx-auto mt-10 max-w-lg p-6 text-center text-sm text-muted-foreground"><CloudOff className="mx-auto mb-2 h-8 w-8 text-rose-500" />Opening a shift needs the server. Reconnect, then open the shift.</Card>;
    return <OpenShift ctx={ctx} onOpened={() => void reloadCtx()} />;
  }

  const total = preview ? preview.rounded_total || preview.grand_total : 0;
  const regular = preview?.items.filter((r) => !r.is_free_item) ?? [];
  const freeRows = preview?.items.filter((r) => r.is_free_item) ?? [];
  const rowFor = (i: number) => regular[i];
  const isWalkIn = customer === profile?.customer;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col gap-3">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-600 text-white shadow-lg shadow-primary/30 ring-1 ring-inset ring-white/20"><Store className="h-5 w-5" /></span>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-sm font-bold">{profile?.name}<span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">POS</span></div>
            <div className="text-[11px] text-muted-foreground">{profile?.warehouse}</div>
          </div>
        </div>
        <ClockPill />
        <ShiftPill since={ctx.shift.period_start_date} name={ctx.shift.name} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <ToolBtn icon={Gift} label="Offers" tone="violet" disabled={offline} badge={offerCount || undefined} onClick={() => setPanel("offers")} />
          <ToolBtn icon={PauseCircle} label="Held" tone="sky" disabled={offline} onClick={() => setPanel("held")} />
          <ToolBtn icon={History} label="Invoices" tone="teal" onClick={() => setPanel("orders")} />
          <ToolBtn icon={Wallet} label="Cash" tone="emerald" to="/pos/cash" />
          <ToolBtn icon={PackagePlus} label="Stock" tone="teal" to="/pos/stock" />
          <ToolBtn icon={LayoutDashboard} label="Dashboard" tone="indigo" to="/pos" />
          <InstallAppBtn />
          <span className="mx-1 h-6 w-px bg-border" />
          <PosBell profile={profile?.name ?? ""} sync={sync} onAction={(a) => {
            if (a === "credit") { setInvoiceTab("credit"); setPanel("orders"); } else if (a === "held" || a === "close" || a === "offers" || a === "sync") setPanel(a);
          }} />
          <SyncBadge sync={sync} onClick={() => setPanel("sync")} />
          <ToolBtn icon={Printer} label="Printer" tone="slate" iconOnly onClick={() => setPanel("printer")} />
          <ToolBtn icon={Keyboard} label="Shortcuts" tone="slate" iconOnly onClick={() => setPanel("keys")} />
          <ToolBtn icon={LogOut} label="Close shift" tone="rose" disabled={offline} onClick={() => setPanel("close")} />
          <CashierMenu cashier={ctx.cashier} counter={profile?.name} offline={offline} onPanel={(p) => setPanel(p)} onLock={() => setLocked(true)} onShift={() => setPanel("shift")} />
        </div>
      </div>

      {offline && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <CloudOff className="h-4 w-4" /> Offline — selling from this device's data{bundle ? ` (cached ${new Date(bundle.generated_at.replace(" ", "T")).toLocaleString()})` : ""}.
          Prices from the price list; offers, coupons and loyalty apply when online. Sales sync automatically.
        </div>
      )}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* items */}
        <Card className="flex min-h-0 flex-col gap-3 rounded-2xl p-3">
          <GroupTabs groups={profile?.item_groups ?? []} active={group} onPick={setGroup}
            counts={bundle ? bundle.items.reduce<Record<string, number>>((m, i) => { const k = i.item_group ?? ""; m[k] = (m[k] ?? 0) + 1; return m; }, {}) : undefined}
            total={bundle?.items.length} />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input ref={searchRef} id="pos-search" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by item code, name, group or scan barcode  (F2)"
                className="h-11 rounded-xl bg-background pl-10 pr-20 text-sm shadow-sm" aria-label="Search items"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && items.length === 1) { void add(items[0]); setTerm(""); }
                  if (e.key === "Escape") setTerm("");
                }} />
              <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-muted-foreground">
                {term && <button type="button" onClick={() => setTerm("")} className="rounded-md p-1 hover:bg-muted" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
                <ScanBarcode className="h-4 w-4" />
              </span>
            </div>
            <div className="flex rounded-xl border border-border bg-background p-1 shadow-sm">
              <button type="button" onClick={() => setView("grid")} aria-label="Grid view" className={cn("rounded-lg px-2.5 transition-all", view === "grid" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}><LayoutGrid className="h-4 w-4" /></button>
              <button type="button" onClick={() => setView("list")} aria-label="List view" className={cn("rounded-lg px-2.5 transition-all", view === "list" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}><List className="h-4 w-4" /></button>
            </div>
          </div>
          {itemsLoading && !items.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
          ) : items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><Search className="h-8 w-8 opacity-40" />No items{debounced ? ` for “${debounced}”` : ""}.</div>
          ) : view === "grid" ? (
            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 overflow-y-auto p-1 pr-1.5 scrollbar-thin">
              {items.map((it) => {
                const inCart = lines.filter((l) => l.item_code === it.item_code).reduce((a, l) => a + l.qty, 0);
                const out = !!it.is_stock_item && it.actual_qty <= 0;
                return (
                  <button key={it.item_code} type="button" onClick={() => void add(it)} disabled={out}
                    className={cn("group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-45",
                      inCart ? "border-primary/70 ring-2 ring-primary/25" : "border-border hover:border-primary/40")}>
                    {/* photo */}
                    {!profile?.hide_images && (
                      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                        {it.item_image ? (
                          <img src={it.item_image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <span className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br text-4xl font-extrabold text-white/90", tint(it.item_code))}>{initials(it.item_name)}</span>
                        )}
                        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
                        {!!it.is_stock_item && (
                          <span className={cn("absolute right-2 top-2 min-w-7 rounded-lg px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums text-white shadow", out ? "bg-rose-500" : "bg-emerald-500")}>
                            {it.actual_qty > 999 ? `${Math.floor(it.actual_qty / 1000)}k` : Math.floor(it.actual_qty)}</span>
                        )}
                        {inCart > 0 && <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground shadow-lg">{inCart}</span>}
                      </span>
                    )}
                    {/* name, price, add */}
                    <span className="flex items-center gap-2 p-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold leading-tight" title={it.item_name}>{it.item_name}</span>
                        <span className="mt-0.5 block text-sm font-bold tabular-nums text-teal-500 dark:text-teal-400">{money(it.price_list_rate)}
                          {it.uom && it.uom !== "Nos" ? <span className="text-[11px] font-medium text-muted-foreground"> / {it.uom}</span> : null}</span>
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-md shadow-teal-500/30 transition-transform group-hover:scale-110 group-active:scale-95">
                        <Plus className="h-5 w-5" /></span>
                    </span>
                  </button>
                );
              })}
              <p className="col-span-full py-2 text-center text-[11px] text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"} loaded</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/90 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur"><tr><th className="px-3 py-2 text-left">Item</th><th className="text-left">UOM</th><th className="text-right">Stock</th><th className="text-right">Rate</th><th /></tr></thead>
                <tbody>{items.map((it) => (
                  <tr key={it.item_code} className="cursor-pointer border-t border-border transition-colors hover:bg-primary/[0.04]" onClick={() => void add(it)}>
                    <td className="px-3 py-2"><div className="flex items-center gap-2.5">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white", tint(it.item_code))}>{initials(it.item_name)}</span>
                      <span className="min-w-0"><span className="block truncate font-medium">{it.item_name}</span><span className="block text-[11px] text-muted-foreground">{it.item_code}</span></span></div></td>
                    <td className="text-xs text-muted-foreground">{it.uom || it.stock_uom}</td>
                    <td className="text-right">{it.is_stock_item ? <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white", it.actual_qty > 0 ? "bg-emerald-500" : "bg-rose-500")}>{Math.floor(it.actual_qty)}</span> : "—"}</td>
                    <td className="text-right font-bold tabular-nums text-primary">{money(it.price_list_rate)}</td>
                    <td className="w-10 pr-2 text-right"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary"><Plus className="h-3.5 w-3.5" /></span></td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Card>

        {/* cart */}
        <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl p-0">
          <div className="space-y-2 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md"><User className="h-4 w-4" /></span>
              <CustomerPicker value={customer} onChange={setCustomer} inputRef={customerRef} offlineList={offline ? bundle?.customers ?? [] : undefined} />
              <Button size="sm" variant="outline" disabled={offline} onClick={() => setPanel("customer")} aria-label="New customer"><UserPlus className="h-4 w-4" /></Button>
            </div>
            {cust && !isWalkIn && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                {cust.mobile_no && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{cust.mobile_no}</span>}
                <span className={cn("inline-flex items-center gap-1", cust.outstanding > 0 && "font-medium text-rose-600")}><Wallet className="h-3 w-3" />Due {money(cust.outstanding)}{cust.credit_limit ? ` / limit ${money(cust.credit_limit)}` : ""}
                  {cust.outstanding > 0 && <button type="button" onClick={() => setPanel("dues")} className="ml-1 inline-flex items-center gap-0.5 rounded border border-rose-500/40 px-1 hover:bg-rose-500/10"><HandCoins className="h-3 w-3" />Receive</button>}</span>
                {cust.loyalty_program && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Award className="h-3 w-3" />{cust.loyalty_points} pts{cust.tier_name ? ` · ${cust.tier_name}` : ""}</span>}
                {cust.last_purchase && <span>Last: {money(cust.last_purchase.grand_total)} on {cust.last_purchase.posting_date}</span>}
              </div>
            )}
            {draft && <span className="inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">resumed {draft}</span>}
          </div>
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto scrollbar-thin">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted shadow-inner"><ShoppingBag className="h-7 w-7 text-muted-foreground" /></span>
                <div><div className="text-sm font-semibold">Your cart is empty</div><div className="text-xs text-muted-foreground">Select items to start, or choose a quick action</div></div>
                <div className="grid w-full max-w-sm grid-cols-2 gap-2">
                  <QuickAction icon={Eye} label="Shift report" tone="sky" onClick={() => void printShiftX()} />
                  <QuickAction icon={FileText} label="Draft invoices" tone="violet" disabled={offline} onClick={() => setPanel("held")} />
                  <QuickAction icon={History} label="Invoice history" tone="teal" onClick={() => setPanel("orders")} />
                  <QuickAction icon={Undo2} label="Return invoice" tone="rose" onClick={() => setPanel("orders")} />
                  <QuickAction icon={Wallet} label="Cash in / out" tone="emerald" to="/pos/cash" />
                  <QuickAction icon={UserPlus} label="Create customer" tone="indigo" disabled={offline} onClick={() => setPanel("customer")} />
                  <QuickAction icon={Gift} label="Offers" tone="amber" disabled={offline} onClick={() => setPanel("offers")} />
                  <QuickAction icon={Lock} label="Close shift" tone="orange" disabled={offline} onClick={() => setPanel("close")} />
                </div>
              </div>
            ) : lines.map((l, i) => {
              const row = rowFor(i);
              const offer = row && hasRules(row.pricing_rules) && row.discount_percentage > 0 && l.discount_percentage === undefined && l.discount_line_amt === undefined;
              return (
                <CartLine key={l.key} line={l} row={row} offer={!!offer} profile={profile!} money={money} open={open === l.key} quick={presets[l.item_code]?.options}
                  onToggle={() => setOpen(open === l.key ? null : l.key)} onChange={(p) => update(l.key, p)} />
              );
            })}
            {freeRows.map((r, i) => (
              <div key={`free-${i}`} className="flex items-center justify-between gap-2 bg-emerald-500/5 p-3 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{r.item_name}</div><div className="text-[11px] text-muted-foreground">{r.qty} {r.uom}</div></div>
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">FREE</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-border p-3 text-sm">
            <Row k="Net total" v={money(preview?.net_total)} />
            <div className="flex items-center gap-2">
              {offline ? <span className="flex-1 text-[11px] text-muted-foreground">Coupons need the server</span> : <CouponBox coupon={coupon} onApply={setCoupon} />}
              {profile?.allow_discount_change ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><span>Bill</span>
                  <DiscMode mode={billMode} onChange={(m) => { setBillMode(m); setDiscount(0); }} />
                  <input id="pos-disc" type="number" min={0} max={billMode === "pct" ? 100 : undefined} value={discount || ""} placeholder="0" onChange={(e) => setDiscount(Number(e.target.value))}
                    aria-label={billMode === "pct" ? "Bill discount %" : "Bill discount amount"}
                    className="w-20 rounded-md border border-border bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums" /></div>
              ) : null}
            </div>
            {preview?.discount_amount ? <Row k={`Discount${preview.additional_discount_percentage ? ` (${preview.additional_discount_percentage}%)` : ""}`} v={`− ${money(preview.discount_amount)}`} /> : null}
            {(preview?.taxes ?? []).map((t) => <Row key={t.description} k={t.description} v={money(t.tax_amount)} />)}
            <div className="mt-1 flex items-center justify-between rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2.5">
              <button type="button" onClick={() => { const r = window.prompt("Note on this sale", remarks); if (r !== null) setRemarks(r); }}
                className={cn("inline-flex items-center gap-1 text-[11px]", remarks ? "text-primary" : "text-muted-foreground hover:text-foreground")} title={remarks || "Add a note"}>
                <MessageSquare className="h-3.5 w-3.5" />{remarks ? "Note" : "Add note"}</button>
              <span className="flex items-baseline gap-2"><span className="text-sm font-bold">Grand Total</span><span className="text-2xl font-extrabold tabular-nums text-primary">{money(total)}</span></span>
            </div>
            <div className="grid grid-cols-[auto_auto_1fr] gap-2 pt-1">
              <Button variant="outline" disabled={!lines.length} onClick={clear} aria-label="Clear cart" title="Clear (Ctrl+Del)"><X className="h-4 w-4" /></Button>
              <Button variant="outline" disabled={!lines.length || offline} onClick={() => void hold()} title="Hold (F8)"><PauseCircle className="h-4 w-4" /> Hold</Button>
              <button type="button" disabled={!lines.length || !preview} onClick={() => setPay(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:brightness-100">
                <CreditCard className="h-5 w-5" /> Checkout {lines.length ? money(total) : ""} <span className="rounded bg-white/20 px-1 text-[10px]">F9</span></button>
            </div>
          </div>
        </Card>
      </div>

      {pay && profile && <PayDialog profile={profile} total={total} payload={payload} draft={draft} money={money} customer={offline ? undefined : cust} isWalkIn={isWalkIn}
        offline={offline} sync={sync} bundle={bundle} cashier={ctx.cashier} preview={preview!} lines={lines} customerName={cust?.customer_name ?? bundle?.customers.find((c) => c.name === customer)?.customer_name ?? customer}
        onClose={() => setPay(false)} onDone={() => { setPay(false); clear(); if (!offline) void reloadCustomer(); else void loadBundle(profile.name).then((b) => b && setBundle(b)); searchRef.current?.focus(); }} />}
      {panel === "held" && profile && <HeldDialog profile={profile} money={money} onClose={() => setPanel(null)} onResume={resume} />}
      {panel === "orders" && profile && <InvoicesDialog profile={profile} money={money} online={!offline} initialTab={invoiceTab} onClose={() => { setPanel(null); setInvoiceTab("all"); }} onResume={(n) => void resume(n)} />}
      {panel === "sync" && profile && <SyncDialog sync={sync} profile={profile} money={money} bundle={bundle} onRefreshBundle={pullBundle} onClose={() => setPanel(null)} />}
      {panel === "printer" && <PrinterSettingsDialog onClose={() => setPanel(null)} />}
      {panel === "shift" && <ShiftInfoDialog money={money} onClose={() => setPanel(null)} onCloseShift={() => setPanel("close")} />}
      {locked && <LockScreen cashier={ctx.cashier} onUnlock={() => setLocked(false)} />}
      {panel === "dues" && profile && cust && <ReceiveDuesDialog customer={cust.name} customerName={cust.customer_name} outstanding={cust.outstanding} profile={profile} money={money}
        currency={profile.currency} cashier={ctx.cashier} company={bundle?.company ?? { company_name: profile.company }} onClose={() => setPanel(null)} onDone={() => { setPanel(null); void reloadCustomer(); }} />}
      {panel === "offers" && profile && <OffersDialog profile={profile} money={money} onClose={() => setPanel(null)}
        onCoupon={(c) => { setCoupon(c); setPanel(null); toast.success(`Coupon ${c.coupon_code} applied`); }} />}
      {panel === "customer" && <NewCustomerDialog onClose={() => setPanel(null)} onCreated={(name) => { setCustomer(name); setPanel(null); }} />}
      {panel === "keys" && <ShortcutsDialog onClose={() => setPanel(null)} />}
      {panel === "close" && <CloseShiftDialog money={money} pending={sync.queue.length} onSync={() => void sync.sync()} onClose={() => setPanel(null)} onClosed={() => { setPanel(null); clear(); void reloadCtx(); }} />}
    </div>
  );
}

const modeIcon = (mode: string) => /cash/i.test(mode) ? Banknote : /card/i.test(mode) ? CreditCard : /cheque|check|draft/i.test(mode) ? FileText
  : /wallet|easypaisa|jazz|mobile/i.test(mode) ? Smartphone : /bank|wire|transfer/i.test(mode) ? Landmark : Wallet;

const TILE_TONE: Record<string, { g: string; soft: string; text: string }> = {
  emerald: { g: "from-emerald-500 to-green-600 shadow-emerald-500/40", soft: "bg-emerald-500/10 text-emerald-600", text: "text-emerald-600" },
  sky: { g: "from-sky-500 to-blue-600 shadow-sky-500/40", soft: "bg-sky-500/10 text-sky-600", text: "text-sky-600" },
  violet: { g: "from-violet-500 to-purple-600 shadow-violet-500/40", soft: "bg-violet-500/10 text-violet-600", text: "text-violet-600" },
  amber: { g: "from-amber-400 to-orange-500 shadow-amber-500/40", soft: "bg-amber-500/10 text-amber-600", text: "text-amber-600" },
  pink: { g: "from-pink-500 to-rose-600 shadow-pink-500/40", soft: "bg-pink-500/10 text-pink-600", text: "text-pink-600" },
  slate: { g: "from-slate-500 to-slate-700 shadow-slate-500/40", soft: "bg-slate-500/10 text-slate-600 dark:text-slate-300", text: "text-slate-600" },
};
const modeTone = (mode: string) => /cash/i.test(mode) ? "emerald" : /card/i.test(mode) ? "violet" : /cheque|draft/i.test(mode) ? "amber"
  : /wallet|easypaisa|jazz|mobile/i.test(mode) ? "pink" : "sky";

function PayTile({ label, icon: Icon, active, onClick, sub, tone = "sky" }: { label: string; icon: typeof Banknote; active: boolean; onClick: () => void; sub?: string; tone?: string }) {
  const t = TILE_TONE[tone] ?? TILE_TONE.sky;
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm font-bold transition-all duration-200",
        active ? cn("border-transparent bg-gradient-to-br text-white shadow-lg -translate-y-0.5", t.g) : "border-border bg-card text-foreground/80 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md")}>
      {active && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-emerald-600 shadow"><CheckCircle2 className="h-3.5 w-3.5" /></span>}
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-colors", active ? "bg-white/20 ring-1 ring-inset ring-white/30" : t.soft)}><Icon className="h-5 w-5" /></span>
      <span className="truncate">{label}</span>
      <span className={cn("h-3.5 text-[10px] font-semibold tabular-nums", active ? "text-white/85" : "text-muted-foreground")}>{sub ?? ""}</span>
    </button>
  );
}

/** Touch keypad for the cash amount: the first key replaces the pre-filled amount, then digits append. */
function Keypad({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [fresh, setFresh] = useState(true);
  const press = (k: string) => {
    if (k === "⌫") { setFresh(false); onChange(Math.floor(value / 10)); return; }
    if (k === "C") { setFresh(false); onChange(0); return; }
    const base = fresh ? "" : String(Math.round(value) || "");
    setFresh(false);
    onChange(Number(`${base}${k}`) || 0);
  };
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {["7", "8", "9", "⌫", "4", "5", "6", "C", "1", "2", "3", "00", "0", "000"].map((k) => (
        <button key={k} type="button" onClick={() => press(k)}
          className={cn("h-10 rounded-xl border text-base font-bold tabular-nums transition-all active:scale-95",
            k === "⌫" || k === "C" ? "border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20" : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
            k === "0" && "col-span-2")}>{k}</button>
      ))}
    </div>
  );
}


const TOOL_TONE: Record<string, string> = {
  violet: "hover:bg-violet-500/10 hover:text-violet-600 [&>svg]:text-violet-500", sky: "hover:bg-sky-500/10 hover:text-sky-600 [&>svg]:text-sky-500",
  teal: "hover:bg-teal-500/10 hover:text-teal-600 [&>svg]:text-teal-500", emerald: "hover:bg-emerald-500/10 hover:text-emerald-600 [&>svg]:text-emerald-500",
  indigo: "hover:bg-indigo-500/10 hover:text-indigo-600 [&>svg]:text-indigo-500", rose: "hover:bg-rose-500/10 text-rose-600 [&>svg]:text-rose-500",
  slate: "hover:bg-muted [&>svg]:text-muted-foreground", amber: "hover:bg-amber-500/10 [&>svg]:text-amber-500", orange: "hover:bg-orange-500/10 [&>svg]:text-orange-500",
};
/** Item-group tabs: colour + initial per group, item counts (from the offline cache), gradient active tab, scrolls sideways. */
function GroupTabs({ groups, active, onPick, counts, total }: { groups: string[]; active: string; onPick: (g: string) => void; counts?: Record<string, number>; total?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure, groups.length]);
  const nudge = (dir: number) => scroller.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  const tabs = [{ key: "", label: "All Items", n: total }, ...groups.map((g) => ({ key: g, label: g, n: counts?.[g] }))];
  return (
    <div className="relative">
      {edges.left && <button type="button" onClick={() => nudge(-1)} aria-label="Scroll groups left"
        className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-muted"><ChevronDown className="h-4 w-4 rotate-90" /></button>}
      {edges.right && <button type="button" onClick={() => nudge(1)} aria-label="Scroll groups right"
        className="absolute right-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-muted"><ChevronDown className="h-4 w-4 -rotate-90" /></button>}
      <div ref={scroller} onScroll={measure} className="flex snap-x gap-2 overflow-x-auto scroll-smooth px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = active === t.key;
          const g = t.key ? tint(t.key) : "from-slate-600 to-slate-800 dark:from-slate-500 dark:to-slate-700";
          return (
            <button key={t.key || "all"} type="button" onClick={() => onPick(t.key)} aria-pressed={on}
              className={cn("group flex shrink-0 snap-start items-center gap-2 rounded-2xl border py-1.5 pl-1.5 pr-3 text-[13px] font-semibold transition-all duration-200",
                on ? cn("border-transparent bg-gradient-to-r text-white shadow-lg -translate-y-px", g)
                  : "border-border bg-card text-foreground/80 hover:-translate-y-px hover:border-primary/40 hover:shadow-md")}>
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-xl text-[11px] font-bold transition-transform group-hover:scale-105",
                on ? "bg-white/25 text-white ring-1 ring-inset ring-white/30" : cn("bg-gradient-to-br text-white shadow-sm", g))}>
                {t.key ? initials(t.label) : <LayoutGrid className="h-3.5 w-3.5" />}
              </span>
              <span className="whitespace-nowrap">{t.label}</span>
              {t.n !== undefined && (
                <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums", on ? "bg-white/25 text-white" : "bg-muted text-muted-foreground")}>{t.n}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Install app" in the toolbar — only when the browser can install the POS (hidden once installed). */
function InstallAppBtn() {
  const { canInstall, install } = usePwaInstall();
  if (!canInstall) return null;
  return (
    <button type="button" onClick={() => void install().then((ok) => ok && toast.success("MicroMax POS installed — open it from your desktop or taskbar"))}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-violet-600 px-3 text-xs font-bold text-white shadow-md shadow-teal-500/30 hover:brightness-110"
      title="Install MicroMax POS as a desktop app">
      <MonitorDown className="h-4 w-4" /><span className="hidden lg:inline">Install app</span>
    </button>
  );
}

function ToolBtn({ icon: Icon, label, tone, onClick, to, disabled, badge, iconOnly }: {
  icon: typeof Store; label: string; tone: string; onClick?: () => void; to?: string; disabled?: boolean; badge?: number; iconOnly?: boolean;
}) {
  const cls = cn("relative inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-foreground/80 transition-colors disabled:pointer-events-none disabled:opacity-40", TOOL_TONE[tone]);
  const body = <><Icon className="h-4 w-4" />{!iconOnly && <span className="hidden xl:inline">{label}</span>}
    {badge ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold text-white">{badge}</span> : null}</>;
  return to ? <Link to={to} className={cls} title={label}>{body}</Link> : <button type="button" className={cls} onClick={onClick} disabled={disabled} title={label} aria-label={label}>{body}</button>;
}

const QA_TONE: Record<string, string> = {
  sky: "bg-sky-500/10 text-sky-600", violet: "bg-violet-500/10 text-violet-600", teal: "bg-teal-500/10 text-teal-600", rose: "bg-rose-500/10 text-rose-600",
  emerald: "bg-emerald-500/10 text-emerald-600", indigo: "bg-indigo-500/10 text-indigo-600", amber: "bg-amber-500/10 text-amber-600", orange: "bg-orange-500/10 text-orange-600",
};
function QuickAction({ icon: Icon, label, tone, onClick, to, disabled }: { icon: typeof Store; label: string; tone: string; onClick?: () => void; to?: string; disabled?: boolean }) {
  const cls = "group flex flex-col items-center gap-2 rounded-xl border border-border bg-background/60 px-2 py-3.5 text-xs font-medium text-foreground/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md disabled:pointer-events-none disabled:opacity-40";
  const body = <><span className={cn("flex h-9 w-9 items-center justify-center rounded-full transition-transform group-hover:scale-110", QA_TONE[tone])}><Icon className="h-4 w-4" /></span>{label}</>;
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" className={cls} onClick={onClick} disabled={disabled}>{body}</button>;
}

function ClockPill() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs font-bold tabular-nums text-sky-700 md:inline-flex dark:text-sky-300">
      <Clock className="h-3.5 w-3.5" />{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
  );
}

/** Cashier menu on the avatar: shift, invoices, cash, desk, lock, close shift, logout. */
function CashierMenu({ cashier, counter, offline, onPanel, onLock, onShift }: {
  cashier: string; counter?: string; offline: boolean; onPanel: (p: "held" | "orders" | "close" | "printer") => void; onLock: () => void; onShift: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go = (fn: () => void) => () => { setOpen(false); fn(); };
  const items: ({ label: string; icon: typeof Store; tone: string; onClick: () => void; disabled?: boolean } | "sep")[] = [
    { label: "View shift", icon: Clock, tone: "text-sky-500", onClick: go(onShift), disabled: offline },
    { label: "Draft invoices", icon: FileText, tone: "text-violet-500", onClick: go(() => onPanel("held")), disabled: offline },
    { label: "Invoice history", icon: History, tone: "text-teal-500", onClick: go(() => onPanel("orders")) },
    { label: "Return invoice", icon: Undo2, tone: "text-rose-500", onClick: go(() => onPanel("orders")) },
    { label: "Cash in / out", icon: Wallet, tone: "text-emerald-500", onClick: go(() => navigate("/pos/cash")) },
    { label: "Printer settings", icon: Printer, tone: "text-slate-500", onClick: go(() => onPanel("printer")) },
    { label: "Switch to desk", icon: LayoutDashboard, tone: "text-indigo-500", onClick: go(() => navigate("/desk")) },
    ...(desktop()?.isDesktop ? [{ label: "App settings (MMX POS)", icon: MonitorDown, tone: "text-teal-500", onClick: go(() => void desktop()?.openSettings()) }] : []),
    "sep",
    { label: "Lock screen", icon: Lock, tone: "text-amber-500", onClick: go(onLock) },
    "sep",
    { label: "Close shift", icon: LogOut, tone: "text-orange-500", onClick: go(() => onPanel("close")), disabled: offline },
  ];
  return (
    <div ref={ref} className="relative ml-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={cashier}
        className={cn("flex items-center gap-2 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-semibold transition-colors", open ? "bg-primary/15 ring-1 ring-primary/30" : "bg-muted/60 hover:bg-muted")}>
        <span className="hidden max-w-[120px] truncate sm:inline">{cashier}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-[10px] font-bold text-white">{initials(cashier)}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-bold text-white shadow-md">{initials(cashier)}</span>
            <div className="min-w-0"><div className="truncate text-sm font-bold">{cashier}</div><div className="truncate text-xs text-muted-foreground">{counter}</div></div>
          </div>
          <div className="py-1.5">
            {items.map((it, i) => it === "sep" ? <div key={`s${i}`} className="my-1.5 border-t border-border" /> : (
              <button key={it.label} type="button" role="menuitem" onClick={it.onClick} disabled={it.disabled}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40">
                <it.icon className={cn("h-4 w-4", it.tone)} />{it.label}
              </button>
            ))}
            <div className="my-1.5 border-t border-border" />
            <button type="button" role="menuitem" onClick={go(() => void logout())}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-500/10">
              <LogOut className="h-4 w-4 rotate-180" /> Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-screen lock: the terminal stays as it is; the cashier unlocks with their own password. */
function LockScreen({ cashier, onUnlock }: { cashier: string; onUnlock: () => void }) {
  const { login, currentUser } = useAuth();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const unlock = async () => {
    if (!currentUser) return;
    setBusy(true); setErr("");
    try { await login(currentUser, pwd); setPwd(""); onUnlock(); } catch { setErr("Wrong password — try again."); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xl">
      <form onSubmit={(e) => { e.preventDefault(); void unlock(); }} className="w-full max-w-sm space-y-5 rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center text-white shadow-2xl">
        <div className="text-5xl font-extralight tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <div className="text-sm text-white/60">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-2xl font-bold shadow-xl ring-4 ring-white/10">{initials(cashier)}</span>
        <div><div className="text-lg font-bold">{cashier}</div><div className="flex items-center justify-center gap-1.5 text-xs text-white/60"><Lock className="h-3.5 w-3.5" /> Terminal locked</div></div>
        <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Password" autoComplete="current-password" aria-label="Password"
          className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-center text-base text-white placeholder:text-white/40 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30" />
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button type="submit" disabled={busy || !pwd} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 font-bold shadow-lg shadow-sky-500/30 hover:brightness-110 disabled:opacity-50">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Unlock</button>
      </form>
    </div>
  );
}

/** Read-only look at the open shift: counter, time open, sales and what each payment mode should hold. */
function ShiftInfoDialog({ money, onClose, onCloseShift }: { money: Money; onClose: () => void; onCloseShift: () => void }) {
  const { data } = useFrappeGetCall<{ message: ShiftSummary }>("mm_core.pos.shift_summary", undefined, `pos.shiftinfo.${Date.now() >> 13}`);
  const s = unwrap<ShiftSummary>(data);
  const started = s ? new Date(s.shift.period_start_date.replace(" ", "T")) : null;
  const printX = async () => { try { printHtml(shiftReportHtml(await getCall<ShiftReport>("mm_core.pos.shift_report"), loadPrinter())); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <Dialog open onClose={onClose} size="md" className="max-w-lg">
      <div className="-mx-5 -mt-5 mb-4 flex items-center gap-3 bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-4 text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30"><Clock className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><div className="text-lg font-bold leading-tight">Current shift</div><div className="truncate text-xs text-white/85">{s ? `${s.profile} · ${s.shift.name}` : "Loading…"}</div></div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {!s ? <Skeleton className="h-56 rounded-2xl" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-border p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Opened</div><div className="font-semibold">{started?.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div></div>
            <div className="rounded-xl border border-border p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cashier</div><div className="font-semibold">{s.cashier}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Sales", String(s.invoices), "text-emerald-600"], ["Returns", String(s.returns), "text-rose-600"], ["Discounts", money(s.discounts), "text-amber-600"], ["Net total", money(s.total), "text-foreground"]].map(([l, v, c]) => (
              <div key={l} className="rounded-xl bg-muted/50 p-3 text-center"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{l}</div><div className={cn("text-lg font-extrabold tabular-nums", c)}>{v}</div></div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Expected in each mode</div>
            {s.modes.map((m) => { const I = modeIcon(m.mode_of_payment); return (
              <div key={m.mode_of_payment} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white", TILE_TONE[modeTone(m.mode_of_payment)].g)}><I className="h-4 w-4" /></span>
                <span className="flex-1 font-medium">{m.mode_of_payment}</span><span className="font-bold tabular-nums">{money(m.expected)}</span>
              </div>); })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void printX()}><Printer className="h-4 w-4" /> Print X report</Button>
            <Button className="bg-gradient-to-r from-rose-500 to-orange-500 text-white" onClick={onCloseShift}><Lock className="h-4 w-4" /> Close shift</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

interface PosAlert { key: string; level: "critical" | "warning" | "info"; title: string; detail: string; action?: string }
const ALERT_LOOK: Record<PosAlert["level"], { dot: string; ring: string; icon: typeof Store }> = {
  critical: { dot: "from-rose-500 to-red-600", ring: "border-rose-500/30 bg-rose-500/[0.06]", icon: AlertTriangle },
  warning: { dot: "from-amber-400 to-orange-500", ring: "border-amber-500/30 bg-amber-500/[0.06]", icon: AlertTriangle },
  info: { dot: "from-sky-500 to-blue-600", ring: "border-border bg-card", icon: Bell },
};
const ALERT_ICON: Record<string, typeof Store> = {
  out_of_stock: PackageX, low_stock: PackageMinus, held: PauseCircle, credit: Wallet, long_shift: Clock, coupons: Ticket,
  offline: CloudOff, sync_failed: AlertTriangle, sync_pending: RefreshCw,
};
const agoShort = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T")).getTime()) / 60000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

/** Bell in the terminal toolbar: POS alerts (stock, drafts, credit, shift, coupons, sync) and the user's notifications. */
function PosBell({ profile, sync, onAction }: { profile: string; sync: SyncState; onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"alerts" | "notes">("alerts");
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, mutate } = useFrappeGetCall<{ message: PosAlert[] }>("mm_core.pos.alerts", sync.online ? { pos_profile: profile } : undefined,
    sync.online ? `pos.alerts.${profile}` : null, { refreshInterval: 60_000 });
  const { notifications, unreadCount, markRead } = useNotificationLog();
  const failed = sync.queue.filter((q) => q.status === "failed").length;
  const pending = sync.queue.length - failed;
  const local: PosAlert[] = [
    ...(!sync.online ? [{ key: "offline", level: "critical" as const, title: "Working offline", detail: "Sales are saved on this device and sync when the server is back", action: "sync" }] : []),
    ...(failed ? [{ key: "sync_failed", level: "critical" as const, title: `${failed} offline sale${failed > 1 ? "s" : ""} failed to sync`, detail: "Open Sync status to see why and retry", action: "sync" }] : []),
    ...(pending ? [{ key: "sync_pending", level: "info" as const, title: `${pending} sale${pending > 1 ? "s" : ""} waiting to sync`, detail: "They post automatically when online", action: "sync" }] : []),
  ];
  const alerts = [...local, ...(unwrap<PosAlert[]>(data) ?? [])];
  const urgent = alerts.filter((a) => a.level !== "info").length;
  const badge = alerts.length + unreadCount;
  useEffect(() => {
    if (!open) return;
    void mutate();
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open, mutate]);
  const act = (a: PosAlert) => { setOpen(false); if (a.action === "stock") navigate("/pos/stock"); else if (a.action) onAction(a.action); };
  const ACTION_LABEL: Record<string, string> = { stock: "Receive stock", held: "Open drafts", credit: "View unpaid", close: "Close shift", offers: "Offers", sync: "Sync status" };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Notifications${badge ? ` (${badge})` : ""}`} title="Alerts & notifications"
        className={cn("relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors", open ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-muted")}>
        {urgent ? <BellRing className="h-[18px] w-[18px] text-amber-500" /> : <Bell className="h-[18px] w-[18px]" />}
        {badge > 0 && <span className={cn("absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-card", urgent ? "bg-rose-500" : "bg-sky-500")}>{badge > 99 ? "99+" : badge}</span>}
        {urgent > 0 && <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-ping rounded-full bg-rose-500/50" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[380px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-amber-500/10 via-transparent to-sky-500/10 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md"><Bell className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold">Notifications</div><div className="truncate text-[11px] text-muted-foreground">{profile}</div></div>
            {tab === "notes" && unreadCount > 0 && <button type="button" onClick={() => void markRead()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
          </div>
          <div className="grid grid-cols-2 gap-1 border-b border-border bg-muted/40 p-1">
            {([["alerts", "POS alerts", alerts.length], ["notes", "Notifications", unreadCount]] as const).map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={cn("flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold", tab === k ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                {l}{n > 0 && <span className={cn("rounded-full px-1.5 text-[10px] font-bold text-white", k === "alerts" && urgent ? "bg-rose-500" : "bg-sky-500")}>{n}</span>}
              </button>
            ))}
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2 scrollbar-thin">
            {tab === "alerts" ? (alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><CheckCircle2 className="h-8 w-8 text-emerald-500" /> All clear at this counter</div>
            ) : (
              <ul className="space-y-1.5">{alerts.map((a) => {
                const look = ALERT_LOOK[a.level]; const I = ALERT_ICON[a.key] ?? look.icon;
                return (
                  <li key={a.key} className={cn("flex items-start gap-3 rounded-xl border p-2.5", look.ring)}>
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm", look.dot)}><I className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold leading-tight">{a.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{a.detail}</div>
                      {a.action && <button type="button" onClick={() => act(a)} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20">{ACTION_LABEL[a.action] ?? "Open"} <ChevronDown className="h-3 w-3 -rotate-90" /></button>}
                    </div>
                  </li>
                );
              })}</ul>
            )) : (notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Bell className="h-8 w-8 opacity-40" /> No notifications</div>
            ) : (
              <ul className="space-y-0.5">{notifications.map((n) => {
                const link = n.document_type && n.document_name ? docUrl(n.document_type, n.document_name) : null;
                const open_ = () => { void markRead(n.name); setOpen(false); if (link) { if (link.external) window.open(link.href, "_blank"); else navigate(link.href); } };
                return (
                  <li key={n.name}>
                    <button type="button" onClick={open_} className={cn("flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-muted", !n.read && "bg-sky-500/[0.06]")}>
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-sky-500")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("line-clamp-2 text-[13px] leading-snug", !n.read && "font-semibold")} dangerouslySetInnerHTML={{ __html: n.subject }} />
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{n.type}{n.document_type ? ` · ${n.document_type}` : ""} · {agoShort(n.creation)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}</ul>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftPill({ since, name }: { since: string; name: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const mins = Math.max(0, Math.floor((now - new Date(since.replace(" ", "T")).getTime()) / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const text = [d && `${d} day${d > 1 ? "s" : ""}`, h && `${h} hour${h > 1 ? "s" : ""}`, `${m} min`].filter(Boolean).join(" ");
  return (
    <span title={name} className={cn("hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs md:inline-flex",
      d ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
      <CheckCircle2 className="h-3.5 w-3.5" />Shift open: <b className="font-bold">{text}</b></span>
  );
}

function SyncBadge({ sync, onClick }: { sync: SyncState; onClick: () => void }) {
  const failed = sync.queue.filter((q) => q.status === "failed").length;
  const pending = sync.queue.length;
  return (
    <button type="button" onClick={onClick} title="Sync status (F12)"
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
        !sync.online ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" : failed ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
      {sync.syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : sync.online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
      {sync.online ? (sync.syncing ? "Syncing" : "Online") : "Offline"}
      {pending > 0 && <span className="rounded-full bg-current/10 px-1.5 tabular-nums">{pending} {failed ? `· ${failed} failed` : "pending"}</span>}
    </button>
  );
}


function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-muted-foreground"><span className="truncate">{k}</span><span className="tabular-nums text-foreground">{v}</span></div>;
}

/** % / Rs switch for a discount. */
function DiscMode({ mode, onChange }: { mode: "pct" | "amt"; onChange: (m: "pct" | "amt") => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-border text-[10px] font-bold">
      {(["pct", "amt"] as const).map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)} aria-pressed={mode === m}
          className={cn("px-1.5 py-0.5 transition-colors", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{m === "pct" ? "%" : "Rs"}</button>
      ))}
    </span>
  );
}

function CartLine({ line: l, row, offer, profile, money, open, onToggle, onChange, quick }: {
  line: Line; row?: PreviewRow; offer: boolean; profile: Profile; money: Money; open: boolean; onToggle: () => void; onChange: (p: Partial<Line>) => void; quick?: number[];
}) {
  const [opts, setOpts] = useState<ItemOptions | null>(null);
  useEffect(() => { if (open && !opts) void itemOptions(l.item_code, profile.warehouse).then(setOpts).catch(() => undefined); }, [open, opts, l.item_code, profile.warehouse]);
  const rate = row?.rate ?? (l.rate ?? l.price_list_rate) * (1 - (l.discount_percentage ?? 0) / 100);
  const amount = row?.amount ?? soldQty(l) * rate;
  const serials = (l.serial_no ?? "").split("\n").filter(Boolean);
  const toggleSerial = (s: string) => {
    const next = serials.includes(s) ? serials.filter((x) => x !== s) : [...serials, s];
    onChange({ serial_no: next.join("\n") || undefined, qty: Math.max(next.length, 1) });
  };
  return (
    <div className={cn("space-y-1.5 p-3", open && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={onToggle}>
          <div className="flex items-center gap-1.5 truncate text-sm font-medium">{l.item_name}
            {l.half && <span className="rounded bg-violet-500/15 px-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">HALF</span>}
            {portionLabel(l) && <span className={cn("rounded px-1 text-[10px] font-bold", l.portion === "rs" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary")}>{portionLabel(l)}</span>}
            {offer && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"><Tag className="h-2.5 w-2.5" />{row!.discount_percentage}% offer</span>}
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", open && "rotate-180")} /></div>
          <div className="text-[11px] text-muted-foreground">
            {l.half ? <span className="font-semibold text-violet-600 dark:text-violet-400">½ × </span> : null}{money(rate)} / {l.uom}{row && row.price_list_rate > rate + 0.004 ? <s className="ml-1 opacity-60">{money(row.price_list_rate)}</s> : null}
            {l.batch_no ? ` · batch ${l.batch_no}` : ""}{serials.length ? ` · ${serials.length} serial${serials.length > 1 ? "s" : ""}` : ""}
          </div>
        </button>
        <div className="text-right text-sm font-semibold tabular-nums">{money(amount)}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex shrink-0 items-center rounded-lg border border-border">
          <button type="button" className="px-1.5 py-1 hover:bg-muted" onClick={() => onChange({ qty: l.qty - 1 })} aria-label="Less"><Minus className="h-3.5 w-3.5" /></button>
          <input type="number" value={l.qty} min={0} onChange={(e) => onChange({ qty: Number(e.target.value) })}
            className="w-11 border-x border-border bg-transparent py-1 text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="Quantity" />
          <button type="button" className="px-1.5 py-1 hover:bg-muted" onClick={() => onChange({ qty: l.qty + 1 })} aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <button type="button" className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600" onClick={() => onChange({ qty: 0 })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
      </div>
      {portionsFor(l) && (() => {
        // menu portions (Plate / Kg dishes); Rs = a portion worth that amount
        const opts = portionsFor(l)!;
        const price = l.price_list_rate;
        const step = price <= 500 ? 50 : price <= 1500 ? 100 : 250;
        const amounts: number[] = [];
        for (let v = 50; v < price; v += v < step ? 50 : step) amounts.push(v);
        if (price > 0) amounts.push(price);
        return (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Portion">
              {opts.map((o) => (
                <button key={o.key} type="button" aria-pressed={l.portion === o.key}
                  onClick={() => onChange(o.key === "rs" ? { portion: "rs", rs: l.rs ?? Math.min(100, price) } : { portion: o.key, rs: undefined })}
                  className={cn("rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors",
                    l.portion === o.key ? (o.key === "rs" ? "border-amber-500 bg-amber-500 text-white" : "border-primary bg-primary text-primary-foreground") : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                  {o.label}</button>
              ))}
            </div>
            {l.portion === "rs" && (
              <div className="flex flex-wrap items-center gap-1">
                {amounts.map((v) => (
                  <button key={v} type="button" onClick={() => onChange({ rs: v })} aria-pressed={l.rs === v}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums", l.rs === v ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-border hover:border-amber-500/50")}>
                    {v === price ? `Rs ${v} (full)` : `Rs ${v}`}</button>
                ))}
                <input type="number" min={1} max={price || undefined} value={l.rs ?? ""} placeholder="Rs" onChange={(e) => onChange({ rs: Number(e.target.value) || undefined })}
                  aria-label="Amount for this portion" className="w-16 rounded-md border border-border bg-transparent px-1.5 py-0.5 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
            )}
          </div>
        );
      })()}
      {quick && quick.length > 0 && (() => {
        // second row (items with POS Quick Quantities, e.g. Roti): 1 … the largest quick quantity
        const max = Math.max(...quick, l.qty);
        const pct = ((Math.min(l.qty, max) - 1) / Math.max(1, max - 1)) * 100;
        return (
          <div className="flex items-center gap-2.5 pt-0.5">
            <span className="text-[10px] font-bold tabular-nums text-muted-foreground">1</span>
            <input type="range" min={1} max={max} step={1} value={Math.min(l.qty, max)} onChange={(e) => onChange({ qty: Number(e.target.value) })}
              aria-label={`${l.item_name} quantity`} className="h-2 w-full cursor-pointer appearance-none rounded-full accent-teal-500"
              style={{ background: `linear-gradient(to right, rgb(20 184 166) ${pct}%, hsl(var(--muted)) ${pct}%)` }} />
            <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{max}</span>
          </div>
        );
      })()}
      {open && (
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <label className="space-y-0.5"><span className="text-muted-foreground">UOM</span>
            <Select value={l.uom} onChange={(e) => onChange({ uom: e.target.value, rate: undefined })} className="h-8 text-xs">
              {(opts?.uoms ?? [{ uom: l.uom, conversion_factor: 1 }]).map((u) => <option key={u.uom} value={u.uom}>{u.uom}{u.conversion_factor !== 1 ? ` (×${u.conversion_factor})` : ""}</option>)}
            </Select></label>
          {profile.allow_rate_change ? (
            <label className="space-y-0.5"><span className="text-muted-foreground">Rate</span>
              <Input type="number" min={0} value={l.rate ?? row?.price_list_rate ?? l.price_list_rate} onChange={(e) => onChange({ rate: Number(e.target.value) })} className="h-8 text-xs" /></label>
          ) : <div />}
          {opts?.has_batch_no ? (
            <label className="col-span-2 space-y-0.5"><span className="text-muted-foreground">Batch</span>
              <Select value={l.batch_no ?? ""} onChange={(e) => onChange({ batch_no: e.target.value || undefined })} className="h-8 text-xs">
                {opts.batches.map((b) => <option key={b.batch_no} value={b.batch_no}>{b.batch_no} — {b.qty} available{b.expiry_date ? ` · exp ${b.expiry_date}` : ""}</option>)}
              </Select></label>
          ) : null}
          {opts?.has_serial_no ? (
            <div className="col-span-2 space-y-1"><span className="text-muted-foreground">Serial numbers ({serials.length} selected)</span>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">{opts.serials.map((s) => (
                <button key={s} type="button" onClick={() => toggleSerial(s)}
                  className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px]", serials.includes(s) ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{s}</button>
              ))}{opts.serials.length === 0 && <span className="text-muted-foreground">No serials in this warehouse.</span>}</div></div>
          ) : null}
          {opts && <div className="col-span-2 text-[11px] text-muted-foreground">{opts.actual_qty} {opts.stock_uom} in {profile.warehouse}</div>}
        </div>
      )}
    </div>
  );
}

function CustomerPicker({ value, onChange, inputRef, offlineList }: {
  value: string; onChange: (v: string) => void; inputRef: React.RefObject<HTMLInputElement>; offlineList?: { name: string; customer_name: string; mobile_no?: string }[];
}) {
  const [q, setQ] = useState("");
  const { data: live } = useFrappeGetDocList<{ name: string; customer_name: string; mobile_no?: string }>("Customer", {
    fields: ["name", "customer_name", "mobile_no"] as never, filters: [["disabled", "=", 0]] as never,
    orFilters: q ? ([["name", "like", `%${q}%`], ["customer_name", "like", `%${q}%`], ["mobile_no", "like", `%${q}%`]] as never) : undefined, limit: 20,
  }, offlineList ? null : `pos.customers.${q}`);
  const ql = q.toLowerCase();
  const data = offlineList ? offlineList.filter((c) => !ql || c.name.toLowerCase().includes(ql) || c.customer_name.toLowerCase().includes(ql) || (c.mobile_no ?? "").includes(ql)).slice(0, 30) : live;
  return (
    <>
      <input ref={inputRef} list="pos-customers" value={q || value} onChange={(e) => { setQ(e.target.value); const hit = (data ?? []).find((c) => c.name === e.target.value); if (hit) { onChange(hit.name); setQ(""); } }}
        onBlur={() => setQ("")} className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm" placeholder="Customer, mobile…  (F4)" aria-label="Customer" />
      <datalist id="pos-customers">{(data ?? []).map((c) => <option key={c.name} value={c.name}>{c.customer_name}{c.mobile_no ? ` · ${c.mobile_no}` : ""}</option>)}</datalist>
    </>
  );
}

function CouponBox({ coupon, onApply }: { coupon: Coupon | null; onApply: (c: Coupon | null) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (coupon) {
    return (
      <span className="inline-flex flex-1 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
        <Ticket className="h-3.5 w-3.5" /><span className="truncate font-medium">{coupon.coupon_code}</span>{coupon.title ? <span className="truncate opacity-75">· {coupon.title}</span> : null}
        <button type="button" className="ml-auto" onClick={() => onApply(null)} aria-label="Remove coupon"><X className="h-3.5 w-3.5" /></button>
      </span>
    );
  }
  const apply = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try { const c = (await getCall<Coupon>("mm_core.pos.check_coupon", { code: code.trim() })); onApply(c); setCode(""); toast.success(`Coupon ${c.coupon_code} applied`); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-1 items-center gap-1">
      <div className="relative flex-1"><Ticket className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && void apply()} placeholder="Coupon code"
          className="w-full rounded-md border border-border bg-transparent py-0.5 pl-7 pr-2 text-xs uppercase" aria-label="Coupon code" /></div>
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={busy || !code.trim()} onClick={() => void apply()}>Apply</Button>
    </div>
  );
}

function OpenShift({ ctx, onOpened }: { ctx: Ctx; onOpened: () => void }) {
  const [profile, setProfile] = useState(ctx.profile?.name ?? ctx.profiles[0]?.name ?? "");
  const [picking, setPicking] = useState(false);
  const { data } = useFrappeGetCall<{ message: Ctx }>("mm_core.pos.get_context", { pos_profile: profile }, `mm_core.pos.ctx.${profile}`);
  const p = unwrap<Ctx>(data)?.profile;
  const money = (v?: number) => formatMoney(v ?? 0, p?.currency ?? "PKR");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const total = Object.values(amounts).reduce((a, v) => a + (Number(v) || 0), 0);
  const now = new Date();
  const open = async () => {
    setBusy(true);
    try {
      await postCall("mm_core.pos.open_shift", { pos_profile: profile, balances: JSON.stringify((p?.payments ?? []).map((m) => ({ mode_of_payment: m.mode_of_payment, opening_amount: amounts[m.mode_of_payment] ?? 0 }))) });
      toast.success("Shift opened — happy selling!");
      onOpened();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto mt-6 max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
      {/* title */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-teal-600 to-violet-700 px-6 py-6 text-white">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-20 left-6 h-40 w-40 rounded-full bg-violet-400/30 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-inset ring-white/30 backdrop-blur"><Store className="h-7 w-7" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold leading-tight">Open POS shift</h2>
            <p className="text-sm text-white/80">Count the drawer before the first sale</p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/25"><User className="h-3.5 w-3.5" />{ctx.cashier}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/25"><CalendarClock className="h-3.5 w-3.5" />{now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-inset ring-white/25"><Clock className="h-3.5 w-3.5" />{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {/* counter */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Counter</div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md"><Store className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold">{profile}</div>
              <div className="truncate text-xs text-muted-foreground">{p ? `${p.company} · ${p.warehouse}` : "Loading…"}</div>
            </div>
            {ctx.profiles.length > 1 && <Button variant="outline" size="sm" onClick={() => setPicking((v) => !v)}>{picking ? "Done" : "Change"}</Button>}
          </div>
          {picking && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ctx.profiles.map((x) => (
                <button key={x.name} type="button" onClick={() => { setProfile(x.name); setAmounts({}); setPicking(false); }}
                  className={cn("flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm transition-all", x.name === profile ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
                  <Store className="h-4 w-4 text-muted-foreground" /><span className="min-w-0"><span className="block truncate font-semibold">{x.name}</span><span className="block truncate text-[11px] text-muted-foreground">{x.company}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* opening balances */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Opening balance</span>
            <span className="text-[11px] text-muted-foreground">optional — what's in the drawer now</span>
          </div>
          <div className="space-y-2">
            {!p ? <Skeleton className="h-36 rounded-2xl" /> : p.payments.map((m) => {
              const I = modeIcon(m.mode_of_payment);
              const t = TILE_TONE[modeTone(m.mode_of_payment)];
              const isCash = /cash/i.test(m.mode_of_payment);
              return (
                <div key={m.mode_of_payment} className="rounded-2xl border border-border bg-background/50 p-3 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", t.g)}><I className="h-5 w-5" /></span>
                    <label htmlFor={`open-${m.mode_of_payment}`} className="min-w-0 flex-1">
                      <span className="block truncate whitespace-nowrap text-sm font-bold">{m.mode_of_payment}</span>
                      <span className="block truncate whitespace-nowrap text-[11px] text-muted-foreground">{isCash ? "Notes and coins in the drawer" : m.default ? "Default method" : "Usually zero at opening"}</span>
                    </label>
                    <div className="ml-auto w-44 shrink-0">
                      <Input id={`open-${m.mode_of_payment}`} type="number" min={0} placeholder="0.00" value={amounts[m.mode_of_payment] || ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [m.mode_of_payment]: Number(e.target.value) }))}
                        className="h-11 rounded-xl text-right text-lg font-bold tabular-nums" />
                    </div>
                  </div>
                  {isCash && (
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      {[1000, 2000, 5000, 10000].map((v) => (
                        <button key={v} type="button" onClick={() => setAmounts((a) => ({ ...a, [m.mode_of_payment]: v }))}
                          className={cn("rounded-full border px-3 py-0.5 text-xs font-semibold tabular-nums", amounts[m.mode_of_payment] === v ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "border-border bg-card hover:border-emerald-500/50")}>{money(v)}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* bottom panel */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/40 px-6 py-4">
        <Link to="/pos" className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted"><LayoutDashboard className="h-4 w-4" /> Back</Link>
        <div className="ml-auto text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Opening float</div>
          <div className="text-lg font-extrabold tabular-nums">{money(total)}</div>
        </div>
        <button type="button" onClick={() => void open()} disabled={busy || !p}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Open shift</button>
      </div>
    </div>
  );
}

function PayDialog({ profile, total, payload, draft, money, customer, isWalkIn, offline, sync, bundle, cashier, preview, lines, customerName, onClose, onDone }: {
  profile: Profile; total: number; payload: Record<string, unknown>; draft: string | null; money: Money; customer?: CustomerInfo; isWalkIn: boolean;
  offline: boolean; sync: SyncState; bundle?: OfflineBundle; cashier: string; preview: Preview; lines: Line[]; customerName: string;
  onClose: () => void; onDone: () => void;
}) {
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const def = profile.payments.find((m) => m.default)?.mode_of_payment ?? profile.payments[0]?.mode_of_payment;
  const [amounts, setAmounts] = useState<Record<string, number>>(def ? { [def]: total } : {});
  const [points, setPoints] = useState(0);
  const [credit, setCredit] = useState(false);
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().slice(0, 10); });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; change_amount?: number; outstanding_amount?: number; write_off_amount?: number; loyalty_amount?: number; print_format: string } | null>(null);

  const cf = customer?.conversion_factor ?? 0;
  const maxPoints = customer?.loyalty_program ? Math.min(customer.loyalty_points, cf ? Math.floor(total / cf) : 0) : 0;
  const loyaltyAmount = Math.round(points * cf * 100) / 100;
  const due = Math.max(0, total - loyaltyAmount);
  const paid = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const short = Math.round((due - paid) * 100) / 100;
  const change = Math.max(0, paid - due);
  const canWriteOff = short > 0 && short <= (profile.write_off_limit ?? 0);
  const canCredit = !!profile.allow_partial_payment && !isWalkIn;
  const printer = loadPrinter();
  const whole = (v?: number) => formatMoney(Math.round(v ?? 0), profile.currency ?? "PKR", { decimals: 0 });   // the counter counts whole rupees
  const autoPrint = printer.autoPrint;   // only when this device's Printer settings ask for it (the profile flag is ignored)
  const paymentsOut = () => Object.entries(amounts).filter(([, a]) => Number(a)).map(([mode_of_payment, amount]) => ({ mode_of_payment, amount, reference_no: refs[mode_of_payment] || undefined }));

  /** Ring the sale up on this device (offline): queue it, take the stock off the cached grid, print a local receipt. */
  const queueOffline = async (opts: { write_off?: boolean }) => {
    const now = new Date();
    const offline_id = uuid();
    const payments = paymentsOut();
    const paidNow = payments.reduce((a, p) => a + Number(p.amount), 0);
    const data = { ...payload, draft: undefined, coupon_code: undefined, offline_id, offline_at: `${localDate(now)} ${localTime(now)}`, posting_date: localDate(now),
      posting_time: localTime(now), credit: credit ? 1 : undefined, due_date: credit ? dueDate : undefined, write_off: opts.write_off ? 1 : undefined, payments };
    const rc: ReceiptData = {
      name: `OFFLINE-${offline_id.slice(0, 8).toUpperCase()}`, posting_date: localDate(now), posting_time: localTime(now), customer: String(payload.customer ?? ""),
      customer_name: customerName, cashier, pos_profile: profile.name, currency: profile.currency, company: bundle?.company ?? { company_name: profile.company },
      items: preview.items.map((i) => ({ ...i })), total: preview.total, net_total: preview.net_total, discount_amount: preview.discount_amount,
      additional_discount_percentage: preview.additional_discount_percentage, taxes: preview.taxes, grand_total: preview.grand_total, rounded_total: total,
      payments, paid_amount: paidNow, change_amount: Math.max(0, paidNow - total), outstanding_amount: credit ? Math.max(0, total - paidNow) : 0,
      write_off_amount: opts.write_off ? Math.max(0, total - paidNow) : 0, remarks: payload.remarks as string | undefined, offline_id, pending_sync: true,
      total_qty: lines.reduce((a, l) => a + soldQty(l), 0),
    };
    const q: QueuedSale = { offline_id, created: now.toISOString(), pos_profile: profile.name, customer_name: customerName, total, status: "pending", attempts: 0, data, receipt: rc };
    await sync.enqueue(q);
    await consumeBundleStock(profile.name, lines.map((l) => ({ item_code: l.item_code, qty: soldQty(l) })));
    setReceipt(rc);
    setDone({ name: rc.name, change_amount: rc.change_amount, outstanding_amount: rc.outstanding_amount, write_off_amount: rc.write_off_amount, print_format: "" });
    if (autoPrint) printReceipt(rc, printer);
  };
  const quick = [due, Math.ceil(due / 100) * 100, Math.ceil(due / 500) * 500, Math.ceil(due / 1000) * 1000, Math.ceil(due / 5000) * 5000]
    .filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 5);

  // keep the default mode at "exactly the amount due" when loyalty points change the due amount
  const [tile, setTile] = useState<string>(def ?? "split");          // a payment mode, "credit" (pay later) or "split"
  useEffect(() => { if (tile !== "split" && tile !== "credit") setAmounts({ [tile]: due }); }, [due, tile]);
  const pick = (t: string) => {
    setTile(t);
    if (t === "credit") { setCredit(true); setAmounts({}); }
    else { setCredit(false); if (t !== "split") setAmounts({ [t]: due }); }
  };

  const complete = async (opts: { write_off?: boolean } = {}) => {
    setBusy(true);
    try {
      if (offline) { await queueOffline(opts); return; }
      const r = await postCall<NonNullable<typeof done>>("mm_core.pos.submit_invoice", {
        data: JSON.stringify({ ...payload, draft, redeem_points: points || undefined, credit: credit ? 1 : undefined, due_date: credit ? dueDate : undefined,
          write_off: opts.write_off ? 1 : undefined, payments: paymentsOut() }),
      });
      setDone(r);
      void getCall<ReceiptData>("mm_core.pos.receipt", { name: r.name }).then((rc) => { setReceipt(rc); if (autoPrint) printReceipt(rc, printer); }).catch(() => undefined);
    } catch (e) {
      if (isNetworkError(e) && !draft) {                       // connection dropped mid-sale: keep selling offline
        sync.markOffline();
        toast("Connection lost — sale saved on this device and will sync.", { icon: "📴" });
        await queueOffline(opts);
      } else toast.error(humanizeError(e));
    } finally { setBusy(false); }
  };
  const ready = short <= 0.005 || credit;

  return (
    <Dialog open onClose={done ? onDone : onClose} size="md" className={done ? "max-w-md" : "max-w-xl"}>
      {done ? (
        <div className="space-y-4">
          {/* print receipt card */}
          <div className="-mx-5 -mt-5 flex items-center gap-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 py-3.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30"><Printer className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold leading-tight">Print receipt</div>
              <div className="truncate text-[11px] text-white/85">{done.name} · {whole(total)}{receipt?.pending_sync ? " · saved offline" : ""}</div>
            </div>
            <button type="button" onClick={onDone} className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          {/* always shown: what was due, what was handed over, what to give back */}
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border">
            <div className="bg-card p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-lg font-extrabold tabular-nums">{whole(total)}</div>
            </div>
            <div className="border-x border-border bg-card p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Received</div>
              <div className="text-lg font-extrabold tabular-nums text-sky-600 dark:text-sky-400">{whole(paid)}</div>
            </div>
            <div className={cn("p-3 text-center", (done.change_amount ?? 0) > 0 ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10" : "bg-card")}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Give change</div>
              <div className={cn("font-extrabold tabular-nums", (done.change_amount ?? 0) > 0 ? "text-2xl text-amber-600 dark:text-amber-400" : "text-lg text-muted-foreground")}>{whole(done.change_amount ?? 0)}</div>
            </div>
          </div>
          {(credit && done.outstanding_amount) || done.loyalty_amount || done.write_off_amount || receipt?.pending_sync ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {credit && done.outstanding_amount ? <span className="rounded-full bg-rose-500/10 px-3 py-1 font-semibold text-rose-600 ring-1 ring-inset ring-rose-500/25">On credit {money(done.outstanding_amount)} · due {dueDate}</span> : null}
              {done.loyalty_amount ? <span className="rounded-full bg-amber-500/10 px-3 py-1 font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300">Loyalty redeemed {money(done.loyalty_amount)}</span> : null}
              {done.write_off_amount ? <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground ring-1 ring-inset ring-border">Written off {money(done.write_off_amount)}</span> : null}
              {receipt?.pending_sync ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 font-semibold text-sky-700 ring-1 ring-inset ring-sky-500/25 dark:text-sky-300"><CloudOff className="h-3 w-3" /> Saved offline — syncs automatically</span> : null}
            </div>
          ) : null}
          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            {receipt ? <ReceiptPreview html={receiptHtml(receipt, { ...printer, paper: printer.paper === "a4" ? "80" : printer.paper })} className="mx-auto h-[400px] w-full max-w-[330px] rounded-lg bg-white shadow-lg ring-1 ring-black/10" />
              : <Skeleton className="mx-auto h-[400px] w-full max-w-[330px] rounded-lg" />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!receipt} onClick={() => receipt && printReceipt(receipt, printer)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-base font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:opacity-50"><Printer className="h-5 w-5" /> Print now</button>
            <button type="button" onClick={onDone} autoFocus
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-110"><Plus className="h-5 w-5" /> New order</button>
          </div>
          {!receipt?.pending_sync && (
            <div className="text-center"><button type="button" onClick={() => window.open(printUrl(done.name, done.print_format), "_blank")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><FileText className="h-3.5 w-3.5" /> A4 invoice</button></div>
          )}
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void complete(); }}>
          {/* hero */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-teal-600 to-violet-700 p-5 text-white shadow-lg shadow-primary/30">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <span aria-hidden className="pointer-events-none absolute -bottom-16 left-10 h-36 w-36 rounded-full bg-violet-400/30 blur-2xl" />
            <div className="relative flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">Amount to pay</div>
                <div className="mt-1 text-4xl font-extrabold leading-none tabular-nums drop-shadow-sm">{money(due)}</div>
                {loyaltyAmount ? <div className="mt-1 text-[11px] text-white/80">{money(total)} − {money(loyaltyAmount)} loyalty points</div> : null}
              </div>
              <div className="text-right text-xs">
                <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-semibold ring-1 ring-inset ring-white/30"><User className="h-3.5 w-3.5" />{customerName}</div>
                <div className="mt-1.5 text-white/75">{lines.length} line{lines.length === 1 ? "" : "s"} · {lines.reduce((a, l) => a + l.qty, 0)} qty</div>
              </div>
            </div>
          </div>

          {maxPoints > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent p-2.5">
              <label htmlFor="pay-points" className="flex items-center gap-2 text-sm font-medium"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white"><Award className="h-4 w-4" /></span>
                Redeem points <span className="text-[11px] font-normal text-muted-foreground">{customer?.loyalty_points} available · 1 pt = {money(cf)}</span></label>
              <div className="flex shrink-0 items-center gap-1"><div className="w-24"><Input id="pay-points" type="number" min={0} max={maxPoints} value={points || ""} className="h-9 text-right"
                onChange={(e) => setPoints(Math.max(0, Math.min(maxPoints, Math.floor(Number(e.target.value) || 0))))} /></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setPoints(maxPoints)}>Max</Button></div>
            </div>
          )}

          {/* method tiles */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {profile.payments.map((m) => <PayTile key={m.mode_of_payment} label={m.mode_of_payment} icon={modeIcon(m.mode_of_payment)} active={tile === m.mode_of_payment}
              onClick={() => pick(m.mode_of_payment)} sub={tile === m.mode_of_payment ? money(amounts[m.mode_of_payment] ?? 0) : undefined} tone={modeTone(m.mode_of_payment)} />)}
            {canCredit && <PayTile label="Pay later" icon={CalendarClock} active={tile === "credit"} onClick={() => pick("credit")} sub="credit sale" tone="amber" />}
            {profile.payments.length > 1 && <PayTile label="Split" icon={SplitSquareHorizontal} active={tile === "split"} onClick={() => pick("split")} sub="several modes" tone="slate" />}
          </div>

          {/* amounts */}
          {profile.payments.filter((m) => tile === "split" || tile === m.mode_of_payment).map((m) => {
            const I = modeIcon(m.mode_of_payment);
            const t = TILE_TONE[modeTone(m.mode_of_payment)];
            const isCash = /cash/i.test(m.mode_of_payment);
            return (
              <div key={m.mode_of_payment} className="space-y-2.5 rounded-2xl border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", t.g)}><I className="h-5 w-5" /></span>
                  <label htmlFor={`pay-${m.mode_of_payment}`} className="min-w-0 flex-1">
                    <span className="block truncate whitespace-nowrap text-sm font-bold">{m.mode_of_payment}</span>
                    <span className="block truncate whitespace-nowrap text-[11px] text-muted-foreground">{isCash ? "Cash handed over" : "Amount on this method"}</span>
                  </label>
                  <div className="ml-auto w-44 shrink-0">
                    <Input id={`pay-${m.mode_of_payment}`} type="number" min={0} value={amounts[m.mode_of_payment] ?? ""} className="h-12 rounded-xl text-right text-xl font-bold tabular-nums"
                      onChange={(e) => setAmounts((a) => ({ ...a, [m.mode_of_payment]: Number(e.target.value) }))} />
                  </div>
                  <button type="button" title="Put the remainder here" onClick={() => setAmounts((a) => ({ ...a, [m.mode_of_payment]: Math.max(0, (a[m.mode_of_payment] ?? 0) + short) }))}
                    className="h-12 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary">Exact</button>
                </div>
                {!isCash && (amounts[m.mode_of_payment] ?? 0) > 0 && (
                  <Input value={refs[m.mode_of_payment] ?? ""} onChange={(e) => setRefs((r) => ({ ...r, [m.mode_of_payment]: e.target.value }))}
                    placeholder="Card / slip / transaction no" className="h-9 rounded-xl text-sm" aria-label={`${m.mode_of_payment} reference`} />
                )}
                {isCash && (
                  <div className="flex flex-wrap gap-1.5">{quick.map((v, i) => (
                    <button key={v} type="button" onClick={() => setAmounts((a) => ({ ...a, [m.mode_of_payment]: v }))}
                      className={cn("rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors",
                        (amounts[m.mode_of_payment] ?? 0) === v ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "border-border bg-card hover:border-emerald-500/50")}>
                      {i === 0 ? "Exact " : ""}{money(v)}</button>
                  ))}</div>
                )}
                {isCash && tile !== "split" && <Keypad value={amounts[m.mode_of_payment] ?? 0} onChange={(v) => setAmounts((a) => ({ ...a, [m.mode_of_payment]: v }))} />}
              </div>
            );
          })}

          {canCredit && (tile === "credit" || tile === "split") && (
            <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent p-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} disabled={tile === "credit"} />
                <CalendarClock className="h-4 w-4 text-amber-600" />Credit sale — {customer?.customer_name} pays {tile === "credit" ? "the full amount" : "the rest"} later</label>
              {credit && (
                <div className="flex items-center justify-between gap-2 text-sm"><label htmlFor="pay-due" className="text-muted-foreground">Due date</label>
                  <Input id="pay-due" type="date" min={today()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-44" /></div>
              )}
              {credit && customer?.credit_limit ? <p className={cn("text-[11px]", customer.outstanding + short > customer.credit_limit ? "text-rose-600" : "text-muted-foreground")}>
                Due after this sale {money(customer.outstanding + Math.max(short, 0))} of {money(customer.credit_limit)} limit</p> : null}
            </div>
          )}

          {/* summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/10 to-transparent p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Paid</div>
              <div className="text-2xl font-extrabold tabular-nums">{money(paid)}</div>
            </div>
            {short > 0.005 ? (
              <div className={cn("rounded-2xl border p-3", credit ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent" : "border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-transparent")}>
                <div className={cn("text-[11px] font-bold uppercase tracking-wider", credit ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300")}>{credit ? "On credit" : "Still to pay"}</div>
                <div className={cn("text-2xl font-extrabold tabular-nums", credit ? "text-amber-600" : "text-rose-600")}>{money(short)}</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-transparent p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Change</div>
                <div className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{money(change)}</div>
              </div>
            )}
          </div>

          {canWriteOff && !credit && (
            <Button type="button" variant="outline" className="w-full rounded-xl" disabled={busy} onClick={() => void complete({ write_off: true })}>Write off {money(short)} and complete</Button>
          )}
          <button type="submit" disabled={busy || !ready}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none">
            {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {credit && short > 0.005 ? "Complete credit sale" : `Complete sale · ${money(due)}`} <span className="rounded bg-white/20 px-1.5 text-[10px]">Enter</span>
          </button>
        </form>
      )}
    </Dialog>
  );
}

function HeldDialog({ profile, money, onClose, onResume }: { profile: Profile; money: Money; onClose: () => void; onResume: (n: string) => void }) {
  const { data } = useFrappeGetCall<{ message: { name: string; customer_name: string; grand_total: number; modified: string; remarks?: string }[] }>("mm_core.pos.held_invoices", { pos_profile: profile.name }, `pos.held.${profile.name}.${Date.now() >> 12}`);
  const rows = unwrap<{ name: string; customer_name: string; grand_total: number; modified: string; remarks?: string }[]>(data) ?? [];
  return (
    <Dialog open onClose={onClose} title="Held sales" size="md">
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing on hold.</p> : (
        <ul className="divide-y divide-border">{rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1"><div className="text-sm font-medium">{r.customer_name}</div><div className="truncate text-[11px] text-muted-foreground">{r.name} · {r.modified.slice(0, 16)}{r.remarks ? ` · ${r.remarks}` : ""}</div></div>
            <span className="text-sm font-semibold tabular-nums">{money(r.grand_total)}</span>
            <Button size="sm" onClick={() => onResume(r.name)}>Resume</Button>
          </li>))}</ul>
      )}
    </Dialog>
  );
}

interface Offer { name: string; title?: string; apply_on: string; price_or_product_discount: string; rate_or_discount?: string; discount_percentage?: number; discount_amount?: number;
  rate?: number; min_qty?: number; min_amt?: number; coupon_code_based?: number; free_item?: string; free_qty?: number; valid_upto?: string; targets: string[]; coupons: string[] }

function OffersDialog({ profile, money, onClose, onCoupon }: { profile: Profile; money: Money; onClose: () => void; onCoupon: (c: Coupon) => void }) {
  const { data } = useFrappeGetCall<{ message: Offer[] }>("mm_core.pos.offers", { pos_profile: profile.name }, `pos.offers.${profile.name}`);
  const rows = unwrap<Offer[]>(data) ?? [];
  const benefit = (o: Offer) => o.price_or_product_discount === "Product" ? `Free ${o.free_qty ?? 1} × ${o.free_item || "same item"}`
    : o.rate_or_discount === "Discount Percentage" ? `${o.discount_percentage}% off` : o.rate_or_discount === "Discount Amount" ? `${money(o.discount_amount)} off` : `Special rate ${money(o.rate)}`;
  return (
    <Dialog open onClose={onClose} title="Offers" description="ERPNext pricing rules live today. Automatic offers apply as you add items; coupon offers need the code." size="lg">
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No active offers. Create Pricing Rules (Selling) to run promotions.</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">{rows.map((o) => (
          <li key={o.name} className="space-y-1.5 rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold">{o.title || o.name}</div>
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", o.coupon_code_based ? "bg-violet-500/15 text-violet-700 dark:text-violet-400" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}>
                {o.coupon_code_based ? "Coupon" : "Auto"}</span>
            </div>
            <div className="text-lg font-bold text-primary">{benefit(o)}</div>
            <div className="text-[11px] text-muted-foreground">
              {o.apply_on === "Transaction" ? "On the whole bill" : `${o.apply_on}: ${o.targets.join(", ") || "—"}`}
              {o.min_qty ? ` · min ${o.min_qty} qty` : ""}{o.min_amt ? ` · min ${money(o.min_amt)}` : ""}{o.valid_upto ? ` · until ${o.valid_upto}` : ""}
            </div>
            {o.coupons.length > 0 && <div className="flex flex-wrap gap-1">{o.coupons.map((c) => (
              <button key={c} type="button" onClick={() => void getCall<Coupon>("mm_core.pos.check_coupon", { code: c }).then(onCoupon).catch((e) => toast.error(humanizeError(e)))}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-violet-500/50 px-2 py-0.5 font-mono text-xs text-violet-700 hover:bg-violet-500/10 dark:text-violet-400"><Ticket className="h-3 w-3" />{c}</button>
            ))}</div>}
          </li>))}</ul>
      )}
    </Dialog>
  );
}

function NewCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const [f, setF] = useState({ customer_name: "", mobile_no: "", email_id: "", tax_id: "", customer_type: "Individual" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const r = (await postCall<{ name: string }>("mm_core.pos.create_customer", { data: JSON.stringify(f) }));
      toast.success(`Customer ${r.name} created`);
      onCreated(r.name);
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="New customer" size="sm">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Name *</span><Input autoFocus required value={f.customer_name} onChange={set("customer_name")} /></label>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Mobile</span><Input inputMode="tel" value={f.mobile_no} onChange={set("mobile_no")} placeholder="03xx-xxxxxxx" /></label>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Email</span><Input type="email" value={f.email_id} onChange={set("email_id")} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">NTN / CNIC</span><Input value={f.tax_id} onChange={set("tax_id")} /></label>
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Type</span>
            <Select value={f.customer_type} onChange={set("customer_type")}><option>Individual</option><option>Company</option></Select></label>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !f.customer_name.trim()}><UserPlus className="h-4 w-4" /> Create and select</Button>
      </form>
    </Dialog>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [["F2", "Search / scan"], ["F4", "Customer"], ["F8", "Hold the sale"], ["F9", "Pay"], ["F10", "Invoices & returns"], ["F12", "Sync status"], ["Enter", "Add the only match · complete payment"], ["Ctrl + Del", "Clear the cart"], ["Esc", "Clear search · close dialog"]];
  return (
    <Dialog open onClose={onClose} title="Keyboard shortcuts" size="sm">
      <ul className="space-y-1.5 text-sm">{keys.map(([k, v]) => (
        <li key={k} className="flex items-center justify-between"><span className="text-muted-foreground">{v}</span><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd></li>
      ))}</ul>
    </Dialog>
  );
}

const NOTES = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

interface ShiftMode { mode_of_payment: string; opening: number; sales: number; change?: number; dues?: number; expected: number; is_cash?: boolean }
interface ShiftSummary {
  shift: { name: string; period_start_date: string }; profile: string; cashier: string; invoices: number; returns: number; total: number; gross: number; refunds: number;
  net_total: number; tax_total: number; discounts: number; change: number;
  rows: { name: string; type: string; customer: string; time: string; date: string; amount: number; discount?: number; modes: string; offline: boolean }[];
  taxes: { description: string; rate: number; amount: number }[]; modes: ShiftMode[];
}

function CloseShiftDialog({ money, pending, onSync, onClose, onClosed }: { money: Money; pending: number; onSync: () => void; onClose: () => void; onClosed: () => void }) {
  const { data } = useFrappeGetCall<{ message: ShiftSummary }>("mm_core.pos.shift_summary", undefined, `pos.summary.${Date.now() >> 14}`);
  const s = unwrap<ShiftSummary>(data);
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<number, number>>({});
  const [countNotes, setCountNotes] = useState(false);
  const [showInvoices, setShowInvoices] = useState(true);
  const [busy, setBusy] = useState(false);
  const printer = loadPrinter();
  useEffect(() => { if (s) setCounted(Object.fromEntries(s.modes.map((m) => [m.mode_of_payment, m.expected]))); }, [s]);
  const cashMode = s?.modes.find((m) => m.is_cash ?? /cash/i.test(m.mode_of_payment))?.mode_of_payment;
  const notesTotal = NOTES.reduce((a, n) => a + n * (notes[n] ?? 0), 0);
  useEffect(() => { if (countNotes && cashMode) setCounted((c) => ({ ...c, [cashMode]: notesTotal })); }, [countNotes, notesTotal, cashMode]);

  const totalExpected = (s?.modes ?? []).reduce((a, m) => a + m.expected, 0);
  const totalActual = (s?.modes ?? []).reduce((a, m) => a + (counted[m.mode_of_payment] ?? 0), 0);
  const variance = Math.round((totalActual - totalExpected) * 100) / 100;
  const startedAt = s ? new Date(s.shift.period_start_date.replace(" ", "T")) : null;
  const duration = (() => {
    if (!startedAt) return "";
    const mins = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return [d && `${d} day${d > 1 ? "s" : ""}`, h && `${h}h`, `${m}m`].filter(Boolean).join(" ");
  })();

  const printX = async () => {
    try { printHtml(shiftReportHtml(await getCall<ShiftReport>("mm_core.pos.shift_report"), printer)); } catch (e) { toast.error(humanizeError(e)); }
  };
  const close = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ name: string }>("mm_core.pos.close_shift", { counted: JSON.stringify(counted) });
      toast.success(`Shift closed — ${r.name}`);
      if (printer.printZOnClose) void getCall<ShiftReport>("mm_core.pos.last_shift_report").then((z) => { if (z?.type) printHtml(shiftReportHtml(z, printer)); }).catch(() => undefined);
      onClosed();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="xl" className="max-w-4xl sm:mt-6">
      {/* header */}
      <div className="-mx-5 -mt-5 mb-4 flex items-center gap-3 border-b border-border bg-gradient-to-r from-rose-500/10 via-transparent to-violet-500/10 px-5 py-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/30 ring-1 ring-inset ring-white/20"><Lock className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">Close POS shift</h2>
          <p className="text-xs text-muted-foreground">Check the sales, count the drawer, then post the closing entry</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      {pending > 0 ? (
        <div className="space-y-3 py-6 text-center">
          <CloudOff className="mx-auto h-10 w-10 text-amber-500" />
          <p className="text-sm">{pending} offline sale(s) on this device haven't synced yet. Sync them before closing the shift.</p>
          <Button onClick={onSync}><RefreshCw className="h-4 w-4" /> Sync now</Button>
        </div>
      ) : !s ? <div className="space-y-3"><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-60 rounded-2xl" /></div> : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {/* 1 · shift summary */}
          <Section icon={Store} title={s.profile} subtitle={`${s.cashier} · opened ${startedAt?.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`}
            right={<div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Duration</div><div className="text-lg font-bold">{duration}</div></div>}>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <Kpi label="Gross sales" value={money(s.gross)} sub={`${s.invoices} invoice${s.invoices === 1 ? "" : "s"}`} cls="from-sky-500/15 border-sky-500/25 text-sky-700 dark:text-sky-300" />
              <Kpi label="Net sales" value={money(s.total)} sub={s.returns ? `after ${s.returns} return${s.returns > 1 ? "s" : ""} (${money(s.refunds)})` : "after returns"} cls="from-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:text-emerald-300" />
              <Kpi label="Tax collected" value={money(s.tax_total)} sub={`on ${money(s.net_total)} net`} cls="from-violet-500/15 border-violet-500/25 text-violet-700 dark:text-violet-300" />
              <Kpi label="Discounts" value={money(s.discounts)} sub={`change given ${money(s.change)}`} cls="from-amber-500/15 border-amber-500/25 text-amber-700 dark:text-amber-300" />
            </div>
          </Section>

          {/* 2 · invoices */}
          <Section icon={ReceiptText} title="Invoice details" subtitle={`${s.rows.length} transaction${s.rows.length === 1 ? "" : "s"} · ${money(s.total)}`}
            right={<button type="button" onClick={() => setShowInvoices((v) => !v)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Toggle invoices"><ChevronDown className={cn("h-4 w-4 transition-transform", showInvoices && "rotate-180")} /></button>}>
            {showInvoices && (s.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No sales in this shift.</p> : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                    <tr><th className="px-3 py-2 text-left">Invoice</th><th className="text-left">Type</th><th className="text-left">Customer</th><th className="text-left">Paid by</th><th className="text-left">Time</th><th className="text-right">Discount</th><th className="px-3 text-right">Amount</th></tr>
                  </thead>
                  <tbody>{s.rows.map((r, i) => (
                    <tr key={r.name} className={cn("border-t border-border", i % 2 ? "bg-muted/30" : "bg-card")}>
                      <td className="px-3 py-2 font-mono text-[13px] font-semibold">{r.name}{r.offline && <span className="ml-1.5 rounded bg-sky-500/10 px-1 font-sans text-[10px] text-sky-600">offline</span>}</td>
                      <td><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", r.type === "Return" ? "bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300" : "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300")}>{r.type}</span></td>
                      <td className="max-w-[160px] truncate">{r.customer}</td>
                      <td className="text-xs text-foreground/75">{r.modes || "—"}</td>
                      <td className="text-xs tabular-nums text-foreground/75">{r.time}</td>
                      <td className={cn("text-right text-xs tabular-nums", r.discount ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{r.discount ? money(r.discount) : "—"}</td>
                      <td className={cn("px-3 text-right font-semibold tabular-nums", r.amount < 0 && "text-rose-600")}>{money(r.amount)}</td>
                    </tr>))}</tbody>
                  <tfoot><tr className="border-t-2 border-border bg-muted/60"><td colSpan={5} className="px-3 py-2 text-sm font-bold">Net total</td><td className="text-right text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400">{money(s.discounts)}</td><td className="px-3 text-right text-base font-extrabold tabular-nums">{money(s.total)}</td></tr></tfoot>
                </table>
              </div>
            ))}
          </Section>

          {/* 3 · payment reconciliation */}
          <Section icon={Calculator} title="Payment reconciliation" subtitle="Actual amounts start at the expected figures — count and change any that differ"
            right={<div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total variance</div>
              <div className={cn("text-lg font-bold tabular-nums", Math.abs(variance) < 0.01 ? "text-emerald-600" : variance < 0 ? "text-rose-600" : "text-amber-600")}>{Math.abs(variance) < 0.01 ? "Balanced" : money(variance)}</div></div>}>
            <div className="space-y-3">
              {s.modes.map((m) => {
                const actual = counted[m.mode_of_payment] ?? 0;
                const diff = Math.round((actual - m.expected) * 100) / 100;
                const state = Math.abs(diff) < 0.01 ? "ok" : diff < 0 ? "short" : "over";
                const tone = { ok: "border-emerald-500/30 bg-emerald-500/[0.06]", short: "border-rose-500/30 bg-rose-500/[0.06]", over: "border-amber-500/30 bg-amber-500/[0.06]" }[state];
                const I = modeIcon(m.mode_of_payment);
                const t = TILE_TONE[modeTone(m.mode_of_payment)];
                const isCash = m.mode_of_payment === cashMode;
                return (
                  <div key={m.mode_of_payment} className={cn("rounded-2xl border p-3.5 transition-colors", tone)}>
                    <div className="mb-3 flex items-center gap-3">
                      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", t.g)}><I className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><div className="text-sm font-bold">{m.mode_of_payment}</div><div className="text-[11px] text-muted-foreground">Expected {money(m.expected)}</div></div>
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset",
                        state === "ok" ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300" : state === "short" ? "bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300" : "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300")}>
                        {state === "ok" ? <><CheckCircle2 className="h-3 w-3" /> Balanced</> : state === "short" ? `Short ${money(-diff)}` : `Over ${money(diff)}`}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Mini label="Opening" value={money(m.opening)} sub="Shift start" />
                      <Mini label="Expected" value={money(m.expected)}
                        sub={[m.sales ? `+${money(m.sales)} sales` : "", m.change ? `−${money(m.change)} change` : "", m.dues ? `${m.dues > 0 ? "+" : "−"}${money(Math.abs(m.dues))} in/out` : ""].filter(Boolean).join(" · ") || "No sales"} />
                      <div className="rounded-xl border-2 border-primary/40 bg-card p-2.5">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-primary">Actual amount
                          {Math.abs(diff) >= 0.01 && <button type="button" onClick={() => setCounted((c) => ({ ...c, [m.mode_of_payment]: m.expected }))} className="normal-case tracking-normal text-muted-foreground hover:text-primary">reset</button>}</div>
                        <Input type="number" value={actual} disabled={countNotes && isCash} onChange={(e) => setCounted((c) => ({ ...c, [m.mode_of_payment]: Number(e.target.value) }))}
                          className="mt-1 h-9 rounded-lg text-right text-lg font-bold tabular-nums" aria-label={`Actual ${m.mode_of_payment}`} />
                        <div className="mt-0.5 text-[10px] text-muted-foreground">Count &amp; enter</div>
                      </div>
                    </div>
                    {isCash && (
                      <div className="mt-2.5">
                        <label className="inline-flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={countNotes} onChange={(e) => setCountNotes(e.target.checked)} /><Calculator className="h-3.5 w-3.5 text-muted-foreground" /> Count cash by notes</label>
                        {countNotes && (
                          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">{NOTES.map((n) => (
                            <label key={n} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs"><span className="w-9 text-right font-semibold tabular-nums text-muted-foreground">{n}×</span>
                              <Input type="number" min={0} value={notes[n] ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [n]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} className="h-7 w-full text-right text-xs" /></label>
                          ))}</div>
                        )}
                      </div>
                    )}
                    {state !== "ok" && (
                      <div className={cn("mt-2.5 flex items-center justify-between rounded-xl border px-3 py-2 text-sm", state === "short" ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
                        <span><b>{state === "short" ? `${m.mode_of_payment} short` : `${m.mode_of_payment} over`}</b> <span className="text-xs opacity-80">— you have {state === "short" ? "less" : "more"} than expected</span></span>
                        <span className="text-base font-extrabold tabular-nums">{money(diff)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
              <div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total expected</div><div className="text-lg font-bold tabular-nums">{money(totalExpected)}</div></div>
              <div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total actual</div><div className="text-lg font-bold tabular-nums">{money(totalActual)}</div></div>
              <div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Net variance</div>
                <div className={cn("text-lg font-bold tabular-nums", Math.abs(variance) < 0.01 ? "text-emerald-600" : variance < 0 ? "text-rose-600" : "text-amber-600")}>{money(variance)}</div></div>
            </div>
          </Section>

          {/* 4 · tax summary */}
          <Section icon={Percent} title="Tax summary" subtitle="Collected in this shift">
            {s.taxes.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No tax on this shift's sales.</p> : (
              <div className="divide-y divide-border">
                {s.taxes.map((t) => (
                  <div key={t.description} className="flex items-center justify-between py-2 text-sm">
                    <span><span className="font-medium">{t.description}</span> <span className="ml-1 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{t.rate}%</span></span>
                    <span className="font-semibold tabular-nums">{money(t.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 text-sm font-bold"><span>Total tax collected</span><span className="text-base tabular-nums">{money(s.tax_total)}</span></div>
              </div>
            )}
          </Section>
        </div>
      )}

      {s && pending === 0 && (
        <div className="-mx-5 -mb-5 mt-4 flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => void printX()}><Printer className="h-4 w-4" /> X report</Button>
          <span className={cn("ml-auto text-xs font-medium", Math.abs(variance) < 0.01 ? "text-emerald-600" : "text-rose-600")}>
            {Math.abs(variance) < 0.01 ? "Drawer balanced" : `Variance ${money(variance)} will be recorded`}</span>
          <button type="button" disabled={busy} onClick={() => void close()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 disabled:opacity-60">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Close shift &amp; post</button>
        </div>
      )}
    </Dialog>
  );
}

function Section({ icon: Icon, title, subtitle, right, children }: { icon: typeof Store; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><div className="text-sm font-bold">{title}</div>{subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}</div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, cls }: { label: string; value: string; sub: string; cls: string }) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br to-transparent p-3", cls)}>
      <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-[11px] opacity-80">{sub}</div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={sub}>{sub}</div>
    </div>
  );
}
