"""End-to-end check of land accounting on a site (everything is rolled back):

	bench --site realestate execute realestate.tests.land_accounting_check.run

Approval invoices, token advance, approval above the limit with withholding tax, extensions, plot adjustment and its
reversal, added / cancelled owners with a refund, capitalisation, and the deal vs Creditors - Land Owners reconciliation.
"""
import frappe, traceback
from frappe.utils import add_days, nowdate, flt
from frappe.model.workflow import apply_workflow

def ok(cond, msg): print(("PASS " if cond else "FAIL ") + msg)

def run():
	try: _run()
	except Exception: traceback.print_exc()
	finally: frappe.db.rollback()

def gl(voucher):
	out = {}
	for r in frappe.get_all("GL Entry", {"voucher_no": voucher, "is_cancelled": 0}, ["account", "debit", "credit"]):
		d, c = out.get(r.account, (0, 0)); out[r.account] = (d + r.debit, c + r.credit)
	return out

def owner(name, cnic):
	return frappe.get_doc({"doctype": "RE Land Owner", "owner_name": name, "relation": "S/O", "father_name": "Ghulam Rasool", "cnic": cnic, "mobile_no": "03001234567"}).insert()

def pay(deal, ser, amount, kind="Installment", wht=0):
	p = frappe.get_doc({"doctype": "RE Land Payment", "deal": deal, "ser": ser, "amount": amount, "payment_kind": kind, "mode_of_payment": "Cheque",
		"instrument_no": "CHQ-1", "wht_rate": wht, "received_by_seller": 1}).insert()
	if p.approval_required:
		apply_workflow(p, "Submit for Approval"); p.reload(); apply_workflow(p, "Approve")
	else:
		apply_workflow(p, "Pay")
	p.reload(); return p

def _run():
	from realestate import land_accounts as A
	s = frappe.get_cached_doc("RE Settings")
	a, b, c = owner("Falak Sher", "3520188888801"), owner("Aalam Sher", "3520188888802"), owner("Bashir Ahmad", "3520188888803")
	p = frappe.get_doc({"doctype": "RE Land Parcel", "mauza": "Test", "khasra_nos": "501", "area_kanal": 70, "owners": [
		{"land_owner": a.name, "share_kanal": 18, "share_marla": 10}, {"land_owner": b.name, "share_kanal": 24, "share_marla": 14}, {"land_owner": c.name, "share_kanal": 20}]}).insert()
	for ch in p.checks: ch.status = "Verified"
	p.save()
	d = frappe.get_doc({"doctype": "RE Land Deal", "deal_date": nowdate(), "description": "Accounting test", "registry_deadline": add_days(nowdate(), 90),
		"lines": [{"land_owner": a.name, "parcel": p.name, "kanal": 18, "marla": 10, "unit": "Acre", "rate": 25_000_000},
				  {"land_owner": b.name, "parcel": p.name, "marla": 494, "unit": "Marla", "rate": 178_125}]}).insert()

	tok = pay(d.name, 1, 1_000_000, "Token")
	d.reload()
	ok(tok.docstatus == 1 and tok.payment_entry and d.lines[0].paid_amount == 1_000_000 and d.lines[0].balance == 56_812_500, f"token before approval -> advance {tok.payment_entry}, line paid {d.lines[0].paid_amount:,.0f}")
	try:
		frappe.get_doc({"doctype": "RE Land Payment", "deal": d.name, "ser": 1, "amount": 1000, "payment_kind": "Installment", "mode_of_payment": "Cash"}).insert()
		ok(False, "installment before approval blocked")
	except Exception as e: ok("token" in str(e).lower(), "installment before approval blocked"); frappe.clear_messages()

	apply_workflow(d, "Submit for Approval"); d.reload(); apply_workflow(d, "Approve"); d.reload()
	pis = {l.ser: l.purchase_invoice for l in d.lines}
	pi1 = frappe.get_doc("Purchase Invoice", pis[1])
	ok(d.workflow_state == "Approved" and all(pis.values()), f"approval posted invoices {list(pis.values())}")
	ok(pi1.grand_total == 57_812_500 and pi1.credit_to == s.land_creditors_account and pi1.items[0].expense_account == s.land_cwip_account,
	   f"PI1 {pi1.grand_total:,.0f} Dr {pi1.items[0].expense_account} Cr {pi1.credit_to}")
	ok(abs(A.owner_balance(a.supplier) - 56_812_500) < 1, f"owner A ledger {A.owner_balance(a.supplier):,.0f} = deal balance {d.lines[0].balance:,.0f}")

	big = pay(d.name, 1, 10_000_000, wht=5)
	g = gl(big.payment_entry)
	ok(big.approval_required and big.workflow_state == "Paid", f"10M above limit -> approval -> {big.workflow_state}")
	ok(g.get(s.land_creditors_account, (0, 0))[0] == 10_000_000 and g.get(s.land_wht_account, (0, 0))[1] == 500_000, f"PE GL {g}")
	d.reload()
	ok(d.lines[0].paid_amount == 11_000_000 and abs(A.owner_balance(a.supplier) - d.lines[0].balance) < 1, f"A paid {d.lines[0].paid_amount:,.0f}, ledger {A.owner_balance(a.supplier):,.0f} = {d.lines[0].balance:,.0f}")

	d.request_extension(2, 500_000, str(add_days(nowdate(), 150)), "More time"); d.reload()
	d.decide_extension(d.extensions[-1].name, 1); d.reload()
	e = d.extensions[-1]
	ok(e.purchase_invoice and d.lines[1].net_due == 88_493_750 and abs(A.owner_balance(b.supplier) - d.lines[1].balance) < 1,
	   f"extension PI {e.purchase_invoice}; B net due {d.lines[1].net_due:,.0f} = ledger {A.owner_balance(b.supplier):,.0f}")
	r = A.reconciliation(); ok(r["matches"], f"reconciliation gl {r['gl_balance']:,.0f} vs deals {r['deal_balances']:,.0f}")

	plots = frappe.get_all("RE Plot", {"status": "Available", "list_price": (">", 0)}, ["name", "list_price"], order_by="list_price asc", limit=2)
	adj = frappe.get_doc({"doctype": "RE Plot Adjustment", "deal": d.name, "ser": 2, "plots": [{"plot": x.name} for x in plots]}).insert()
	apply_workflow(adj, "Submit for Approval"); adj.reload(); apply_workflow(adj, "Approve"); adj.reload(); d.reload()
	total = sum(x.list_price for x in plots)
	bk = frappe.get_doc("RE Booking", adj.plots[0].booking)
	plot0 = frappe.db.get_value("RE Plot", plots[0].name, ["status", "land_adjustment", "customer"], as_dict=True)
	ok(adj.docstatus == 1 and d.lines[1].adjusted_amount == total, f"adjusted {d.lines[1].adjusted_amount:,.0f} for {len(plots)} plots")
	ok(bk.status == "Paid" and plot0.status == "Sold" and plot0.land_adjustment == adj.name, f"booking {bk.name} {bk.status}, plot {plot0.status} tagged")
	ok(frappe.db.get_value("RE Land Owner", b.name, "customer") and frappe.db.exists("Party Link", {"primary_party": b.supplier}), "owner became customer + party link")
	si_out = frappe.db.get_value("Sales Invoice", bk.sales_invoice, "outstanding_amount")
	ok(si_out == 0 and abs(A.owner_balance(b.supplier) - d.lines[1].balance) < 1, f"plot invoice settled; B ledger {A.owner_balance(b.supplier):,.0f} = {d.lines[1].balance:,.0f}")
	r = A.reconciliation(); ok(r["matches"], f"reconciliation after adjustment diff {r['difference']}")
	apply_workflow(adj, "Cancel"); adj.reload(); d.reload()
	ok(adj.docstatus == 2 and d.lines[1].adjusted_amount == 0 and frappe.db.get_value("RE Plot", plots[0].name, "status") == "Available",
	   "adjustment cancel reversed (plot Available, adjusted 0)")

	d.request_amendment("Add Seller", "C joins", data={"owner": c.name, "parcel": p.name, "kanal": 20, "unit": "Kanal", "rate": 3_000_000}); d.reload()
	d.decide_amendment(d.amendments[-1].name, 1); d.reload()
	ok(d.lines[2].purchase_invoice and frappe.db.get_value("Purchase Invoice", d.lines[2].purchase_invoice, "grand_total") == 60_000_000, "added seller invoiced 60,000,000")
	d.request_amendment("Partial Cancellation", "A withdrew", ser=1); d.reload()
	d.decide_amendment(d.amendments[-1].name, 1); d.reload()
	ok(d.lines[0].status == "Cancelled" and d.lines[0].balance == -11_000_000 and abs(A.owner_balance(a.supplier) + 11_000_000) < 1,
	   f"A cancelled: balance {d.lines[0].balance:,.0f} (refund due), ledger {A.owner_balance(a.supplier):,.0f}")
	r = A.reconciliation(); ok(r["matches"], f"reconciliation with refund due diff {r['difference']}")
	ref = pay(d.name, 1, 11_000_000, "Refund Received"); d.reload()
	ok(ref.docstatus == 1 and d.lines[0].balance == 0 and abs(A.owner_balance(a.supplier)) < 1, "refund received -> A settled")

	for l in d.lines[1:]:
		pay(d.name, l.ser, flt(l.balance))
	d.reload()
	for l in d.lines[1:]: l.status = "Registry Done"; l.signed = 1
	d.witness_1_signed = d.witness_2_signed = 1
	d.save()
	ok(d.status == "Completed", f"executed and registered -> {d.status}")
	ok(d.balance_amount == 0, f"all paid & registered -> {d.status}, balance {d.balance_amount}")
	je = d.capitalise()
	g = gl(je)
	cwip_cost = 87_993_750 + 500_000 + 60_000_000
	ok(g.get(s.land_cost_account, (0, 0))[0] == cwip_cost, f"capitalised {g.get(s.land_cost_account)} expected {cwip_cost:,.0f}")
	r = A.reconciliation(); ok(r["matches"], f"final reconciliation gl {r['gl_balance']:,.0f} deals {r['deal_balances']:,.0f}")
	print("done")
