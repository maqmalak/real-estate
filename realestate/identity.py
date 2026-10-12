"""Customer identity for Pakistani bookings: CNIC (validated and formatted 12345-1234567-1), father / husband name,
nominee (name, relation, CNIC, mobile), and mobile numbers normalised to +92 3XX XXXXXXX.

The CNIC and nominee live on the ERPNext Customer, so every booking, transfer and letter reads the same record;
RE Booking shows them read-only (fetched) and a booking cannot be submitted without the buyer's CNIC.
"""

import re

import frappe
from frappe import _

CNIC_RE = re.compile(r"^\d{5}-\d{7}-\d$")
RELATIONS = "\nSpouse\nSon\nDaughter\nFather\nMother\nBrother\nSister\nOther"


def format_cnic(value: str | None) -> str | None:
	"""'3520212345671' / '35202-1234567-1' -> '35202-1234567-1'; raises on anything else."""
	if not value:
		return None
	digits = re.sub(r"\D", "", value)
	if len(digits) != 13:
		frappe.throw(_("CNIC must have 13 digits, like 35202-1234567-1 (got {0})").format(value), title=_("Invalid CNIC"))
	return f"{digits[:5]}-{digits[5:12]}-{digits[12]}"


def normalise_mobile(value: str | None) -> str | None:
	"""Pakistani mobiles -> +923XXXXXXXXX. 0300-1234567, 92 300 1234567 and +92-300-1234567 are all accepted.
	Foreign numbers (overseas buyers) must start with + and have 8–15 digits; they are kept as given."""
	if not value:
		return None
	v = value.strip()
	digits = re.sub(r"\D", "", v)
	if digits.startswith("0092"):
		digits = digits[2:]
	if digits.startswith("03") and len(digits) == 11:
		return "+92" + digits[1:]
	if digits.startswith("923") and len(digits) == 12:
		return "+" + digits
	if digits.startswith("3") and len(digits) == 10:
		return "+92" + digits
	if v.startswith("+") and not digits.startswith("92") and 8 <= len(digits) <= 15:
		return "+" + digits
	frappe.throw(_("Mobile number {0} is not valid. Use a Pakistani mobile like 0300-1234567 or an international number starting with +.").format(value),
				 title=_("Invalid mobile number"))


# ---------------------------------------------------------------- doc events
def validate_customer(doc, method=None):
	if doc.get("re_cnic"):
		doc.re_cnic = format_cnic(doc.re_cnic)
		dup = frappe.db.get_value("Customer", {"re_cnic": doc.re_cnic, "name": ("!=", doc.name)}, "name")
		if dup:
			frappe.throw(_("CNIC {0} already belongs to customer {1}").format(doc.re_cnic, dup), title=_("Duplicate CNIC"))
	if doc.get("re_nominee_cnic"):
		doc.re_nominee_cnic = format_cnic(doc.re_nominee_cnic)
		if doc.re_nominee_cnic == doc.get("re_cnic"):
			frappe.throw(_("The nominee cannot be the customer"))
	for field in ("mobile_no", "re_nominee_mobile"):
		if doc.get(field):
			doc.set(field, normalise_mobile(doc.get(field)))


def validate_lead(doc, method=None):
	if doc.get("mobile_no"):
		doc.mobile_no = normalise_mobile(doc.mobile_no)
	if doc.get("re_cnic"):
		doc.re_cnic = format_cnic(doc.re_cnic)


def require_cnic(booking):
	"""Called from RE Booking.before_submit."""
	if not frappe.db.get_value("Customer", booking.customer, "re_cnic"):
		frappe.throw(_("Add the CNIC of {0} on the customer record before submitting the booking.").format(booking.customer_name or booking.customer),
					 title=_("CNIC required"))


def custom_fields():
	return {
		"Customer": [
			{"fieldname": "re_identity_section", "fieldtype": "Section Break", "label": "Identity & Nominee", "insert_after": "re_portal_user", "collapsible": 0},
			{"fieldname": "re_cnic", "fieldtype": "Data", "label": "CNIC", "insert_after": "re_identity_section", "unique": 1, "in_standard_filter": 1,
			 "description": "13 digits, e.g. 35202-1234567-1", "search_index": 1},
			{"fieldname": "re_father_name", "fieldtype": "Data", "label": "Father / Husband Name", "insert_after": "re_cnic"},
			{"fieldname": "re_postal_address", "fieldtype": "Small Text", "label": "Postal Address", "insert_after": "re_father_name"},
			{"fieldname": "re_identity_cb", "fieldtype": "Column Break", "insert_after": "re_postal_address"},
			{"fieldname": "re_nominee_name", "fieldtype": "Data", "label": "Nominee Name", "insert_after": "re_identity_cb"},
			{"fieldname": "re_nominee_relation", "fieldtype": "Select", "label": "Nominee Relation", "options": RELATIONS, "insert_after": "re_nominee_name"},
			{"fieldname": "re_nominee_cnic", "fieldtype": "Data", "label": "Nominee CNIC", "insert_after": "re_nominee_relation"},
			{"fieldname": "re_nominee_mobile", "fieldtype": "Data", "options": "Phone", "label": "Nominee Mobile", "insert_after": "re_nominee_cnic"},
		],
		"CRM Lead": [
			{"fieldname": "re_cnic", "fieldtype": "Data", "label": "CNIC", "insert_after": "mobile_no", "description": "Optional at lead stage"},
		],
	}


# ---------------------------------------------------------------- demo data
FATHERS = ["Muhammad Aslam", "Abdul Rehman", "Ghulam Hussain", "Muhammad Akram", "Riaz Ahmed", "Khalid Mehmood", "Tariq Javed", "Nasir Ali",
		   "Zafar Iqbal", "Shahid Mahmood", "Arshad Ali", "Pervaiz Akhtar"]
NOMINEES = [("Sadia", "Spouse"), ("Ahmed", "Son"), ("Fatima", "Daughter"), ("Usman", "Brother"), ("Ayesha", "Sister"), ("Hamza", "Son"),
			("Maryam", "Spouse"), ("Bilal", "Brother")]
TOWNS = ["Johar Town", "Model Town", "Gulberg III", "DHA Phase 5", "Iqbal Town", "Township", "Wapda Town", "Valencia Town"]


def demo_identities():
	"""Give every demo customer a fictional CNIC (Lahore 35202 series), father name, address and nominee. Idempotent."""
	for i, c in enumerate(frappe.get_all("Customer", {"re_demo": 1}, ["name", "customer_name", "re_cnic", "email_id"], order_by="creation")):
		if not c.email_id:  # example.com is reserved — demo mail can never reach a real person
			frappe.db.set_value("Customer", c.name, "email_id", f"{c.customer_name.lower().replace(' ', '.')}.{i}@example.com", update_modified=False)
		if c.re_cnic:
			continue
		surname = c.customer_name.split()[-1]
		nominee, relation = NOMINEES[i % len(NOMINEES)]
		frappe.db.set_value("Customer", c.name, {
			"re_cnic": f"35202-{3100000 + i * 7919:07d}-{(i * 3) % 10}",
			"re_father_name": f"{FATHERS[i % len(FATHERS)]} {surname}" if relation != "Spouse" else FATHERS[i % len(FATHERS)],
			"re_postal_address": f"House {10 + i * 3}, Street {1 + i % 9}, {TOWNS[i % len(TOWNS)]}, Lahore",
			"re_nominee_name": f"{nominee} {surname}", "re_nominee_relation": relation,
			"re_nominee_cnic": f"35202-{5200000 + i * 6131:07d}-{(i * 7) % 10}",
			"re_nominee_mobile": f"+92301666{i:04d}",
		}, update_modified=False)
