import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from realestate.calc import convex_hull, merge
from realestate.real_estate.doctype.re_plot.re_plot import notify_plots


class REPlotMerge(Document):
	def validate(self):
		if len(self.plots) < 2:
			frappe.throw(_("Pick at least two plots to merge"))
		plots = [frappe.get_doc("RE Plot", r.plot) for r in self.plots]
		if len({p.block for p in plots}) > 1:
			frappe.throw(_("Plots must be in the same block"))
		statuses = {p.status for p in plots}
		owners = {p.customer for p in plots}
		if statuses == {"Available"}:
			self.customer = None
		elif statuses <= {"Sold", "Possession Given"} and len(owners) == 1:
			self.customer = owners.pop()
		else:
			frappe.throw(_("Merge either available plots, or fully paid plots of the same owner"))
		if frappe.db.exists("RE Plot", self.new_plot_no):
			frappe.throw(_("Plot {0} already exists").format(self.new_plot_no))
		totals = merge([{"area_marla": p.area_marla, "list_price": p.list_price} for p in plots])
		self.total_area_marla, self.total_list_price = totals["area_marla"], totals["list_price"]

	def on_submit(self):
		plots = [frappe.get_doc("RE Plot", r.plot) for r in self.plots]
		points = [tuple(c) for p in plots for c in json.loads(p.geojson)["coordinates"][0][:-1]] if all(p.geojson for p in plots) else []
		hull = convex_hull(points)
		first = plots[0]
		new = frappe.get_doc({
			"doctype": "RE Plot", "plot_no": self.new_plot_no, "project": first.project, "block": first.block, "plot_size": self.plot_size,
			"area_marla": self.total_area_marla, "list_price": self.total_list_price, "street": first.street,
			"is_corner": int(any(p.is_corner for p in plots)), "is_park_facing": int(any(p.is_park_facing for p in plots)),
			"is_boulevard_facing": int(any(p.is_boulevard_facing for p in plots)), "status": "Available",
			"geojson": json.dumps({"type": "Polygon", "coordinates": [[list(c) for c in hull] + [list(hull[0])]]}) if hull else None,
		}).insert(ignore_permissions=True)
		if self.customer:
			frappe.db.set_value("RE Plot", new.name, {"status": "Sold", "customer": self.customer, "payment_status": "Paid"})
			if flt(self.merge_fee):
				from realestate.erp import sales_invoice

				company = frappe.db.get_single_value("RE Settings", "company")
				sales_invoice(company, self.customer, self.merge_date, [("RE-MERGE-FEE", self.merge_fee, f"Merge into plot {new.name}")],
							  remarks=f"Plot merge {self.name}", re_plot=new.name)
		for p in plots:
			frappe.db.set_value("RE Plot", p.name, {"status": "Blocked", "merged_into": new.name})
		self.db_set("new_plot", new.name)
		notify_plots([new.name, *(p.name for p in plots)])

	def on_cancel(self):
		if frappe.db.exists("RE Booking", {"plot": self.new_plot, "docstatus": 1}):
			frappe.throw(_("Plot {0} has been booked; it cannot be split back").format(self.new_plot))
		for r in self.plots:
			frappe.db.set_value("RE Plot", r.plot, {"status": "Sold" if self.customer else "Available", "merged_into": None})
		notify_plots([r.plot for r in self.plots])
		if self.new_plot:
			frappe.delete_doc("RE Plot", self.new_plot, ignore_permissions=True, force=True)
