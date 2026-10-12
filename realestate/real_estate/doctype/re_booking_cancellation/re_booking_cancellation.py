import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate.calc import cancellation


class REBookingCancellation(Document):
	def validate(self):
		b = frappe.get_doc("RE Booking", self.booking)
		if b.docstatus != 1 or b.get("cancellation") and b.cancellation != self.name:
			frappe.throw(_("Booking {0} is not active").format(self.booking))
		self.plot, self.customer = b.plot, b.customer
		if self.deduction_percent is None:
			self.deduction_percent = frappe.db.get_single_value("RE Settings", "cancellation_deduction_percent")
		# settle on the invoice the current owner holds (the whole booking unless the plot was transferred)
		total, outstanding = frappe.db.get_value("Sales Invoice", b.sales_invoice, ["grand_total", "outstanding_amount"]) if b.sales_invoice \
			else (b.net_price, b.outstanding_amount)
		self.net_price, self.paid_amount = flt(total), flt(total) - flt(outstanding)
		r = cancellation(self.net_price, self.paid_amount, flt(self.deduction_percent))
		self.deduction_amount, self.refund_amount = r["deduction"], r["refund"]
		self.refund_mode = self.refund_mode or "Bank Transfer"

	def on_submit(self):
		from realestate.erp import credit_note, refund_entry

		b = frappe.get_doc("RE Booking", self.booking)
		if b.sales_invoice:
			# 1) clear what the customer still owed  2) credit the refund on its own note and pay it out
			outstanding = flt(frappe.db.get_value("Sales Invoice", b.sales_invoice, "outstanding_amount"))
			if outstanding > 0.5:
				self.db_set("credit_note", credit_note(b.sales_invoice, outstanding, self.cancellation_date, f"Booking {b.name} cancelled ({self.name})"))
			if flt(self.refund_amount) > 0.5:
				refund_note = credit_note(b.sales_invoice, flt(self.refund_amount), self.cancellation_date, f"Refund on cancellation {self.name}", own_outstanding=1)
				self.db_set("credit_note", self.credit_note or refund_note)
				self.db_set("refund_entry", refund_entry(refund_note, flt(self.refund_amount), self.refund_mode, self.cancellation_date, f"Refund {self.name}"))
		b.db_set({"cancellation": self.name, "status": "Cancelled"})
		plot = frappe.get_doc("RE Plot", b.plot)
		if plot.booking == b.name:
			plot.status = "Available"
			plot.flags.ignore_permissions = True
			plot.save()
		from realestate.commissions import reverse

		for c in frappe.get_all("RE Commission", {"booking": b.name, "status": ("in", ["Accrued", "Payable"])}, pluck="name"):
			reverse(frappe.get_doc("RE Commission", c))  # also cancels the accrual journal
		b.add_comment("Info", _("Booking cancelled: deduction {0}, refund {1} ({2})").format(self.deduction_amount, self.refund_amount, self.name))

	def on_cancel(self):
		frappe.throw(_("A completed cancellation cannot be reversed — make a new booking instead"))
