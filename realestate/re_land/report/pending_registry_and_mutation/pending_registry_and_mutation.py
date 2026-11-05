"""Owners not yet registered, with the registry deadline and readiness (realestate.land_reports.pending_registry_and_mutation)."""

from realestate.land_reports import pending_registry_and_mutation


def execute(filters=None):
	return pending_registry_and_mutation(filters)
