import frappe
from frappe.model.document import Document
from frappe.utils import flt, get_first_day, getdate


class RESurcharge(Document):
	def validate(self):
		self.month = get_first_day(self.month)
		self.month_label = getdate(self.month).strftime("%B %Y")
		self.refresh_status()

	def refresh_status(self):
		self.outstanding_amount = max(flt(self.amount) - flt(self.paid_amount) - flt(self.waived_amount), 0)
		if self.outstanding_amount < 0.5:
			self.status = "Waived" if flt(self.waived_amount) >= flt(self.amount) - 0.5 else "Paid"
		elif flt(self.waived_amount):
			self.status = "Partly Waived"
		else:
			self.status = "Partly Paid" if flt(self.paid_amount) else "Unpaid"

	def after_insert(self):
		from realestate.erp import sales_invoice

		company = frappe.db.get_single_value("RE Settings", "company")
		self.db_set("sales_invoice", sales_invoice(company, self.customer, self.month, [("SOC-SURCHARGE", self.amount, f"Late payment surcharge {self.month_label} — {self.booking}")],
												   remarks=f"Surcharge {self.name}", re_booking=self.booking, re_plot=self.plot))
		update_booking(self.booking)

	def update_status(self):
		self.refresh_status()
		self.db_update()
		update_booking(self.booking)


def update_booking(booking):
	due = flt(frappe.db.sql("select sum(outstanding_amount) from `tabRE Surcharge` where booking=%s", booking)[0][0])
	frappe.db.set_value("RE Booking", booking, "surcharge_due", due, update_modified=False)
