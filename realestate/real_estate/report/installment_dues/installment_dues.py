import frappe
from frappe import _
from frappe.utils import date_diff, getdate, today


def execute(filters=None):
	filters = filters or {}
	conds = {"docstatus": 1}
	for f in ("block", "status", "agent"):
		if filters.get(f):
			conds[f] = filters[f]
	bookings = frappe.get_list("RE Booking", filters=conds,  # get_list: an agent only gets their own bookings
							  fields= ["name", "customer", "customer_name", "mobile_no", "plot", "block", "agent", "net_price",
													"paid_amount", "outstanding_amount", "overdue_amount", "overdue_since", "next_due_date",
													"next_due_amount", "status"], order_by="overdue_amount desc, plot", limit=0)
	buckets = {"b30": 0, "b60": 0, "b90": 0, "b90p": 0}
	for b in bookings:
		b.days_overdue = date_diff(today(), b.overdue_since) if b.overdue_since else 0
		key = "b30" if b.days_overdue <= 30 else "b60" if b.days_overdue <= 60 else "b90" if b.days_overdue <= 90 else "b90p"
		if b.overdue_amount:
			buckets[key] += b.overdue_amount
		b.paid_pct = round(b.paid_amount * 100 / b.net_price, 1) if b.net_price else 0
	columns = [
		{"fieldname": "name", "label": _("Booking"), "fieldtype": "Link", "options": "RE Booking", "width": 150},
		{"fieldname": "plot", "label": _("Plot"), "fieldtype": "Link", "options": "RE Plot", "width": 80},
		{"fieldname": "customer_name", "label": _("Customer"), "fieldtype": "Data", "width": 160},
		{"fieldname": "mobile_no", "label": _("Mobile"), "fieldtype": "Data", "width": 120},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 80},
		{"fieldname": "net_price", "label": _("Net Price"), "fieldtype": "Currency", "options": "PKR", "width": 120},
		{"fieldname": "paid_amount", "label": _("Paid"), "fieldtype": "Currency", "options": "PKR", "width": 120},
		{"fieldname": "paid_pct", "label": _("Paid %"), "fieldtype": "Percent", "width": 70},
		{"fieldname": "outstanding_amount", "label": _("Outstanding"), "fieldtype": "Currency", "options": "PKR", "width": 120},
		{"fieldname": "overdue_amount", "label": _("Overdue"), "fieldtype": "Currency", "options": "PKR", "width": 120},
		{"fieldname": "days_overdue", "label": _("Days Overdue"), "fieldtype": "Int", "width": 90},
		{"fieldname": "next_due_date", "label": _("Next Due"), "fieldtype": "Date", "width": 100},
		{"fieldname": "next_due_amount", "label": _("Next Amount"), "fieldtype": "Currency", "options": "PKR", "width": 110},
		{"fieldname": "agent", "label": _("Agent"), "fieldtype": "Link", "options": "User", "width": 140},
	]
	chart = {"data": {"labels": [_("0-30 days"), _("31-60"), _("61-90"), _("90+")], "datasets": [{"name": _("Overdue"), "values": list(buckets.values())}]},
			 "type": "bar", "colors": ["#ef4444"]}
	summary = [{"label": _("Outstanding"), "value": sum(b.outstanding_amount for b in bookings), "datatype": "Currency", "currency": "PKR", "indicator": "Blue"},
			   {"label": _("Overdue"), "value": sum(b.overdue_amount for b in bookings), "datatype": "Currency", "currency": "PKR", "indicator": "Red"},
			   {"label": _("Overdue Bookings"), "value": sum(1 for b in bookings if b.status == "Overdue"), "indicator": "Red"},
			   {"label": _("Fully Paid"), "value": sum(1 for b in bookings if b.status == "Paid"), "indicator": "Green"}]
	return columns, bookings, None, chart, summary
