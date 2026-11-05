"""Payments, tax withheld, bank vs cash and refunds per land owner (realestate.land_reports.payments_by_seller)."""

from realestate.land_reports import payments_by_seller


def execute(filters=None):
	return payments_by_seller(filters)
