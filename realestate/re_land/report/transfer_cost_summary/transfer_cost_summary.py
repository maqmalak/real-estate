"""Stamp duty, registration, mutation, CVT, 236K and fees per deal (estimated from the rate table) (realestate.land_reports.transfer_cost_summary)."""

from realestate.land_reports import transfer_cost_summary


def execute(filters=None):
	return transfer_cost_summary(filters)
