"""The deal sheet: each deal's owner lines, deal subtotals and grand totals (client layout) (realestate.land_reports.land_purchase_status)."""

from realestate.land_reports import land_purchase_status


def execute(filters=None):
	return land_purchase_status(filters)
