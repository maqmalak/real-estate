"""Procedural site plan for the sample scheme "Zarmeen Gardens" — pure Python, no Frappe.

Everything is laid out in metres around the centre point and converted to WGS84 at the end:

    boundary (irregular, exactly TOTAL_KANAL)  ⊃  perimeter road  ⊃  core rectangle
    core = west column | 40 ft street | D strip | 60 ft boulevard | D strip | 40 ft street | east column

Columns are stacked bands separated by 40 ft cross streets; a band holds one or more cells (blocks,
public buildings, infrastructure, waste sites) separated by 30 ft streets. Cell areas are exact
shares of the total area, so the drawn land use matches the planned percentages; whatever is left
inside the boundary is roads (boulevard, streets, perimeter road) = 24 %.
"""

import math
import random

from realestate.geo import KANAL_M2, MARLA_M2, LocalFrame, shoelace

FT = 0.3048
BOULEVARD = 60 * FT
STREET_40 = 40 * FT
STREET_30 = 30 * FT
LANE = 30 * FT  # lane between back-to-back plot rows inside a block
MIN_MARGIN = 4.0  # perimeter road / green belt: at least this far between core and boundary

PROJECT = {
	"project_name": "Zarmeen Gardens Housing Scheme",
	"location": "Lahore outskirts, Punjab, Pakistan",
	"total_area_kanal": 400,
	"centre_lat": 31.36,
	"centre_lng": 74.20,
}

LAND_USE = [
	# category, label, percent, details
	("Residential", "A Block", 18, "120 plots, 5 Marla"),
	("Residential", "B Block", 17, "90 plots, 10 Marla"),
	("Residential", "C Block", 14, "40 plots, 1 Kanal"),
	("Commercial", "D Block", 9, "60 plots, 2-4 Marla, along the main boulevard"),
	("Roads and Gates", "Roads and Gates", 24, "Main gate, back gate, 60 ft boulevard, 30-40 ft streets, perimeter road"),
	("Public Buildings", "Public Buildings", 12, "Central park, school, masjid, graveyard"),
	("Infrastructure", "Infrastructure", 4, "Water tank, WAPDA grid station / transformers, sewerage disposal"),
	("Waste", "Waste Area", 2, "Disposal site, 4 garbage collection points"),
]

# plot sizes: name -> (type, marla, frontage ft, depth ft, base price, monthly charges)
PLOT_SIZES = {
	"5 Marla": ("Residential", 5, 25, 54.45, 6_500_000, 2_500),
	"10 Marla": ("Residential", 10, 35, 77.79, 12_000_000, 4_000),
	"1 Kanal": ("Residential", 20, 50, 108.9, 22_000_000, 7_000),
	"2 Marla Commercial": ("Commercial", 2, 13.6, 40, 8_000_000, 3_000),
	"3 Marla Commercial": ("Commercial", 3, 20.4, 40, 11_000_000, 3_500),
	"4 Marla Commercial": ("Commercial", 4, 27.2, 40, 14_000_000, 4_000),
}

BLOCKS = {
	# code: (block name, type, default size, planned plots, share %, colour)
	"A": ("A Block", "Residential", "5 Marla", 120, 18, "#60a5fa"),
	"B": ("B Block", "Residential", "10 Marla", 90, 17, "#34d399"),
	"C": ("C Block", "Residential", "1 Kanal", 40, 14, "#a78bfa"),
	"D": ("D Block", "Commercial", "2 Marla Commercial", 60, 9, "#f59e0b"),
}

# public / infrastructure / waste cells: key -> (name, feature type, category, share %, colour)
SITES = {
	"park": ("Central Park", "Central Park", "Public Buildings", 5.5, "#22c55e"),
	"school": ("Zarmeen School", "School", "Public Buildings", 2.5, "#f97316"),
	"masjid": ("Jamia Masjid", "Masjid", "Public Buildings", 1.5, "#14b8a6"),
	"graveyard": ("Graveyard", "Graveyard", "Public Buildings", 2.5, "#78716c"),
	"tank": ("Overhead Water Tank", "Water Tank", "Infrastructure", 1.0, "#0ea5e9"),
	"grid": ("WAPDA Grid Station", "Grid Station", "Infrastructure", 2.0, "#eab308"),
	"sewer": ("Sewerage Disposal Works", "Sewerage Disposal", "Infrastructure", 1.0, "#8b5cf6"),
	"disposal": ("Solid Waste Disposal Site", "Disposal Site", "Waste", 1.6, "#a16207"),
	"gp1": ("Garbage Point 1", "Garbage Point", "Waste", 0.1, "#b45309"),
	"gp2": ("Garbage Point 2", "Garbage Point", "Waste", 0.1, "#b45309"),
	"gp3": ("Garbage Point 3", "Garbage Point", "Waste", 0.1, "#b45309"),
	"gp4": ("Garbage Point 4", "Garbage Point", "Waste", 0.1, "#b45309"),
}

# columns: list of bands (north to south), each band a list of cell keys (west to east)
WEST = [["A"], ["C"], ["masjid", "school", "gp1", "gp2"]]
EAST = [["graveyard", "disposal", "sewer", "gp3"], ["B"], ["park"], ["tank", "grid", "gp4"]]


def _share_m2(key, total):
	pct = BLOCKS[key][4] if key in BLOCKS else SITES[key][3]
	return total * pct / 100


def _column_height(bands, width, total):
	h = 0.0
	for band in bands:
		area = sum(_share_m2(k, total) for k in band)
		h += area / (width - STREET_30 * (len(band) - 1))
	return h + STREET_40 * (len(bands) - 1)


def _solve_width(bands, height, total):
	lo, hi = 40.0, 2000.0
	for _ in range(80):
		mid = (lo + hi) / 2
		if _column_height(bands, mid, total) > height:
			lo = mid
		else:
			hi = mid
	return (lo + hi) / 2


def _core(total):
	"""Pick the core height giving a square-ish core that leaves room for the perimeter road."""
	best = None
	for h in range(300, 600):
		d = total * BLOCKS["D"][4] / 100 / 2 / h
		ww, we = _solve_width(WEST, h, total), _solve_width(EAST, h, total)
		w = ww + STREET_40 + d + BOULEVARD + d + STREET_40 + we
		fill = (w + 2 * MIN_MARGIN) * (h + 2 * MIN_MARGIN) / total
		score = abs(w / h - 1) + (100 if fill > 0.96 else 0)
		if best is None or score < best[0]:
			best = (score, h, w, ww, we, d)
	return best[1:]


def _boundary(extent, total, rng):
	"""Irregular polygon around the core extent (+ margin) whose area is exactly `total`."""
	x0, y0, x1, y1 = extent[0] - MIN_MARGIN, extent[1] - MIN_MARGIN, extent[2] + MIN_MARGIN, extent[3] + MIN_MARGIN
	w = x1 - x0
	# anchor points walked anti-clockwise from the south-west corner, with the outward normal
	pts = []
	n_side = 5

	def side(ax, ay, bx, by, nx, ny, corner_n):
		pts.append((ax, ay, corner_n[0], corner_n[1], rng.uniform(0.3, 1.0)))
		for i in range(1, n_side):
			t = i / n_side
			px, py = ax + (bx - ax) * t, ay + (by - ay) * t
			if abs(px) < 1e-6 and ny:  # keep the gates on the boulevard axis
				px = 0.0
			pts.append((px, py, nx, ny, rng.uniform(0.0, 1.0)))

	side(x0, y0, x1, y0, 0, -1, (-0.7, -0.7))
	side(x1, y0, x1, y1, 1, 0, (0.7, -0.7))
	side(x1, y1, x0, y1, 0, 1, (0.7, 0.7))
	side(x0, y1, x0, y0, -1, 0, (-0.7, 0.7))
	# gates: put a vertex exactly at x = 0 on the south and north edges
	south = [(0.0, y0, 0, -1, rng.uniform(0.3, 0.6))]
	north = [(0.0, y1, 0, 1, rng.uniform(0.3, 0.6))]
	pts = [p for p in pts if not (abs(p[0]) < w / (2 * n_side) and p[3] != 0 and p[2] == 0)]
	pts += south + north
	cx = lambda p: math.atan2(p[1], p[0])  # noqa: E731
	pts.sort(key=cx)

	def poly(k):
		return [(x + nx * r * k, y + ny * r * k) for x, y, nx, ny, r in pts]

	lo, hi = 0.0, 400.0
	for _ in range(100):
		mid = (lo + hi) / 2
		if shoelace(poly(mid)) < total:
			lo = mid
		else:
			hi = mid
	return poly((lo + hi) / 2), (x0, y0, x1, y1)


def _plot_grid(prefix, rect, size, count, street_prefix):
	"""Back-to-back rows of plots inside a block rectangle, frontage along x, lanes between pairs."""
	x0, y0, x1, y1 = rect
	_, _, front_ft, depth_ft, _, _ = PLOT_SIZES[size]
	fw, fd = front_ft * FT, depth_ft * FT
	per_row = int((x1 - x0 - 2) // fw)
	pairs = math.ceil(count / (2 * per_row))
	per_row = math.ceil(count / (2 * pairs))
	used_h = pairs * 2 * fd
	gap = (y1 - y0 - used_h) / (pairs + 1)
	if gap < LANE * 0.5:
		raise ValueError(f"{prefix}: block too small for {count} plots")
	xs = x0 + (x1 - x0 - per_row * fw) / 2
	plots, lanes, n = [], [], 0
	for p in range(pairs):
		top = y1 - gap * (p + 1) - 2 * fd * p
		lanes.append(((x0, top + gap / 2), (x1, top + gap / 2), f"{street_prefix} Street {p * 2 + 1}"))
		for half in (0, 1):
			ry1 = top - fd * half
			ry0 = ry1 - fd
			for c in range(per_row):
				if n == count:
					break
				n += 1
				px0 = xs + c * fw
				plots.append({
					"plot_no": f"{prefix}-{n:03d}",
					"rect": (px0, ry0, px0 + fw, ry1),
					"plot_size": size,
					"street": f"{street_prefix} Street {p * 2 + 1 + half}",
					"is_corner": int(c in (0, per_row - 1)),
				})
	return plots, lanes


def _commercial_strip(rect, count, side, rng_sizes):
	"""One row of shops facing the boulevard; depth 40 ft, service lane / parking behind."""
	x0, y0, x1, y1 = rect
	depth = 40 * FT
	fronts = [PLOT_SIZES[s][2] * FT for s in rng_sizes]
	used = sum(fronts)
	gap = (y1 - y0 - used) / (count + 1)
	plots, y = [], y1
	for i, size in enumerate(rng_sizes):
		y -= gap
		f = fronts[i]
		px0, px1 = (x1 - depth, x1) if side == "W" else (x0, x0 + depth)
		plots.append({"rect": (px0, y - f, px1, y), "plot_size": size, "street": "Main Boulevard",
					  "is_boulevard_facing": 1, "is_corner": int(i in (0, count - 1))})
		y -= f
	return plots


def build(seed=7):
	"""Return a dict of GeoJSON-ready features for the whole scheme."""
	rng = random.Random(seed)
	total = PROJECT["total_area_kanal"] * KANAL_M2
	h, w, ww, we, dw = _core(total)
	frame = LocalFrame(PROJECT["centre_lat"], PROJECT["centre_lng"])

	x_left = -w / 2
	cols = {
		"W": (x_left, x_left + ww),
		"DW": (x_left + ww + STREET_40, x_left + ww + STREET_40 + dw),
	}
	bx0 = cols["DW"][1]
	cols["BLVD"] = (bx0, bx0 + BOULEVARD)
	cols["DE"] = (cols["BLVD"][1], cols["BLVD"][1] + dw)
	cols["E"] = (cols["DE"][1] + STREET_40, cols["DE"][1] + STREET_40 + we)
	shift = -(cols["BLVD"][0] + cols["BLVD"][1]) / 2  # centre the boulevard on x = 0
	cols = {k: (a + shift, b + shift) for k, (a, b) in cols.items()}
	top, bottom = h / 2, -h / 2
	boundary_xy, inner = _boundary((cols["W"][0], bottom, cols["E"][1], top), total, rng)

	cells, streets = {}, []
	for col_key, bands in (("W", WEST), ("E", EAST)):
		cx0, cx1 = cols[col_key]
		width = cx1 - cx0
		y = top
		for bi, band in enumerate(bands):
			area = sum(_share_m2(k, total) for k in band)
			bh = area / (width - STREET_30 * (len(band) - 1))
			x = cx0
			for ci, key in enumerate(band):
				cw = _share_m2(key, total) / bh
				cells[key] = (x, y - bh, x + cw, y)
				x += cw
				if ci < len(band) - 1:
					streets.append(("Street", f"{col_key}-{bi + 1} Link Road (30 ft)", [(x + STREET_30 / 2, y), (x + STREET_30 / 2, y - bh)], 30))
					x += STREET_30
			y -= bh
			if bi < len(bands) - 1:
				streets.append(("Street", f"{'West' if col_key == 'W' else 'East'} Cross Street {bi + 1} (40 ft)",
								[(cx0, y - STREET_40 / 2), (cx1, y - STREET_40 / 2)], 40))
				y -= STREET_40

	cells["DW"] = (cols["DW"][0], bottom, cols["DW"][1], top)
	cells["DE"] = (cols["DE"][0], bottom, cols["DE"][1], top)

	# ---------------- blocks + plots
	blocks, plots = [], []
	for code in ("A", "B", "C"):
		name, btype, size, count, pct, colour = BLOCKS[code]
		rect = cells[code]
		blocks.append({"code": code, "name": name, "type": btype, "size": size, "count": count, "pct": pct,
					   "color": colour, "geometry": frame.rect(*rect)})
		grid, lanes = _plot_grid(code, rect, size, count, f"{code}-Block")
		for p in grid:
			if code == "B" and abs(p["rect"][1] - rect[1]) < 1e-6 + PLOT_SIZES[size][3] * FT:
				p["is_park_facing"] = 1  # bottom row of B looks onto the central park
			plots.append(p)
		for a, b, label in lanes:
			streets.append(("Street", f"{label} (30 ft)", [a, b], 30))

	name, btype, size, count, pct, colour = BLOCKS["D"]
	d_sizes = ["2 Marla Commercial", "3 Marla Commercial", "4 Marla Commercial"] * (count // 3)
	blocks.append({"code": "D", "name": name, "type": btype, "size": size, "count": count, "pct": pct, "color": colour,
				   "geometry": {"type": "MultiPolygon", "coordinates": [frame.rect(*cells["DW"])["coordinates"],
																	   frame.rect(*cells["DE"])["coordinates"]]}})
	half = count // 2
	d_plots = _commercial_strip(cells["DW"], half, "W", d_sizes[:half]) + _commercial_strip(cells["DE"], count - half, "E", d_sizes[half:])
	# number west strip north->south, then east strip north->south
	for i, p in enumerate(d_plots, 1):
		p["plot_no"] = f"D-{i:03d}"
		plots.append(p)

	for p in plots:
		x0, y0, x1, y1 = p.pop("rect")
		p["geometry"] = frame.rect(x0, y0, x1, y1)
		p["block_code"] = p["plot_no"][0]
		p["centre"] = frame.to_lnglat((x0 + x1) / 2, (y0 + y1) / 2)

	# ---------------- polygon sites
	features = []
	for key, (fname, ftype, category, pct, colour) in SITES.items():
		features.append({"feature_name": fname, "feature_type": ftype, "category": category, "color": colour,
						 "geometry": frame.rect(*cells[key])})

	# ---------------- roads & gates
	ix0, iy0, ix1, iy1 = inner
	ring = [(ix0 + MIN_MARGIN / 2, iy0 + MIN_MARGIN / 2), (ix1 - MIN_MARGIN / 2, iy0 + MIN_MARGIN / 2),
			(ix1 - MIN_MARGIN / 2, iy1 - MIN_MARGIN / 2), (ix0 + MIN_MARGIN / 2, iy1 - MIN_MARGIN / 2)]
	south_gate_y = min(y for x, y in boundary_xy if abs(x) < 1e-6)
	north_gate_y = max(y for x, y in boundary_xy if abs(x) < 1e-6)
	roads = [
		("Boulevard", "Main Boulevard (60 ft)", [(0, south_gate_y + 1), (0, north_gate_y - 1)], 60),
		("Perimeter Road", "Perimeter Road", ring + [ring[0]], 30),
		("Street", "West Service Road (40 ft)", [(cols["W"][1] + STREET_40 / 2, bottom), (cols["W"][1] + STREET_40 / 2, top)], 40),
		("Street", "East Service Road (40 ft)", [(cols["E"][0] - STREET_40 / 2, bottom), (cols["E"][0] - STREET_40 / 2, top)], 40),
	] + streets
	for ftype, fname, pts, width_ft in roads:
		features.append({"feature_name": fname, "feature_type": ftype, "category": "Roads and Gates", "width_ft": width_ft,
						 "color": "#6b7280", "geometry": frame.line(pts)})
	features.append({"feature_name": "Main Gate", "feature_type": "Main Gate", "category": "Roads and Gates", "color": "#dc2626",
					 "geometry": frame.point(0, south_gate_y + 1)})
	features.append({"feature_name": "Back Gate", "feature_type": "Back Gate", "category": "Roads and Gates", "color": "#dc2626",
					 "geometry": frame.point(0, north_gate_y - 1)})

	# ---------------- utility networks, laid in the road corridors
	wsl, wsr = cols["W"][1] + STREET_40 / 2, cols["E"][0] - STREET_40 / 2
	cross_ys = sorted({round(s[2][0][1], 3) for s in streets if "Cross Street" in s[1]})
	tank = cells["tank"]
	grid = cells["grid"]
	sewer = cells["sewer"]

	def utility(ftype, fname, offset, color, pts):
		features.append({"feature_name": fname, "feature_type": ftype, "category": "Utility Network", "color": color,
						 "geometry": frame.line([(x + offset, y) for x, y in pts])})

	trunk = [(0, bottom), (0, top)]
	utility("Water Supply Line", "Water Main - Boulevard", -6, "#0284c7", trunk)
	utility("Water Supply Line", "Water Feeder - from Tank", 0, "#0284c7", [((tank[0] + tank[2]) / 2, tank[3]), ((tank[0] + tank[2]) / 2, tank[3] + 6), (wsr, tank[3] + 6)])
	utility("Sewerage Line", "Trunk Sewer - Boulevard", 6, "#7c3aed", trunk)
	utility("Sewerage Line", "Trunk Sewer - to Disposal Works", 0, "#7c3aed", [(6, top), ((sewer[0] + sewer[2]) / 2, top + MIN_MARGIN / 2), ((sewer[0] + sewer[2]) / 2, sewer[1])])
	utility("Electricity Line", "11 kV Feeder - Boulevard", -8, "#ca8a04", trunk)
	utility("Electricity Line", "11 kV Feeder - from Grid", 0, "#ca8a04", [((grid[0] + grid[2]) / 2, grid[3]), ((grid[0] + grid[2]) / 2, grid[3] + 6), (wsr, grid[3] + 6)])
	utility("Internet Cable", "Fibre Backbone - Boulevard", 8, "#db2777", trunk)
	for x in (wsl, wsr):
		side = "West" if x < 0 else "East"
		utility("Water Supply Line", f"Water Line - {side} Service Road", -3, "#0284c7", [(x, bottom), (x, top)])
		utility("Sewerage Line", f"Sewer - {side} Service Road", 3, "#7c3aed", [(x, bottom), (x, top)])
		utility("Electricity Line", f"LT Line - {side} Service Road", -5, "#ca8a04", [(x, bottom), (x, top)])
		utility("Internet Cable", f"Fibre - {side} Service Road", 5, "#db2777", [(x, bottom), (x, top)])
	for s in streets:
		if "Cross Street" in s[1]:
			pts = s[2]
			label = s[1].split(" (")[0]
			for ftype, fname, dy, colour in (("Water Supply Line", "Water Line", -3, "#0284c7"), ("Sewerage Line", "Sewer", 3, "#7c3aed"),
											 ("Electricity Line", "LT Line", 5, "#ca8a04"), ("Internet Cable", "Fibre", -5, "#db2777")):
				utility(ftype, f"{fname} - {label}", 0, colour, [(x, y + dy) for x, y in pts])
	# transformers at service-road / cross-street junctions and on the boulevard
	tx = [(wsl - 4, y) for y in cross_ys] + [(wsr + 4, y) for y in cross_ys] + [(-8, 0), (-8, top - 20), (-8, bottom + 20)]
	for i, (x, y) in enumerate(tx, 1):
		features.append({"feature_name": f"Transformer T-{i:02d}", "feature_type": "Transformer", "category": "Infrastructure",
						 "color": "#ca8a04", "geometry": frame.point(x, y)})

	return {
		"project": dict(PROJECT),
		"land_use": LAND_USE,
		"plot_sizes": PLOT_SIZES,
		"boundary": frame.polygon(boundary_xy),
		"boundary_xy": boundary_xy,
		"blocks": blocks,
		"plots": plots,
		"features": features,
		"cells_xy": cells,
		"core": {"w": w, "h": h},
		"area_m2": total,
	}
