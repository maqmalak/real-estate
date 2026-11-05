"""Every seller's schedule with paid, pending, status and days late (realestate.land_reports.seller_payment_schedule)."""

from realestate.land_reports import seller_payment_schedule


def execute(filters=None):
	return seller_payment_schedule(filters)
