import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate import land


class RELandPayment(Document):
	"""A payment to a land owner (cheque, pay order, bank transfer or cash) or a refund received from a cancelled owner.
	Posts a Payment Entry against the owner's invoices; payments above the limit in RE Settings need Admin / Accounts
	approval (RE Land Payment Approval workflow)."""

	def validate(self):
		deal = frappe.get_doc("RE Land Deal", self.deal)
		line = deal._line(self.ser)
		self.land_owner, self.owner_name, self.supplier = line.land_owner, line.owner_name, line.supplier
		if not self.supplier:
			frappe.throw(_("Owner {0} has no supplier yet — save the owner record first").format(line.owner_name))
		if deal.status == "Cancelled":
			frappe.throw(_("Land deal {0} is cancelled").format(deal.name))
		amount = flt(self.amount)
		if amount <= 0:
			frappe.throw(_("Amount must be positive"))
		self.balance_before = flt(line.balance)
		if self.payment_kind == "Refund Received":
			if line.status != "Cancelled" or self.balance_before >= -0.5:
				frappe.throw(_("A refund is received only from a cancelled owner who was paid (balance {0})").format(frappe.utils.fmt_money(self.balance_before, 0)))
			if amount > -self.balance_before + 0.5:
				frappe.throw(_("The refund due is only Rs {0}").format(frappe.utils.fmt_money(-self.balance_before, 0)))
			self.wht_rate = self.wht_amount = 0
			self.balance_after = round(self.balance_before + amount, 2)
		else:
			if line.status == "Cancelled":
				frappe.throw(_("{0} is cancelled from this deal").format(line.owner_name))
			if deal.workflow_state != "Approved" and self.payment_kind != "Token":
				frappe.throw(_("Only the token (bayana) can be paid before the deal is approved"))
			if amount > self.balance_before + 0.5:
				frappe.throw(_("Amount is more than {0}'s balance of Rs {1}").format(line.owner_name, frappe.utils.fmt_money(self.balance_before, 0)))
			if flt(self.wht_rate) and not flt(self.wht_amount):
				self.wht_amount = round(amount * flt(self.wht_rate) / 100, 2)
			if flt(self.wht_amount) >= amount:
				frappe.throw(_("Withholding tax must be less than the amount"))
			self.balance_after = round(self.balance_before - amount, 2)
		self.net_paid = round(amount - flt(self.wht_amount), 2)
		limit = flt(frappe.db.get_single_value("RE Settings", "land_payment_approval_limit"))
		self.approval_required = int(bool(limit) and amount > limit)
		if self.received_by_seller and not self.seller_signed_on:
			self.seller_signed_on = frappe.utils.nowdate()

	def on_submit(self):
		from realestate import land_accounts

		self.db_set("payment_entry", land_accounts.payment_entry(self))
		frappe.get_doc("RE Land Deal", self.deal).refresh_ledger()

	def on_cancel(self):
		from realestate.erp import cancel

		self.ignore_linked_doctypes = ("Payment Entry", "GL Entry", "Payment Ledger Entry")
		cancel("Payment Entry", self.payment_entry)
		frappe.get_doc("RE Land Deal", self.deal).refresh_ledger()
