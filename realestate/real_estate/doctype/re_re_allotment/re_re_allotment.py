"""Re-allotment: a plot released by an approved cancellation is allotted to a new buyer.

Draft -> Pending Approval -> Approved (Sales Manager). On approval a new RE Booking is created and submitted for the new
allottee (its own Sales Invoice and schedule), linked back to the cancelled booking, and the re-allotment fee is billed
on a Sales Invoice. Cancelling is allowed only while the new booking has no receipts.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class REReallotment(Document):
	def validate(self):
		plot = frappe.db.get_value("RE Plot", self.plot, ["status", "list_price", "booking"], as_dict=True)
		if self.docstatus == 0 and plot.status not in ("Available", "Reserved"):
			frappe.throw(_("Plot {0} is {1}; only a released plot can be re-allotted").format(self.plot, plot.status))
		if not self.cancellation:
			self.cancellation = frappe.db.get_value("RE Booking Cancellation", {"plot": self.plot, "docstatus": 1}, "name", order_by="cancellation_date desc")
		if not self.cancellation:
			frappe.throw(_("Plot {0} has no approved cancellation — book it normally instead").format(self.plot))
		c = frappe.db.get_value("RE Booking Cancellation", self.cancellation, ["plot", "booking", "docstatus"], as_dict=True)
		if c.plot != self.plot or c.docstatus != 1:
			frappe.throw(_("Cancellation {0} is not an approved cancellation of plot {1}").format(self.cancellation, self.plot))
		self.previous_booking = c.booking
		self.previous_customer = frappe.db.get_value("RE Booking", c.booking, "customer")
		if self.new_customer == self.previous_customer:
			frappe.throw(_("The new allottee is the same as the previous one — amend the cancellation instead"))
		self.total_price = flt(self.total_price) or flt(plot.list_price)
		self.net_price = flt(self.total_price) - flt(self.discount)
		if self.is_new() and not flt(self.reallotment_fee):
			self.reallotment_fee = flt(frappe.db.get_single_value("RE Settings", "reallotment_fee"))

	def before_submit(self):
		from realestate.identity import require_cnic

		require_cnic(frappe._dict(customer=self.new_customer, customer_name=self.new_customer_name))

	def on_submit(self):
		self.make_booking()
		self.bill_fee()

	def make_booking(self):
		mobile, agent = frappe.db.get_value("Customer", self.new_customer, ["mobile_no", "account_manager"])
		booking = frappe.get_doc({
			"doctype": "RE Booking", "plot": self.plot, "customer": self.new_customer, "mobile_no": mobile, "booking_date": self.reallotment_date,
			"agent": self.agent or agent, "total_price": self.total_price, "discount": self.discount, "payment_plan": self.payment_plan,
			"reallotted_from": self.previous_booking, "discount_approved_by": frappe.session.user if flt(self.discount) else None,
		})
		booking.insert(ignore_permissions=True)
		booking.submit()
		self.db_set("new_booking", booking.name)
		booking.add_comment("Info", _("Plot {0} re-allotted from {1} ({2})").format(self.plot, self.previous_booking, self.name))

	def bill_fee(self):
		if flt(self.reallotment_fee) and not self.fee_invoice:
			from realestate.erp import sales_invoice

			company = frappe.db.get_single_value("RE Settings", "company")
			self.db_set("fee_invoice", sales_invoice(company, self.new_customer, self.reallotment_date,
													 [("RE-REALLOT-FEE", flt(self.reallotment_fee), f"Re-allotment of plot {self.plot}")],
													 remarks=f"Re-allotment {self.name}", re_plot=self.plot))

	def on_cancel(self):
		from realestate.erp import cancel

		if self.new_booking and frappe.db.exists("RE Payment", {"booking": self.new_booking, "docstatus": 1}):
			frappe.throw(_("Booking {0} already has receipts; cancel the booking through a cancellation instead").format(self.new_booking))
		if self.fee_invoice:
			cancel("Sales Invoice", self.fee_invoice)
		if self.new_booking:
			frappe.get_doc("RE Booking", self.new_booking).cancel()
