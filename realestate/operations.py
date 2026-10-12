"""Sales operations hub (React /re/operations): approvals, transfers, cancellations, merges, surcharges, commissions,
recovery. Everything posts through the controllers, which post to standard ERPNext documents."""

import json

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils import flt, get_first_day, nowdate

from realestate.calc import cancellation, merge

WORKFLOW_DOCTYPES = ("RE Plot Transfer", "RE Booking Cancellation", "RE Plot Merge", "RE Surcharge Waiver", "RE Re-allotment")
STAFF = ("System Manager", "Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Accounts Manager", "Recovery Officer", "Society Manager")


def _guard():
	if not set(frappe.get_roles()) & set(STAFF):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _sum(q, *a):
	return flt(frappe.db.sql(q, a)[0][0])


@frappe.whitelist(methods=["GET"])
def overview() -> dict:
	_guard()
	month = get_first_day(nowdate())
	pending = {dt: frappe.db.count(dt, {"workflow_state": "Pending Approval"}) for dt in WORKFLOW_DOCTYPES}
	pending["Discounts"] = len(_discount_requests())
	return {
		"pending": pending,
		"transfers_month": frappe.db.count("RE Plot Transfer", {"docstatus": 1, "transfer_date": (">=", month)}),
		"transfer_fees": _sum("select sum(transfer_fee) from `tabRE Plot Transfer` where docstatus=1"),
		"cancellations": frappe.db.count("RE Booking Cancellation", {"docstatus": 1}),
		"refunds": _sum("select sum(refund_amount) from `tabRE Booking Cancellation` where docstatus=1"),
		"deductions": _sum("select sum(deduction_amount) from `tabRE Booking Cancellation` where docstatus=1"),
		"merges": frappe.db.count("RE Plot Merge", {"docstatus": 1}),
		"surcharge": {k: _sum(f"select sum({k}) from `tabRE Surcharge`") for k in ("amount", "paid_amount", "waived_amount", "outstanding_amount")},
		"commission": {s: _sum("select sum(amount) from `tabRE Commission` where status=%s", s) for s in ("Accrued", "Payable", "Paid")},
		"dunnings": frappe.db.count("Dunning", {"docstatus": 1, "status": "Unresolved"}),
		"dunning_outstanding": _sum("select sum(total_outstanding) from `tabDunning` where docstatus=1 and status='Unresolved'"),
	}


def _discount_requests():
	limit = flt(frappe.db.get_single_value("RE Settings", "max_discount_percent"))
	return frappe.db.sql("""select name, customer_name, plot, total_price, discount, agent, modified from `tabRE Booking`
		where docstatus=0 and discount > 0 and (discount_approved_by is null or discount_approved_by='') and discount * 100 / total_price > %s""",
						 limit, as_dict=True)


@frappe.whitelist(methods=["GET"])
def approvals() -> list[dict]:
	"""Everything waiting for a manager, newest first, with the actions this user may take."""
	_guard()
	out = []
	fields = {
		"RE Plot Transfer": ["plot", "from_customer_name", "to_customer_name", "transfer_fee", "outstanding_at_transfer", "ndc_clear"],
		"RE Booking Cancellation": ["plot", "customer_name", "reason", "paid_amount", "deduction_amount", "refund_amount"],
		"RE Plot Merge": ["new_plot_no", "total_area_marla", "total_list_price", "customer"],
		"RE Surcharge Waiver": ["customer_name", "booking", "amount", "surcharge_outstanding", "reason"],
		"RE Re-allotment": ["plot", "new_customer_name", "net_price", "reallotment_fee", "previous_booking"],
	}
	for dt, extra in fields.items():
		for d in frappe.get_list(dt, {"workflow_state": "Pending Approval"}, ["name", "owner", "modified", "workflow_state", *extra], order_by="modified desc"):
			doc = frappe.get_doc(dt, d.name)
			d.update({"doctype": dt, "actions": [t.action for t in get_transitions(doc)]})
			out.append(d)
	is_manager = bool({"Sales Manager", "System Manager"} & set(frappe.get_roles()))
	for b in _discount_requests():
		b.update({"doctype": "RE Booking", "workflow_state": "Discount Approval", "actions": ["Approve discount"] if is_manager else [],
				  "discount_pct": round(flt(b.discount) * 100 / flt(b.total_price), 2)})
		out.append(b)
	return sorted(out, key=lambda d: str(d.get("modified")), reverse=True)


@frappe.whitelist()
def act(doctype: str, name: str, action: str) -> dict:
	_guard()
	if doctype == "RE Booking" and action == "Approve discount":
		frappe.get_doc("RE Booking", name).approve_discount()
		return {"state": "Discount approved"}
	if doctype not in WORKFLOW_DOCTYPES:
		frappe.throw(_("Not a workflow document"))
	doc = apply_workflow(frappe.get_doc(doctype, name), action)
	return {"state": doc.workflow_state, "docstatus": doc.docstatus}


# ---------------------------------------------------------------- previews for the wizards
@frappe.whitelist(methods=["GET"])
def transfer_preview(booking: str) -> dict:
	_guard()
	b = frappe.get_doc("RE Booking", booking)
	b.check_permission("read")
	society = _sum("select sum(outstanding_amount) from `tabRE Society Bill` where plot=%s", b.plot)
	overdue = flt(b.overdue_amount) + flt(b.surcharge_due)
	return {"booking": b.name, "plot": b.plot, "plot_size": b.plot_size, "customer": b.customer, "customer_name": b.customer_name,
			"net_price": b.net_price, "paid": b.paid_amount, "outstanding": b.outstanding_amount, "overdue": overdue, "society_dues": society,
			"clear": overdue < 0.5 and society < 0.5, "fee": flt(frappe.db.get_single_value("RE Settings", "transfer_fee")), "status": b.status}


@frappe.whitelist(methods=["GET"])
def cancellation_preview(booking: str, deduction_percent: str | float | None = None) -> dict:
	_guard()
	b = frappe.get_doc("RE Booking", booking)
	b.check_permission("read")
	pct = flt(deduction_percent) if deduction_percent not in (None, "") else flt(frappe.db.get_single_value("RE Settings", "cancellation_deduction_percent"))
	total, outstanding = frappe.db.get_value("Sales Invoice", b.sales_invoice, ["grand_total", "outstanding_amount"]) if b.sales_invoice else (b.net_price, b.outstanding_amount)
	r = cancellation(flt(total), flt(total) - flt(outstanding), pct)
	return {"booking": b.name, "plot": b.plot, "customer_name": b.customer_name, "net_price": flt(total), "paid": flt(total) - flt(outstanding),
			"deduction_percent": pct, **r, "status": b.status, "commissions": frappe.db.count("RE Commission", {"booking": b.name, "status": ("in", ["Accrued", "Payable"])})}


@frappe.whitelist(methods=["GET"])
def merge_preview(plots: str) -> dict:
	_guard()
	names = json.loads(plots) if isinstance(plots, str) else plots
	rows = frappe.get_all("RE Plot", {"name": ("in", names)}, ["name", "block", "plot_size", "area_marla", "list_price", "status", "customer", "customer_name"])
	statuses, owners, blocks = {r.status for r in rows}, {r.customer for r in rows}, {r.block for r in rows}
	ok = len(rows) >= 2 and len(blocks) == 1 and (statuses == {"Available"} or (statuses <= {"Sold", "Possession Given"} and len(owners) == 1))
	totals = merge([{"area_marla": r.area_marla, "list_price": r.list_price} for r in rows]) if rows else {"area_marla": 0, "list_price": 0}
	sizes = frappe.get_all("RE Plot Size", ["name", "area_marla"], order_by="area_marla")
	size = min(sizes, key=lambda s: abs(flt(s.area_marla) - totals["area_marla"])).name if sizes else None
	nums = sorted(r.name for r in rows)
	return {"plots": rows, "ok": ok, **totals, "suggested_no": f"{nums[0]}/{nums[-1].split('-')[-1]}" if nums else "", "suggested_size": size,
			"reason": None if ok else _("Pick 2+ plots in one block that are all available, or all fully paid by the same owner")}


@frappe.whitelist()
def create(doctype: str, values: str, submit_for_approval: int = 1) -> dict:
	"""Create a transfer / cancellation / merge / waiver from a wizard and send it for approval."""
	_guard()
	if doctype not in WORKFLOW_DOCTYPES:
		frappe.throw(_("Not allowed"))
	data = json.loads(values) if isinstance(values, str) else values
	doc = frappe.get_doc({"doctype": doctype, **data})
	doc.insert()
	if int(submit_for_approval):
		doc = apply_workflow(doc, "Submit for Approval")
	return {"name": doc.name, "state": doc.workflow_state}


# ---------------------------------------------------------------- commissions & recovery
@frappe.whitelist(methods=["GET"])
def commissions() -> dict:
	_guard()
	rows = frappe.get_list("RE Commission", fields=["name", "booking", "plot", "beneficiary_type", "beneficiary", "agent", "sales_partner", "rate",
													 "amount", "status", "paid_on"], order_by="modified desc", limit=500)
	summary = {}
	for r in rows:
		s = summary.setdefault(r.beneficiary or "—", {"beneficiary": r.beneficiary, "type": r.beneficiary_type, "Accrued": 0, "Payable": 0, "Paid": 0, "Cancelled": 0})
		s[r.status] = s.get(r.status, 0) + flt(r.amount)
	return {"rows": rows, "summary": sorted(summary.values(), key=lambda s: -s["Payable"])}


@frappe.whitelist()
def pay_commissions(names: str, mode_of_payment: str = "Bank Transfer", posting_date: str | None = None, reference_no: str | None = None,
					reference_date: str | None = None) -> dict:
	"""Pay several Payable commissions — one Payment Entry each; returns the vouchers made."""
	vouchers = []
	for name in json.loads(names) if isinstance(names, str) else names:
		vouchers.append(frappe.get_doc("RE Commission", name).pay(mode_of_payment, posting_date, reference_no, reference_date))
	return {"paid": len(vouchers), "vouchers": vouchers}


@frappe.whitelist(methods=["GET"])
def recovery() -> dict:
	_guard()
	dunnings = frappe.get_list("Dunning", {"docstatus": 1, "status": "Unresolved"}, ["name", "customer", "customer_name", "posting_date", "total_outstanding",
																					   "dunning_amount", "grand_total"], order_by="total_outstanding desc", limit=100)
	surcharges = frappe.get_list("RE Surcharge", {"outstanding_amount": (">", 0)}, ["name", "booking", "customer_name", "month_label", "amount", "outstanding_amount", "status"],
								 order_by="month desc", limit=100)
	return {"dunnings": dunnings, "surcharges": surcharges}


@frappe.whitelist()
def run_recovery() -> dict:
	"""Raise this month's surcharges and ERPNext Dunning notices now (normally the daily job)."""
	frappe.only_for(("System Manager", "Sales Manager", "Recovery Officer", "Accounts User", "Accounts Manager"))
	from realestate.tasks import generate_surcharges, recovery_dunnings

	before = frappe.db.count("Dunning", {"docstatus": 1})
	made = generate_surcharges()
	recovery_dunnings()
	return {"surcharges": made, "dunnings": frappe.db.count("Dunning", {"docstatus": 1}) - before}


@frappe.whitelist(methods=["GET"])
def lists() -> dict:
	"""Recent transfers, cancellations and merges for the hub's pipelines."""
	_guard()
	return {
		"transfers": frappe.get_list("RE Plot Transfer", fields=["name", "booking", "plot", "from_customer_name", "to_customer_name", "transfer_date",
																  "transfer_fee", "workflow_state", "ndc_clear", "outstanding_at_transfer"], order_by="modified desc", limit=50),
		"cancellations": frappe.get_list("RE Booking Cancellation", fields=["name", "booking", "plot", "customer_name", "cancellation_date", "reason",
																			 "paid_amount", "deduction_amount", "refund_amount", "workflow_state"], order_by="modified desc", limit=50),
		"merges": frappe.get_list("RE Plot Merge", fields=["name", "new_plot_no", "new_plot", "total_area_marla", "total_list_price", "merge_date",
															"workflow_state", "customer"], order_by="modified desc", limit=50),
		"reallotments": frappe.get_list("RE Re-allotment", fields=["name", "plot", "new_customer_name", "previous_booking", "net_price",
																   "reallotment_fee", "reallotment_date", "workflow_state", "new_booking"],
										 order_by="modified desc", limit=50),
		"waivers": frappe.get_list("RE Surcharge Waiver", fields=["name", "surcharge", "customer_name", "amount", "reason", "workflow_state"],
								   order_by="modified desc", limit=50),
	}


@frappe.whitelist(methods=["GET"])
def reallot_candidates() -> dict:
	"""Plots released by an approved cancellation and still available, with what the wizard needs to pre-fill."""
	_guard()
	rows = frappe.db.sql("""select c.name cancellation, c.plot, c.customer_name previous_customer_name, c.cancellation_date, p.list_price, p.plot_size, p.block
		from `tabRE Booking Cancellation` c join `tabRE Plot` p on p.name = c.plot
		where c.docstatus = 1 and p.status in ('Available', 'Reserved')
		and not exists (select 1 from `tabRE Re-allotment` r where r.cancellation = c.name and r.docstatus < 2)
		order by c.cancellation_date desc""", as_dict=True)
	return {"plots": rows, "fee": flt(frappe.db.get_single_value("RE Settings", "reallotment_fee")),
			"plans": frappe.get_all("RE Payment Plan", pluck="name", order_by="name")}
