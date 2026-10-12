"""Daily jobs: refresh dues, monthly society bills, installment reminders and overdue notices."""

import frappe
from frappe.utils import add_days, add_months, cint, flt, get_first_day, getdate, today

from realestate.whatsapp.channel import notify

BILL_CHARGES = [("Maintenance", None), ("Security", 800), ("Garbage Collection", 300), ("Water", 500)]


def daily():
	refresh_dues()
	vault_alerts()
	settings = frappe.get_cached_doc("RE Settings")
	if getdate(today()).day == (cint(settings.bill_day_of_month) or 1):
		generate_society_bills()
	send_installment_reminders()
	send_overdue_notices()


def refresh_dues(as_of=None):
	"""Statuses move with the calendar: Due becomes Overdue once a due date passes."""
	for name in frappe.get_all("RE Booking", {"docstatus": 1, "status": ("!=", "Paid")}, pluck="name"):
		doc = frappe.get_doc("RE Booking", name)
		snapshot = lambda d: (d.status, flt(d.overdue_amount), d.next_due_date, tuple(r.status for r in d.installments))  # noqa: E731
		before = snapshot(doc)
		doc.refresh_totals(as_of)
		if before != snapshot(doc):
			doc.update_payment_status(as_of)
	window = cint(frappe.db.get_single_value("RE Settings", "due_window_days") or 7)
	horizon = add_days(as_of or today(), window)  # Unpaid -> Due inside the window, Due -> Overdue after the date
	for name in frappe.get_all("RE Society Bill", {"status": ("in", ["Unpaid", "Partly Paid", "Due"]), "due_date": ("<=", horizon)}, pluck="name"):
		frappe.get_doc("RE Society Bill", name).update_status()
	frappe.db.commit()


@frappe.whitelist()
def generate_society_bills(month=None, silent=False):
	"""One bill per booked / sold plot for the month (skips plots already billed)."""
	frappe.only_for(("System Manager", "Sales Manager", "Accounts User"))
	month = get_first_day(month or today())
	due_days = cint(frappe.db.get_single_value("RE Settings", "bill_due_days")) or 15
	made = 0
	month_end = add_days(add_months(month, 1), -1)
	heads = [frappe.get_doc("RE Charge Head", h) for h in frappe.get_all("RE Charge Head", {"enabled": 1}, pluck="name", order_by="sequence asc")]
	for plot in frappe.get_all("RE Plot", {"status": ("in", ["Booked", "Sold"]), "customer": ("is", "set")}, ["name", "customer", "plot_size", "booking"]):
		if frappe.db.exists("RE Society Bill", {"plot": plot.name, "billing_month": month}):
			continue
		if plot.booking and getdate(frappe.db.get_value("RE Booking", plot.booking, "booking_date")) > getdate(month_end):
			continue  # not sold yet in that month
		if heads:
			charges = [{"charge": h.charge_name, "charge_head": h.name, "amount": h.amount_for(plot.name)} for h in heads]
			charges = [c for c in charges if c["amount"]]
		else:
			maintenance = flt(frappe.db.get_value("RE Plot Size", plot.plot_size, "monthly_maintenance")) or 2000
			charges = [{"charge": c, "amount": a if a is not None else maintenance} for c, a in BILL_CHARGES]
		bill = frappe.get_doc({
			"doctype": "RE Society Bill", "plot": plot.name, "customer": plot.customer, "billing_month": month,
			"due_date": add_days(month, due_days), "charges": charges,
		})
		bill.flags.silent = silent
		bill.insert(ignore_permissions=True)
		made += 1
	frappe.db.commit()
	return made


def _already_sent(reminder_type, reference_name, since):
	return frappe.db.exists("RE Reminder Log", {"reminder_type": reminder_type, "reference_name": reference_name,
												"for_date": (">=", since), "status": ("!=", "Failed")})


def send_installment_reminders(as_of=None):
	days = cint(frappe.db.get_single_value("RE Settings", "installment_reminder_days")) or 3
	due_on = add_days(as_of or today(), days)
	rows = frappe.db.sql("""select distinct b.name from `tabRE Booking` b join `tabRE Installment` i on i.parent = b.name
		where b.docstatus = 1 and i.due_date = %s and i.status in ('Unpaid', 'Partly Paid', 'Due')""", due_on)
	for (name,) in rows:
		if not _already_sent("Installment Reminder", name, as_of or today()):
			notify("Installment Reminder", "RE Booking", name, for_date=as_of)
	frappe.db.commit()


def send_overdue_notices(as_of=None):
	every = cint(frappe.db.get_single_value("RE Settings", "overdue_notice_every_days")) or 7
	since = add_days(as_of or today(), -(every - 1))
	for name in frappe.get_all("RE Booking", {"docstatus": 1, "status": "Overdue"}, pluck="name"):
		if not _already_sent("Overdue Notice", name, since):
			notify("Overdue Notice", "RE Booking", name, for_date=as_of)
	frappe.db.commit()


def vault_alerts():
	"""Expiring NOCs / approvals / registry documents: refresh status and alert the responsible person once a week."""
	from realestate.real_estate.doctype.re_vault_document.re_vault_document import status_of

	managers = {u for u in frappe.get_all("Has Role", {"role": "Sales Manager", "parenttype": "User"}, pluck="parent") if u not in ("Administrator", "Guest")}
	for d in frappe.get_all("RE Vault Document", ["name", "title", "expiry_date", "renewal_alert_days", "status", "responsible", "last_alert_on"]):
		status = status_of(d.expiry_date, d.renewal_alert_days)
		if status != d.status:
			frappe.db.set_value("RE Vault Document", d.name, "status", status)
		if status in ("Expiring Soon", "Expired") and (not d.last_alert_on or getdate(d.last_alert_on) <= getdate(add_days(today(), -7))):
			for user in ({d.responsible} if d.responsible else managers):
				frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "document_type": "RE Vault Document",
								"document_name": d.name, "subject": f"{d.title}: {status.lower()} ({d.expiry_date})"}).insert(ignore_permissions=True)
			frappe.db.set_value("RE Vault Document", d.name, "last_alert_on", today())
	frappe.db.commit()


def phase_b_daily():
	generate_surcharges()
	recovery_dunnings()
	for c in frappe.get_all("RE Commission", {"status": "Accrued"}, pluck="name"):
		frappe.get_doc("RE Commission", c).update_status()
	frappe.db.commit()


def generate_surcharges(as_of=None):
	"""One late-payment surcharge (Sales Invoice) per overdue booking per month, after the grace period."""
	from realestate.calc import surcharge

	s = frappe.get_cached_doc("RE Settings")
	if not s.surcharge_enabled:
		return 0
	as_of = getdate(as_of or today())
	month = get_first_day(as_of)
	made = 0
	for b in frappe.get_all("RE Booking", {"docstatus": 1, "status": "Overdue", "cancellation": ("is", "not set")},
							["name", "overdue_amount", "overdue_since"]):
		if frappe.db.exists("RE Surcharge", {"booking": b.name, "month": month}):
			continue
		days = (as_of - getdate(b.overdue_since)).days if b.overdue_since else 0
		amount = surcharge(flt(b.overdue_amount), days, cint(s.surcharge_grace_days), flt(s.surcharge_percent), flt(s.surcharge_cap_percent), flt(s.surcharge_minimum))
		if amount <= 0:
			continue
		frappe.get_doc({"doctype": "RE Surcharge", "booking": b.name, "month": month, "days_late": days, "overdue_amount": b.overdue_amount,
						"rate": s.surcharge_percent, "amount": amount}).insert(ignore_permissions=True)
		made += 1
	frappe.db.commit()
	return made


def recovery_dunnings(as_of=None):
	"""ERPNext Dunning notices for overdue bookings (Recovery Officer's queue); resolved by ERPNext when paid."""
	from realestate.erp import dunning_for

	for name in frappe.get_all("RE Booking", {"docstatus": 1, "status": "Overdue", "cancellation": ("is", "not set")}, pluck="name"):
		try:
			dunning_for(frappe.get_doc("RE Booking", name), as_of)
		except Exception:
			frappe.log_error(title=f"Dunning for {name}")
	frappe.db.commit()
