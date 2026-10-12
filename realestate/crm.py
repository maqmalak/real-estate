"""Pipeline glue: Lead -> Deal (Opportunity -> Site Visit -> Negotiation) -> Booking (won) -> ERPNext Customer.

Frappe CRM's own ERPNext integration creates the Customer when a deal reaches the "Booking"
status; this hook fills in what it does not copy (agent, mobile, interest, opt-out).
"""

import frappe


def on_deal_update(doc, method=None):
	customer = frappe.db.get_value("CRM Deal", doc.name, "erpnext_customer") if frappe.get_meta("CRM Deal").has_field("erpnext_customer") else None
	if not customer:
		return
	updates = {}
	current = frappe.db.get_value("Customer", customer, ["account_manager", "mobile_no", "re_whatsapp_opt_out"], as_dict=True)
	if doc.deal_owner and not current.account_manager:
		updates["account_manager"] = doc.deal_owner
	if doc.mobile_no and not current.mobile_no:
		updates["mobile_no"] = doc.mobile_no
	if doc.get("re_whatsapp_opt_out") and not current.re_whatsapp_opt_out:
		updates["re_whatsapp_opt_out"] = 1
	if updates:
		frappe.db.set_value("Customer", customer, updates)
