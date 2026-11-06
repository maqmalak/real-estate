"""Demo land purchase for Zarmeen Gardens (Module 0): the scheme's 400 Kanal split into ~25 khasras with 1–4 co-owners
each, deals shaped like the client's Land Purchase Status report (single and multi-owner, ACRE / KANAL / MARLA rates,
extensions, fully paid with registry done, part paid, overdue), a partially signed contract, one with a cancelled
owner, a disputed khasra with a court case, a plot adjustment, due diligence, vault papers and capitalised land cost.

	bench --site realestate execute realestate.demo.land.run      # add to an existing demo (idempotent)
	bench --site realestate execute realestate.demo.land.wipe     # remove the land demo only

Demo only: needs mock mode on and the default project flagged is_demo; it never touches records without is_demo.
"""

import json
import random

import frappe
from frappe.model.workflow import apply_workflow
from frappe.utils import add_days, add_months, flt, getdate, nowdate

from realestate import land
from realestate import land_calc as L

FIRST = ["Muhammad Aslam", "Ghulam Rasool", "Falak Sher", "Aalam Sher", "Muhammad Ashraf", "Allah Ditta", "Noor Muhammad", "Bashir Ahmad",
		 "Muhammad Yousaf", "Khadim Hussain", "Riaz Ahmad", "Sardar Ali", "Muhammad Iqbal", "Abdul Ghafoor", "Mehr Din", "Fazal Karim",
		 "Muhammad Akram", "Ghulam Qadir", "Sher Muhammad", "Manzoor Hussain", "Orangzaib", "Imran Khan", "Ahsan Ali", "Nazir Ahmad",
		 "Muhammad Boota", "Abdul Rehman", "Shaukat Ali", "Liaqat Ali", "Barkat Ali", "Muhammad Nawaz", "Zulfiqar Ali", "Anwar Hussain",
		 "Sakina Bibi", "Rasheedan Bibi", "Naseem Akhtar", "Parveen Bibi"]
FATHER = ["Ghulam Rasool", "Fateh Muhammad", "Allah Rakha", "Wali Muhammad", "Karam Din", "Nizam Din", "Chiragh Din", "Sultan Ahmad",
		  "Jalal Din", "Rehmat Ali", "Muhammad Din", "Faqir Muhammad"]
MAUZA = ["Mauza Thatta Gujran", "Mauza Bhaini", "Mauza Kot Abdullah"]
BANKS = ["HBL", "MCB", "UBL", "Meezan Bank", "Bank Alfalah", "Allied Bank"]
ACQUIRED = ["Acquired"] * 10 + ["Possession Taken"] * 4 + ["Registry / Mutation Done"] * 4


def _guard() -> str:
	project = frappe.db.get_single_value("RE Settings", "default_project")
	if not (frappe.db.get_single_value("RE Settings", "mock_mode") and project and frappe.db.get_value("RE Project", project, "is_demo")):
		frappe.throw("The land demo runs only on the demo project with mock mode on")
	return project


def run():
	project = _guard()
	if frappe.db.exists("RE Land Parcel", {"is_demo": 1}):
		print("Land demo already exists — wipe it first (realestate.demo.land.wipe)")
		return
	from realestate import land_accounts

	land.setup()
	land_accounts.setup()
	real_enqueue = frappe.enqueue
	frappe.enqueue = lambda method, *a, **k: real_enqueue(method, *a, **{**k, "now": True})
	frappe.flags.in_demo = True
	try:
		_run(project, random.Random(7))
	finally:
		frappe.enqueue = real_enqueue
		frappe.flags.in_demo = False
		frappe.flags.land_posting_date = None
	frappe.db.commit()
	print("Land demo ready")


# ---------------------------------------------------------------- geometry: ~25 khasras covering the boundary
def _cells(project) -> list[dict]:
	from shapely.geometry import box, mapping, shape

	b = json.loads(frappe.db.get_value("RE Project", project, "boundary_geojson"))
	boundary = shape(b.get("geometry", b) if b.get("type") == "Feature" else b).buffer(0)
	minx, miny, maxx, maxy = boundary.bounds
	nx, ny = 6, 5
	xs = [minx + (maxx - minx) * i / nx for i in range(nx + 1)]
	ys = [miny + (maxy - miny) * i / ny for i in range(ny + 1)]
	cells = []
	for j in range(ny):
		for i in range(nx):
			piece = boundary.intersection(box(xs[i], ys[j], xs[i + 1], ys[j + 1]))
			if piece.is_empty or piece.area < boundary.area * 0.004:
				continue
			if piece.geom_type == "MultiPolygon":
				piece = max(piece.geoms, key=lambda g: g.area)
			cells.append({"geom": mapping(piece), "share": piece.area, "row": j, "col": i})
	total = sum(c["share"] for c in cells)
	for c in cells:
		c["share"] /= total
	return cells


def _extension_cells(project, n_rows=4, n_cols=2) -> list[dict]:
	"""Khasras just east of the scheme's boundary: land being bought for a Phase 2 extension (outside the project map)."""
	from shapely.geometry import box, mapping, shape

	b = json.loads(frappe.db.get_value("RE Project", project, "boundary_geojson"))
	boundary = shape(b.get("geometry", b) if b.get("type") == "Feature" else b).buffer(0)
	minx, miny, maxx, maxy = boundary.bounds
	gap, width = (maxx - minx) * 0.02, (maxx - minx) * 0.34
	x0 = maxx + gap
	cells = []
	for j in range(n_rows):
		for i in range(n_cols):
			cell = box(x0 + width * i / n_cols, miny + (maxy - miny) * j / n_rows, x0 + width * (i + 1) / n_cols, miny + (maxy - miny) * (j + 1) / n_rows)
			cells.append({"geom": mapping(cell), "row": j, "col": 6 + i, "extension": True})
	return cells


def _restore_boundary(project):
	"""Put back the project's original (surveyed) boundary if "Merge into boundary" replaced it — the acquired khasras are
	cut from this boundary, so the acquired land and the project map match exactly."""
	if frappe.db.exists("RE Land Use", {"parent": project, "label": "E Block (Phase 2)"}):
		return  # already the surveyed boundary + Phase 2
	for v in frappe.get_all("Version", {"ref_doctype": "RE Project", "docname": project}, ["data"], order_by="creation asc", limit=0):
		changed = json.loads(v.data or "{}").get("changed") or []
		old = next((o for f, o, _n in changed if f == "boundary_geojson" and o), None)
		if old:
			if old != frappe.db.get_value("RE Project", project, "boundary_geojson"):
				doc = frappe.get_doc("RE Project", project)
				doc.boundary_geojson = old
				doc.flags.ignore_permissions = True
				doc.save()
				print("Project boundary restored to the surveyed outline")
			return


def _phase2_project(project):
	"""E Block (added by the map-import showcase) lies just east of the surveyed boundary. It is Phase 2 land that was bought
	before it was plotted, so the project map becomes the surveyed boundary plus E Block (joined across the 17 m strip), the
	project's total land grows to match and the land-use table is re-based with E Block's share."""
	from shapely.geometry import mapping, shape

	from realestate.geo import area_kanal

	e_geo = frappe.db.get_value("RE Block", {"project": project, "name": "E Block"}, "geojson")
	doc = frappe.get_doc("RE Project", project)
	if not e_geo or any(r.label == "E Block (Phase 2)" for r in doc.land_use):
		return
	b = shape(json.loads(doc.boundary_geojson))
	e = shape(json.loads(e_geo))
	if b.buffer(1e-7).contains(e):
		return
	d = 1.2e-4  # ~12 m: closes the strip between the scheme and E Block, keeps square corners elsewhere
	joined = b.union(e).buffer(d, join_style=2).buffer(-d, join_style=2)
	if joined.geom_type == "MultiPolygon":
		joined = max(joined.geoms, key=lambda g: g.area)
	geom = mapping(joined)
	old_total = flt(doc.total_area_kanal) or 400
	total = round(area_kanal(geom), 2)
	rows = [{"category": r.category, "label": r.label, "details": r.details, "kanal": flt(r.area_kanal)} for r in doc.land_use]
	rows.append({"category": "Residential", "label": "E Block (Phase 2)", "details": "Phase 2 extension east of the scheme (40 plots)", "kanal": round(total - old_total, 2)})
	pcts = [round(r["kanal"] * 100 / total, 4) for r in rows]
	pcts[-1] = round(100 - sum(pcts[:-1]), 4)
	doc.boundary_geojson = json.dumps(geom)
	doc.total_area_kanal = total
	doc.set("land_use", [{"category": r["category"], "label": r["label"], "details": r["details"], "percent": pc} for r, pc in zip(rows, pcts)])
	doc.flags.ignore_permissions = True
	doc.save()
	print(f"Project map = surveyed boundary + E Block: {total} Kanal (was {old_total:g})")


def _split(total_sqft: float, parts: int, rng, ms: float) -> list[float]:
	"""Split an area into co-owner shares in whole marlas (the last share takes the rest, in sqft)."""
	marlas = int(total_sqft // ms)
	weights = [rng.uniform(0.6, 1.4) for _ in range(parts)]
	out, used = [], 0
	for w in weights[:-1]:
		m = max(1, int(marlas * w / sum(weights)))
		out.append(m * ms)
		used += m * ms
	out.append(round(total_sqft - used, 2))
	return out


def _parts(sqft: float, ms: float) -> tuple[int, int, float]:
	return L.split(sqft, ms)


# ---------------------------------------------------------------- records
def _owner(rng, i):
	name = FIRST[i % len(FIRST)]
	female = name.endswith(("Bibi", "Akhtar"))
	doc = frappe.get_doc({"doctype": "RE Land Owner", "owner_name": name, "relation": "W/O" if female else "S/O", "father_name": FATHER[(i * 7) % len(FATHER)],
						  "cnic": f"35201-77{i:05d}-{(i % 9) + 1}", "mobile_no": f"0300{7700000 + i:07d}", "address": f"{MAUZA[i % 3]}, Tehsil Raiwind, Lahore",
						  "bank_name": BANKS[i % len(BANKS)], "account_title": name, "iban": f"PK{36 + i % 50}{BANKS[i % len(BANKS)][:4].upper()}000{i:012d}",
						  "is_demo": 1})
	if i % 17 == 5:  # an owner who signs through an attorney
		doc.poa_date = add_days(nowdate(), -900)
	doc.insert(ignore_permissions=True)
	return doc


def _users():
	lm = "tariq.mahmood@zarmeen.example"
	return lm if frappe.db.exists("User", lm) else None


def _parcel(project, idx, cell, sqft, owners, stage, responsible, rng, ms):
	k, m, s = _parts(sqft, ms)
	sarsai = round(s / (ms / L.SARSAI_PER_MARLA), 2)
	shares = _split(L.to_sqft(k, m, sarsai=sarsai, ms=ms), len(owners), rng, ms)
	square = 40 + cell["row"] * 3 + cell["col"] // 2
	p = frappe.get_doc({
		"doctype": "RE Land Parcel", "project": project, "mauza": MAUZA[cell["row"] % 3], "tehsil": "Raiwind", "district": "Lahore",
		"khewat_no": f"{110 + idx * 2}-{111 + idx * 2}" if idx % 4 == 0 else str(110 + idx * 2), "khatooni_no": str(205 + idx * 3),
		"square_no": str(square), "killa_nos": f"{1 + idx % 25},{2 + idx % 24}" if idx % 3 else f"{5 + idx % 20}/2,{16 + idx % 9}",
		"khasra_nos": f"{1200 + idx * 7}" + (f"//{idx % 3 + 1}" if idx % 5 == 2 else ""), "area_kanal": k, "area_marla": m, "area_sarsai": sarsai,
		"land_type": ["Nehri", "Chahi", "Barani", "Nehri", "Banjar"][idx % 5], "current_use": ["Wheat / rice cultivation", "Fallow", "Fodder", "Orchard"][idx % 4],
		"access_road": "Raiwind Road (metalled)" if cell["row"] == 0 else "Katcha rasta", "geojson": json.dumps(cell["geom"]), "responsible": responsible,
		"asking_rate": [3_100_000, 3_250_000, 3_400_000][idx % 3], "rate_unit": "Kanal", "is_demo": 1,
		"owners": [{"land_owner": o.name, **dict(zip(("share_kanal", "share_marla", "share_sqft"), _parts(sh, ms)))} for o, sh in zip(owners, shares)],
	})
	p.insert(ignore_permissions=True)
	_diligence(p, stage, rng)
	return p


def _diligence(p, stage, rng):
	early = stage in ("Identified", "Under Negotiation")
	for c in p.checks:
		if stage == "Disputed" and c.item == "Litigation check":
			c.status, c.remarks = "Failed", "Civil suit for partition filed by a co-owner's heirs"
		elif early:
			c.status = "Verified" if rng.random() < 0.3 else "Pending"
		elif stage == "Due Diligence":
			c.status = "Verified" if rng.random() < 0.6 else "Pending"
		else:
			c.status = "Verified"
		if c.status == "Verified":
			c.verified_by, c.verified_on = "Administrator", add_days(nowdate(), -rng.randint(200, 700) if not early else -rng.randint(5, 40))
	p.save(ignore_permissions=True)


def _set_stage(p, stage, when, note=None):
	if p.stage == stage:
		return
	p.reload()
	p.stage = stage
	p.flags.ignore_permissions = True
	p.save()
	if p.stages:
		p.stages[-1].db_set({"stage_date": when, "notes": note})


def _approve(doc):
	apply_workflow(doc, "Submit for Approval")
	doc.reload()
	apply_workflow(doc, "Approve")
	doc.reload()


def _pay(deal, ser, amount, on, kind="Installment", wht=0, mode=None, rng=None):
	frappe.flags.land_posting_date = on
	p = frappe.get_doc({"doctype": "RE Land Payment", "deal": deal, "ser": ser, "amount": round(amount), "payment_kind": kind, "posting_date": on,
						"mode_of_payment": mode or ("Pay Order" if amount > 5_000_000 else "Cheque"), "instrument_no": f"{'PO' if amount > 5_000_000 else 'CHQ'}-{rng.randint(100000, 999999) if rng else 1}",
						"instrument_date": on, "bank_name": "HBL Raiwind Road", "wht_rate": wht, "received_by_seller": 1, "seller_signed_on": on})
	p.insert(ignore_permissions=True)
	if p.approval_required:
		_approve(p)
	else:
		apply_workflow(p, "Pay")
	return p


def _deal(project, desc, land_for, parcel_lines, deal_date, rng, unit, rate, *, sign=True, witnesses=True, approve=True, token_pct=0.05,
		  installments=2, registry_days=240):
	"""parcel_lines: [(parcel, owner, sqft, line_type, group_members)]; returns the saved deal."""
	ms = land.marla_sqft()
	lines = []
	for parcel, owner, sqft, line_type, group in parcel_lines:
		k, m, s = _parts(sqft, ms)
		line_unit = unit if not isinstance(unit, list) else unit[len(lines) % len(unit)]
		line_rate = rate if not isinstance(rate, list) else rate[len(lines) % len(rate)]
		lines.append({"land_owner": owner.name, "parcel": parcel.name, "kanal": k, "marla": m, "sqft": s, "unit": line_unit, "rate": line_rate,
					  "line_type": line_type, "group_members": group, "signed": int(sign), "thumb_impression": int(sign),
					  "signed_on": add_days(deal_date, rng.randint(1, 10)) if sign else None})
	registry = add_days(deal_date, registry_days)
	d = frappe.get_doc({
		"doctype": "RE Land Deal", "deal_date": deal_date, "description": desc, "land_for": land_for, "project": project,
		"khewat_no": parcel_lines[0][0].khewat_no, "khatooni_no": parcel_lines[0][0].khatooni_no, "square_no": parcel_lines[0][0].square_no,
		"killa_nos": parcel_lines[0][0].killa_nos, "buyer_company": frappe.db.get_single_value("RE Settings", "company"),
		"buyer_signatory": "Ch. Zarmeen Ahmad, CEO", "rate_unit": unit if isinstance(unit, str) else unit[0], "default_rate": rate if not isinstance(rate, list) else rate[0],
		"token_date": add_days(deal_date, 2), "agreement_date": add_days(deal_date, 15), "installments": installments, "installment_months": 2,
		"first_installment_date": add_days(deal_date, 60), "registry_deadline": registry, "possession_date": add_days(registry, 30),
		"jurisdiction": "Civil Courts, Raiwind", "payment_terms": "Token on signing, agreement amount within 15 days, balance in installments and at registry.",
		"penalty_clause": "Buyer delay: 1% per month on the late amount. Seller default: token refunded double (do guna bayana).",
		"cancellation_clause": "Either side may cancel before registry with the penalty above; amounts paid are refunded within 30 days.",
		"witness_1_name": "Haji Muhammad Saleem", "witness_1_cnic": "35201-1111111-1", "witness_1_signed": int(witnesses),
		"witness_2_name": "Rana Shahid Mehmood", "witness_2_cnic": "35201-2222222-3", "witness_2_signed": int(witnesses),
		"stamp_paper_value": 3000 if len(lines) < 3 else 5000, "is_demo": 1, "lines": lines,
	})
	d.flags.ignore_permissions = True
	d.insert()
	d.reload()
	token_total = round(d.due_amount * token_pct, -3)
	d.token_amount, d.agreement_amount = token_total, round(d.due_amount * 0.2, -3)
	d.save(ignore_permissions=True)
	d.make_schedule()
	d.reload()
	if approve:
		frappe.flags.land_posting_date = add_days(deal_date, 3)
		_approve(d)
	return d


def _settle(d, rng, upto: float = 1.0, wht_every: int = 3, final_on=None):
	"""Pay each owner's schedule rows in order up to `upto` of their net due, on (or around) their due dates."""
	d.reload()
	today = getdate(nowdate())
	for i, line in enumerate([r for r in d.lines if r.status != "Cancelled"]):
		target = flt(line.net_due) * upto - flt(line.paid_amount) - flt(line.adjusted_amount)
		for row in sorted([s for s in d.schedule if s.ser == line.ser and s.status != "Refund"], key=lambda s: getdate(s.due_date or d.deal_date)):
			if target <= 1000:
				break
			pay_on = getdate(row.due_date or d.deal_date)
			if final_on and row.label.startswith("Final"):
				pay_on = getdate(final_on)
			if pay_on > today:
				break
			pay_on = add_days(pay_on, rng.randint(-3, 6))
			if getdate(pay_on) > today:
				pay_on = today
			amount = min(flt(row.amount) - flt(row.paid), target)
			if amount <= 1000:
				continue
			kind = "Token" if row.label.startswith("Token") else "Agreement" if row.label.startswith("Agreement") else "Final" if row.label.startswith("Final") else "Extension" if row.label.startswith("Extension") else "Installment"
			_pay(d.name, line.ser, amount, pay_on, kind, wht=1 if (i + len(row.label)) % wht_every == 0 and kind != "Token" else 0, rng=rng)
			target -= amount
		d.reload()


def _vault(p, deal, project, docs):
	for doc_type, title, days in docs:
		frappe.get_doc({"doctype": "RE Vault Document", "title": f"{title} — Khasra {p.khasra_nos}", "project": project, "land_parcel": p.name,
						"land_deal": deal, "document_type": doc_type, "authority": "Revenue Department, Tehsil Raiwind" if doc_type in ("Fard", "Mutation (Intiqal)", "Jamabandi") else None,
						"reference_no": f"{doc_type[:3].upper()}-{p.khasra_nos}", "issue_date": add_days(nowdate(), -days),
						"expiry_date": add_days(nowdate(), 60 - days // 10) if doc_type == "Fard" else None, "renewal_alert_days": 30}).insert(ignore_permissions=True)


def _transfer_rates():
	"""Demo Punjab 2026-27 transfer cost rates (replace with the current Finance Act / FBR figures)."""
	for name, rate, basis in (("Stamp Duty", 3, "% of value"), ("Registration Fee", 1, "% of value"), ("Mutation Fee", 1, "% of value"), ("CVT", 1, "% of value"),
							  ("Advance Tax 236K", 3, "% of value"), ("TMA / District Council Fee", 1, "% of value"), ("Patwari Fee", 5000, "Per Kanal"),
							  ("Legal Fee", 150000, "Fixed per deal"), ("Broker Commission", 1, "% of value")):
		if not frappe.db.exists("RE Transfer Cost Rate", {"province": "Punjab", "fiscal_year": "2026-27", "cost_head": name}):
			frappe.get_doc({"doctype": "RE Transfer Cost Rate", "province": "Punjab", "fiscal_year": "2026-27", "cost_head": name, "basis": basis, "rate": rate,
							"notes": "Demo rate — confirm with the current Punjab Finance Act / FBR notification"}).insert(ignore_permissions=True)


def _run(project, rng):
	from realestate.geo import area_kanal

	ms = land.marla_sqft()
	_restore_boundary(project)
	_phase2_project(project)
	_transfer_rates()
	target = flt(frappe.db.get_value("RE Project", project, "total_area_kanal")) or 400
	# the scheme: every khasra inside the boundary is acquired, and together they are exactly the project's land
	cells = _cells(project)
	total_sqft = L.to_sqft(target, ms=ms)
	areas = [round(c["share"] * total_sqft / ms) * ms for c in cells]  # whole marlas per khasra
	areas[-1] = round(total_sqft - sum(areas[:-1]), 2)
	stages = [(ACQUIRED * 3)[i] for i in range(len(cells))]
	# Phase 2: khasras outside the boundary still moving through the pipeline (never plotted)
	ext = _extension_cells(project)
	others = ["Payment in Progress"] * 3 + ["Agreement Signed", "Token Paid", "Due Diligence", "Under Negotiation", "Disputed"]
	cells += ext
	areas += [round(L.to_sqft(area_kanal(c["geom"]), ms=ms) / ms) * ms for c in ext]
	stages += others[:len(ext)]
	responsible = _users()
	owners_iter = iter(range(400))
	owner_docs = []
	parcels = []
	for idx, (cell, sqft, stage) in enumerate(zip(cells, areas, stages)):
		n = [1, 2, 2, 3, 4, 1, 2, 3][idx % 8]
		owners = [_owner(rng, next(owners_iter)) for _ in range(n)]
		owner_docs += owners
		p = _parcel(project, idx, cell, sqft, owners, stage, responsible, rng, ms)
		parcels.append((p, owners, stage))
	frappe.db.commit()
	print(f"{len(parcels)} khasras ({len(ext)} for the Phase 2 extension), {len(owner_docs)} owners")

	today = getdate(nowdate())
	acquired = [x for x in parcels if x[2] in ACQUIRED]
	deals = []
	# --- acquired land: deals two khasras at a time, fully paid, registry / mutation done (2024 – 2025)
	units = [("Acre", 25_000_000), ("Kanal", 3_150_000), ("Marla", 178_125), ("Acre", 26_400_000), ("Kanal", 3_300_000)]
	start = getdate("2024-08-05")  # inside the demo fiscal years (from July 2024)
	for gi in range(0, len(acquired), 2):
		group = acquired[gi:gi + 2]
		lines = [(p, o, flt(row.share_sqft_total), "Owner", None) for p, owners, _s in group for o, row in zip(owners, p.owners)]
		unit, rate = units[(gi // 2) % len(units)]
		names = [o.owner_name for _p, owners, _s in group for o in owners]
		desc = (" and ".join(names[:2]) + (" etc." if len(names) > 2 else "")) + f" {group[0][1][0].relation} {group[0][1][0].father_name}"
		when = add_days(start, gi * 19)
		d = _deal(project, desc, ["A Block", "B Block", "C Block", "D Block", "Roads & Gates", "Central Park"][(gi // 2) % 6], lines, when, rng, unit, rate,
				  installments=2, registry_days=200)
		d.estimate_transfer_costs()  # stamp duty, registration, mutation, CVT, 236K, fees — posted into the land cost at registry
		frappe.flags.land_posting_date = add_days(when, 200)
		d.post_transfer_costs()
		d.reload()
		if gi == 4:  # one owner asked for more time: an approved extension with an extra amount
			d.request_extension(d.lines[0].ser, 750_000, str(add_days(d.lines[0].mature_date, 75)), "Owner's family share settlement delayed the registry")
			d.reload()
			d.decide_extension(d.extensions[-1].name, 1)
			d.reload()
		if gi == 8:  # plots given instead of part of the cash
			_settle(d, rng, upto=0.55)
			plots = frappe.get_all("RE Plot", {"project": project, "status": "Available", "block": ("like", "%A%")}, ["name"], order_by="name", limit=2)
			if plots:
				frappe.flags.land_posting_date = add_days(when, 150)
				adj = frappe.get_doc({"doctype": "RE Plot Adjustment", "deal": d.name, "ser": d.lines[0].ser, "posting_date": add_days(when, 150),
									  "remarks": "Owner preferred two 5 marla plots in A Block instead of cash", "plots": [{"plot": x.name} for x in plots]})
				adj.insert(ignore_permissions=True)
				_approve(adj)
		_settle(d, rng, upto=0.82 if gi == 12 else 1.0, final_on=add_days(when, 200))  # gi 12: registered, last payment still due
		d.reload()
		for r in d.lines:
			r.status = "Mutation Done" if (gi // 2) % 2 else "Registry Done"
		d.save(ignore_permissions=True)
		for p, _o, stage in group:
			p.reload()
			_set_stage(p, stage, add_days(when, 205 if stage != "Possession Taken" else 240), f"Registry {d.name}")
			_vault(p, d.name, project, [("Fard", "Fard-e-malkiat", 900), ("Iqrar Nama", "Agreement to sell", 700 - gi * 19),
										("Registry Deed", "Registry deed", 480 - gi * 10), ("Mutation (Intiqal)", "Mutation", 450 - gi * 10)])
		deals.append(d)
		if gi in (0, 2, 6):
			d.reload()
			d.capitalise()
		frappe.db.commit()
	print(f"{len(deals)} acquired deals")

	rest = {s: [x for x in parcels if x[2] == s] for s in ("Payment in Progress", "Agreement Signed", "Token Paid", "Due Diligence", "Under Negotiation", "Disputed")}
	# --- payment in progress: one multi-owner contract with a cancelled owner, one with an overdue owner, one on track
	pip = rest["Payment in Progress"]
	if pip:
		p, owners, _ = pip[0]
		lines = [(p, o, flt(row.share_sqft_total), "Owner", None) for o, row in zip(owners, p.owners)]
		d = _deal(project, " and ".join(o.owner_name for o in owners[:2]) + " etc. (multi-owner)", "Phase 2 extension", lines, add_days(today, -260), rng, "Kanal", 3_450_000)
		_settle(d, rng, upto=0.45)
		if len(d.lines) > 1:
			d.request_amendment("Partial Cancellation", "Co-owner withdrew after a family dispute; his share is not bought", ser=d.lines[-1].ser)
			d.reload()
			d.decide_amendment(d.amendments[-1].name, 1)
			d.reload()
		deals.append(d)
	if len(pip) > 1:
		p, owners, _ = pip[1]
		lines = [(p, owners[0], flt(p.owners[0].share_sqft_total), "Owner", "\n".join([owners[0].owner_name, "Imran Khan", "Ahsan Ali"]))] + \
			[(p, o, flt(row.share_sqft_total), "Owner", None) for o, row in zip(owners[1:], p.owners[1:])]
		d = _deal(project, f"{owners[0].owner_name}, Imran, Ahsan etc.", "Phase 2 extension", lines, add_days(today, -330), rng, "Marla", 182_000, registry_days=200)
		_settle(d, rng, upto=0.6)  # the final payment at registry is now past due -> overdue
		deals.append(d)
	if len(pip) > 2:
		p, owners, _ = pip[2]
		lines = [(p, o, flt(row.share_sqft_total), "Owner", None) for o, row in zip(owners, p.owners)]
		d = _deal(project, " and ".join(o.owner_name for o in owners[:2]), "Phase 2 extension", lines, add_days(today, -120), rng, "Acre", 27_000_000, registry_days=300)
		_settle(d, rng, upto=0.4)
		deals.append(d)
	# --- agreement signed (executed, token paid) and a partially signed contract (token paid, one seller still to sign)
	for (p, owners, stage) in rest["Agreement Signed"]:
		lines = [(p, o, flt(row.share_sqft_total), "Owner", None) for o, row in zip(owners, p.owners)]
		d = _deal(project, f"{owners[0].owner_name} {owners[0].relation} {owners[0].father_name}", "Phase 2 extension", lines, add_days(today, -40), rng, "Kanal", 3_600_000)
		_settle(d, rng, upto=0.05)
		deals.append(d)
	for (p, owners, stage) in rest["Token Paid"]:
		lines = [(p, o, flt(row.share_sqft_total), "Owner", None) for o, row in zip(owners, p.owners)]
		d = _deal(project, " and ".join(o.owner_name for o in owners[:3]) + " (partially signed)", "Phase 2 extension", lines, add_days(today, -21), rng,
				  "Kanal", 3_550_000, approve=False, witnesses=False)
		d.reload()
		d.lines[-1].signed = 0
		d.lines[-1].thumb_impression = 0
		d.lines[-1].signed_on = None
		d.witness_1_signed = 1
		d.save(ignore_permissions=True)
		_pay(d.name, d.lines[0].ser, round(d.lines[0].due_amount * 0.05, -3), add_days(today, -18), "Token", rng=rng)
		_set_stage(p, "Token Paid", add_days(today, -18), "Bayana paid; one co-owner still to sign")
		deals.append(d)
	for (p, owners, stage) in rest["Due Diligence"] + rest["Under Negotiation"]:
		_set_stage(p, "Under Negotiation", add_days(today, -50), "Rate offered Rs 3.5M per Kanal")
		if stage == "Due Diligence":
			_set_stage(p, "Due Diligence", add_days(today, -12), "Fard and jamabandi requested from the patwari")
	# --- disputed khasra: a draft deal on hold and a court case
	for (p, owners, stage) in rest["Disputed"]:
		lines = [(p, o, flt(row.share_sqft_total), "Owner", None) for o, row in zip(owners, p.owners)]
		d = _deal(project, f"{owners[0].owner_name} and heirs (disputed)", "Phase 2 extension", lines, add_days(today, -150), rng, "Kanal", 3_000_000,
				  sign=False, witnesses=False, approve=False)
		d.set_status("Disputed", "Heirs of a deceased co-owner filed a partition suit")
		_set_stage(p, "Disputed", add_days(today, -95), "Civil suit filed")
		frappe.get_doc({"doctype": "RE Land Case", "case_title": f"{owners[-1].owner_name} heirs vs {owners[0].owner_name} — partition", "court": "Civil Judge, Raiwind",
						"case_no": "CS-1187/2026", "filed_on": add_days(today, -95), "status": "Under Hearing", "next_hearing": add_days(today, 5),
						"lawyer": "Mian Tariq Advocate", "responsible": responsible, "parties": "Plaintiffs: legal heirs; Defendants: co-owners; Proforma: Zarmeen Developers",
						"deal": d.name, "is_demo": 1, "parcels": [{"parcel": p.name}],
						"notes": "<p>Stay against sale granted on the last date; reply filed. Next date for arguments on the stay.</p>"}).insert(ignore_permissions=True)
		deals.append(d)
	if acquired:
		frappe.get_doc({"doctype": "RE Land Case", "case_title": "Demarcation objection — boundary of khasra " + acquired[0][0].khasra_nos, "court": "Assistant Commissioner, Raiwind",
						"case_no": "REV-55/2025", "filed_on": "2025-03-10", "status": "Settled", "lawyer": "Mian Tariq Advocate", "responsible": responsible,
						"parties": "Adjoining owner vs Zarmeen Developers", "is_demo": 1, "parcels": [{"parcel": acquired[0][0].name}],
						"notes": "<p>Fresh nishandehi by the revenue staff; settled by compromise.</p>"}).insert(ignore_permissions=True)
	if len(acquired) > 3:
		frappe.get_doc({"doctype": "RE Land Case", "case_title": "Pre-emption suit (haq shufa) on khasra " + acquired[3][0].khasra_nos, "court": "Civil Judge, Lahore",
						"case_no": "CS-0412/2026", "filed_on": add_days(today, -60), "status": "Pending", "next_hearing": add_days(today, 12), "lawyer": "Ch. Asif Ali Advocate",
						"responsible": responsible, "parties": "Neighbouring owner vs vendors and Zarmeen Developers", "is_demo": 1, "parcels": [{"parcel": acquired[3][0].name}]}).insert(ignore_permissions=True)
	frappe.flags.land_posting_date = None
	for d in deals:
		d.reload()
		d.refresh_ledger()
	print(f"{len(deals)} deals in all")


# ---------------------------------------------------------------- wipe (demo only)
def wipe(guard: bool = True):
	"""Remove the land demo: its deals, payments, adjustments, parcels, owners, cases, vouchers and suppliers."""
	from realestate.demo.seed import _purge

	if guard:
		_guard()
	deals = frappe.get_all("RE Land Deal", {"is_demo": 1}, pluck="name")
	owners = frappe.get_all("RE Land Owner", {"is_demo": 1}, ["name", "supplier", "customer"])
	payments = frappe.get_all("RE Land Payment", {"deal": ("in", deals or [""])}, pluck="name")
	adjustments = frappe.get_all("RE Plot Adjustment", {"deal": ("in", deals or [""])}, pluck="name")
	adj_rows = frappe.get_all("RE Plot Adjustment Plot", {"parent": ("in", adjustments or [""])}, ["plot", "booking", "receipt"])
	pe = frappe.get_all("Payment Entry", {"re_land_deal": ("in", deals or [""])}, pluck="name")
	pi = frappe.get_all("Purchase Invoice", {"re_land_deal": ("in", deals or [""])}, pluck="name")
	je = frappe.get_all("Journal Entry", {"re_land_deal": ("in", deals or [""])}, pluck="name")
	receipts = [r.receipt for r in adj_rows if r.receipt]
	bookings = [r.booking for r in adj_rows if r.booking]
	si = [b for b in frappe.get_all("RE Booking", {"name": ("in", bookings or [""])}, pluck="sales_invoice") if b]
	for dt, names in (("Payment Entry", pe), ("Journal Entry", je), ("Purchase Invoice", pi), ("Sales Invoice", si)):
		_purge(dt, names)
	frappe.db.delete("RE Payment Allocation", {"parent": ("in", receipts or [""])})
	frappe.db.delete("RE Payment", {"name": ("in", receipts or [""])})
	frappe.db.delete("RE Installment", {"parent": ("in", bookings or [""])})
	frappe.db.delete("RE Commission", {"booking": ("in", bookings or [""])})
	frappe.db.delete("RE Booking", {"name": ("in", bookings or [""])})
	for r in adj_rows:
		frappe.db.set_value("RE Plot", r.plot, {"status": "Available", "payment_status": None, "customer": None, "customer_name": None, "booking": None,
												"mobile_no": None, "land_adjustment": None, "land_deal": None, "society_exempt": 0})
	for dt, names, child in (("RE Land Payment", payments, []), ("RE Plot Adjustment", adjustments, ["RE Plot Adjustment Plot"]),
							 ("RE Land Deal", deals, ["RE Land Deal Line", "RE Land Deal Extension", "RE Land Deal Schedule", "RE Land Deal Amendment"])):
		for c in child:
			frappe.db.delete(c, {"parent": ("in", names or [""])})
		frappe.db.delete(dt, {"name": ("in", names or [""])})
	frappe.db.delete("Workflow Action", {"reference_name": ("in", deals + payments + adjustments or [""])})
	cases = frappe.get_all("RE Land Case", {"is_demo": 1}, pluck="name")
	frappe.db.delete("RE Land Case Parcel", {"parent": ("in", cases or [""])})
	frappe.db.delete("RE Land Case", {"name": ("in", cases or [""])})
	parcels = frappe.get_all("RE Land Parcel", {"is_demo": 1}, pluck="name")
	frappe.db.delete("RE Vault Document", {"land_parcel": ("in", parcels or [""])})
	for c in ("RE Parcel Owner", "RE Parcel Stage", "RE Parcel Check"):
		frappe.db.delete(c, {"parent": ("in", parcels or [""])})
	frappe.db.delete("RE Land Parcel", {"name": ("in", parcels or [""])})
	suppliers = [o.supplier for o in owners if o.supplier]
	customers = [o.customer for o in owners if o.customer]
	frappe.db.delete("Party Link", {"primary_party": ("in", suppliers or [""])})
	frappe.db.delete("Customer", {"name": ("in", customers or [""]), "re_demo": 1})
	frappe.db.delete("Supplier", {"name": ("in", suppliers or [""])})
	frappe.db.delete("RE Land Owner Heir", {"parent": ("in", [o.name for o in owners] or [""])})
	frappe.db.delete("RE Land Owner", {"is_demo": 1})
	frappe.db.delete("Notification Log", {"document_type": ("in", ["RE Land Deal", "RE Land Case"])})
	for prefix, doctype in (("LD-", "RE Land Deal"), ("RE-LP-", "RE Land Payment"), ("RE-PA-", "RE Plot Adjustment"), ("RE-KH-", "RE Land Parcel"),
							("RE-LO-", "RE Land Owner"), ("RE-LC-", "RE Land Case")):
		if not frappe.db.count(doctype):  # numbering restarts at 1 when no land record of that kind is left
			frappe.db.sql("update `tabSeries` set current=0 where name=%s", prefix)
	frappe.db.commit()
	print(f"Land demo removed: {len(deals)} deals, {len(parcels)} khasras, {len(owners)} owners")
