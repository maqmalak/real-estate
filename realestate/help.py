"""Help centre for the React app (/re/help): role manuals (realestate/manuals/*.md, rendered here), the A4 guides (PDF, in
public/help — in git) and the videos (public/downloads/videos — generated, copied to each server like the sugarcane set).
A video is listed only when its file is on this server. Same shape as the sugarcane help API."""

import json
import os
import re

import frappe
from frappe import _

APP = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(APP, "manuals")
PUBLIC = os.path.join(APP, "public")
EVERYONE = {"System Manager", "Sales Manager", "Accounts Manager"}
LAND = ["Land Manager", "Accounts User", "Accounts Manager"]
SALES = ["Sales Manager", "Sales User", "Sales Agent"]

# in the order the work flows: the big picture, setup, land, sales, money, after the sale, society, development, documents, portal
GUIDES = [
	{"slug": "process-flow-dfd", "stage": "Start here", "title": "Process flow & DFD", "kind": "Guide",
	 "summary": "The whole ERP in DFD level 0 and 1, the process flow from khasra to collected installment, and DFDs for land, sales, collections, post-sale, society and development.",
	 "pdf": "help/process-flow-dfd.pdf", "video": None, "roles": ["all"], "manuals": ["getting-started", "admin"]},
	{"slug": "setup", "stage": "Start here", "title": "Setup — project, map, plots and rules", "kind": "Guide",
	 "summary": "Settings and rules, the project boundary and land use, blocks, plot sizes, plots, payment plans, users and roles, acceptance checks.",
	 "pdf": "help/setup.pdf", "video": "00-setup.webm", "roles": ["System Manager", "Sales Manager"], "manuals": ["admin"]},
	{"slug": "land", "stage": "Land acquisition", "title": "Land acquisition — khasras, sellers, deals", "kind": "Guide",
	 "summary": "Khasras and co-owners per fard, due diligence, the deal and iqrar nama, approval and purchase invoices, seller payments, plots in lieu, registry and land cost.",
	 "pdf": "help/land.pdf", "video": "16-land-acquisition.webm", "roles": LAND, "manuals": ["land-manager", "accounts"]},
	{"slug": "video-seller-payments", "stage": "Land acquisition", "title": "Seller payments and plots in lieu", "kind": "Video",
	 "summary": "Sellers' balances from the ledger, a cheque payment with withholding tax posted as a Payment Entry, and a plot adjustment.",
	 "pdf": None, "video": "17-seller-payments.webm", "roles": LAND, "manuals": ["land-manager", "accounts"]},
	{"slug": "video-land-reports", "stage": "Land acquisition", "title": "Land reports and the iqrar nama", "kind": "Video",
	 "summary": "Land Purchase Status in the client's layout, the owners' trial balance against the ledger, and the agreement to sell in Urdu.",
	 "pdf": None, "video": "18-land-reports.webm", "roles": LAND, "manuals": ["land-manager", "accounts"]},
	{"slug": "sales", "stage": "Sales & collections", "title": "Sales & booking", "kind": "Guide",
	 "summary": "Your day, leads and the deal pipeline, site visits, choosing and booking a plot, the schedule and the allotment letter in English or Urdu.",
	 "pdf": "help/sales.pdf", "video": "03-booking.webm", "roles": SALES, "manuals": ["sales"]},
	{"slug": "video-crm", "stage": "Sales & collections", "title": "CRM & WhatsApp", "kind": "Video", "summary": "Leads, deals, site visits and the shared WhatsApp inbox.",
	 "pdf": None, "video": "02-crm.webm", "roles": SALES, "manuals": ["sales"]},
	{"slug": "video-day", "stage": "Sales & collections", "title": "Your day in the app", "kind": "Video", "summary": "Home, dashboard, today's visits and follow-ups, insights and notifications.",
	 "pdf": None, "video": "01-daily.webm", "roles": ["all"], "manuals": ["getting-started"]},
	{"slug": "collections", "stage": "Sales & collections", "title": "Collections & recovery", "kind": "Guide",
	 "summary": "Receipts allocated oldest-due first, reminders, monthly surcharges, recovery and dunning, waivers with approval.",
	 "pdf": "help/collections.pdf", "video": "04-receipt.webm", "roles": ["Accounts User", "Accounts Manager", "Recovery Officer", *SALES], "manuals": ["accounts", "recovery"]},
	{"slug": "video-recovery", "stage": "Sales & collections", "title": "Recovery & surcharges", "kind": "Video", "summary": "Dunning, monthly surcharges and a waiver with approval.",
	 "pdf": None, "video": "09-recovery.webm", "roles": ["Recovery Officer", "Accounts User", "Accounts Manager"], "manuals": ["recovery"]},
	{"slug": "operations", "stage": "After the sale", "title": "Post-sale operations", "kind": "Guide",
	 "summary": "Transfers with the no-dues check, cancellations and refunds, re-allotments, plot merges, approvals and commissions.",
	 "pdf": "help/operations.pdf", "video": "05-transfer.webm", "roles": [*SALES, "Accounts User", "Accounts Manager"], "manuals": ["sales", "accounts"]},
	{"slug": "video-cancellation", "stage": "After the sale", "title": "Cancelling a booking", "kind": "Video", "summary": "Deduction and refund, approval, credit notes and the plot released.",
	 "pdf": None, "video": "06-cancellation.webm", "roles": [*SALES, "Accounts Manager"], "manuals": []},
	{"slug": "video-reallotment", "stage": "After the sale", "title": "Re-allotting a released plot", "kind": "Video", "summary": "A plot freed by a cancellation goes to a waiting buyer.",
	 "pdf": None, "video": "07-reallotment.webm", "roles": SALES, "manuals": []},
	{"slug": "video-merge", "stage": "After the sale", "title": "Merging plots", "kind": "Video", "summary": "Two adjacent plots become one; approval; the map updates.",
	 "pdf": None, "video": "08-merge.webm", "roles": [*SALES, "Society Manager"], "manuals": []},
	{"slug": "video-commissions", "stage": "After the sale", "title": "Commissions", "kind": "Video", "summary": "Accrued, payable and paid; paying with a voucher.",
	 "pdf": None, "video": "10-commissions.webm", "roles": ["Sales Manager", "Accounts User", "Accounts Manager", "Sales Agent"], "manuals": ["accounts"]},
	{"slug": "society", "stage": "Society & development", "title": "Society & maintenance", "kind": "Guide",
	 "summary": "Charge heads, monthly bills with arrears, bulk collection, defaulters, complaint jobs and planned maintenance.",
	 "pdf": "help/society.pdf", "video": "11-society.webm", "roles": ["Society Manager", "Accounts User", "Accounts Manager"], "manuals": ["society"]},
	{"slug": "video-maintenance", "stage": "Society & development", "title": "Maintenance & complaints", "kind": "Video", "summary": "Plans, the urgent queue, complaint jobs and infrastructure.",
	 "pdf": None, "video": "12-maintenance.webm", "roles": ["Society Manager", "Projects Manager", "Projects User"], "manuals": ["society", "projects"]},
	{"slug": "development", "stage": "Society & development", "title": "Development, stock & assets", "kind": "Guide",
	 "summary": "Cost heads with budgets, buying into the site store, issues to cost heads, assets and depreciation, the land cost head.",
	 "pdf": "help/development.pdf", "video": "13-development.webm", "roles": ["Projects Manager", "Projects User", "Accounts User", "Accounts Manager"], "manuals": ["projects"]},
	{"slug": "documents-reports", "stage": "Documents, reports & portal", "title": "Documents & reports", "kind": "Guide",
	 "summary": "Twenty-one documents in English or Urdu as numbered versions, the vault, the dashboard and the report centre.",
	 "pdf": "help/documents-reports.pdf", "video": "14-documents-reports.webm", "roles": ["all"], "manuals": ["getting-started"]},
	{"slug": "generated-documents", "stage": "Documents, reports & portal", "title": "Printed documents (specimens)", "kind": "Guide",
	 "summary": "Every generated document in English and Urdu: booking forms, letters, receipts, statements and the five land documents.",
	 "pdf": "help/generated-documents.pdf", "video": None, "roles": ["all"], "manuals": []},
	{"slug": "portal", "stage": "Documents, reports & portal", "title": "Owner portal", "kind": "Guide",
	 "summary": "What a plot owner sees in English or اردو: plots on the map, schedule, bills, receipts, documents and complaints.",
	 "pdf": "help/portal.pdf", "video": "15-portal.webm", "roles": ["all"], "manuals": []},
]


def _video_index() -> dict:
	try:
		with open(os.path.join(PUBLIC, "downloads", "videos", "index.json")) as f:
			return json.load(f)
	except (OSError, ValueError):
		return {}


def _guides(mine: set, manual: str | None = None) -> list:
	out, vids = [], _video_index()
	for g in GUIDES:
		if manual and manual not in g["manuals"]:
			continue
		if not ("all" in g["roles"] or EVERYONE & mine or set(g["roles"]) & mine or manual):
			continue
		pdf = g["pdf"] if g["pdf"] and os.path.exists(os.path.join(PUBLIC, g["pdf"])) else None
		video = g["video"] if g["video"] and os.path.exists(os.path.join(PUBLIC, "downloads", "videos", g["video"])) else None
		if not pdf and not video:
			continue
		out.append({**{k: g[k] for k in ("slug", "title", "kind", "summary", "roles", "stage")}, "order": len(out) + 1,
					"pdf_url": f"/assets/realestate/{pdf}" if pdf else None,
					"video_url": f"/assets/realestate/downloads/videos/{video}" if video else None,
					"poster_url": f"/assets/realestate/downloads/videos/{video[:-5]}.jpg" if video and os.path.exists(os.path.join(PUBLIC, "downloads", "videos", video[:-5] + ".jpg")) else None,
					"seconds": (vids.get(video) or {}).get("seconds") if video else None,
					"mine": bool(set(g["roles"]) & mine)})
	return out


def _read(slug):
	path = os.path.join(DIR, f"{slug}.md")
	if not re.fullmatch(r"[a-z0-9-]+", slug or "") or not os.path.exists(path):
		frappe.throw(_("No such manual"), frappe.DoesNotExistError)
	text = open(path, encoding="utf-8").read()
	meta, body = {}, text
	m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
	if m:
		body = text[m.end():]
		for line in m.group(1).splitlines():
			k, _sep, v = line.partition(":")
			meta[k.strip()] = v.strip()
	roles = {r.strip() for r in meta.get("roles", "").split(",") if r.strip()}
	return {"slug": slug, "title": meta.get("title") or slug, "roles": sorted(roles), "order": int(meta.get("order") or 99), "body": body}


def _allowed(m, mine):
	return "all" in m["roles"] or EVERYONE & mine or set(m["roles"]) & mine


@frappe.whitelist(methods=["GET"])
def manuals() -> list:
	mine = set(frappe.get_roles())
	out = []
	for f in sorted(os.listdir(DIR)):
		if f.endswith(".md"):
			m = _read(f[:-3])
			if _allowed(m, mine):
				out.append({"slug": m["slug"], "title": m["title"], "roles": m["roles"], "order": m["order"], "mine": bool(set(m["roles"]) & mine)})
	return sorted(out, key=lambda m: (m["order"], m["title"]))


@frappe.whitelist(methods=["GET"])
def manual(slug: str) -> dict:
	m = _read(slug)
	if not _allowed(m, set(frappe.get_roles())):
		frappe.throw(_("This manual is for another role"), frappe.PermissionError)
	from frappe.utils import md_to_html

	return {"slug": m["slug"], "title": m["title"], "roles": m["roles"], "html": md_to_html(m["body"]), "guides": _guides(set(frappe.get_roles()), slug)}


@frappe.whitelist(methods=["GET"])
def guides() -> list:
	"""Guides (PDF) and videos for the signed-in person's roles; managers see everything."""
	return _guides(set(frappe.get_roles()))
