"""Financial records are never deleted once submitted: they are cancelled (and amended), so the ledger and the
version history stay intact. Frappe already refuses to delete a submitted document; this also keeps cancelled ones."""

import frappe
from frappe import _

FINANCIAL = ("Sales Invoice", "Payment Entry", "Journal Entry", "Purchase Invoice", "Purchase Receipt", "Purchase Order",
			 "Stock Entry", "Dunning", "Asset", "RE Booking", "RE Payment", "RE Plot Transfer", "RE Booking Cancellation",
			 "RE Plot Merge", "RE Surcharge Waiver", "RE Re-allotment")


def keep_financial_records(doc, method=None):
	if doc.docstatus != 0 and not frappe.flags.in_install and not frappe.flags.in_uninstall:
		frappe.throw(_("{0} {1} is a {2} financial record and cannot be deleted. Cancel or amend it instead.").format(
			_(doc.doctype), doc.name, _("cancelled") if doc.docstatus == 2 else _("submitted")), frappe.PermissionError)


def setup():
	"""Accounts Settings must not delete ledger entries along with vouchers."""
	frappe.db.set_single_value("Accounts Settings", "delete_linked_ledger_entries", 0)
