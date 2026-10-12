import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate.real_estate.doctype.re_plot.re_plot import notify_plots


class REPlotTransfer(Document):
	def validate(self):
		b = frappe.get_doc("RE Booking", self.booking)
		if b.docstatus != 1 or b.status == "Cancelled":
			frappe.throw(_("Only an active booking can be transferred"))
		self.from_customer, self.plot = b.customer, b.plot
		if self.to_customer == self.from_customer:
			frappe.throw(_("The new owner must be a different customer"))
		if self.transfer_fee is None:
			self.transfer_fee = frappe.db.get_single_value("RE Settings", "transfer_fee")
		self.outstanding_at_transfer = b.outstanding_amount
		self.overdue_at_transfer = flt(b.overdue_amount) + flt(b.surcharge_due)
		self.society_dues_at_transfer = flt(frappe.db.sql("select sum(outstanding_amount) from `tabRE Society Bill` where plot=%s", self.plot)[0][0])
		self.ndc_clear = int(self.overdue_at_transfer < 0.5 and self.society_dues_at_transfer < 0.5)

	def before_submit(self):
		self.validate()
		if not self.ndc_clear:
			frappe.throw(_("Clear the overdue installments, surcharges and society dues before the transfer (no-dues check)"))

	def on_submit(self):
		from realestate.erp import transfer_post

		b = frappe.get_doc("RE Booking", self.booking)
		out = transfer_post(self, b)
		self.db_set(out)
		new = frappe.db.get_value("Customer", self.to_customer, ["customer_name", "mobile_no"], as_dict=True)
		b.db_set({"customer": self.to_customer, "customer_name": new.customer_name, "mobile_no": new.mobile_no or b.mobile_no,
				  "transferred_from": self.from_customer, "sales_invoice": out.get("new_invoice") or b.sales_invoice})
		frappe.db.set_value("RE Plot", self.plot, {"customer": self.to_customer, "customer_name": new.customer_name, "mobile_no": new.mobile_no})
		notify_plots([self.plot])
		b.add_comment("Info", _("Plot transferred from {0} to {1} ({2})").format(self.from_customer_name, self.to_customer_name, self.name))

	def on_cancel(self):
		frappe.throw(_("A completed transfer cannot be cancelled — record a transfer back to the previous owner instead"))
