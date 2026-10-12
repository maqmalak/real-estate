"""Map editing from the React society map: save edited outlines and create blocks, plots and infrastructure features from
drawn shapes. Geometry rules are the same as the acceptance check (realestate.acceptance): a plot must lie inside its
block and not overlap another plot; a block must lie inside the boundary and not overlap another block.
Also the infrastructure / public-building side panel (feature_detail, update_feature)."""

import json
import math

import frappe
from frappe import _
from frappe.utils import flt

from realestate.acceptance import MIN_OVERLAP_M2, _Frame, _inside, _overlap_m2
from realestate.geo import M_PER_DEG_LAT, MARLA_M2, area_m2, load_geometry, m_per_deg_lng

EDITORS = ("System Manager", "Sales Manager", "Projects Manager")
FEATURE_CATEGORY = {
	"Main Gate": "Roads and Gates", "Back Gate": "Roads and Gates", "Boulevard": "Roads and Gates", "Street": "Roads and Gates",
	"Perimeter Road": "Roads and Gates", "Central Park": "Public Buildings", "Park": "Public Buildings", "School": "Public Buildings",
	"Masjid": "Public Buildings", "Graveyard": "Public Buildings", "Community Centre": "Public Buildings", "Water Tank": "Infrastructure",
	"Sewerage Disposal": "Infrastructure", "Grid Station": "Infrastructure", "Transformer": "Infrastructure", "Water Supply Line": "Utility Network",
	"Sewerage Line": "Utility Network", "Electricity Line": "Utility Network", "Internet Cable": "Utility Network", "Garbage Point": "Waste",
	"Disposal Site": "Waste", "Green Belt": "Public Buildings", "Other": "Other",
}


def _project():
	return frappe.db.get_single_value("RE Settings", "default_project")


def _frame(project):
	lat, lng = frappe.db.get_value("RE Project", project, ["centre_lat", "centre_lng"])
	return _Frame(flt(lat), flt(lng))


def _polygon(geojson):
	g = json.loads(geojson) if isinstance(geojson, str) else geojson
	if not g or g.get("type") not in ("Polygon", "LineString", "Point", "MultiPolygon"):
		frappe.throw(_("Draw a polygon, line or point"))
	if g["type"] == "Polygon":
		ring = g["coordinates"][0]
		if len(ring) < 4:
			frappe.throw(_("A polygon needs at least three corners"))
		if ring[0] != ring[-1]:
			ring.append(ring[0])
	return g


def check(kind: str, geom: dict, block: str | None = None, exclude: str | None = None, project: str | None = None) -> list[str]:
	"""Problems with a plot / block outline (empty list = OK)."""
	project = project or _project()
	f = _frame(project)
	rings = f.rings(geom)
	if not rings:
		return [_("Outline must be a polygon")]
	ring = rings[0]
	problems = []
	if kind == "plot":
		block_rings = f.rings(frappe.db.get_value("RE Block", block, "geojson")) if block else []
		if not any(all(_inside(p, br) for p in ring) for br in block_rings):
			problems.append(_("The plot is not inside {0}").format(block or _("a block")))
		for other in frappe.get_all("RE Plot", {"project": project, "merged_into": ("is", "not set"), "name": ("!=", exclude or "")}, ["name", "geojson"]):
			o = f.ring(other.geojson)
			if o and _overlap_m2(ring, o) > MIN_OVERLAP_M2:
				problems.append(_("Overlaps plot {0}").format(other.name))
				if len(problems) > 5:
					break
	elif kind == "block":
		boundary = f.ring(frappe.db.get_value("RE Project", project, "boundary_geojson"))
		if boundary and not all(_inside(p, boundary) for p in ring):
			problems.append(_("The block goes outside the project boundary"))
		for other in frappe.get_all("RE Block", {"project": project, "name": ("!=", exclude or "")}, ["name", "geojson"]):
			for o in f.rings(other.geojson):
				if _overlap_m2(ring, o) > MIN_OVERLAP_M2:
					problems.append(_("Overlaps {0}").format(other.name))
	return problems


def block_for(geom: dict, project: str | None = None) -> str | None:
	project = project or _project()
	f = _frame(project)
	ring = (f.rings(geom) or [[]])[0]
	for b in frappe.get_all("RE Block", {"project": project}, ["name", "geojson"]):
		if any(all(_inside(p, br) for p in ring) for br in f.rings(b.geojson)):
			return b.name
	return None


@frappe.whitelist()
def validate_shape(kind: str, geojson: str, block: str | None = None, exclude: str | None = None) -> dict:
	"""Live check while drawing: problems, detected block and area."""
	frappe.only_for(EDITORS)
	geom = _polygon(geojson)
	found = block or (block_for(geom) if kind == "plot" else None)
	area = area_m2(geom) if geom["type"] in ("Polygon", "MultiPolygon") else 0
	return {"problems": check(kind, geom, found, exclude) if kind in ("plot", "block") else [], "block": found,
			"area_m2": round(area, 1), "area_marla": round(area / MARLA_M2, 2), "area_sqft": round(area * 10.7639)}


@frappe.whitelist()
def save_geometry(doctype: str, name: str, geojson: str) -> dict:
	"""Save an edited outline (plot, block, feature or the project boundary) after the geometry checks."""
	frappe.only_for(EDITORS)
	if doctype not in ("RE Plot", "RE Block", "RE Map Feature", "RE Project"):
		frappe.throw(_("Not a map document"))
	geom = _polygon(geojson)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("write")
	kind = {"RE Plot": "plot", "RE Block": "block"}.get(doctype)
	problems = check(kind, geom, doc.get("block"), name, doc.get("project")) if kind else []
	if problems:
		frappe.throw("<br>".join(problems), title=_("Outline not saved"))
	doc.set("boundary_geojson" if doctype == "RE Project" else "geojson", json.dumps(geom))
	doc.add_comment("Info", _("Outline edited on the society map"))
	doc.save()
	return {"name": doc.name}


@frappe.whitelist()
def create_from_drawing(kind: str, geojson: str, values: str) -> dict:
	"""kind: block | plot | feature | boundary. values: the form fields from the save dialog."""
	frappe.only_for(EDITORS)
	geom = _polygon(geojson)
	v = frappe._dict(json.loads(values) if isinstance(values, str) else values)
	project = v.project or _project()
	if kind == "boundary":
		return save_geometry("RE Project", project, json.dumps(geom))
	if kind == "block":
		problems = check("block", geom, project=project)
		if problems:
			frappe.throw("<br>".join(problems), title=_("Block not created"))
		doc = frappe.get_doc({"doctype": "RE Block", "block_name": v.block_name, "block_code": v.block_code, "project": project,
							  "block_type": v.block_type or "Residential", "color": v.color or "#60a5fa", "plot_size": v.plot_size,
							  "geojson": json.dumps(geom)}).insert()
	elif kind == "plot":
		block = v.block or block_for(geom, project)
		problems = check("plot", geom, block, project=project)
		if problems:
			frappe.throw("<br>".join(problems), title=_("Plot not created"))
		size = frappe.db.get_value("RE Plot Size", v.plot_size, ["plot_type", "area_marla", "base_price"], as_dict=True) if v.plot_size else None
		doc = frappe.get_doc({"doctype": "RE Plot", "plot_no": v.plot_no, "project": project, "block": block, "plot_size": v.plot_size,
							  "plot_type": (size or {}).get("plot_type") or "Residential", "area_marla": (size or {}).get("area_marla"),
							  "list_price": flt(v.list_price) or (size or {}).get("base_price"), "street": v.street, "status": "Available",
							  "is_corner": int(v.is_corner or 0), "is_park_facing": int(v.is_park_facing or 0), "geojson": json.dumps(geom)}).insert()
	elif kind == "feature":
		doc = frappe.get_doc({"doctype": "RE Map Feature", "feature_name": v.feature_name, "feature_type": v.feature_type or "Other",
							  "category": v.category or FEATURE_CATEGORY.get(v.feature_type, "Other"), "project": project, "color": v.color,
							  "asset_status": v.asset_status or "Planned", "geojson": json.dumps(geom)}).insert()
	else:
		frappe.throw(_("Unknown kind {0}").format(kind))
	return {"doctype": doc.doctype, "name": doc.name}


# ---------------------------------------------------------------- infrastructure / public-building side panel
def _length_m(geom, project):
	lat, lng = (flt(x) for x in frappe.db.get_value("RE Project", project, ["centre_lat", "centre_lng"]))
	kx = m_per_deg_lng(lat)
	xy = [((c[0] - lng) * kx, (c[1] - lat) * M_PER_DEG_LAT) for c in geom["coordinates"]]
	return sum(math.dist(xy[i], xy[i + 1]) for i in range(len(xy) - 1))


@frappe.whitelist(methods=["GET"])
def feature_detail(name: str) -> dict:
	"""Everything the map side panel shows for a feature: asset record, progress, cost, contractor, project spend, files."""
	doc = frappe.get_doc("RE Map Feature", name)
	doc.check_permission("read")
	geom = load_geometry(doc.geojson)
	length = _length_m(geom, doc.project) if geom and geom.get("type") == "LineString" else 0.0
	area = area_m2(geom) if geom and geom.get("type") in ("Polygon", "MultiPolygon") else 0
	asset = frappe.db.get_value("Asset", doc.asset, ["name", "asset_name", "asset_category", "status", "net_purchase_amount", "purchase_date",
													 "location"], as_dict=True) if doc.asset else None
	project = None
	if doc.erp_project:
		project = frappe.db.get_value("Project", doc.erp_project, ["name", "project_name", "status", "percent_complete", "estimated_costing"], as_dict=True)
		if project:
			project.spent = flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry` g join `tabAccount` a on a.name = g.account
				where g.is_cancelled = 0 and a.root_type = 'Expense' and g.project = %s""", doc.erp_project)[0][0])
	files = frappe.get_all("File", {"attached_to_doctype": "RE Map Feature", "attached_to_name": name}, ["file_name", "file_url", "creation"])
	return {
		"feature": {k: doc.get(k) for k in ("name", "feature_name", "feature_type", "category", "asset_status", "completion_pct", "estimated_cost",
											 "contractor", "asset", "erp_project", "notes", "color", "width_ft", "geometry_type")},
		"contractor_name": frappe.db.get_value("Supplier", doc.contractor, "supplier_name") if doc.contractor else None,
		"length_m": round(length, 1), "area_m2": round(area, 1), "area_kanal": round(area / (MARLA_M2 * 20), 2),
		"asset": asset, "project": project, "files": files,
		"can_edit": bool(set(frappe.get_roles()) & set(EDITORS)),
	}


@frappe.whitelist()
def update_feature(name: str, asset_status: str | None = None, completion_pct: float | None = None, contractor: str | None = None,
				   estimated_cost: float | None = None, notes: str | None = None) -> dict:
	"""Progress update from the side panel (status, % complete, contractor, estimate, notes)."""
	frappe.only_for(EDITORS)
	doc = frappe.get_doc("RE Map Feature", name)
	for field, value in (("asset_status", asset_status), ("completion_pct", completion_pct), ("contractor", contractor or None),
						 ("estimated_cost", estimated_cost), ("notes", notes)):
		if value is not None:
			doc.set(field, value)
	if doc.asset_status == "Completed":
		doc.completion_pct = 100
	doc.save()
	return {"name": doc.name}
