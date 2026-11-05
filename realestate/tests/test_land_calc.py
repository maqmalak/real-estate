"""Unit tests for the land arithmetic (no Frappe needed), using the client's report figures:

	cd apps/realestate && python -m unittest realestate.tests.test_land_calc -v
"""

import unittest
from datetime import date

from realestate import land_calc as L


class TestArea(unittest.TestCase):
	def test_unit_conversion(self):
		sq = L.to_sqft(18, 10)
		self.assertAlmostEqual(L.in_unit(sq, "Acre"), 2.3125)
		self.assertAlmostEqual(L.in_unit(L.to_sqft(0, 494), "Marla"), 494)
		self.assertAlmostEqual(L.in_unit(L.to_sqft(24, 14), "Marla"), 494)
		self.assertAlmostEqual(L.in_unit(L.to_sqft(1), "Kanal"), 1)
		self.assertEqual(L.to_sqft(0, 1), 272)

	def test_normalise(self):
		self.assertEqual(L.split(L.to_sqft(36, 20)), (37, 0, 0))
		self.assertEqual(L.split(L.to_sqft(25, 15, 430)), (25, 16, 158))
		self.assertEqual(L.fmt_area(L.to_sqft(25, 15, 430)), "25K-16M-158sqft")
		self.assertEqual(L.fmt_area(0), "0")

	def test_sarsai(self):
		self.assertAlmostEqual(L.to_sqft(0, 0, sarsai=9), 272)

	def test_configurable_marla(self):
		self.assertEqual(L.split(L.to_sqft(0, 21, ms=225), ms=225), (1, 1, 0))
		self.assertAlmostEqual(L.in_unit(L.to_sqft(1, ms=272.25), "Kanal", ms=272.25), 1)

	def test_deal_subtotal(self):
		a = L.deal_area([(18, 10, 0), (18, 10, 0)])
		self.assertEqual((a["kanal"], a["marla"]), (36, 20))
		self.assertEqual(a["normalised"], (37, 0, 0))
		self.assertEqual(L.deal_area([(20, 5, 200), (5, 10, 230)])["normalised"], (25, 16, 158))


class TestMoney(unittest.TestCase):
	def test_client_examples(self):
		self.assertEqual(L.due_amount(L.to_sqft(18, 10), "Acre", 25_000_000), 57_812_500)
		self.assertEqual(L.due_amount(L.to_sqft(0, 494), "Marla", 178_125), 87_993_750)

	def test_line_totals(self):
		line = L.Line(L.to_sqft(18, 10), "Acre", 25_000_000, extra=500_000, paid=20_000_000, adjusted=7_000_000)
		self.assertEqual(line.net_due(), 58_312_500)
		self.assertEqual(line.balance(), 31_312_500)

	def test_overdue(self):
		today = date(2026, 11, 5)
		self.assertTrue(L.is_overdue(date(2026, 10, 1), None, 100, today))
		self.assertFalse(L.is_overdue(date(2026, 10, 1), date(2026, 12, 1), 100, today))  # extended
		self.assertFalse(L.is_overdue(date(2026, 10, 1), None, 0, today))
		self.assertTrue(L.is_overdue(date(2026, 8, 1), date(2026, 10, 1), 1, today))


class TestSchedule(unittest.TestCase):
	def test_sums_to_net(self):
		for net, contract in [(57_812_500, 145_806_250), (87_993_750, 145_806_250), (1_000_003.37, 30_000_003.37)]:
			rows = L.seller_schedule(net, contract, 5_000_000, 20_000_000, 3, date(2026, 1, 10), 2, date(2026, 12, 31), date(2025, 11, 1))
			self.assertAlmostEqual(sum(r[2] for r in rows), round(net, 2), places=2)
			self.assertEqual(rows[-1][0], "Final payment at registry")

	def test_share_of_token(self):
		rows = L.seller_schedule(25_000_000, 100_000_000, 4_000_000, 0, 0, None, 1, date(2026, 6, 1))
		self.assertEqual(rows[0], ("Token (bayana)", None, 1_000_000.0))
		self.assertEqual(rows[-1][2], 24_000_000.0)

	def test_installment_dates(self):
		rows = L.seller_schedule(1_200_000, 1_200_000, 0, 0, 3, date(2026, 1, 31), 1, None)
		self.assertEqual([r[1] for r in rows], [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)])
		self.assertAlmostEqual(sum(r[2] for r in rows), 1_200_000)

	def test_allocate_and_status(self):
		self.assertEqual(L.allocate([100, 200, 300], 250), [100, 150, 0])
		today = date(2026, 11, 5)
		self.assertEqual(L.schedule_status(100, 100, date(2026, 1, 1), today), "Paid")
		self.assertEqual(L.schedule_status(100, 10, date(2026, 11, 1), today), "Overdue")
		self.assertEqual(L.schedule_status(100, 0, date(2026, 11, 9), today), "Due")
		self.assertEqual(L.schedule_status(100, 0, date(2027, 1, 1), today), "Unpaid")


class TestParse(unittest.TestCase):
	def test_lists_and_ranges(self):
		self.assertEqual(L.parse_numbers("43-44"), ["43", "44"])
		self.assertEqual(L.parse_numbers("5/2,16,17"), ["5/2", "16", "17"])
		self.assertEqual(L.parse_numbers("12, 12 ; 7-9"), ["12", "7", "8", "9"])
		self.assertEqual(L.parse_numbers("9-3"), ["9-3"])  # not ascending: kept as written
		self.assertEqual(L.parse_numbers(""), [])

	def test_oversold(self):
		self.assertEqual(L.oversold(L.to_sqft(10), [L.to_sqft(6), L.to_sqft(4)]), 0)
		self.assertEqual(L.oversold(L.to_sqft(10), [L.to_sqft(6), L.to_sqft(5)]), L.to_sqft(1))


if __name__ == "__main__":
	unittest.main()
