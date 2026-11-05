"""Per deal: land cost settled in cash, settled with plots and still payable (realestate.land_reports.land_cost_cash_vs_plots)."""

from realestate.land_reports import land_cost_cash_vs_plots


def execute(filters=None):
	return land_cost_cash_vs_plots(filters)
