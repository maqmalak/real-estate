import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate


class RESurchargeWaiver(Document):
	def validate(self):
		s = frappe.get_doc("RE Surcharge", self.surcharge)
		self.surcharge_outstanding = s.outstanding_amount
		if flt(self.amount) <= 0 or flt(self.amount) > flt(s.outstanding_amount) + 0.5:
			frappe.throw(_("Waiver must be between 1 and the outstanding surcharge {0}").format(s.outstanding_amount))

	def on_submit(self):
		from realestate.erp import credit_note

		s = frappe.get_doc("RE Surcharge", self.surcharge)
		self.db_set("credit_note", credit_note(s.sales_invoice, flt(self.amount), nowdate(), f"Surcharge waiver {self.name}: {self.reason[:80]}"))
		s.waived_amount = flt(s.waived_amount) + flt(self.amount)
		s.update_status()

	def on_cancel(self):
		from realestate.erp import cancel

		cancel("Sales Invoice", self.credit_note)
		s = frappe.get_doc("RE Surcharge", self.surcharge)
		s.waived_amount = flt(s.waived_amount) - flt(self.amount)
		s.update_status()
