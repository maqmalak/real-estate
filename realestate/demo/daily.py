"""A day in the life of Zarmeen Gardens: one run adds that day's activity so the demo behaves like a live ERP.

    bench --site realestate re-daily-data                  # today (skips a day that already ran)
    bench --site realestate re-daily-data --days 7         # catch up the last 7 days, oldest first
    bench --site realestate re-daily-data --force          # run today again

Also runs from the daily scheduler (`realestate.demo.daily.scheduled`), which catches up missed days (up to 14).

What a day brings (counts vary by weekday; Sunday is quiet):
* CRM — new leads (Facebook / walk-in / dealer…), calls with outcomes, follow-up tasks due today and tomorrow (some done),
  site visits scheduled for today, yesterday's visits closed (completed / no show), a few deals converted into bookings.
* WhatsApp — incoming questions from leads and owners, agent replies (some left unread in the inbox).
* Sales & collections — new bookings, installment receipts around their due dates, promised payments kept,
  society bill payments, surcharge payments.
* Operations — transfers, cancellations, re-allotments of cancelled plots, plot merges, surcharge waivers (new requests
  and approvals of older ones), commissions moving to payable and paid out.
* Society operations — complaints from owners as maintenance tasks, planned jobs, technicians working and closing
  jobs (the owner is told on WhatsApp), monthly staff salaries and electricity bill.
* Inventory — material requests, purchase orders from them, goods received into the site store with the supplier's
  invoice, material issued to development heads, supplier invoices paid.
* The usual daily jobs (dues, reminders, surcharges, dunning, planned maintenance) for the day.

Only runs on the demo (RE Settings mock mode on and the default project flagged is_demo); real data is never touched.
Each day uses its own random seed, so re-running a day gives the same kind of day.
"""

import json
import random
import traceback
from datetime import datetime, time

import frappe
from frappe.utils import add_days, add_to_date, cint, flt, get_datetime, get_first_day, get_last_day, getdate, now_datetime, nowdate

from realestate.demo import seed

DONE_KEY = "re_daily_demo_last"  # last day generated (DefaultValue on __default)
MAX_CATCH_UP = 14


# ------------------------------------------------------------------ entry points
def scheduled():
	"""Daily scheduler: fill every day since the last run (up to 14), then today."""
	if not is_demo():
		return
	last = frappe.db.get_default(DONE_KEY)
	today = getdate(nowdate())
	start = add_days(getdate(last), 1) if last else today
	start = max(getdate(start), add_days(today, -MAX_CATCH_UP + 1))
	day = getdate(start)
	while day <= today:
		run(str(day))
		day = add_days(day, 1)


def catch_up(days=1, force=False):
	"""CLI: the last `days` days, oldest first."""
	today = getdate(nowdate())
	out = []
	for back in range(cint(days) - 1, -1, -1):
		out.append(run(str(add_days(today, -back)), force=force))
	return out


def is_demo() -> bool:
	s = frappe.get_cached_doc("RE Settings")
	return bool(s.mock_mode and s.default_project and frappe.db.get_value("RE Project", s.default_project, "is_demo"))


def run(day=None, force=False) -> dict:
	"""Generate one day's activity. Returns counts per area."""
	if not is_demo():
		print("Not the demo (RE Settings mock mode off or the default project is not a demo) — nothing generated")
		return {}
	day = getdate(day or nowdate())
	key = f"re_daily_demo:{day}"
	if frappe.db.get_default(key) and not force:
		print(f"{day}: already generated (use --force to run again)")
		return {}
	ctx = Day(day)
	real_enqueue = frappe.enqueue

	def inline(method, *args, **kwargs):
		kwargs["now"] = True
		return real_enqueue(method, *args, **kwargs)

	frappe.enqueue = inline
	frappe.flags.in_demo = True
	frappe.set_user("Administrator")
	try:
		for name, step in STEPS:
			frappe.db.savepoint("re_daily")
			try:
				step(ctx)
				frappe.db.commit()
			except Exception:
				err = traceback.format_exc()
				try:
					frappe.db.rollback(save_point="re_daily")
				except Exception:  # the step committed part-way (some jobs commit), so the savepoint is gone
					frappe.db.rollback()
				ctx.errors.append(f"{name}: {err.strip().splitlines()[-1]}")
				frappe.log_error(f"RE daily demo data: {name}", err)
	finally:
		frappe.enqueue = real_enqueue
		frappe.flags.in_demo = False
		frappe.set_user("Administrator")
	frappe.db.set_default(key, 1)
	if not frappe.db.get_default(DONE_KEY) or getdate(frappe.db.get_default(DONE_KEY)) < day:
		frappe.db.set_default(DONE_KEY, str(day))
	frappe.db.commit()
	summary = {k: v for k, v in ctx.counts.items() if v}
	print(f"{day}: " + ", ".join(f"{k} {v}" for k, v in summary.items()) or f"{day}: quiet day")
	for e in ctx.errors:
		print(f"  ! {e}")
	return {"day": str(day), "counts": summary, "errors": ctx.errors}


class Day:
	def __init__(self, day):
		self.day = getdate(day)
		self.today = self.day == getdate(nowdate())
		self.rng = random.Random(f"zarmeen-{self.day}")
		weekday = self.day.weekday()  # Mon 0 … Sun 6
		self.load = 0.35 if weekday == 6 else 1.3 if weekday == 5 else 1.0  # quiet Sunday, busy Saturday (site visits)
		self.counts = {}
		self.errors = []
		self.agents = [f"{f.lower()}.{l.lower()}@zarmeen.example" for f, l in seed.AGENTS]
		self.agents = [a for a in self.agents if frappe.db.exists("User", a)] or ["Administrator"]
		self.project = frappe.db.get_single_value("RE Settings", "default_project")
		self.company = frappe.db.get_single_value("RE Settings", "company") or seed.COMPANY

	def n(self, low, high):
		"""How many of something today, scaled by the day's load."""
		return max(0, round(self.rng.randint(low, high) * self.load))

	def take(self, low, high):
		"""Like n() but for a query limit: never 0 (Frappe reads limit=0 as "no limit"), so None means skip."""
		k = self.n(low, high)
		return k or None

	def at(self, start=9, end=18):
		"""A time during office hours on the day (never in the future when the day is today)."""
		latest = datetime.combine(self.day, time(end, 0))
		if self.today:
			latest = min(latest, now_datetime().replace(microsecond=0))
		earliest = datetime.combine(self.day, time(start, 0))
		if latest <= earliest:
			return earliest
		return earliest + (latest - earliest) * self.rng.random()

	def add(self, what, k=1):
		self.counts[what] = self.counts.get(what, 0) + k

	def chance(self, p):
		return self.rng.random() < p * min(self.load, 1.0)


# ------------------------------------------------------------------ CRM
def crm(d: Day):
	from realestate.whatsapp.calls import create_task

	blocks = frappe.get_all("RE Block", ["name", "plot_size"])
	used = set(frappe.get_all("CRM Lead", {"re_demo": 1}, pluck="mobile_no"))
	# new leads
	for _ in range(d.n(3, 7)):
		first, last = d.rng.choice(seed.FIRST), d.rng.choice(seed.LAST)
		phone = next(p for p in (f"{seed.PHONE_PREFIX}{d.rng.randint(1000, 8999):04d}" for _ in range(50)) if p not in used)
		used.add(phone)
		block = d.rng.choice(blocks)
		agent = d.rng.choice(d.agents)
		when = d.at()
		lead = frappe.get_doc({"doctype": "CRM Lead", "first_name": first, "last_name": last, "mobile_no": phone,
							   "email": f"{first}.{last}.{d.rng.randint(100, 999)}@example.com".lower(),
							   "source": d.rng.choices(seed.SOURCES, seed.SOURCE_WEIGHTS)[0], "lead_owner": agent, "status": "New", "re_demo": 1,
							   "re_interested_block": block.name, "re_plot_size": block.plot_size,
							   "re_budget": d.rng.choice([60, 80, 120, 150, 250]) * 100000})
		lead.insert(ignore_permissions=True)
		seed._backdate("CRM Lead", lead.name, when)
		create_task("CRM Lead", lead.name, f"First call to {first} {last}", agent, add_to_date(when, hours=2), "High",
					"New enquiry — share prices and invite for a site visit")
		d.add("leads")
	# calls to open leads; some move along the funnel
	open_leads = frappe.get_all("CRM Lead", {"re_demo": 1, "converted": 0, "status": ("in", ["New", "Contacted", "Nurture", "Qualified"])},
								["name", "lead_owner", "status"], order_by="modified desc", limit=60)
	for lead in d.rng.sample(open_leads, min(len(open_leads), d.n(6, 14))):
		outcome = d.rng.choices(["Answered", "No Answer", "Busy", "Not Interested", "Call Back Later"], [10, 5, 2, 1, 4])[0]
		seed._call("CRM Lead", lead.name, lead.lead_owner or d.agents[0], "Outgoing", outcome, d.at(), d.rng.randint(40, 600),
				   d.rng.choice(["Asked about 5 Marla prices", "Wants a site visit on the weekend", "Comparing with another scheme",
								 "Interested in installments", "Asked for the B Block map", None]))
		d.add("calls")
		nxt = {"New": "Contacted", "Contacted": "Qualified" if outcome == "Answered" else "Contacted", "Nurture": "Qualified"}.get(lead.status)
		if outcome == "Not Interested":
			frappe.db.set_value("CRM Lead", lead.name, "status", "Unqualified")
		elif nxt and nxt != lead.status:
			frappe.db.set_value("CRM Lead", lead.name, "status", nxt)
		if outcome in ("Answered", "Call Back Later"):
			frappe.db.set_value("CRM Lead", lead.name, "re_next_follow_up", add_to_date(d.at(), days=d.rng.randint(1, 5)))
	# qualified leads become deals
	from crm.fcrm.doctype.crm_lead.crm_lead import convert_to_deal

	k = d.take(0, 2)
	for name in frappe.get_all("CRM Lead", {"re_demo": 1, "converted": 0, "status": "Qualified"}, pluck="name", limit=k) if k else []:
		lead = frappe.get_doc("CRM Lead", name)
		lead.flags.ignore_permissions = True
		deal = frappe.get_doc("CRM Deal", convert_to_deal(name, doc=lead))
		deal.update({"deal_owner": lead.lead_owner, "re_demo": 1, "mobile_no": lead.mobile_no, "status": "Opportunity"})
		deal.save(ignore_permissions=True)
		d.add("deals")
	# missed incoming calls -> automatic follow-up tasks (CRM Call Log hook)
	for lead in d.rng.sample(open_leads, min(len(open_leads), d.n(0, 2))):
		seed._call("CRM Lead", lead.name, lead.lead_owner or d.agents[0], "Incoming", "Missed", d.at())
		d.add("missed calls")
	# follow-ups due today get done (most), plus new ones for open deals
	for t in frappe.get_all("CRM Task", {"status": ("in", ["Todo", "Backlog", "In Progress"]), "due_date": ("<=", f"{d.day} 23:59:59")},
							["name", "due_date"], order_by="due_date", limit=40):
		if d.rng.random() < (0.75 if getdate(t.due_date) == d.day else 0.35):
			frappe.db.set_value("CRM Task", t.name, "status", "Done")
			d.add("follow-ups done")
	deals = frappe.get_all("CRM Deal", {"re_demo": 1, "status": ("in", ["Opportunity", "Site Visit", "Negotiation"])}, ["name", "deal_owner", "lead_name"], limit=80)
	for deal in d.rng.sample(deals, min(len(deals), d.n(3, 7))):
		due = add_to_date(d.at(), days=d.rng.choice([0, 0, 1, 1, 2]), hours=d.rng.randint(0, 3))
		create_task("CRM Deal", deal.name, f"Follow up with {deal.lead_name}", deal.deal_owner or d.agents[0], due,
					d.rng.choice(["Low", "Medium", "High"]), d.rng.choice(["Share payment plan", "Confirm site visit", "Send B Block map",
																			"Discuss corner plots", "Negotiate discount"]))
		d.add("follow-ups")
		if d.rng.random() < 0.5:
			seed._call("CRM Deal", deal.name, deal.deal_owner or d.agents[0], "Outgoing", d.rng.choice(["Answered", "Call Back Later", "No Answer"]),
					   d.at(), d.rng.randint(60, 500), "Discussed payment plan")
			d.add("calls")


def site_visits(d: Day):
	from realestate.whatsapp.channel import notify

	# yesterday's (and older) scheduled visits get their result
	for v in frappe.get_all("RE Site Visit", {"status": "Scheduled", "visit_on": ("<", f"{d.day} 00:00:00")}, ["name", "party"], limit=30):
		status = d.rng.choices(["Completed", "No Show", "Rescheduled"], [7, 2, 1])[0]
		values = {"status": status}
		if status == "Completed":
			values["outcome"] = d.rng.choice(["Interested", "Thinking", "Booking Expected", "Not Interested"])
			if values["outcome"] == "Booking Expected" and frappe.db.exists("CRM Deal", v.party):
				frappe.db.set_value("CRM Deal", v.party, "status", "Negotiation")
		elif status == "Rescheduled":
			values = {"visit_on": add_to_date(d.at(), days=d.rng.randint(1, 4))}
		frappe.db.set_value("RE Site Visit", v.name, values)
		d.add("visits closed")
	# today's visits
	deals = frappe.get_all("CRM Deal", {"re_demo": 1, "status": ("in", ["Opportunity", "Site Visit"])}, ["name", "re_interested_block"], limit=60)
	for deal in d.rng.sample(deals, min(len(deals), d.n(1, 4))):
		slot = get_datetime(f"{d.day} {d.rng.choice(['10:30', '11:00', '12:30', '15:00', '16:30', '17:30'])}:00")
		done = slot < (now_datetime() if d.today else get_datetime(f"{d.day} 23:59:00"))
		block = deal.re_interested_block
		plot = frappe.db.get_value("RE Plot", {"block": block, "status": "Available"}, "name") if block else None
		doc = frappe.get_doc({"doctype": "RE Site Visit", "party_type": "CRM Deal", "party": deal.name, "interested_block": block,
							  "interested_plot": plot, "send_invitation": 1, "visit_on": slot,
							  "status": "Completed" if done and d.rng.random() < 0.8 else "Scheduled",
							  "notes": d.rng.choice(["Came with family", "Liked the park-facing plots", "Asked about possession date", None])})
		if doc.status == "Completed":
			doc.outcome = d.rng.choice(["Interested", "Thinking", "Booking Expected"])
		doc.flags.silent = True
		doc.insert(ignore_permissions=True)
		frappe.db.set_value("CRM Deal", deal.name, "status", "Site Visit")
		if doc.status == "Scheduled":
			notify("Site Visit Invitation", "RE Site Visit", doc.name)
		d.add("site visits")


def _reply(agent, party_type, party, text, when, status):
	"""Reply as the owning agent; when agent scoping hides the record from them (e.g. after a transfer), the office replies."""
	try:
		return seed._reply(agent, party_type, party, text, when, status)
	except frappe.PermissionError:
		frappe.clear_last_message()
		return seed._reply("Administrator", party_type, party, text, when, status)


def whatsapp(d: Day):
	questions = ["Assalam o Alaikum, what is the price of 5 Marla?", "Is there any corner plot available in B Block?",
				 "Please share the payment plan for 1 Kanal.", "Do you have commercial shops on the boulevard?",
				 "Can I visit the site on Sunday?", "What is the development status of C Block?"]
	answers = ["5 Marla is PKR 65 lac with a 3-year installment plan (25% down). Would you like to visit the site?",
			   "Yes, two corner plots are left in B Block. Sending you the location now.",
			   "1 Kanal: 30% down and 12 quarterly installments. Shall I arrange a call?",
			   "Yes, D Block has boulevard-facing shops. I am sharing the map.",
			   "Of course, the sales office is open on Sunday 11am-4pm.", "Roads and sewerage are done; electrification is in progress."]
	owner_q = ["I have deposited this month's installment, slip attached.", "When is my next installment due?",
			   "Please send my society bill.", "Can I get the possession date for my plot?", "Street light outside my plot is off."]
	owner_a = ["Thank you! We have received it, the receipt will follow.", "Your next installment is due on the 10th. You will get a reminder.",
			   "Sure, sending your bill now.", "Possession is expected by June next year.", "Logged it — a technician will visit today."]
	leads = frappe.get_all("CRM Lead", {"re_demo": 1, "converted": 0}, ["name", "mobile_no", "lead_name", "lead_owner"], order_by="modified desc", limit=40)
	for lead in d.rng.sample(leads, min(len(leads), d.n(2, 6))):
		i = d.rng.randrange(len(questions))
		t0 = d.at()
		seed._incoming(lead.mobile_no, lead.lead_name, questions[i], t0)
		d.add("whatsapp in")
		if d.rng.random() < 0.75:  # the rest stay unread in the inbox
			_reply(lead.lead_owner or d.agents[0], "CRM Lead", lead.name, answers[i], add_to_date(t0, minutes=d.rng.choice([2, 5, 9, 15, 30, 60])),
						d.rng.choice(["Read", "Delivered", "Sent"]))
			d.add("whatsapp replies")
	customers = frappe.get_all("Customer", {"re_demo": 1, "mobile_no": ("is", "set")}, ["name", "customer_name", "mobile_no", "account_manager"], limit=200)
	for c in d.rng.sample(customers, min(len(customers), d.n(2, 5))):
		i = d.rng.randrange(len(owner_q))
		t0 = d.at()
		seed._incoming(c.mobile_no, c.customer_name, owner_q[i], t0)
		d.add("whatsapp in")
		if d.rng.random() < 0.85:
			_reply(c.account_manager or d.agents[0], "Customer", c.name, owner_a[i], add_to_date(t0, minutes=d.rng.choice([3, 6, 12, 25, 45])),
						d.rng.choice(["Read", "Delivered"]))
			d.add("whatsapp replies")


# ------------------------------------------------------------------ sales & collections
def bookings(d: Day):
	from realestate.identity import demo_identities

	# deals in negotiation close: customer created by Frappe CRM when the deal reaches "Booking"
	k = d.take(0, 2)
	for name in frappe.get_all("CRM Deal", {"re_demo": 1, "status": "Negotiation"}, pluck="name", limit=k) if k else []:
		deal = frappe.get_doc("CRM Deal", name)
		deal.status = "Booking"
		deal.save(ignore_permissions=True)
		customer = frappe.db.get_value("CRM Deal", name, "erpnext_customer")
		if customer:
			frappe.db.set_value("Customer", customer, {"re_demo": 1, "mobile_no": deal.mobile_no, "account_manager": deal.deal_owner})
			demo_identities()  # CNIC + nominee, needed to submit a booking
			_book(d, customer, deal.deal_owner, deal.mobile_no, deal.get("re_interested_block"), crm_deal=name)
	# repeat buyers (investors) now and then
	if d.chance(0.35):
		c = frappe.get_all("Customer", {"re_demo": 1, "re_cnic": ("is", "set")}, ["name", "account_manager", "mobile_no"], limit=200)
		if c:
			c = d.rng.choice(c)
			_book(d, c.name, c.account_manager, c.mobile_no, None)


def _book(d: Day, customer, agent, mobile, block=None, crm_deal=None):
	filters = {"status": "Available", "merged_into": ("is", "not set")}
	if block:
		filters["block"] = block
	plots = frappe.get_all("RE Plot", filters, ["name", "block", "list_price"], limit=200) or frappe.get_all(
		"RE Plot", {"status": "Available", "merged_into": ("is", "not set")}, ["name", "block", "list_price"], limit=200)
	if not plots:
		return None
	plot = d.rng.choice(plots)
	plan_for = {"A Block": "3 Years Monthly", "B Block": "2 Years Monthly", "C Block": "3 Years Quarterly", "D Block": "2 Years Quarterly"}
	plan = d.rng.choice(["Full Payment", plan_for.get(plot.block, "3 Years Monthly"), plan_for.get(plot.block, "3 Years Monthly"),
						 d.rng.choice([p["plan_name"] for p in seed.RICH_PLANS])])
	booking = frappe.get_doc({"doctype": "RE Booking", "plot": plot.name, "customer": customer, "mobile_no": mobile, "crm_deal": crm_deal,
							  "booking_date": d.day, "agent": agent or d.agents[0], "total_price": flt(plot.list_price),
							  "discount": d.rng.choice([0, 0, 0, 50000, 100000]), "payment_plan": plan,
							  "sales_partner": d.rng.choice(seed.DEALERS)[0] if d.rng.random() < 0.35 else None})
	booking.insert(ignore_permissions=True)
	booking.submit()
	seed._backdate("RE Booking", booking.name, d.at())
	booking.reload()
	first = sorted(booking.installments, key=lambda r: r.due_date)[0]
	if getdate(first.due_date) <= add_days(d.day, 3):  # booking amount / down payment paid at the counter
		seed._receipt(d.rng, booking, d.day, first.amount)
		d.add("receipts")
	from realestate.documents import generate

	generate("Allotment Letter", booking.name)
	d.add("bookings")
	return booking.name


def collections(d: Day):
	"""Installments paid around their due dates; promised payments kept; overdue customers catching up."""
	window_from, window_to = add_days(d.day, -7), add_days(d.day, 5)
	rows = frappe.db.sql("""select b.name, i.amount - ifnull(i.paid_amount, 0) as balance, i.due_date, b.status
		from `tabRE Installment` i join `tabRE Booking` b on b.name = i.parent
		where b.docstatus = 1 and ifnull(b.cancellation, '') = '' and i.parenttype = 'RE Booking'
		and i.due_date between %s and %s and i.amount - ifnull(i.paid_amount, 0) > 1
		order by i.due_date""", (window_from, window_to), as_dict=True)
	paid = set()
	for r in rows:
		if r.name in paid:
			continue
		p = 0.3 if getdate(r.due_date) > d.day else 0.45 if getdate(r.due_date) == d.day else 0.2
		if d.chance(p):
			booking = frappe.get_doc("RE Booking", r.name)
			seed._receipt(d.rng, booking, d.day, round(flt(r.balance), 2) if d.rng.random() < 0.85 else round(flt(r.balance) / 2, -3))
			paid.add(r.name)
			d.add("receipts")
	# promises to pay falling due today
	for call in frappe.get_all("CRM Call Log", {"re_promised_date": d.day, "reference_doctype": "Customer"}, ["reference_docname"], limit=20):
		b = frappe.db.get_value("RE Booking", {"customer": call.reference_docname, "docstatus": 1, "status": "Overdue",
											   "cancellation": ("is", "not set")}, ["name", "overdue_amount"], as_dict=True)
		if b and b.name not in paid and d.rng.random() < 0.6:
			seed._receipt(d.rng, frappe.get_doc("RE Booking", b.name), d.day, round(flt(b.overdue_amount), 2))
			paid.add(b.name)
			d.add("promises kept")
	# recovery calls on overdue bookings
	recovery = f"{seed.RECOVERY[0].lower()}.{seed.RECOVERY[1].lower()}@zarmeen.example"
	recovery = recovery if frappe.db.exists("User", recovery) else d.agents[0]
	overdue = frappe.get_all("RE Booking", {"docstatus": 1, "status": "Overdue", "cancellation": ("is", "not set")}, ["name", "customer", "overdue_amount"], limit=100)
	for b in d.rng.sample(overdue, min(len(overdue), d.n(2, 6))):
		outcome = d.rng.choice(["Promised to Pay", "Promised to Pay", "No Answer", "Busy", "Call Back Later"])
		seed._call("Customer", b.customer, recovery, "Outgoing", outcome, d.at(), d.rng.randint(60, 420), "Overdue installments discussed",
				   round(flt(b.overdue_amount), -3) if outcome == "Promised to Pay" else None,
				   add_days(d.day, d.rng.randint(2, 10)) if outcome == "Promised to Pay" else None)
		d.add("recovery calls")
		if b.name not in paid and d.rng.random() < 0.15:  # pays on the call
			seed._receipt(d.rng, frappe.get_doc("RE Booking", b.name), d.day, round(flt(b.overdue_amount), 2))
			d.add("receipts")
	# society bills and surcharges
	for bill in frappe.get_all("RE Society Bill", {"outstanding_amount": (">", 0), "docstatus": ("<", 2)},
							   ["name", "customer", "outstanding_amount"], order_by="due_date", limit=150):
		if d.chance(0.06):
			pay = frappe.get_doc({"doctype": "RE Payment", "payment_against": "Society Bill", "society_bill": bill.name, "customer": bill.customer,
								  "posting_date": d.day, "mode_of_payment": d.rng.choice(seed.MODES), "amount": bill.outstanding_amount, "send_receipt": 0})
			pay.insert(ignore_permissions=True)
			pay.submit()
			d.add("society bills paid")
	for s in frappe.get_all("RE Surcharge", {"outstanding_amount": (">", 0)}, ["name", "customer", "outstanding_amount"], limit=40):
		if d.chance(0.05):
			frappe.get_doc({"doctype": "RE Payment", "payment_against": "Surcharge", "surcharge": s.name, "customer": s.customer, "posting_date": d.day,
							"mode_of_payment": "Cash", "amount": s.outstanding_amount, "send_receipt": 0}).insert(ignore_permissions=True).submit()
			d.add("surcharges paid")


# ------------------------------------------------------------------ operations
def operations(d: Day):
	from realestate import operations as ops

	# approvals: managers clear most requests that waited a day or more
	for dt in ops.WORKFLOW_DOCTYPES:
		for name in frappe.get_all(dt, {"workflow_state": "Pending Approval", "creation": ("<", f"{d.day} 00:00:00")}, pluck="name", limit=5):
			if d.rng.random() < 0.6:
				action = "Approve" if d.rng.random() < 0.85 else "Reject"
				try:
					ops.act(dt, name, action)
					d.add(f"{dt.replace('RE ', '').lower()} {action.lower()}d")
				except Exception:
					frappe.clear_last_message()
	customers = frappe.get_all("Customer", {"re_demo": 1, "re_cnic": ("is", "set")}, pluck="name", limit=300)
	# transfer request (clean booking: nothing overdue, no society dues)
	if d.chance(0.3) and customers:
		clean = frappe.db.sql("""select b.name, b.customer from `tabRE Booking` b where b.docstatus=1 and b.status in ('Due','Paid')
			and b.overdue_amount=0 and ifnull(b.cancellation,'')='' and not exists (select 1 from `tabRE Plot Transfer` t where t.booking=b.name and t.docstatus<2)
			and not exists (select 1 from `tabRE Society Bill` s where s.plot=b.plot and s.outstanding_amount>0) limit 50""", as_dict=True)
		if clean:
			b = d.rng.choice(clean)
			to = d.rng.choice([c for c in customers if c != b.customer])
			ops.create("RE Plot Transfer", json.dumps({"booking": b.name, "to_customer": to, "transfer_date": str(d.day),
														"notes": d.rng.choice(["Sold to a relative", "Sold through a dealer", "Gift to son"])}))
			d.add("transfer requests")
	# cancellation request (long-overdue or customer request)
	if d.chance(0.15):
		b = frappe.db.sql("""select name, status from `tabRE Booking` where docstatus=1 and status in ('Overdue','Due') and ifnull(cancellation,'')=''
			and not exists (select 1 from `tabRE Booking Cancellation` c where c.booking=`tabRE Booking`.name and c.docstatus<2)
			order by overdue_amount desc limit 15""", as_dict=True)
		if b:
			b = d.rng.choice(b)
			ops.create("RE Booking Cancellation", json.dumps({"booking": b.name, "cancellation_date": str(d.day), "refund_mode": "Bank Transfer",
															   "reason": "Non-payment" if b.status == "Overdue" else "Customer Request"}))
			d.add("cancellation requests")
	# re-allot a plot released by an approved cancellation
	if d.chance(0.35):
		cand = ops.reallot_candidates()
		if cand["plots"] and customers:
			c = cand["plots"][0]
			ops.create("RE Re-allotment", json.dumps({"plot": c.plot, "cancellation": c.cancellation, "new_customer": d.rng.choice(customers),
													   "reallotment_date": str(d.day), "agent": d.rng.choice(d.agents), "total_price": c.list_price,
													   "payment_plan": d.rng.choice(cand["plans"]), "reallotment_fee": cand["fee"],
													   "remarks": "Re-allotted to a waiting buyer"}))
			d.add("re-allotment requests")
	# plot merge (rare): two adjacent available plots
	if d.chance(0.06):
		block = d.rng.choice(["A Block", "B Block", "C Block"])
		plots = frappe.get_all("RE Plot", {"block": block, "status": "Available", "merged_into": ("is", "not set")}, pluck="name", order_by="plot_no desc", limit=2)
		if len(plots) == 2:
			mp = ops.merge_preview(json.dumps(plots))
			if mp.get("ok"):
				ops.create("RE Plot Merge", json.dumps({"new_plot_no": mp["suggested_no"], "plot_size": mp["suggested_size"],
														 "plots": [{"plot": p} for p in plots], "notes": "Buyer wants a double plot"}))
				d.add("merge requests")
	# surcharge waiver request
	if d.chance(0.2):
		s = frappe.db.sql("""select name, outstanding_amount from `tabRE Surcharge` where outstanding_amount > 0
			and not exists (select 1 from `tabRE Surcharge Waiver` w where w.surcharge=`tabRE Surcharge`.name and w.docstatus<2) limit 20""", as_dict=True)
		if s:
			s = d.rng.choice(s)
			ops.create("RE Surcharge Waiver", json.dumps({"surcharge": s.name, "amount": round(flt(s.outstanding_amount) / 2),
														   "reason": d.rng.choice(["Medical emergency in the family; first delay", "Bank transfer delayed by the bank",
																				   "Long-standing customer, goodwill"])}))
			d.add("waiver requests")
	# commissions: accrued -> payable follows collections; accounts pay a few payable ones
	for c in frappe.get_all("RE Commission", {"status": "Accrued"}, pluck="name"):
		frappe.get_doc("RE Commission", c).update_status()
	for c in frappe.get_all("RE Commission", {"status": "Payable"}, pluck="name", limit=30):
		if d.chance(0.12):
			frappe.get_doc("RE Commission", c).pay(d.rng.choice(["Bank Transfer", "Cheque"]), str(d.day))
			d.add("commissions paid")


# ------------------------------------------------------------------ society operations & maintenance
def society(d: Day):
	from frappe.desk.form.assign_to import close_all_assignments

	from realestate.maintenance import _tell_customer, create_task

	complaints = [("Street light not working outside the house", "Street Lights", "High"), ("Water pressure very low in the morning", "Water Supply", "High"),
				  ("Sewer manhole overflowing in the street", "Sewerage", "Urgent"), ("Garbage not collected for 2 days", "Garbage Collection", "Medium"),
				  ("Pothole in front of the plot", "Roads", "Medium"), ("Fibre internet down since morning", "Internet", "High"),
				  ("Boundary wall of the plot damaged", "Building / Plot", "Low"), ("Stray dogs near the park", "Security", "Medium"),
				  ("Tree branch fallen on the street", "Parks & Horticulture", "Medium"), ("Transformer making noise", "Electricity", "High")]
	technicians = [seed._staff(1), seed._staff(2)]
	technicians = [t for t in technicians if frappe.db.exists("User", t)] or ["Administrator"]
	owners = frappe.db.sql("""select p.name plot, p.customer, c.customer_name, c.mobile_no from `tabRE Plot` p join `tabCustomer` c on c.name = p.customer
		where p.status in ('Sold', 'Booked') and c.re_demo = 1 limit 300""", as_dict=True)
	for o in d.rng.sample(owners, min(len(owners), d.n(1, 3))):
		subject, mtype, prio = d.rng.choice(complaints)
		conv = frappe.db.get_value("RE Conversation", {"party": o.customer}, "name")
		when = d.at()
		via_whatsapp = bool(conv) and d.rng.random() < 0.6
		task = create_task(f"{subject} ({o.plot})", mtype, d.project, d.rng.choice(technicians), add_to_date(when, days=1 if prio in ("Urgent", "High") else 3),
						   prio, f"Reported by {o.customer_name} ({o.mobile_no})", "WhatsApp" if via_whatsapp else "Customer Complaint",
						   plot=o.plot, customer=o.customer, conversation=conv if via_whatsapp else None, start=when)
		seed._backdate("Task", task, when)
		d.add("complaints")
	# technicians work the queue: open -> working -> completed (owner told on WhatsApp)
	for t in frappe.get_all("Task", {"re_project": ("is", "set"), "status": ("in", ["Open", "Working", "Overdue"]), "creation": ("<", f"{d.day} 23:59:59")},
							["name", "status", "exp_end_date", "re_source", "priority"], order_by="exp_end_date", limit=60):
		due = getdate(t.exp_end_date) if t.exp_end_date else d.day
		if t.status == "Open" and d.rng.random() < 0.45:
			frappe.db.set_value("Task", t.name, {"status": "Working", "progress": d.rng.choice([20, 40, 60])}, update_modified=False)
			d.add("jobs started")
		elif t.status in ("Working", "Overdue") and (due <= d.day or d.rng.random() < 0.3) and d.rng.random() < 0.6:
			frappe.db.set_value("Task", t.name, {"status": "Completed", "completed_on": d.day, "completed_by": d.rng.choice(technicians), "progress": 100,
												 "act_end_date": d.day}, update_modified=False)
			close_all_assignments("Task", t.name)
			if t.re_source in ("WhatsApp", "Customer Complaint"):
				_tell_customer(t.name)
			d.add("jobs completed")
	# monthly society costs: electricity bill on the 5th, staff salaries on the last working days
	from realestate.demo.development import _service_invoice
	from realestate.erp import acc

	cc = acc(d.company, "ZG Society Operations")
	month = getdate(d.day).strftime("%b %Y")
	if d.day.day == 5 and not frappe.db.exists("Purchase Invoice", {"remarks": ("like", f"%electricity {month}%"), "docstatus": 1}):
		inv = _service_invoice(d.company, "Electricity Distribution Co. (sample)", "SV-DEMAND", f"Street lights & tube-well electricity {month}",
							   round(d.rng.uniform(160_000, 240_000), -3), None, acc(d.company, "Society Electricity"), cc, d.day)
		frappe.db.set_value("Purchase Invoice", inv, "remarks", f"Society electricity {month}")
		d.add("society bills (expense)")
	if d.day.day == 28 and not frappe.db.exists("Journal Entry", {"user_remark": ("like", f"%salaries%{month}%"), "docstatus": 1}):
		je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": d.company, "posting_date": d.day,
							 "user_remark": f"Society staff salaries (guards & sweepers) {month}",
							 "accounts": [{"account": acc(d.company, "Society Staff Salaries"), "debit_in_account_currency": 620_000, "cost_center": cc},
										  {"account": acc(d.company, "Cash"), "credit_in_account_currency": 620_000, "cost_center": cc}]})
		je.insert(ignore_permissions=True)
		je.submit()
		d.add("salaries posted")
	if d.chance(0.15):
		_service_invoice(d.company, "Watch & Ward Security Services", "SV-LABOUR", d.rng.choice(["Pump motor rewinding", "Gate barrier repair",
																								   "Street light poles repaired", "Park bench repair"]),
						 round(d.rng.uniform(15_000, 90_000), -3), None, acc(d.company, "Society Repairs & Maintenance"), cc, d.day)
		d.add("repair bills")


# ------------------------------------------------------------------ inventory: buying and stock movement
def inventory(d: Day):
	from erpnext.stock.doctype.material_request.material_request import make_purchase_order

	from realestate.demo import development as dev
	from realestate.erp import COST_HEADS, acc, setup_projects

	if d.day.weekday() == 6:  # store closed on Sunday
		return
	dev._suppliers()
	wh = f"{dev.SITE_STORE} - {frappe.get_cached_value('Company', d.company, 'abbr')}"
	cc = acc(d.company, "ZG Common Infrastructure")
	projects = setup_projects(d.company, d.project)
	heads = [h for h in dev.WORK if h in projects]
	# site engineer raises a material request
	if d.chance(0.45):
		head = d.rng.choice(heads)
		materials = dev.WORK[head][0]
		item, qty = d.rng.choice(materials)
		mr = frappe.get_doc({"doctype": "Material Request", "material_request_type": "Purchase", "company": d.company, "transaction_date": d.day,
							 "schedule_date": add_days(d.day, 7), "set_warehouse": wh, "cost_center": cc,
							 "items": [{"item_code": item, "qty": round(qty * d.rng.uniform(0.4, 1.0)), "warehouse": wh, "schedule_date": add_days(d.day, 7),
										"project": projects[head], "cost_center": cc}]})
		mr.insert(ignore_permissions=True)
		mr.submit()
		d.add("material requests")
	# purchasing turns older requests into purchase orders
	for name in frappe.get_all("Material Request", {"docstatus": 1, "status": ("in", ["Pending", "Partially Ordered"]), "material_request_type": "Purchase",
													 "transaction_date": ("<", d.day), "company": d.company}, pluck="name", limit=3):
		if d.rng.random() < 0.6:
			po = make_purchase_order(name)
			item = po.items[0].item_code
			po.supplier = dev.MATERIAL_SUPPLIER.get(item, "Al-Noor Building Materials")
			po.transaction_date = d.day
			for row in po.items:
				row.rate = dev._rate(row.item_code)
				row.schedule_date = add_days(d.day, 5)
			po.insert(ignore_permissions=True)
			po.submit()
			d.add("purchase orders")
	# goods arrive at the site store with the supplier's bill
	for po in frappe.get_all("Purchase Order", {"docstatus": 1, "company": d.company, "per_received": ("<", 100), "status": ("not in", ["Closed", "On Hold"]),
												"transaction_date": ("<", d.day)}, pluck="name", limit=3):
		if d.rng.random() < 0.55:
			pr = dev._receipt(po, d.day)
			dev._invoice_from_receipt(pr, d.day)
			d.add("goods received")
	# the store issues material to a development head
	if d.chance(0.6):
		head = d.rng.choice(heads)
		account = {h: acc(d.company, a) for h, a, _b in COST_HEADS}[head]
		rows = [(i, q * d.rng.uniform(0.05, 0.2)) for i, q in dev.WORK[head][0]]
		if dev._issue(d.company, rows, projects[head], account, cc, wh, d.day, d.rng):
			d.add("material issues")
	# accounts pay supplier invoices that are due
	for pi in frappe.get_all("Purchase Invoice", {"docstatus": 1, "company": d.company, "outstanding_amount": (">", 0), "due_date": ("<=", add_days(d.day, 3))},
							 pluck="name", order_by="due_date", limit=6):
		if d.chance(0.35):
			_pay_supplier(pi, d)
			d.add("supplier payments")


def _pay_supplier(invoice, d: Day):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	from realestate.erp import acc

	pe = get_payment_entry("Purchase Invoice", invoice)
	pe.posting_date, pe.reference_no, pe.reference_date = d.day, f"CHQ{d.rng.randint(100000, 999999)}", d.day
	pe.mode_of_payment = "Cheque"
	pe.paid_from = acc(d.company, "Main Bank Account")
	pe.insert(ignore_permissions=True)
	pe.submit()


# ------------------------------------------------------------------ bell notifications
def _office():
	"""Who hears about what: owner (Administrator) gets everything; managers by their area."""
	role_user = lambda role: frappe.db.get_value("Has Role", {"role": role, "parenttype": "User", "parent": ("like", "%@zarmeen.example")}, "parent")  # noqa: E731
	return {"admin": "Administrator", "sales": role_user("Sales Manager"), "accounts": role_user("Accounts Manager"),
			"society": role_user("Society Manager"), "recovery": role_user("Recovery Officer")}


def _bell(d: Day, users, title, doctype=None, name=None, kind="Alert", from_user=None, when=None, body=None):
	"""One Notification Log per recipient (skips duplicates), dated when the event happened."""
	when = when or d.at()
	for user in {u for u in users if u}:
		if user == from_user or frappe.db.exists("Notification Log", {"for_user": user, "subject": title, "document_name": name}):
			continue
		log = frappe.get_doc({"doctype": "Notification Log", "for_user": user, "from_user": from_user, "type": kind, "subject": title,
							  "email_content": body, "document_type": doctype, "document_name": name})
		log.insert(ignore_permissions=True)
		seed._backdate("Notification Log", log.name, when)
		d.add("notifications")


def notifications(d: Day):
	from frappe.utils import fmt_money

	rs = lambda v: fmt_money(flt(v), precision=0, currency="PKR")  # noqa: E731
	o = _office()
	day_from, day_to = f"{d.day} 00:00:00", f"{d.day} 23:59:59"
	mute = frappe.flags.mute_emails
	frappe.flags.mute_emails = True  # bell only; no notification emails from the demo
	try:
		# sales
		for b in frappe.get_all("RE Booking", {"docstatus": 1, "booking_date": d.day}, ["name", "plot", "customer_name", "net_price", "agent", "creation"]):
			_bell(d, [o["admin"], o["sales"]], f"New booking {b.name}: plot {b.plot} for {b.customer_name} — {rs(b.net_price)}", "RE Booking", b.name,
				  from_user=b.agent, when=b.creation)
		for v in frappe.get_all("RE Site Visit", {"status": "Completed", "outcome": "Booking Expected", "visit_on": ("between", [day_from, day_to])},
								["name", "party_name", "interested_plot", "visit_on"]):
			_bell(d, [o["sales"]], f"Hot prospect: {v.party_name} visited{f' plot {v.interested_plot}' if v.interested_plot else ''} — booking expected",
				  "RE Site Visit", v.name, when=add_to_date(v.visit_on, hours=1))
		# collections
		receipts = frappe.get_all("RE Payment", {"docstatus": 1, "posting_date": d.day}, ["name", "customer", "amount", "payment_against", "booking", "creation"])
		for p in receipts:
			if p.payment_against == "Booking" and flt(p.amount) >= 500_000:
				who = frappe.db.get_value("Customer", p.customer, "customer_name")
				_bell(d, [o["admin"], o["accounts"]], f"Receipt {rs(p.amount)} from {who} ({p.booking})", "RE Payment", p.name, when=p.creation)
		if receipts:
			_bell(d, [o["admin"], o["accounts"]], f"Collections {d.day.strftime('%d %b')}: {rs(sum(flt(p.amount) for p in receipts))} from {len(receipts)} receipts",
				  when=get_datetime(f"{d.day} 18:30:00") if not d.today else d.at())
		for c in frappe.get_all("CRM Call Log", {"re_promised_date": d.day, "reference_doctype": "Customer"}, ["reference_docname", "re_promised_amount", "caller"], limit=10):
			who = frappe.db.get_value("Customer", c.reference_docname, "customer_name")
			_bell(d, [o["recovery"] or c.caller], f"Promise due today: {who} said they would pay {rs(c.re_promised_amount)}", "Customer", c.reference_docname,
				  when=get_datetime(f"{d.day} 09:05:00"))
		# approvals waiting
		from realestate.operations import WORKFLOW_DOCTYPES

		labels = {"RE Plot Transfer": "Plot transfer", "RE Booking Cancellation": "Booking cancellation", "RE Plot Merge": "Plot merge",
				  "RE Surcharge Waiver": "Surcharge waiver", "RE Re-allotment": "Re-allotment"}
		for dt in WORKFLOW_DOCTYPES:
			for r in frappe.get_all(dt, {"workflow_state": "Pending Approval", "creation": ("between", [day_from, day_to])}, ["name", "owner", "creation"]):
				users = [o["admin"], o["sales"]] + ([o["accounts"]] if dt in ("RE Booking Cancellation", "RE Surcharge Waiver") else [])
				_bell(d, users, f"Approval needed: {labels.get(dt, dt)} {r.name}", dt, r.name, kind="Assignment",
					  from_user=None if r.owner == "Administrator" else r.owner, when=r.creation)
		# commissions paid -> the agent
		for c in frappe.get_all("RE Commission", {"status": "Paid", "modified": ("between", [day_from, day_to])}, ["name", "agent", "booking", "amount"]):
			if c.agent and "@" in c.agent:
				_bell(d, [c.agent], f"Commission {rs(c.amount)} on {c.booking} has been paid", "RE Commission", c.name, from_user=o["accounts"])
		# society operations
		for t in frappe.get_all("Task", {"re_project": ("is", "set"), "creation": ("between", [day_from, day_to]), "re_source": ("in", ["WhatsApp", "Customer Complaint"]),
										  "priority": ("in", ["Urgent", "High"])}, ["name", "subject", "creation"]):
			_bell(d, [o["society"], o["admin"]], f"Urgent complaint: {t.subject}", "Task", t.name, when=t.creation)
		overdue = frappe.db.count("Task", {"re_project": ("is", "set"), "status": "Overdue"})
		if overdue:
			_bell(d, [o["society"]], f"{overdue} maintenance jobs are overdue", when=get_datetime(f"{d.day} 08:45:00"))
		if d.day.weekday() == 0:  # Monday: documents and dues for the week
			for v in frappe.get_all("RE Vault Document", {"expiry_date": ("between", [d.day, add_days(d.day, 30)])}, ["name", "title", "expiry_date"]):
				_bell(d, [o["admin"], o["society"]], f"Renew soon: {v.title} expires {v.expiry_date.strftime('%d %b %Y')}", "RE Vault Document", v.name,
					  when=get_datetime(f"{d.day} 09:00:00"))
			due = frappe.get_all("Purchase Invoice", {"docstatus": 1, "outstanding_amount": (">", 0), "due_date": ("<=", add_days(d.day, 7))}, ["outstanding_amount"])
			if due:
				_bell(d, [o["accounts"]], f"{len(due)} supplier invoices due this week — {rs(sum(flt(x.outstanding_amount) for x in due))}",
					  when=get_datetime(f"{d.day} 09:10:00"))
		# agents mention the manager on a booking (a real comment, so it shows on the booking's activity too)
		notes = ["customer asks for a 2% discount on the balance, please approve", "cheque bounced, customer will pay cash on Monday",
				 "customer wants to change the payment plan to quarterly", "possession date question — can you confirm?",
				 "dealer is asking about the commission status"]
		recent = frappe.get_all("RE Booking", {"docstatus": 1}, ["name", "agent"], order_by="modified desc", limit=30)
		for b in d.rng.sample(recent, min(len(recent), d.n(0, 2))):
			if not (b.agent and o["sales"]):
				continue
			text = d.rng.choice(notes)
			manager = frappe.db.get_value("User", o["sales"], "full_name")
			content = f'<span class="mention" data-id="{o["sales"]}" data-value="{manager}">@{manager}</span> {text}'
			if frappe.db.exists("Comment", {"reference_doctype": "RE Booking", "reference_name": b.name, "content": content}):
				continue  # this day already ran
			c = frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "RE Booking", "reference_name": b.name,
								"comment_email": b.agent, "comment_by": frappe.db.get_value("User", b.agent, "full_name"),
								"content": content})
			c.insert(ignore_permissions=True)
			when = d.at()
			seed._backdate("Comment", c.name, when)
			_bell(d, [o["sales"], o["admin"]], f"{c.comment_by} mentioned you on {b.name}: {text}", "RE Booking", b.name, kind="Mention",
				  from_user=b.agent, when=when)
		# read what is more than three days old (people do open their bell)
		frappe.db.sql("""update `tabNotification Log` set `read` = 1 where `read` = 0 and creation < %s
			and (for_user = 'Administrator' or for_user like %s)""", (add_days(d.day, -3), "%@zarmeen.example"))
	finally:
		frappe.flags.mute_emails = mute


def bell_backfill(days=7):
	"""Bell notifications for days already generated (no other data)."""
	today = getdate(nowdate())
	for back in range(cint(days) - 1, -1, -1):
		ctx = Day(add_days(today, -back))
		notifications(ctx)
		frappe.db.commit()
		print(f"{ctx.day}: {ctx.counts.get('notifications', 0)} notifications")


# ------------------------------------------------------------------ the day's scheduled jobs
def daily_jobs(d: Day):
	"""Run the realestate daily jobs for this day (the bench scheduler may be off on this machine)."""
	from realestate import maintenance, tasks

	if d.today:
		tasks.daily()
		tasks.phase_b_daily()
	else:
		tasks.refresh_dues(d.day)
		if d.day.day == (cint(frappe.db.get_single_value("RE Settings", "bill_day_of_month")) or 1):
			tasks.generate_society_bills(get_first_day(d.day), silent=True)
		tasks.generate_surcharges(d.day)
	maintenance.generate_planned_tasks(d.day)
	maintenance.mark_overdue()
	if d.day == get_last_day(d.day):  # month end: book the month's asset depreciation (ERPNext's own job needs the scheduler)
		from erpnext.assets.doctype.asset.depreciation import post_depreciation_entries

		post_depreciation_entries(date=str(d.day))
		d.add("depreciation posted")
	d.add("daily jobs")


STEPS = [
	("daily jobs", daily_jobs),
	("crm", crm),
	("site visits", site_visits),
	("whatsapp", whatsapp),
	("bookings", bookings),
	("collections", collections),
	("operations", operations),
	("society", society),
	("inventory", inventory),
	("notifications", notifications),  # last: tells the office about the day's events
]
