"""Bulk society collection: list open society bills (block / month / search) and collect many at once.
Each collected bill becomes its own submitted RE Payment (payment_against = Society Bill), which posts a Payment Entry
against that bill's Sales Invoice — the same path as a single receipt, so the ledger and receipts are identical."""

import json

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

COLLECTORS = ("System Manager", "Society Manager", "Recovery Officer", "Accounts User", "Accounts Manager")


@frappe.whitelist(methods=["GET"])
def collection_sheet(block: str | None = None, month: str | None = None, search: str | None = None, status: str | None = None) -> dict:
	frappe.only_for(COLLECTORS)
	cond, args = ["b.outstanding_amount > 0.5"], {}
	if block:
		cond.append("p.block = %(block)s")
		args["block"] = block
	if month:
		cond.append("b.billing_month = %(month)s")
		args["month"] = str(getdate(month).replace(day=1))
	if status:
		cond.append("b.status = %(status)s")
		args["status"] = status
	if search:
		cond.append("(b.plot like %(q)s or b.customer like %(q)s or c.customer_name like %(q)s)")
		args["q"] = f"%{search}%"
	rows = frappe.db.sql(f"""select b.name, b.plot, p.block, b.customer, c.customer_name, c.mobile_no, b.bill_month_label, b.billing_month,
		b.due_date, b.status, b.total_amount, b.paid_amount, b.outstanding_amount
		from `tabRE Society Bill` b join `tabRE Plot` p on p.name = b.plot left join `tabCustomer` c on c.name = b.customer
		where {' and '.join(cond)} order by p.block, b.plot, b.billing_month limit 1000""", args, as_dict=True)
	months = frappe.db.sql("select distinct billing_month, bill_month_label from `tabRE Society Bill` order by billing_month desc limit 12", as_dict=True)
	return {"rows": rows, "months": months, "modes": frappe.get_all("Mode of Payment", {"enabled": 1}, pluck="name"),
			"total": sum(flt(r.outstanding_amount) for r in rows)}


@frappe.whitelist()
def bulk_collect(rows: str, mode_of_payment: str, posting_date: str | None = None, reference_no: str | None = None, send_receipt: int = 0) -> dict:
	"""rows = [{"bill": name, "amount": n}] — one submitted receipt per bill; a failure is reported, the rest go through."""
	frappe.only_for(COLLECTORS)
	items = json.loads(rows) if isinstance(rows, str) else rows
	done, failed = [], []
	for it in items:
		bill = frappe.db.get_value("RE Society Bill", it["bill"], ["name", "customer", "plot", "outstanding_amount"], as_dict=True)
		amount = flt(it.get("amount")) or flt(bill.outstanding_amount if bill else 0)
		if not bill or amount <= 0 or amount > flt(bill.outstanding_amount) + 0.5:
			failed.append({"bill": it["bill"], "error": _("Amount must be between 1 and the outstanding {0}").format(flt(bill.outstanding_amount) if bill else 0)})
			continue
		frappe.db.savepoint("bulk_collect")
		try:
			pay = frappe.get_doc({"doctype": "RE Payment", "payment_against": "Society Bill", "society_bill": bill.name, "customer": bill.customer,
								  "plot": bill.plot, "posting_date": posting_date or nowdate(), "mode_of_payment": mode_of_payment, "amount": amount,
								  "reference_no": reference_no, "received_by": frappe.session.user, "send_receipt": int(send_receipt),
								  "remarks": _("Bulk society collection")})
			pay.insert()
			pay.submit()
			done.append({"bill": bill.name, "receipt": pay.name, "amount": amount, "plot": bill.plot})
		except Exception as e:  # noqa: BLE001 — report and continue with the next bill
			frappe.db.rollback(save_point="bulk_collect")
			failed.append({"bill": bill.name, "error": str(e)[:200]})
	return {"done": done, "failed": failed, "total": sum(d["amount"] for d in done)}
