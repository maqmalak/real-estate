"""Running a block as another user inside a request without signing the caller out."""

from contextlib import contextmanager

import frappe


@contextmanager
def as_user(user):
	"""frappe.set_user alone replaces the session id and data, so the caller's session would be lost at the end of the
	request. Switch user for the block, then put the caller's session back intact."""
	session, form_dict = frappe.local.session, frappe.local.form_dict
	saved = frappe._dict(user=session.user, sid=session.sid, data=session.data)
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user(saved.user)
		frappe.local.session.update(saved)
		frappe.local.form_dict = form_dict


def as_system():
	"""Run as Administrator (after the caller's own permission checks)."""
	return as_user("Administrator")
