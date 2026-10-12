"""Extra analytics behind the React Dashboard (/re) and Insights (/re/insights): 12-month trends for sparklines,
collection efficiency, status mixes for donuts, block scorecards, cash-flow forecast, agent scorecards and
plain-language highlights. All figures come from submitted RE / ERPNext documents."""

import frappe
from frappe.utils import add_days, add_months, flt, get_first_day, get_last_day, getdate, nowdate


from realestate import scope


def _sql(q, *a):
	return frappe.db.sql(q, a, as_dict=True)


def _one(q, *a):
	return flt(frappe.db.sql(q, a)[0][0])


def _pct(a, b):
	return round(flt(a) * 100 / flt(b), 1) if flt(b) else 0.0


def _months(n=12):
	today = getdate(nowdate())
	start = get_first_day(add_months(today, -(n - 1)))
	return [get_first_day(add_months(start, i)) for i in range(n)]


def trend(n=12):
	"""Per month: collected (installments, society), bookings (count, value), installments due and the share of
	those dues already paid (collection efficiency)."""
	months = _months(n)
	start = months[0]
	P, B = scope.payment(), scope.booking("b")
	coll = {r.m: r for r in _sql("""select date_format(posting_date, '%%Y-%%m') m,
		sum(case when payment_against='Booking' then amount else 0 end) inst,
		sum(case when payment_against='Society Bill' then amount else 0 end) soc,
		sum(case when payment_against='Surcharge' then amount else 0 end) sur
		from `tabRE Payment` where docstatus=1 and posting_date >= %s{P} group by m""".replace("{P}", P), start)}
	sales = {r.m: r for r in _sql("""select date_format(booking_date, '%%Y-%%m') m, count(*) n, sum(net_price) v from `tabRE Booking`
		where docstatus=1 and booking_date >= %s{B} group by m""".replace("{B}", scope.booking()), start)}
	dues = {r.m: r for r in _sql("""select date_format(i.due_date, '%%Y-%%m') m, sum(i.amount) due, sum(i.paid_amount) paid
		from `tabRE Installment` i join `tabRE Booking` b on b.name = i.parent
		where b.docstatus=1 and b.status != 'Cancelled' and i.due_date >= %s and i.due_date <= %s{B} group by m""".replace("{B}", B), start, getdate(nowdate()))}
	out = []
	for m in months:
		k = m.strftime("%Y-%m")
		c, s, d = coll.get(k) or {}, sales.get(k) or {}, dues.get(k) or {}
		out.append({
			"month": m.strftime("%b %y"), "installments": flt(c.get("inst")), "society": flt(c.get("soc")), "surcharge": flt(c.get("sur")),
			"collected": flt(c.get("inst")) + flt(c.get("soc")) + flt(c.get("sur")), "bookings": int(s.get("n") or 0), "booked": flt(s.get("v")),
			"due": flt(d.get("due")), "due_paid": flt(d.get("paid")), "efficiency": _pct(d.get("paid"), d.get("due")),
		})
	return out


def month_to_date():
	"""Collections this month so far vs the same number of days last month (a fair comparison mid-month)."""
	today = getdate(nowdate())
	start = get_first_day(today)
	prev_start = get_first_day(add_months(today, -1))
	days = (today - start).days
	prev_end = min(add_days(prev_start, days), get_last_day(prev_start))
	q = "select sum(amount) from `tabRE Payment` where docstatus=1 and posting_date between %s and %s" + scope.payment()
	return {"now": _one(q, start, today), "prev": _one(q, prev_start, prev_end), "days": days + 1}


def plot_mix():
	status = _sql("select status name, count(*) value, sum(list_price) amount from `tabRE Plot` where merged_into is null group by status order by value desc")
	types = _sql("""select coalesce(s.plot_type, 'Other') name, count(*) value, sum(p.status in ('Booked','Sold','Possession Given')) sold
		from `tabRE Plot` p left join `tabRE Plot Size` s on s.name = p.plot_size where p.merged_into is null group by name""")
	sizes = _sql("""select p.plot_size name, count(*) plots, sum(p.status in ('Booked','Sold','Possession Given')) sold,
		avg(p.list_price) avg_price, sum(case when p.status='Available' then p.list_price else 0 end) unsold_value
		from `tabRE Plot` p where p.merged_into is null group by p.plot_size order by avg_price""")
	for s in sizes:
		s["sold_pct"] = _pct(s.sold, s.plots)
	bookings = _sql("""select status name, count(*) value, sum(outstanding_amount) amount from `tabRE Booking` where docstatus=1{B}
		group by status order by value desc""".replace("{B}", scope.booking()))
	return {"status": status, "types": types, "sizes": sizes, "bookings": bookings}


def receivables():
	today = getdate(nowdate())
	B = scope.booking()
	total = _one("select sum(outstanding_amount) from `tabRE Booking` where docstatus=1 and status != 'Cancelled'" + B)
	overdue = _one("select sum(overdue_amount) from `tabRE Booking` where docstatus=1" + B)
	buckets = {"0–30 d": 0.0, "31–60 d": 0.0, "61–90 d": 0.0, "90+ d": 0.0}
	for r in _sql("select overdue_amount a, datediff(%s, overdue_since) d from `tabRE Booking` where docstatus=1 and overdue_amount > 0" + B, today):
		d = r.d or 0
		key = "0–30 d" if d <= 30 else "31–60 d" if d <= 60 else "61–90 d" if d <= 90 else "90+ d"
		buckets[key] += flt(r.a)
	society = _one("select sum(outstanding_amount) from `tabRE Society Bill` where outstanding_amount > 0" + scope.bill())
	u = scope.agent()
	surcharge = _one("select sum(outstanding_amount) from `tabRE Surcharge` where outstanding_amount > 0"
					 + (f" and booking in (select name from `tabRE Booking` where agent = {frappe.db.escape(u)})" if u else ""))
	return {"total": total, "overdue": overdue, "current": max(total - overdue, 0), "overdue_pct": _pct(overdue, total),
			"aging": [{"name": k, "value": v} for k, v in buckets.items()], "society": society, "surcharge": surcharge}


def block_scorecard():
	rows = _sql("""select b.name block, b.color, b.block_type, count(p.name) plots,
		sum(p.status in ('Booked','Sold','Possession Given')) sold, sum(p.status='Available') available,
		sum(case when p.status='Available' then p.list_price else 0 end) unsold_value
		from `tabRE Block` b left join `tabRE Plot` p on p.block = b.name and p.merged_into is null group by b.name order by b.name""")
	for r in rows:
		v = _sql("""select sum(net_price) booked, sum(paid_amount) received, sum(overdue_amount) overdue, avg(net_price) avg_ticket
			from `tabRE Booking` where docstatus=1 and status != 'Cancelled' and block=%s""" + scope.booking(), r.block)[0]
		society = _one("select sum(outstanding_amount) from `tabRE Society Bill` where outstanding_amount > 0 and plot in (select name from `tabRE Plot` where block=%s)"
					   + scope.bill(), r.block)
		r.update({"booked": flt(v.booked), "received": flt(v.received), "overdue": flt(v.overdue), "avg_ticket": flt(v.avg_ticket),
				  "sold_pct": _pct(r.sold, r.plots), "recovery_pct": _pct(v.received, v.booked), "overdue_pct": _pct(v.overdue, v.booked),
				  "society_due": society})
	return rows


def forecast(n=6):
	"""Scheduled installment inflow for the next n months (unpaid part), plus what is already overdue."""
	today = getdate(nowdate())
	out = []
	for i in range(n):
		start = get_first_day(add_months(today, i))
		end = get_last_day(start)
		lo = max(start, today) if i == 0 else start
		amt = _one("""select sum(i.amount - i.paid_amount) from `tabRE Installment` i join `tabRE Booking` b on b.name = i.parent
			where b.docstatus=1 and b.status != 'Cancelled' and i.due_date between %s and %s and i.amount > i.paid_amount""" + scope.booking("b"), lo, end)
		cnt = _one("""select count(*) from `tabRE Installment` i join `tabRE Booking` b on b.name = i.parent
			where b.docstatus=1 and b.status != 'Cancelled' and i.due_date between %s and %s and i.amount > i.paid_amount""" + scope.booking("b"), lo, end)
		out.append({"month": start.strftime("%b %y"), "expected": amt, "installments": int(cnt)})
	return out


def recent_receipts(limit=8):
	return _sql("""select p.name, p.customer, c.customer_name, p.plot, p.amount, p.mode_of_payment, p.payment_against, p.posting_date
		from `tabRE Payment` p left join `tabCustomer` c on c.name = p.customer
		where p.docstatus=1{P} order by p.posting_date desc, p.creation desc limit %s""".replace("{P}", scope.payment("p")), limit)


def agent_scorecard(since=None):
	"""Per agent: leads, deals, bookings, conversion, booked value, collected, recovery %, overdue %, activity."""
	month = get_first_day(getdate(nowdate()))
	rows = _sql("""select agent, count(*) bookings, sum(net_price) booked, sum(paid_amount) collected, sum(overdue_amount) overdue,
		avg(net_price) avg_ticket, sum(booking_date >= %s) bookings_month from `tabRE Booking`
		where docstatus=1 and status != 'Cancelled' and agent is not null group by agent""", month)
	for a in rows:
		a["name"] = frappe.utils.get_fullname(a.agent)
		a["leads"] = frappe.db.count("CRM Lead", {"lead_owner": a.agent})
		a["deals"] = frappe.db.count("CRM Deal", {"deal_owner": a.agent})
		a["won"] = frappe.db.count("CRM Deal", {"deal_owner": a.agent, "status": "Booking"})
		a["visits"] = frappe.db.count("RE Site Visit", {"agent": a.agent, "status": "Completed"})
		a["calls"] = frappe.db.count("CRM Call Log", {"caller": a.agent})
		a["messages"] = frappe.db.count("WhatsApp Message", {"owner": a.agent, "direction": "Outgoing"})
		a["collected_month"] = _one("""select sum(p.amount) from `tabRE Payment` p join `tabRE Booking` b on b.name = p.booking
			where p.docstatus=1 and b.agent=%s and p.posting_date >= %s""", a.agent, month)
		a["conversion"] = _pct(a["won"], a.leads)  # leads that became a booking deal
		a["recovery_pct"] = _pct(a.collected, a.booked)
		a["overdue_pct"] = _pct(a.overdue, a.booked)
		# composite 0–100: 40% lead conversion, 40% recovery of booked value, 20% for keeping overdue low (0% overdue = full marks)
		a["score"] = round(0.4 * min(a["conversion"], 100) + 0.4 * min(a["recovery_pct"], 100) + 0.2 * max(0, 100 - a["overdue_pct"] * 5))
	rows.sort(key=lambda r: -flt(r.booked))
	return rows


def highlights(tr, rec, blocks, mix, agents=None):
	"""Plain-language takeaways for the top of the page."""
	out = []
	mtd = month_to_date()
	if mtd["prev"]:
		ch = round((mtd["now"] - mtd["prev"]) * 100 / mtd["prev"])
		out.append({"tone": "good" if ch >= 0 else "bad",
					"text": f"Collections month-to-date are {'up' if ch >= 0 else 'down'} {abs(ch)}% on the same {mtd['days']} days last month."})
	if len(tr) >= 2:
		eff = [t["efficiency"] for t in tr[-3:] if t["due"]]
		if eff:
			avg = round(sum(eff) / len(eff))
			out.append({"tone": "good" if avg >= 80 else "warn" if avg >= 60 else "bad",
						"text": f"Collection efficiency averages {avg}% over the last 3 months (dues paid ÷ dues falling due)."})
	if rec["total"]:
		late = next((a["value"] for a in rec["aging"] if a["name"] == "90+ d"), 0)
		if rec["overdue"]:
			out.append({"tone": "bad" if rec["overdue_pct"] > 15 else "warn",
						"text": f"{rec['overdue_pct']}% of receivables are overdue; {round(late * 100 / rec['overdue'])}% of that is more than 90 days late."})
	worst = max((b for b in blocks if b["booked"]), key=lambda b: b["overdue_pct"], default=None)
	if worst and worst["overdue_pct"]:
		out.append({"tone": "warn", "text": f"{worst['block']} has the highest overdue ratio ({worst['overdue_pct']}% of booked value)."})
	best = max((b for b in blocks if b["plots"]), key=lambda b: b["sold_pct"], default=None)
	if best:
		out.append({"tone": "good", "text": f"{best['block']} is the best-selling block — {best['sold_pct']}% of plots sold."})
	slow = min((s for s in mix["sizes"] if s["plots"] >= 5), key=lambda s: s["sold_pct"], default=None)
	if slow and slow["sold_pct"] < 50:
		out.append({"tone": "info", "text": f"{slow['name']} plots sell slowest ({slow['sold_pct']}% sold) — consider an offer."})
	if agents:
		top = max(agents, key=lambda a: a["score"])
		out.append({"tone": "info", "text": f"Top agent by score: {top['name']} ({top['conversion']}% lead conversion, {top['recovery_pct']}% recovered)."})
	return out[:6]


def dashboard_extra():
	tr = trend()
	rec = receivables()
	blocks = block_scorecard()
	mix = plot_mix()
	month = tr[-1]
	return {
		"trend": tr, "receivables": rec, "blocks": blocks, "mix": mix, "forecast": forecast(3), "recent": recent_receipts(),
		"efficiency": {"due": month["due"], "paid": month["due_paid"], "pct": month["efficiency"]}, "mtd": month_to_date(),
		"highlights": highlights(tr, rec, blocks, mix),
	}


def insights_extra():
	tr = trend()
	rec = receivables()
	blocks = block_scorecard()
	mix = plot_mix()
	agents = agent_scorecard()
	sources = _sql("""select coalesce(l.source, 'Not set') source, count(*) leads, sum(coalesce(d.status, '')='Booking') bookings,
		sum(d.name is not null) deals from `tabCRM Lead` l left join `tabCRM Deal` d on d.lead = l.name group by source order by leads desc""")
	for s in sources:
		s["conversion"] = _pct(s.bookings, s.leads)
	# rolling comparison: last 3 months vs the 3 before
	last3, prev3 = tr[-3:], tr[-6:-3]
	sm = lambda rows, k: sum(r[k] for r in rows)  # noqa: E731
	compare = {k: {"now": sm(last3, k), "before": sm(prev3, k)} for k in ("collected", "booked", "bookings", "society")}
	cum, run = [], 0.0
	for t in tr:
		run += t["booked"]
		cum.append(run)
	for t, c in zip(tr, cum):
		t["cumulative_booked"] = c
		t["avg_ticket"] = round(t["booked"] / t["bookings"]) if t["bookings"] else 0
	return {"trend": tr, "receivables": rec, "blocks": blocks, "mix": mix, "agents": agents, "sources": sources,
			"forecast": forecast(6), "compare": compare, "highlights": highlights(tr, rec, blocks, mix, agents)}
