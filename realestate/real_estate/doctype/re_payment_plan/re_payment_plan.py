import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate, today

from realestate.calc import Plan, plan_schedule

PERIOD_MONTHS = {"Monthly": 1, "Quarterly": 3, "Half-Yearly": 6}
BALLOON_MONTHS = {"Quarterly": 3, "Half-Yearly": 6}


class REPaymentPlan(Document):
	def validate(self):
		fixed = sum(flt(self.get(f)) for f in ("booking_percent", "down_payment_percent", "balloon_percent", "development_percent", "possession_percent"))
		if fixed > 100:
			frappe.throw(_("Booking, down payment, balloons, development charges and possession together cannot exceed 100% (now {0}%)").format(fixed))
		if not self.installments and abs(fixed - 100) > 0.01:
			frappe.throw(_("A plan without installments must be fully covered by its fixed parts (100%)"))
		if flt(self.balloon_percent) and not self.balloon_frequency:
			frappe.throw(_("Choose a balloon frequency"))

	def to_plan(self) -> Plan:
		return Plan(
			installments=cint(self.installments), period_months=PERIOD_MONTHS.get(self.frequency, 1),
			booking_pct=flt(self.booking_percent), down_pct=flt(self.down_payment_percent), down_days=cint(self.down_payment_days),
			balloon_pct=flt(self.balloon_percent), balloon_months=BALLOON_MONTHS.get(self.balloon_frequency or "", 0),
			development_pct=flt(self.development_percent), development_month=cint(self.development_due_month),
			possession_pct=flt(self.possession_percent),
		)


@frappe.whitelist()
def preview(plan: str | dict, price: float = 10_000_000, booking_date: str | None = None) -> dict:
	"""Schedule a sample (or real) price on this plan — used by the plan form preview and the booking wizard."""
	doc = frappe.get_doc(frappe.parse_json(plan)) if not isinstance(plan, str) or plan.startswith("{") else frappe.get_doc("RE Payment Plan", plan)
	start = getdate(booking_date or today())
	rows = plan_schedule(flt(price), start, None, doc.to_plan())
	return {"rows": [{"label": l, "due_date": str(d), "amount": a} for l, d, a in rows], "total": sum(a for _l, _d, a in rows), "count": len(rows)}
