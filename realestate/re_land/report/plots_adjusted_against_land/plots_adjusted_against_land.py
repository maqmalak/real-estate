"""Plots given to land owners instead of cash, with values and bookings (realestate.land_reports.plots_adjusted_against_land)."""

from realestate.land_reports import plots_adjusted_against_land


def execute(filters=None):
	return plots_adjusted_against_land(filters)
