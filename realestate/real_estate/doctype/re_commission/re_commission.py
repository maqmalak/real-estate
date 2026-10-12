import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate.calc import commission, commission_status


class RECommission(Document):
	def validate(self):
		b = frappe.db.get_value("RE Booking", self.booking, ["net_price", "plot"], as_dict=True)
		self.plot = b.plot
		self.base_amount = flt(b.net_price)
		self.amount = commission(self.base_amount, flt(self.rate))
		self.beneficiary = frappe.utils.get_fullname(self.agent) if self.beneficiary_type == "Agent" else self.sales_partner

	def after_insert(self):
		from realestate.commissions import accrue

		accrue(self)
		self.update_status()

	def update_status(self):
		if self.status == "Cancelled":
			return
		paid, net = frappe.db.get_value("RE Booking", self.booking, ["paid_amount", "net_price"])
		after = flt(frappe.db.get_single_value("RE Settings", "commission_payable_after_percent")) or 25
		status = commission_status(flt(paid), flt(net), after, bool(self.payment_entry))
		if status != self.status:
			self.db_set("status", status)

	@frappe.whitelist()
	def pay(self, mode_of_payment: str = "Bank Transfer", posting_date: str | None = None, reference_no: str | None = None,
			reference_date: str | None = None):
		"""Pay a Payable commission with a Payment Entry (printable as the Commission Payment Voucher)."""
		frappe.only_for(("System Manager", "Accounts User", "Accounts Manager", "Sales Manager"))
		self.update_status()
		if self.status != "Payable":
			frappe.throw(_("Commission is {0}, not payable yet").format(self.status))
		from realestate.commissions import pay

		return pay(self, mode_of_payment, posting_date, reference_no, reference_date)

	@frappe.whitelist()
	def cancel_commission(self):
		"""Cancel an unpaid commission and reverse its accrual journal."""
		frappe.only_for(("System Manager", "Accounts Manager", "Sales Manager"))
		from realestate.commissions import reverse

		reverse(self)
