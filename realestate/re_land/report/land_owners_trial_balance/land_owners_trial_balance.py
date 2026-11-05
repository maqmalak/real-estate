"""Opening, invoiced, paid, adjusted and closing per owner, checked against the account (realestate.land_reports.land_owners_trial_balance)."""

from realestate.land_reports import land_owners_trial_balance


def execute(filters=None):
	return land_owners_trial_balance(filters)
