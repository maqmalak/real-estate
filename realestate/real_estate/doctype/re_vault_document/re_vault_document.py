import frappe
from frappe.model.document import Document
from frappe.utils import add_days, cint, getdate, today


class REVaultDocument(Document):
	def validate(self):
		self.status = status_of(self.expiry_date, self.renewal_alert_days)


def status_of(expiry, alert_days):
	if not expiry:
		return "No Expiry"
	if getdate(expiry) < getdate(today()):
		return "Expired"
	if getdate(expiry) <= getdate(add_days(today(), cint(alert_days) or 30)):
		return "Expiring Soon"
	return "Valid"
