"""Unit tests for the money calculations (no Frappe needed):

	cd apps/realestate && python -m unittest realestate.tests.test_calc -v
"""

import unittest
from datetime import date

from realestate import calc


class TestSchedule(unittest.TestCase):
	def test_sums_to_net(self):
		for net, down, n, poss in [(6_500_000, 25, 36, 0), (12_000_000, 20, 24, 10), (22_000_000, 30, 12, 0), (8_133_337, 25, 8, 5)]:
			rows = calc.schedule(net, down, n, poss)
			self.assertAlmostEqual(sum(rows), net, places=2)
			self.assertEqual(len(rows), 1 + n + (1 if poss else 0))

	def test_full_payment(self):
		self.assertEqual(calc.schedule(6_500_000, 100, 0), [6_500_000.0])

	def test_installments_rounded_to_thousand(self):
		rows = calc.schedule(12_000_000, 20, 24, 10)
		self.assertTrue(all(r % 1000 == 0 for r in rows[1:-2]))


class TestFifo(unittest.TestCase):
	def rows(self):
		return [calc.Row("b", date(2026, 2, 1), 100), calc.Row("a", date(2026, 1, 1), 100, paid=40), calc.Row("c", date(2026, 3, 1), 100)]

	def test_oldest_first(self):
		self.assertEqual(calc.allocate_fifo(self.rows(), 120), {"a": 60.0, "b": 60.0})

	def test_exact_total(self):
		self.assertEqual(sum(calc.allocate_fifo(self.rows(), 260).values()), 260)

	def test_overpayment_rejected(self):
		with self.assertRaises(ValueError):
			calc.allocate_fifo(self.rows(), 261)


class TestCancellation(unittest.TestCase):
	def test_refund_after_deduction(self):
		self.assertEqual(calc.cancellation(10_000_000, 3_000_000, 10), {"deduction": 1_000_000, "refund": 2_000_000, "credit_note": 9_000_000})

	def test_deduction_never_exceeds_paid(self):
		r = calc.cancellation(10_000_000, 400_000, 10)
		self.assertEqual((r["deduction"], r["refund"]), (400_000, 0))


class TestSurcharge(unittest.TestCase):
	def test_within_grace(self):
		self.assertEqual(calc.surcharge(500_000, 10, 15, 2, 10), 0)

	def test_monthly_rate(self):
		self.assertEqual(calc.surcharge(500_000, 40, 15, 2, 10), 10_000)

	def test_cap_and_minimum(self):
		self.assertEqual(calc.surcharge(500_000, 40, 15, 20, 10), 50_000)
		self.assertEqual(calc.surcharge(10_000, 40, 15, 2, 10, minimum=500), 500)


class TestCommission(unittest.TestCase):
	def test_amount_and_status(self):
		self.assertEqual(calc.commission(12_000_000, 1), 120_000)
		self.assertEqual(calc.commission_status(2_000_000, 12_000_000, 25, False), "Accrued")
		self.assertEqual(calc.commission_status(3_000_000, 12_000_000, 25, False), "Payable")
		self.assertEqual(calc.commission_status(3_000_000, 12_000_000, 25, True), "Paid")


class TestMerge(unittest.TestCase):
	def test_sum_and_hull(self):
		self.assertEqual(calc.merge([{"area_marla": 5, "list_price": 6.5e6}, {"area_marla": 5, "list_price": 6.5e6}]), {"area_marla": 10, "list_price": 13e6})
		hull = calc.convex_hull([(0, 0), (1, 0), (1, 1), (0, 1), (1, 0), (2, 0), (2, 1), (1, 1)])
		self.assertEqual(sorted(hull), [(0, 0), (0, 1), (2, 0), (2, 1)])


if __name__ == "__main__":
	unittest.main()


class TestPlanSchedule(unittest.TestCase):
	"""Payment plans with booking amount, down payment, balloons, development charges and possession."""

	def setUp(self):
		from datetime import date

		from realestate.calc import Plan, add_months, plan_schedule

		self.date, self.Plan, self.add_months, self.plan_schedule = date, Plan, add_months, plan_schedule

	def test_simple_plan_matches_old_schedule(self):
		from realestate.calc import schedule

		net = 6_500_000
		rows = self.plan_schedule(net, self.date(2026, 1, 15), None, self.Plan(installments=24, down_pct=25, possession_pct=10))
		self.assertEqual([r[2] for r in rows], schedule(net, 25, 24, 10))
		self.assertEqual(rows[0][0], "Down Payment")
		self.assertEqual(rows[-1][0], "On Possession")

	def test_full_plan_totals_net(self):
		plan = self.Plan(installments=24, booking_pct=10, down_pct=15, down_days=30, balloon_pct=20, balloon_months=6,
						 development_pct=5, development_month=12, possession_pct=10)
		net = 11_875_000  # price 12.5m less 5% discount
		rows = self.plan_schedule(net, self.date(2026, 3, 1), None, plan)
		self.assertAlmostEqual(sum(r[2] for r in rows), net)
		labels = [r[0] for r in rows]
		self.assertEqual(labels[0], "Booking Amount")
		self.assertEqual(labels.count("Installment 24"), 1)
		self.assertEqual(sum(1 for l in labels if l.startswith("Balloon")), 4)  # 24 months / 6
		self.assertIn("Development Charges", labels)
		down = next(r for r in rows if r[0] == "Down Payment")
		self.assertEqual(down[1], self.date(2026, 3, 31))
		dev = next(r for r in rows if r[0] == "Development Charges")
		self.assertEqual(dev[1], self.date(2027, 3, 1))

	def test_dates_sorted_and_month_end_clamped(self):
		self.assertEqual(self.add_months(self.date(2026, 1, 31), 1), self.date(2026, 2, 28))
		rows = self.plan_schedule(1_000_000, self.date(2026, 1, 31), None, self.Plan(installments=6, down_pct=20, balloon_pct=10, balloon_months=3))
		dates = [r[1] for r in rows]
		self.assertEqual(dates, sorted(dates))
		self.assertAlmostEqual(sum(r[2] for r in rows), 1_000_000)

	def test_quarterly_installments(self):
		rows = self.plan_schedule(9_000_000, self.date(2026, 1, 1), None, self.Plan(installments=8, period_months=3, down_pct=20))
		inst = [r for r in rows if r[0].startswith("Installment")]
		self.assertEqual(inst[1][1], self.date(2026, 7, 1))
		self.assertAlmostEqual(sum(r[2] for r in rows), 9_000_000)

	def test_over_100_percent_rejected(self):
		with self.assertRaises(ValueError):
			self.plan_schedule(1_000_000, self.date(2026, 1, 1), None, self.Plan(installments=10, down_pct=60, possession_pct=50))


class TestRowStatus(unittest.TestCase):
	def test_statuses(self):
		from datetime import date

		from realestate.calc import row_status

		today = date(2026, 10, 12)
		self.assertEqual(row_status(1000, 1000, date(2026, 9, 1), today), "Paid")
		self.assertEqual(row_status(1000, 0, date(2026, 10, 11), today), "Overdue")
		self.assertEqual(row_status(1000, 0, date(2026, 10, 12), today), "Due")  # due today
		self.assertEqual(row_status(1000, 400, date(2026, 10, 19), today), "Due")  # 7-day window
		self.assertEqual(row_status(1000, 400, date(2026, 10, 20), today), "Partly Paid")
		self.assertEqual(row_status(1000, 0, date(2026, 11, 12), today), "Unpaid")
		self.assertEqual(row_status(1000, 0, date(2026, 10, 14), today, due_window_days=0), "Unpaid")
