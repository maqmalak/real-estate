"""Sample data for "Zarmeen Gardens Housing Scheme" (fictional) so every map colour, dashboard and report has data.

    bench --site realestate execute realestate.demo.seed.run          # first run
    bench --site realestate re-reset-demo                             # wipe the demo and generate again

Everything generated is tied to the demo project or flagged re_demo; real records are never touched.
Phone numbers are fictional (+92 300 555 xxxx); the one ending 0000 always fails on WhatsApp so the
SMS fallback has something to show.
"""

import json
import random

import frappe
from frappe.utils import add_days, add_months, add_to_date, flt, get_datetime, get_first_day, getdate, now_datetime, nowdate

from realestate.demo import layout

COMPANY, ABBR = "Zarmeen Developers (Pvt) Ltd", "ZDL"
PHONE_PREFIX = "+92300555"
AGENTS = [("Ayesha", "Khan"), ("Bilal", "Ahmed"), ("Usman", "Tariq"), ("Sana", "Javed")]
MANAGER = ("Kamran", "Malik")
DEALERS = [("Prime Estate Advisors", 2), ("City Property Dealers", 2.5), ("Lahore Realtors Network", 1.5)]
RECOVERY = ("Naeem", "Akhtar")
MAINT_STAFF = [("Rashid", "Iqbal", "Projects Manager"), ("Nasir", "Mehmood", "Projects User"), ("Shakeel", "Ahmad", "Projects User")]
FIRST = ["Ali", "Hamza", "Fatima", "Zainab", "Imran", "Asad", "Hira", "Omer", "Saad", "Maryam", "Farhan", "Nadia", "Waqas", "Sidra",
		 "Junaid", "Amna", "Tariq", "Rabia", "Shahid", "Iqra", "Adeel", "Mehwish", "Fahad", "Noor", "Zeeshan", "Ayesha", "Kashif",
		 "Saima", "Naveed", "Sana", "Haris", "Anum", "Rizwan", "Bushra", "Talha", "Kiran", "Umair", "Samina", "Faisal", "Lubna"]
LAST = ["Raza", "Qureshi", "Chaudhry", "Sheikh", "Butt", "Malik", "Hussain", "Iqbal", "Siddiqui", "Mirza", "Abbasi", "Awan", "Gill",
		"Bhatti", "Rana", "Cheema", "Javed", "Aslam", "Anwar", "Haider"]
SOURCES = ["Walk In", "Dealer", "Facebook", "Website", "Referral"]
SOURCE_WEIGHTS = [20, 25, 30, 15, 10]
MODES = ["Cash", "Bank Transfer", "Cheque"]
PLANS = [
	# name, down %, installments, frequency, possession %
	("Full Payment", 100, 0, "Monthly", 0),
	("3 Years Monthly", 25, 36, "Monthly", 0),
	("2 Years Monthly", 20, 24, "Monthly", 10),
	("3 Years Quarterly", 30, 12, "Quarterly", 0),
	("2 Years Quarterly", 25, 8, "Quarterly", 5),
]
# Plans using booking amount, delayed down payment, balloon payments and development charges
RICH_PLANS = [
	{"plan_name": "2 Years Monthly + Half-Yearly Balloons", "booking_percent": 10, "down_payment_percent": 15, "down_payment_days": 30,
	 "installments": 24, "frequency": "Monthly", "balloon_frequency": "Half-Yearly", "balloon_percent": 20,
	 "development_percent": 5, "development_due_month": 12, "possession_percent": 10,
	 "description": "10% booking, 15% down within 30 days, 24 monthly, 4 half-yearly balloons, development charges at month 12, 10% on possession"},
	{"plan_name": "3 Years Quarterly + Development Charges", "booking_percent": 5, "down_payment_percent": 20, "down_payment_days": 15,
	 "installments": 12, "frequency": "Quarterly", "balloon_frequency": "", "balloon_percent": 0,
	 "development_percent": 8, "development_due_month": 18, "possession_percent": 7,
	 "description": "5% booking, 20% down within 15 days, 12 quarterly installments, 8% development charges at month 18, 7% on possession"},
]


def demo_possession_and_holds(max_possessions=8):
	"""Hand over older fully paid plots (no society dues) and put three commercial plots on hold. Idempotent."""
	if not frappe.db.exists("RE Booking", {"possession_date": ("is", "set")}):
		rows = frappe.db.sql("""select b.name from `tabRE Booking` b where b.docstatus=1 and b.status='Paid' and b.possession_date is null
			and b.booking_date <= %s and not exists (select 1 from `tabRE Society Bill` s where s.plot=b.plot and s.outstanding_amount > 0)
			order by b.booking_date limit %s""", (add_days(nowdate(), -150), max_possessions), as_dict=True)
		for i, r in enumerate(rows):
			frappe.get_doc("RE Booking", r.name).give_possession(add_days(nowdate(), -60 + i * 5), "Demarcated on site; owner signed the handover sheet")
	if not frappe.db.exists("RE Plot", {"status": "Hold"}):
		for plot in frappe.get_all("RE Plot", {"block": "D Block", "status": "Available", "is_corner": 1}, pluck="name", limit=3) or \
				frappe.get_all("RE Plot", {"block": "D Block", "status": "Available"}, pluck="name", limit=3):
			frappe.get_doc("RE Plot", plot).put_on_hold("Corner / boulevard premium under review by management")
	frappe.db.commit()


def demo_price_history():
	"""Launch price nine months ago for every plot; 5 and 10 Marla plots then had a +5% revision three months ago. Idempotent."""
	if frappe.db.exists("RE Plot Price", {"parenttype": "RE Plot"}):
		return
	launch, revision = add_months(nowdate(), -9), add_months(nowdate(), -3)
	for p in frappe.get_all("RE Plot", {"merged_into": ("is", "not set")}, ["name", "list_price", "plot_size"]):
		price = flt(p.list_price)
		revised = p.plot_size in ("5 Marla", "10 Marla")
		start = round(price / 1.05, -3) if revised else price
		rows = [{"changed_on": launch, "old_price": 0, "new_price": start, "change_percent": 0, "reason": "Launch price"}]
		if revised:
			rows.append({"changed_on": revision, "old_price": start, "new_price": price, "change_percent": round((price - start) * 100 / start, 2),
						 "reason": "Q3 price revision (+5% on 5 and 10 Marla)"})
		for i, r in enumerate(rows, 1):
			frappe.get_doc({"doctype": "RE Plot Price", "parent": p.name, "parenttype": "RE Plot", "parentfield": "price_history", "idx": i,
							"changed_by": "Administrator", **r}).db_insert()
	frappe.db.commit()


def demo_plans():
	for p in RICH_PLANS:
		if not frappe.db.exists("RE Payment Plan", p["plan_name"]):
			frappe.get_doc({"doctype": "RE Payment Plan", **p}).insert(ignore_permissions=True)


def demo_rich_bookings():
	"""Two bookings on the richer plans so their schedules (balloons, development charges) show up in the demo. Idempotent."""
	plans = [p["plan_name"] for p in RICH_PLANS]
	if frappe.db.exists("RE Booking", {"payment_plan": ("in", plans), "docstatus": 1}):
		return []
	rng = random.Random(77)
	today = getdate(nowdate())
	out = []
	for plan, block, i in ((plans[0], "B Block", 3), (plans[1], "C Block", 7)):
		plot = frappe.db.get_value("RE Plot", {"block": block, "status": "Available", "merged_into": ("is", "not set")}, "name", order_by="name")
		cust = frappe.get_all("Customer", {"re_demo": 1}, ["name", "mobile_no", "account_manager"], order_by="creation", limit=1, start=i)[0]
		booked_on = add_days(today, -150 - i * 5)
		booking = frappe.get_doc({"doctype": "RE Booking", "plot": plot, "customer": cust.name, "mobile_no": cust.mobile_no,
								   "booking_date": booked_on, "agent": cust.account_manager, "payment_plan": plan,
								   "total_price": flt(frappe.db.get_value("RE Plot", plot, "list_price")), "discount": 0})
		booking.insert(ignore_permissions=True)
		booking.submit()
		_backdate("RE Booking", booking.name, f"{booked_on} 12:00:00")
		_pay_booking(rng, booking, "due", today)
		out.append(booking.name)
	frappe.db.commit()
	return out


def run(reset_first=False):
	"""Generate the demo; background jobs run inline so thousands of inserts don't flood the queue."""
	real_enqueue = frappe.enqueue

	def inline(method, *args, **kwargs):
		kwargs["now"] = True
		return real_enqueue(method, *args, **kwargs)

	frappe.enqueue = inline
	try:
		_run(reset_first)
	finally:
		frappe.enqueue = real_enqueue


def _run(reset_first):
	frappe.flags.in_demo = True
	rng = random.Random(42)
	if reset_first:
		wipe()
	_company()
	from realestate import setup

	setup.setup()
	agents = _users()
	settings = frappe.get_single("RE Settings")
	settings.mock_mode = 1
	settings.company = COMPANY
	settings.send_booking_confirmation = 0  # sent selectively below, with realistic dates
	settings.save(ignore_permissions=True)
	if frappe.db.exists("RE Project", layout.PROJECT["project_name"]):
		print("Demo project already exists — use re-reset-demo to regenerate")
		return
	from realestate.whatsapp.mock import install

	install()
	plan = layout.build()
	_masters(plan)
	_dealers()
	project = _project(plan)
	from realestate import erp

	erp.setup_masters(COMPANY)
	dev_projects = erp.setup_projects(COMPANY, project, with_budgets=True)
	settings.reload()
	settings.default_project = project
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	print("map done")
	people = _pipeline(rng, agents)
	frappe.db.commit()
	print("pipeline done")
	from realestate.identity import demo_identities

	demo_plans()
	demo_identities()  # CNIC + nominee: a booking cannot be submitted without the buyer's CNIC
	bookings = _bookings(rng, people["customers"])
	demo_rich_bookings()
	demo_possession_and_holds()
	demo_price_history()
	frappe.db.commit()
	print("bookings done")
	_charge_heads()
	_society_bills(rng)
	frappe.db.commit()
	print("bills done")
	_calls_and_tasks(rng, people, bookings, agents)
	_site_visits(rng, people, agents)
	frappe.db.commit()
	print("calls / visits done")
	_whatsapp(rng, people, bookings, agents)
	frappe.db.commit()
	print("whatsapp done")
	_broadcast()
	from realestate.demo import development

	development.run(COMPANY, project, dev_projects, random.Random(11))
	frappe.db.commit()
	print("development (buying, stock, assets, budgets) done")
	_maintenance(rng, people)
	frappe.db.commit()
	print("maintenance done")
	_vault(project)
	_documents()
	frappe.db.commit()
	print("documents done")
	_phase_b(rng, people)
	frappe.db.commit()
	print("phase B (transfers, cancellations, merges, surcharges, commissions, recovery) done")
	portal_users()
	frappe.db.commit()
	settings.reload()
	settings.send_booking_confirmation = 1
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	frappe.flags.in_demo = False
	print("Demo data ready")


# ------------------------------------------------------------------ company, users, masters
def _company():
	if frappe.db.get_single_value("System Settings", "setup_complete") and frappe.db.exists("Company", COMPANY):
		return
	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

	frappe.db.set_default("crm_demo_data_created", 1)  # skip Frappe CRM's generic demo; the scheme has its own
	year = getdate(nowdate()).year
	fy_start = f"{year if getdate(nowdate()).month >= 7 else year - 1}-07-01"
	setup_complete({
		"language": "English", "country": "Pakistan", "timezone": "Asia/Karachi", "currency": "PKR",
		"company_name": COMPANY, "company_abbr": ABBR, "chart_of_accounts": "Standard", "company_tagline": "Zarmeen Gardens Housing Scheme",
		"fy_start_date": fy_start, "fy_end_date": str(add_days(add_months(fy_start, 12), -1)),
		"full_name": "Administrator", "email": "admin@example.com", "password": None, "setup_demo": 0,
	})
	frappe.db.commit()
	for mode, kind in (("Cash", "Cash"), ("Bank Transfer", "Bank"), ("Cheque", "Bank")):
		if not frappe.db.exists("Mode of Payment", mode):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": kind, "enabled": 1}).insert(ignore_permissions=True)
	ss = frappe.get_single("Selling Settings")
	ss.customer_group = ss.customer_group or frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
	ss.territory = ss.territory or frappe.db.get_value("Territory", {"is_group": 0}, "name")
	ss.save(ignore_permissions=True)


def _users():
	emails = []
	for i, (first, last) in enumerate([*AGENTS, MANAGER]):
		email = f"{first.lower()}.{last.lower()}@zarmeen.example"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last, "send_welcome_email": 0,
								   "user_type": "System User", "mobile_no": f"{PHONE_PREFIX}9{i:03d}"})
			user.flags.no_welcome_mail = True
			user.insert(ignore_permissions=True)
			user.add_roles("Sales User")
		_set_roles(email, ["Sales User", "Sales Manager", "Accounts User"] if (first, last) == MANAGER else ["Sales User", "Sales Agent"])
		if (first, last) != MANAGER:
			emails.append(email)
	email = f"{RECOVERY[0].lower()}.{RECOVERY[1].lower()}@zarmeen.example"
	if not frappe.db.exists("User", email):
		user = frappe.get_doc({"doctype": "User", "email": email, "first_name": RECOVERY[0], "last_name": RECOVERY[1], "send_welcome_email": 0, "user_type": "System User"})
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		user.add_roles("Recovery Officer", "Sales User")
	for first, last, role in MAINT_STAFF:
		email = f"{first.lower()}.{last.lower()}@zarmeen.example"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last, "send_welcome_email": 0,
								   "user_type": "System User"})
			user.flags.no_welcome_mail = True
			user.insert(ignore_permissions=True)
			user.add_roles("Projects User", *([role] if role != "Projects User" else []), *(["Society Manager"] if role == "Projects Manager" else []))
	return emails


def _set_roles(email, roles):
	"""Exact demo roles (agents: Sales User + Sales Agent only, so they see just their own records)."""
	user = frappe.get_doc("User", email)
	user.set("roles", [r for r in user.roles if r.role not in ("Accounts User", "Sales Agent", "Sales Manager", "Sales User")])
	for r in roles:
		user.append("roles", {"role": r})
	user.flags.ignore_permissions = True
	user.save()


def _staff(i):
	first, last, _role = MAINT_STAFF[i]
	return f"{first.lower()}.{last.lower()}@zarmeen.example"


def _masters(plan):
	for name, (ptype, marla, front, depth, price, maint) in plan["plot_sizes"].items():
		if not frappe.db.exists("RE Plot Size", name):
			frappe.get_doc({"doctype": "RE Plot Size", "size_name": name, "plot_type": ptype, "area_marla": marla, "width_ft": front,
							"depth_ft": depth, "base_price": price, "monthly_maintenance": maint}).insert(ignore_permissions=True)
	for name, down, n, freq, poss in PLANS:
		if not frappe.db.exists("RE Payment Plan", name):
			frappe.get_doc({"doctype": "RE Payment Plan", "plan_name": name, "down_payment_percent": down, "installments": n,
							"frequency": freq, "possession_percent": poss}).insert(ignore_permissions=True)


def _project(plan):
	p = plan["project"]
	doc = frappe.get_doc({
		"doctype": "RE Project", **p, "company": COMPANY, "is_demo": 1, "default_zoom": 17,
		"boundary_geojson": json.dumps(plan["boundary"]),
		"land_use": [{"category": c, "label": l, "percent": pct, "details": d} for c, l, pct, d in plan["land_use"]],
		"description": "<p>Sample project generated for demonstration. Replace the map with real survey data through <b>RE Map Import</b> "
					   "(KML / GeoJSON) and reset or delete the demo data from <b>RE Settings</b>.</p>",
	}).insert(ignore_permissions=True)
	for b in plan["blocks"]:
		frappe.get_doc({"doctype": "RE Block", "block_name": b["name"], "block_code": b["code"], "project": doc.name, "block_type": b["type"],
						"plot_size": b["size"], "land_use_percent": b["pct"], "planned_plots": b["count"], "color": b["color"],
						"geojson": json.dumps(b["geometry"])}).insert(ignore_permissions=True)
	blocks = {b["code"]: b["name"] for b in plan["blocks"]}
	for p in plan["plots"]:
		frappe.get_doc({"doctype": "RE Plot", "plot_no": p["plot_no"], "project": doc.name, "block": blocks[p["block_code"]],
						"plot_size": p["plot_size"], "street": p.get("street"), "is_corner": p.get("is_corner", 0),
						"is_park_facing": p.get("is_park_facing", 0), "is_boulevard_facing": p.get("is_boulevard_facing", 0),
						"geojson": json.dumps(p["geometry"]), "status": "Available"}).insert(ignore_permissions=True)
	for f in plan["features"]:
		frappe.get_doc({"doctype": "RE Map Feature", "project": doc.name, "feature_name": f["feature_name"], "feature_type": f["feature_type"],
						"category": f["category"], "color": f.get("color"), "width_ft": f.get("width_ft"),
						"geojson": json.dumps(f["geometry"])}).insert(ignore_permissions=True)
	return doc.name


# ------------------------------------------------------------------ CRM pipeline
def _backdate(doctype, name, when):
	frappe.db.set_value(doctype, name, {"creation": when, "modified": when}, update_modified=False)


def _phone(i):
	return f"{PHONE_PREFIX}{i:04d}"


def _pipeline(rng, agents):
	"""40 customers (lead -> deal -> booking), 25 open / lost deals, 35 open leads."""
	from crm.fcrm.doctype.crm_lead.crm_lead import convert_to_deal

	blocks = frappe.get_all("RE Block", ["name", "plot_size"])
	names = [(f, l) for f in FIRST for l in LAST]
	rng.shuffle(names)
	out = {"customers": [], "deals": [], "leads": []}
	today = getdate(nowdate())
	for i in range(100):
		first, last = names[i]
		agent = agents[i % len(agents)]
		block = rng.choice(blocks)
		kind = "customer" if i < 40 else "deal" if i < 65 else "lead"
		created = add_to_date(get_datetime(today), days=-rng.randint(25, 600) if kind == "customer" else -rng.randint(1, 120), hours=rng.randint(9, 17) - 12)
		phone = _phone(0) if i == 7 else _phone(i + 1)  # customer #8 has the always-failing number
		lead = frappe.get_doc({
			"doctype": "CRM Lead", "first_name": first, "last_name": last, "mobile_no": phone, "email": f"{first}.{last}.{i}@example.com".lower(),
			"source": rng.choices(SOURCES, SOURCE_WEIGHTS)[0], "lead_owner": agent, "status": "New", "re_demo": 1,
			"re_interested_block": block.name, "re_plot_size": block.plot_size, "re_budget": rng.choice([60, 80, 120, 150, 250]) * 100000,
		})
		lead.flags.ignore_permissions = True
		lead.insert()
		_backdate("CRM Lead", lead.name, created)
		if kind == "lead":
			lead.db_set("status", rng.choices(["New", "Contacted", "Nurture", "Qualified", "Unqualified", "Junk"], [8, 10, 6, 5, 3, 3])[0])
			if lead.status in ("New", "Contacted", "Nurture", "Qualified"):
				lead.db_set("re_next_follow_up", add_to_date(now_datetime(), days=rng.randint(-6, 10), hours=rng.randint(0, 6)))
			out["leads"].append(lead.name)
			continue
		lead.flags.ignore_permissions = True
		deal_name = convert_to_deal(lead.name, doc=lead)
		deal = frappe.get_doc("CRM Deal", deal_name)
		deal.update({"deal_owner": agent, "re_demo": 1, "mobile_no": phone})
		deal_created = add_to_date(created, days=rng.randint(1, 10))
		if kind == "deal":
			deal.status = rng.choices(["Opportunity", "Site Visit", "Negotiation", "Lost"], [9, 7, 5, 4])[0]
			if deal.status == "Lost":
				deal.lost_reason = rng.choice(frappe.get_all("CRM Lost Reason", pluck="name"))
				deal.lost_notes = "Decided after the site visit"
			deal.flags.ignore_permissions = True
			deal.save()
			_backdate("CRM Deal", deal.name, deal_created)
			out["deals"].append(deal.name)
			continue
		deal.status = "Site Visit"
		deal.save(ignore_permissions=True)
		deal.status = "Booking"
		deal.save(ignore_permissions=True)  # Frappe CRM creates the ERPNext customer here
		_backdate("CRM Deal", deal.name, deal_created)
		customer = frappe.db.get_value("CRM Deal", deal.name, "erpnext_customer")
		if not customer:
			raise frappe.ValidationError(f"Customer was not created for {deal.name}")
		frappe.db.set_value("Customer", customer, {"re_demo": 1, "mobile_no": phone, "account_manager": agent})
		out["customers"].append({"customer": customer, "deal": deal.name, "lead": lead.name, "agent": agent, "phone": phone,
								 "since": created, "name": f"{first} {last}"})
	return out


# ------------------------------------------------------------------ bookings & payments
def _bookings(rng, customers):
	"""120 bookings, 3 per customer; ~25 % fully paid, ~45 % up to date, ~30 % overdue."""
	today = getdate(nowdate())
	plots = {b: frappe.get_all("RE Plot", {"block": b, "status": "Available"}, pluck="name", order_by="plot_no") for b in
			 ("A Block", "B Block", "C Block", "D Block")}
	quota = {"A Block": 50, "B Block": 35, "C Block": 15, "D Block": 20}
	picks = []
	for block, n in quota.items():
		chosen = rng.sample(plots[block], n)
		picks += [(block, p) for p in chosen]
	rng.shuffle(picks)
	plan_for = {"A Block": "3 Years Monthly", "B Block": "2 Years Monthly", "C Block": "3 Years Quarterly", "D Block": "2 Years Quarterly"}
	out = []
	settings_conf = frappe.db.get_single_value("RE Settings", "send_booking_confirmation")
	for idx, (block, plot) in enumerate(picks):
		c = customers[idx % len(customers)]
		profile = rng.choices(["paid", "due", "overdue"], [25, 45, 30])[0]
		months_ago = rng.randint(2, 20)
		booked_on = add_days(today, -months_ago * 30 - rng.randint(0, 25))
		if getdate(booked_on) < getdate(c["since"]):
			booked_on = add_days(getdate(c["since"]), rng.randint(3, 20))
		if getdate(booked_on) >= today:
			booked_on = add_days(today, -35)
		plan = "Full Payment" if profile == "paid" and rng.random() < 0.6 else plan_for[block]
		price = flt(frappe.db.get_value("RE Plot", plot, "list_price"))
		booking = frappe.get_doc({
			"doctype": "RE Booking", "plot": plot, "customer": c["customer"], "mobile_no": c["phone"], "crm_deal": c["deal"],
			"booking_date": booked_on, "agent": c["agent"], "total_price": price,
			"discount": rng.choice([0, 0, 0, 50000, 100000, 200000]), "payment_plan": plan,
			"sales_partner": rng.choice(DEALERS)[0] if rng.random() < 0.35 else None,
		})
		booking.insert(ignore_permissions=True)
		booking.submit()
		_backdate("RE Booking", booking.name, f"{booked_on} 11:{rng.randint(10, 59)}:00")
		_pay_booking(rng, booking, profile, today)
		out.append({"name": booking.name, "customer": c["customer"], "profile": profile, "agent": c["agent"]})
		if idx % 10 == 0:
			frappe.db.commit()
	return out


def _pay_booking(rng, booking, profile, today):
	booking.reload()
	rows = sorted(booking.installments, key=lambda r: r.due_date)
	past = [r for r in rows if getdate(r.due_date) <= today]
	if profile == "paid":
		to_pay = rows
	elif profile == "due":
		to_pay = past
	else:
		miss = min(len(past) - 1, rng.randint(1, 4)) if len(past) > 1 else 0
		to_pay = past[: len(past) - miss] if miss else past[:-1] or past[:1]
	future = [r for r in to_pay if getdate(r.due_date) > today]
	if future:
		to_pay = [r for r in to_pay if r not in future]
		on = getdate(add_days(booking.booking_date, rng.randint(20, max(21, (today - getdate(booking.booking_date)).days - 5))))
		_receipt(rng, booking, min(on, add_days(today, -3)), sum(r.amount for r in future) + sum(r.amount for r in to_pay if getdate(r.due_date) > on))
		to_pay = [r for r in to_pay if getdate(r.due_date) <= on]
	for r in to_pay:
		on = min(getdate(add_days(r.due_date, rng.randint(-5, 6))), today)
		on = max(on, getdate(booking.booking_date))
		amount = r.amount
		if profile == "overdue" and r is to_pay[-1] and rng.random() < 0.3:
			amount = round(r.amount / 2, -3)  # a partial payment
		_receipt(rng, booking, on, amount)


def _receipt(rng, booking, on, amount):
	pay = frappe.get_doc({"doctype": "RE Payment", "payment_against": "Booking", "booking": booking.name, "customer": booking.customer,
						  "posting_date": on, "mode_of_payment": rng.choice(MODES), "amount": amount, "send_receipt": 0,
						  "received_by": booking.agent, "reference_no": f"TRX{rng.randint(100000, 999999)}" if rng.random() < 0.5 else None})
	pay.insert(ignore_permissions=True)
	pay.submit()
	_backdate("RE Payment", pay.name, f"{on} {rng.randint(10, 17)}:{rng.randint(10, 59)}:00")


def _society_bills(rng):
	"""Six months of society bills for every booked / sold plot; older months mostly paid."""
	from realestate.tasks import generate_society_bills

	this_month = get_first_day(nowdate())
	for back in range(5, -1, -1):
		month = add_months(this_month, -back)
		generate_society_bills(month, silent=True)
		for bill in frappe.get_all("RE Society Bill", {"billing_month": month}, ["name", "plot", "customer", "outstanding_amount", "due_date"]):
			_backdate("RE Society Bill", bill.name, f"{month} 09:00:00")
			paid_share = {5: 0.92, 4: 0.9, 3: 0.85, 2: 0.78, 1: 0.65, 0: 0.25}[back]
			if rng.random() < paid_share:
				on = min(getdate(add_days(bill.due_date, rng.randint(-12, 4))), getdate(nowdate()))
				pay = frappe.get_doc({"doctype": "RE Payment", "payment_against": "Society Bill", "society_bill": bill.name,
									  "customer": bill.customer, "posting_date": on, "mode_of_payment": rng.choice(MODES),
									  "amount": bill.outstanding_amount, "send_receipt": 0})
				pay.insert(ignore_permissions=True)
				pay.submit()
				_backdate("RE Payment", pay.name, f"{on} 12:00:00")
		frappe.db.commit()
	from realestate.tasks import refresh_dues

	refresh_dues()


# ------------------------------------------------------------------ calls, follow-ups, visits
def _call(party_type, party, agent, direction, outcome, when, duration=0, notes=None, promised=None, promised_by=None, follow_up=None):
	phone = frappe.db.get_value(party_type, party, "mobile_no")
	answered = outcome in ("Answered", "Promised to Pay", "Not Interested", "Call Back Later")
	doc = frappe.get_doc({
		"doctype": "CRM Call Log", "type": direction, "status": "Completed" if answered else ("Busy" if outcome == "Busy" else "No Answer"),
		"telephony_medium": "Manual", "medium": "WhatsApp", "from": "+923005550999" if direction == "Outgoing" else phone,
		"to": phone if direction == "Outgoing" else "+923005550999", "caller": agent if direction == "Outgoing" else None,
		"receiver": agent if direction == "Incoming" else None, "start_time": when, "end_time": add_to_date(when, seconds=duration),
		"duration": duration if answered else 0, "reference_doctype": party_type, "reference_docname": party, "re_outcome": outcome,
		"re_channel": "WhatsApp Click-to-Call" if direction == "Outgoing" else "WhatsApp Calling API", "re_notes": notes,
		"re_promised_amount": promised, "re_promised_date": promised_by, "re_next_follow_up": follow_up,
	})
	doc.insert(ignore_permissions=True)
	_backdate("CRM Call Log", doc.name, when)
	return doc.name


def _calls_and_tasks(rng, people, bookings, agents):
	from realestate.whatsapp.calls import create_task

	today = getdate(nowdate())
	now = now_datetime()
	# recovery calls with payment promises
	for b in bookings:
		bk = frappe.get_doc("RE Booking", b["name"])
		if b["profile"] == "overdue" and bk.overdue_amount:
			when = add_to_date(now, days=-rng.randint(2, 25), hours=-rng.randint(0, 5))
			promised_by = add_days(getdate(when), rng.randint(3, 20))
			_call("Customer", bk.customer, b["agent"], "Outgoing", rng.choice(["Promised to Pay", "Promised to Pay", "No Answer", "Busy"]), when,
				  rng.randint(60, 420), "Overdue installments discussed", round(bk.overdue_amount, -3), promised_by)
		elif b["profile"] == "due" and rng.random() < 0.35:
			last = frappe.get_all("RE Payment", {"booking": bk.name, "docstatus": 1}, ["posting_date", "amount"], order_by="posting_date desc", limit=1)
			if last and getdate(last[0].posting_date) > add_days(today, -120):
				when = get_datetime(f"{add_days(last[0].posting_date, -rng.randint(3, 8))} {rng.randint(10, 17)}:20:00")
				_call("Customer", bk.customer, b["agent"], "Outgoing", "Promised to Pay", when, rng.randint(60, 300),
					  "Customer confirmed the next installment", last[0].amount, add_days(last[0].posting_date, 1))
	# sales calls to leads and deals
	for lead in people["leads"]:
		agent = frappe.db.get_value("CRM Lead", lead, "lead_owner")
		for _n in range(rng.randint(0, 3)):
			when = add_to_date(now, days=-rng.randint(0, 40), hours=-rng.randint(0, 6))
			outcome = rng.choices(["Answered", "No Answer", "Busy", "Not Interested", "Call Back Later"], [10, 5, 2, 2, 4])[0]
			_call("CRM Lead", lead, agent, "Outgoing", outcome, when, rng.randint(40, 600), rng.choice(
				["Asked about 5 Marla prices", "Wants a site visit on the weekend", "Comparing with another scheme", "Interested in installments", None]))
	for deal in people["deals"]:
		agent = frappe.db.get_value("CRM Deal", deal, "deal_owner")
		_call("CRM Deal", deal, agent, "Outgoing", rng.choice(["Answered", "Call Back Later", "No Answer"]), add_to_date(now, days=-rng.randint(0, 20)),
			  rng.randint(60, 500), "Discussed payment plan")
	# missed incoming calls -> automatic follow-up tasks (via the CRM Call Log hook)
	for party_type, party in [("CRM Lead", l) for l in rng.sample(people["leads"], 6)] + [("Customer", c["customer"]) for c in rng.sample(people["customers"], 4)]:
		agent = frappe.db.get_value(party_type, party, "lead_owner" if party_type == "CRM Lead" else "account_manager")
		_call(party_type, party, agent, "Incoming", "Missed", add_to_date(now, days=-rng.randint(0, 6), hours=-rng.randint(1, 8)))
	# follow-ups: done in the past, open in the future, and some missed
	for i, lead in enumerate(people["leads"] + people["deals"]):
		dt = "CRM Lead" if lead in people["leads"] else "CRM Deal"
		agent = frappe.db.get_value(dt, lead, "lead_owner" if dt == "CRM Lead" else "deal_owner")
		who = frappe.db.get_value(dt, lead, "lead_name")
		due = add_to_date(now, days=rng.randint(-10, 8), hours=rng.randint(-4, 4))
		task = create_task(dt, lead, f"Follow up with {who}", agent, due, rng.choice(["Low", "Medium", "High"]),
						   rng.choice(["Share payment plan", "Confirm site visit", "Send B Block map", "Discuss corner plots"]))
		if get_datetime(due) < now and rng.random() < 0.6:
			frappe.db.set_value("CRM Task", task, "status", "Done")
	frappe.db.commit()


def _site_visits(rng, people, agents):
	now = now_datetime()
	for deal in people["deals"] + [c["deal"] for c in people["customers"][:15]]:
		status = frappe.db.get_value("CRM Deal", deal, "status")
		if status == "Opportunity":
			today_slot = get_datetime(f"{nowdate()} {rng.choice(['11:00', '12:30', '15:00', '16:30'])}:00")
			visit = {"status": "Scheduled", "visit_on": today_slot if rng.random() < 0.35 else add_to_date(now, days=rng.randint(1, 9), hours=rng.randint(-2, 3))}
		elif status == "Lost":
			visit = {"status": rng.choice(["No Show", "Completed"]), "visit_on": add_to_date(now, days=-rng.randint(5, 40)),
					 "outcome": "Not Interested"}
		else:
			visit = {"status": "Completed", "visit_on": add_to_date(now, days=-rng.randint(3, 60)),
					 "outcome": "Booking Expected" if status in ("Negotiation", "Booking") else rng.choice(["Interested", "Thinking"])}
		block = frappe.db.get_value("CRM Deal", deal, "re_interested_block")
		plot = frappe.db.get_value("RE Plot", {"block": block, "status": "Available"}, "name") if block else None
		doc = frappe.get_doc({"doctype": "RE Site Visit", "party_type": "CRM Deal", "party": deal, "interested_block": block,
							  "interested_plot": plot, "send_invitation": 1, "notes": rng.choice(["Came with family", "Liked the park-facing plots",
																								  "Asked about possession date", None]), **visit})
		doc.flags.silent = True
		doc.insert(ignore_permissions=True)
		if visit["status"] == "Scheduled":
			from realestate.whatsapp.channel import notify

			notify("Site Visit Invitation", "RE Site Visit", doc.name)


# ------------------------------------------------------------------ WhatsApp
def _incoming(phone, name, text, when):
	from realestate.whatsapp.mock import simulate_incoming_message

	msg = simulate_incoming_message(phone, text, name)
	frappe.db.set_value("WhatsApp Message", msg, {"timestamp": when, "creation": when, "modified": when}, update_modified=False)
	return msg


def _reply(agent, party_type, party, text, when, status="Read"):
	from realestate.whatsapp.api import send

	frappe.set_user(agent)
	try:
		msg = send(party_type, party, message=text)
	finally:
		frappe.set_user("Administrator")
	frappe.db.set_value("WhatsApp Message", msg, {"timestamp": when, "creation": when, "modified": when, "status": status}, update_modified=False)
	return msg


def _whatsapp(rng, people, bookings, agents):
	"""Conversations with leads and customers, template reminders, an opt-out, a failure with SMS fallback."""
	from whatsapp.whatsapp.webhook import _update_message_status

	from realestate.tasks import send_installment_reminders, send_overdue_notices
	from realestate.whatsapp.channel import notify, sms_fallback_for_failed

	now = now_datetime()
	lead_threads = [
		("Assalam o Alaikum, I saw your ad on Facebook. What is the price of 5 Marla?", "Wa Alaikum Assalam! 5 Marla is PKR 65 lac with a 3-year installment plan (25% down). Would you like to visit the site this weekend?",
		 "Yes, Saturday 11am works for me."),
		("Is there any corner plot available in B Block?", "Yes, we have 2 corner 10 Marla plots left in B Block. I am sending you the location.", "Thank you, I will discuss with my family."),
		("Please share the payment plan for 1 Kanal.", "1 Kanal is PKR 2.2 crore: 30% down and 12 quarterly installments. Shall I arrange a call?", None),
		("Do you have commercial shops on the boulevard?", None, None),
	]
	leads = rng.sample(people["leads"], 14) + rng.sample(people["deals"], 10)
	for i, party in enumerate(leads):
		dt = "CRM Lead" if party in people["leads"] else "CRM Deal"
		phone, name, agent = frappe.db.get_value(dt, party, ["mobile_no", "lead_name", "lead_owner" if dt == "CRM Lead" else "deal_owner"])
		q, a, q2 = lead_threads[i % len(lead_threads)]
		t0 = add_to_date(now, days=-rng.randint(0, 20), hours=-rng.randint(1, 9), minutes=-rng.randint(0, 59))
		_incoming(phone, name, q, t0)
		if a and (i % 6):  # a few stay unanswered -> unread in the inbox
			t1 = add_to_date(t0, minutes=rng.choice([2, 5, 8, 15, 25, 45, 90, 180]))
			_reply(agent, dt, party, a, t1, rng.choice(["Read", "Read", "Delivered"]))
			if q2:
				_incoming(phone, name, q2, add_to_date(t1, minutes=rng.randint(5, 120)))
	# customers: payment conversations
	for c in rng.sample(people["customers"], 18):
		t0 = add_to_date(now, days=-rng.randint(0, 25), hours=-rng.randint(1, 8))
		_incoming(c["phone"], c["name"], rng.choice(["I have deposited this month's installment, slip attached.", "When is my next installment due?",
													 "Please send my society bill.", "Can I get the possession date for my plot?"]), t0)
		_reply(c["agent"], "Customer", c["customer"], rng.choice(["Thank you! We have received it, the receipt will follow.",
																  "Your next installment is due on the 10th. You will get a reminder 3 days before.",
																  "Sure, sending your bill now.", "Possession is expected by June next year."]),
			   add_to_date(t0, minutes=rng.choice([3, 6, 12, 20, 40, 75])))
	# booking confirmations and receipts for recent activity (templates, receipt PDF as the header)
	for b in frappe.get_all("RE Booking", {"docstatus": 1}, ["name", "creation"], order_by="booking_date desc", limit=8):
		log = notify("Booking Confirmation", "RE Booking", b.name)
		_age(log, b.creation)
	for p in frappe.get_all("RE Payment", {"docstatus": 1, "payment_against": "Booking"}, ["name", "creation"], order_by="posting_date desc", limit=10):
		log = notify("Payment Receipt", "RE Payment", p.name)
		_age(log, p.creation)
	for bill in frappe.get_all("RE Society Bill", {"billing_month": get_first_day(nowdate())}, ["name", "creation"], limit=25):
		_age(notify("Society Bill", "RE Society Bill", bill.name), bill.creation)
	# opt-out
	c = people["customers"][3]
	_incoming(c["phone"], c["name"], "STOP", add_to_date(now, days=-2))
	# reminders (daily job) — overdue notices and upcoming installments
	send_overdue_notices()
	send_installment_reminders()
	# the 0000 number: Meta reports failure -> SMS fallback
	for m in frappe.get_all("WhatsApp Message", {"direction": "Outgoing", "status": ("in", ["Sent", "Delivered"]), "message_id": ("like", "wamid.MOCK%")},
							["name", "message_id", "to"], limit=0):
		phone = frappe.db.get_value("WhatsApp Profile", m.to, "phone_number") or ""
		if phone.endswith("0000"):
			_update_message_status({"id": m.message_id, "status": "failed", "errors": [{"code": 131026, "title": "Mock: message undeliverable"}]})
		else:
			_update_message_status({"id": m.message_id, "status": "delivered"})
			if rng.random() < 0.75:
				_update_message_status({"id": m.message_id, "status": "read"})
	sms_fallback_for_failed()
	# two chats nobody owns yet
	for conv in frappe.get_all("RE Conversation", {"unread_count": (">", 0)}, pluck="name", limit=2):
		frappe.db.set_value("RE Conversation", conv, "agent", None)


def _age(log, when):
	msg = frappe.db.get_value("RE Reminder Log", log, "whatsapp_message")
	frappe.db.set_value("RE Reminder Log", log, {"creation": when, "modified": when, "for_date": getdate(when)}, update_modified=False)
	if msg:
		frappe.db.set_value("WhatsApp Message", msg, {"creation": when, "modified": when, "timestamp": when}, update_modified=False)


def _broadcast():
	template = frappe.db.get_value("WhatsApp Template", {"template_label": "RE Overdue Notice"})
	if not template:
		return
	from realestate.re_crm.doctype.re_broadcast.re_broadcast import run

	doc = frappe.get_doc({"doctype": "RE Broadcast", "title": "Overdue reminder - B Block", "template": template,
						  "audience": "Bookings - Overdue", "block": "B Block", "rate_per_minute": 6000}).insert(ignore_permissions=True)
	doc.fetch_recipients()
	run(doc.name)


# ------------------------------------------------------------------ maintenance
def _maintenance(rng, people):
	"""Planned maintenance (ERPNext Project + Tasks + ToDos) over the last 3 months and customer complaints."""
	from frappe.desk.form.assign_to import close_all_assignments

	from realestate.maintenance import _tell_customer, create_task, generate_planned_tasks

	project = frappe.db.get_single_value("RE Settings", "default_project")
	frappe.db.set_single_value("RE Settings", "maintenance_assignee", _staff(0))
	feature = lambda t: frappe.db.get_value("RE Map Feature", {"project": project, "feature_type": t}, "name")  # noqa: E731
	start = add_days(nowdate(), -90)
	plans = [
		("Overhead water tank cleaning", "Water Supply", feature("Water Tank"), None, "Quarterly", 2, "Drain tank\nScrub and chlorinate\nLab sample\nRefill"),
		("Street light inspection", "Street Lights", None, None, "Monthly", 1, "Check every pole\nReplace fused lamps\nLog faults by street"),
		("Trunk sewer flushing", "Sewerage", feature("Sewerage Disposal"), None, "Quarterly", 2, "Jetting of main trunk\nClear manholes\nCheck disposal pumps"),
		("Central park mowing & horticulture", "Parks & Horticulture", feature("Central Park"), None, "Weekly", 0, "Mow lawns\nWater beds\nTrim hedges"),
		("Grid station & transformer check", "Electricity", feature("Grid Station"), None, "Monthly", 1, "Oil level\nEarthing\nLoad readings"),
		("Garbage points audit - A & C Block", "Garbage Collection", None, "A Block", "Weekly", 0, "Bins emptied\nArea swept\nReport overflow"),
	]
	for title, mtype, feat, block, freq, staff, checklist in plans:
		frappe.get_doc({"doctype": "RE Maintenance Plan", "title": title, "maintenance_type": mtype, "project": project, "map_feature": feat,
						"block": block, "frequency": freq, "next_due": add_days(start, rng.randint(0, 20)), "assign_to": _staff(staff),
						"priority": "Medium", "checklist": checklist}).insert(ignore_permissions=True)
	generate_planned_tasks()
	complaints = [
		("Street light not working outside the house", "Street Lights", "High"), ("Water pressure very low in the morning", "Water Supply", "High"),
		("Sewer manhole overflowing in the street", "Sewerage", "Urgent"), ("Garbage not collected for 3 days", "Garbage Collection", "Medium"),
		("Pothole in front of the plot", "Roads", "Medium"), ("Fibre internet down since yesterday", "Internet", "High"),
		("Boundary wall of the plot damaged", "Building / Plot", "Low"), ("Stray dogs near the park", "Security", "Medium"),
	]
	for i, c in enumerate(rng.sample(people["customers"], 16)):
		plot = frappe.db.get_value("RE Plot", {"customer": c["customer"]}, "name")
		subject, mtype, prio = complaints[i % len(complaints)]
		conv = frappe.db.get_value("RE Conversation", {"party": c["customer"]}, "name")
		when = add_to_date(now_datetime(), days=-rng.randint(0, 45), hours=-rng.randint(0, 8))
		task = create_task(f"{subject} ({plot})", mtype, project, _staff(rng.randint(1, 2)), add_to_date(when, days=2), prio,
						   f"Reported by {c['name']} ({c['phone']})", "WhatsApp" if conv and i % 2 else "Customer Complaint",
						   plot=plot, customer=c["customer"], conversation=conv if i % 2 else None, start=when)
		_backdate("Task", task, when)
	# history: most past jobs are done, some still open / overdue
	for t in frappe.get_all("Task", {"re_project": project}, ["name", "exp_end_date", "re_source", "creation"], limit=0):
		due = get_datetime(t.exp_end_date) if t.exp_end_date else now_datetime()
		recent = get_datetime(t.creation) > add_to_date(now_datetime(), days=-10)
		complaint = t.re_source in ("WhatsApp", "Customer Complaint")
		if (not (complaint and recent)) and (due < add_to_date(now_datetime(), days=-3) and rng.random() < 0.8 or due < now_datetime() and rng.random() < 0.3):
			done = min(add_to_date(due, days=rng.randint(-1, 3)), now_datetime())
			frappe.db.set_value("Task", t.name, {"status": "Completed", "completed_on": getdate(done), "completed_by": _staff(rng.randint(1, 2)),
												 "progress": 100, "act_end_date": getdate(done)}, update_modified=False)
			close_all_assignments("Task", t.name)
			if t.re_source in ("WhatsApp", "Customer Complaint"):
				_tell_customer(t.name)
		elif due < now_datetime():
			frappe.db.set_value("Task", t.name, "status", "Overdue", update_modified=False)
		elif rng.random() < 0.3:
			frappe.db.set_value("Task", t.name, "status", "Working", update_modified=False)


def _dealers():
	for name, rate in DEALERS:
		if not frappe.db.exists("Sales Partner", name):
			frappe.get_doc({"doctype": "Sales Partner", "partner_name": name, "commission_rate": rate, "territory": frappe.db.get_value("Territory", {"is_group": 0}),
							"partner_type": "Property Dealer" if frappe.db.exists("Sales Partner Type", "Property Dealer") else None}).insert(ignore_permissions=True)


def _phase_b(rng, people):
	"""Transfers, cancellations (with a refund), merges, surcharges + waivers, a discount request, commissions and dunnings."""
	import json

	from realestate import operations as ops
	from realestate.tasks import generate_surcharges, recovery_dunnings

	today = getdate(nowdate())
	frappe.set_user("Administrator")
	# commissions follow collections; pay out most of the payable ones
	for c in frappe.get_all("RE Commission", {"status": "Accrued"}, pluck="name"):
		frappe.get_doc("RE Commission", c).update_status()
	for c in frappe.get_all("RE Commission", {"status": "Payable"}, ["name", "booking"]):
		if rng.random() < 0.6:
			frappe.get_doc("RE Commission", c.name).pay(rng.choice(["Bank Transfer", "Cheque"]), str(add_days(today, -rng.randint(1, 60))))
	# surcharges for last month and this month, a couple paid, two waivers
	generate_surcharges(add_days(get_first_day(today), -10))
	generate_surcharges(today)
	surcharges = frappe.get_all("RE Surcharge", ["name", "customer", "outstanding_amount"], order_by="amount desc")
	for s in surcharges[:3]:
		frappe.get_doc({"doctype": "RE Payment", "payment_against": "Surcharge", "surcharge": s.name, "customer": s.customer, "posting_date": nowdate(),
						"mode_of_payment": "Cash", "amount": s.outstanding_amount, "send_receipt": 0}).insert(ignore_permissions=True).submit()
	for s, approve in zip(surcharges[3:5], (True, False)):
		w = ops.create("RE Surcharge Waiver", json.dumps({"surcharge": s.name, "amount": round(s.outstanding_amount / 2), "reason": "Medical emergency in the family; first delay"}))
		if approve:
			ops.act("RE Surcharge Waiver", w["name"], "Approve")
	# transfers: clean bookings (no overdue, no society dues)
	clean = [b for b in frappe.db.sql("""select b.name, b.customer from `tabRE Booking` b where b.docstatus=1 and b.status in ('Due','Paid')
		and b.overdue_amount=0 and ifnull(b.cancellation,'')='' and not exists (select 1 from `tabRE Society Bill` s where s.plot=b.plot and s.outstanding_amount>0)""", as_dict=True)]
	rng.shuffle(clean)
	customers = [c["customer"] for c in people["customers"]]
	for i, b in enumerate(clean[:4]):
		to = rng.choice([c for c in customers if c != b.customer])
		t = ops.create("RE Plot Transfer", json.dumps({"booking": b.name, "to_customer": to, "notes": "Sold to a relative"}))
		if i < 3:
			ops.act("RE Plot Transfer", t["name"], "Approve")
	# cancellations: one with a refund, one at the deduction limit, one pending
	due = frappe.db.sql("""select name from `tabRE Booking` where docstatus=1 and status='Due' and ifnull(cancellation,'')=''
		and paid_amount > net_price * 0.2 order by booking_date desc limit 2""")
	overdue = frappe.get_all("RE Booking", {"docstatus": 1, "status": "Overdue", "cancellation": ("is", "not set")}, pluck="name", limit=2)
	for i, name in enumerate([r[0] for r in due] + overdue[:1]):
		c = ops.create("RE Booking Cancellation", json.dumps({"booking": name, "reason": "Non-payment" if name in overdue else "Customer Request", "refund_mode": "Bank Transfer"}))
		if i < 2:
			ops.act("RE Booking Cancellation", c["name"], "Approve")
	# merges: two adjacent available plots in A block (approved) and two in B block (pending)
	for block, approve in (("A Block", True), ("B Block", False)):
		plots = frappe.get_all("RE Plot", {"block": block, "status": "Available"}, pluck="name", order_by="plot_no desc", limit=2)
		mp = ops.merge_preview(json.dumps(plots))
		if mp["ok"]:
			m = ops.create("RE Plot Merge", json.dumps({"new_plot_no": mp["suggested_no"], "plot_size": mp["suggested_size"], "plots": [{"plot": p} for p in plots],
														 "notes": "Corner double plot for premium sale"}))
			if approve:
				ops.act("RE Plot Merge", m["name"], "Approve")
	# a booking waiting for discount approval
	plot = frappe.db.get_value("RE Plot", {"status": "Available", "block": "C Block"})
	c = people["customers"][5]
	if plot:
		price = frappe.db.get_value("RE Plot", plot, "list_price")
		frappe.get_doc({"doctype": "RE Booking", "plot": plot, "customer": c["customer"], "agent": c["agent"], "booking_date": nowdate(),
						"total_price": price, "discount": round(price * 0.08, -3), "payment_plan": "3 Years Quarterly"}).insert(ignore_permissions=True)
	recovery_dunnings()


# ------------------------------------------------------------------ society charge heads, vault, documents
def _charge_heads():
	heads = [
		("Maintenance", "By Plot Size", 0, "All Plots", 10), ("Security", "Fixed", 800, "All Plots", 20), ("Garbage Collection", "Fixed", 300, "All Plots", 30),
		("Sweeper", "Fixed", 250, "All Plots", 40), ("Park Maintenance", "Per Marla", 15, "Residential", 50), ("Street Light", "Fixed", 150, "All Plots", 60),
		("Water", "Fixed", 500, "Residential", 70),
	]
	for name, rate_type, rate, applies, seq in heads:
		if frappe.db.exists("RE Charge Head", name):
			continue
		doc = frappe.get_doc({"doctype": "RE Charge Head", "charge_name": name, "rate_type": rate_type, "rate": rate, "applies_to": applies, "sequence": seq,
							  "item": "SOC-MAINT" if name == "Maintenance" else "SOC-SECURITY" if name == "Security" else "SOC-GARBAGE" if name == "Garbage Collection"
							  else "SOC-WATER" if name == "Water" else None})
		if rate_type == "By Plot Size":
			for size, maint in frappe.get_all("RE Plot Size", fields=["name", "monthly_maintenance"], as_list=True):
				doc.append("rates", {"plot_size": size, "rate": maint})
		doc.insert(ignore_permissions=True)


def _vault(project):
	today = getdate(nowdate())
	docs = [
		("Approved layout plan", "Approved Layout Plan", "Development Authority", "LP-2025-114", -400, None),
		("Environmental NOC (EPA)", "NOC", "Environment Protection Agency", "EPA/NOC/2025/77", -330, 20),
		("Fire safety NOC - sales centre", "NOC", "Civil Defence", "CD-FS-3391", -300, -12),
		("Fard - Khewat 112 / Khatoni 340", "Fard", "Revenue Department", "KH-112/340", -480, None),
		("Registry deed - land purchase", "Registry", "Sub-Registrar", "REG-2024-5531", -470, None),
		("Mutation (Intiqal) No. 8812", "Mutation (Intiqal)", "Revenue Department", "INT-8812", -455, None),
		("Electricity demand notice - 11 kV feeder", "Utility Demand Notice", "Electricity Distribution Co.", "DN-ELE-2209", -240, 60),
		("Gas demand notice", "Utility Demand Notice", "Gas Utility Co.", "DN-GAS-1187", -180, 150),
		("Grid station insurance policy", "Insurance", "Sample Insurance Co.", "POL-778812", -340, 25),
		("Road contractor agreement", "Agreement", "Zafar Construction Co.", "AGR-ROADS-01", -300, 65),
	]
	for title, dtype, authority, ref, issued, expires in docs:
		frappe.get_doc({"doctype": "RE Vault Document", "title": title, "project": project, "document_type": dtype, "authority": authority,
						"reference_no": ref, "issue_date": add_days(today, issued), "expiry_date": add_days(today, expires) if expires is not None else None,
						"renewal_alert_days": 30, "responsible": "kamran.malik@zarmeen.example"}).insert(ignore_permissions=True)


def _documents():
	from realestate.documents import generate

	recent = frappe.get_all("RE Booking", {"docstatus": 1}, pluck="name", order_by="booking_date desc", limit=4)
	from realestate.documents import society_dues

	paid = [b.name for b in frappe.get_all("RE Booking", {"docstatus": 1, "status": "Paid"}, ["name", "customer"]) if society_dues(b.customer) < 0.5][:2]
	for b in recent:
		for t in ("Allotment Letter", "Payment Schedule"):
			generate(t, b)
	for b in paid:
		generate("No Demand Certificate", b)
		generate("Possession Letter", b)
	for plot in frappe.get_all("RE Plot", {"status": "Sold"}, pluck="name", limit=2):
		generate("Site Plan", plot)
	for bill in frappe.get_all("RE Society Bill", {"status": ("in", ["Unpaid", "Overdue"])}, pluck="name", limit=2):
		generate("Maintenance Bill", bill)
	for c in frappe.get_all("Customer", {"re_demo": 1}, pluck="name", limit=2):
		generate("Customer Account Statement", c)


def finish(project=None):
	"""Vault + generated documents only (used when a long reset stopped after the maintenance step)."""
	project = project or frappe.db.get_single_value("RE Settings", "default_project")
	if not frappe.db.exists("RE Vault Document", {"project": project}):
		_vault(project)
	_documents()
	frappe.db.set_single_value("RE Settings", "send_booking_confirmation", 1)
	frappe.db.commit()


PORTAL_PASSWORD = "owner@123"  # local demo only
STAFF_PASSWORD = "staff@123"  # local demo only — agents, managers, recovery and society staff


def staff_logins():
	"""Let the demo staff sign in (to try each role's menus and permissions). Idempotent."""
	from frappe.utils.password import update_password

	for u in frappe.get_all("User", {"name": ("like", "%@zarmeen.example"), "enabled": 1}, pluck="name"):
		update_password(u, STAFF_PASSWORD)
	frappe.db.commit()


def portal_users(count=3):
	"""Owner-portal logins for a few demo customers who own several plots (password PORTAL_PASSWORD)."""
	from frappe.utils.password import update_password

	owners = frappe.db.sql("""select customer from `tabRE Booking` where docstatus=1 and ifnull(cancellation,'')='' and customer in
		(select name from `tabCustomer` where re_demo=1) group by customer order by count(*) desc, sum(overdue_amount) desc limit %s""", count)
	out = []
	for (customer,) in owners:
		name = frappe.db.get_value("Customer", customer, "customer_name")
		email = f"{name.lower().replace(' ', '.')}@owner.zarmeen.example"
		if not frappe.db.exists("User", email):
			u = frappe.get_doc({"doctype": "User", "email": email, "first_name": name, "user_type": "Website User", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert(ignore_permissions=True)
			u.add_roles("Customer")
		update_password(email, PORTAL_PASSWORD)
		frappe.db.set_value("Customer", {"re_portal_user": email}, "re_portal_user", None)
		frappe.db.set_value("Customer", customer, "re_portal_user", email)
		out.append(email)
	frappe.db.commit()
	return out


# ------------------------------------------------------------------ reset


def _purge(doctype, names):
	"""Hard-delete demo vouchers with their child rows and ledger entries (demo data only — never real records)."""
	if not names:
		return
	meta = frappe.get_meta(doctype)
	for df in meta.get_table_fields():
		frappe.db.delete(df.options, {"parent": ("in", names), "parenttype": doctype})
	for ledger in ("GL Entry", "Payment Ledger Entry", "Stock Ledger Entry", "Advance Payment Ledger Entry"):
		if frappe.db.table_exists(ledger):
			frappe.db.delete(ledger, {"voucher_type": doctype, "voucher_no": ("in", names)})
	frappe.db.delete(doctype, {"name": ("in", names)})


def wipe_accounting(projects):
	from realestate.demo.development import SUPPLIERS

	suppliers = [s for s, _g in SUPPLIERS]
	dev = frappe.get_all("Project", {"re_project": ("in", projects or [""])}, pluck="name")
	demo_plots = set(frappe.get_all("RE Plot", {"project": ("in", projects or [""])}, pluck="name"))
	si = [r.name for r in frappe.get_all("Sales Invoice", ["name", "re_plot"], {"re_plot": ("is", "set")}) if r.re_plot in demo_plots]
	pi = frappe.get_all("Purchase Invoice", or_filters={"project": ("in", dev or [""]), "supplier": ("in", suppliers)}, pluck="name")
	pe = set(frappe.get_all("Payment Entry Reference", {"reference_name": ("in", si + pi or [""])}, pluck="parent"))
	pe |= set(frappe.get_all("Payment Entry", {"re_payment": ("is", "set")}, pluck="name"))
	pr = frappe.get_all("Purchase Receipt", {"supplier": ("in", suppliers)}, pluck="name")
	po = frappe.get_all("Purchase Order", {"supplier": ("in", suppliers)}, pluck="name")
	mr = frappe.get_all("Material Request Item", {"project": ("in", dev or [""])}, pluck="parent")
	se = frappe.get_all("Stock Entry", {"project": ("in", dev or [""])}, pluck="name")
	je = frappe.get_all("Journal Entry", or_filters=[["user_remark", "like", "Society staff salaries%"], ["user_remark", "like", "Commission %"]], pluck="name")
	dunnings = list(set(frappe.get_all("Overdue Payment", {"sales_invoice": ("in", si or [""])}, pluck="parent")))
	assets = frappe.get_all("Asset", {"re_project": ("in", projects or [""])}, pluck="name")
	stock_items = set(frappe.get_all("Stock Ledger Entry", {"voucher_no": ("in", pr + se or [""])}, ["item_code", "warehouse"], as_list=True))
	for dt, names in (("Payment Entry", list(pe)), ("Sales Invoice", si), ("Purchase Invoice", pi), ("Stock Entry", se), ("Purchase Receipt", pr),
					  ("Purchase Order", po), ("Material Request", list(set(mr))), ("Journal Entry", je), ("Asset", assets), ("Dunning", dunnings)):
		_purge(dt, names)
	for dt in ("Asset Depreciation Schedule", "Asset Movement Item", "Asset Activity"):
		if frappe.db.table_exists(dt) and frappe.get_meta(dt).has_field("asset"):
			frappe.db.delete(dt, {"asset": ("in", assets or [""])})
	frappe.db.delete("Budget", {"project": ("in", dev or [""])})
	from erpnext.stock.stock_balance import repost_stock

	for item, warehouse in stock_items:
		repost_stock(item, warehouse)


def wipe():
	"""Delete the demo project and everything generated with it."""
	projects = frappe.get_all("RE Project", {"is_demo": 1}, pluck="name")
	wipe_accounting(projects)
	plots = frappe.get_all("RE Plot", {"project": ("in", projects or [""])}, pluck="name")
	customers = frappe.get_all("Customer", {"re_demo": 1}, pluck="name")
	leads = frappe.get_all("CRM Lead", {"re_demo": 1}, pluck="name")
	deals = frappe.get_all("CRM Deal", {"re_demo": 1}, pluck="name")
	parties = customers + leads + deals or [""]
	bookings = frappe.get_all("RE Booking", {"plot": ("in", plots or [""])}, pluck="name")
	bills = frappe.get_all("RE Society Bill", {"plot": ("in", plots or [""])}, pluck="name")
	payments = frappe.get_all("RE Payment", {"plot": ("in", plots or [""])}, pluck="name")
	profiles = frappe.db.sql_list("select name from `tabWhatsApp Profile` where phone_number like '92300555%%'")

	def drop(doctype, names, child=()):
		if not names:
			return
		for c in child:
			frappe.db.delete(c, {"parent": ("in", names), "parenttype": doctype})
		frappe.db.delete(doctype, {"name": ("in", names)})

	for dt, field, values, child in (("RE Plot Transfer", "booking", bookings, []), ("RE Booking Cancellation", "booking", bookings, []),
									 ("RE Commission", "booking", bookings, []), ("RE Surcharge Waiver", "booking", bookings, []), ("RE Surcharge", "booking", bookings, [])):
		drop(dt, frappe.get_all(dt, {field: ("in", values or [""])}, pluck="name"), child)
	merges = list(set(frappe.get_all("RE Merge Plot", {"plot": ("in", plots or [""])}, pluck="parent")))
	drop("RE Plot Merge", merges, ["RE Merge Plot"])
	frappe.db.delete("Workflow Action", {"reference_name": ("in", merges + bookings or [""])})
	payments = list(set(payments) | set(frappe.get_all("RE Payment", {"customer": ("in", customers or [""])}, pluck="name")))
	drop("RE Payment", payments, ["RE Payment Allocation"])
	drop("RE Booking", bookings, ["RE Installment"])
	drop("RE Society Bill", bills, ["RE Bill Charge"])
	frappe.db.delete("RE Site Visit", {"party": ("in", parties)})
	frappe.db.delete("RE Reminder Log", {"party": ("in", parties)})
	for b in frappe.get_all("RE Broadcast", pluck="name"):
		frappe.db.delete("RE Broadcast Recipient", {"parent": b})
	frappe.db.delete("RE Broadcast")
	msgs = frappe.get_all("WhatsApp Message", {"to": ("in", profiles or [""])}, pluck="name")
	frappe.db.delete("WhatsApp Log", {"reference_docname": ("in", msgs or [""])})
	drop("WhatsApp Message", msgs)
	frappe.db.delete("RE Conversation", {"whatsapp_profile": ("in", profiles or [""])})
	drop("WhatsApp Profile", profiles, ["Dynamic Link"])
	calls = frappe.get_all("CRM Call Log", {"reference_docname": ("in", parties)}, pluck="name")
	drop("CRM Call Log", calls, ["Dynamic Link"])
	crm_tasks = frappe.get_all("CRM Task", {"reference_docname": ("in", parties)}, pluck="name")
	frappe.db.delete("ToDo", {"reference_type": ("in", ["CRM Lead", "CRM Deal", "Customer"]), "reference_name": ("in", parties)})
	frappe.db.delete("ToDo", {"reference_type": "CRM Task", "reference_name": ("in", [str(t) for t in crm_tasks] or [""])})
	frappe.db.delete("CRM Notification", {"reference_name": ("in", parties)})
	frappe.db.delete("CRM Task", {"reference_docname": ("in", parties)})
	frappe.db.delete("FCRM Note", {"reference_docname": ("in", parties)})
	frappe.db.delete("Notification Log", {"document_name": ("in", parties)})
	frappe.db.delete("File", {"attached_to_name": ("in", parties + payments + bookings or [""])})
	contacts = frappe.db.sql_list("select distinct parent from `tabDynamic Link` where parenttype = 'Contact' and link_name in %(p)s", {"p": parties})
	drop("Contact", contacts, ["Dynamic Link", "Contact Phone", "Contact Email"])
	portal = [u for u in frappe.get_all("Customer", {"name": ("in", customers or [""])}, pluck="re_portal_user") if u]
	drop("Customer", customers)
	for u in portal:
		frappe.delete_doc("User", u, ignore_permissions=True, force=True)
	drop("CRM Deal", deals, ["CRM Contacts", "CRM Status Change Log", "CRM Products", "CRM Rolling Response Time"])
	drop("CRM Lead", leads, ["CRM Status Change Log", "CRM Products", "CRM Rolling Response Time"])
	tasks = frappe.get_all("Task", {"re_project": ("in", projects or [""])}, pluck="name")
	dev_projects = frappe.get_all("Project", {"re_project": ("in", projects or [""])}, pluck="name")
	frappe.db.delete("ToDo", {"reference_type": "Task", "reference_name": ("in", tasks or [""])})
	drop("Task", tasks, ["Task Depends On"])
	frappe.db.delete("RE Maintenance Plan", {"project": ("in", projects or [""])})
	for proj in dev_projects:
		frappe.db.delete("Project User", {"parent": proj})
		frappe.db.delete("Project", {"name": proj})
	gen = frappe.get_all("RE Generated Document", {"plot": ("in", plots or [""])}, pluck="name") + \
		frappe.get_all("RE Generated Document", {"customer": ("in", customers or [""])}, pluck="name")
	frappe.db.delete("File", {"attached_to_doctype": "RE Generated Document", "attached_to_name": ("in", gen or [""])})
	frappe.db.delete("RE Generated Document", {"name": ("in", gen or [""])})
	frappe.db.delete("File", {"attached_to_name": ("in", bills or [""])})
	frappe.db.delete("RE Vault Document", {"project": ("in", projects or [""])})
	frappe.db.delete("RE Map Feature", {"project": ("in", projects or [""])})
	drop("RE Plot", plots)
	frappe.db.delete("RE Block", {"project": ("in", projects or [""])})
	drop("RE Project", projects, ["RE Land Use"])
	for dt in ("CRM Lead", "CRM Deal", "CRM Task", "Task", "Customer"):  # assignments left behind by earlier resets
		frappe.db.sql(f"delete t from `tabToDo` t left join `tab{dt}` d on d.name = t.reference_name where t.reference_type = %s and d.name is null", dt)
	current = frappe.db.get_single_value("RE Settings", "default_project")
	if current and (current in projects or not frappe.db.exists("RE Project", current)):
		frappe.db.set_single_value("RE Settings", "default_project", None)
	frappe.db.commit()


def reset():
	"""Wipe and regenerate the demo (RE Settings button / `bench re-reset-demo`)."""
	run(reset_first=True)
