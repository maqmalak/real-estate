"""Zarmeen Gardens — Process flow & DFD (A4 landscape), in the MicroMax sugarcane guide style.

	python3 tools/guides/dfd_book.py        -> docs/guides/Zarmeen-Process-Flow-and-DFD.pdf (+ frontend/public/help copy)
"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from diagram import Diagram, Flow  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "../.."))
OUT = os.path.join(APP, "docs/guides")
SYSTEM = "Zarmeen Gardens\nReal Estate ERP"
pages = []


def page(title, sub, svg, caption):
	pages.append((title, sub, svg, caption))


import math as _m

Y1, YS, Y2, YL = 85, 205, 330, 455  # process row 1, stores, process row 2, ledger


def context(num, label, ents, gap=6):
	"""DFD level 0: the area as one process, the outside parties on an ellipse, paired flows."""
	d = Diagram()
	d.process("sys", 500, 255, num, label, r=88)
	n = len(ents)
	for i, (key, name, to, frm) in enumerate(ents):
		a = _m.radians(-90 + i * 360 / n)
		x, y = 500 + 385 * _m.cos(a), 255 + 205 * _m.sin(a)
		d.entity(key, round(x), round(y), name, w=150, h=44 if "\n" in name else 36)
	for key, name, to, frm in ents:
		if to and frm:
			d.pair(key, "sys", to, frm, gap=gap)
		elif to:
			d.flow(key, "sys", to, lside=-1)
		else:
			d.flow("sys", key, frm, lside=-1)
	return d


# ================================================================ 1. DFD level 0 — the whole ERP
d = context("0", SYSTEM, [
	("mgmt", "Management", "approvals, rates,\nplans, limits", "dashboards,\ninsights, reports"),
	("agent", "Sales agents\n& dealers", "leads, visits,\nbookings, calls", "commission vouchers,\nown pipeline"),
	("bank", "Banks", "statements,\nclearance", "deposits, payments to\nsellers & suppliers"),
	("gov", "Government\n(Revenue, FBR, NOCs)", "fard, mutation,\nNOCs, notices", "stamp duty, fees,\n236K, returns"),
	("wa", "WhatsApp /\nSMS / email", "incoming chat,\ndelivery status", "templates,\nreminders"),
	("staff", "Staff (land, sales, accounts,\nrecovery, society, projects)", "entries, receipts,\njobs, approvals", "queues, alerts,\ntasks"),
	("sup", "Suppliers &\ncontractors", "bills, goods,\nworks done", "POs,\npayments"),
	("owner", "Plot owners\n(portal)", "payments, complaints,\ntransfer requests", "bills, statements,\nreminders"),
	("buyer", "Prospect /\nbuyer", "enquiry, CNIC,\nbooking, payments", "visit invite, allotment,\nschedule, receipts"),
	("land", "Land owners\n(sellers)", "fard shares, CNIC,\nsignatures, bank a/c", "agreement, payments,\nplots in lieu"),
])
page("DFD level 0 — Zarmeen Gardens Real Estate ERP (context)", "Everyone outside the system and what passes between them", d.svg(),
	 "DFD level 0 — the whole ERP in context: land owners, buyers, plot owners, agents, management, banks, government, suppliers, messaging and staff.")

# ================================================================ 2. DFD level 1 — the whole ERP
d = Diagram()
for k, x, n, l in [("p1", 110, "1.0", "Land\nacquisition"), ("p2", 300, "2.0", "Project\n& map"), ("p3", 500, "3.0", "CRM &\nsite visits"),
				   ("p4", 700, "4.0", "Booking &\nschedule"), ("p5", 895, "5.0", "Collections\n& recovery")]:
	d.process(k, x, Y1, n, l)
for k, x, n, l in [("p10", 110, "10.0", "Reports &\nportal"), ("p9", 300, "9.0", "Documents\n& messaging"), ("p8", 500, "8.0", "Development\n& assets"),
				   ("p7", 700, "7.0", "Society &\nmaintenance"), ("p6", 895, "6.0", "Post-sale &\ncommissions")]:
	d.process(k, x, Y2, n, l)
d.store("d1", 120, YS, "D1", "Khasras & land deals", w=170)
d.store("d2", 315, YS, "D2", "Project, blocks, plots", w=175)
d.store("d3", 600, YS, "D3", "Leads & bookings", w=190)
d.store("d4", 895, YS, "D4", "Receipts & bills", w=170)
d.store("d5", 520, YL, "D5", "General ledger (invoices, payments, journals)", w=800)
d.hflow("p1", "p2", "acquired land\n= project map")
d.vflow("p1", "d1", "khasras, owners, deals", x=110, lside=1)
d.vflow("p2", "d2", "blocks, plots, prices", x=300, lside=1)
d.route("d2", "p3", [(500, YS)], "available plots", seg=1, lside=-1)
d.hflow("p3", "p4", "won deal")
d.vflow("p3", "d3", "", x=530)
d.vflow("p4", "d3", "booking", x=670, lside=1)
d.hflow("p4", "p5", "schedule")
d.vflow("p5", "d4", "receipts", x=880, lside=-1)
d.vflow("d4", "p6", "dues, paid share", x=910, lside=1)
d.route("d4", "p7", [(700, YS)], "occupied plots", seg=1, lside=1)
d.route("d3", "p9", [(560, 262), (300, 262)], "booking & bill data", seg=1, lside=1)
d.route("p1", "d5", [(28, Y1), (28, YL)], "seller invoices\n& payments", seg=1, lside=-1)
for k, x in (("p6", 895), ("p7", 700), ("p8", 500)):
	d.vflow(k, "d5", {"p6": "credit notes,\ncommission", "p7": "society\ninvoices", "p8": "POs, stock,\nassets"}[k], x=x, lside=1)
d.vflow("d5", "p10", "ledger & all stores", x=110, lside=1)
page("DFD level 1 — Zarmeen Gardens Real Estate ERP", "1–5 land in, plots sold, money collected · 6–10 after the sale, society, cost, reports", d.svg(),
	 "DFD level 1 — the whole ERP: land acquisition → project & map → CRM → booking → collections, then post-sale, society, development, documents and reports.")

# ================================================================ 3. Process flow — from khasra to collected installment
f = Flow()
f.lane(40, 150, "Land", "#f0fdf4")
f.lane(150, 270, "Plan & sell", "#eff6ff")
f.lane(270, 390, "Collect", "#fefce8")
f.lane(390, 500, "After sale", "#fdf2f8")
f.box("a1", 150, 95, "Khasra identified\n(co-owners per fard)", "staff")
f.box("a2", 310, 95, "Due diligence\n(9 checks)", "erp")
f.diamond("a3", 460, 95, "Checks\npassed?")
f.box("a4", 610, 95, "Deal / iqrar nama\nsigned, approved", "erp")
f.box("a5", 770, 95, "Seller invoices\n& payments", "erp")
f.box("a6", 920, 95, "Registry / mutation\n→ acquired", "end")
f.box("b1", 150, 210, "Boundary = acquired\nkhasras (map)", "erp")
f.box("b2", 310, 210, "Blocks, plots,\nsizes, prices", "erp")
f.box("b3", 470, 210, "Lead → site visit\n(agent, WhatsApp)", "role")
f.box("b4", 630, 210, "Booking (CNIC,\nnominee, plan)", "role")
f.box("b5", 790, 210, "Schedule + Sales\nInvoice + allotment", "erp")
f.box("c1", 150, 330, "Reminders\n(3 days before)", "erp")
f.box("c2", 310, 330, "Receipt: cash /\ncheque / transfer", "role")
f.box("c3", 470, 330, "Allocated oldest\ndue first → PE", "erp")
f.diamond("c4", 630, 330, "Overdue?")
f.box("c5", 790, 330, "Surcharge,\nnotice, dunning", "erp")
f.box("c6", 930, 330, "Paid → plot Sold\n→ NDC", "end", w=120)
f.box("e1", 150, 445, "Society bill\nmonthly", "erp")
f.box("e2", 310, 445, "Complaint → task\n→ done (WhatsApp)", "role")
f.box("e3", 470, 445, "Transfer / cancel /\nre-allot / merge", "role")
f.box("e4", 630, 445, "Approval\n(Sales Manager)", "staff")
f.box("e5", 790, 445, "Credit notes, fee,\nrefund posted", "erp")
f.box("e6", 930, 445, "Possession\nletter", "end", w=120)
for a, b in (("a1", "a2"), ("a2", "a3"), ("a4", "a5"), ("a5", "a6"), ("b1", "b2"), ("b2", "b3"), ("b3", "b4"), ("b4", "b5"),
			 ("c1", "c2"), ("c2", "c3"), ("c3", "c4"), ("c5", "c6"), ("e1", "e2"), ("e3", "e4"), ("e4", "e5"), ("e5", "e6")):
	f.arrow(a, b)
f.arrow("a3", "a4", label="yes")
f.arrow("a3", "a2", "b", "b", label="no — fix / Admin override", via=[(460, 140), (310, 140)], ly=10)
f.arrow("a6", "b1", "b", "t", via=[(920, 125), (920, 160), (150, 160)])
f.arrow("b5", "c1", "b", "t", via=[(790, 280), (150, 280)])
f.arrow("c4", "c5", label="yes")
f.arrow("c4", "c6", "b", "b", label="no", via=[(630, 372), (930, 372)], ly=10)
f.legend([("staff", "Management / approval"), ("role", "Staff / agent"), ("erp", "ERP step"), ("end", "Result")])
page("Process flow — from khasra to collected installment", "Zarmeen Gardens Real Estate ERP", f.svg(),
	 "Process flow — land is acquired before it is plotted; plots are sold, installments collected and post-sale changes approved.")


# ================================================================ 4. DFD level 0 — land acquisition
d = context("1", "Land\nacquisition", [
	("lm", "Land Manager", "khasras, deals,\nstage moves", "pipeline, overdue,\nhearings"),
	("appr", "Admin / Accounts\nManager", "approvals: deal,\npayments, extensions", "approval queue"),
	("bank", "Banks", "cheque clearance", "cheques, pay orders,\ntransfers"),
	("fbr", "FBR / Punjab\nExcise", "rates: 236K,\nstamp duty, CVT", "taxes withheld,\nduties paid"),
	("proj", "Project & map (2.0)", "plots planned", "acquired khasras\n= project boundary"),
	("court", "Courts / lawyers", "cases, hearings,\norders", "replies, evidence"),
	("rev", "Revenue office\n(patwari, registrar)", "fard, jamabandi,\nmutation, aks shajra", "registry papers,\nfees"),
	("own", "Land owners /\nco-owners", "fard share, CNIC,\nsignature, thumb", "agreement, payments,\nreceipts, settlement"),
])
page("DFD level 0 — land acquisition (Module 0)", "Khasras, sellers, deals, payments, papers and courts", d.svg(),
	 "DFD level 0 — land acquisition in context: land owners, the Land Manager, approvers, revenue office, banks, courts, FBR and the project map.")

# ================================================================ 5. DFD level 1 — land acquisition
d = Diagram()
d.entity("own", 62, Y1, "Land\nowners", w=96, h=42)
d.process("q1", 205, Y1, "1.1", "Khasras &\nco-owners")
d.process("q2", 395, Y1, "1.2", "Due\ndiligence")
d.process("q3", 585, Y1, "1.3", "Deal &\niqrar nama")
d.process("q4", 775, Y1, "1.4", "Approval &\ninvoices")
d.entity("appr", 935, Y1, "Admin /\nAccounts", w=96, h=42)
d.process("q7", 205, Y2, "1.7", "Registry &\ncapitalise")
d.process("q6", 450, Y2, "1.6", "Plots instead\nof cash")
d.process("q5", 700, Y2, "1.5", "Seller\npayments")
d.store("s1", 205, YS, "D1", "Khasras, owners, stages", w=200)
d.store("s2", 395, YS, "D2", "Checklists & papers", w=160)
d.store("s3", 630, YS, "D3", "Land deals & schedules", w=200)
d.store("s4", 500, YL, "D4", "Ledger — Creditors - Land Owners, Land Under Acquisition", w=860)
d.hflow("own", "q1", "fard, CNIC")
d.hflow("q1", "q2", "khasra")
d.hflow("q2", "q3", "cleared")
d.hflow("q3", "q4", "executed")
d.hflow("appr", "q4", "approve")
d.vflow("q1", "s1", "khasra, shares", x=205, lside=-1)
d.vflow("q2", "s2", "checks, papers", x=395, lside=1)
d.vflow("q3", "s3", "deal, lines, schedule", x=585, lside=-1)
d.vflow("q4", "s4", "purchase invoices", x=815, lside=1)
d.vflow("s3", "q5", "dues", x=700, lside=1)
d.route("s3", "q6", [(560, 262), (450, 262)], "balance", seg=1, lside=1)
d.vflow("q5", "s4", "Payment Entries", x=700, lside=1)
d.vflow("q6", "s4", "Journal Entry", x=450, lside=1)
d.vflow("q7", "s1", "stage Acquired", x=225, lside=1)
d.vflow("s4", "q7", "paid in full", x=185, lside=-1)
d.route("q7", "s4", [(120, Y2), (120, YL)], "land cost", seg=1, lside=-1)
page("DFD level 1 — land acquisition", "Khasra → diligence → deal → approval → payments / plots → registry", d.svg(),
	 "DFD level 1 — land acquisition: khasras and co-owners, due diligence, the deal (iqrar nama), approval and invoices, seller payments, plot adjustments, registry and capitalisation.")

# ================================================================ 6. Land purchase process flow
f = Flow()
f.box("l1", 90, 90, "Khasra identified\n(mauza, khewat)", "staff", w=120)
f.box("l2", 235, 90, "Co-owners & shares\nfrom the fard", "erp", w=125)
f.box("l3", 385, 90, "Under negotiation\n(rate per Kanal)", "role", w=125)
f.box("l4", 535, 90, "Due diligence:\nfard, mutation, CNIC…", "erp", w=130)
f.diamond("l5", 690, 90, "Mandatory\nchecks ok?", w=115)
f.box("l6", 850, 90, "Admin override\nwith reason", "staff", w=120)
f.box("m1", 90, 230, "Token (bayana)\n= advance", "role", w=120)
f.box("m2", 235, 230, "Iqrar nama: owner\nlines, terms", "erp", w=125)
f.diamond("m3", 385, 230, "All sellers &\nwitnesses signed?", w=130, h=66)
f.box("m4", 535, 230, "Executed —\nsubmit for approval", "erp", w=130)
f.box("m5", 690, 230, "Approved: purchase\ninvoice per owner", "staff", w=135)
f.box("m6", 850, 230, "Schedule per seller\n(token…registry)", "erp", w=125)
f.box("n1", 90, 370, "Payment (cheque /\npay order), WHT", "role", w=120)
f.diamond("n2", 235, 370, "Above\nRs 5 M?", w=100)
f.box("n3", 385, 370, "Admin / Accounts\napprove", "staff", w=125)
f.box("n4", 535, 370, "Payment Entry\nagainst invoices", "erp", w=130)
f.box("n5", 690, 370, "Extension? extra\ninvoice + new date", "erp", w=135)
f.box("n6", 850, 370, "Plots instead of\ncash (approved)", "role", w=125)
f.box("o1", 300, 480, "Registry / mutation\ndone for every owner", "role", w=140)
f.box("o2", 520, 480, "Khasra Acquired →\nproject boundary", "end", w=150)
f.box("o3", 740, 480, "Capitalise to project\nland cost (JE)", "end", w=150)
for a, b in (("l1", "l2"), ("l2", "l3"), ("l3", "l4"), ("l4", "l5"), ("m1", "m2"), ("m2", "m3"), ("m4", "m5"), ("m5", "m6"),
			 ("n1", "n2"), ("n3", "n4"), ("n4", "n5"), ("n5", "n6"), ("o1", "o2"), ("o2", "o3")):
	f.arrow(a, b)
f.arrow("l5", "l6", label="no")
f.arrow("l5", "m1", "b", "t", label="yes", via=[(690, 160), (90, 160)], lx=10, ly=-6)
f.arrow("l6", "m1", "b", "t", via=[(850, 160), (90, 160)], dashed=True)
f.arrow("m3", "m4", label="yes")
f.arrow("m3", "m2", "b", "b", label="no — wait", via=[(385, 280), (235, 280)], ly=10)
f.arrow("m6", "n1", "b", "t", via=[(850, 300), (90, 300)])
f.arrow("n2", "n3", label="yes")
f.arrow("n2", "n4", "b", "b", label="no — pay", via=[(235, 412), (535, 412)], ly=10)
f.arrow("n6", "o1", "b", "t", via=[(850, 438), (300, 438)])
f.legend([("staff", "Approval / override"), ("role", "Land Manager / seller"), ("erp", "ERP step"), ("end", "Result")])
page("Land purchase process flow", "From a khasra on the ground to land cost in the project", f.svg(),
	 "Land purchase process flow — co-owners from the fard, due diligence gate, the iqrar nama, approval and invoices, seller payments, registry and capitalisation.")

# ================================================================ 7-8. Sales & booking
d = context("3–4", "Sales &\nbooking", [
	("agent", "Sales agent / dealer", "leads, calls,\nvisits, booking", "own pipeline,\ncommission"),
	("mgr", "Sales Manager", "discount approval", "pipeline,\nsales by block"),
	("plots", "Plot inventory (2.0)", "available plots,\nprices", "plot = Booked"),
	("docs", "Documents (9.0)", "", "allotment letter,\nschedule, agreement"),
	("acc", "Accounts", "", "Sales Invoice\nwith schedule"),
	("wa", "WhatsApp", "incoming chat,\nlocation pin", "templates,\nvisit invites"),
	("buyer", "Prospect / buyer", "enquiry, CNIC,\nnominee, plan", "visit invite,\nallotment, schedule"),
])
page("DFD level 0 — sales & booking", "Leads, site visits, bookings and their invoices", d.svg(),
	 "DFD level 0 — sales & booking in context: buyers, agents and dealers, the Sales Manager, WhatsApp, plot inventory, accounts and documents.")

d = Diagram()
d.entity("buyer", 62, Y1, "Buyer", w=90)
d.process("s1", 205, Y1, "3.1", "Lead &\nfollow-up")
d.process("s2", 395, Y1, "3.2", "Site visit")
d.process("s3", 585, Y1, "3.3", "Deal\npipeline")
d.process("s4", 775, Y1, "4.1", "Booking")
d.process("s7", 205, Y2, "4.4", "Allotment &\ndocuments")
d.process("s6", 500, Y2, "4.3", "Discount\napproval")
d.process("s5", 775, Y2, "4.2", "Schedule &\ninvoice")
d.store("t1", 395, YS, "D3", "Leads, calls, visits, deals", w=440)
d.store("t2", 925, YS, "D2", "Plots & prices", w=140)
d.store("t3", 520, YL, "D5", "Sales Invoice + payment schedule (ledger)", w=640)
d.hflow("buyer", "s1", "enquiry")
d.hflow("s1", "s2", "invite")
d.hflow("s2", "s3", "visited")
d.hflow("s3", "s4", "won → customer")
d.vflow("s1", "t1", "lead, calls", x=205, lside=1)
d.vflow("s2", "t1", "visit result", x=395, lside=1)
d.vflow("s3", "t1", "stage", x=585, lside=1)
d.route("t2", "s4", [(925, Y1)], "plot, list price", seg=0, lside=1)
d.vflow("s4", "s5", "submit", x=775, lside=1)
d.hflow("s5", "s6", "discount > 5%", y=Y2 - 12)
d.hflow("s6", "s5", "approved", y=Y2 + 12, above=False)
d.vflow("s5", "t3", "invoice + schedule", x=775, lside=1)
d.route("s5", "s7", [(775, 398), (205, 398)], "", seg=1)
d.note(470, 408, "booking submitted", 8.8, "#1d4ed8", "middle", 500)
d.route("s7", "buyer", [(62, Y2)], "allotment letter\n(EN / UR)", seg=1, lside=1)
page("DFD level 1 — sales & booking", "Lead → visit → deal → booking → schedule & invoice → allotment", d.svg(),
	 "DFD level 1 — sales & booking: leads and follow-ups, site visits, the deal pipeline, booking, discount approval, the schedule and Sales Invoice, allotment.")

# ================================================================ 9-10. Collections & recovery
d = context("5", "Collections\n& recovery", [
	("rec", "Recovery Officer", "calls, promises,\nwaiver requests", "overdue list,\ndunning"),
	("acc", "Accounts", "receipts entered", "Payment Entries,\ncollection summary"),
	("wa", "WhatsApp / SMS", "delivery status", "reminders, receipts,\noverdue notices"),
	("book", "Bookings (4.0)", "installments due", "paid, overdue,\nplot Sold"),
	("mgr", "Accounts Manager", "waiver approval", "aging"),
	("bank", "Bank", "clearance", "deposits"),
	("owner", "Plot owner", "payment, promise\nto pay", "receipt, reminders,\nnotices"),
])
page("DFD level 0 — collections & recovery", "Receipts, reminders, surcharges and dunning", d.svg(),
	 "DFD level 0 — collections & recovery in context: plot owners, recovery officers, accounts, bank, messaging, approvals and bookings.")

d = Diagram()
d.entity("owner", 62, Y1, "Plot\nowner", w=90, h=42)
d.process("r1", 215, Y1, "5.1", "Receipt")
d.process("r2", 430, Y1, "5.2", "Allocate\noldest first")
d.process("r3", 700, Y1, "5.3", "Reminders")
d.process("r6", 330, Y2, "5.6", "Waiver\n(approval)")
d.process("r5", 560, Y2, "5.5", "Surcharge")
d.process("r4", 820, Y2, "5.4", "Recovery &\ndunning")
d.store("u1", 360, YS, "D4", "Receipts & allocations", w=190)
d.store("u2", 720, YS, "D3", "Bookings & installments", w=230)
d.store("u3", 520, YL, "D5", "Payment Entries, surcharge invoices, credit notes, Dunning", w=800)
d.hflow("owner", "r1", "payment")
d.hflow("r1", "r2", "amount")
d.vflow("r2", "u1", "allocations", x=430, lside=-1)
d.route("r2", "u2", [(520, 150), (630, 150)], "paid per installment", seg=1)
d.vflow("u2", "r3", "due in 3 days", x=700, lside=1)
d.route("r3", "owner", [(700, 28), (62, 28)], "reminders · WhatsApp, SMS fallback", seg=1)
d.vflow("u2", "r4", "overdue", x=820, lside=1)
d.route("u2", "r5", [(640, 265), (560, 265)], "overdue > 15 days", seg=1)
d.hflow("r5", "r6", "waiver request")
d.vflow("r6", "u3", "credit note", x=330, lside=-1)
d.vflow("r5", "u3", "surcharge invoice", x=560, lside=1)
d.vflow("r4", "u3", "Dunning", x=820, lside=1)
d.vflow("r1", "u3", "Payment Entry", x=195, lside=-1)
page("DFD level 1 — collections & recovery", "Receipt → allocation → reminders → surcharge → dunning → waiver", d.svg(),
	 "DFD level 1 — collections & recovery: receipts allocated oldest-due first, reminders, monthly surcharge, recovery and dunning, waivers with approval.")

# ================================================================ 11. Post-sale operations (level 1)
d = Diagram()
d.entity("owner", 62, Y1, "Owner /\nnew buyer", w=96, h=42)
d.process("o1", 215, Y1, "6.1", "Transfer")
d.process("o2", 430, Y1, "6.2", "Cancellation\n& refund")
d.process("o3", 645, Y1, "6.3", "Re-allotment")
d.process("o4", 860, Y1, "6.4", "Plot merge")
d.entity("mgr", 70, Y2, "Sales\nManager", w=96, h=42)
d.process("o6", 300, Y2, "6.6", "Approval\nworkflow")
d.process("o5", 650, Y2, "6.5", "Commissions")
d.store("v1", 330, YS, "D3", "Bookings", w=270)
d.store("v2", 750, YS, "D2", "Plots & map", w=240)
d.store("v3", 520, YL, "D5", "Fee invoices, credit notes, refunds, commission payouts", w=800)
d.hflow("owner", "o1", "request")
d.hflow("o2", "o3", "plot released")
d.vflow("o1", "v1", "new owner", x=215, lside=1)
d.vflow("o2", "v1", "cancelled", x=430, lside=1)
d.vflow("o3", "v2", "re-booked", x=645, lside=1)
d.vflow("o4", "v2", "merged plot", x=860, lside=-1)
d.hflow("mgr", "o6", "approve / reject")
d.vflow("o6", "v1", "approved changes", x=300, lside=-1)
d.route("v1", "o5", [(430, 265), (650, 265)], "paid ≥ 25%", seg=1)
d.vflow("o6", "v3", "fee invoice, credit notes,\nrefund", x=300, lside=1)
d.vflow("o5", "v3", "commission voucher", x=650, lside=1)
page("DFD level 1 — post-sale operations", "Transfers, cancellations, re-allotments, merges and commissions — all approved", d.svg(),
	 "DFD level 1 — post-sale operations: transfer (no-dues check), cancellation and refund, re-allotment, plot merge, commissions — each through the approval workflow.")

# ================================================================ 12-13. Society & maintenance
d = context("7", "Society &\nmaintenance", [
	("sm", "Society Manager", "charge heads,\nplans, collection", "defaulters,\nincome vs expense"),
	("tech", "Technician", "job updates,\nphotos", "assigned tasks"),
	("acc", "Accounts", "society expenses", "invoices,\nPayment Entries"),
	("plots", "Occupied plots (2.0)", "plot size, type", ""),
	("map", "Map & infrastructure", "feature status", "job location"),
	("wa", "WhatsApp", "complaint message", "bill, job done"),
	("owner", "Plot owner (portal)", "complaints,\npayments", "monthly bill,\njob done"),
])
page("DFD level 0 — society & maintenance", "Monthly bills, collection, complaints and planned maintenance", d.svg(),
	 "DFD level 0 — society & maintenance in context: owners, the Society Manager, technicians, WhatsApp, accounts, map features and occupied plots.")

d = Diagram()
d.entity("owner", 62, Y1, "Plot\nowner", w=90, h=42)
d.process("w1", 220, Y1, "7.1", "Charge\nheads")
d.process("w2", 430, Y1, "7.2", "Monthly\nbilling")
d.process("w3", 640, Y1, "7.3", "Bulk\ncollection")
d.process("w4", 850, Y1, "7.4", "Defaulters &\nreminders")
d.process("w5", 300, Y2, "7.5", "Complaint\njobs")
d.process("w6", 560, Y2, "7.6", "Planned\nmaintenance")
d.entity("tech", 900, Y2, "Technician", w=100)
d.store("x1", 430, YS, "D6", "Society bills & charges", w=200)
d.store("x2", 640, YS, "D4", "Receipts", w=120)
d.store("x3", 520, YL, "D7", "Tasks, maintenance plans  ·  D5 ledger", w=800)
d.hflow("w1", "w2", "rates")
d.vflow("w2", "x1", "bill + arrears", x=450, lside=1)
d.route("w2", "owner", [(410, 150), (62, 150)], "monthly bill (WhatsApp)", seg=1)
d.route("owner", "w3", [(62, 28), (640, 28)], "payments", seg=1)
d.vflow("w3", "x2", "receipts", x=640, lside=1)
d.route("x1", "w4", [(500, 238), (850, 238)], "unpaid bills", seg=1)
d.vflow("w4", "x3", "reminders, dunning", x=820, lside=-1)
d.route("owner", "w5", [(62, Y2)], "complaint (portal / WhatsApp)", seg=1, lside=1)
d.route("w5", "tech", [(330, 268), (900, 268)], "assigned job", seg=1, lside=-1)
d.vflow("w5", "x3", "task", x=300, lside=-1)
d.vflow("w6", "x3", "planned tasks", x=560, lside=1)
page("DFD level 1 — society & maintenance", "Charge heads → bills → collection → defaulters · complaints → jobs", d.svg(),
	 "DFD level 1 — society & maintenance: charge heads, monthly billing with arrears, bulk collection, defaulters, complaint jobs and planned maintenance.")

# ================================================================ 14. Development & assets (level 1)
d = Diagram()
d.entity("pm", 62, Y1, "Projects\nManager", w=96, h=42)
d.process("y1", 220, Y1, "8.1", "Cost heads\n& budgets")
d.process("y2", 430, Y1, "8.2", "Material\nrequest & PO")
d.process("y3", 640, Y1, "8.3", "Receipt into\nsite store")
d.entity("sup", 890, Y1, "Suppliers &\ncontractors", w=120, h=42)
d.process("y6", 220, Y2, "8.6", "Land cost\n(from 1.0)")
d.process("y5", 450, Y2, "8.5", "Assets &\ndepreciation")
d.process("y4", 680, Y2, "8.4", "Issue to\ncost head")
d.store("z1", 220, YS, "D8", "Projects & budgets", w=180)
d.store("z2", 640, YS, "D8", "Site store stock", w=180)
d.store("z3", 520, YL, "D5", "Purchase invoices, stock entries, assets, land cost  →  budget vs actual", w=820)
d.hflow("pm", "y1", "heads, budgets")
d.hflow("y1", "y2", "approved head")
d.route("y2", "sup", [(430, 28), (890, 28)], "purchase order", seg=1)
d.hflow("sup", "y3", "goods, bills")
d.vflow("y1", "z1", "budget", x=220, lside=1)
d.vflow("y3", "z2", "stock in", x=640, lside=-1)
d.vflow("z2", "y4", "issue", x=680, lside=1)
d.vflow("z1", "y6", "Land & Legal head", x=220, lside=1)
d.vflow("y6", "z3", "land cost", x=220, lside=1)
d.vflow("y5", "z3", "depreciation", x=450, lside=1)
d.vflow("y4", "z3", "consumption", x=680, lside=1)
page("DFD level 1 — development, stock & assets", "Cost heads as Projects with budgets; buying, stock, assets and land cost", d.svg(),
	 "DFD level 1 — development: cost heads and budgets, material requests and POs, receipts into the site store, issues to cost heads, assets with depreciation and the land cost from Module 0.")


# ================================================================ render
CSS = """
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box} body{margin:0;font-family:'Noto Sans','Segoe UI',Arial,sans-serif;color:#14213d;background:#fff}
.pg{width:297mm;height:210mm;padding:9mm 9mm 6mm;page-break-after:always;display:flex;flex-direction:column}
.pg:last-child{page-break-after:auto}
.bar{background:#13213a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 7mm;height:13mm;border-radius:1mm}
.bar h1{font-size:15pt;margin:0;font-weight:700} .bar span{font-size:9.5pt;color:#cbd5e1}
.body{flex:1;display:flex;align-items:center;justify-content:center;padding-top:3mm} .body svg{width:100%;height:auto;max-height:172mm}
.cap{text-align:center;font-size:8.6pt;color:#475569;margin-top:2mm}
.cover{justify-content:center;align-items:flex-start;padding:24mm 26mm;background:linear-gradient(135deg,#13213a,#1e3a5f);color:#fff}
.cover .eyebrow{font-size:10pt;letter-spacing:.18em;text-transform:uppercase;color:#93c5fd;font-weight:700}
.cover h1{font-size:34pt;margin:5mm 0 4mm;line-height:1.1} .cover p{font-size:12pt;color:#dbeafe;max-width:190mm;margin:0 0 3mm}
.cover ol{columns:2;font-size:10.5pt;color:#e2e8f0;margin-top:8mm;padding-left:5mm;line-height:1.75}
"""


def build():
	os.makedirs(OUT, exist_ok=True)
	toc = "".join(f"<li>{t}</li>" for t, *_r in pages)
	cover = f"""<section class="pg cover"><div class="eyebrow">Zarmeen Gardens · Real Estate ERP · guide</div><h1>Process flow &amp; DFD</h1>
	<p>The whole system as data flow diagrams (level 0 and level 1), the process flows from khasra to collected installment and of land
	purchase, and a level 0 / level 1 pair for every area: land, sales, collections, post-sale, society and development.</p>
	<p style="color:#93c5fd;font-size:10pt">Circles are processes, light-blue boxes are people or systems outside the ERP, green open boxes are data stores (D1–D8), arrows are data flows.</p>
	<ol>{toc}</ol></section>"""
	body = "".join(f"""<section class="pg"><div class="bar"><h1>{t}</h1><span>{s}</span></div><div class="body">{svg}</div>
	<div class="cap">{i} · {c}</div></section>""" for i, (t, s, svg, c) in enumerate(pages, 1))
	src = os.path.join(OUT, "_dfd.html")
	with open(src, "w") as fh:
		fh.write(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{cover}{body}</body></html>')
	pdf = os.path.join(OUT, "Zarmeen-Process-Flow-and-DFD.pdf")
	subprocess.run(["node", os.path.join(HERE, "print.mjs"), src, pdf, "landscape"], check=True)
	print("wrote", pdf, len(pages) + 1, "pages")


if __name__ == "__main__":
	build()
