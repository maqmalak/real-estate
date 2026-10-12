"""Sales per block: plots, sold, bookings and value in the period, average ticket, collected and recovery %."""

import frappe

from realestate import scope
from frappe import _
from frappe.utils import add_months, flt, getdate, nowdate


def execute(filters=None):
	filters = filters or {}
	start = getdate(filters.get("from_date") or add_months(nowdate(), -12))
	end = getdate(filters.get("to_date") or nowdate())
	blocks = frappe.get_all("RE Block", ["name", "block_type"], order_by="name")
	out = []
	for b in blocks:
		plots = frappe.db.count("RE Plot", {"block": b.name, "merged_into": ("is", "not set")})
		sold = frappe.db.count("RE Plot", {"block": b.name, "status": ("in", ["Booked", "Sold", "Possession Given"])})
		row = frappe.db.sql("""select count(*) n, sum(net_price) v, sum(discount) disc from `tabRE Booking`
			where docstatus = 1 and status != 'Cancelled' and block = %s and booking_date between %s and %s""" + scope.booking(), (b.name, start, end), as_dict=True)[0]
		all_time = frappe.db.sql("""select sum(net_price) v, sum(paid_amount) p, sum(overdue_amount) o from `tabRE Booking`
			where docstatus = 1 and status != 'Cancelled' and block = %s""" + scope.booking(), b.name, as_dict=True)[0]
		out.append({"block": b.name, "type": b.block_type, "plots": plots, "sold": sold, "sold_pct": round(sold * 100 / plots, 1) if plots else 0,
					"bookings": row.n or 0, "booked": flt(row.v), "discount": flt(row.disc), "avg_ticket": flt(row.v) / row.n if row.n else 0,
					"total_booked": flt(all_time.v), "collected": flt(all_time.p), "overdue": flt(all_time.o),
					"recovery": round(flt(all_time.p) * 100 / flt(all_time.v), 1) if all_time.v else 0})
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 130}
	columns = [{"fieldname": "block", "label": _("Block"), "fieldtype": "Link", "options": "RE Block", "width": 100},
			   {"fieldname": "type", "label": _("Type"), "fieldtype": "Data", "width": 100},
			   {"fieldname": "plots", "label": _("Plots"), "fieldtype": "Int", "width": 70}, {"fieldname": "sold", "label": _("Sold"), "fieldtype": "Int", "width": 70},
			   {"fieldname": "sold_pct", "label": _("Sold %"), "fieldtype": "Percent", "width": 80},
			   {"fieldname": "bookings", "label": _("Bookings (period)"), "fieldtype": "Int", "width": 120},
			   {"fieldname": "booked", "label": _("Booked (period)"), **cur}, {"fieldname": "discount", "label": _("Discounts"), **cur},
			   {"fieldname": "avg_ticket", "label": _("Avg Ticket"), **cur}, {"fieldname": "total_booked", "label": _("Total Booked"), **cur},
			   {"fieldname": "collected", "label": _("Collected"), **cur}, {"fieldname": "overdue", "label": _("Overdue"), **cur},
			   {"fieldname": "recovery", "label": _("Recovery %"), "fieldtype": "Percent", "width": 100}]
	chart = {"data": {"labels": [d["block"] for d in out], "datasets": [{"name": _("Total booked"), "values": [d["total_booked"] for d in out]},
			 {"name": _("Collected"), "values": [d["collected"] for d in out]}]}, "type": "bar", "colors": ["#3b82f6", "#0d9488"]}
	return columns, out, None, chart
