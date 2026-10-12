"""The spec's roles as ERPNext Role Profiles (§7): Admin, Accounts, Sales Manager, Sales Agent, Recovery Officer, Society Manager,
Customer — plus the maintenance team. A profile bundles the permission roles; giving a user a profile gives them exactly
those roles, so access is managed in one place (desk: User → Role Profiles, or React: Setup → Users & Roles).

What each sees is enforced on the server: DocType permissions (realestate.roles.GRANTS), row rules for Sales Agents
(realestate.permissions / realestate.scope) and the portal's customer scope (realestate.portal)."""

import frappe
from frappe import _

PROFILES = {
	# profile: (roles, what it is for)
	"RE Admin": (["System Manager", "Sales Manager", "Sales User", "Accounts Manager", "Accounts User", "Projects Manager", "Projects User",
				  "Society Manager", "Recovery Officer", "Stock Manager", "Purchase Manager"], "Everything, including settings and users"),
	"RE Accounts": (["Accounts Manager", "Accounts User", "Purchase User", "Stock User"],
					"Invoices, receipts, Payment Entries, ledgers, refunds, commissions payouts, all finance reports"),
	"RE Sales Manager": (["Sales Manager", "Sales User", "Accounts User"],
						 "All sales, approvals (discounts, transfers, cancellations, re-allotments, merges, waivers), insights and reports"),
	"RE Sales Agent": (["Sales User", "Sales Agent"], "Own leads, deals, customers, bookings, receipts, visits and chats only"),
	"RE Recovery Officer": (["Recovery Officer"], "Overdue follow-up: dues, receipts, surcharges & waivers, dunning, promise-to-pay calls"),
	"RE Society Manager": (["Society Manager", "Projects User", "Stock User", "Purchase User"],
						   "Society bills & collection, charge heads, complaints, maintenance, infrastructure, vault documents"),
	"RE Projects Manager": (["Projects Manager", "Projects User", "Purchase User", "Stock User"], "Development projects, budgets, buying, maintenance teams"),
	"RE Maintenance Staff": (["Projects User"], "Assigned maintenance tasks and complaints"),
	"RE Customer": (["Customer"], "Owner portal: own plots, schedule, receipts, bills, documents, complaints"),
}

# demo users -> profile (local demo data only)
DEMO_ASSIGN = {
	"kamran.malik@zarmeen.example": "RE Sales Manager", "naeem.akhtar@zarmeen.example": "RE Recovery Officer",
	"rashid.iqbal@zarmeen.example": "RE Projects Manager", "nasir.mehmood@zarmeen.example": "RE Maintenance Staff",
	"shakeel.ahmad@zarmeen.example": "RE Maintenance Staff",
}
DEMO_NEW = [  # roles the demo had no user for
	("farah.qureshi@zarmeen.example", "Farah", "Qureshi", "RE Accounts", "+923009990301"),
	("imran.haider@zarmeen.example", "Imran", "Haider", "RE Society Manager", "+923009990302"),
]


def setup():
	for name, (roles, _desc) in PROFILES.items():
		for r in roles:
			if not frappe.db.exists("Role", r):
				frappe.get_doc({"doctype": "Role", "role_name": r, "desk_access": 0 if r == "Customer" else 1}).insert(ignore_permissions=True)
		doc = frappe.get_doc("Role Profile", name) if frappe.db.exists("Role Profile", name) else frappe.new_doc("Role Profile")
		doc.role_profile = name
		doc.set("roles", [{"role": r} for r in roles])
		doc.save(ignore_permissions=True)
	frappe.db.commit()


def assign(user: str, profile: str):
	"""Give a user exactly one RE profile (other, non-RE profiles are kept)."""
	u = frappe.get_doc("User", user)
	keep = [r.role_profile for r in u.get("role_profiles", []) if not r.role_profile.startswith("RE ")]
	u.set("role_profiles", [{"role_profile": p} for p in [*keep, profile]])
	u.role_profile_name = None
	u.flags.ignore_permissions = True
	u.save()


def demo_users():
	"""Profiles for the demo staff and owners; adds an accounts and a society-manager user. Idempotent."""
	from frappe.utils.password import update_password

	setup()
	for email, first, last, profile, mobile in DEMO_NEW:
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last, "user_type": "System User",
							"send_welcome_email": 0, "mobile_no": mobile}).insert(ignore_permissions=True)
		DEMO_ASSIGN[email] = profile
	agents = frappe.get_all("Has Role", {"role": "Sales Agent", "parenttype": "User"}, pluck="parent")
	for a in agents:
		if a.endswith("@zarmeen.example"):
			DEMO_ASSIGN.setdefault(a, "RE Sales Agent")
	for owner in frappe.get_all("Customer", {"re_portal_user": ("is", "set")}, pluck="re_portal_user"):
		DEMO_ASSIGN.setdefault(owner, "RE Customer")
	for user, profile in DEMO_ASSIGN.items():
		if frappe.db.exists("User", user):
			assign(user, profile)
			if user.endswith("@zarmeen.example"):
				from realestate.demo.seed import STAFF_PASSWORD

				update_password(user, STAFF_PASSWORD)
	frappe.db.commit()


# ---------------------------------------------------------------- React: Setup → Users & Roles
@frappe.whitelist(methods=["GET"])
def overview() -> dict:
	frappe.only_for("System Manager")
	profiles = [{"name": n, "roles": r, "description": d} for n, (r, d) in PROFILES.items()]
	users = frappe.get_all("User", {"name": ("not in", ["Guest", "Administrator"]), "user_type": ("in", ["System User", "Website User"])},
						   ["name", "full_name", "user_type", "enabled", "last_login", "mobile_no"], order_by="user_type, full_name", limit=500)
	links = frappe.get_all("User Role Profile", {"parenttype": "User"}, ["parent", "role_profile"], limit=0)
	roles = frappe.get_all("Has Role", {"parenttype": "User", "parent": ("in", [u.name for u in users] or [""])}, ["parent", "role"], limit=0)
	by_user_profile, by_user_roles = {}, {}
	for link in links:
		by_user_profile.setdefault(link.parent, []).append(link.role_profile)
	for r in roles:
		by_user_roles.setdefault(r.parent, []).append(r.role)
	for u in users:
		u.profiles = by_user_profile.get(u.name, [])
		u.roles = sorted(by_user_roles.get(u.name, []))
	counts = {p["name"]: sum(1 for u in users if p["name"] in u.profiles) for p in profiles}
	return {"profiles": profiles, "users": users, "counts": counts}


@frappe.whitelist()
def set_profile(user: str, profile: str) -> dict:
	frappe.only_for("System Manager")
	if profile not in PROFILES:
		frappe.throw(_("Unknown profile"))
	if user in ("Administrator", frappe.session.user) and profile != "RE Admin":
		frappe.throw(_("You cannot downgrade your own account or Administrator"))
	assign(user, profile)
	return {"user": user, "profile": profile}


@frappe.whitelist()
def set_enabled(user: str, enabled: int) -> None:
	frappe.only_for("System Manager")
	if user in ("Administrator", frappe.session.user):
		frappe.throw(_("You cannot disable this account"))
	frappe.db.set_value("User", user, "enabled", int(enabled))


@frappe.whitelist()
def add_user(email: str, first_name: str, profile: str, last_name: str | None = None, mobile_no: str | None = None, send_welcome: int = 0) -> str:
	"""Create a staff user with a profile (welcome email only when asked)."""
	frappe.only_for("System Manager")
	if profile not in PROFILES:
		frappe.throw(_("Unknown profile"))
	if frappe.db.exists("User", email):
		frappe.throw(_("User {0} already exists").format(email))
	from realestate.identity import normalise_mobile

	frappe.get_doc({"doctype": "User", "email": email, "first_name": first_name, "last_name": last_name,
					"user_type": "Website User" if profile == "RE Customer" else "System User",
					"mobile_no": normalise_mobile(mobile_no) if mobile_no else None, "send_welcome_email": int(send_welcome)}).insert()
	assign(email, profile)
	return email
