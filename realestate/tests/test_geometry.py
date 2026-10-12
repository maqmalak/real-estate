"""Geometry rules behind the acceptance check: plot-in-block containment and overlap detection (pure functions).

Run: python -m unittest realestate.tests.test_geometry  (from apps/realestate, with the bench Python)
"""

import unittest

from realestate.acceptance import _inside, _overlap_m2, _pairwise_overlaps


def square(x, y, size):
	return [(x, y), (x + size, y), (x + size, y + size), (x, y + size)]


class TestGeometry(unittest.TestCase):
	def test_overlapping_squares(self):
		self.assertAlmostEqual(_overlap_m2(square(0, 0, 10), square(5, 5, 10)), 25.0, places=6)

	def test_shared_edge_is_not_overlap(self):
		self.assertEqual(_overlap_m2(square(0, 0, 10), square(10, 0, 10)), 0.0)

	def test_contained_square(self):
		self.assertAlmostEqual(_overlap_m2(square(0, 0, 10), square(2, 2, 3)), 9.0, places=6)

	def test_winding_order_does_not_matter(self):
		self.assertAlmostEqual(_overlap_m2(list(reversed(square(0, 0, 10))), square(5, 5, 10)), 25.0, places=6)

	def test_point_inside_with_tolerance(self):
		ring = square(0, 0, 10)
		self.assertTrue(_inside((5, 5), ring))
		self.assertTrue(_inside((10.03, 5), ring))  # within 5 cm of the edge
		self.assertFalse(_inside((10.2, 5), ring))

	def test_pairwise_reports_only_real_overlaps(self):
		items = [("A-001", square(0, 0, 10)), ("A-002", square(10, 0, 10)), ("A-003", square(9, 9, 5))]
		found = {(a, b) for a, b, _m in _pairwise_overlaps(items)} | {(b, a) for a, b, _m in _pairwise_overlaps(items)}
		self.assertIn(("A-001", "A-003"), found)
		self.assertIn(("A-002", "A-003"), found)
		self.assertNotIn(("A-001", "A-002"), found)


if __name__ == "__main__":
	unittest.main()
