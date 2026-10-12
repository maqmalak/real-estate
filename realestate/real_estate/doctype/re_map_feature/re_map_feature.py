from frappe.model.document import Document

from realestate.geo import area_kanal, geometry_type, load_geometry


class REMapFeature(Document):
	def validate(self):
		geom = load_geometry(self.geojson)
		self.geometry_type = geometry_type(geom)
		self.area_kanal = area_kanal(geom) if self.geometry_type == "Polygon" else 0
