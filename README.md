# Real Estate

Housing-scheme management for Frappe / ERPNext v16 with Frappe CRM and WhatsApp.

- **Land & map** — project boundary, land use (must total 100 %), blocks, plots, roads, public buildings,
  infrastructure, waste sites and utility networks as GeoJSON; Leaflet site map coloured by plot status or
  payment status; KML / GeoJSON import (`RE Map Import`) to replace the sample map with survey data.
- **Sales** — bookings with payment plans and installment schedules, FIFO receipts, society bills,
  WhatsApp receipts with the PDF attached.
- **CRM** — Frappe CRM leads and deals (Opportunity → Site Visit → Negotiation → Booking); a won deal
  creates the ERPNext customer. Site visits, calls (`CRM Call Log`) and follow-ups (`CRM Task`).
- **WhatsApp** (official Cloud API through the `whatsapp` app) — chat panel on Lead, Deal, Customer and
  Plot, shared team inbox, templates, documents, location pins, broadcasts with opt-out and rate limiting,
  reminders with SMS fallback, Calling API (WebRTC) or wa.me click-to-call with call logging; missed calls
  create follow-up tasks. Mock mode tests everything without a Meta account.
- **Reports** — leads by source, conversion, agent response time, agent activity, missed follow-ups,
  recovery promised vs received, plot inventory, installment dues, collections, society bills.

## Setup

```bash
bench get-app realestate && bench --site <site> install-app realestate   # needs erpnext, crm, whatsapp
bench --site <site> re-seed-demo      # sample "Zarmeen Gardens" project with data
bench --site <site> re-reset-demo     # wipe the sample and generate it again
```

WhatsApp: **RE Settings → WhatsApp** — phone number ID, access token, app secret and webhook verify token
(stored encrypted). Webhook callback: `https://<site>/api/method/realestate.whatsapp.webhook.handler`,
subscribed to `messages` and `calls`. Leave **Mock Mode** on to test without Meta.

## React app

`apps/realestate/frontend` is a fork of the MicroMax ERP frontend (React + TypeScript + Vite + Tailwind) with a Real Estate
module in `src/re`:

- `/home` — desktop with the Real Estate tiles first; all ERPNext modules (Selling, Buying, Stock, Assets, Projects, Accounts)
- `/re` dashboard · `/re/map` society map · `/re/plots` · `/re/customers/:id` · `/re/insights` · `/re/development` · `/re/documents`
- `/re/d/<doctype-slug>` — list + form generated from the DocType (realestate.spa.form_meta) for every RE DocType
- `/re/operations` — approvals, transfers, cancellations, merges, surcharges, commissions, recovery
- `/re/reports` — every report with preview and Excel / PDF (letterhead) download
- `/re/acceptance` — acceptance & security checks against live data (System Manager)
- `/re/inbox` — shared WhatsApp inbox (assign, resolve, quick replies, templates, plot pins, call logging)
- `/portal` — plot owners' portal (mobile, English / اردو): plots on the map, schedule, bills, receipts, document
  downloads, complaints. Demo owner logins: `umair.rana@`, `lubna.siddiqui@`, `shahid.javed@owner.zarmeen.example`
  (password in `~/.realestate-site-secrets`). Staff link a customer with "Invite to owner portal".

The map uses MapLibre with keyless Esri / OpenStreetMap tiles. To offer Google Maps as well, set RE Settings → Map →
provider "Google Maps" and a browser API key restricted by HTTP referrer.

```bash
cd apps/realestate/frontend && npm install
./node_modules/.bin/vite      # http://realestate.localhost:7176 (localhost:7176 redirects there)
```

It proxies to the realestate site on :8005 and needs `mm_core` installed on the site. `bench start` runs both
(`web_realestate`, `realestate_ui`).

## Tests and acceptance checks

```bash
cd apps/realestate && ../../env/bin/python -m unittest realestate.tests.test_calc realestate.tests.test_geometry
bench --site realestate re-acceptance --verbose   # read-only; exit code 1 if a criterion fails
```

Live map colours need the Socket.IO server (`bench socketio`; `bench start` runs it), and the daily jobs need
`bench schedule`. In mock mode no WhatsApp or SMS traffic leaves the machine, including `bench execute` and the console.
