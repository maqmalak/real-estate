"""Owner portal (React /portal): a plot owner sees only their own plots, schedule, receipts, bills and documents,
and can raise complaints. The portal user is linked to the ERPNext Customer through `Customer.re_portal_user`.
Every call is scoped to that customer; nothing else is reachable from here."""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from realestate.geo import load_geometry
from realestate.session import as_system

PORTAL_DOCS = {"Payment Schedule", "Customer Account Statement", "Allotment Letter", "Payment Receipt", "Maintenance Bill",
			   "No Demand Certificate", "Site Plan"}


STAFF = {"System Manager", "Sales Manager", "Sales User", "Sales Agent", "Accounts User", "Recovery Officer", "Society Manager", "Projects User"}


def _customer(required=True, as_customer=None):
	"""The owner this call is for: the customer linked to this login, or — for staff previewing the portal — `as_customer`
	(read-only; only a customer the staff member may read)."""
	user = frappe.session.user
	if as_customer:
		if not (set(frappe.get_roles()) & STAFF) or not frappe.has_permission("Customer", "read", as_customer):
			frappe.throw(_("Not permitted to preview this owner's portal"), frappe.PermissionError)
		frappe.flags.re_portal_preview = True
		return as_customer
	customer = frappe.db.get_value("Customer", {"re_portal_user": user}, "name") if user != "Guest" else None
	if not customer and required:
		frappe.throw(_("This login is not linked to a plot owner"), frappe.PermissionError)
	return customer


@frappe.whitelist(methods=["GET"])
def whoami(as_customer: str | None = None) -> dict:
	customer = _customer(required=False, as_customer=as_customer)
	staff = bool(set(frappe.get_roles()) & STAFF)
	return {"customer": customer, "is_staff": staff, "preview": bool(as_customer),
			"customer_name": frappe.db.get_value("Customer", customer, "customer_name") if customer else None}


@frappe.whitelist(methods=["GET"])
def home(as_customer: str | None = None) -> dict:
	"""Everything the owner home screen shows, in one call."""
	customer = _customer(as_customer=as_customer)
	c = frappe.db.get_value("Customer", customer, ["customer_name", "mobile_no", "email_id", "account_manager"], as_dict=True)
	bookings = frappe.get_all("RE Booking", {"customer": customer, "docstatus": 1}, ["name", "plot", "plot_size", "block", "status", "net_price", "paid_amount",
																					  "outstanding_amount", "overdue_amount", "next_due_date", "next_due_amount",
																					  "surcharge_due", "payment_plan", "booking_date"], order_by="booking_date")
	plots = []
	for b in bookings:
		p = frappe.db.get_value("RE Plot", b.plot, ["geojson", "centre_lat", "centre_lng", "street", "status", "is_corner", "is_park_facing", "area_marla"], as_dict=True)
		photos = [f.file_url for f in frappe.get_all("File", {"attached_to_doctype": "RE Plot", "attached_to_name": b.plot}, ["file_url", "file_name"])
				  if (f.file_name or "").lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp", "gif")]
		plots.append({**b, "area_marla": p.area_marla, "photos": photos, "geojson": load_geometry(p.geojson), "centre_lat": p.centre_lat, "centre_lng": p.centre_lng, "street": p.street,
					  "plot_status": p.status, "is_corner": p.is_corner, "is_park_facing": p.is_park_facing})
	bills = frappe.get_all("RE Society Bill", {"customer": customer}, ["name", "plot", "bill_month_label", "total_amount", "outstanding_amount", "status", "due_date"],
						   order_by="billing_month desc", limit=12)
	agent = frappe.db.get_value("User", c.account_manager, ["full_name", "mobile_no"], as_dict=True) if c.account_manager else None
	project = frappe.db.get_single_value("RE Settings", "default_project")
	boundary = load_geometry(frappe.db.get_value("RE Project", project, "boundary_geojson")) if project else None
	return {
		"customer": {**c, "name": customer}, "plots": plots, "bills": bills, "agent": agent, "boundary": boundary,
		"totals": {"price": sum(flt(b.net_price) for b in bookings), "paid": sum(flt(b.paid_amount) for b in bookings),
				   "outstanding": sum(flt(b.outstanding_amount) for b in bookings), "overdue": sum(flt(b.overdue_amount) for b in bookings),
				   "society_due": sum(flt(b.outstanding_amount) for b in bills), "surcharge_due": sum(flt(b.surcharge_due) for b in bookings)},
		"complaints": frappe.get_all("Task", {"re_customer": customer}, ["name", "subject", "status", "priority", "re_plot", "creation", "completed_on"],
									 order_by="creation desc", limit=20),
		"receipts": frappe.get_all("RE Payment", {"customer": customer, "docstatus": 1}, ["name", "posting_date", "amount", "payment_against", "plot", "mode_of_payment"],
								   order_by="posting_date desc", limit=50),
		"documents": frappe.get_all("RE Generated Document", {"customer": customer}, ["name", "document_type", "version", "issued_on", "plot"],
									order_by="issued_on desc", limit=30),
	}


@frappe.whitelist(methods=["GET"])
def schedule(booking: str, as_customer: str | None = None) -> list[dict]:
	customer = _customer(as_customer=as_customer)
	b = frappe.get_doc("RE Booking", booking)
	if b.customer != customer:
		frappe.throw(_("Not your booking"), frappe.PermissionError)
	return [{"label": r.label, "due_date": r.due_date, "amount": r.amount, "paid_amount": r.paid_amount, "status": r.status} for r in b.installments]


def _owned(doctype, name, customer):
	if doctype == "Customer":
		return name == customer
	field = "customer"
	return frappe.db.get_value(doctype, name, field) == customer


@frappe.whitelist(methods=["GET", "POST"])
def document(document_type: str, reference_name: str, as_customer: str | None = None):
	"""Generate (as the system, after checking ownership) and stream an owner's document PDF."""
	from realestate.documents import DOCUMENTS, generate

	customer = _customer(as_customer=as_customer)
	if document_type not in PORTAL_DOCS:
		frappe.throw(_("Not available in the portal"))
	doctype = DOCUMENTS[document_type][0]
	if not _owned(doctype, reference_name, customer):
		frappe.throw(_("Not your document"), frappe.PermissionError)
	user = frappe.session.user
	with as_system():
		r = generate(document_type, reference_name, remarks=f"Portal preview by staff ({user})" if as_customer else f"Downloaded by owner ({user})")
		content = frappe.get_doc("File", {"file_url": r["file_url"]}).get_content()
	frappe.local.response.filename = f"{document_type} - {reference_name}.pdf"
	frappe.local.response.filecontent = content
	frappe.local.response.type = "download"


@frappe.whitelist()
def complaint(subject: str, maintenance_type: str, plot: str | None = None, description: str | None = None, priority: str = "Normal") -> str:
	"""An owner raises a maintenance complaint; it lands as an assigned ERPNext Task."""
	from realestate.maintenance import create_task

	customer = _customer()
	if plot and frappe.db.get_value("RE Plot", plot, "customer") != customer:
		frappe.throw(_("Not your plot"), frappe.PermissionError)
	plot = plot or frappe.db.get_value("RE Plot", {"customer": customer}, "name")
	if maintenance_type not in frappe.get_all("Task Type", pluck="name"):
		maintenance_type = "Other"
	settings = frappe.get_cached_doc("RE Settings")
	project = frappe.db.get_value("RE Plot", plot, "project") if plot else settings.default_project
	user = frappe.session.user
	with as_system():
		name = create_task(subject[:140], maintenance_type, project, settings.maintenance_assignee, f"{frappe.utils.add_days(nowdate(), 2)} 17:00:00",
						   priority if priority in ("Critical", "High", "Normal", "Low", "Medium", "Urgent") else "Normal",
						   f"{frappe.utils.escape_html(description or '')}<p><i>Raised in the owner portal by {user}</i></p>", "Customer Complaint",
						   plot=plot, customer=customer)
	return name


@frappe.whitelist(methods=["GET"])
def complaint_types(as_customer: str | None = None) -> list[str]:
	_customer(as_customer=as_customer)
	return frappe.get_all("Task Type", pluck="name", order_by="name")


def custom_fields():
	return {"Customer": [{"fieldname": "re_portal_user", "fieldtype": "Link", "options": "User", "label": "Owner Portal Login",
						  "insert_after": "re_whatsapp_opt_out", "unique": 1, "description": "Website user who can see this customer's plots in the owner portal"}]}


@frappe.whitelist()
def invite(customer: str, email: str | None = None) -> str:
	"""Create (or link) a website user for the customer so they can use the owner portal."""
	frappe.only_for(("System Manager", "Sales Manager"))
	c = frappe.get_doc("Customer", customer)
	email = email or c.email_id
	if not email:
		frappe.throw(_("Customer has no email address"))
	if not frappe.db.exists("User", email):
		u = frappe.get_doc({"doctype": "User", "email": email, "first_name": c.customer_name, "user_type": "Website User", "send_welcome_email": 1})
		u.insert(ignore_permissions=True)
		u.add_roles("Customer")
	frappe.db.set_value("Customer", customer, "re_portal_user", email)
	return email
