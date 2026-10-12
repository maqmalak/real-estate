"""Agent / dealer commission accounting.

* Each beneficiary is a **Supplier** (group "Commission Agents"): a dealer's Sales Partner name, or the agent's full name.
* **Accrual** (booking submitted): Journal Entry — Dr Commission on Sales (the plot's block cost centre) / Cr
  "Agent & Dealer Commission Payable" with the supplier as party, so the ledger and Accounts Payable show who is owed.
* **Payable** once the customer has paid the threshold % of the price (RE Settings); re-checked when a receipt is
  submitted or cancelled, and nightly.
* **Payment**: a submitted **Payment Entry** (Pay → supplier) from the chosen mode's bank / cash account, allocated
  against the accrual journal; printable as the "Commission Payment Voucher".
* **Cancelling** an unpaid commission cancels its accrual journal (the expense and payable go away)."""

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

PAYABLE = "Agent & Dealer Commission Payable"
OLD_PAYABLE = "Commissions Payable"
GROUP = "Commission Agents"


def _company():
	return frappe.db.get_single_value("RE Settings", "company")


def payable_account(company=None) -> str:
	from realestate.erp import _account

	company = company or _company()
	return _account(company, PAYABLE, "Accounts Payable", account_type="Payable")


def supplier_for(c) -> str:
	"""The Supplier standing for a commission's beneficiary (created on first use, with the commission payable account)."""
	if c.get("supplier") and frappe.db.exists("Supplier", c.supplier):
		return c.supplier
	name = c.sales_partner if c.beneficiary_type == "Dealer" else (frappe.utils.get_fullname(c.agent) if c.agent else c.beneficiary)
	name = (name or "Commission Agent").strip()
	if not frappe.db.exists("Supplier Group", GROUP):
		frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": GROUP, "parent_supplier_group": "All Supplier Groups"}).insert(ignore_permissions=True)
	company = _company()
	if not frappe.db.exists("Supplier", name):
		frappe.get_doc({
			"doctype": "Supplier", "supplier_name": name, "supplier_group": GROUP,
			"supplier_type": "Company" if c.beneficiary_type == "Dealer" else "Individual",
			"accounts": [{"company": company, "account": payable_account(company)}],
		}).insert(ignore_permissions=True)
	elif not frappe.db.exists("Party Account", {"parent": name, "parenttype": "Supplier", "company": company}):
		sup = frappe.get_doc("Supplier", name)
		sup.append("accounts", {"company": company, "account": payable_account(company)})
		sup.flags.ignore_permissions = True
		sup.save()
	return name


def _je(company, posting_date, remark, lines):
	"""lines = [(account, debit, credit, cost_center, party_type, party)]"""
	je = frappe.get_doc({
		"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": posting_date, "user_remark": remark,
		"accounts": [{"account": a, "debit_in_account_currency": d, "credit_in_account_currency": cr, "cost_center": cc,
					  **({"party_type": pt, "party": p} if p else {})} for a, d, cr, cc, pt, p in lines],
	})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def _cost_center(c, company):
	from realestate.erp import acc, block_cost_center

	block = frappe.db.get_value("RE Plot", c.plot, "block") if c.plot else None
	return block_cost_center(company, block) if block else acc(company, "ZG Common Infrastructure")


def accrue(c) -> str:
	from realestate.erp import acc

	company = _company()
	sup = supplier_for(c)
	cc = _cost_center(c, company)
	day = frappe.db.get_value("RE Booking", c.booking, "booking_date") or nowdate()
	je = _je(company, day, f"Commission accrued {c.name} — {c.beneficiary}, booking {c.booking}", [
		(acc(company, "Commission on Sales"), flt(c.amount), 0, cc, None, None),
		(payable_account(company), 0, flt(c.amount), cc, "Supplier", sup),
	])
	c.db_set({"supplier": sup, "accrual_entry": je})
	return je


def pay(c, mode_of_payment: str, posting_date: str | None = None, reference_no: str | None = None, reference_date: str | None = None) -> str:
	"""Payment Entry (Pay → supplier) against the accrual journal; returns its name."""
	company = _company()
	sup = supplier_for(c)
	paid_from = frappe.db.get_value("Mode of Payment Account", {"parent": mode_of_payment, "company": company}, "default_account")
	if not paid_from:
		frappe.throw(_("Mode of payment {0} has no account for {1}").format(mode_of_payment, company))
	day = getdate(posting_date or nowdate())
	pe = frappe.new_doc("Payment Entry")
	pe.update({
		"payment_type": "Pay", "company": company, "posting_date": day, "mode_of_payment": mode_of_payment,
		"party_type": "Supplier", "party": sup, "party_name": c.beneficiary,
		"paid_from": paid_from, "paid_to": payable_account(company),
		"paid_amount": flt(c.amount), "received_amount": flt(c.amount),
		"reference_no": reference_no or c.name, "reference_date": getdate(reference_date or day),
		"cost_center": _cost_center(c, company),
		"custom_remarks": 1,
		"remarks": f"{c.beneficiary_type} commission {c.name} — {c.beneficiary}: booking {c.booking}, plot {c.plot}, {flt(c.rate)}% of {flt(c.base_amount):,.0f}",
	})
	if c.accrual_entry and frappe.db.get_value("Journal Entry", c.accrual_entry, "docstatus") == 1 and _accrual_has_party(c.accrual_entry, sup):
		pe.append("references", {"reference_doctype": "Journal Entry", "reference_name": c.accrual_entry, "allocated_amount": flt(c.amount)})
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	c.db_set({"payment_doctype": "Payment Entry", "payment_entry": pe.name, "status": "Paid", "paid_on": day,
			  "payment_mode": mode_of_payment, "reference_no": pe.reference_no})
	return pe.name


def _accrual_has_party(je, supplier):
	return frappe.db.exists("Journal Entry Account", {"parent": je, "party_type": "Supplier", "party": supplier})


def reverse(c):
	"""Cancel an unpaid commission: cancel its accrual journal and mark it Cancelled."""
	if c.status == "Paid":
		frappe.throw(_("{0} is already paid — recover it from the beneficiary instead").format(c.name))
	if c.accrual_entry and frappe.db.get_value("Journal Entry", c.accrual_entry, "docstatus") == 1:
		je = frappe.get_doc("Journal Entry", c.accrual_entry)
		je.flags.ignore_permissions = True
		je.cancel()
	c.db_set("status", "Cancelled")


def refresh_for_booking(booking: str):
	for name in frappe.get_all("RE Commission", {"booking": booking, "status": ("in", ["Accrued", "Payable"])}, pluck="name"):
		frappe.get_doc("RE Commission", name).update_status()


def migrate():
	"""One-off: move unpaid commissions from the old party-less "Commissions Payable" to the party-wise account (a
	reclassification journal per commission, which becomes its accrual entry), and reverse accruals of commissions that
	were cancelled without it. Idempotent."""
	from realestate.erp import acc

	company = _company()
	payable_account(company)
	moved = reversed_ = 0
	for c in frappe.get_all("RE Commission", ["name"], order_by="creation"):
		doc = frappe.get_doc("RE Commission", c.name)
		je = doc.accrual_entry
		on_old = je and frappe.db.exists("Journal Entry Account", {"parent": je, "account": acc(company, OLD_PAYABLE)})
		if doc.status == "Cancelled":
			if je and frappe.db.get_value("Journal Entry", je, "docstatus") == 1:
				reverse(doc)
				reversed_ += 1
			continue
		if doc.status in ("Accrued", "Payable") and on_old:
			sup = supplier_for(doc)
			cc = _cost_center(doc, company)
			new = _je(company, nowdate(), f"Reclassify commission {doc.name} — {doc.beneficiary} to party-wise payable (was {je})", [
				(acc(company, OLD_PAYABLE), flt(doc.amount), 0, cc, None, None),
				(payable_account(company), 0, flt(doc.amount), cc, "Supplier", sup),
			])
			doc.db_set({"supplier": sup, "accrual_entry": new})
			moved += 1
	frappe.db.commit()
	return {"moved": moved, "reversed": reversed_}


VOUCHER = "Commission Payment Voucher"
VOUCHER_HTML = """
{%- set coms = frappe.get_all("RE Commission", filters={"payment_entry": doc.name}, fields=["name", "beneficiary_type", "beneficiary", "booking", "plot", "rate", "base_amount", "amount"]) -%}
<style>
  .pv { font-family: Inter, Arial, sans-serif; font-size: 12px; color: #1f2937; }
  .pv h2 { margin: 0; font-size: 20px; letter-spacing: .5px; }
  .pv .muted { color: #6b7280; }
  .pv table { width: 100%; border-collapse: collapse; }
  .pv .head td { vertical-align: top; }
  .pv .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  .pv .grid td { padding: 4px 6px; }
  .pv .lines th { background: #f3f4f6; text-align: left; padding: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  .pv .lines td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
  .pv .amt { font-size: 22px; font-weight: 700; }
  .pv .sign td { padding-top: 46px; text-align: center; width: 25%; }
  .pv .sign span { display: block; border-top: 1px solid #9ca3af; margin: 0 12px; padding-top: 4px; }
  .pv .r { text-align: right; }
</style>
<div class="pv">
  <table class="head"><tr>
    <td><h2>{{ _("Commission Payment Voucher") }}</h2><div class="muted">{{ doc.company }}</div></td>
    <td class="r"><div><b>{{ doc.name }}</b></div><div class="muted">{{ frappe.utils.formatdate(doc.posting_date) }}</div>
      {% if doc.docstatus == 2 %}<div style="color:#dc2626;font-weight:700">CANCELLED</div>{% endif %}</td>
  </tr></table>

  <div class="box"><table class="grid">
    <tr><td class="muted" style="width:22%">{{ _("Paid to") }}</td><td><b>{{ doc.party_name or doc.party }}</b>
      {% if coms %}<span class="muted"> · {{ coms[0].beneficiary_type }}</span>{% endif %}</td>
      <td class="r" rowspan="2"><div class="muted">{{ _("Amount") }}</div><div class="amt">{{ frappe.utils.fmt_money(doc.paid_amount, currency=doc.paid_from_account_currency or "PKR") }}</div></td></tr>
    <tr><td class="muted">{{ _("Amount in words") }}</td><td>{{ frappe.utils.money_in_words(doc.paid_amount, doc.paid_from_account_currency or "PKR") }}</td></tr>
    <tr><td class="muted">{{ _("Mode") }}</td><td>{{ doc.mode_of_payment or "" }} · {{ _("from") }} {{ doc.paid_from }}</td><td></td></tr>
    <tr><td class="muted">{{ _("Reference") }}</td><td>{{ doc.reference_no or "" }}{% if doc.reference_date %} · {{ frappe.utils.formatdate(doc.reference_date) }}{% endif %}</td><td></td></tr>
  </table></div>

  <table class="lines" style="margin-top:14px">
    <thead><tr><th>{{ _("Commission") }}</th><th>{{ _("Booking") }}</th><th>{{ _("Plot") }}</th><th>{{ _("Customer") }}</th><th class="r">{{ _("Rate") }}</th><th class="r">{{ _("On price") }}</th><th class="r">{{ _("Amount") }}</th></tr></thead>
    <tbody>
    {% for c in coms %}
      <tr><td>{{ c.name }}</td><td>{{ c.booking }}</td><td>{{ c.plot }}</td><td>{{ frappe.db.get_value("RE Booking", c.booking, "customer_name") or "" }}</td>
        <td class="r">{{ c.rate }}%</td><td class="r">{{ frappe.utils.fmt_money(c.base_amount, currency="PKR") }}</td><td class="r"><b>{{ frappe.utils.fmt_money(c.amount, currency="PKR") }}</b></td></tr>
    {% else %}
      <tr><td colspan="7">{{ doc.remarks or "" }}</td></tr>
    {% endfor %}
    </tbody>
  </table>
  {% if doc.remarks %}<p class="muted" style="margin-top:8px">{{ doc.remarks }}</p>{% endif %}

  <table class="sign"><tr>
    <td><span>{{ _("Prepared by") }}</span></td><td><span>{{ _("Checked by") }}</span></td><td><span>{{ _("Approved by") }}</span></td><td><span>{{ _("Received by") }}</span></td>
  </tr></table>
</div>
"""


def ensure_voucher_format():
	"""Payment Entry print format for commission payments."""
	doc = frappe.get_doc("Print Format", VOUCHER) if frappe.db.exists("Print Format", VOUCHER) else frappe.new_doc("Print Format")
	doc.update({"name": VOUCHER, "doc_type": "Payment Entry", "module": "Real Estate", "standard": "No", "custom_format": 1,
				"print_format_type": "Jinja", "html": VOUCHER_HTML, "disabled": 0})
	doc.flags.ignore_permissions = True
	doc.save() if not doc.is_new() else doc.insert()
	return VOUCHER


def setup():
	payable_account()
	ensure_voucher_format()
	return migrate()


def on_payment_entry_cancel(doc, method=None):
	"""doc_events hook: cancelling a commission's Payment Entry makes the commission payable again."""
	for name in frappe.get_all("RE Commission", {"payment_doctype": "Payment Entry", "payment_entry": doc.name}, pluck="name"):
		c = frappe.get_doc("RE Commission", name)
		c.db_set({"payment_entry": None, "payment_doctype": "Journal Entry", "paid_on": None, "payment_mode": None, "reference_no": None, "status": "Accrued"})
		c.reload()
		c.update_status()
		c.add_comment("Info", _("Payment {0} cancelled — commission is {1} again").format(doc.name, c.status))
