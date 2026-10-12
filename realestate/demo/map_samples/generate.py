"""Sample survey files for a Zarmeen Gardens Phase 2 extension (E Block), east of the current boundary."""
import json, os
out = os.path.dirname(os.path.abspath(__file__))
R = lambda v: round(v, 7)
def rect(x0, y0, x1, y1):
    return [[R(x0), R(y0)], [R(x1), R(y0)], [R(x1), R(y1)], [R(x0), R(y1)], [R(x0), R(y0)]]

# 1. boundary: current outline with the east extension (lng 74.20228 -> 74.20400, lat 31.35965 -> 31.36092)
ring = [[74.1975176, 31.3596012], [74.1975396, 31.3588035], [74.197543, 31.3579673], [74.1985139, 31.3579901], [74.19944, 31.3579378],
        [74.2, 31.3579438], [74.2012922, 31.3579498], [74.2022656, 31.3579651], [74.2022253, 31.3588035], [74.20228, 31.3596012],
        [74.20228, 31.35965], [74.20400, 31.35965], [74.20400, 31.36092], [74.20226, 31.36092],
        [74.2022711, 31.3611965], [74.202248, 31.3620197], [74.2012922, 31.3620036], [74.2, 31.362027], [74.19944, 31.3620806],
        [74.1985139, 31.3620071], [74.197549, 31.3620276], [74.1975115, 31.3611965], [74.1974725, 31.3603988], [74.1975176, 31.3596012]]
json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "Zarmeen Gardens incl. Phase 2"},
           "geometry": {"type": "Polygon", "coordinates": [ring]}}]}, open(f"{out}/1-boundary-with-phase2.geojson", "w"), indent=1)

# 2. block
json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "E Block", "code": "E", "type": "Residential"},
           "geometry": {"type": "Polygon", "coordinates": [rect(74.20245, 31.35975, 74.20392, 31.36082)]}}]},
          open(f"{out}/2-blocks-e-block.geojson", "w"), indent=1)

# 3. plots (KML, as exported from Google Earth / a surveyor's CAD): 24 x 5 Marla, 16 x 10 Marla
placemarks, n = [], 0
def plot(x0, y0, x1, y1, size, street):
    global n
    n += 1
    no = f"E-{n:03d}"
    coords = " ".join(f"{x},{y},0" for x, y in rect(x0, y0, x1, y1))
    placemarks.append(f"""  <Placemark>
   <name>{no}</name>
   <ExtendedData><Data name="plot_no"><value>{no}</value></Data><Data name="block"><value>E</value></Data>
    <Data name="size"><value>{size}</value></Data><Data name="street"><value>{street}</value></Data></ExtendedData>
   <Polygon><outerBoundaryIs><LinearRing><coordinates>{coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>""")
for row, (y0, y1) in enumerate([(31.36060, 31.36075), (31.36045, 31.36060)]):
    for i in range(12):
        x0 = 74.20255 + i * 0.000082
        plot(x0, y0, x0 + 0.000082, y1, "5 Marla", "E-Block Street 1")
for row, (y0, y1) in enumerate([(31.36005, 31.36026), (31.35984, 31.36005)]):
    for i in range(8):
        x0 = 74.20255 + i * 0.000114
        plot(x0, y0, x0 + 0.000114, y1, "10 Marla", "E-Block Street 2")
open(f"{out}/3-plots-e-block.kml", "w").write(f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
 <Document>
  <name>Zarmeen Gardens Phase 2 - E Block plots</name>
{chr(10).join(placemarks)}
 </Document>
</kml>
""")

# 4. map features
F = lambda name, t, g: {"type": "Feature", "properties": {"name": name, "type": t}, "geometry": g}
json.dump({"type": "FeatureCollection", "features": [
    F("E Block Street 1", "Street", {"type": "LineString", "coordinates": [[74.20245, 31.360355], [74.20392, 31.360355]]}),
    F("E Block Street 2", "Street", {"type": "LineString", "coordinates": [[74.20245, 31.35979], [74.20392, 31.35979]]}),
    F("E Block Park", "Park", {"type": "Polygon", "coordinates": [rect(74.20362, 31.35984, 74.20389, 31.36026)]}),
    F("Phase 2 Water Supply Line", "Water Supply Line", {"type": "LineString", "coordinates": [[74.20240, 31.35970], [74.20240, 31.36088]]}),
    F("E Block Transformer", "Transformer", {"type": "Point", "coordinates": [74.20375, 31.36068]}),
    F("E Block Garbage Point", "Garbage Point", {"type": "Point", "coordinates": [74.20380, 31.36045]}),
]}, open(f"{out}/4-features-e-block.geojson", "w"), indent=1)
print("written", sorted(os.listdir(out)), "plots", n)
