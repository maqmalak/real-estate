import frappe
from frappe.model.document import Document
from frappe.utils import flt


class REChargeHead(Document):
	def validate(self):
		if not self.item:
			self.item = self._make_item()

	def _make_item(self):
		code = "SOC-" + frappe.scrub(self.charge_name).upper().replace("_", "-")[:30]
		if not frappe.db.exists("Item", code):
			from realestate.erp import _item

			company = frappe.db.get_single_value("RE Settings", "company") or frappe.db.get_single_value("Global Defaults", "default_company")
			_item(company, code, self.charge_name, "Society Charges", "Nos", 0, 0)
		return code

	def amount_for(self, plot):
		"""Monthly amount of this charge for a plot (0 when it does not apply)."""
		size, ptype, marla = frappe.db.get_value("RE Plot", plot, ["plot_size", "plot_type", "area_marla"])
		if self.applies_to not in ("All Plots", ptype):
			return 0
		if self.rate_type == "Per Marla":
			return flt(self.rate) * flt(marla)
		if self.rate_type == "By Plot Size":
			return next((flt(r.rate) for r in self.rates if r.plot_size == size), 0)
		return flt(self.rate)
