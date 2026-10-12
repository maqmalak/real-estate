"""Small geometry helpers: GeoJSON in WGS84 (lng, lat), areas via a local equirectangular projection.

Good enough for a housing scheme (a few km across); no GIS dependency needed.
"""

import json
import math

MARLA_M2 = 25.2929  # 272.25 sq ft
KANAL_M2 = MARLA_M2 * 20
M_PER_DEG_LAT = 110574.0


def m_per_deg_lng(lat):
	return 111320.0 * math.cos(math.radians(lat))


class LocalFrame:
	"""Metres east (x) / north (y) of an origin <-> lng/lat."""

	def __init__(self, lat, lng):
		self.lat, self.lng = lat, lng
		self.kx = m_per_deg_lng(lat)

	def to_lnglat(self, x, y):
		return [round(self.lng + x / self.kx, 7), round(self.lat + y / M_PER_DEG_LAT, 7)]

	def to_xy(self, lng, lat):
		return (lng - self.lng) * self.kx, (lat - self.lat) * M_PER_DEG_LAT

	def ring(self, pts):
		ring = [self.to_lnglat(x, y) for x, y in pts]
		if ring[0] != ring[-1]:
			ring.append(ring[0])
		return ring

	def polygon(self, pts):
		return {"type": "Polygon", "coordinates": [self.ring(pts)]}

	def rect(self, x0, y0, x1, y1):
		return self.polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

	def line(self, pts):
		return {"type": "LineString", "coordinates": [self.to_lnglat(x, y) for x, y in pts]}

	def point(self, x, y):
		return {"type": "Point", "coordinates": self.to_lnglat(x, y)}


def shoelace(pts):
	a = 0.0
	for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
		a += x1 * y2 - x2 * y1
	return abs(a) / 2


def load_geometry(value):
	"""GeoJSON text / dict (Geometry, Feature or FeatureCollection with one feature) -> geometry dict."""
	if not value:
		return None
	g = json.loads(value) if isinstance(value, str) else value
	if g.get("type") == "FeatureCollection":
		g = (g.get("features") or [{}])[0]
	if g.get("type") == "Feature":
		g = g.get("geometry")
	return g


def outer_rings(geom):
	if not geom:
		return []
	if geom["type"] == "Polygon":
		return [geom["coordinates"][0]]
	if geom["type"] == "MultiPolygon":
		return [p[0] for p in geom["coordinates"]]
	return []


def area_m2(geom):
	"""Area of a (Multi)Polygon in m² (holes ignored)."""
	total = 0.0
	for ring in outer_rings(geom):
		lat0 = sum(p[1] for p in ring) / len(ring)
		frame = LocalFrame(lat0, ring[0][0])
		total += shoelace([frame.to_xy(lng, lat) for lng, lat in ring[:-1]])
	return total


def area_kanal(geom):
	return round(area_m2(geom) / KANAL_M2, 2)


def centroid(geom):
	"""(lat, lng) of a geometry: area centroid for polygons, mean vertex otherwise."""
	if not geom:
		return None, None
	if geom["type"] == "Point":
		return geom["coordinates"][1], geom["coordinates"][0]
	rings = outer_rings(geom)
	if rings:
		ring = max(rings, key=len)[:-1]
	elif geom["type"] == "LineString":
		ring = geom["coordinates"]
	elif geom["type"] == "MultiLineString":
		ring = [p for line in geom["coordinates"] for p in line]
	else:
		return None, None
	return round(sum(p[1] for p in ring) / len(ring), 7), round(sum(p[0] for p in ring) / len(ring), 7)


def point_in_ring(lng, lat, ring):
	inside = False
	j = len(ring) - 1
	for i in range(len(ring)):
		xi, yi = ring[i]
		xj, yj = ring[j]
		if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
			inside = not inside
		j = i
	return inside


def geometry_type(geom):
	t = (geom or {}).get("type", "")
	return {"MultiPolygon": "Polygon", "MultiLineString": "LineString", "MultiPoint": "Point"}.get(t, t)
