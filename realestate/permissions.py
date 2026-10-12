"""Row-level access: a Sales Agent (without a manager / accounts / recovery role) sees only their own bookings, receipts,
visits, chats and commissions. Everyone else follows the normal role permissions."""

import frappe

SEE_ALL = {"System Manager", "Sales Manager", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager", "Administrator"}


def _restricted(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return None
	roles = set(frappe.get_roles(user))
	return user if "Sales Agent" in roles and not roles & SEE_ALL else None


def booking_query(user=None):
	u = _restricted(user)
	return f"`tabRE Booking`.agent = {frappe.db.escape(u)}" if u else ""


def payment_query(user=None):
	u = _restricted(user)
	return (f"(`tabRE Payment`.received_by = {frappe.db.escape(u)} or `tabRE Payment`.booking in "
			f"(select name from `tabRE Booking` where agent = {frappe.db.escape(u)}))") if u else ""


def agent_query(user=None, doctype=None):
	u = _restricted(user)
	if not u:
		return ""
	table = {"RE Site Visit": "RE Site Visit", "RE Conversation": "RE Conversation", "RE Commission": "RE Commission"}.get(doctype or "", None)
	return f"`tab{table}`.agent = {frappe.db.escape(u)}" if table else ""


def owner_query(user=None, doctype=None):
	u = _restricted(user)
	if not u or not doctype:
		return ""
	return f"`tab{doctype}`.booking in (select name from `tabRE Booking` where agent = {frappe.db.escape(u)})"


def booking_has_permission(doc, ptype=None, user=None):
	u = _restricted(user)
	return True if not u or doc.get("agent") in (u, None) else False


# ---------------------------------------------------------------- parties: agents see only their own leads, deals, customers
PARTY_OWNER = {"Customer": "account_manager", "CRM Lead": "lead_owner", "CRM Deal": "deal_owner"}


def party_query(user=None, doctype=None):
	u = _restricted(user)
	field = PARTY_OWNER.get(doctype or "")
	if not u or not field:
		return ""
	cond = f"`tab{doctype}`.`{field}` = {frappe.db.escape(u)}"
	if doctype == "Customer":  # also customers the agent booked a plot for
		cond = f"({cond} or `tabCustomer`.name in (select customer from `tabRE Booking` where agent = {frappe.db.escape(u)}))"
	return cond


def party_has_permission(doc, ptype=None, user=None):
	u = _restricted(user)
	if not u or ptype == "create" or doc.is_new():
		return None  # defer to role permissions
	if doc.get(PARTY_OWNER[doc.doctype]) in (u, None, ""):
		return None
	if doc.doctype == "Customer" and frappe.db.exists("RE Booking", {"customer": doc.name, "agent": u}):
		return None
	return False


def society_bill_query(user=None):
	"""An agent sees the society bills of their own customers."""
	u = _restricted(user)
	if not u:
		return ""
	from realestate.scope import customers_sql

	return f"`tabRE Society Bill`.customer in {customers_sql(u)}"
