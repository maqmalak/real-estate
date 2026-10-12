"""Payment plan and terms on the plot Sales Invoices.

* Every RE Payment Plan has a matching ERPNext **Payment Terms Template** (same name), kept in sync when the plan is saved.
  Its rows are the plan's parts as portions of the price, due N days after the invoice date (a sample year — months vary),
  so the plan reads correctly in ERPNext. A booking invoice still carries the booking's *exact* schedule; ERPNext keeps a
  supplied schedule and does not regenerate it from the template.
* Plot invoices get the **"Plot Booking Terms"** Terms and Conditions with the text filled in for that booking: plot,
  price, payment plan and schedule span, and the society policies from RE Settings (surcharge, possession, transfer and
  cancellation)."""

import frappe
from frappe import _
from frappe.utils import date_diff, flt, fmt_money, formatdate, getdate

from realestate.calc import plan_schedule

TERMS_NAME = "Plot Booking Terms"


def _rs(v):
	return fmt_money(flt(v), precision=0, currency="PKR")


def sync_plan_template(plan_name: str) -> str | None:
	"""Create / update the Payment Terms Template for a plan; returns its name."""
	plan = frappe.get_doc("RE Payment Plan", plan_name)
	start = getdate("2026-01-01")
	rows = {}
	sample = 100_000_000.0  # large sample price: the schedule rounds amounts, so a small one would round to zero
	for label, due, amount in plan_schedule(sample, start, None, plan.to_plan()):
		r = rows.setdefault(str(due), {"due": getdate(due), "portion": 0.0, "labels": []})
		r["portion"] += flt(amount) * 100 / sample
		r["labels"].append(_(label))
	if not rows:
		return None
	terms = [{"description": " + ".join(r["labels"])[:140], "invoice_portion": round(r["portion"], 6),
			  "due_date_based_on": "Day(s) after invoice date", "credit_days": max(0, date_diff(r["due"], start))} for r in rows.values()]
	drift = round(100 - sum(t["invoice_portion"] for t in terms), 6)
	terms[-1]["invoice_portion"] = round(terms[-1]["invoice_portion"] + drift, 6)  # portions must total exactly 100
	doc = frappe.get_doc("Payment Terms Template", plan.name) if frappe.db.exists("Payment Terms Template", plan.name) else frappe.new_doc("Payment Terms Template")
	doc.template_name = plan.name
	doc.allocate_payment_based_on_payment_terms = 0
	doc.set("terms", terms)
	doc.flags.ignore_permissions = True
	doc.save()
	return doc.name


def ensure_terms_template() -> str:
	"""The selling Terms and Conditions record (generic text; each invoice gets its own filled-in copy)."""
	if not frappe.db.exists("Terms and Conditions", TERMS_NAME):
		frappe.get_doc({"doctype": "Terms and Conditions", "title": TERMS_NAME, "selling": 1, "buying": 0,
						"terms": policies_html()}).insert(ignore_permissions=True)
	return TERMS_NAME


def policies_html() -> str:
	s = frappe.get_cached_doc("RE Settings")
	items = []
	if s.get("surcharge_enabled"):
		items.append(_("Installments are due on the dates in the payment schedule. A late-payment surcharge of {0}% applies after a grace period of {1} days (minimum {2}, capped at {3}% of the overdue amount).")
					 .format(flt(s.surcharge_percent), s.surcharge_grace_days or 0, _rs(s.surcharge_minimum), flt(s.surcharge_cap_percent)))
	else:
		items.append(_("Installments are due on the dates in the payment schedule."))
	items += [
		_("Possession is handed over only when the full price, development charges and any dues have been paid."),
		_("A transfer to another person needs a no-dues clearance and a transfer fee of {0}.").format(_rs(s.transfer_fee)),
		_("If the booking is cancelled, {0}% of the amount paid is deducted and the balance is refunded.").format(flt(s.cancellation_deduction_percent)),
		_("Society maintenance charges are billed monthly from possession."),
		_("The allotment is subject to the society's rules and the approved layout plan."),
	]
	return "<ol>" + "".join(f"<li>{frappe.utils.escape_html(i)}</li>" for i in items) + "</ol>"


def booking_terms_html(booking) -> str:
	"""Terms text for one booking's invoice: plot, price, payment plan and schedule span, then the policies."""
	rows = sorted(booking.installments, key=lambda r: getdate(r.due_date))
	e = frappe.utils.escape_html
	head = [_("<p><b>Plot {0}</b> — {1}, {2}. Net price <b>{3}</b>{4}.</p>").format(
		e(booking.plot), e(booking.plot_size or ""), e(booking.block or ""), _rs(booking.net_price),
		_(" after a discount of {0}").format(_rs(booking.discount)) if flt(booking.discount) else "")]
	if booking.get("payment_plan"):
		desc = frappe.db.get_value("RE Payment Plan", booking.payment_plan, "description")
		head.append(_("<p><b>Payment plan: {0}</b>{1}. {2} payments from {3} to {4}, as in the payment schedule.</p>").format(
			e(booking.payment_plan), f" — {e(desc)}" if desc else "", len(rows),
			formatdate(rows[0].due_date) if rows else "", formatdate(rows[-1].due_date) if rows else ""))
	return "".join(head) + policies_html()


def apply_to_invoice(si: dict, booking) -> dict:
	"""Add the plan's terms template and the filled-in terms to a Sales Invoice dict before insert."""
	if booking.get("payment_plan"):
		si["payment_terms_template"] = sync_plan_template(booking.payment_plan) if not frappe.db.exists("Payment Terms Template", booking.payment_plan) else booking.payment_plan
	si["tc_name"] = ensure_terms_template()
	si["terms"] = booking_terms_html(booking)
	return si


def backfill():
	"""Templates for every plan, and the plan + terms on existing plot invoices (descriptive fields only — amounts,
	schedule and ledger are untouched)."""
	for p in frappe.get_all("RE Payment Plan", pluck="name"):
		sync_plan_template(p)
	ensure_terms_template()
	n = 0
	for b in frappe.get_all("RE Booking", {"docstatus": 1, "sales_invoice": ("is", "set")}, ["name", "sales_invoice"]):
		booking = frappe.get_doc("RE Booking", b.name)
		values = {"tc_name": TERMS_NAME, "terms": booking_terms_html(booking)}
		if booking.payment_plan:
			values["payment_terms_template"] = booking.payment_plan
		frappe.db.set_value("Sales Invoice", b.sales_invoice, values, update_modified=False)
		n += 1
	frappe.db.commit()
	return n
