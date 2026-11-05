"""Khasras and Kanal at each acquisition stage against the target (realestate.land_reports.land_acquisition_by_stage)."""

from realestate.land_reports import land_acquisition_by_stage


def execute(filters=None):
	return land_acquisition_by_stage(filters)
