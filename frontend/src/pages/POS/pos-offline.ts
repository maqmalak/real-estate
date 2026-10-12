/**
 * POS offline store and sync (POS Awesome style).
 *
 * - IndexedDB "mm-pos": `kv` (offline bundle per counter, cached context, last sync, synced log) and `queue`
 *   (sales rung up while the server was unreachable).
 * - Each queued sale carries an `offline_id`; the server posts it once (POS Invoice.mm_offline_id), so a retry after a
 *   dropped response never double-posts.
 * - `usePosSync` tracks online / offline (browser events + failed calls), pending / failed counts, and syncs the queue
 *   on reconnect and every 30 s.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getCall, humanizeError, postCall } from "@/services/frappe";

const DB_NAME = "mm-pos";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "offline_id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

export const kvGet = <T,>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key)).catch(() => undefined);
export const kvSet = (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key)).catch(() => undefined);

// ------------------------------------------------------------------ types shared with the terminal
export interface BundleItem { item_code: string; item_name: string; price_list_rate: number; actual_qty: number; uom: string; stock_uom?: string;
  item_image?: string; is_stock_item?: number; barcodes: string[]; item_group?: string }
export interface BundleTax { charge_type: string; description: string; rate: number; included_in_print_rate?: number }
export interface CompanyHeader { company_name?: string; tax_id?: string; phone_no?: string; email?: string; website?: string; address?: string; company_logo?: string }
export interface OfflineBundle {
  profile: Record<string, any> & { name: string; disable_rounded_total?: number };
  taxes: BundleTax[]; items: BundleItem[]; customers: { name: string; customer_name: string; mobile_no?: string }[];
  company: CompanyHeader; cashier: string; user: string; generated_at: string; currency_symbol: string;
}
export interface ReceiptData {
  name: string; is_return?: number; return_against?: string; posting_date: string; posting_time: string; customer: string; customer_name: string;
  contact_mobile?: string; cashier: string; pos_profile: string; currency: string;
  items: { item_code: string; item_name: string; qty: number; uom: string; rate: number; amount: number; price_list_rate?: number; discount_percentage?: number; is_free_item?: number; batch_no?: string; serial_no?: string }[];
  total?: number; net_total: number; discount_amount?: number; additional_discount_percentage?: number; coupon_code?: string;
  taxes: { description: string; rate?: number; tax_amount: number }[]; grand_total: number; rounded_total: number; in_words?: string;
  payments: { mode_of_payment: string; amount: number; reference_no?: string }[]; paid_amount?: number; change_amount?: number;
  outstanding_amount?: number; write_off_amount?: number; loyalty_amount?: number; loyalty_points?: number; remarks?: string;
  offline_id?: string; total_qty?: number; company: CompanyHeader; pending_sync?: boolean;
}
export interface QueuedSale {
  offline_id: string; created: string; pos_profile: string; customer_name: string; total: number;
  status: "pending" | "failed"; error?: string; attempts: number; data: Record<string, unknown>; receipt: ReceiptData;
}

export const queueAll = () => run<QueuedSale[]>("queue", "readonly", (s) => s.getAll()).catch(() => [] as QueuedSale[]);
export const queuePut = (q: QueuedSale) => run("queue", "readwrite", (s) => s.put(q));
export const queueDelete = (id: string) => run("queue", "readwrite", (s) => s.delete(id));

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** True when the error means "server unreachable" rather than "server said no". */
export const isNetworkError = (e: unknown) => {
  const err = e as { response?: unknown; code?: string; message?: string };
  return !err?.response && (err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED" || /network|timeout|failed to fetch/i.test(err?.message ?? "") || !navigator.onLine);
};

// ------------------------------------------------------------------ offline bundle
export const bundleKey = (profile: string) => `bundle:${profile}`;
export async function refreshBundle(profile: string): Promise<OfflineBundle> {
  const b = await getCall<OfflineBundle>("mm_core.pos.offline_bundle", { pos_profile: profile });
  await kvSet(bundleKey(profile), b);
  return b;
}
export const loadBundle = (profile: string) => kvGet<OfflineBundle>(bundleKey(profile));

/** Take sold quantities off the cached stock so the offline grid stays honest. */
export async function consumeBundleStock(profile: string, sold: { item_code: string; qty: number }[]) {
  const b = await loadBundle(profile);
  if (!b) return;
  for (const s of sold) {
    const it = b.items.find((i) => i.item_code === s.item_code);
    if (it && it.is_stock_item) it.actual_qty = Math.max(0, (it.actual_qty || 0) - s.qty);
  }
  await kvSet(bundleKey(profile), b);
}

/** Search the cached items: name / code contains, or exact barcode. */
export function searchBundle(b: OfflineBundle | undefined, term: string, group: string): BundleItem[] {
  if (!b) return [];
  const t = term.trim().toLowerCase();
  return b.items.filter((i) => (!group || i.item_group === group) && (!t || i.item_code.toLowerCase().includes(t) || i.item_name.toLowerCase().includes(t)
    || i.barcodes.some((bc) => bc.toLowerCase() === t))).slice(0, 120);
}

// ------------------------------------------------------------------ local totals (when the server can't price the cart)
export interface LocalLine { item_code: string; item_name: string; qty: number; uom: string; price_list_rate: number; rate?: number; discount_percentage?: number;
  /** Rs off per unit (instead of a percentage). */ discount_amount?: number }
export function localTotals(lines: LocalLine[], billDiscount: number, taxes: BundleTax[], disableRounding?: number, billAmount = 0) {
  const items = lines.map((l) => {
    const base = l.rate ?? l.price_list_rate;
    const rate = l.discount_amount ? Math.round(Math.max(0, base - l.discount_amount) * 100) / 100
      : Math.round(base * (1 - (l.discount_percentage ?? 0) / 100) * 100) / 100;
    return { item_code: l.item_code, item_name: l.item_name, qty: l.qty, uom: l.uom, rate, amount: Math.round(rate * l.qty * 100) / 100,
      price_list_rate: l.price_list_rate, discount_percentage: l.discount_percentage ?? 0 };
  });
  const total = items.reduce((s, i) => s + i.amount, 0);
  const discount = billAmount > 0 ? Math.min(billAmount, total) : Math.round(total * (billDiscount || 0)) / 100;
  const net = total - discount;
  let taxAdded = 0;
  const taxRows = taxes.filter((t) => t.charge_type === "On Net Total").map((t) => {
    const amount = t.included_in_print_rate ? net - net / (1 + t.rate / 100) : (net * t.rate) / 100;
    if (!t.included_in_print_rate) taxAdded += amount;
    return { description: t.description, rate: t.rate, tax_amount: Math.round(amount * 100) / 100 };
  });
  const grand = Math.round((net + taxAdded) * 100) / 100;
  const rounded = disableRounding ? grand : Math.round(grand);
  return { items, total, net_total: Math.round(net * 100) / 100, discount_amount: discount, additional_discount_percentage: billDiscount || 0,
    taxes: taxRows, total_taxes_and_charges: Math.round(taxAdded * 100) / 100, grand_total: grand, rounded_total: rounded };
}

// ------------------------------------------------------------------ sync hook
export interface SyncState {
  online: boolean; syncing: boolean; queue: QueuedSale[]; lastSync?: string; lastError?: string;
  sync: () => Promise<void>; refresh: () => Promise<void>; markOffline: () => void; markOnline: () => void;
  enqueue: (q: QueuedSale) => Promise<void>; discard: (id: string) => Promise<void>;
}

export function usePosSync(): SyncState {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [lastSync, setLastSync] = useState<string>();
  const [lastError, setLastError] = useState<string>();
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    setQueue((await queueAll()).sort((a, b) => a.created.localeCompare(b.created)));
    setLastSync(await kvGet<string>("lastSync"));
  }, []);

  const sync = useCallback(async () => {
    if (busy.current) return;
    const items = (await queueAll()).sort((a, b) => a.created.localeCompare(b.created));
    if (!items.length) { await refresh(); return; }
    busy.current = true;
    setSyncing(true);
    try {
      for (let i = 0; i < items.length; i += 20) {
        const batch = items.slice(i, i + 20);
        const res = await postCall<{ offline_id: string; ok: number; name?: string; error?: string }[]>("mm_core.pos.sync_invoices",
          { invoices: JSON.stringify(batch.map((q) => q.data)) }, { timeout: 120_000 });
        const log = (await kvGet<{ offline_id: string; name: string; at: string; total: number; customer_name: string }[]>("synced")) ?? [];
        for (const r of res) {
          const q = batch.find((b) => b.offline_id === r.offline_id);
          if (!q) continue;
          if (r.ok) {
            await queueDelete(q.offline_id);
            log.unshift({ offline_id: q.offline_id, name: r.name ?? "", at: new Date().toISOString(), total: q.total, customer_name: q.customer_name });
          } else {
            await queuePut({ ...q, status: "failed", error: r.error, attempts: q.attempts + 1 });
          }
        }
        await kvSet("synced", log.slice(0, 100));
      }
      const at = new Date().toISOString();
      await kvSet("lastSync", at);
      setLastError(undefined);
      setOnline(true);
    } catch (e) {
      if (isNetworkError(e)) setOnline(false);
      setLastError(humanizeError(e));
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const up = () => { setOnline(true); void sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [sync]);
  // every 30 s: retry pending sales, or probe the server when we think we're offline
  useEffect(() => {
    const t = setInterval(() => {
      if (online) { if (queue.some((q) => q.status === "pending")) void sync(); return; }
      getCall("frappe.auth.get_logged_user").then(() => { setOnline(true); void sync(); }).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(t);
  }, [online, queue, sync]);

  return {
    online, syncing, queue, lastSync, lastError, sync, refresh,
    markOffline: useCallback(() => setOnline(false), []),
    markOnline: useCallback(() => setOnline(true), []),
    enqueue: useCallback(async (q: QueuedSale) => { await queuePut(q); await refresh(); }, [refresh]),
    discard: useCallback(async (id: string) => { await queueDelete(id); await refresh(); }, [refresh]),
  };
}

// ------------------------------------------------------------------ installable app (PWA)
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferredInstall: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e as InstallPrompt; installListeners.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { deferredInstall = null; installListeners.forEach((f) => f()); });
}
/** True when the POS runs as the installed app (its own window). */
export const isInstalledApp = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** "Install app": available when the browser offered installation (Chrome / Edge, HTTPS or localhost). */
export function usePwaInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); installListeners.add(f); return () => { installListeners.delete(f); }; }, []);
  return {
    canInstall: !!deferredInstall && !isInstalledApp(),
    installed: isInstalledApp(),
    install: async () => {
      if (!deferredInstall) return false;
      await deferredInstall.prompt();
      const { outcome } = await deferredInstall.userChoice;
      deferredInstall = null;
      installListeners.forEach((f) => f());
      return outcome === "accepted";
    },
  };
}

/** While a /pos page is open: link the POS app manifest, theme colour and icons (removed again when leaving the POS). */
export function usePosManifest() {
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: string, attrs: Record<string, string>) => {
      if (document.head.querySelector(`${tag}[data-pos-app="${attrs.rel ?? attrs.name}"]`)) return;
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      el.setAttribute("data-pos-app", attrs.rel ?? attrs.name);
      document.head.appendChild(el); added.push(el);
    };
    add("link", { rel: "manifest", href: "/pos/manifest.webmanifest" });
    add("link", { rel: "apple-touch-icon", href: "/pos/apple-touch-icon.png" });
    add("meta", { name: "theme-color", content: "#0d9488" });
    add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    add("meta", { name: "apple-mobile-web-app-title", content: "MicroMax POS" });
    registerPosServiceWorker();
    return () => { added.forEach((el) => el.remove()); };
  }, []);
}

/** Service worker so the terminal itself opens without the network (production builds only, scoped to /pos/). */
export function registerPosServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/pos/sw.js", { scope: "/pos/" }).catch(() => undefined);
}
