import frappe
from frappe import _
from frappe.model.document import Document

from realestate import land
from realestate.identity import format_cnic, normalise_mobile


class RELandOwner(Document):
	"""A seller of land (co-owner per fard, legal heir or attorney). Every owner is an ERPNext Supplier in the
	"Land Owners" group, so purchase invoices, payments and the AP aging work on standard ERPNext documents."""

	def validate(self):
		self.owner_name = (self.owner_name or "").strip()
		self.cnic = format_cnic(self.cnic)
		self.mobile_no = normalise_mobile(self.mobile_no)
		self.display_name = f"{self.owner_name} {self.relation} {self.father_name}" if self.father_name else self.owner_name
		if self.attorney and self.attorney == self.name:
			frappe.throw(_("An owner cannot be their own attorney"))
		if self.is_deceased:
			total = sum(h.share_pct or 0 for h in self.heirs)
			if self.heirs and abs(total - 100) > 0.01:
				frappe.msgprint(_("Legal heirs' shares add up to {0}%, not 100%").format(round(total, 2)), indicator="orange", alert=True)

	def on_update(self):
		supplier = land.ensure_supplier(self)
		if supplier != self.supplier:
			self.db_set("supplier", supplier, update_modified=False)
		land.ensure_party_link(self.supplier, self.customer)
