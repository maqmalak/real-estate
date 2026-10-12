"""Module 6 — letters and forms as print formats on the project letterhead, generated to versioned PDFs.

Every generated PDF is stored on an `RE Generated Document` (document type, reference, version, who / when)
and attached to the source record, so the customer's documents tab shows the full history.
"""

import base64
import io
import json

import frappe
from frappe import _
from frappe.utils import now_datetime

from realestate.geo import LocalFrame, load_geometry

LETTER_HEAD = "Zarmeen Gardens"

# document type -> (source doctype, template file)
DOCUMENTS = {
	"Booking Application Form": ("RE Booking", "booking_application_form"),
	"Allotment Letter": ("RE Booking", "allotment_letter"),
	"Payment Schedule": ("RE Booking", "payment_schedule"),
	"Payment Receipt": ("RE Payment", None),  # existing "RE Payment Receipt" print format
	"Installment Reminder": ("RE Booking", "installment_reminder"),
	"Final Notice": ("RE Booking", "final_notice"),
	"Cancellation Letter": ("RE Booking", "cancellation_letter"),
	"No Demand Certificate": ("RE Booking", "no_demand_certificate"),
	"Possession Letter": ("RE Booking", "possession_letter"),
	"Sale Agreement": ("RE Booking", "sale_agreement"),
	"Site Plan": ("RE Plot", "site_plan"),
	"NOC for Construction": ("RE Plot", "noc_construction"),
	"Maintenance Bill": ("RE Society Bill", "maintenance_bill"),
	"Customer Account Statement": ("Customer", "customer_statement"),
	"Transfer Application": ("RE Plot Transfer", "transfer_application"),
	"Transfer Letter": ("RE Plot Transfer", "transfer_letter"),
}


def print_format_name(document_type):
	return "RE Payment Receipt" if document_type == "Payment Receipt" else f"RE {document_type}"


def setup():
	"""Letter head + one Jinja print format per document (re-run safe; updates the HTML)."""
	if not frappe.db.exists("Letter Head", LETTER_HEAD):
		frappe.get_doc({"doctype": "Letter Head", "letter_head_name": LETTER_HEAD, "source": "HTML", "footer_source": "HTML",
						"is_default": 1}).insert(ignore_permissions=True)
	lh = frappe.get_doc("Letter Head", LETTER_HEAD)
	lh.content = _read("letterhead.html")
	lh.footer = _read("letterfoot.html")
	lh.save(ignore_permissions=True)
	for document_type, (doctype, template) in DOCUMENTS.items():
		if not template:
			continue
		name = print_format_name(document_type)
		pf = frappe.get_doc("Print Format", name) if frappe.db.exists("Print Format", name) else frappe.new_doc("Print Format")
		pf.update({"name": name, "doc_type": doctype, "module": "Real Estate", "print_format_type": "Jinja", "custom_format": 1,
				   "standard": "No", "disabled": 0, "html": _read(f"docs/{template}.html")})
		pf.flags.ignore_permissions = True
		pf.save()
	frappe.db.commit()


def _read(path):
	return frappe.read_file(frappe.get_app_path("realestate", "templates", *path.split("/"))) or ""


# ---------------------------------------------------------------- jinja helpers (hooks.jinja)
def qr_svg(text, scale=3):
	"""Inline SVG QR code (data URI) — used on receipts and letters for verification."""
	import pyqrcode

	buf = io.BytesIO()
	pyqrcode.create(str(text)).svg(buf, scale=scale, quiet_zone=2)
	return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def verify_url(doctype, name):
	return frappe.utils.get_url(f"/desk/{frappe.scrub(doctype).replace('_', '-')}/{name}")


def plot_svg(plot, width=520, height=360):
	"""Site plan: the plot (highlighted) inside its block with neighbouring plots, dimensions, north arrow and scale."""
	p = frappe.db.get_value("RE Plot", plot, ["name", "block", "geojson", "centre_lat", "centre_lng"], as_dict=True)
	geom = load_geometry(p.geojson) if p else None
	if not geom:
		return ""
	frame = LocalFrame(p.centre_lat, p.centre_lng)
	ring = [frame.to_xy(*c) for c in geom["coordinates"][0]]
	xs, ys = [x for x, _y in ring], [y for _x, y in ring]
	cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
	span = max(max(xs) - min(xs), max(ys) - min(ys)) * 4.5
	k = min(width, height) / span

	def pt(x, y):
		return f"{width / 2 + (x - cx) * k:.1f},{height / 2 - (y - cy) * k:.1f}"

	shapes = []
	for n in frappe.get_all("RE Plot", {"block": p.block, "centre_lat": ("between", [p.centre_lat - 0.0006, p.centre_lat + 0.0006]),
										 "centre_lng": ("between", [p.centre_lng - 0.0007, p.centre_lng + 0.0007])}, ["name", "geojson"]):
		g = load_geometry(n.geojson)
		if not g:
			continue
		pts = " ".join(pt(*frame.to_xy(*c)) for c in g["coordinates"][0])
		own = n.name == p.name
		shapes.append(f'<polygon points="{pts}" fill="{"#fde68a" if own else "#f8fafc"}" stroke="{"#b45309" if own else "#94a3b8"}" stroke-width="{2.5 if own else 0.8}"/>')
		c = [frame.to_xy(*q) for q in g["coordinates"][0][:-1]]
		mx, my = sum(q[0] for q in c) / len(c), sum(q[1] for q in c) / len(c)
		lx, ly = pt(mx, my).split(",")
		shapes.append(f'<text x="{lx}" y="{ly}" font-size="{11 if own else 8}" text-anchor="middle" dominant-baseline="middle" '
					  f'font-weight="{"700" if own else "400"}" fill="#334155">{n.name.split("-")[-1]}</text>')
	# dimensions of the plot (feet)
	w_ft = (max(xs) - min(xs)) / 0.3048
	d_ft = (max(ys) - min(ys)) / 0.3048
	bx, by = pt(min(xs), min(ys)).split(",")
	tx, ty = pt(max(xs), max(ys)).split(",")
	dims = (f'<text x="{(float(bx) + float(tx)) / 2:.1f}" y="{float(by) + 16:.1f}" font-size="10" text-anchor="middle" fill="#b45309">{w_ft:.0f} ft</text>'
			f'<text x="{float(tx) + 6:.1f}" y="{(float(by) + float(ty)) / 2:.1f}" font-size="10" fill="#b45309">{d_ft:.0f} ft</text>')
	scale_m = 20
	north = (f'<g transform="translate({width - 30},30)"><polygon points="0,-18 7,6 0,1 -7,6" fill="#0f172a"/>'
			 f'<text x="0" y="20" font-size="11" text-anchor="middle" font-weight="700">N</text></g>'
			 f'<g transform="translate(14,{height - 16})"><rect width="{scale_m * k:.1f}" height="4" fill="#0f172a"/>'
			 f'<text x="0" y="-4" font-size="9">{scale_m} m</text></g>')
	return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
			f'style="border:1px solid #cbd5e1;background:#ffffff">{"".join(shapes)}{dims}{north}</svg>')


def society_dues(customer):
	return frappe.utils.flt(frappe.db.sql("select sum(outstanding_amount) from `tabRE Society Bill` where customer=%s", customer)[0][0])


# ---------------------------------------------------------------- generate
@frappe.whitelist()
def generate(document_type: str, reference_name: str, reference_doctype: str | None = None, remarks: str | None = None) -> dict:
	"""Render the document to PDF on the letterhead, store it as a new version and attach it to the source record."""
	if document_type not in DOCUMENTS:
		frappe.throw(_("Unknown document type {0}").format(document_type))
	doctype = DOCUMENTS[document_type][0]
	if reference_doctype and reference_doctype != doctype:
		frappe.throw(_("{0} is generated from {1}").format(document_type, doctype))
	src = frappe.get_doc(doctype, reference_name)
	src.check_permission("read")
	_guard(document_type, src)
	pdf = frappe.get_print(doctype, reference_name, print_format=print_format_name(document_type), as_pdf=True, letterhead=LETTER_HEAD)
	version = frappe.db.count("RE Generated Document", {"document_type": document_type, "reference_name": reference_name}) + 1
	customer = src.name if doctype == "Customer" else src.get("customer") or (
		src.get("to_customer") if document_type == "Transfer Letter" else src.get("from_customer"))
	plot = src.name if doctype == "RE Plot" else src.get("plot")
	gen = frappe.get_doc({
		"doctype": "RE Generated Document", "document_type": document_type, "reference_doctype": doctype, "reference_name": reference_name,
		"version": version, "customer": customer, "plot": plot, "issued_on": now_datetime(), "issued_by": frappe.session.user,
		"print_format": print_format_name(document_type), "remarks": remarks,
	}).insert(ignore_permissions=True)
	file_name = f"{document_type} - {reference_name} - v{version}.pdf".replace("/", "-")
	f = frappe.get_doc({"doctype": "File", "file_name": file_name, "attached_to_doctype": doctype, "attached_to_name": reference_name,
						"is_private": 1, "content": pdf}).insert(ignore_permissions=True)
	gen.db_set("file", f.file_url)
	return {"name": gen.name, "file_url": f.file_url, "version": version}


def _guard(document_type, src):
	if document_type == "No Demand Certificate":
		if src.docstatus != 1 or src.outstanding_amount > 0.5 or society_dues(src.customer) > 0.5:
			frappe.throw(_("NDC can only be issued when the booking and society bills are fully paid"))
	if document_type == "Possession Letter" and src.outstanding_amount > 0.5:
		frappe.throw(_("Possession is given only after the plot is fully paid"))
	if document_type == "Cancellation Letter" and src.docstatus != 2:
		frappe.throw(_("Cancel the booking first"))
	if document_type == "Transfer Letter" and src.docstatus != 1:
		frappe.throw(_("The transfer letter is issued once the transfer is approved"))
	if document_type == "NOC for Construction" and (not src.customer or src.status not in ("Sold", "Possession Given")):
		frappe.throw(_("Construction NOC is issued for fully paid (sold) plots only"))


@frappe.whitelist()
def available(doctype: str, name: str) -> list[dict]:
	"""Document types that can be generated from this record, with past versions."""
	frappe.get_doc(doctype, name).check_permission("read")
	out = []
	for document_type, (dt, _t) in DOCUMENTS.items():
		if dt != doctype:
			continue
		versions = frappe.get_all("RE Generated Document", {"document_type": document_type, "reference_name": name},
								  ["name", "version", "issued_on", "issued_by", "file"], order_by="version desc")
		out.append({"document_type": document_type, "versions": versions})
	return out

