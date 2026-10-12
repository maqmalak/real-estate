"""Bulk WhatsApp campaign to a filtered list (e.g. all overdue in B Block), rate limited, opt-outs skipped."""

import time

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, now_datetime

from realestate.whatsapp.inbox import is_opted_out

AUDIENCE_DOCTYPE = {
	"Bookings - Overdue": "RE Booking", "Bookings - Due": "RE Booking", "Bookings - All Active": "RE Booking",
	"Society Bills - Unpaid": "RE Society Bill", "Leads": "CRM Lead", "Deals": "CRM Deal",
}


class REBroadcast(Document):
	def validate(self):
		ref = frappe.db.get_value("WhatsApp Template", self.template, ["reference_doctype", "status"], as_dict=True)
		if ref.status != "Approved":
			frappe.throw(_("Template {0} is not approved").format(self.template))
		if ref.reference_doctype and ref.reference_doctype != AUDIENCE_DOCTYPE[self.audience]:
			frappe.throw(_("Template {0} is filled from {1}; pick a {1} audience").format(self.template, ref.reference_doctype))
		self.set_counts()

	def set_counts(self):
		self.total_recipients = len(self.recipients)
		for status, field in (("Sent", "sent_count"), ("Failed", "failed_count"), ("Skipped", "skipped_count")):
			self.set(field, sum(1 for r in self.recipients if r.status == status))

	@frappe.whitelist()
	def fetch_recipients(self):
		self.check_permission("write")
		self.recipients = []
		for row in audience_rows(self.audience, self.block, self.lead_status):
			self.append("recipients", row)
		self.save()
		return len(self.recipients)

	@frappe.whitelist()
	def start(self):
		self.check_permission("write")
		if self.status in ("Queued", "Running"):
			frappe.throw(_("Already running"))
		if not self.recipients:
			self.fetch_recipients()
		self.db_set("status", "Queued")
		frappe.enqueue(run, queue="long", timeout=6 * 3600, broadcast=self.name, enqueue_after_commit=True)


def audience_rows(audience, block=None, lead_status=None):
	rows = []
	if audience.startswith("Bookings"):
		status = {"Bookings - Overdue": ["Overdue"], "Bookings - Due": ["Due"]}.get(audience, ["Due", "Overdue"])
		filters = {"docstatus": 1, "status": ("in", status)}
		if block:
			filters["block"] = block
		for b in frappe.get_all("RE Booking", filters, ["name", "customer", "customer_name", "mobile_no"], order_by="plot"):
			rows.append({"party_type": "Customer", "party": b.customer, "party_name": b.customer_name,
						 "phone": b.mobile_no or frappe.db.get_value("Customer", b.customer, "mobile_no"),
						 "reference_doctype": "RE Booking", "reference_name": b.name})
	elif audience == "Society Bills - Unpaid":
		filters = {"status": ("in", ["Unpaid", "Due", "Overdue", "Partly Paid"])}
		if block:
			filters["block"] = block
		for b in frappe.get_all("RE Society Bill", filters, ["name", "customer", "customer_name"], order_by="billing_month desc"):
			rows.append({"party_type": "Customer", "party": b.customer, "party_name": b.customer_name,
						 "phone": frappe.db.get_value("Customer", b.customer, "mobile_no"),
						 "reference_doctype": "RE Society Bill", "reference_name": b.name})
	else:
		doctype = AUDIENCE_DOCTYPE[audience]
		filters = {"status": lead_status} if lead_status and doctype == "CRM Lead" else {}
		if doctype == "CRM Lead":
			filters["converted"] = 0
		for d in frappe.get_all(doctype, filters, ["name", "lead_name", "mobile_no"]):
			rows.append({"party_type": doctype, "party": d.name, "party_name": d.lead_name, "phone": d.mobile_no,
						 "reference_doctype": doctype, "reference_name": d.name})
	return rows


def run(broadcast):
	from realestate.whatsapp.channel import send_template

	doc = frappe.get_doc("RE Broadcast", broadcast)
	rate = cint(doc.rate_per_minute) or cint(frappe.db.get_single_value("RE Settings", "broadcast_rate_per_minute")) or 60
	pause = 60.0 / rate
	doc.db_set({"status": "Running", "started_on": now_datetime()})
	frappe.db.commit()
	for row in doc.recipients:
		if row.status != "Pending":
			continue
		if not row.phone:
			row.status, row.error = "Skipped", _("No mobile number")
		elif is_opted_out(row.phone, row.party_type, row.party):
			row.status, row.error = "Skipped", _("Opted out")
		else:
			try:
				row.whatsapp_message = send_template(doc.template, row.phone, row.reference_doctype, row.reference_name)
				failed = frappe.db.get_value("WhatsApp Message", row.whatsapp_message, "status") == "Failed"
				row.status = "Failed" if failed else "Sent"
			except Exception as e:
				row.status, row.error = "Failed", str(e)[:500]
			time.sleep(pause)
		row.db_update()
		doc.set_counts()
		doc.db_update()
		frappe.db.commit()
		frappe.publish_realtime("re_broadcast_progress", {"name": doc.name, "sent": doc.sent_count, "failed": doc.failed_count,
														  "skipped": doc.skipped_count, "total": doc.total_recipients},
								doctype="RE Broadcast", docname=doc.name)
	doc.db_set({"status": "Completed", "completed_on": now_datetime()})
	frappe.db.commit()
