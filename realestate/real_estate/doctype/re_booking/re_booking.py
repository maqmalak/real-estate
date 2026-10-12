import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate, today

from realestate.calc import plan_schedule, row_status



def money(value):
	return f"{flt(value):,.0f}"


class REBooking(Document):
	def validate(self):
		self.net_price = flt(self.total_price) - flt(self.discount)
		if self.net_price <= 0:
			frappe.throw(_("Net price must be positive"))
		if not self.installments:
			self.make_schedule()
		scheduled = sum(flt(r.amount) for r in self.installments)
		if abs(scheduled - self.net_price) > 1:
			frappe.throw(_("Payment schedule ({0}) must add up to the net price ({1})").format(money(scheduled), money(self.net_price)))
		self._check_plot()
		self.refresh_totals()

	def before_submit(self):
		from realestate.identity import require_cnic

		require_cnic(self)
		limit = flt(frappe.db.get_single_value("RE Settings", "max_discount_percent"))
		if limit and flt(self.discount) * 100 / max(flt(self.total_price), 1) > limit + 1e-6 and not self.discount_approved_by:
			frappe.throw(_("A discount above {0}% needs approval (Actions → Approve discount, Sales Manager)").format(limit))
		self.refresh_totals()

	@frappe.whitelist()
	def approve_discount(self):
		frappe.only_for(("Sales Manager", "System Manager"))
		self.db_set("discount_approved_by", frappe.session.user)
		self.add_comment("Info", _("Discount of {0} approved").format(money(self.discount)))
		return frappe.session.user

	def on_submit(self):
		from realestate.erp import booking_invoice

		self.db_set("sales_invoice", booking_invoice(self))
		self.update_plot()
		self.make_commissions()
		if frappe.db.get_single_value("RE Settings", "send_booking_confirmation"):
			from realestate.whatsapp.channel import notify

			frappe.enqueue(notify, enqueue_after_commit=True, reminder_type="Booking Confirmation",
						   reference_doctype=self.doctype, reference_name=self.name)

	def make_commissions(self):
		"""Agent and dealer commission accrue when the booking is submitted (RE Commission posts the journal)."""
		settings = frappe.get_cached_doc("RE Settings")
		rows = []
		if self.agent:
			rows.append({"beneficiary_type": "Agent", "agent": self.agent, "rate": flt(self.agent_commission_rate) or flt(settings.agent_commission_percent)})
		if self.sales_partner:
			default = flt(frappe.db.get_value("Sales Partner", self.sales_partner, "commission_rate")) or flt(settings.dealer_commission_percent)
			rows.append({"beneficiary_type": "Dealer", "sales_partner": self.sales_partner, "rate": flt(self.dealer_commission_rate) or default})
		for row in rows:
			if row["rate"] > 0 and not frappe.db.exists("RE Commission", {"booking": self.name, "beneficiary_type": row["beneficiary_type"]}):
				frappe.get_doc({"doctype": "RE Commission", "booking": self.name, **row}).insert(ignore_permissions=True)

	def on_cancel(self):
		from realestate.erp import cancel

		if frappe.db.exists("RE Payment", {"booking": self.name, "docstatus": 1}):
			frappe.throw(_("Cancel the receipts of this booking first"))
		cancel("Sales Invoice", self.sales_invoice)
		self.db_set("status", "Cancelled")
		if frappe.db.get_value("RE Plot", self.plot, "booking") == self.name:
			plot = frappe.get_doc("RE Plot", self.plot)
			plot.status = "Available"
			plot.save(ignore_permissions=True)

	@frappe.whitelist()
	def make_schedule(self):
		"""Installment rows from the payment plan: booking amount, down payment, regular installments, balloon payments,
		development charges and possession (realestate.calc.plan_schedule; always totals price minus discount)."""
		plan = frappe.get_doc("RE Payment Plan", self.payment_plan)
		net = flt(self.total_price) - flt(self.discount)
		start = getdate(self.booking_date or today())
		first = getdate(self.first_due_date) if self.first_due_date else None
		self.installments = []
		for label, due, amount in plan_schedule(net, start, first, plan.to_plan()):
			self.append("installments", {"label": _(label), "due_date": due, "amount": amount})
		return self.installments

	def refresh_totals(self, as_of=None):
		"""Row statuses, totals, next due and overall status from the installments' paid amounts."""
		as_of = getdate(as_of or today())
		self.paid_amount = self.overdue_amount = 0
		self.overdue_since = self.next_due_date = None
		self.next_due_amount = 0
		window = cint(frappe.db.get_single_value("RE Settings", "due_window_days") or 7)
		for r in self.installments:
			pending = flt(r.amount) - flt(r.paid_amount)
			self.paid_amount += flt(r.paid_amount)
			r.status = row_status(flt(r.amount), flt(r.paid_amount), getdate(r.due_date), as_of, window)
			if r.status == "Overdue":
				self.overdue_amount += pending
				self.overdue_since = self.overdue_since or r.due_date
			elif r.status != "Paid" and not self.next_due_date:
				self.next_due_date, self.next_due_amount = r.due_date, pending
		self.outstanding_amount = flt(self.net_price) - self.paid_amount
		if self.docstatus == 2 or self.get("cancellation"):
			self.status = "Cancelled"
		elif self.docstatus == 0:
			self.status = "Draft"
		elif self.outstanding_amount <= 0.5:
			self.status = "Paid"
		else:
			self.status = "Overdue" if self.overdue_amount > 0 else "Due"
		self.fmt_net_price = money(self.net_price)
		self.fmt_outstanding = money(self.outstanding_amount)
		self.fmt_overdue = money(self.overdue_amount)
		self.fmt_next_due_amount = money(self.next_due_amount)

	def update_payment_status(self, as_of=None):
		"""After a payment (or daily): save computed values on a submitted booking and recolour the plot."""
		self.refresh_totals(as_of)
		for r in self.installments:
			r.db_update()
		self.db_update()
		if self.get("cancellation"):
			return
		self.update_plot()
		for c in frappe.get_all("RE Commission", {"booking": self.name, "status": "Accrued"}, pluck="name"):
			frappe.get_doc("RE Commission", c).update_status()

	def update_plot(self):
		plot = frappe.get_doc("RE Plot", self.plot)
		handed_over = plot.status == "Possession Given" and self.possession_date
		plot.update({
			"status": "Possession Given" if handed_over else "Sold" if self.status == "Paid" else "Booked",
			"payment_status": {"Paid": "Paid", "Overdue": "Overdue"}.get(self.status, "Due"),
			"customer": self.customer, "booking": self.name,
		})
		plot.flags.ignore_permissions = True
		plot.save()

	def _check_plot(self):
		plot = frappe.db.get_value("RE Plot", self.plot, ["status", "booking"], as_dict=True)
		if plot.booking and plot.booking != self.name and plot.status in ("Booked", "Sold"):
			frappe.throw(_("Plot {0} is already booked under {1}").format(self.plot, plot.booking))
		if plot.status == "Blocked":
			frappe.throw(_("Plot {0} is blocked").format(self.plot))
		if plot.status == "Hold":
			frappe.throw(_("Plot {0} is on hold — release it first").format(self.plot), title=_("Plot on hold"))

	@frappe.whitelist()
	def give_possession(self, possession_date=None, remarks=None):
		"""Hand the plot over: only when the price is fully paid and the plot has no society dues. Marks the plot
		'Possession Given' and issues the Possession Letter (versioned in RE Generated Document)."""
		frappe.only_for(("System Manager", "Sales Manager", "Society Manager"))
		if self.docstatus != 1 or self.status != "Paid":
			frappe.throw(_("Possession can be given only on a fully paid booking (status is {0})").format(self.status))
		if self.possession_date:
			frappe.throw(_("Possession was already given on {0}").format(frappe.format(self.possession_date, "Date")))
		dues = flt(frappe.db.sql("select sum(outstanding_amount) from `tabRE Society Bill` where plot=%s", self.plot)[0][0])
		if dues > 0.5:
			frappe.throw(_("Plot {0} has society dues of {1}; clear them before handing over").format(self.plot, money(dues)))
		on = getdate(possession_date or today())
		self.db_set({"possession_date": on, "possession_given_by": frappe.session.user, "possession_remarks": remarks})
		plot = frappe.get_doc("RE Plot", self.plot)
		plot.status, plot.possession_date = "Possession Given", on
		plot.flags.ignore_permissions = True
		plot.save()
		self.add_comment("Info", _("Possession of plot {0} handed over on {1}").format(self.plot, frappe.format(on, "Date")))
		from realestate.documents import generate

		return generate("Possession Letter", self.name, remarks=_("Issued with possession"))

