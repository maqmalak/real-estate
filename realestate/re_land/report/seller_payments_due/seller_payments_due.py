"""Seller payments overdue or due this week, month or quarter (realestate.land_reports.seller_payments_due)."""

from realestate.land_reports import seller_payments_due


def execute(filters=None):
	return seller_payments_due(filters)
