import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from realestate.calc import Row, allocate_fifo

from realestate.real_estate.doctype.re_booking.re_booking import money


class REPayment(Document):
	def validate(self):
		if flt(self.amount) <= 0:
			frappe.throw(_("Amount must be positive"))
		if self.payment_against == "Surcharge":
			self.booking = self.society_bill = None
			s = frappe.get_doc("RE Surcharge", self.surcharge)
			self.customer, self.plot = s.customer, s.plot
			self.allocations = []
			if flt(self.amount) > flt(s.outstanding_amount) + 0.5:
				frappe.throw(_("Amount is more than the surcharge outstanding {0}").format(money(s.outstanding_amount)))
		elif self.payment_against == "Booking":
			self.society_bill = self.surcharge = None
			booking = frappe.get_doc("RE Booking", self.booking)
			if booking.docstatus != 1 or booking.get("cancellation"):
				frappe.throw(_("Booking {0} is not active").format(self.booking))
			self.customer, self.plot = booking.customer, booking.plot
			self._allocate(booking)
		else:
			self.booking = self.surcharge = None
			bill = frappe.get_doc("RE Society Bill", self.society_bill)
			self.customer, self.plot = bill.customer, bill.plot
			self.allocations = []
			if flt(self.amount) > flt(bill.outstanding_amount) + 0.5:
				frappe.throw(_("Amount is more than the bill's outstanding {0}").format(money(bill.outstanding_amount)))
			self.unallocated_amount = 0
		self.received_by = self.received_by or frappe.session.user
		self.fmt_amount = money(self.amount)

	def _allocate(self, booking):
		"""First in, first out over the unpaid installments (realestate.calc.allocate_fifo)."""
		rows = {r.name: r for r in booking.installments}
		try:
			split = allocate_fifo([Row(r.name, getdate(r.due_date), flt(r.amount), flt(r.paid_amount)) for r in booking.installments], flt(self.amount))
		except ValueError:
			frappe.throw(_("Amount is more than the booking's outstanding {0}").format(money(booking.outstanding_amount)))
		self.allocations = []
		for key, alloc in split.items():
			r = rows[key]
			self.append("allocations", {"installment": r.name, "label": r.label, "due_date": r.due_date, "allocated_amount": alloc})
		self.unallocated_amount = 0

	def on_submit(self):
		from realestate.erp import payment_entry

		self._apply(1)
		self.db_set("payment_entry", payment_entry(self))
		if self.send_receipt:
			from realestate.whatsapp.channel import notify

			frappe.enqueue(notify, enqueue_after_commit=True, reminder_type="Payment Receipt",
						   reference_doctype=self.doctype, reference_name=self.name)

	def on_cancel(self):
		from realestate.erp import cancel

		cancel("Payment Entry", self.payment_entry)
		self._apply(-1)

	def _apply(self, sign):
		if self.payment_against == "Surcharge":
			s = frappe.get_doc("RE Surcharge", self.surcharge)
			s.paid_amount = flt(s.paid_amount) + sign * flt(self.amount)
			s.update_status()
		elif self.payment_against == "Booking":
			booking = frappe.get_doc("RE Booking", self.booking)
			rows = {r.name: r for r in booking.installments}
			for a in self.allocations:
				if a.installment in rows:
					rows[a.installment].paid_amount = flt(rows[a.installment].paid_amount) + sign * flt(a.allocated_amount)
			booking.update_payment_status()
		else:
			bill = frappe.get_doc("RE Society Bill", self.society_bill)
			bill.paid_amount = flt(bill.paid_amount) + sign * flt(self.amount)
			bill.update_status()
