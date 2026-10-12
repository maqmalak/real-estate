import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, nowdate

from realestate.geo import centroid, load_geometry


class REPlot(Document):
	def validate(self):
		geom = load_geometry(self.geojson)
		if geom:
			self.centre_lat, self.centre_lng = centroid(geom)
		if not self.list_price and self.plot_size:
			self.list_price = frappe.db.get_value("RE Plot Size", self.plot_size, "base_price")
		self.area_sqft = round(flt(self.area_marla) * 272.25)
		self.track_price()
		if self.status == "Available":
			self.customer = self.booking = self.customer_name = None
			self.payment_status = None

	def track_price(self):
		"""Every list-price change (and the launch price) goes into the price history with who, when and why."""
		old = None if self.is_new() else flt(frappe.db.get_value("RE Plot", self.name, "list_price"))
		new = flt(self.list_price)
		if not new or (old is not None and abs(old - new) < 0.5):
			self.price_change_reason = None
			return
		self.append("price_history", {
			"changed_on": nowdate(), "old_price": old or 0, "new_price": new, "changed_by": frappe.session.user,
			"change_percent": round((new - old) * 100 / old, 2) if old else 0,
			"reason": self.price_change_reason or (_("Launch price") if old is None else _("Price revised")),
		})
		self.price_change_reason = None

	@frappe.whitelist()
	def put_on_hold(self, reason):
		"""Take an available plot off sale for a while (management decision, price review, dispute)."""
		frappe.only_for(("System Manager", "Sales Manager"))
		if self.status not in ("Available", "Reserved"):
			frappe.throw(_("Only an available or reserved plot can be put on hold (this one is {0})").format(self.status))
		self.status, self.hold_reason = "Hold", reason
		self.save()

	@frappe.whitelist()
	def release_hold(self):
		frappe.only_for(("System Manager", "Sales Manager"))
		if self.status != "Hold":
			frappe.throw(_("Plot is not on hold"))
		self.status, self.hold_reason = "Available", None
		self.save()

	def on_update(self):
		if self.has_value_changed("status") or self.has_value_changed("payment_status") or self.has_value_changed("customer"):
			notify_plots([self.name])


def notify_plots(names):
	"""Push new plot colours to open maps (React /re/map, owner portal, desk map) once the transaction commits."""
	rows = frappe.get_all("RE Plot", {"name": ("in", list(names))}, ["name", "status", "payment_status", "customer_name", "booking"])
	if rows:
		frappe.publish_realtime("re_plot_status", {"plots": rows}, after_commit=True)


@frappe.whitelist()
def revise_prices(percent: float, reason: str, block: str | None = None, plot_size: str | None = None, preview: int = 0) -> dict:
	"""Price list revision: change the list price of every *available* (or on-hold) plot matching block / size by `percent`,
	rounded to 1,000. Booked and sold plots keep their agreed price. Each change is logged in the plot's price history."""
	frappe.only_for(("System Manager", "Sales Manager"))
	filters = {"status": ("in", ["Available", "Hold", "Reserved"]), "merged_into": ("is", "not set")}
	if block:
		filters["block"] = block
	if plot_size:
		filters["plot_size"] = plot_size
	plots = frappe.get_all("RE Plot", filters, ["name", "list_price"])
	changes = [{"plot": p.name, "old": flt(p.list_price), "new": round(flt(p.list_price) * (1 + flt(percent) / 100), -3)} for p in plots]
	if not int(preview):
		for c in changes:
			doc = frappe.get_doc("RE Plot", c["plot"])
			doc.list_price, doc.price_change_reason = c["new"], reason
			doc.save()
	return {"count": len(changes), "before": sum(c["old"] for c in changes), "after": sum(c["new"] for c in changes), "sample": changes[:10]}
