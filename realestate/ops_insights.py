"""Insights for three society-operations lists in the React app: charge heads (what owners pay and what it brings in),
maintenance plans (what is due, how reliably planned work gets done) and infrastructure / map features (build-out,
network lengths, cost and upkeep)."""

import math

import frappe
from frappe.utils import add_days, add_months, cint, flt, get_first_day, getdate, nowdate

from realestate.geo import load_geometry
from realestate.spa import _staff

SOLD = ("Booked", "Sold", "Possession Given")


def _sql(q, args=None):
	return frappe.db.sql(q, args or {}, as_dict=True)


# ---------------------------------------------------------------- charge heads
@frappe.whitelist(methods=["GET"])
def charge_heads() -> dict:
	"""Per head: how it is charged, which plots pay it, this month and 12 months billed, share of billing and collection;
	plus what a monthly bill comes to for each plot size."""
	_staff()
	today = getdate(nowdate())
	month, start = get_first_day(today), add_months(get_first_day(today), -11)
	heads = frappe.get_all("RE Charge Head", fields=["name", "charge_name", "enabled", "applies_to", "rate_type", "rate", "sequence", "item"], order_by="sequence, name")
	rates = {}
	for r in frappe.get_all("RE Charge Rate", fields=["parent", "plot_size", "rate"]):
		rates.setdefault(r.parent, {})[r.plot_size] = flt(r.rate)
	billed = {r.charge: r for r in _sql("""select c.charge, sum(c.amount) total, sum(c.amount * least(b.paid_amount, b.total_amount) / nullif(b.total_amount, 0)) collected,
			sum(case when b.billing_month = %(month)s then c.amount else 0 end) this_month, count(distinct b.plot) plots
			from `tabRE Bill Charge` c join `tabRE Society Bill` b on b.name = c.parent
			where b.docstatus < 2 and b.billing_month >= %(start)s group by c.charge""", {"month": month, "start": start})}
	trend = {}
	for r in _sql("""select c.charge, date_format(b.billing_month, '%%Y-%%m') m, sum(c.amount) amt from `tabRE Bill Charge` c
			join `tabRE Society Bill` b on b.name = c.parent where b.docstatus < 2 and b.billing_month >= %(start)s group by c.charge, m""", {"start": start}):
		trend.setdefault(r.charge, {})[r.m] = flt(r.amt)
	months = [str(add_months(start, i))[:7] for i in range(12)]
	sizes = frappe.get_all("RE Plot Size", fields=["name", "plot_type", "area_marla"], order_by="area_marla")
	billed_plots = {r.plot_size: r.n for r in _sql(f"""select plot_size, count(*) n from `tabRE Plot` where status in {SOLD}
			and ifnull(merged_into,'')='' group by plot_size""")}

	def rate_for(h, size):
		if not h.enabled or (h.applies_to not in ("All Plots", None, "") and h.applies_to != size.plot_type):
			return 0
		if h.rate_type == "By Plot Size":
			return rates.get(h.name, {}).get(size.name, 0)
		if h.rate_type == "Per Marla":
			return flt(h.rate) * flt(size.area_marla)
		return flt(h.rate)

	total12 = sum(flt(b.total) for b in billed.values()) or 1
	out_heads = []
	for h in heads:
		b = billed.get(h.name) or frappe._dict(total=0, collected=0, this_month=0, plots=0)
		r = rates.get(h.name, {})
		label = (f"Rs {min(r.values()):,.0f}–{max(r.values()):,.0f} by size" if r else "set per size") if h.rate_type == "By Plot Size" \
			else f"Rs {flt(h.rate):,.0f} per marla" if h.rate_type == "Per Marla" else f"Rs {flt(h.rate):,.0f} fixed"
		out_heads.append({**h, "rate_label": label, "billed_12m": flt(b.total), "collected_12m": flt(b.collected), "this_month": flt(b.this_month),
						  "plots": cint(b.plots), "share": round(flt(b.total) * 100 / total12, 1),
						  "collection": round(flt(b.collected) * 100 / flt(b.total), 1) if flt(b.total) else None,
						  "trend": [trend.get(h.name, {}).get(m, 0) for m in months]})
	matrix = []
	for s in sizes:
		row = {"size": s.name, "plot_type": s.plot_type, "plots": cint(billed_plots.get(s.name)), "heads": {h.name: rate_for(h, s) for h in heads}}
		row["total"] = sum(row["heads"].values())
		matrix.append(row)
	this_month = sum(x["this_month"] for x in out_heads)
	billed_now = cint(frappe.db.count("RE Society Bill", {"billing_month": month, "docstatus": ("<", 2)}))
	return {"heads": out_heads, "matrix": matrix, "months": months,
			"kpis": {"active": sum(1 for h in heads if h.enabled), "heads": len(heads), "this_month": this_month, "billed_12m": total12 if billed else 0,
					 "collected_12m": sum(x["collected_12m"] for x in out_heads), "bills": billed_now,
					 "avg_bill": round(this_month / billed_now) if billed_now else 0,
					 "run_rate": sum(r["total"] * r["plots"] for r in matrix)}}


# ---------------------------------------------------------------- maintenance plans
FREQ_DAYS = {"Daily": 1, "Weekly": 7, "Monthly": 30, "Quarterly": 91, "Half-Yearly": 182, "Yearly": 365}


def _next(d, freq):
	return add_months(d, {"Monthly": 1, "Quarterly": 3, "Half-Yearly": 6, "Yearly": 12}[freq]) if freq in ("Monthly", "Quarterly", "Half-Yearly", "Yearly") \
		else add_days(d, FREQ_DAYS.get(freq, 30))


@frappe.whitelist(methods=["GET"])
def maintenance_plans() -> dict:
	"""Plans with their next due date and how reliably their jobs get done (on time, late, open), the next 30 days of
	planned work, and planned vs complaint jobs by type."""
	_staff()
	today = getdate(nowdate())
	plans = frappe.get_all("RE Maintenance Plan", fields=["name", "title", "maintenance_type", "frequency", "next_due", "assign_to", "priority",
															 "enabled", "block", "map_feature", "lead_days", "last_task"], order_by="next_due")
	users = {u.name: u.full_name for u in frappe.get_all("User", {"name": ("in", [p.assign_to for p in plans if p.assign_to] or [""])}, ["name", "full_name"])}
	jobs = _sql("""select name, subject, status, re_maintenance_plan plan, re_source source, type, exp_end_date due, completed_on, creation
			from `tabTask` where re_project is not null and creation >= %(since)s""", {"since": add_days(today, -180)})
	by_plan = {}
	for j in jobs:
		if j.plan:
			by_plan.setdefault(j.plan, []).append(j)

	def stats(js):
		done = [j for j in js if j.status == "Completed" and j.completed_on]
		on_time = [j for j in done if not j.due or getdate(j.completed_on) <= getdate(j.due)]
		return {"jobs": len(js), "done": len(done), "on_time": len(on_time), "open": sum(1 for j in js if j.status in ("Open", "Working")),
				"overdue": sum(1 for j in js if j.status == "Overdue"),
				"on_time_pct": round(len(on_time) * 100 / len(done)) if done else None,
				"avg_days": round(sum(max(0, (getdate(j.completed_on) - getdate(j.creation)).days) for j in done) / len(done), 1) if done else None}

	out = []
	for p in plans:
		js = sorted(by_plan.get(p.name, []), key=lambda j: j.creation, reverse=True)
		s = stats(js)
		last = js[0] if js else None
		days = (getdate(p.next_due) - today).days if p.next_due else None
		out.append({**p, **s, "assignee": users.get(p.assign_to, p.assign_to), "days_to_due": days,
					"last_status": last.status if last else None, "last_task": last.name if last else p.last_task,
					"last_done": last.completed_on if last and last.completed_on else None})
	# the next 30 days of planned work (projected from each plan's frequency)
	calendar = []
	for p in plans:
		if not p.enabled or not p.next_due:
			continue
		d = getdate(p.next_due)
		while d <= add_days(today, 30):
			if d >= add_days(today, -7):
				calendar.append({"date": d, "plan": p.name, "title": p.title, "type": p.maintenance_type, "priority": p.priority,
								 "assignee": users.get(p.assign_to, p.assign_to), "overdue": d < today})
			d = getdate(_next(d, p.frequency))
	calendar.sort(key=lambda x: x["date"])
	types = {}
	for j in jobs:
		t = types.setdefault(j.type or "Other", {"type": j.type or "Other", "planned": 0, "complaints": 0, "open": 0})
		t["planned" if j.plan else "complaints"] += 1
		t["open"] += j.status in ("Open", "Working", "Overdue")
	all_planned = stats([j for j in jobs if j.plan])
	return {"plans": out, "calendar": calendar[:40], "types": sorted(types.values(), key=lambda t: -(t["planned"] + t["complaints"])),
			"kpis": {"plans": len(plans), "active": sum(1 for p in plans if p.enabled),
					 "due_week": sum(1 for p in plans if p.enabled and p.next_due and 0 <= (getdate(p.next_due) - today).days <= 7),
					 "late_plans": sum(1 for p in plans if p.enabled and p.next_due and getdate(p.next_due) < today),
					 "jobs_month": sum(1 for j in jobs if j.plan and getdate(j.creation) >= get_first_day(today)), **{f"all_{k}": v for k, v in all_planned.items()},
					 "per_month": round(sum(30 / FREQ_DAYS.get(p.frequency, 30) for p in plans if p.enabled), 1)}}


# ---------------------------------------------------------------- infrastructure / map features
def _length_m(geom):
	"""Length of a LineString / MultiLineString in metres (haversine)."""
	if not geom:
		return 0.0
	lines = [geom["coordinates"]] if geom.get("type") == "LineString" else geom.get("coordinates", []) if geom.get("type") == "MultiLineString" else []
	total = 0.0
	for line in lines:
		for (x1, y1), (x2, y2) in zip(line, line[1:]):
			p1, p2, dl = math.radians(y1), math.radians(y2), math.radians(x2 - x1)
			a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
			total += 2 * 6371000 * math.asin(math.sqrt(a))
	return total


@frappe.whitelist(methods=["GET"])
def infrastructure() -> dict:
	"""Build-out of the scheme's infrastructure: status and completion by category, network lengths (roads, sewer, water,
	power, fibre), estimated cost vs spent on the linked development projects, assets, and upkeep jobs per feature."""
	_staff()
	project = frappe.db.get_single_value("RE Settings", "default_project")
	feats = frappe.get_all("RE Map Feature", {"project": project} if project else {},
						   ["name", "feature_name", "feature_type", "category", "geometry_type", "asset_status", "completion_pct", "estimated_cost",
							"asset", "erp_project", "contractor", "area_kanal", "width_ft", "geojson", "color"])
	jobs = {r.feature: r for r in _sql("""select re_map_feature feature, count(*) n, sum(status in ('Open','Working','Overdue')) open,
			sum(status='Completed') done from `tabTask` where re_map_feature is not null group by re_map_feature""")}
	spent = {r.name: flt(r.spent) for r in _sql("""select name, ifnull(total_purchase_cost,0) + ifnull(total_consumed_material_cost,0) spent
			from `tabProject` where re_cost_head is not null""")}
	value_field = next((f for f in ("net_purchase_amount", "gross_purchase_amount", "purchase_amount") if frappe.get_meta("Asset").has_field(f)), None)
	assets = {r.name: flt(r.value) for r in _sql(f"select name, `{value_field}` value from `tabAsset` where docstatus=1")} if value_field else {}
	networks = {}
	NET = {"Street": "Roads", "Boulevard": "Roads", "Perimeter Road": "Roads", "Sewerage Line": "Sewerage", "Water Supply Line": "Water supply",
		   "Electricity Line": "Electricity", "Internet Cable": "Fibre internet"}
	rows, cats = [], {}
	for f in feats:
		geom = load_geometry(f.geojson)
		length = _length_m(geom) if f.geometry_type == "LineString" else 0
		pct = flt(f.completion_pct) if f.asset_status else 0
		status = f.asset_status or "Not tracked"
		j = jobs.get(f.name)
		row = {k: f[k] for k in ("name", "feature_name", "feature_type", "category", "geometry_type", "estimated_cost", "asset", "erp_project",
								 "contractor", "area_kanal", "width_ft", "color")}
		row.update({"status": status, "completion": pct, "length_m": round(length), "asset_value": assets.get(f.asset, 0),
					"jobs": cint(j.n) if j else 0, "open_jobs": cint(j.open) if j else 0})
		rows.append(row)
		net = NET.get(f.feature_type)
		if net and length:
			n = networks.setdefault(net, {"network": net, "length_m": 0.0, "built_m": 0.0, "segments": 0})
			n["length_m"] += length
			n["built_m"] += length * pct / 100
			n["segments"] += 1
		c = cats.setdefault(f.category or "Other", {"category": f.category or "Other", "features": 0, "completed": 0, "in_progress": 0, "planned": 0,
													 "untracked": 0, "pct_sum": 0.0, "tracked": 0, "estimated": 0.0})
		c["features"] += 1
		c["completed" if status == "Completed" else "in_progress" if status == "In Progress" else "planned" if status == "Planned" else "untracked"] += 1
		if f.asset_status:
			c["pct_sum"] += pct
			c["tracked"] += 1
		c["estimated"] += flt(f.estimated_cost)
	for c in cats.values():
		c["completion"] = round(c.pop("pct_sum") / c["tracked"], 1) if c["tracked"] else None
	for n in networks.values():
		n["pct"] = round(n["built_m"] * 100 / n["length_m"], 1) if n["length_m"] else 0
		n["length_m"], n["built_m"] = round(n["length_m"]), round(n["built_m"])
	tracked = [r for r in rows if r["status"] != "Not tracked"]
	projects = {r["erp_project"] for r in rows if r["erp_project"]}
	return {"features": rows, "categories": sorted(cats.values(), key=lambda c: -c["features"]), "networks": sorted(networks.values(), key=lambda n: -n["length_m"]),
			"types": sorted([{"name": t, "value": sum(1 for r in rows if r["feature_type"] == t)} for t in {r["feature_type"] for r in rows}], key=lambda x: -x["value"]),
			"kpis": {"features": len(rows), "completed": sum(1 for r in rows if r["status"] == "Completed"),
					 "in_progress": sum(1 for r in rows if r["status"] == "In Progress"),
					 "completion": round(sum(r["completion"] for r in tracked) / len(tracked), 1) if tracked else 0,
					 "network_km": round(sum(n["length_m"] for n in networks.values()) / 1000, 2),
					 "estimated": sum(flt(r["estimated_cost"]) for r in rows), "spent": sum(spent.get(p, 0) for p in projects),
					 "assets": sum(1 for r in rows if r["asset"]), "asset_value": sum(r["asset_value"] for r in rows),
					 "open_jobs": sum(r["open_jobs"] for r in rows), "contractors": len({r["contractor"] for r in rows if r["contractor"]})}}


# ---------------------------------------------------------------- fixed assets
@frappe.whitelist(methods=["GET"])
def assets() -> dict:
	"""The scheme's fixed assets (ERPNext Asset): cost and book value, by category and status, what is on the map,
	purchases by month, the biggest assets and upkeep jobs on their map features."""
	_staff()
	company = frappe.db.get_single_value("RE Settings", "company")
	meta = frappe.get_meta("Asset")
	cost_f = next((f for f in ("total_asset_cost", "net_purchase_amount", "gross_purchase_amount") if meta.has_field(f)), "net_purchase_amount")
	book_f = "value_after_depreciation" if meta.has_field("value_after_depreciation") else cost_f
	rows = _sql(f"""select a.name, a.asset_name, a.asset_category, a.location, a.status, a.purchase_date, a.docstatus,
			ifnull(a.`{cost_f}`, 0) cost, ifnull(a.`{book_f}`, 0) book, a.re_map_feature feature, a.re_project, a.calculate_depreciation dep,
			f.feature_name, f.feature_type
			from `tabAsset` a left join `tabRE Map Feature` f on f.name = a.re_map_feature
			where a.docstatus < 2 {"and a.company = %(company)s" if company else ""} order by cost desc""", {"company": company})
	live = [r for r in rows if r.docstatus == 1]
	cats = {}
	for r in live:
		c = cats.setdefault(r.asset_category or "Uncategorised", {"name": r.asset_category or "Uncategorised", "count": 0, "cost": 0.0, "book": 0.0})
		c["count"] += 1
		c["cost"] += flt(r.cost)
		c["book"] += flt(r.book or r.cost)
	status = {}
	for r in rows:
		status[r.status or "Draft"] = status.get(r.status or "Draft", 0) + 1
	today = getdate(nowdate())
	start = add_months(get_first_day(today), -17)
	by_month = {str(add_months(start, i))[:7]: {"month": str(add_months(start, i))[:7], "cost": 0.0, "count": 0} for i in range(18)}
	for r in live:
		k = str(r.purchase_date)[:7] if r.purchase_date else None
		if k in by_month:
			by_month[k]["cost"] += flt(r.cost)
			by_month[k]["count"] += 1
	jobs = {r.feature: r for r in _sql("""select re_map_feature feature, count(*) n, sum(status in ('Open','Working','Overdue')) open
			from `tabTask` where re_map_feature is not null group by re_map_feature""")}
	cost = sum(flt(r.cost) for r in live)
	book = sum(flt(r.book or r.cost) for r in live)
	return {
		"kpis": {"assets": len(live), "drafts": sum(1 for r in rows if r.docstatus == 0), "cost": cost, "book": book,
				 "depreciated": cost - book, "on_map": sum(1 for r in live if r.feature), "depreciating": sum(1 for r in live if r.dep),
				 "categories": len(cats), "largest": live[0].asset_name if live else None, "largest_cost": flt(live[0].cost) if live else 0},
		"categories": sorted(cats.values(), key=lambda c: -c["cost"]),
		"status": [{"name": k, "value": v} for k, v in sorted(status.items(), key=lambda x: -x[1])],
		"monthly": list(by_month.values()),
		"top": [{**{k: r[k] for k in ("name", "asset_name", "asset_category", "location", "status", "purchase_date", "feature", "feature_name", "feature_type")},
				 "cost": flt(r.cost), "book": flt(r.book or r.cost), "jobs": cint(jobs[r.feature].n) if r.feature in jobs else 0,
				 "open_jobs": cint(jobs[r.feature].open) if r.feature in jobs else 0} for r in live[:12]],
	}
