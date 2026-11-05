import frappe
from frappe.model.document import Document
from frappe.utils import flt

from realestate import land
from realestate import land_calc as L

OPEN = ("Pending", "Under Hearing", "Stay Order")


class RELandCase(Document):
	"""A court case or dispute over khasras: hearings, lawyer, status and the area it affects."""

	def validate(self):
		ms = land.marla_sqft()
		self.affected_sqft = sum(flt(frappe.db.get_value("RE Land Parcel", p.parcel, "area_sqft")) for p in self.parcels)
		self.affected_area = L.fmt_area(self.affected_sqft, ms) if self.parcels else None
