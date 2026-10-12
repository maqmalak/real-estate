import frappe
from frappe.model.document import Document
from frappe.utils import get_datetime

from realestate.whatsapp.inbox import party_agent, party_name


class RESiteVisit(Document):
	def validate(self):
		self.party_name = party_name(self.party_type, self.party)
		self.mobile_no = self.mobile_no or frappe.db.get_value(self.party_type, self.party, "mobile_no")
		self.agent = self.agent or party_agent(self.party_type, self.party)
		self.visit_label = get_datetime(self.visit_on).strftime("%a %d %b %Y, %I:%M %p")

	def after_insert(self):
		if self.send_invitation and self.status == "Scheduled" and not self.flags.silent:
			from realestate.whatsapp.channel import notify

			frappe.enqueue(notify, enqueue_after_commit=True, reminder_type="Site Visit Invitation",
						   reference_doctype=self.doctype, reference_name=self.name)

	def on_update(self):
		if self.status == "Completed" and self.has_value_changed("status") and self.party_type == "CRM Deal":
			if frappe.db.get_value("CRM Deal", self.party, "status") == "Opportunity":
				deal = frappe.get_doc("CRM Deal", self.party)
				deal.status = "Site Visit"
				deal.save(ignore_permissions=True)
