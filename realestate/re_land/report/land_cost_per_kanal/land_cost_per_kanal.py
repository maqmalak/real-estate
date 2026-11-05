"""Cost per Kanal and per marla by khasra (realestate.land_reports.land_cost_per_kanal)."""

from realestate.land_reports import land_cost_per_kanal


def execute(filters=None):
	return land_cost_per_kanal(filters)
