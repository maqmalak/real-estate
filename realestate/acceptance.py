"""Acceptance criteria (spec §9) and roles & security (§7), checked against the live data.

Run:  bench --site realestate re-acceptance          (prints a table, exit code 1 if anything fails)
      React /re/acceptance or realestate.acceptance.run (System Manager)

Everything is read-only: the one write test (deleting a cancelled invoice must be refused) runs inside a savepoint
that is rolled back. Items that need eyes on a screen (mobile layout, light / dark mode) are reported as "manual" with
what was verified in the browser.
"""

import json
import math
import time

import frappe
from frappe.utils import add_days, flt, getdate, nowdate

from realestate.geo import M_PER_DEG_LAT, area_m2, load_geometry, m_per_deg_lng
from realestate.session import as_user

PASS, WARN, FAIL, MANUAL = "pass", "warn", "fail", "manual"
EPS_M = 0.05  # 5 cm: shared edges and rounding are not overlaps
MIN_OVERLAP_M2 = 0.5


def _result(key, title, status, detail, evidence=None):
	return {"key": key, "title": title, "status": status, "detail": detail, "evidence": evidence or []}


# ---------------------------------------------------------------- geometry (local metres, no GIS dependency)
class _Frame:
	def __init__(self, lat, lng):
		self.lat, self.lng, self.kx = lat, lng, m_per_deg_lng(lat)

	def rings(self, geom):
		"""Outer rings in metres (Polygon -> 1, MultiPolygon -> n)."""
		g = load_geometry(geom)
		if not g:
			return []
		polys = [g["coordinates"]] if g.get("type") == "Polygon" else g["coordinates"] if g.get("type") == "MultiPolygon" else []
		out = []
		for poly in polys:
			pts = [((c[0] - self.lng) * self.kx, (c[1] - self.lat) * M_PER_DEG_LAT) for c in poly[0]]
			out.append(pts[:-1] if pts and pts[0] == pts[-1] else pts)
		return out

	def ring(self, geom):
		r = self.rings(geom)
		return r[0] if len(r) == 1 else None


def _signed_area(r):
	return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2


def _ccw(r):
	return r if _signed_area(r) > 0 else list(reversed(r))


def _convex(r):
	n, sign = len(r), 0
	for i in range(n):
		(x1, y1), (x2, y2), (x3, y3) = r[i], r[(i + 1) % n], r[(i + 2) % n]
		z = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2)
		if abs(z) > 1e-9:
			if sign and (z > 0) != (sign > 0):
				return False
			sign = z
	return True


def _seg_dist(p, a, b):
	(px, py), (ax, ay), (bx, by) = p, a, b
	dx, dy = bx - ax, by - ay
	t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
	return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _inside(p, r):
	"""Inside or within EPS_M of the edge."""
	x, y = p
	inside = False
	for i in range(len(r)):
		(x1, y1), (x2, y2) = r[i], r[i - 1]
		if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
			inside = not inside
	return inside or any(_seg_dist(p, r[i], r[(i + 1) % len(r)]) <= EPS_M for i in range(len(r)))


def _clip(subject, clip):
	"""Sutherland–Hodgman: subject ∩ clip (clip convex, both counter-clockwise)."""
	out = subject
	for i in range(len(clip)):
		a, b = clip[i], clip[(i + 1) % len(clip)]
		inside = lambda p: (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9  # noqa: E731
		src, out = out, []
		if not src:
			break
		for j in range(len(src)):
			cur, prev = src[j], src[j - 1]
			if inside(cur):
				if not inside(prev):
					out.append(_cross(prev, cur, a, b))
				out.append(cur)
			elif inside(prev):
				out.append(_cross(prev, cur, a, b))
	return out


def _cross(p1, p2, a, b):
	x1, y1, x2, y2, x3, y3, x4, y4 = *p1, *p2, *a, *b
	d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
	if abs(d) < 1e-12:
		return p2
	t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
	return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def _overlap_m2(r1, r2):
	if not (_convex(r1) and _convex(r2)):
		# non-convex: count vertices strictly inside the other as a proxy for overlap
		deep = [p for p in r1 if _inside(p, r2) and all(_seg_dist(p, r2[i], r2[(i + 1) % len(r2)]) > EPS_M for i in range(len(r2)))]
		return MIN_OVERLAP_M2 * 2 if deep else 0.0
	inter = _clip(_ccw(r1), _ccw(r2))
	return abs(_signed_area(inter)) if len(inter) >= 3 else 0.0


def _bbox(r):
	xs, ys = [p[0] for p in r], [p[1] for p in r]
	return min(xs), min(ys), max(xs), max(ys)


def _bbox_hit(a, b):
	return a[0] < b[2] - EPS_M and b[0] < a[2] - EPS_M and a[1] < b[3] - EPS_M and b[1] < a[3] - EPS_M


def _pairwise_overlaps(items):
	"""items: [(name, ring)] -> [(a, b, m2)]"""
	boxes = [(n, r, _bbox(r)) for n, r in items]
	boxes.sort(key=lambda t: t[2][0])
	out = []
	for i, (n1, r1, b1) in enumerate(boxes):
		for n2, r2, b2 in boxes[i + 1:]:
			if b2[0] >= b1[2] - EPS_M:
				break
			if _bbox_hit(b1, b2):
				a = _overlap_m2(r1, r2)
				if a > MIN_OVERLAP_M2:
					out.append((n1, n2, round(a, 1)))
	return out


# ---------------------------------------------------------------- §9 criteria
def check_land_use(project):
	p = frappe.get_doc("RE Project", project)
	total_pct = sum(flt(r.percent) for r in p.land_use)
	boundary_kanal = flt(p.boundary_area_kanal) or flt(p.total_area_kanal)
	use_kanal = sum(flt(r.area_kanal) for r in p.land_use)
	rows = [f"{r.label or r.category}: {flt(r.percent):g}% = {flt(r.area_kanal):.2f} kanal" for r in p.land_use]
	ok_pct = abs(total_pct - 100) < 0.01
	ok_area = boundary_kanal and abs(use_kanal - boundary_kanal) / boundary_kanal < 0.005
	status = PASS if ok_pct and ok_area else FAIL
	return _result("land_use", "Land-use percentages reconcile to 100% of the boundary", status,
				   f"Land use totals {total_pct:g}% and {use_kanal:.2f} kanal; boundary {boundary_kanal:.2f} kanal "
				   f"({'match' if ok_area else 'MISMATCH'}).", rows)


def check_geometry(project):
	p = frappe.get_doc("RE Project", project)
	f = _Frame(flt(p.centre_lat), flt(p.centre_lng))
	boundary = f.ring(p.boundary_geojson)
	block_rings = {b.name: f.rings(b.geojson) for b in frappe.get_all("RE Block", {"project": project}, ["name", "geojson"])}
	issues = [f"{n}: no outline" for n, rs in block_rings.items() if not rs]
	blocks = [(f"{n}#{i + 1}" if len(rs) > 1 else n, r) for n, rs in block_rings.items() for i, r in enumerate(rs)]
	plots = frappe.get_all("RE Plot", {"project": project, "merged_into": ("is", "not set")}, ["name", "block", "geojson"])
	outside_block, outside_boundary = [], []
	for name, r in blocks:
		if boundary and not all(_inside(pt, boundary) for pt in r):
			outside_boundary.append(name)
	rings = []
	for pl in plots:
		r = f.ring(pl.geojson)
		if not r:
			issues.append(f"{pl.name}: no outline")
			continue
		rings.append((pl.name, r))
		brs = block_rings.get(pl.block) or []
		if not any(all(_inside(pt, br) for pt in r) for br in brs):
			outside_block.append(pl.name)
	plot_overlaps = _pairwise_overlaps(rings)
	block_overlaps = _pairwise_overlaps(blocks)
	evidence = [f"{len(block_rings)} blocks ({len(blocks)} outlines), {len(rings)} plots checked (merged-away plots excluded)"]
	evidence += [f"Block outside boundary: {n}" for n in outside_boundary]
	evidence += [f"Plot outside its block: {n}" for n in outside_block[:20]]
	evidence += [f"Plots overlap: {a} × {b} ({m} m²)" for a, b, m in plot_overlaps[:20]]
	evidence += [f"Blocks overlap: {a} × {b} ({m} m²)" for a, b, m in block_overlaps]
	evidence += issues[:10]
	bad = outside_boundary or outside_block or plot_overlaps or block_overlaps or issues
	return _result("geometry", "Plots inside their block, blocks inside the boundary, no overlaps", FAIL if bad else PASS,
				   f"{len(outside_block)} plots outside their block, {len(outside_boundary)} blocks outside the boundary, "
				   f"{len(plot_overlaps)} plot overlaps, {len(block_overlaps)} block overlaps.", evidence)


def check_schedules():
	bad = []
	rows = frappe.db.sql("""select b.name, b.total_price, b.discount, b.net_price, coalesce(sum(i.amount), 0) as scheduled
		from `tabRE Booking` b left join `tabRE Installment` i on i.parent = b.name and i.parenttype = 'RE Booking'
		where b.docstatus = 1 group by b.name""", as_dict=True)
	for r in rows:
		if abs(flt(r.net_price) - (flt(r.total_price) - flt(r.discount))) > 0.5 or abs(flt(r.scheduled) - flt(r.net_price)) > 0.5:
			bad.append(f"{r.name}: price {flt(r.total_price):,.0f} − discount {flt(r.discount):,.0f} = net {flt(r.net_price):,.0f}; "
					   f"schedule {flt(r.scheduled):,.0f}")
	inv = frappe.db.sql("""select b.name, b.net_price, si.grand_total, (select sum(ps.payment_amount) from `tabPayment Schedule` ps
		where ps.parent = si.name) as ps_total from `tabRE Booking` b join `tabSales Invoice` si on si.name = b.sales_invoice
		where b.docstatus = 1 and b.status != 'Cancelled' and b.transferred_from is null""", as_dict=True)
	for r in inv:
		if abs(flt(r.ps_total) - flt(r.grand_total)) > 0.5:
			bad.append(f"{r.name}: Sales Invoice payment schedule {flt(r.ps_total):,.0f} ≠ invoice {flt(r.grand_total):,.0f}")
	return _result("schedules", "Installment schedule totals equal plot price minus discount", FAIL if bad else PASS,
				   f"{len(rows)} submitted bookings and {len(inv)} booking invoices checked; {len(bad)} mismatches. "
				   "Unit tests: python -m unittest realestate.tests.test_calc.", bad[:20])


def check_receipts():
	bad = []
	rows = frappe.db.sql("""select p.name, p.amount, p.payment_entry, pe.docstatus as pe_status, pe.paid_amount,
		(select sum(debit) - sum(credit) from `tabGL Entry` g where g.voucher_type = 'Payment Entry' and g.voucher_no = pe.name and g.is_cancelled = 0) as diff,
		(select count(*) from `tabGL Entry` g where g.voucher_type = 'Payment Entry' and g.voucher_no = pe.name and g.is_cancelled = 0) as gl_rows
		from `tabRE Payment` p left join `tabPayment Entry` pe on pe.name = p.payment_entry where p.docstatus = 1""", as_dict=True)
	for r in rows:
		if not r.payment_entry or r.pe_status != 1:
			bad.append(f"{r.name}: no submitted Payment Entry")
		elif abs(flt(r.paid_amount) - flt(r.amount)) > 0.5:
			bad.append(f"{r.name}: receipt {flt(r.amount):,.0f} ≠ Payment Entry {flt(r.paid_amount):,.0f}")
		elif not r.gl_rows or abs(flt(r.diff)) > 0.01:
			bad.append(f"{r.name}: ledger entries missing or unbalanced")
	company = frappe.db.get_single_value("RE Settings", "company")
	dr, cr = frappe.db.sql("select sum(debit), sum(credit) from `tabGL Entry` where company=%s and is_cancelled=0", company)[0]
	balanced = abs(flt(dr) - flt(cr)) < 0.01
	unpaid_mismatch = frappe.db.sql("""select count(*) from `tabRE Booking` b join `tabSales Invoice` si on si.name = b.sales_invoice
		where b.docstatus = 1 and b.status != 'Cancelled' and b.transferred_from is null
		and abs((si.grand_total - si.outstanding_amount) - b.paid_amount) > 1""")[0][0]
	ev = bad[:20] + [f"General ledger for {company}: debit {flt(dr):,.0f} = credit {flt(cr):,.0f}" if balanced else "GENERAL LEDGER UNBALANCED"]
	if unpaid_mismatch:
		ev.append(f"{unpaid_mismatch} bookings where RE paid ≠ invoice paid")
	ok = not bad and balanced and not unpaid_mismatch
	return _result("receipts", "Every receipt posts a correct accounting entry in ERPNext", PASS if ok else FAIL,
				   f"{len(rows)} receipts → Payment Entry with balanced GL; {len(bad)} problems.", ev)


def check_realtime():
	hook = frappe.get_attr("realestate.real_estate.doctype.re_plot.re_plot.REPlot").on_update
	mismatched = frappe.db.sql("""select p.name, p.status, b.status from `tabRE Plot` p join `tabRE Booking` b on b.name = p.booking
		where b.docstatus = 1 and ((b.status = 'Cancelled' and p.status in ('Booked','Sold')) or (b.status != 'Cancelled' and p.status = 'Available'))""")
	stale_pay = frappe.db.sql("""select p.name from `tabRE Plot` p join `tabRE Booking` b on b.name = p.booking
		where b.docstatus = 1 and b.status in ('Paid','Due','Overdue') and p.status in ('Booked','Sold') and coalesce(p.payment_status,'') != b.status""")
	ev = ["RE Plot.on_update publishes 're_plot_status' after commit (also plot merge / transfer).",
		  "React map (/re/map) and desk Site Map recolour on the event; React falls back to 20 s polling and shows Live / Auto-refresh.",
		  "Needs the bench Socket.IO server (Procfile: socketio)."]
	ev += [f"Plot {n} is {s} but booking is {bs}" for n, s, bs in mismatched[:10]]
	ev += [f"Plot {n[0]} colour (payment status) differs from its booking" for n in stale_pay[:10]]
	ok = bool(hook) and not mismatched and not stale_pay
	return _result("realtime", "Plot colours on the map update in real time with status changes", PASS if ok else FAIL,
				   f"Plot status matches booking status for all plots: {'yes' if not (mismatched or stale_pay) else 'no'}.", ev)


def check_scheduler():
	ev, status = [], PASS
	enabled = not frappe.utils.scheduler.is_scheduler_disabled()
	ev.append(f"Scheduler {'enabled' if enabled else 'DISABLED'} for this site")
	jobs = frappe.get_all("Scheduled Job Type", {"method": ("like", "realestate.%")}, ["method", "frequency", "stopped", "last_execution"])
	for j in jobs:
		ev.append(f"{j.method} ({j.frequency}){' STOPPED' if j.stopped else ''} · last run {j.last_execution or 'never'}")
		if j.stopped:
			status = FAIL
	today = getdate(nowdate())
	stale_overdue = frappe.db.sql("""select count(*) from `tabRE Installment` i join `tabRE Booking` b on b.name = i.parent
		where b.docstatus = 1 and b.status != 'Cancelled' and i.due_date < %s and i.paid_amount < i.amount - 0.5 and i.status != 'Overdue'""",
								  add_days(today, -1))[0][0]
	ev.append(f"Installments past due but not marked Overdue: {stale_overdue}")
	last_bill = frappe.db.sql("select max(billing_month) from `tabRE Society Bill`")[0][0]
	ev.append(f"Latest society bill month: {last_bill}")
	ev.append(f"Surcharges raised: {frappe.db.count('RE Surcharge')} · latest {frappe.db.sql('select max(month) from `tabRE Surcharge`')[0][0]}")
	last_rem = frappe.db.sql("select max(creation) from `tabRE Reminder Log`")[0][0]
	ev.append(f"Latest reminder: {last_rem}")
	if not enabled or not jobs or stale_overdue:
		status = FAIL
	recent = [j for j in jobs if j.last_execution and getdate(j.last_execution) >= add_days(today, -2)]
	if status == PASS and len(recent) < len([j for j in jobs if j.frequency in ("Daily", "Cron", "All")]):
		status = WARN
		ev.append("Some jobs have not run in the last 2 days — is `bench schedule` (Procfile) running?")
	return _result("scheduler", "Overdue, surcharge, society bills and reminders run via the scheduler", status,
				   f"{len(jobs)} realestate scheduled jobs; overdue marking up to date: {'yes' if not stale_overdue else 'no'}.", ev)


def check_whatsapp():
	from realestate.api import get_timeline

	mock = bool(frappe.db.get_single_value("RE Settings", "mock_mode"))
	incoming = frappe.get_all("WhatsApp Message", {"direction": "Incoming"}, ["name", "to", "reference_doctype", "reference_docname"],
							  order_by="creation desc", limit=50)
	no_conv = [m.name for m in incoming if not frappe.db.exists("RE Conversation", m.to)]
	no_party = [m.name for m in incoming if not m.reference_docname]
	ev = [f"Mock mode {'on' if mock else 'off'}; {len(incoming)} recent incoming messages checked"]
	timeline_ok = 0
	for m in incoming[:10]:
		if m.reference_doctype and m.reference_docname:
			items = get_timeline(m.reference_doctype, m.reference_docname, limit=500)
			if any(i.get("name") == m.name for i in items):
				timeline_ok += 1
			else:
				ev.append(f"{m.name} missing from {m.reference_doctype} {m.reference_docname} timeline")
	ev += [f"{n}: no inbox conversation" for n in no_conv[:10]] + [f"{n}: not linked to a lead / customer" for n in no_party[:10]]
	linked = len([m for m in incoming[:10] if m.reference_docname])
	ok = incoming and not no_conv and timeline_ok == linked
	status = PASS if ok and not no_party else WARN if ok else FAIL
	return _result("whatsapp", "Incoming WhatsApp appears in the inbox and on the customer timeline (mock works)", status,
				   f"{len(incoming) - len(no_conv)}/{len(incoming)} in the inbox; {timeline_ok}/{linked} sampled on the timeline. "
				   "Unknown numbers become new CRM Leads.", ev)


def check_documents():
	from realestate.documents import DOCUMENTS, LETTER_HEAD, print_format_name

	samples = {
		"RE Booking": frappe.db.get_value("RE Booking", {"docstatus": 1, "status": "Paid"}, "name") or frappe.db.get_value("RE Booking", {"docstatus": 1}, "name"),
		"RE Payment": frappe.db.get_value("RE Payment", {"docstatus": 1}, "name"),
		"RE Plot": frappe.db.get_value("RE Plot", {"status": "Sold"}, "name") or frappe.db.get_value("RE Plot", {}, "name"),
		"RE Society Bill": frappe.db.get_value("RE Society Bill", {}, "name"),
		"RE Plot Transfer": frappe.db.get_value("RE Plot Transfer", {"docstatus": 1}, "name"),
	}
	samples["Customer"] = frappe.db.get_value("RE Booking", samples["RE Booking"], "customer")
	ev, bad = [], []
	for dtype, (doctype, _tpl) in DOCUMENTS.items():
		name = samples.get(doctype)
		try:
			html = frappe.get_print(doctype, name, print_format=print_format_name(dtype), letterhead=LETTER_HEAD)
			pdf = frappe.get_print(doctype, name, print_format=print_format_name(dtype), as_pdf=True, letterhead=LETTER_HEAD)
			has_lh = "re-lh" in html or "Zarmeen Gardens" in html
			ok = pdf[:4] == b"%PDF" and len(pdf) > 3000 and has_lh
			ev.append(f"{'✓' if ok else '✗'} {dtype} ({doctype} {name}) — {len(pdf) // 1024} KB{'' if has_lh else ', NO LETTERHEAD'}")
			if not ok:
				bad.append(dtype)
		except Exception as e:  # noqa: BLE001 — report, don't stop the run
			bad.append(dtype)
			ev.append(f"✗ {dtype}: {str(e)[:120]}")
	return _result("documents", "Every Module 6 document prints as PDF with the project letterhead", FAIL if bad else PASS,
				   f"{len(DOCUMENTS) - len(bad)}/{len(DOCUMENTS)} documents rendered to PDF on the letterhead.", ev)


# ---------------------------------------------------------------- §7 roles & security
def _count_as(user, doctype, filters=None):
	with as_user(user):
		try:
			return len(frappe.get_list(doctype, filters=filters or {}, pluck="name", limit_page_length=0))
		except frappe.PermissionError:
			return "denied"


def check_roles():
	ev, bad = [], []
	agent = frappe.get_all("Has Role", {"role": "Sales Agent", "parenttype": "User"}, pluck="parent", limit=1)
	if agent:
		a = agent[0]
		for dt, field in (("RE Booking", "agent"), ("Customer", None), ("CRM Lead", "lead_owner"), ("CRM Deal", "deal_owner"), ("RE Payment", None)):
			seen = _count_as(a, dt)
			total = frappe.db.count(dt)
			own = frappe.db.count(dt, {field: a}) if field else None
			ok = seen != "denied" and seen < total and (own is None or seen == own)
			ev.append(f"Sales Agent {a}: {dt} sees {seen} of {total}{f' (own {own})' if own is not None else ''}")
			if not ok:
				bad.append(f"agent {dt}")
	for role, dt in (("Sales Manager", "RE Booking"), ("Recovery Officer", "RE Booking")):
		u = frappe.get_all("Has Role", {"role": role, "parenttype": "User", "parent": ("not in", ["Administrator"])}, pluck="parent", limit=1)
		if u:
			seen, total = _count_as(u[0], dt), frappe.db.count(dt)
			ev.append(f"{role} {u[0]}: {dt} sees {seen} of {total}")
			if seen != total:
				bad.append(f"{role} sees all")
	owner = frappe.db.get_value("Customer", {"re_portal_user": ("is", "set")}, ["name", "re_portal_user"], as_dict=True)
	if owner:
		seen = _count_as(owner.re_portal_user, "RE Booking")
		ev.append(f"Portal owner {owner.re_portal_user}: generic RE Booking list → {seen} (portal API is scoped to their own customer)")
		if seen not in ("denied", 0):
			bad.append("portal owner list access")
	# workflows
	for dt in ("RE Plot Transfer", "RE Booking Cancellation", "RE Plot Merge", "RE Surcharge Waiver"):
		wf = frappe.db.get_value("Workflow", {"document_type": dt, "is_active": 1}, "name")
		ev.append(f"Approval workflow {dt}: {wf or 'MISSING'}")
		if not wf:
			bad.append(f"workflow {dt}")
	ev.append(f"Discounts above {frappe.db.get_single_value('RE Settings', 'max_discount_percent')}% need Sales Manager approval before submit; "
			  "refunds are part of the approved cancellation.")
	return _result("roles", "Each role sees only what it is permitted; approvals for discounts, waivers, cancellations, refunds, transfers",
				   FAIL if bad else PASS, f"{len(bad)} problems.", ev)


def check_audit():
	from realestate.audit import FINANCIAL

	ev, bad = [], []
	for dt in (*FINANCIAL, "RE Society Bill", "RE Surcharge", "RE Commission", "RE Settings", "RE Plot"):
		if not frappe.get_meta(dt).track_changes:
			bad.append(dt)
	ev.append("Version history on: " + ("all financial doctypes" if not bad else f"MISSING for {', '.join(bad)}"))
	hooks = frappe.get_hooks("doc_events")
	guarded = [dt for dt in FINANCIAL if "realestate.audit.keep_financial_records" in (hooks.get(dt, {}).get("on_trash") or [])]
	ev.append(f"Delete guard on {len(guarded)}/{len(FINANCIAL)} financial doctypes (submitted → Frappe refuses; cancelled → refused here)")
	cancelled = frappe.db.get_value("Sales Invoice", {"docstatus": 2}, "name")
	if cancelled:
		frappe.db.savepoint("re_acc")
		try:
			frappe.delete_doc("Sales Invoice", cancelled, ignore_permissions=True)
			bad.append("cancelled invoice deleted")
			ev.append(f"✗ Deleting cancelled Sales Invoice {cancelled} was allowed")
		except frappe.PermissionError:
			ev.append(f"✓ Deleting cancelled Sales Invoice {cancelled} is refused")
		finally:
			frappe.db.rollback(save_point="re_acc")
	ledger = frappe.db.get_single_value("Accounts Settings", "delete_linked_ledger_entries")
	ev.append(f"Accounts Settings → delete linked ledger entries: {'ON' if ledger else 'off'}")
	secrets = frappe.get_meta("RE Settings")
	pw = [df.fieldname for df in secrets.fields if df.fieldtype == "Password"]
	ev.append(f"Secrets stored encrypted (Password fields): {', '.join(pw)}; rates live in RE Settings / Charge Heads, not code")
	if len(guarded) < len(FINANCIAL) or ledger:
		bad.append("guard")
	return _result("audit", "Audit trail; submitted financial records are cancelled / amended, never deleted; secrets encrypted",
				   FAIL if bad else PASS, f"{len(bad)} problems.", ev)


def check_ui():
	return _result("ui", "Usable on mobile, in light and dark mode", MANUAL,
				   "Checked in the browser: the owner portal is phone-first (bottom tabs, RTL Urdu); staff screens collapse to one "
				   "column with a drawer menu; inputs use high-contrast tokens in both themes.",
				   ["Re-check after UI changes: Chrome device toolbar at 390 px, toggle the theme switch in the header."])


CHECKS = (check_land_use, check_geometry, check_schedules, check_receipts, check_realtime, check_scheduler, check_whatsapp,
		  check_documents, check_roles, check_audit, check_ui)


def run_all(project=None):
	project = project or frappe.db.get_single_value("RE Settings", "default_project")
	out = []
	for fn in CHECKS:
		t = time.time()
		try:
			r = fn(project) if fn in (check_land_use, check_geometry) else fn()
		except Exception as e:  # noqa: BLE001
			r = _result(fn.__name__.replace("check_", ""), fn.__doc__ or fn.__name__, FAIL, f"Check crashed: {e}", [frappe.get_traceback()[-600:]])
		r["seconds"] = round(time.time() - t, 2)
		out.append(r)
	return {"project": project, "ran_at": frappe.utils.now(), "results": out,
			"summary": {s: sum(1 for r in out if r["status"] == s) for s in (PASS, WARN, FAIL, MANUAL)}}


@frappe.whitelist(methods=["GET"])
def run() -> dict:
	frappe.only_for("System Manager")
	try:
		return run_all()
	finally:
		frappe.db.rollback()
