"""Zarmeen Gardens Real Estate ERP — guide books (A4 portrait), in the MicroMax sugarcane guide style:
a dark cover card with the stages, numbered sections with steps, light-theme screenshots and notes.

	python3 tools/guides/guides.py            # screenshots + every guide
	python3 tools/guides/guides.py --no-shots # re-render from the last screenshots
	python3 tools/guides/guides.py land       # one guide
"""

import html
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "../.."))
OUT = os.path.join(APP, "docs/guides")
SHOTS = os.path.join(HERE, "out/shots")

# ---------------------------------------------------------------- screenshots (light theme, 1440 x 900 at 1.5x)
SHOT = {
	# setup
	"settings": {"path": "/re/d/re-settings"},
	"settings-land": {"path": "/re/d/re-settings", "tab": "Land"},
	"project": {"path": "/re/d/re-project/{project}", "wait": 5000},
	"map": {"path": "/re/map", "wait": 6000},
	"blocks": {"path": "/re/d/re-block", "wait": 4500},
	"sizes": {"path": "/re/d/re-plot-size", "wait": 4500},
	"plans": {"path": "/re/d/re-payment-plan", "wait": 4500},
	"users": {"path": "/re/settings/users"},
	"acceptance": {"path": "/re/acceptance", "wait": 9000},
	# land
	"land": {"path": "/re/land", "wait": 6000},
	"land-board": {"path": "/re/land", "wait": 6000, "clip": "text=Acquisition pipeline"},
	"land-sheet": {"path": "/re/land?parcel={parcel_acq}", "wait": 6000},
	"land-legal": {"path": "/re/land/legal", "wait": 5000},
	"land-payments": {"path": "/re/land/payments", "wait": 5000},
	"parcel": {"path": "/re/d/re-land-parcel/{parcel}", "wait": 4500},
	"parcel-checks": {"path": "/re/d/re-land-parcel/{parcel}", "tab": "Due diligence", "wait": 4500},
	"owner": {"path": "/re/d/re-land-owner/{owner}", "wait": 4500},
	"deal": {"path": "/re/d/re-land-deal/{deal}", "wait": 5000},
	"deal-lines": {"path": "/re/d/re-land-deal/{deal}", "wait": 5000, "clip": "text=Deal subtotals"},
	"deal-contract": {"path": "/re/d/re-land-deal/{deal}", "tab": "Contract", "wait": 5000},
	"deal-schedule": {"path": "/re/d/re-land-deal/{deal_pay}", "tab": "Schedule", "wait": 5000},
	"land-payment": {"path": "/re/d/re-land-payment/{payment}", "wait": 4500},
	"adjustment": {"path": "/re/d/re-plot-adjustment/{adjustment}", "wait": 4500},
	"case": {"path": "/re/d/re-land-case/{case}", "wait": 4500},
	"lps": {"path": "/re/reports?r=Land%20Purchase%20Status", "wait": 6000},
	# sales
	"plots": {"path": "/re/plots", "wait": 5000},
	"plot": {"path": "/re/plots/{plot}", "wait": 5000},
	"crm": {"path": "/crm", "wait": 6000},
	"visits": {"path": "/re/d/re-site-visit", "wait": 4500},
	"booking": {"path": "/re/d/re-booking/{booking}", "wait": 5000},
	"booking-schedule": {"path": "/re/d/re-booking/{booking}", "tab": "Installments", "wait": 5000},
	"today": {"path": "/re/today", "wait": 5000},
	# collections
	"receipt": {"path": "/re/d/re-payment/{receipt}", "wait": 4500},
	"receipts": {"path": "/re/d/re-payment", "wait": 4500},
	"recovery": {"path": "/re/operations?tab=recovery", "wait": 5000},
	"inbox": {"path": "/re/inbox", "wait": 5000},
	# post-sale
	"operations": {"path": "/re/operations", "wait": 5000},
	"transfer": {"path": "/re/d/re-plot-transfer/{transfer}", "wait": 4500},
	"commissions": {"path": "/re/d/re-commission", "wait": 4500},
	"approvals": {"path": "/re/operations?tab=approvals", "wait": 5000},
	# society
	"bills": {"path": "/re/d/re-society-bill", "wait": 5000},
	"bill": {"path": "/re/d/re-society-bill/{bill}", "wait": 4500},
	"collect": {"path": "/re/society/collect", "wait": 5000},
	"charges": {"path": "/re/d/re-charge-head", "wait": 4500},
	"mplans": {"path": "/re/d/re-maintenance-plan", "wait": 4500},
	"features": {"path": "/re/d/re-map-feature", "wait": 4500},
	# development, documents, reports, portal
	"development": {"path": "/re/development", "wait": 6000},
	"assets": {"path": "/re/assets", "wait": 5000},
	"documents": {"path": "/re/documents", "wait": 4500},
	"vault": {"path": "/re/d/re-vault-document", "wait": 4500},
	"reports": {"path": "/re/reports?r=Collection%20Summary", "wait": 6000},
	"dashboard": {"path": "/re", "wait": 6000},
	"portal": {"path": "/portal?as={customer}", "wait": 6000},
}

# ---------------------------------------------------------------- the guides
GUIDES = [
	{
		"slug": "setup", "title": "Setup — project, map, plots and rules", "eyebrow": "Setup guide",
		"intro": "Everything the scheme needs before the first booking: the settings and rules, the project and its boundary, blocks, plot sizes, plots, payment plans, society charge heads and the users with their roles.",
		"stages": [("Settings", "Company, rules, fees, WhatsApp, land"), ("Project & map", "Boundary, land use, import"), ("Blocks & plots", "Sizes, prices, plots"), ("Plans", "Down payment, installments"), ("Users", "Roles and profiles")],
		"who": "Admin (System Manager), Sales Manager, Society Manager.",
		"sections": [
			{"title": "Settings and rules", "steps": [
				"Open **Setup → Settings** (RE Settings). Set the company, the default project and the discount limit.",
				"Rules are settings, not code: surcharge (grace days, % per month, minimum, cap), transfer and re-allotment fees, cancellation deduction and the agent / dealer commission.",
				"The **Land** tab holds sqft per Marla (272), the seller-payment approval limit (Rs 5,000,000), the province for transfer cost rates and the land accounts.",
			], "shots": [("settings", "RE Settings — company, project and every rule."), ("settings-land", "The Land tab: area units, approval limit and land accounts.")],
			 "note": "Changing a rate applies to new documents only; posted invoices keep the values they were made with."},
			{"title": "Project, boundary and land use", "steps": [
				"**Setup → Projects**: the scheme with its total land and boundary — drawn on the map or imported (KML / GeoJSON) in **Map Import**.",
				"Land use (blocks, roads, public buildings, infrastructure, waste) must total **100%** of the boundary; the acceptance checks warn if it does not.",
				"The boundary is the acquired land: once khasras are acquired, **Merge into boundary** (Land Overview, Admin) makes them the project map.",
			], "shots": [("project", "The project profile — land use, sell-through, collections and progress."), ("map", "The society map with all layers; the land acquisition layer is switched on in the layer list.")]},
			{"title": "Blocks, plot sizes, plots and payment plans", "steps": [
				"**Blocks** carry their outline, plot size and planned plots. **Plot sizes** carry the base price and monthly maintenance.",
				"**Plot records**: number, block, size, street, corner / park-facing / boulevard flags, outline and price history.",
				"**Payment plans**: booking %, down payment, monthly or quarterly installments, balloons, development charges and possession share — the schedule always totals the net price.",
			], "shots": [("blocks", "Blocks with sell-through and stock."), ("plans", "Payment plans and how many bookings use each.")]},
			{"title": "Users, roles and go-live", "steps": [
				"**Setup → Users & Roles**: give each person one profile — Admin, Accounts, Land Manager, Sales Manager, Sales Agent, Recovery Officer, Society Manager, Projects, Maintenance or Customer.",
				"Agents see only their own leads, customers and bookings — enforced on the server, not just the screens.",
				"**Acceptance checks** (Admin) run every check from the specification: land use, layout, schedules, ledger, documents, roles and the land module.",
			], "shots": [("users", "Users & Roles — profiles and who has them."), ("acceptance", "Acceptance checks with evidence for each result.")]},
		],
	},
	{
		"slug": "land", "title": "Land acquisition — khasras, sellers, deals and payments", "eyebrow": "Land acquisition guide",
		"intro": "How land is bought before it is plotted: khasras and their co-owners per fard, due diligence, the deal sheet and agreement to sell (iqrar nama), approval and purchase invoices, seller payments, plots instead of cash, registry and the land cost.",
		"stages": [("Khasra", "Co-owners & shares from the fard"), ("Diligence", "9 checks, 7 required"), ("Deal", "Owner lines, iqrar nama"), ("Approve & pay", "Invoices, payments, plots"), ("Registry", "Acquired, capitalised")],
		"who": "Land Manager (khasras, deals, payments), Admin / Accounts Manager (approvals), Accounts (payments, ledger).",
		"sections": [
			{"title": "The land bank", "steps": [
				"**Land Acquisition → Land Overview** shows Kanal acquired against the target, paid and payable to sellers and the average cost per Kanal.",
				"The map colours every khasra by stage; the acquired khasras are exactly the project boundary. Phase 2 khasras are still in the pipeline.",
				"Highlights call out overdue owners, disputes and their hearings, and land settled with plots.",
			], "shots": [("land", "Land Overview — land bank, highlights and the khasra map.")]},
			{"title": "Khasras, co-owners and the pipeline", "steps": [
				"**Khasras (records) → New**: mauza, khewat, khatooni, square, killa and khasra numbers (lists and ranges such as 43-44 or 5/2,16,17 are searchable), area in Kanal-Marla-Sarsai.",
				"Add each **co-owner** with their share from the fard; shares cannot exceed the khasra's area.",
				"On the **pipeline board**, drag a khasra to its next stage: Identified → Negotiation → Due Diligence → Token Paid → Agreement Signed → Payment in Progress → Registry / Mutation Done → Acquired.",
			], "shots": [("land-board", "The pipeline board: drag a khasra to move it."), ("land-sheet", "A khasra's panel: owners and shares, deals and payments, papers and history.")]},
			{"title": "Due diligence and court cases", "steps": [
				"Every khasra gets nine checks: fard-e-malkiat, jamabandi, mutation history, aks shajra, nishandehi, encumbrance, litigation, seller CNICs and legal opinion. Seven are required.",
				"The agreement stages stay locked until the required checks are **Verified** — or an Admin overrides with a reason.",
				"**Due Diligence & Cases** shows the matrix for all khasras, the court cases with the next hearing, and the land papers in the vault.",
			], "shots": [("land-legal", "The due diligence matrix, litigation register and land papers.")],
			 "note": "Hearings, payment due dates and registry deadlines come to the responsible person's bell 7, 3 and 1 days ahead."},
			{"title": "The deal (iqrar nama)", "steps": [
				"**Land Deals → New**: deal date, description (\"Falak Sher and Aalam Sher S/O Ghulam …\"), land for, khewat / khatooni / square / killa.",
				"Add an **owner line** per seller: owner, khasra, Kanals, Marlas, Sqft, unit (Acre / Kanal / Marla) and rate. Due = area in the unit × rate (18K-10M at 25,000,000 per Acre = 57,812,500).",
				"The **Contract** tab: token, agreement amount, installments, possession and registry dates, clauses, witnesses, stamp paper and transfer costs. **Build seller schedules** splits the terms by each seller's share.",
				"The deal is **Executed** only when every seller and both witnesses have signed.",
			], "shots": [("deal", "A multi-owner deal — status, approval, area, net due and balance."), ("deal-lines", "Owner lines and deal subtotals (raw Kanals and Marlas, normalised total)."), ("deal-contract", "Contract terms, transfer costs, witnesses and stamp paper.")]},
			{"title": "Approval, purchase invoices and seller payments", "steps": [
				"**Submit for approval**; an Admin or Accounts Manager approves. Approval posts a **Purchase Invoice per owner**: Dr Land Under Acquisition, Cr Creditors - Land Owners.",
				"**Record seller payment**: cheque, pay order, transfer or cash, with withholding tax. Up to Rs 5,000,000 it is paid directly; above, it waits for approval. A token paid before approval is an advance.",
				"Extensions (more time with an extra amount) and amendments (add a seller, change a share, cancel an owner) each go through approval and post their own entries.",
			], "shots": [("land-payments", "Sellers & Payments — balances from the supplier ledger, aging and what is due."), ("land-payment", "A seller payment: amount, tax withheld, net paid and the balance after.")]},
			{"title": "Plots instead of cash, registry and land cost", "steps": [
				"**Adjust with plots**: pick available plots; on approval each is booked to the owner (as a customer) and netted against their land payable by a Journal Entry — no cash moves.",
				"Mark each owner **Registry Done** / **Mutation Done**; the deal becomes **Completed** and the khasra **Acquired**.",
				"**Capitalise land cost** (Admin / Accounts) moves the cost to the project's land cost; Module 2 counts it under Land & Legal.",
			], "shots": [("adjustment", "A plot adjustment — plots, values, adjusted amount and what is still payable."), ("lps", "The Land Purchase Status report in the client's layout.")]},
		],
	},
	{
		"slug": "sales", "title": "Sales & booking — leads, visits and bookings", "eyebrow": "Sales guide",
		"intro": "From an enquiry to a booked plot: leads and follow-ups, site visits, the deal pipeline, choosing a plot, the booking with its schedule and Sales Invoice, and the allotment letter in English or Urdu.",
		"stages": [("Lead", "Source, agent, follow-up"), ("Visit", "WhatsApp invite, result"), ("Deal", "Pipeline to booking"), ("Booking", "Plot, plan, discount"), ("Allotment", "Schedule, invoice, letter")],
		"who": "Sales Agent (own records), Sales Manager (all, discount approval), Accounts.",
		"sections": [
			{"title": "Your day", "steps": ["**Today** lists today's site visits and follow-ups with call and WhatsApp buttons.", "Missed calls become follow-up tasks; the bell shows what is new."],
			 "shots": [("today", "Today — visits and follow-ups.")]},
			{"title": "Leads, deals and site visits", "steps": [
				"**Leads & Deals** (CRM): every lead with its source and agent; deals move Opportunity → Site Visit → Negotiation → Booking.",
				"An incoming WhatsApp from an unknown number creates a lead automatically.",
				"**Site Visits**: schedule with a WhatsApp invitation, then record the result.",
			], "shots": [("crm", "The CRM pipeline."), ("visits", "Site visits and their results.")]},
			{"title": "Choosing a plot and booking it", "steps": [
				"**Plots** (cards or table, filters by block, size, price, status) — open a plot for its panel and click **Book plot**.",
				"The booking needs a customer with CNIC and nominee, the plot, price, discount and payment plan. A discount above 5% waits for the Sales Manager.",
				"**Submit**: the schedule is built from the plan, the plot becomes Booked and a Sales Invoice carries the same schedule.",
			], "shots": [("plot", "The plot panel — price, location, history and actions."), ("booking", "A submitted booking with paid, outstanding and next due.")]},
			{"title": "Schedule and allotment letter", "steps": [
				"The **Installments** tab shows every installment with its status (Unpaid, Due, Overdue, Partly Paid, Paid).",
				"**Actions → Letters & forms** generates the allotment letter, schedule, application form and sale agreement in English or اردو, as numbered versions.",
			], "shots": [("booking-schedule", "Installments — always totalling the net price.")]},
		],
	},
	{
		"slug": "collections", "title": "Collections & recovery — receipts, reminders and surcharges", "eyebrow": "Collections guide",
		"intro": "How installments are collected: receipts allocated oldest-due first, reminders before and after the due date, the monthly late-payment surcharge, recovery calls and dunning, and waivers with approval.",
		"stages": [("Receipt", "Cash, cheque, transfer"), ("Allocation", "Oldest due first"), ("Reminders", "WhatsApp, SMS fallback"), ("Surcharge", "After 15 days grace"), ("Recovery", "Calls, dunning, waiver")],
		"who": "Accounts, Recovery Officer, Accounts Manager (waivers).",
		"sections": [
			{"title": "Receiving a payment", "steps": [
				"**Receipts → New**: booking, amount, mode (cash, cheque, bank transfer) and reference.",
				"The amount is allocated to the oldest unpaid installments first and a **Payment Entry** posts against the booking's Sales Invoice; a receipt with QR goes to the owner on WhatsApp.",
			], "shots": [("receipt", "A receipt and its allocations."), ("receipts", "Receipts with amounts and modes.")]},
			{"title": "Reminders, surcharges and recovery", "steps": [
				"Reminders go 3 days before a due date and overdue notices every 7 days — WhatsApp first, SMS if it fails.",
				"After 15 days' grace a surcharge is raised monthly (2% of the overdue, minimum Rs 500, capped at 10%) as its own invoice.",
				"**Operations → Recovery & surcharges**: dunning notices, surcharges and waivers; a waiver needs Accounts Manager approval and posts a credit note.",
			], "shots": [("recovery", "Recovery & surcharges — notices, surcharges and waivers."), ("inbox", "The shared WhatsApp inbox with quick replies.")]},
		],
	},
	{
		"slug": "operations", "title": "Post-sale operations — transfers, cancellations, merges, commissions", "eyebrow": "Operations guide",
		"intro": "Changes after a sale, each through an approval workflow with its accounting: transfer (no-dues check and fee), cancellation and refund, re-allotment, plot merge, and agent / dealer commissions.",
		"stages": [("Request", "Wizard with checks"), ("Approve", "Sales Manager"), ("Post", "Fees, credit notes, refunds"), ("Commissions", "Payable at 25% paid")],
		"who": "Sales Agent / Sales User (request), Sales Manager (approve), Accounts (refunds, payouts).",
		"sections": [
			{"title": "The operations hub", "steps": [
				"**Operations Hub**: transfers, cancellations, merges and recovery in one place, with the approvals waiting.",
				"**Transfer plot**: the wizard checks for overdue installments and society dues, then posts the transfer fee, closes the seller's balance and invoices the buyer.",
				"**Cancel booking**: deduction 10% of the price (never more than paid), credit notes and a refund; the plot is released for **re-allotment**.",
			], "shots": [("operations", "Operations hub — counts, wizards and the approval queue."), ("transfer", "A completed transfer with its invoices.")]},
			{"title": "Approvals and commissions", "steps": [
				"Every request waits in **Approvals** until the Sales Manager approves or rejects it.",
				"Commissions (agent 1%, dealer 2%) accrue at booking, become payable when 25% is paid, and are paid with a printable voucher.",
			], "shots": [("approvals", "The approvals queue."), ("commissions", "Commissions — accrued, payable and paid.")]},
		],
	},
	{
		"slug": "society", "title": "Society & maintenance — bills, collection and complaints", "eyebrow": "Society guide",
		"intro": "The society after possession: charge heads, monthly bills per occupied plot with arrears, bulk collection, defaulters, complaints that become jobs, and planned maintenance.",
		"stages": [("Charge heads", "Fixed, per marla, by size"), ("Monthly bills", "Day 1, due in 15 days"), ("Collection", "Bulk, receipts"), ("Complaints", "Jobs, technician, done")],
		"who": "Society Manager, Accounts, Recovery Officer, technicians.",
		"sections": [
			{"title": "Charge heads and monthly bills", "steps": [
				"**Charge Heads**: fixed, per marla or by plot size, for all plots or residential / commercial only.",
				"Bills are made on day 1 for every occupied plot, due in 15 days, with unpaid earlier bills carried as arrears. Plots given to land owners on waived terms are skipped.",
			], "shots": [("charges", "Charge heads and what each plot size pays."), ("bills", "Society bills with insights and ageing.")]},
			{"title": "Collection, complaints and maintenance", "steps": [
				"**Bulk Collection**: pick owners or a block and record many payments at once.",
				"Complaints from the portal, WhatsApp or staff become tasks with priority and assignee; the owner is told when it is done.",
				"**Maintenance Plans** create tasks ahead of their due date; **Infrastructure** shows each feature's build-out and upkeep.",
			], "shots": [("collect", "Bulk collection."), ("mplans", "Maintenance plans and their schedule.")]},
		],
	},
	{
		"slug": "development", "title": "Development, stock & assets", "eyebrow": "Development guide",
		"intro": "Development cost heads as ERPNext Projects with budgets: material requests, purchase orders, receipts into the site store, issues to cost heads, contractor bills, assets with depreciation — and the land cost from Module 0.",
		"stages": [("Budgets", "Cost heads as projects"), ("Buying", "Request, PO, receipt"), ("Stock", "Issue to head"), ("Assets", "Depreciation")],
		"who": "Projects Manager, Accounts, Purchase and Stock users.",
		"sections": [
			{"title": "Budget vs actual", "steps": [
				"**Development & Costs → Overview**: each head's budget, actual, committed, paid and payable, next to the works on the map.",
				"The **Land & Legal** head counts land being bought (Land Under Acquisition) and capitalised land cost.",
			], "shots": [("development", "Development overview — budgets, progress and spending.")]},
			{"title": "Assets", "steps": ["**Assets**: land, buildings, transformers, generators, machinery and tools, linked to map features and depreciated by category."],
			 "shots": [("assets", "Assets by category with book value.")]},
		],
	},
	{
		"slug": "documents-reports", "title": "Documents & reports", "eyebrow": "Documents & reports guide",
		"intro": "Twenty-one documents on the letterhead with a QR code, in English or Urdu, kept as numbered versions; the document vault with expiry alerts; the dashboard and the report centre with charts, Excel and PDF.",
		"stages": [("Generate", "EN / اردو, versions"), ("Vault", "Papers, expiry"), ("Dashboard", "KPIs, urgent queue"), ("Reports", "Charts, Excel, PDF")],
		"who": "Everyone, by role.",
		"sections": [
			{"title": "Documents and the vault", "steps": [
				"From any record: **Actions → Letters & forms** — pick the document and the language. Each run is a new version, attached to the record.",
				"Land documents: agreement to sell (iqrar nama), seller receipts, final settlement, plot adjustment memo, land owner statement.",
				"The **Vault** holds NOCs, approvals, fard, registry, mutation and other papers with expiry dates and renewal alerts.",
			], "shots": [("documents", "Documents — generate by type and reference."), ("vault", "The document vault.")]},
			{"title": "Dashboard and reports", "steps": [
				"The **Dashboard**: collections, sales, overdue and the urgent queue — complaints, documents, approvals and land (seller payments due, hearings).",
				"The **Report centre**: every report with filters, summary, a sortable table, charts (bar, line, area, pie, donut, trend), Excel and PDF — including 14 land reports.",
			], "shots": [("dashboard", "The dashboard."), ("reports", "The report centre with a chart.")]},
		],
	},
	{
		"slug": "portal", "title": "Owner portal", "eyebrow": "Owner portal guide",
		"intro": "What a plot owner sees on their phone, in English or اردو: their plots on the map, schedule and dues, society bills, receipts, documents to download and complaints.",
		"stages": [("Home", "Paid, due, next installment"), ("Payments", "Receipts, bills"), ("Documents", "Downloads"), ("Help", "Complaints")],
		"who": "Plot owners; staff can preview any owner's portal read-only.",
		"sections": [
			{"title": "The portal", "steps": [
				"Owners sign in at **/portal**; staff open **Preview portal** from the customer page.",
				"Switch to اردو and the whole portal turns right-to-left.",
			], "shots": [("portal", "The owner portal (staff preview).")]},
		],
	},
]


# ---------------------------------------------------------------- render
CSS = """
@page{size:A4;margin:12mm 13mm 12mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact} body{margin:0;font-family:'Noto Sans','Segoe UI',Arial,sans-serif;color:#1e293b;font-size:10pt;line-height:1.5;background:#fff}
.cover{position:relative;overflow:hidden;color:#fff;border-radius:4mm;padding:9mm 9mm 8mm;margin-bottom:6mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;
 background:radial-gradient(circle at 92% 8%,rgba(45,212,191,.38),transparent 42%),radial-gradient(circle at 4% 100%,rgba(99,102,241,.45),transparent 48%),linear-gradient(135deg,#0f1e3a 0%,#1e3a8a 55%,#0f766e 100%)}
.cover .eyebrow{font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fbbf24}
.cover h1{font-size:23pt;margin:2mm 0 3mm;line-height:1.15;color:#fff;letter-spacing:-.01em}
.cover p{color:#dbeafe;margin:0 0 5mm;font-size:10.5pt}
.stages{display:flex;gap:2.5mm}
.stage{flex:1;color:#1e293b;border-radius:2.5mm;padding:3.5mm 3mm 3mm;min-width:0;position:relative;overflow:hidden;background:linear-gradient(180deg,#fff 55%,#f1f5f9);box-shadow:0 1.5mm 4mm rgba(0,0,0,.18)}
.stage:before{content:"";position:absolute;inset:0 0 auto 0;height:1.4mm;background:linear-gradient(90deg,var(--a),var(--b))}
.stage b{color:var(--b)}
.stage:nth-child(5n+1){--a:#0ea5e9;--b:#2563eb} .stage:nth-child(5n+2){--a:#84cc16;--b:#059669} .stage:nth-child(5n+3){--a:#f59e0b;--b:#ea580c} .stage:nth-child(5n+4){--a:#ec4899;--b:#e11d48} .stage:nth-child(5n){--a:#8b5cf6;--b:#6d28d9}
.stage b{display:block;font-size:9.5pt} .stage span{font-size:8pt;color:#475569;line-height:1.35;display:block}
.who{color:#dbeafe;font-size:9pt;margin-top:4mm} .who b{color:#fde68a}
h2{display:flex;align-items:center;gap:3mm;font-size:13.5pt;margin:7mm 0 3mm;padding-bottom:1.6mm;break-after:avoid;border-bottom:.6mm solid transparent;border-image:linear-gradient(90deg,#f59e0b,#ec4899 35%,rgba(236,72,153,0) 80%) 1}
h2 .n{display:inline-grid;place-items:center;width:7mm;height:7mm;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f97316 55%,#e11d48);color:#fff;font-size:10pt;flex:none;box-shadow:0 .8mm 2mm rgba(249,115,22,.4)}
ol.steps{list-style:none;padding:0;margin:0 0 3mm;counter-reset:s}
ol.steps li{counter-increment:s;position:relative;padding-left:8.5mm;margin:0 0 2.2mm}
ol.steps li:before{content:counter(s);position:absolute;left:0;top:.2mm;width:5.6mm;height:5.6mm;border-radius:50%;background:linear-gradient(135deg,#4ade80,#059669);box-shadow:0 .5mm 1.2mm rgba(5,150,105,.35);color:#fff;font-size:8.5pt;font-weight:700;display:grid;place-items:center}
figure{margin:3mm 0 4mm;break-inside:avoid} figure img{width:100%;border:1px solid #cbd5e1;border-radius:2.5mm;display:block;box-shadow:0 1.5mm 5mm rgba(30,58,138,.14)}
figcaption{font-size:8.5pt;color:#64748b;margin-top:1.5mm}
.note{background:linear-gradient(120deg,#fef9c3,#fff7ed 70%,#fdf2f8);border:1px solid #fde68a;border-left:1.4mm solid #f59e0b;border-radius:2mm;padding:3mm 4mm;font-size:9.3pt;margin:2mm 0 4mm;break-inside:avoid}
.foot{font-size:7.5pt;color:#94a3b8;margin-top:8mm;border-top:1px solid #e2e8f0;padding-top:2mm}
"""


def md(text):
	out = html.escape(text)
	import re
	return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)


def guide_html(g):
	stages = "".join(f'<div class="stage"><b>{i} · {html.escape(t)}</b><span>{html.escape(d)}</span></div>' for i, (t, d) in enumerate(g["stages"], 1))
	parts = [f"""<div class="cover"><div class="eyebrow">Zarmeen Gardens Real Estate ERP · {html.escape(g['eyebrow'])}</div><h1>{html.escape(g['title'])}</h1>
	<p>{html.escape(g['intro'])}</p><div class="stages">{stages}</div><div class="who"><b>Who:</b> {html.escape(g['who'])}</div></div>"""]
	for i, s in enumerate(g["sections"], 1):
		steps = "".join(f"<li>{md(x)}</li>" for x in s.get("steps", []))
		shots = "".join(f'<figure><img src="{SHOTS}/{sid}.png"><figcaption>{html.escape(cap)}</figcaption></figure>'
						for sid, cap in s.get("shots", []) if os.path.exists(f"{SHOTS}/{sid}.png"))
		note = f'<div class="note">{md(s["note"])}</div>' if s.get("note") else ""
		parts.append(f'<h2><span class="n">{i}</span>{html.escape(s["title"])}</h2><ol class="steps">{steps}</ol>{note}{shots}')
	parts.append('<div class="foot">Zarmeen Gardens Real Estate ERP · screenshots from the demo scheme (light theme) · see also Process flow &amp; DFD and the video library</div>')
	return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{"".join(parts)}</body></html>'


def shots(only=None):
	ids = sorted({sid for g in GUIDES if not only or g["slug"] in only for s in g["sections"] for sid, _c in s.get("shots", [])})
	spec = [{"id": i, **SHOT[i]} for i in ids]
	path = os.path.join(HERE, "out/shots.json")
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w") as fh:
		json.dump(spec, fh)
	subprocess.run(["node", os.path.join(HERE, "shots.mjs"), path, SHOTS], check=True)


def build(only=None):
	os.makedirs(OUT, exist_ok=True)
	for g in GUIDES:
		if only and g["slug"] not in only:
			continue
		src = os.path.join(HERE, f"out/{g['slug']}.html")
		with open(src, "w") as fh:
			fh.write(guide_html(g))
		pdf = os.path.join(OUT, f"Zarmeen-{g['slug'].title().replace('-', '-')}-Guide.pdf")
		subprocess.run(["node", os.path.join(HERE, "print.mjs"), src, pdf], check=True)
		print("wrote", os.path.basename(pdf))


if __name__ == "__main__":
	args = [a for a in sys.argv[1:] if not a.startswith("--")]
	if "--no-shots" not in sys.argv:
		shots(args or None)
	build(args or None)
