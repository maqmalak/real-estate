import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, get_first_day, getdate, today

from realestate.calc import row_status
from realestate.real_estate.doctype.re_booking.re_booking import money


class RESocietyBill(Document):
	def validate(self):
		self.billing_month = get_first_day(self.billing_month)
		self.bill_month_label = getdate(self.billing_month).strftime("%B %Y")
		dup = frappe.db.exists("RE Society Bill", {"plot": self.plot, "billing_month": self.billing_month, "name": ("!=", self.name)})
		if dup:
			frappe.throw(_("Plot {0} already has bill {1} for {2}").format(self.plot, dup, self.bill_month_label))
		self.refresh_status()

	def refresh_status(self):
		self.total_amount = sum(flt(c.amount) for c in self.charges)
		self.arrears = flt(frappe.db.sql("""select sum(outstanding_amount) from `tabRE Society Bill`
			where plot = %s and billing_month < %s and name != %s""", (self.plot, self.billing_month, self.name or ""))[0][0])
		self.outstanding_amount = self.total_amount - flt(self.paid_amount)
		window = cint(frappe.db.get_single_value("RE Settings", "due_window_days") or 7)
		self.status = row_status(flt(self.total_amount), flt(self.paid_amount), getdate(self.due_date), getdate(today()), window)
		self.total_payable = flt(self.outstanding_amount) + flt(self.arrears)
		self.fmt_total = money(self.total_amount)

	def on_trash(self):
		from realestate.erp import cancel

		if frappe.db.exists("RE Payment", {"society_bill": self.name, "docstatus": 1}):
			frappe.throw(_("Cancel the receipts of this bill first"))
		cancel("Sales Invoice", self.sales_invoice)

	def update_status(self):
		self.refresh_status()
		self.db_update()

	def after_insert(self):
		from realestate.erp import bill_invoice
		from realestate.whatsapp.channel import notify

		self.db_set("sales_invoice", bill_invoice(self))
		if not self.flags.silent:
			frappe.enqueue(notify, enqueue_after_commit=True, reminder_type="Society Bill",
						   reference_doctype=self.doctype, reference_name=self.name)
