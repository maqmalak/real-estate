from frappe.model.document import Document

from realestate.geo import area_kanal, load_geometry


class REBlock(Document):
	def validate(self):
		self.block_code = (self.block_code or "").strip().upper()
		geom = load_geometry(self.geojson)
		self.area_kanal = area_kanal(geom) if geom else 0
