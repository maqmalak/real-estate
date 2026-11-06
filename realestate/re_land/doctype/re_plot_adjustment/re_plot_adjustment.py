import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate import land

FULL_PLAN = "Full Payment"


class REPlotAdjustment(Document):
	"""Plots given to a land owner instead of cash. On approval each plot is booked to the owner (as a Customer) and a
	"Land Deal Adjustment" receipt nets the plot's invoice against the owner's land payable — no cash moves. Cancelling
	reverses the receipts and bookings and returns the plots to Available."""

	def validate(self):
		deal = frappe.get_doc("RE Land Deal", self.deal)
		if deal.workflow_state != "Approved":
			frappe.throw(_("Approve land deal {0} before adjusting plots against it").format(deal.name))
		line = deal._line(self.ser)
		if line.status == "Cancelled":
			frappe.throw(_("{0} is cancelled from this deal").format(line.owner_name))
		self.land_owner, self.owner_name, self.supplier = line.land_owner, line.owner_name, line.supplier
		self.customer = frappe.db.get_value("RE Land Owner", line.land_owner, "customer")
		seen = set()
		for r in self.plots:
			if r.plot in seen:
				frappe.throw(_("Plot {0} is listed twice").format(r.plot))
			seen.add(r.plot)
			p = frappe.db.get_value("RE Plot", r.plot, ["status", "list_price", "block", "plot_size"], as_dict=True)
			if self.docstatus == 0 and p.status != "Available":
				frappe.throw(_("Plot {0} is {1}, not Available").format(r.plot, p.status))
			r.list_price, r.block, r.plot_size = p.list_price, p.block, p.plot_size
			if not flt(r.agreed_value):
				r.agreed_value = p.list_price
		self.value_changed = int(any(abs(flt(r.agreed_value) - flt(r.list_price)) > 0.5 for r in self.plots))
		self.total_value = round(sum(flt(r.agreed_value) for r in self.plots), 2)
		if self.docstatus == 0:
			self.line_balance = flt(line.balance)
		self.applied_amount = round(min(self.total_value, max(flt(self.line_balance), 0)), 2)
		self.excess_receivable = round(max(self.total_value - flt(self.line_balance), 0), 2)
		self.remaining_payable = round(max(flt(self.line_balance) - self.total_value, 0), 2)
		if self.applied_amount <= 0.5:
			frappe.throw(_("{0} has no balance left to adjust").format(line.owner_name))
		if self.excess_receivable > 0.5 and not self.payment_plan:
			frappe.throw(_("The plots are worth Rs {0} more than the owner's balance — choose a payment plan for the excess").format(
				frappe.utils.fmt_money(self.excess_receivable, 0)))

	def on_submit(self):
		from realestate.land_accounts import ADJUSTMENT_MODE

		customer = self._customer()
		left = self.applied_amount
		for r in self.plots:
			value = flt(r.agreed_value)
			use = min(left, value)
			plan = FULL_PLAN if use >= value - 0.5 else (self.payment_plan or FULL_PLAN)
			booking = frappe.get_doc({"doctype": "RE Booking", "plot": r.plot, "customer": customer, "booking_date": self.posting_date,
									  "total_price": value, "discount": 0, "payment_plan": plan})
			booking.flags.ignore_permissions = True
			booking.insert()
			booking.submit()
			receipt = None
			if use > 0.5:
				rc = frappe.get_doc({"doctype": "RE Payment", "payment_against": "Booking", "booking": booking.name, "posting_date": self.posting_date,
									 "mode_of_payment": ADJUSTMENT_MODE, "amount": use, "land_adjustment": self.name, "reference_no": self.name,
									 "send_receipt": 0,  # no cash changed hands: the adjustment memo is the owner's document
									 "remarks": _("Adjusted against land deal {0} ({1})").format(self.deal, self.owner_name)})
				rc.flags.ignore_permissions = True
				rc.insert()
				rc.submit()
				receipt = rc.name
				left = round(left - use, 2)
			r.db_set({"booking": booking.name, "receipt": receipt})
			frappe.db.set_value("RE Plot", r.plot, {"land_adjustment": self.name, "land_deal": self.deal, "society_exempt": 0 if self.charges_apply else 1})
		frappe.get_doc("RE Land Deal", self.deal).refresh_ledger()
		self._documents()

	def _documents(self):
		"""Allotment letter per plot, the adjustment memo and the owner's updated statement (versioned PDFs)."""
		from realestate.documents import generate

		jobs = [("Allotment Letter", r.booking) for r in self.plots if r.booking] + [("Plot Adjustment Memo", self.name), ("Land Owner Statement", self.land_owner)]
		for document_type, name in jobs:
			try:
				generate(document_type, name)
			except Exception:
				frappe.log_error(title=f"Plot adjustment {self.name}: {document_type} not generated")

	def on_cancel(self):
		self.ignore_linked_doctypes = ("RE Booking", "RE Payment", "Journal Entry", "GL Entry", "Payment Ledger Entry")
		for r in reversed(self.plots):
			if r.receipt and frappe.db.get_value("RE Payment", r.receipt, "docstatus") == 1:
				doc = frappe.get_doc("RE Payment", r.receipt)
				doc.flags.ignore_permissions = True
				doc.ignore_linked_doctypes = ("WhatsApp Message", "RE Reminder Log", "Communication", "Journal Entry", "GL Entry", "Payment Ledger Entry")
				doc.cancel()
			if r.booking and frappe.db.get_value("RE Booking", r.booking, "docstatus") == 1:
				if frappe.db.exists("RE Payment", {"booking": r.booking, "docstatus": 1}):
					frappe.throw(_("Booking {0} has other receipts — cancel them first").format(r.booking))
				doc = frappe.get_doc("RE Booking", r.booking)
				doc.flags.ignore_permissions = True
				doc.ignore_linked_doctypes = ("WhatsApp Message", "RE Reminder Log", "Communication", "RE Commission", "Sales Invoice", "GL Entry", "Payment Ledger Entry")
				doc.cancel()
			frappe.db.set_value("RE Plot", r.plot, {"land_adjustment": None, "land_deal": None, "society_exempt": 0})
		frappe.get_doc("RE Land Deal", self.deal).refresh_ledger()

	def _customer(self) -> str:
		"""The owner as a Customer (created with their CNIC when missing) and linked to their Supplier."""
		owner = frappe.get_doc("RE Land Owner", self.land_owner)
		if owner.customer:
			return owner.customer
		if not owner.cnic:
			frappe.throw(_("{0} needs a CNIC before plots can be booked to them").format(owner.display_name))
		customer = frappe.db.get_value("Customer", {"re_cnic": owner.cnic}, "name")
		if not customer:
			c = frappe.get_doc({"doctype": "Customer", "customer_name": owner.owner_name, "customer_type": "Individual",
								"customer_group": frappe.db.get_single_value("Selling Settings", "customer_group") or "Individual",
								"territory": frappe.db.get_single_value("Selling Settings", "territory") or "Pakistan",
								"re_cnic": owner.cnic, "re_father_name": owner.father_name, "mobile_no": owner.mobile_no,
								**({"re_demo": 1} if owner.get("is_demo") else {})})
			c.flags.ignore_permissions = True
			c.insert()
			customer = c.name
		owner.db_set("customer", customer)
		land.ensure_party_link(owner.supplier, customer)
		self.db_set("customer", customer)
		return customer
