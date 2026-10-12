"""Replace the sample map with real survey data: KML or GeoJSON -> boundary, blocks, plots or map features."""

import json

import frappe
from defusedxml import ElementTree
from frappe import _
from frappe.model.document import Document

from realestate.geo import area_m2, centroid, geometry_type, outer_rings, point_in_ring

FEATURE_CATEGORY = {
	"Main Gate": "Roads and Gates", "Back Gate": "Roads and Gates", "Boulevard": "Roads and Gates",
	"Street": "Roads and Gates", "Perimeter Road": "Roads and Gates",
	"Central Park": "Public Buildings", "Park": "Public Buildings", "School": "Public Buildings",
	"Masjid": "Public Buildings", "Graveyard": "Public Buildings", "Community Centre": "Public Buildings",
	"Water Tank": "Infrastructure", "Grid Station": "Infrastructure", "Transformer": "Infrastructure",
	"Sewerage Disposal": "Infrastructure",
	"Water Supply Line": "Utility Network", "Sewerage Line": "Utility Network",
	"Electricity Line": "Utility Network", "Internet Cable": "Utility Network",
	"Garbage Point": "Waste", "Disposal Site": "Waste",
}


class REMapImport(Document):
	@frappe.whitelist()
	def run_import(self):
		frappe.only_for(("System Manager", "Sales Manager"))
		try:
			features = read_features(self.import_file)
			if not features:
				frappe.throw(_("No features found in the file"))
			result = getattr(self, f"_import_{frappe.scrub(self.target)}")(features)
			self.status = "Completed"
		except Exception as e:
			frappe.db.rollback()
			result = f"Failed: {e}"
			self.status = "Failed"
		self.result = result
		self.save()
		return result

	# ---------------------------------------------------------------- targets
	def _import_boundary(self, features):
		poly = next((f for f in features if f["geometry"]["type"] in ("Polygon", "MultiPolygon")), None)
		if not poly:
			frappe.throw(_("The file has no polygon for the boundary"))
		project = frappe.get_doc("RE Project", self.project)
		project.boundary_geojson = json.dumps(poly["geometry"])
		project.centre_lat, project.centre_lng = centroid(poly["geometry"])
		project.save()
		return _("Boundary updated: {0} Kanal").format(project.boundary_area_kanal)

	def _import_blocks(self, features):
		if self.replace_existing:
			for name in frappe.get_all("RE Block", {"project": self.project}, pluck="name"):
				if not frappe.db.exists("RE Plot", {"block": name}):
					frappe.delete_doc("RE Block", name)
		done = []
		for f in _polygons(features):
			name = self._prop(f, self.name_property) or f"Block {len(done) + 1}"
			code = self._prop(f, "code") or name.replace("Block", "").strip()[:3]
			doc = frappe.get_doc("RE Block", name) if frappe.db.exists("RE Block", name) else frappe.new_doc("RE Block")
			doc.update({"block_name": name, "block_code": code, "project": self.project, "geojson": json.dumps(f["geometry"])})
			doc.block_type = doc.block_type or ("Commercial" if "commercial" in json.dumps(f["properties"]).lower() else "Residential")
			doc.save()
			done.append(name)
		return _("{0} blocks imported: {1}").format(len(done), ", ".join(done))

	def _import_plots(self, features):
		blocks = frappe.get_all("RE Block", {"project": self.project}, ["name", "block_code", "geojson"])
		sizes = frappe.get_all("RE Plot Size", ["name", "area_marla"])
		if not sizes:
			frappe.throw(_("Create the plot sizes first"))
		if self.replace_existing:
			frappe.db.delete("RE Plot", {"project": self.project, "status": "Available", "booking": ("is", "not set")})
		created = updated = skipped = 0
		for f in _polygons(features):
			plot_no = self._prop(f, self.name_property)
			lat, lng = centroid(f["geometry"])
			block = self._match_block(f, blocks, lat, lng)
			if not plot_no or not block:
				skipped += 1
				continue
			size = self._prop(f, self.size_property)
			if size not in [s.name for s in sizes]:
				marla = area_m2(f["geometry"]) / 25.2929
				size = min(sizes, key=lambda s: abs(s.area_marla - marla)).name
			exists = frappe.db.exists("RE Plot", plot_no)
			doc = frappe.get_doc("RE Plot", plot_no) if exists else frappe.new_doc("RE Plot")
			doc.update({"plot_no": plot_no, "project": self.project, "block": block, "geojson": json.dumps(f["geometry"])})
			if not exists or doc.status == "Available":
				doc.plot_size = size
			doc.save()
			updated += bool(exists)
			created += not exists
		return _("Plots: {0} created, {1} updated, {2} skipped (no number or block)").format(created, updated, skipped)

	def _import_map_features(self, features):
		if self.replace_existing:
			frappe.db.delete("RE Map Feature", {"project": self.project})
		options = frappe.get_meta("RE Map Feature").get_field("feature_type").options.split("\n")
		lookup = {o.lower(): o for o in options}
		n = 0
		for f in features:
			ftype = lookup.get((self._prop(f, self.type_property) or "").lower(), "Other")
			frappe.get_doc({
				"doctype": "RE Map Feature", "project": self.project,
				"feature_name": self._prop(f, self.name_property) or ftype,
				"feature_type": ftype, "category": FEATURE_CATEGORY.get(ftype, "Other"),
				"geojson": json.dumps(f["geometry"]),
			}).insert()
			n += 1
		return _("{0} map features imported").format(n)

	# ---------------------------------------------------------------- helpers
	def _prop(self, feature, key):
		if not key:
			return None
		props = {k.lower(): v for k, v in (feature.get("properties") or {}).items()}
		value = props.get(key.lower())
		return str(value).strip() if value not in (None, "") else None

	def _match_block(self, feature, blocks, lat, lng):
		wanted = (self._prop(feature, self.block_property) or "").lower()
		for b in blocks:
			if wanted and wanted in (b.name.lower(), (b.block_code or "").lower()):
				return b.name
		for b in blocks:
			geom = json.loads(b.geojson) if b.geojson else None
			if any(point_in_ring(lng, lat, ring) for ring in outer_rings(geom)):
				return b.name
		return None


def _polygons(features):
	return [f for f in features if geometry_type(f["geometry"]) == "Polygon"]


def read_features(file_url):
	"""GeoJSON (FeatureCollection / Feature / Geometry) or KML -> list of {geometry, properties}."""
	content = frappe.get_doc("File", {"file_url": file_url}).get_content()
	if isinstance(content, bytes):
		content = content.decode("utf-8-sig")
	text = content.strip()
	if text.startswith("{"):
		return _geojson_features(json.loads(text))
	return _kml_features(text)


def _geojson_features(data):
	if data.get("type") == "FeatureCollection":
		feats = data.get("features") or []
	elif data.get("type") == "Feature":
		feats = [data]
	else:
		feats = [{"type": "Feature", "geometry": data, "properties": {}}]
	return [{"geometry": f["geometry"], "properties": f.get("properties") or {}} for f in feats if f.get("geometry")]


def _kml_features(text):
	root = ElementTree.fromstring(text.encode())
	ns = root.tag.split("}")[0] + "}" if root.tag.startswith("{") else ""

	def coords(el):
		pts = []
		for token in (el.text or "").split():
			parts = token.split(",")
			pts.append([float(parts[0]), float(parts[1])])
		return pts

	out = []
	for pm in root.iter(f"{ns}Placemark"):
		props = {"name": (pm.findtext(f"{ns}name") or "").strip(), "description": (pm.findtext(f"{ns}description") or "").strip()}
		for data in pm.iter(f"{ns}Data"):
			props[data.get("name")] = (data.findtext(f"{ns}value") or "").strip()
		for data in pm.iter(f"{ns}SimpleData"):
			props[data.get("name")] = (data.text or "").strip()
		geoms = []
		for poly in pm.iter(f"{ns}Polygon"):
			ring = coords(poly.find(f".//{ns}outerBoundaryIs//{ns}coordinates"))
			if ring and ring[0] != ring[-1]:
				ring.append(ring[0])
			geoms.append({"type": "Polygon", "coordinates": [ring]})
		for line in pm.iter(f"{ns}LineString"):
			geoms.append({"type": "LineString", "coordinates": coords(line.find(f"{ns}coordinates"))})
		for point in pm.iter(f"{ns}Point"):
			geoms.append({"type": "Point", "coordinates": coords(point.find(f"{ns}coordinates"))[0]})
		if len(geoms) > 1 and all(g["type"] == "Polygon" for g in geoms):
			geoms = [{"type": "MultiPolygon", "coordinates": [g["coordinates"] for g in geoms]}]
		for g in geoms:
			out.append({"geometry": g, "properties": props})
	return out
