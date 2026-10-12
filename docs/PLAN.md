# Real Estate / Housing Society — build plan (for approval)

Site `realestate` · app `realestate` · Frappe/ERPNext v16 + Frappe CRM + `whatsapp` (official Meta Cloud API app).

## Status update (2026-10-11)

Built since the first plan, all on standard ERPNext documents:
- **A — Accounting:** booking → Sales Invoice (installments = payment schedule), receipt → Payment Entry, society bill → Sales Invoice
  (one line per charge head). All 120 demo bookings / 1,035 receipts / 610 bills post; GL balances; RE paid = invoice paid.
- **C — Development & costs:** cost heads are ERPNext Projects with Budgets; materials via Material Request → Purchase Order →
  Purchase Receipt (site store) → Purchase Invoice; consumption via Stock Entry (Material Issue) to the head's account; contractor
  bills, NOC fees, demand notices as Purchase Invoices; supplier Payment Entries; assets (land, buildings, transformers, generators,
  electric installation, tools, machinery) as ERPNext Assets linked to map features; cost centers per block / common / society.
  Society charge heads (fixed, per marla, by plot size) with arrears carried forward; society expenses on the Society Operations
  cost center. Reports: Development Budget vs Actual, Development Cost and Profitability, Society Income vs Expense, Society Defaulters.
- **D — Documents:** letterhead + 14 Jinja print formats (application form, allotment, schedule, reminder, final notice,
  cancellation, NDC, possession, sale agreement, site plan with SVG drawing, construction NOC, maintenance bill, statement, receipt
  with QR); versioned RE Generated Document; RE Vault Document with expiry status and weekly alerts.
- **React:** the MicroMax frontend forked into `apps/realestate/frontend` (home page, generic forms with Connections / Activity /
  Assign / Attachments / Tags / Share, lists with status tabs and filters), plus a Real Estate module (`/re`): dashboard, society map,
  plots, customer 360, insights, development, documents, and generated forms for every real-estate DocType. Runs on
  http://realestate.localhost:7176 (own hostname so its login never clashes with MicroMax on localhost).

- **B — Sales operations (2026-10-11):** approval workflows (Draft → Pending Approval → Approved / Rejected, Sales Manager
  approves) for plot transfers (no-dues check; fee Sales Invoice, Credit Note for the balance, new Sales Invoice with the
  remaining installments for the new owner), booking cancellations (deduction %, Credit Notes, refund Payment Entry (Pay),
  plot released, unpaid commissions cancelled), plot merges (combined outline, sources retired), surcharge waivers (Credit Note).
  Late-payment surcharge = monthly Sales Invoice after a grace period (rate, cap, minimum in RE Settings); recovery notices =
  ERPNext Dunning; discount above the limit needs approval; agent / dealer (Sales Partner) commission accrued and paid by
  Journal Entry once the customer has paid the set share. Roles: Sales Agent (own records only), Recovery Officer, Society
  Manager. Bank / Bank Account behind the bank ledger. Money maths in `realestate/calc.py` with unit tests
  (`python -m unittest realestate.tests.test_calc`). React: `/re/operations` hub (approvals inbox, wizards, pipelines,
  recovery, commission payouts) and generated forms with workflow actions.

- **E–F remainder (2026-10-11):**
  - **Owner portal** `/portal`: mobile-first, English / اردو (right-to-left, Noto Nastaliq). Shows the owner's plots on
    satellite imagery, paid / outstanding / overdue, the next due date, each plot's installment schedule, society bills and
    receipts. Owners download their own PDFs (schedule, allotment letter, site plan, statement, receipt, bill, and the NDC once a
    plot is paid off). They can raise complaints, which become ERPNext Tasks. A login is linked through
    `Customer.re_portal_user` ("Invite to owner portal" on the React customer page, Sales Manager only). Every call
    (`realestate.portal.*`) is limited server-side to that customer. Owners who open `/home` are sent to `/portal`.
  - **WhatsApp inbox** `/re/inbox`: shared team inbox with Mine / Unassigned / Unread / All / Resolved views. It shows the
    thread with delivery ticks, quick replies (`/`), approved templates and plot-location pins. Staff can assign, resolve or
    reopen a chat, mark opt-out, and log a call (CRM Call Log with promise-to-pay and follow-up). It polls every few seconds,
    so no socket server is needed. In mock mode it can simulate a customer reply.
  - **Google Maps** as a second map provider: RE Settings → Map → provider "Google Maps" plus a browser API key (stored
    encrypted, handed only to signed-in users; restrict it by HTTP referrer). The map page then shows an Open map / Google switch.
    *Not tested against live Google, since no key is configured.*
  - **Urdu:** the owner portal is bilingual. Server strings are in `realestate/locale/ur.po` (compiled `.mo`), so the
    desk follows a user's language = Urdu. The staff React screens stay in English.

- **G — Reports & exports (2026-10-12):** `/re/reports` previews every Real Estate / CRM report and downloads it as Excel or
  as a PDF on the letterhead (`realestate.exports`, 15 reports, role-checked).

All phases are built. `bench --site realestate re-acceptance` checks them against the live data (see below).

## Spec coverage (§7 roles & security, §8 phases, §9 acceptance) — 2026-10-12

| Spec phase | Where | ERPNext / Frappe standard used |
|---|---|---|
| 1 Scaffold, DocTypes, roles, seed | `realestate` app, `roles.py`, `demo/seed.py` (`re-reset-demo`) | Roles, Custom DocPerm, Workflows |
| 2 Map (boundary, blocks, plots, layers, import) | RE Project / Block / Plot / Map Feature / Map Import, `/re/map` | Location, Asset (infrastructure) |
| 3 Booking, plans, installments, receipts | RE Booking / Payment Plan / Payment | Sales Invoice + Payment Schedule, Payment Entry |
| 4 Follow-ups, reminders, scheduler | `tasks.py`, RE Reminder Log | Scheduled Job Type, ToDo, Dunning |
| 5 CRM, WhatsApp inbox, templates, calls | `/re/inbox`, `whatsapp/*` | Frappe CRM (Lead, Deal, Call Log, Task), `whatsapp` app |
| 6 Project & development cost | `/re/development`, `erp.py` | Project, Budget, Material Request → PO → PR → PI, Stock Entry, Asset, Cost Center |
| 7 Society charges & complaints | RE Society Bill / Charge Head, `maintenance.py` | Sales Invoice, Task / Project |
| 8 Documents & print formats | 14 print formats, RE Generated Document, RE Vault Document | Print Format, Letter Head, File |
| 9 Dashboards, reports, portal | `/re`, `/re/insights`, `/re/reports`, `/portal` | Script Reports, Number Cards, Website User |

§7 roles & security:
- Sales Agents see only their own bookings, receipts, visits, chats and commissions, plus their own leads, deals and
  customers (`permissions.py`: query conditions and `has_permission` on Customer, CRM Lead and CRM Deal).
- Version history is on for every financial and settings doctype.
- Submitted financial records cannot be deleted (Frappe), and cancelled ones cannot either (`audit.py` on_trash guard on
  Sales Invoice, Payment Entry, Journal Entry, Purchase Invoice / Receipt / Order, Stock Entry, Dunning, Asset and the RE
  vouchers). "Delete linked ledger entries" stays off.
- Approval workflows cover transfers, cancellations (refunds included), merges and surcharge waivers. Discounts above
  `max_discount_percent` need Sales Manager approval.
- Secrets live in RE Settings Password fields; rates live in RE Settings and Charge Heads.

§9 acceptance — `bench --site realestate re-acceptance [--verbose]` (also `/re/acceptance` for System Manager).
Result on 2026-10-12: 10 pass, 0 warn, 0 fail, 1 checked by eye.
1. Land use: 100% = 400.00 kanal = boundary.
2. Geometry: 309 plots inside their block; 4 blocks (5 outlines) inside the boundary; no overlaps. Pure-Python polygon
   clipping with 5 cm tolerance, unit-tested in `tests/test_geometry.py`.
3. Schedules: 120 bookings, schedule = price − discount; Sales Invoice payment schedule = invoice total.
4. Receipts: 986 receipts → submitted Payment Entry, same amount, balanced GL; the company ledger balances.
5. Live map: RE Plot publishes `re_plot_status` after commit. React `/re/map` and the desk Site Map recolour at once
   (Socket.IO via `bench socketio`, proxied by Vite at `/socket.io`). The map falls back to 20 s polling and shows
   Live / Auto-refresh.
6. Scheduler: 6 jobs enabled, overdue marking up to date, bills / surcharges / reminders current. Needs `bench schedule`
   running (part of `bench start`).
7. WhatsApp: incoming messages reach the inbox and the party timeline; mock mode covers everything (simulate buttons).
8. Documents: all 14 render to PDF on the Zarmeen Gardens letterhead.
9. Roles: agent scoping, managers see all, portal owners only through the scoped portal API.
10. Audit trail and no deletion (see §7).
11. Mobile, light and dark mode: checked by eye at 390 px in both themes (staff screens, inbox, booking form, map,
    operations, reports, owner portal).

Unit tests: `python -m unittest realestate.tests.test_calc realestate.tests.test_geometry` (19 tests: schedules,
FIFO allocation, cancellation, surcharge, commission, merge, geometry).

## 1. Where we are (first plan, built, seeded and smoke-tested)

| Spec module | Status | Notes |
|---|---|---|
| Sample project + seed + reset | ✅ | 400 Kanal boundary (exact), land use 18/17/14/9/24/12/4/2 % reconciled, 310 plots, 87 map features, no overlaps, all inside boundary. `bench --site realestate re-reset-demo` |
| 1 Project & GPS map | 🟡 | Project, Block, Plot, Map Feature, KML/GeoJSON import, Desk Leaflet map with layers + status/payment colours. Missing: plot statuses *Hold* / *Possession given*, asset fields (status, cost, contractor, %), drawing tools, React map |
| 2 Project & development cost | ❌ | — |
| 3 Plot sales & installments | 🟡 | Payment plans, booking, auto schedule (sums to net price), FIFO receipts, statuses Paid/Due/Overdue, receipt PDF. Missing: **ERPNext accounting posting**, CNIC/nominee, balloon/possession/development charges, surcharge + waiver, transfer/cancel/refund/merge workflows, commission, QR on receipt |
| 4 CRM + WhatsApp | ✅ | Frappe CRM leads/deals (Opportunity → Site Visit → Negotiation → Booking), won deal → ERPNext Customer; chat panel on Lead/Deal/Customer/Plot, team inbox, templates (7), documents, location pin, broadcasts with opt-out + rate limit, webhook (encrypted secrets), Calling API (WebRTC) + wa.me fallback, call log, missed call → task, unified timeline, reminders WhatsApp → SMS fallback, mock mode, 6 CRM reports |
| 5 Society charges | 🟡 | Monthly auto-bills per plot, statuses, payments, report, reminders. Missing: configurable charge heads by size/type, arrears carry-forward, bulk collection screen, society expenses and income-vs-expense |
| Maintenance / complaints | ✅ | ERPNext Project per scheme + Task (Task Type = category) + ToDo assignment, recurring Maintenance Plans, complaints from chat/plot, customer told on completion, map layer, report |
| 6 Documents | ❌ | Only the payment receipt print format |
| 7 Dashboards & reports | 🟡 | Desk workspace/dashboard (10 cards, 10 charts), 11 script reports. Missing: finance reports, Excel/PDF export from React |
| React UI, portal, roles, Docker | ❌ | — |

Fixed on the way: Frappe CRM's WhatsApp hook crashes every WhatsApp Message save on sites with both `crm` and `whatsapp` (it expects the old `frappe_whatsapp` fields). The realestate app adds compatible aliases; **`micromaxerp` and `wise` have the same crash and get the fix only if realestate is installed there** — or I can patch it separately.

## Decisions (2026-10-10)

- **Map:** both providers, switchable — MapLibre + Carto/Esri styles by default (no key), Google Maps
  (`@vis.gl/react-google-maps` + drawing tools) when a key is set in RE Settings (stored encrypted).
- **Accounting:** booking → one Sales Invoice with the installment plan as its payment schedule; receipts →
  Payment Entries; society bills → monthly Sales Invoices.
- **Rentals:** not now.
- **Docker:** skipped; bench commands documented instead.

## 2. Assumptions

1. Accounting uses standard ERPNext. A booking submits **one Sales Invoice** for the net price whose *Payment Schedule* is the installment plan; each receipt is a **Payment Entry** allocated to that invoice (FIFO over payment terms). Surcharges and possession/development charges are extra Sales Invoices. Society bills are monthly Sales Invoices with one line per charge head (items in an "Society Charges" item group). Development costs are Purchase Invoices / Journal Entries against **Cost Centers per project and block**. `RE Payment` becomes a thin receipt screen over Payment Entry.
2. Customer = ERPNext Customer with custom fields (CNIC validated `#####-#######-#`, nominee, father/husband name); mobile validated as Pakistani (`03xx-xxxxxxx` → `+923xx…`).
3. Area units: 1 Marla = 272.25 sq ft (Lahore), 1 Kanal = 20 Marla; conversions shown everywhere.
4. Roles: Admin (System Manager), Accounts, Sales Manager, Sales Agent, Recovery Officer, Society Manager, Customer (website user). Agents see only their own leads/deals/customers through User Permissions on `lead_owner` / `deal_owner` / `account_manager`; managers see all.
5. Approvals use Frappe Workflow (discount above a limit, surcharge waiver, cancellation, refund, transfer, merge).
6. The rental / lease / tenant feature list pasted earlier is **not** in the full spec — left out unless you want it (question 4).

## 3. New / changed DocTypes

| DocType | Key fields | Links |
|---|---|---|
| RE Plot *(change)* | + `hold_until`, `possession_date`, statuses Available / Hold / Booked / Sold / Possession Given / Blocked, `photos` (table), price history (child **RE Plot Price**) | Block, Project |
| RE Map Feature *(change)* → infrastructure asset | + `asset_status` Planned / In Progress / Completed, `cost`, `contractor` (Supplier), `completion_pct`, `cost_head` | Project, Supplier |
| RE Payment Plan *(change)* | + child **RE Plan Line**: label, type (Down / Installment / Balloon / Possession / Development), % or amount, frequency, count, offset months | — |
| RE Booking *(change)* | + `sales_invoice`, nominee, `dealer`, `commission_rate`, possession tracking; schedule from plan lines | Customer, Plot, Sales Invoice |
| RE Surcharge Rule | grace days, % per month / flat, cap, applies to (installment / society bill) | — |
| RE Surcharge Waiver | booking/bill, amount, reason — workflow approval | Booking, Sales Invoice |
| RE Plot Transfer | from/to customer, plot, fee, NDC check, documents — workflow | Booking, Customer |
| RE Booking Cancellation | booking, deduction %, refund amount, refund Payment Entry — workflow | Booking, Payment Entry |
| RE Plot Merge | plots[], new plot no, price adjustment — workflow | Plot |
| RE Commission | agent/dealer, booking, rate, amount, payable Journal Entry, paid | Booking, Journal Entry |
| RE Cost Head | name, group (Land / Legal / NOC / Utility / Civil / Other), default account | Account |
| RE Project Cost | project, cost head, block (opt), budget, actual, paid, payable, vendor, due date, documents | Supplier, Cost Center, Purchase Invoice / JE |
| RE Charge Head | name, rate per plot size / type (child **RE Charge Rate**), item | Item |
| RE Society Expense | month, head (salaries, electricity, repairs…), amount, Journal Entry | Account |
| RE Document Template / RE Generated Document | type (allotment, NDC, possession, transfer letter …), print format, version, file, issued to | Booking, Customer, Plot |
| RE Vault Document | project, type (NOC, fard, registry, intiqal, layout plan, demand notice), issue / expiry date, renewal alert days, file | Project |
| RE Site Visit *(change)* | statuses Contacted → Confirmed → Completed → Booked / Cancelled | Lead / Deal |

Kept as is: RE Project, RE Block, RE Plot Size, RE Map Import, RE Society Bill (becomes a view over its Sales Invoice), RE Conversation, RE Broadcast, RE Quick Reply, RE Reminder Log, RE Maintenance Plan, RE Settings (+ map provider, surcharge, letterhead).

**Forms (your note):** every DocType gets tabs (Details · Schedule/Lines · Map · Connections · Activity), a **Connections** dashboard (`links` – e.g. Plot → Bookings, Bills, Payments, Tasks, Visits), `track_changes` for the Activity/version history, email (Communication) enabled, assignments and attachments, the same tabs on the React detail pages.

## 4. API (whitelisted, typed, in `realestate/api/`)

`map.get_layers(project)` · `map.save_geometry(doctype, name, geojson)` · `plots.search(filters, page)` · `plots.detail(plot)` (owner, agent, dues, schedule, bills, documents, nearby features with distance) · `bookings.create / preview_schedule` · `payments.receive(booking|bill, amount, mode)` → Payment Entry · `dashboard.kpis(range)` · `dashboard.collections(granularity, kind)` · `visits.pipeline()` · `queue.urgent()` · `customers.profile / ledger` · `documents.generate(type, ref)` · `portal.*` (scoped to the logged-in customer) · existing `whatsapp.*`, `inbox.*`, `calls.*`, `maintenance.*`, `get_timeline`. Generic lists use the Frappe REST API (`/api/v2/document/…`) with TanStack Query.

## 5. React app (my navigation design)

`apps/realestate/frontend` — Vite + React 18 + TypeScript strict (no `any`), Tailwind + shadcn/ui, Lucide, TanStack Query v5, React Router, served by Frappe at **`/estate`** (staff) and **`/estate/portal`** (customers), same Frappe login/session.

Sidebar (role-filtered):
- **Overview** — Dashboard · Today (visits, follow-ups, calls due)
- **Society** — Map · Plots · Blocks & Prices · Infrastructure
- **Sales** — Bookings · Payments & Receipts · Transfers & Cancellations · Commissions
- **CRM** — Leads (kanban/list) · Site Visits · Inbox (WhatsApp) · Campaigns · Calls
- **Society Ops** — Bills & Collection · Complaints · Maintenance Plans · Society Expenses
- **Finance** — Project Costs · Reports
- **Documents** — Letters · Vault
- **Settings** — Users & roles · Charge heads · Payment plans · Templates · WhatsApp · Map

Detail pages (Plot, Customer, Booking, Lead) use the tabs above. Data tables: sort, filter, column toggle, CSV/Excel export; skeletons, empty states, toasts; mobile-first portal.

**Theme:** light / dark / system + customiser (preset colour, radius, scale) with CSS variables. **Form visibility (your note):** inputs get a solid surface colour distinct from the card, a 1.5 px border meeting WCAG 3:1 contrast in both themes, visible labels (no placeholder-only fields), strong focus ring, clear disabled / read-only styles. The same contrast fix is applied to Desk forms through the app's CSS.

## 6. Phases from here

A. Accounting refactor (Sales Invoice / Payment Entry, cost centers) + unit tests for schedules, allocation, surcharge
B. Plan lines, surcharge + waivers, transfers / cancellation / refund / merge workflows, commissions, roles + permissions
C. Project & development cost, society charge heads, arrears, society expenses
D. Documents (print formats with letterhead + QR, versioned generated docs, vault with expiry alerts)
E. React app: shell, theme, Map + Plots + detail slide-over, Dashboard, Bookings, Payments
F. React: CRM, Inbox, Society ops, Finance, Documents, Settings, Customer portal
G. Finance reports, Excel / PDF export, README per phase

## Gap closure (2026-10-12) — 19 items from the spec review, all in both the React app and the desk

1. CNIC (validated 12345-1234567-1, unique), father/husband, address, nominee on Customer; Pakistani mobiles normalised to +92; a booking can't be submitted without CNIC; letters print them (`identity.py`).
2. Payment plans: booking amount, down payment after N days, quarterly / half-yearly balloons, development charges; live schedule preview (desk + React); `calc.plan_schedule` with unit tests.
3. "Due" status for installments and society bills (window in RE Settings, default 7 days) — `calc.row_status`.
4. Plot statuses Hold and Possession Given; "Give possession" (fully paid, no society dues → Possession Letter); Hold / Release.
5. Plot price history (child table, every change logged) and bulk "Revise prices" (available plots only).
6. RE Re-allotment with approval workflow: new booking + fee invoice for the new buyer; Operations tab + desk button.
7. React map editor: draw polygon / line / point, edit outlines by dragging corners, live geometry checks (`mapedit.py`).
8. Infrastructure / public-building side panel (asset, progress, contractor, project spend, files) with progress update.
9. Plot site plan + photo gallery (React, desk strip, owner portal).
10. React inbox attachments; pluggable fallback gateways SMS → Email ("Fallback Channels", "Email a Copy") — `whatsapp/gateways.py`.
11. Bulk society collection (`/re/society/collect`, desk "Collect Selected") — one receipt + Payment Entry per bill.
12. Complaint priority Critical / High / Normal, kept in sync with ERPNext Task priority.
13. Transfer Application and Transfer Letter print formats (16 documents now).
14. Reports: Commission, Receivables Aging, Sales by Block, Society Dues by Charge Head (19 reports, Excel / PDF).
15. Theme customiser: Light / Dark / System, 7 colour presets, radius, text scale.
16. Dashboard urgent queue: complaints, expiring vault documents, pending approvals (+ desk number cards).
17. One-click reminders (customer page, plot panel, booking / bill / receipt forms).
18. Menus and desktop tiles by role (roles read from `realestate.spa.boot`).
19. Square feet everywhere (plot cards, panel, portal, `RE Plot.area_sqft`); no `any` left (`@types/google.maps`).

Also fixed on the way: missing Frappe "Home" file folders (uploads failed), layer toggles skipped while tiles loaded,
UTC "today" in date pickers, stronger card contrast. Demo staff can sign in with the password in `~/.realestate-site-secrets`.
