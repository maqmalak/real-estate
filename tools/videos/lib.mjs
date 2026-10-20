// Recording harness: system Chrome via Playwright, one .webm per scene, with a caption bar and a visible pointer.
// Credentials come from ~/.realestate-site-secrets (never written here).
import { chromium } from "playwright";
import { readFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BASE = process.env.RE_BASE ?? "http://realestate.localhost:7176";
export const OUT = new URL("./out/", import.meta.url).pathname;
const SIZE = { width: 1440, height: 900 };

function secret(key) {
  const txt = readFileSync(join(homedir(), ".realestate-site-secrets"), "utf8");
  const line = txt.split("\n").find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from ~/.realestate-site-secrets`);
  return line.slice(key.length + 1).trim();
}

// injected into every page: caption bar + pointer that follows the mouse and pulses on click
const OVERLAY = `
(() => {
  if (window.__reOverlay) return; window.__reOverlay = true;
  const css = document.createElement('style'); css.id = 're-style';
  css.textContent = \`
    #re-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(1100px,92vw);
      background:rgba(15,23,42,.92);color:#fff;font:600 19px/1.4 system-ui,'Segoe UI',sans-serif;padding:12px 22px;border-radius:14px;
      box-shadow:0 12px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);transition:opacity .25s;pointer-events:none}
    #re-cap small{display:block;font:500 13px/1.3 system-ui,sans-serif;color:#5eead4;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
    #re-ptr{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(20,184,166,.35);border:2px solid #0f766e;pointer-events:none;transition:left .05s linear,top .05s linear}
    #re-ptr.click{animation:rePulse .45s ease-out}
    @keyframes rePulse{0%{transform:scale(1)}50%{transform:scale(1.9);background:rgba(20,184,166,.55)}100%{transform:scale(1)}}
    #re-title{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff;font:700 46px/1.2 system-ui,sans-serif;text-align:center;padding:40px}
    #re-title small{font:500 22px/1.4 system-ui,sans-serif;color:#ccfbf1;margin-top:14px;max-width:900px}
    #re-title em{font:600 15px/1 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#99f6e4;margin-bottom:18px;font-style:normal}\`;
  // the page's own <head> may be rebuilt after this runs, so (re)attach the stylesheet whenever an overlay is shown
  window.__reEnsure = () => { if (!document.getElementById('re-style')) (document.head || document.documentElement).appendChild(css); };
  const ptr = document.createElement('div'); ptr.id = 're-ptr'; ptr.style.left = '-50px'; ptr.style.top = '-50px';
  const mount = () => { window.__reEnsure(); if (document.body && !document.getElementById('re-ptr')) document.body.appendChild(ptr); };
  document.addEventListener('DOMContentLoaded', mount); mount();
  addEventListener('mousemove', (e) => { mount(); ptr.style.left = e.clientX + 'px'; ptr.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { ptr.classList.remove('click'); void ptr.offsetWidth; ptr.classList.add('click'); }, true);
})();`;

export async function scene(name, fn) {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, colorScheme: "light", locale: "en-GB" });
  // light theme reads better on video (the app defaults to dark)
  await context.addInitScript(() => { try { localStorage.setItem("micromax-theme", "light"); localStorage.setItem("theme", "light"); } catch { /* ignore */ } });
  await context.addInitScript(OVERLAY);
  // sign in through the API (same session cookie the app uses)
  const res = await context.request.post(`${BASE}/api/method/login`, { form: { usr: "Administrator", pwd: secret("ADMIN_PASSWORD") } });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  const page = await context.newPage();
  const h = helpers(page, context);
  let ok = true;
  try {
    await fn(page, h);
  } catch (e) {
    ok = false;
    console.error(`[${name}] failed:`, e.message);
    await page.screenshot({ path: join(OUT, `${name}-error.png`) }).catch(() => {});
  }
  const video = page.video();
  const others = context.pages().filter((p) => p !== page).map((p) => p.video()).filter(Boolean);
  await context.close();
  await browser.close();
  const target = join(OUT, `${name}.webm`);
  if (existsSync(target)) unlinkSync(target);
  renameSync(await video.path(), target);
  for (const v of others) { try { unlinkSync(await v.path()); } catch { /* already gone */ } }  // pop-up tabs (PDFs)
  console.log(`${ok ? "✓" : "✗"} ${name} → ${target}`);
  return ok;
}

function helpers(page, context) {
  let mx = 720, my = 450;
  const pause = (ms = 900) => page.waitForTimeout(ms);
  const moveTo = async (x, y) => {
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
      await page.waitForTimeout(12);
    }
    mx = x; my = y;
  };
  const center = async (loc) => {
    await loc.scrollIntoViewIfNeeded({ timeout: 15000 });
    const b = await loc.boundingBox({ timeout: 15000 });
    if (!b) throw new Error("element not visible");
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const loc = (target) => (typeof target === "string" ? page.locator(target).first() : target);
  return {
    page, context, pause,
    async title(heading, sub, eyebrow = "Zarmeen Gardens · Real Estate ERP") {
      await page.goto(`${BASE}/re/home`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.evaluate(([e, t, s]) => {
        window.__reEnsure?.();
        const d = document.createElement("div"); d.id = "re-title";
        d.innerHTML = `<em>${e}</em><div>${t}</div><small>${s ?? ""}</small>`;
        document.body.appendChild(d);
      }, [eyebrow, heading, sub]);
      await pause(3200);
      await page.evaluate(() => document.getElementById("re-title")?.remove());
    },
    async say(text, step) {
      await page.evaluate(([t, s]) => {
        window.__reEnsure?.();
        let c = document.getElementById("re-cap");
        if (!c) { c = document.createElement("div"); c.id = "re-cap"; document.body.appendChild(c); }
        c.innerHTML = (s ? `<small>${s}</small>` : "") + t;
      }, [text, step ?? ""]);
      await pause(Math.min(4200, 1400 + text.length * 32));
    },
    async hush() { await page.evaluate(() => document.getElementById("re-cap")?.remove()); },
    async go(path, wait = 2200) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await pause(wait);
    },
    async click(target, after = 1100) {
      const l = loc(target);
      const [x, y] = await center(l);
      await moveTo(x, y);
      await pause(250);
      await l.click({ timeout: 10000 });
      await pause(after);
    },
    async hover(target, after = 1500) {
      const l = loc(target);
      const [x, y] = await center(l);
      await moveTo(x, y);
      await pause(after);
    },
    async type(target, text, after = 700) {
      const l = loc(target);
      const [x, y] = await center(l);
      await moveTo(x, y);
      await l.click({ timeout: 10000 });
      await l.fill("");
      await page.keyboard.type(text, { delay: 55 });
      await pause(after);
    },
    async scroll(dy = 500, after = 1200) {
      await page.mouse.wheel(0, dy);
      await pause(after);
    },
    async scrollTo(target, after = 1200) {
      await loc(target).scrollIntoViewIfNeeded({ timeout: 15000 });
      await pause(after);
    },
    dialog() { return page.getByRole("dialog").last(); },
    /** Type into a Link field (placeholder "Search <label>…") and choose the option containing `option`. */
    async pickLink(label, query, option = query) {
      const input = page.getByPlaceholder(new RegExp(`^Search ${label}`)).first();
      await this.type(input, query, 1300);
      await this.click(page.locator("li button").filter({ hasText: option }).first(), 1500);
    },
    button(name, scope) { return (scope ?? page).getByRole("button", { name, exact: false }).first(); },
    /** frappe.client.get_list as the signed-in user. */
    async list(doctype, filters, fields = ["name"], extra = {}) {
      return this.call("frappe.client.get_list", { doctype, filters, fields, limit_page_length: 50, ...extra }, false);
    },
    /** Wait until the URL leaves /new (a saved form) and return the record name. */
    async savedName(prefix, timeout = 20000) {
      await page.waitForURL((u) => u.pathname.startsWith(prefix) && !u.pathname.endsWith("/new"), { timeout });
      return decodeURIComponent(new URL(page.url()).pathname.split("/").pop());
    },
    /** Call a whitelisted method as the signed-in user (for setup steps the video narrates). */
    async call(method, params = {}, post = true) {
      const url = `${BASE}/api/method/${method}`;
      const r = post
        ? await context.request.post(url, { form: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])), headers: { "X-Frappe-CSRF-Token": await csrf(page) } })
        : await context.request.get(url, { params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok()) throw new Error(`${method}: ${r.status()} ${JSON.stringify(body).slice(0, 300)}`);
      return body.message;
    },
  };
}

async function csrf(page) {
  return page.evaluate(async () => {
    const r = await fetch("/api/method/realestate.spa.boot", { headers: { Accept: "application/json" } });
    return (await r.json()).message.csrf_token;
  });
}
