"""Court cases over khasras with the area affected and the next hearing (realestate.land_reports.litigation_register)."""

from realestate.land_reports import litigation_register


def execute(filters=None):
	return litigation_register(filters)
