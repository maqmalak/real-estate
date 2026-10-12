import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate.geo import area_kanal, centroid, load_geometry


class REProject(Document):
	def validate(self):
		total = sum(flt(r.percent) for r in self.land_use)
		self.land_use_total = total
		if self.land_use and abs(total - 100) > 0.01:
			frappe.throw(_("Land use must total 100% (currently {0}%).").format(flt(total, 2)))
		for r in self.land_use:
			r.area_kanal = flt(self.total_area_kanal) * flt(r.percent) / 100
		geom = load_geometry(self.boundary_geojson)
		if geom:
			if geom["type"] not in ("Polygon", "MultiPolygon"):
				frappe.throw(_("Boundary must be a Polygon"))
			self.boundary_area_kanal = area_kanal(geom)
			if not (self.centre_lat and self.centre_lng):
				self.centre_lat, self.centre_lng = centroid(geom)
