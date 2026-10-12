"""Money calculations, kept free of Frappe so they can be unit tested on their own (realestate/tests/test_calc.py).

All amounts are PKR; results are rounded to whole rupees (installments to the thousand where noted).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


def _r(x: float) -> float:
	return float(round(x))


@dataclass
class Row:
	key: str
	due: date
	amount: float
	paid: float = 0.0

	@property
	def pending(self) -> float:
		return max(self.amount - self.paid, 0.0)


def schedule(net: float, down_pct: float, n: int, possession_pct: float = 0.0) -> list[float]:
	"""Amounts of [down payment, installment 1..n, possession]; installments rounded to 1,000, last one absorbs the rest.
	The list always sums exactly to `net`."""
	if n <= 0:
		return [_r(net)]
	down = round(net * down_pct / 100, -3)
	possession = round(net * possession_pct / 100, -3)
	rest = net - down - possession
	each = round(rest / n, -3)
	rows = [down] + [each] * (n - 1) + [rest - each * (n - 1)]
	if possession:
		rows.append(possession)
	return [float(x) for x in rows]


def add_months(d: date, months: int) -> date:
	"""Same day `months` later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb)."""
	import calendar

	y, m = divmod(d.month - 1 + months, 12)
	year, month = d.year + y, m + 1
	return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


@dataclass
class Plan:
	"""A payment plan template (percentages of the net price)."""
	installments: int
	period_months: int = 1  # 1 monthly, 3 quarterly, 6 half-yearly
	booking_pct: float = 0.0  # paid on the booking date
	down_pct: float = 0.0  # due `down_days` after booking
	down_days: int = 0
	balloon_pct: float = 0.0  # total of all balloon payments
	balloon_months: int = 0  # 3 quarterly, 6 half-yearly; 0 = none
	development_pct: float = 0.0
	development_month: int = 0  # months after booking; 0 = half-way through the term
	possession_pct: float = 0.0


def plan_schedule(net: float, booking: date, first_due: date | None, plan: Plan) -> list[tuple[str, date, float]]:
	"""Full schedule as (label, due date, amount), sorted by date. Fixed parts are rounded to 1,000; regular installments
	share the rest equally (rounded to 1,000) and the last one absorbs the difference, so the total is always `net`."""
	from datetime import timedelta

	fixed_pct = plan.booking_pct + plan.down_pct + plan.balloon_pct + plan.development_pct + plan.possession_pct
	if fixed_pct > 100 + 1e-9:
		raise ValueError("Booking, down payment, balloons, development and possession exceed 100%")
	n = max(int(plan.installments), 0)
	first = first_due or add_months(booking, plan.period_months)
	term_end = add_months(first, (n - 1) * plan.period_months) if n else booking
	rows: list[tuple[str, date, float]] = []
	if plan.booking_pct:
		rows.append(("Booking Amount", booking, round(net * plan.booking_pct / 100, -3)))
	if plan.down_pct:
		rows.append(("Down Payment", booking + timedelta(days=int(plan.down_days or 0)), round(net * plan.down_pct / 100, -3)))
	if plan.balloon_pct and plan.balloon_months and n:
		term_months = n * plan.period_months
		count = max(term_months // plan.balloon_months, 1)
		each = round(net * plan.balloon_pct / 100 / count, -3)
		total = round(net * plan.balloon_pct / 100, -3)
		for k in range(count):
			amt = each if k < count - 1 else total - each * (count - 1)
			rows.append((f"Balloon Payment {k + 1}", add_months(booking, (k + 1) * plan.balloon_months), amt))
	if plan.development_pct:
		month = plan.development_month or max((n * plan.period_months) // 2, 1)
		rows.append(("Development Charges", add_months(booking, month), round(net * plan.development_pct / 100, -3)))
	if plan.possession_pct:
		rows.append(("On Possession", term_end, round(net * plan.possession_pct / 100, -3)))
	rest = net - sum(r[2] for r in rows)
	if n:
		each = round(rest / n, -3)
		for i in range(n):
			amt = each if i < n - 1 else rest - each * (n - 1)
			rows.append((f"Installment {i + 1}", add_months(first, i * plan.period_months), amt))
	elif abs(rest) > 0.5:
		rows.append(("Balance", booking, rest))
	order = {"Booking Amount": 0, "Down Payment": 1, "On Possession": 3}
	rows.sort(key=lambda r: (r[1], order.get(r[0], 2)))
	return [(label, due, float(amount)) for label, due, amount in rows]


def row_status(amount: float, paid: float, due: date, as_of: date, due_window_days: int = 7) -> str:
	"""Paid · Overdue (due date passed) · Due (falls due within the window, today included) · Partly Paid · Unpaid."""
	from datetime import timedelta

	if amount - paid <= 0.5:
		return "Paid"
	if due < as_of:
		return "Overdue"
	if due <= as_of + timedelta(days=max(int(due_window_days), 0)):
		return "Due"
	return "Partly Paid" if paid > 0 else "Unpaid"


def allocate_fifo(rows: list[Row], amount: float) -> dict[str, float]:
	"""Spread a receipt over unpaid rows, oldest due date first. Raises if it is more than what is outstanding."""
	left = float(amount)
	out: dict[str, float] = {}
	for row in sorted(rows, key=lambda r: r.due):
		if left <= 0:
			break
		take = min(left, row.pending)
		if take > 0:
			out[row.key] = take
			left -= take
	if left > 0.5:
		raise ValueError(f"Amount exceeds the outstanding by {left:,.0f}")
	return out


def cancellation(net: float, paid: float, deduction_pct: float) -> dict[str, float]:
	"""Deduction is a percentage of the price, but never more than what was paid; the rest of the payment is refunded."""
	deduction = min(_r(net * deduction_pct / 100), _r(paid))
	return {"deduction": deduction, "refund": _r(paid) - deduction, "credit_note": _r(net) - deduction}


def surcharge(overdue: float, days_late: int, grace_days: int, pct_per_month: float, cap_pct: float, minimum: float = 0.0) -> float:
	"""Monthly late-payment surcharge on the overdue amount once past the grace period, capped at `cap_pct` of it."""
	if overdue <= 0 or days_late <= grace_days:
		return 0.0
	amount = overdue * pct_per_month / 100
	if cap_pct:
		amount = min(amount, overdue * cap_pct / 100)
	return _r(max(amount, minimum))


def commission(base: float, rate_pct: float) -> float:
	return _r(base * rate_pct / 100)


def commission_status(paid: float, net: float, payable_after_pct: float, paid_out: bool) -> str:
	"""Commission accrues on booking and becomes payable once the customer has paid `payable_after_pct` of the price."""
	if paid_out:
		return "Paid"
	return "Payable" if net and paid * 100 / net >= payable_after_pct else "Accrued"


def merge(plots: list[dict]) -> dict[str, float]:
	"""Area and list price of a merged plot (sum of the parts)."""
	return {"area_marla": sum(float(p["area_marla"]) for p in plots), "list_price": sum(float(p["list_price"]) for p in plots)}


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
	"""Monotone chain hull — outline of adjacent plots being merged."""
	pts = sorted(set(points))
	if len(pts) <= 2:
		return pts

	def cross(o, a, b):
		return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

	lower: list[tuple[float, float]] = []
	for p in pts:
		while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
			lower.pop()
		lower.append(p)
	upper: list[tuple[float, float]] = []
	for p in reversed(pts):
		while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
			upper.pop()
		upper.append(p)
	return lower[:-1] + upper[:-1]
