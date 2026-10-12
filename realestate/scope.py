"""Who sees what on the dashboard and analytics: administrators and managers see the whole scheme; a Sales Agent (without a
manager / accounts / recovery / society role — see realestate.permissions) sees only their own business.

Each helper returns an SQL fragment starting with " and " (or "" for unrestricted users) for a given table alias, so a
query can simply append it. Plot availability stays scheme-wide: agents need it to sell."""

import frappe

from realestate.permissions import _restricted


def agent(user: str | None = None) -> str | None:
	"""The agent to scope to, or None when the user sees everything."""
	return _restricted(user)


def _q(u):
	return frappe.db.escape(u)


def customers_sql(u):
	return (f"(select name from `tabCustomer` where account_manager = {_q(u)}"
			f" union select customer from `tabRE Booking` where agent = {_q(u)} and docstatus = 1)")


def customers(u: str | None = None) -> list[str]:
	u = u if u is not None else agent()
	return [r[0] for r in frappe.db.sql(customers_sql(u))] if u else []


def booking(alias: str = "", u: str | None = None) -> str:
	"""RE Booking rows: the agent's own bookings."""
	u = u if u is not None else agent()
	return f" and {alias + '.' if alias else ''}agent = {_q(u)}" if u else ""


def payment(alias: str = "", u: str | None = None) -> str:
	"""RE Payment rows: receipts for the agent's bookings, received by the agent, or from the agent's customers."""
	u = u if u is not None else agent()
	if not u:
		return ""
	a = alias + "." if alias else ""
	return (f" and ({a}booking in (select name from `tabRE Booking` where agent = {_q(u)}) or {a}received_by = {_q(u)}"
			f" or {a}customer in {customers_sql(u)})")


def bill(alias: str = "", u: str | None = None) -> str:
	"""RE Society Bill rows: bills of the agent's customers."""
	u = u if u is not None else agent()
	return f" and {alias + '.' if alias else ''}customer in {customers_sql(u)}" if u else ""


def filters(doctype: str, u: str | None = None) -> dict:
	"""frappe.get_all / count filters for the agent's own visits, follow-ups and chats."""
	u = u if u is not None else agent()
	if not u:
		return {}
	field = {"RE Site Visit": "agent", "RE Conversation": "agent", "CRM Task": "assigned_to", "RE Booking": "agent",
			 "CRM Lead": "lead_owner", "CRM Deal": "deal_owner"}.get(doctype)
	return {field: u} if field else {}


def info() -> dict:
	u = agent()
	return {"agent": bool(u), "user": u, "name": frappe.utils.get_fullname(u) if u else None}
