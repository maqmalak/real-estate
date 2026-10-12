import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate

from realestate.calc import commission, commission_status


class RECommission(Document):
	def validate(self):
		b = frappe.db.get_value("RE Booking", self.booking, ["net_price", "plot"], as_dict=True)
		self.plot = b.plot
		self.base_amount = flt(b.net_price)
		self.amount = commission(self.base_amount, flt(self.rate))
		self.beneficiary = frappe.utils.get_fullname(self.agent) if self.beneficiary_type == "Agent" else self.sales_partner

	def after_insert(self):
		from realestate.erp import acc, journal

		company = frappe.db.get_single_value("RE Settings", "company")
		self.db_set("accrual_entry", journal(company, frappe.db.get_value("RE Booking", self.booking, "booking_date") or nowdate(),
											 f"Commission accrued {self.name} — {self.beneficiary}, booking {self.booking}",
											 [(acc(company, "Commission on Sales"), self.amount, 0, acc(company, "ZG Common Infrastructure")),
											  (acc(company, "Commissions Payable"), 0, self.amount, acc(company, "ZG Common Infrastructure"))]))
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
	def pay(self, mode_of_payment: str = "Bank Transfer", posting_date: str | None = None):
		frappe.only_for(("System Manager", "Accounts User", "Accounts Manager", "Sales Manager"))
		self.update_status()
		if self.status != "Payable":
			frappe.throw(_("Commission is {0}, not payable yet").format(self.status))
		from realestate.erp import acc, journal

		company = frappe.db.get_single_value("RE Settings", "company")
		account = frappe.db.get_value("Mode of Payment Account", {"parent": mode_of_payment, "company": company}, "default_account")
		day = posting_date or nowdate()
		je = journal(company, day, f"Commission paid {self.name} — {self.beneficiary}",
					 [(acc(company, "Commissions Payable"), self.amount, 0, acc(company, "ZG Common Infrastructure")),
					  (account, 0, self.amount, acc(company, "ZG Common Infrastructure"))])
		self.db_set({"payment_entry": je, "status": "Paid", "paid_on": day, "payment_mode": mode_of_payment})
		return je
