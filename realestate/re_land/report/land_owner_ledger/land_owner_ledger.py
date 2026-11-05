"""One owner's statement from Creditors - Land Owners, or every owner summarised (realestate.land_reports.land_owner_ledger)."""

from realestate.land_reports import land_owner_ledger


def execute(filters=None):
	return land_owner_ledger(filters)
