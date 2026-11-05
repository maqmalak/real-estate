"""Module 0 acceptance criteria (spec §9), checked against the live data. Read-only; part of `bench re-acceptance`
and the React /re/acceptance page (realestate.acceptance.CHECKS)."""

import frappe
from frappe.utils import cint, flt

from realestate import land
from realestate import land_calc as L

PASS, WARN, FAIL = "pass", "warn", "fail"
ACQUIRED = ("Registry / Mutation Done", "Possession Taken", "Acquired")


def _r(key, title, status, detail, evidence=None):
	return {"key": key, "title": title, "status": status, "detail": detail, "evidence": evidence or []}


def check_land_shares():
	"""Co-owner shares add up to each khasra's area; khasras and acquired land against the project's total land"""
	ms = land.marla_sqft()
	bad, ev = [], []
	parcels = frappe.get_all("RE Land Parcel", {}, ["name", "khasra_nos", "area_sqft", "stage", "project"], limit=0)
	if not parcels:
		return _r("land_shares", check_land_shares.__doc__, WARN, "No khasras recorded yet")
	shares = {}
	for o in frappe.get_all("RE Parcel Owner", {"parenttype": "RE Land Parcel"}, ["parent", "share_sqft_total"], limit=0):
		shares[o.parent] = shares.get(o.parent, 0) + flt(o.share_sqft_total)
	for p in parcels:
		if p.name in shares and abs(shares[p.name] - flt(p.area_sqft)) > 1:
			bad.append(f"Khasra {p.khasra_nos}: shares {L.fmt_area(shares[p.name], ms)} ≠ fard {L.fmt_area(p.area_sqft, ms)}")
	without = [p.khasra_nos for p in parcels if p.name not in shares]
	project = frappe.db.get_single_value("RE Settings", "default_project")
	target = flt(frappe.db.get_value("RE Project", project, "total_area_kanal")) if project else 0
	total = sum(L.in_unit(flt(p.area_sqft), "Kanal", ms) for p in parcels)
	acquired = sum(L.in_unit(flt(p.area_sqft), "Kanal", ms) for p in parcels if p.stage in ACQUIRED)
	ev += [f"{len(parcels)} khasras = {total:.2f} Kanal; project total land {target:g} Kanal",
		   f"Acquired {acquired:.2f} Kanal ({acquired * 100 / target:.1f}%)" if target else f"Acquired {acquired:.2f} Kanal"]
	if without:
		ev.append(f"No co-owners entered for: {', '.join(without[:10])}")
	if bad:
		return _r("land_shares", check_land_shares.__doc__, FAIL, f"{len(bad)} khasras whose shares do not match the fard", bad[:20] + ev)
	if total > acquired + 0.01:
		ev.append(f"{total - acquired:.2f} Kanal more is in the pipeline (not yet acquired)")
	if target and acquired + 0.01 < target:
		return _r("land_shares", check_land_shares.__doc__, WARN, f"Shares match every fard; {target - acquired:.1f} Kanal of the project's land still being acquired", ev)
	if target and acquired > target + 0.01:
		return _r("land_shares", check_land_shares.__doc__, WARN, f"Acquired {acquired:.2f} Kanal is more than the project's {target:g} Kanal — merge it into the boundary or record it", ev)
	return _r("land_shares", check_land_shares.__doc__, PASS, "Shares match every fard and the acquired khasras make up exactly the project's land", ev)


def check_land_contracts():
	"""A multi-owner contract totals its seller lines, no khasra is oversold, and it is Executed only when every seller has signed"""
	bad = []
	deals = frappe.get_all("RE Land Deal", {"status": ("!=", "Cancelled")}, ["name", "status", "contract_total", "due_amount", "witness_1_signed", "witness_2_signed"], limit=0)
	lines = {}
	for l in frappe.get_all("RE Land Deal Line", {"parenttype": "RE Land Deal"}, ["parent", "parcel", "area_sqft", "due_amount", "status", "signed"], limit=0):
		lines.setdefault(l.parent, []).append(l)
	sold = {}
	for d in deals:
		act = [l for l in lines.get(d.name, []) if l.status != "Cancelled"]
		total = round(sum(flt(l.due_amount) for l in act), 2)
		if abs(total - flt(d.due_amount)) > 1 or (flt(d.contract_total) and abs(total - flt(d.contract_total)) > 1):
			bad.append(f"{d.name}: seller lines {total:,.0f} vs deal {flt(d.due_amount):,.0f} / agreed {flt(d.contract_total):,.0f}")
		if d.status in ("Executed", "In Payment", "Completed", "Closed") and not (all(l.signed for l in act) and d.witness_1_signed and d.witness_2_signed):
			bad.append(f"{d.name}: {d.status} but not every seller / witness has signed")
		for l in act:
			if l.parcel:
				sold[l.parcel] = sold.get(l.parcel, 0) + flt(l.area_sqft)
	for parcel, area in sold.items():
		fard = flt(frappe.db.get_value("RE Land Parcel", parcel, "area_sqft"))
		if area > fard + 1:
			bad.append(f"{frappe.db.get_value('RE Land Parcel', parcel, 'khasra_nos')}: sold {area:,.0f} sqft > fard {fard:,.0f} sqft")
	multi = sum(1 for d in deals if len([l for l in lines.get(d.name, []) if l.status != "Cancelled"]) > 1)
	ev = [f"{len(deals)} deals ({multi} with several sellers); {len(sold)} khasras under contract"]
	return _r("land_contracts", check_land_contracts.__doc__, FAIL if bad else PASS,
			  f"{len(bad)} problems" if bad else "Every contract totals its seller lines, no khasra is oversold, executed contracts are fully signed", bad[:20] + ev)


def check_land_maths():
	"""Land deal maths matches the client's report (Acre / Marla rates, Net Due = Due + Extra, Balance = Net Due − Paid, 272 sqft per Marla)"""
	bad = []
	if L.due_amount(L.to_sqft(18, 10), "Acre", 25_000_000) != 57_812_500:
		bad.append("18 Kanal 10 Marla @ 25,000,000 per Acre ≠ 57,812,500")
	if L.due_amount(L.to_sqft(0, 494), "Marla", 178_125) != 87_993_750:
		bad.append("494 Marla @ 178,125 ≠ 87,993,750")
	if L.split(L.to_sqft(36, 20)) != (37, 0, 0) or L.split(L.to_sqft(25, 15, 430)) != (25, 16, 158):
		bad.append("Area totals do not normalise (36K 20M → 37K; 25K 15M 430 sqft → 25K 16M 158 sqft)")
	ms = land.marla_sqft()
	n = 0
	for l in frappe.get_all("RE Land Deal Line", {"parenttype": "RE Land Deal", "status": ("!=", "Cancelled")},
							["parent", "ser", "kanal", "marla", "sqft", "unit", "rate", "due_amount", "extra_amount", "net_due", "paid_amount", "adjusted_amount", "balance"], limit=0):
		n += 1
		due = L.due_amount(L.to_sqft(cint(l.kanal), flt(l.marla), flt(l.sqft), ms=ms), l.unit, flt(l.rate), ms)
		if abs(due - flt(l.due_amount)) > 0.5 or abs(flt(l.net_due) - flt(l.due_amount) - flt(l.extra_amount)) > 0.5 \
				or abs(flt(l.balance) - (flt(l.net_due) - flt(l.paid_amount) - flt(l.adjusted_amount))) > 0.5:
			bad.append(f"{l.parent}/{l.ser}: due {flt(l.due_amount):,.2f} (expected {due:,.2f}), net {flt(l.net_due):,.2f}, balance {flt(l.balance):,.2f}")
	return _r("land_maths", check_land_maths.__doc__, FAIL if bad else PASS,
			  f"{len(bad)} lines off" if bad else f"Client examples and all {n} owner lines recompute exactly ({ms:g} sqft per Marla)", bad[:20])


def check_land_ledger():
	"""Every land owner's Net Due, Paid (cash), Adjusted (plots) and Balance equal their Supplier ledger; deal balances equal Creditors - Land Owners"""
	from realestate.land_accounts import owner_balance, reconciliation

	if not frappe.db.get_single_value("RE Settings", "land_creditors_account"):
		return _r("land_ledger", check_land_ledger.__doc__, WARN, "Land accounting is not set up (RE Settings → Land)")
	invoiced = set(frappe.get_all("Purchase Invoice", {"re_land_deal": ("is", "set"), "docstatus": 1}, pluck="re_land_deal"))
	expected = {}
	for l in frappe.db.sql("""select l.supplier, l.parent, l.balance, l.paid_amount, l.adjusted_amount from `tabRE Land Deal Line` l
			join `tabRE Land Deal` d on d.name=l.parent where d.status!='Cancelled' and l.supplier is not null""", as_dict=True):
		part = flt(l.balance) if l.parent in invoiced else -(flt(l.paid_amount) + flt(l.adjusted_amount))
		expected[l.supplier] = expected.get(l.supplier, 0) + part
	bad = []
	for supplier, exp in expected.items():
		gl = owner_balance(supplier)
		if abs(gl - exp) > 1:
			bad.append(f"{supplier}: deals say {exp:,.0f}, ledger says {gl:,.0f}")
	r = reconciliation()
	ev = [f"{len(expected)} owners checked", f"Deal balances {r['deal_balances']:,.0f} vs {r['creditors_account']} {r['gl_balance']:,.0f}"]
	if not r["matches"]:
		bad.append(f"Total differs by {r['difference']:,.0f}")
	return _r("land_ledger", check_land_ledger.__doc__, FAIL if bad else PASS,
			  f"{len(bad)} owners differ from the ledger" if bad else "Every owner's deal figures equal their supplier ledger, and the totals reconcile", bad[:20] + ev)


def check_plot_adjustments():
	"""A plot adjustment reduces the owner's payable and marks the plot sold in one approved step; cancelling it reverses both"""
	bad, n = [], 0
	for a in frappe.get_all("RE Plot Adjustment", {"docstatus": ("in", [1, 2])}, ["name", "docstatus", "applied_amount"], limit=0):
		rows = frappe.get_all("RE Plot Adjustment Plot", {"parent": a.name}, ["plot", "receipt", "booking"])
		if a.docstatus == 1:
			n += 1
			adjusted = 0.0
			for r in rows:
				p = frappe.db.get_value("RE Plot", r.plot, ["status", "land_adjustment"], as_dict=True)
				if p.land_adjustment != a.name or p.status not in ("Booked", "Sold", "Possession Given"):
					bad.append(f"{a.name}: plot {r.plot} is {p.status} / tagged {p.land_adjustment or 'nothing'}")
				if r.receipt:
					je = frappe.db.get_value("RE Payment", r.receipt, "journal_entry")
					if not je or frappe.db.get_value("Journal Entry", je, "docstatus") != 1:
						bad.append(f"{a.name}: receipt {r.receipt} has no submitted Journal Entry")
					adjusted += flt(frappe.db.get_value("RE Payment", r.receipt, "amount"))
			if abs(adjusted - flt(a.applied_amount)) > 1:
				bad.append(f"{a.name}: receipts {adjusted:,.0f} ≠ adjusted {flt(a.applied_amount):,.0f}")
		else:
			for r in rows:
				if frappe.db.get_value("RE Plot", r.plot, "land_adjustment") == a.name:
					bad.append(f"{a.name} is cancelled but plot {r.plot} is still tagged to it")
	if not n and not bad:
		return _r("plot_adjustments", check_plot_adjustments.__doc__, WARN, "No plot adjustments yet")
	return _r("plot_adjustments", check_plot_adjustments.__doc__, FAIL if bad else PASS,
			  f"{len(bad)} problems" if bad else f"{n} adjustments: plots booked to their owners and netted by Journal Entries", bad[:20])


def check_seller_schedules():
	"""Seller payments per owner match their share of the agreed price"""
	bad, n = [], 0
	sched = {}
	for s in frappe.get_all("RE Land Deal Schedule", {"parenttype": "RE Land Deal", "status": ("!=", "Refund")}, ["parent", "ser", "label", "amount"], limit=0):
		k = (s.parent, cint(s.ser))
		d = sched.setdefault(k, {"base": 0.0, "ext": 0.0})
		d["ext" if s.label == "Extension" else "base"] += flt(s.amount)
	for l in frappe.get_all("RE Land Deal Line", {"parenttype": "RE Land Deal", "status": ("!=", "Cancelled")}, ["parent", "ser", "due_amount", "extra_amount"], limit=0):
		d = sched.get((l.parent, cint(l.ser)))
		if not d:
			continue
		n += 1
		if abs(d["base"] - flt(l.due_amount)) > 1 or abs(d["ext"] - flt(l.extra_amount)) > 1:
			bad.append(f"{l.parent}/{l.ser}: schedule {d['base']:,.0f} + ext {d['ext']:,.0f} vs share {flt(l.due_amount):,.0f} + extra {flt(l.extra_amount):,.0f}")
	return _r("seller_schedules", check_seller_schedules.__doc__, FAIL if bad else PASS if n else WARN,
			  f"{len(bad)} schedules off" if bad else f"{n} sellers' schedules equal their share of the price (and approved extensions)" if n else "No seller schedules yet", bad[:20])


def check_land_cost_module2():
	"""Land cost in Module 2 (project land cost) matches Module 0"""
	s = frappe.get_cached_doc("RE Settings")
	if not (s.land_cost_account and s.land_cwip_account):
		return _r("land_cost", check_land_cost_module2.__doc__, WARN, "Land accounting is not set up")
	bad, ev, total = [], [], 0.0
	for d in frappe.get_all("RE Land Deal", {"status": ("in", ["Completed", "Closed"])}, ["name", "capitalisation_entry"], limit=0):
		cwip = flt(frappe.db.sql("""select sum(i.base_net_amount) from `tabPurchase Invoice Item` i join `tabPurchase Invoice` p on p.name=i.parent
			where p.re_land_deal=%s and p.docstatus=1 and i.expense_account=%s""", (d.name, s.land_cwip_account))[0][0])
		if not d.capitalisation_entry:
			ev.append(f"{d.name}: completed, Rs {cwip:,.0f} still in {s.land_cwip_account}")
			continue
		cap = flt(frappe.db.sql("select sum(debit) from `tabGL Entry` where voucher_no=%s and account=%s and is_cancelled=0", (d.capitalisation_entry, s.land_cost_account))[0][0])
		total += cap
		if abs(cap - cwip) > 1:
			bad.append(f"{d.name}: capitalised {cap:,.0f} ≠ land cost {cwip:,.0f}")
	gl = flt(frappe.db.sql("""select sum(g.debit - g.credit) from `tabGL Entry` g join `tabJournal Entry` j on j.name=g.voucher_no
		where g.account=%s and g.is_cancelled=0 and j.re_land_deal is not null""", s.land_cost_account)[0][0])
	ev.insert(0, f"Capitalised to {s.land_cost_account}: Rs {total:,.0f} (ledger Rs {gl:,.0f})")
	if abs(gl - total) > 1:
		bad.append(f"{s.land_cost_account} from land deals {gl:,.0f} ≠ capitalised {total:,.0f}")
	status = FAIL if bad else WARN if len(ev) > 1 else PASS
	detail = f"{len(bad)} differences" if bad else "Capitalised land cost equals each deal's purchase cost" + ("; some completed deals are not capitalised yet" if len(ev) > 1 else "")
	return _r("land_cost", check_land_cost_module2.__doc__, status, detail, bad[:20] + ev[:20])


CHECKS = [check_land_shares, check_land_contracts, check_land_maths, check_land_ledger, check_plot_adjustments, check_seller_schedules, check_land_cost_module2]
