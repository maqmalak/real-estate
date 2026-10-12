"""Link-field search queries (desk set_query): richer dropdown rows than the standard search."""

import frappe
from frappe.utils import fmt_money

DOT = {"Available": "🟢", "Reserved": "🟣", "Hold": "🟠", "Booked": "🔵", "Sold": "🟦", "Possession Given": "🔷", "Blocked": "⚪"}


def _price(v):
	v = float(v or 0)
	return f"Rs {v / 1e7:.2f} Cr" if v >= 1e7 else f"Rs {v / 1e5:.1f} Lac" if v >= 1e5 else fmt_money(v, precision=0)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def plot_query(doctype, txt, searchfield, start, page_len, filters):
	"""RE Plot picker for bookings: status first, then block, size, price, street and premium tags. `filters.status` (list)
	limits the statuses (default: Available / Reserved — plots that can be booked)."""
	statuses = (filters or {}).get("status") or ["Available", "Reserved"]
	if isinstance(statuses, str):
		statuses = [statuses]
	rows = frappe.db.sql(
		"""select name, status, block, plot_size, list_price, street, is_corner, is_park_facing, is_boulevard_facing
		from `tabRE Plot`
		where ifnull(merged_into, '') = '' and status in %(st)s
			and (name like %(t)s or block like %(t)s or plot_size like %(t)s or street like %(t)s or ifnull(customer_name, '') like %(t)s)
		order by (name like %(p)s) desc, block, length(name), name limit %(start)s, %(len)s""",
		{"st": statuses, "t": f"%{txt}%", "p": f"{txt}%", "start": int(start), "len": int(page_len)}, as_dict=True)
	out = []
	for r in rows:
		tags = [t for t, on in (("Corner", r.is_corner), ("Park facing", r.is_park_facing), ("Boulevard", r.is_boulevard_facing)) if on]
		desc = " · ".join(x for x in [f"{DOT.get(r.status, '•')} {r.status}", r.block, r.plot_size, _price(r.list_price), r.street, *tags] if x)
		out.append((r.name, desc))
	return out
