"""Standard ERPNext documents behind the real-estate screens.

Sales:      RE Booking  -> Sales Invoice (one per booking; the installment plan is its Payment Schedule)
            RE Payment  -> Payment Entry (Receive) allocated to that invoice (or to the society-bill invoice)
            RE Society Bill -> Sales Invoice (one line per charge head)
Buying:     Material Request -> Purchase Order -> Purchase Receipt -> Purchase Invoice, tagged with the
            development Project and Cost Center; site consumption is a Stock Entry (Material Issue).
Assets:     ERPNext Asset with real-estate Asset Categories (Land, Buildings, Transformers, Generators, ...).
Budgets:    ERPNext Budget per development Project, so budget vs actual comes straight from the GL.

`setup_masters(company)` creates the accounts, cost centers, items, warehouses, projects and categories (idempotent).
"""

import frappe
from frappe import _
from frappe.utils import add_days, add_years, flt, getdate, nowdate

SITE_STORE = "Zarmeen Site Store"
LOCATION = "Zarmeen Gardens"

INCOME = [("Plot Sales", "Direct Income"), ("Society Charges Income", "Direct Income"), ("Late Payment Surcharge", "Indirect Income")]

# development cost heads: (project / cost head, expense account, budget PKR)
COST_HEADS = [
	("Land & Legal", "Land Cost", 0),
	("NOCs & Approvals", "NOC & Approval Fees", 6_500_000),
	("Roads & Streets", "Civil Works - Roads", 48_000_000),
	("Sewerage", "Sewerage Works", 22_000_000),
	("Water Supply", "Water Supply Works", 16_000_000),
	("Electrification (WAPDA)", "Electrification Works", 35_000_000),
	("Gas (SNGPL)", "Gas Network Works", 9_000_000),
	("Street Lights", "Street Light Works", 5_500_000),
	("Boundary Wall & Gates", "Boundary Wall & Gates", 14_000_000),
	("Parks & Plantation", "Parks & Plantation", 4_500_000),
	("Masjid & Public Buildings", "Public Buildings", 18_000_000),
]
SOCIETY_EXPENSES = ["Society Staff Salaries", "Society Electricity", "Society Repairs & Maintenance"]
FIXED_ASSET_ACCOUNTS = ["Land", "Electrical Installations", "Tools & Equipment"]

# asset category -> (fixed asset account, depreciable)
ASSET_CATEGORIES = {
	"Land": ("Land", False),
	"Buildings": ("Buildings", True),
	"Transformers & Grid": ("Electrical Installations", True),
	"Generators": ("Plants and Machineries", True),
	"Electric Installation": ("Electrical Installations", True),
	"Tools": ("Tools & Equipment", True),
	"Machinery": ("Plants and Machineries", True),
}

# item group -> [(item code, name, uom, stock?, rate)]
ITEMS = {
	"Plots": [],  # one per RE Plot Size, made by plot_item()
	"Society Charges": [("SOC-MAINT", "Society Maintenance", "Nos", 0, 0), ("SOC-SECURITY", "Security Charges", "Nos", 0, 0),
						("SOC-GARBAGE", "Garbage Collection", "Nos", 0, 0), ("SOC-WATER", "Water Charges", "Nos", 0, 0),
						("SOC-SURCHARGE", "Late Payment Surcharge", "Nos", 0, 0)],
	"Construction Material": [("CM-CEMENT", "Cement (50 kg bag)", "Bag", 1, 1450), ("CM-STEEL", "Steel Bars (Grade 60)", "Kg", 1, 265),
							  ("CM-BRICKS", "Bricks (A class)", "Nos", 1, 17), ("CM-SAND", "Sand (Chenab)", "Cubic Foot", 1, 85),
							  ("CM-CRUSH", "Crush / Aggregate", "Cubic Foot", 1, 160), ("CM-BITUMEN", "Bitumen 60/70", "Kg", 1, 310),
							  ("CM-RCC-PIPE", "RCC Pipe 18 inch", "Nos", 1, 6500), ("CM-PVC-PIPE", "PVC Pipe 4 inch", "Meter", 1, 650),
							  ("CM-CABLE", "Aluminium Cable 4 core", "Meter", 1, 1100), ("CM-PAVER", "Paver Tiles", "Square Foot", 1, 120),
							  ("CM-LED", "LED Street Light 60W", "Nos", 1, 14500)],
	"Plantation": [("PL-SAPLING", "Saplings (Neem / Ashok)", "Nos", 1, 450), ("PL-GRASS", "Lawn Grass", "Square Foot", 1, 35),
				   ("PL-FERT", "Fertilizer", "Bag", 1, 4200)],
	"Development Services": [("SV-EARTHWORK", "Earthwork & Levelling", "Cubic Foot", 0, 22), ("SV-CARPET", "Road Carpeting", "Square Foot", 0, 210),
							 ("SV-LABOUR", "Labour (contract)", "Day", 0, 1800), ("SV-NOC", "NOC / Approval Fee", "Nos", 0, 0),
							 ("SV-DEMAND", "Utility Demand Notice", "Nos", 0, 0), ("SV-SURVEY", "Survey & Design", "Nos", 0, 0),
							 ("SV-CIVIL", "Civil Works (contract bill)", "Nos", 0, 0)],
	"Real Estate Assets": [("FA-LAND", "Land Parcel", "Nos", 0, 0), ("FA-OFFICE", "Site Office Building", "Nos", 0, 0),
						   ("FA-TRANSFORMER", "Transformer 200 kVA", "Nos", 0, 0), ("FA-GENERATOR", "Diesel Generator 100 kVA", "Nos", 0, 0),
						   ("FA-ELEC", "Street Light Poles & Wiring", "Nos", 0, 0), ("FA-TOOLS", "Hand Tools Set", "Nos", 0, 0),
						   ("FA-ROLLER", "Road Roller", "Nos", 0, 0), ("FA-MIXER", "Concrete Mixer", "Nos", 0, 0)],
}
ASSET_ITEM_CATEGORY = {"FA-LAND": "Land", "FA-OFFICE": "Buildings", "FA-TRANSFORMER": "Transformers & Grid", "FA-GENERATOR": "Generators",
					   "FA-ELEC": "Electric Installation", "FA-TOOLS": "Tools", "FA-ROLLER": "Machinery", "FA-MIXER": "Machinery"}
CHARGE_ITEM = {"Maintenance": "SOC-MAINT", "Security": "SOC-SECURITY", "Garbage Collection": "SOC-GARBAGE", "Water": "SOC-WATER"}


def abbr(company):
	return frappe.get_cached_value("Company", company, "abbr")


def acc(company, name):
	return f"{name} - {abbr(company)}"


def _account(company, name, parent, account_type=None, is_group=0):
	full = acc(company, name)
	if not frappe.db.exists("Account", full):
		frappe.get_doc({"doctype": "Account", "account_name": name, "company": company, "parent_account": acc(company, parent),
						"is_group": is_group, "account_type": account_type}).insert(ignore_permissions=True)
	return full


def _cost_center(company, name, parent, is_group=0):
	full = acc(company, name)
	if not frappe.db.exists("Cost Center", full):
		frappe.get_doc({"doctype": "Cost Center", "cost_center_name": name, "company": company, "is_group": is_group,
						"parent_cost_center": parent}).insert(ignore_permissions=True)
	return full


def block_cost_center(company, block):
	return acc(company, f"ZG {block}") if block and frappe.db.exists("Cost Center", acc(company, f"ZG {block}")) else acc(company, "ZG Common Infrastructure")


def setup_masters(company):
	"""Accounts, cost centers, fiscal years, items, warehouse, location, asset categories, development projects."""
	a = abbr(company)
	for y in (2024, 2025, 2026, 2027):
		name = f"{y}-{y + 1}"
		if not frappe.db.exists("Fiscal Year", name):
			frappe.get_doc({"doctype": "Fiscal Year", "year": name, "year_start_date": f"{y}-07-01", "year_end_date": f"{y + 1}-06-30"}).insert(ignore_permissions=True)
	for name, parent in INCOME:
		_account(company, name, parent, "Income Account")
	_account(company, "Development Expenses", "Direct Expenses", is_group=1)
	for _head, account, _b in COST_HEADS:
		_account(company, account, "Development Expenses", "Expense Account")
	for name in SOCIETY_EXPENSES:
		_account(company, name, "Indirect Expenses", "Expense Account")
	for name in FIXED_ASSET_ACCOUNTS:
		_account(company, name, "Fixed Assets", "Fixed Asset")
	bank = _account(company, "Main Bank Account", "Bank Accounts", "Bank")
	for mode, account in (("Cash", acc(company, "Cash")), ("Bank Transfer", bank), ("Cheque", bank)):
		if not frappe.db.exists("Mode of Payment", mode):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": "Cash" if mode == "Cash" else "Bank", "enabled": 1}).insert(ignore_permissions=True)
		if not frappe.db.exists("Mode of Payment Account", {"parent": mode, "company": company}):
			mop = frappe.get_doc("Mode of Payment", mode)
			mop.append("accounts", {"company": company, "default_account": account})
			mop.save(ignore_permissions=True)

	root = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1, "parent_cost_center": ("in", ["", None])}, "name")
	zg = _cost_center(company, "Zarmeen Gardens", root, is_group=1)
	for cc in ("ZG Common Infrastructure", "ZG A Block", "ZG B Block", "ZG C Block", "ZG D Block", "ZG Society Operations"):
		_cost_center(company, cc, zg)

	for uom in ("Bag", "Cubic Foot", "Square Foot", "Day", "Kg", "Meter", "Nos"):
		if not frappe.db.exists("UOM", uom):
			frappe.get_doc({"doctype": "UOM", "uom_name": uom}).insert(ignore_permissions=True)
	if not frappe.db.exists("Item Group", "Real Estate"):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": "Real Estate", "parent_item_group": "All Items Groups" if frappe.db.exists("Item Group", "All Items Groups") else "All Item Groups", "is_group": 1}).insert(ignore_permissions=True)
	for group, items in ITEMS.items():
		if not frappe.db.exists("Item Group", group):
			frappe.get_doc({"doctype": "Item Group", "item_group_name": group, "parent_item_group": "Real Estate"}).insert(ignore_permissions=True)
		for code, name, uom, stock, rate in items:
			_item(company, code, name, group, uom, stock, rate)
	for size in frappe.get_all("RE Plot Size", pluck="name"):
		plot_item(company, size)

	wh = f"{SITE_STORE} - {a}"
	if not frappe.db.exists("Warehouse", wh):
		frappe.get_doc({"doctype": "Warehouse", "warehouse_name": SITE_STORE, "company": company,
						"parent_warehouse": f"All Warehouses - {a}"}).insert(ignore_permissions=True)
	if not frappe.db.exists("Location", LOCATION):
		frappe.get_doc({"doctype": "Location", "location_name": LOCATION, "latitude": 31.36, "longitude": 74.2}).insert(ignore_permissions=True)

	for cat, (account, depreciable) in ASSET_CATEGORIES.items():
		if frappe.db.exists("Asset Category", cat):
			continue
		frappe.get_doc({"doctype": "Asset Category", "asset_category_name": cat, "non_depreciable_category": int(not depreciable),
						"accounts": [{"company_name": company, "fixed_asset_account": acc(company, account),
									  "accumulated_depreciation_account": acc(company, "Accumulated Depreciation"),
									  "depreciation_expense_account": acc(company, "Depreciation")}]}).insert(ignore_permissions=True)
	for code, cat in ASSET_ITEM_CATEGORY.items():
		frappe.db.set_value("Item", code, {"is_fixed_asset": 1, "asset_category": cat, "is_stock_item": 0})

	for group in ("Material Suppliers", "Contractors", "Authorities & Utilities"):
		if not frappe.db.exists("Supplier Group", group):
			frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": group, "parent_supplier_group": "All Supplier Groups"}).insert(ignore_permissions=True)
	frappe.db.commit()


def _item(company, code, name, group, uom, stock, rate):
	if frappe.db.exists("Item", code):
		return code
	doc = frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": group, "stock_uom": uom,
						  "is_stock_item": stock, "include_item_in_manufacturing": 0, "valuation_rate": rate or 0,
						  "is_sales_item": int(group in ("Plots", "Society Charges")), "is_purchase_item": int(group not in ("Plots", "Society Charges"))})
	income = {"Plots": "Plot Sales", "Society Charges": "Society Charges Income"}.get(group)
	if code == "SOC-SURCHARGE":
		income = "Late Payment Surcharge"
	if income:
		doc.append("item_defaults", {"company": company, "income_account": acc(company, income)})
	elif stock:
		doc.append("item_defaults", {"company": company, "default_warehouse": f"{SITE_STORE} - {abbr(company)}" if frappe.db.exists("Warehouse", f"{SITE_STORE} - {abbr(company)}") else None})
	doc.insert(ignore_permissions=True)
	if rate and frappe.db.exists("Price List", "Standard Buying"):
		frappe.get_doc({"doctype": "Item Price", "item_code": code, "price_list": "Standard Buying", "price_list_rate": rate}).insert(ignore_permissions=True)
	return code


def plot_item(company, size):
	code = "PLOT-" + frappe.scrub(size).upper().replace("_", "-")
	_item(company, code, f"Plot - {size}", "Plots", "Nos", 0, 0)
	return code


def development_project(company, re_project, head):
	"""ERPNext Project for one development cost head (budgets, purchases and consumption hang off it)."""
	name = frappe.db.get_value("Project", {"re_project": re_project, "re_cost_head": head})
	if name:
		return name
	account = next(acc(company, a) for h, a, _b in COST_HEADS if h == head)
	doc = frappe.get_doc({"doctype": "Project", "project_name": f"ZG - {head}", "company": company, "re_project": re_project,
						  "re_cost_head": head, "re_expense_account": account, "project_type": "Real Estate Development",
						  "cost_center": acc(company, "ZG Common Infrastructure"), "status": "Open", "is_active": "Yes"})
	doc.insert(ignore_permissions=True)
	return doc.name


def setup_projects(company, re_project, with_budgets=False):
	if not frappe.db.exists("Project Type", "Real Estate Development"):
		frappe.get_doc({"doctype": "Project Type", "project_type": "Real Estate Development"}).insert(ignore_permissions=True)
	out = {}
	fy = frappe.db.get_value("Fiscal Year", {"year_start_date": ("<=", nowdate()), "year_end_date": (">=", nowdate())})
	for head, account, budget in COST_HEADS:
		project = out[head] = development_project(company, re_project, head)
		if with_budgets and budget and not frappe.db.exists("Budget", {"project": project, "account": acc(company, account), "docstatus": 1}):
			b = frappe.get_doc({"doctype": "Budget", "budget_against": "Project", "project": project, "company": company,
								"account": acc(company, account), "budget_amount": budget, "from_fiscal_year": fy, "to_fiscal_year": fy,
								"distribution_frequency": "Monthly", "distribute_equally": 1,
								"applicable_on_booking_actual_expenses": 1, "action_if_annual_budget_exceeded": "Warn",
								"action_if_accumulated_monthly_budget_exceeded": "Ignore"})
			b.insert(ignore_permissions=True)
			b.submit()
	return out


# ---------------------------------------------------------------- sales postings
def booking_invoice(booking):
	"""Submit the Sales Invoice for a booking; its payment schedule is the installment plan."""
	if booking.get("sales_invoice"):
		return booking.sales_invoice
	company = frappe.db.get_value("RE Project", booking.project, "company") or frappe.db.get_single_value("RE Settings", "company")
	block = frappe.db.get_value("RE Plot", booking.plot, "block")
	from realestate.terms import apply_to_invoice

	si = frappe.get_doc(apply_to_invoice({
		"doctype": "Sales Invoice", "customer": booking.customer, "company": company, "posting_date": booking.booking_date,
		"set_posting_time": 1, "due_date": max(r.due_date for r in booking.installments), "cost_center": block_cost_center(company, block),
		"remarks": _("Plot {0} — booking {1}").format(booking.plot, booking.name), "re_booking": booking.name, "re_plot": booking.plot,
		"items": [{"item_code": plot_item(company, booking.plot_size), "qty": 1, "rate": booking.net_price,
				   "description": _("Plot {0}, {1}, {2}").format(booking.plot, booking.plot_size, block),
				   "cost_center": block_cost_center(company, block)}],
		"payment_schedule": _schedule(booking),
	}, booking))
	si.flags.ignore_permissions = True
	si.insert()
	si.submit()
	return si.name


def _schedule(booking):
	"""Installments as invoice payment terms; rows due on the same date (e.g. last installment + possession) are merged."""
	rows = {}
	for r in sorted(booking.installments, key=lambda r: r.due_date):
		row = rows.setdefault(str(r.due_date), {"due_date": r.due_date, "payment_amount": 0, "description": []})
		row["payment_amount"] += flt(r.amount)
		row["description"].append(r.label)
	return [{**r, "description": " + ".join(r["description"]), "invoice_portion": r["payment_amount"] * 100 / flt(booking.net_price)}
			for r in rows.values()]


def bill_invoice(bill):
	company = frappe.db.get_single_value("RE Settings", "company") or frappe.db.get_single_value("Global Defaults", "default_company")
	si = frappe.get_doc({
		"doctype": "Sales Invoice", "customer": bill.customer, "company": company, "posting_date": bill.billing_month, "set_posting_time": 1,
		"due_date": bill.due_date, "cost_center": acc(company, "ZG Society Operations"), "re_society_bill": bill.name, "re_plot": bill.plot,
		"remarks": _("Society bill {0} — plot {1}").format(bill.bill_month_label, bill.plot),
		"items": [{"item_code": (c.charge_head and frappe.db.get_value("RE Charge Head", c.charge_head, "item")) or CHARGE_ITEM.get(c.charge, "SOC-MAINT"), "qty": 1, "rate": c.amount, "description": f"{c.charge} — {bill.bill_month_label}",
				   "cost_center": acc(company, "ZG Society Operations")} for c in bill.charges],
	})
	si.flags.ignore_permissions = True
	si.insert()
	si.submit()
	return si.name


def payment_entry(payment):
	"""Payment Entry (Receive) for an RE Payment, allocated to the booking's or bill's Sales Invoice."""
	invoice = {"Booking": lambda: frappe.db.get_value("RE Booking", payment.booking, "sales_invoice"),
			   "Society Bill": lambda: frappe.db.get_value("RE Society Bill", payment.society_bill, "sales_invoice"),
			   "Surcharge": lambda: frappe.db.get_value("RE Surcharge", payment.surcharge, "sales_invoice")}[payment.payment_against]()
	if not invoice:
		return None
	company = frappe.db.get_value("Sales Invoice", invoice, "company")
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry("Sales Invoice", invoice, party_amount=payment.amount)
	paid_to = frappe.db.get_value("Mode of Payment Account", {"parent": payment.mode_of_payment, "company": company}, "default_account")
	pe.update({
		"posting_date": payment.posting_date, "mode_of_payment": payment.mode_of_payment, "paid_amount": payment.amount,
		"received_amount": payment.amount, "reference_no": payment.reference_no or payment.name, "reference_date": payment.posting_date,
		"remarks": _("Receipt {0} — plot {1}").format(payment.name, payment.plot), "re_payment": payment.name,
	})
	if paid_to:
		pe.paid_to = paid_to
	for ref in pe.references:
		ref.allocated_amount = min(flt(payment.amount), flt(ref.outstanding_amount))
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe.name


def cancel(doctype, name):
	if name and frappe.db.get_value(doctype, name, "docstatus") == 1:
		doc = frappe.get_doc(doctype, name)
		doc.flags.ignore_permissions = True
		doc.cancel()


def custom_fields():
	link = lambda fn, label, dt, after, **kw: {"fieldname": fn, "fieldtype": "Link", "options": dt, "label": label, "insert_after": after, "read_only": 1, **kw}  # noqa: E731
	return {
		"Sales Invoice": [link("re_booking", "RE Booking", "RE Booking", "customer_name"), link("re_society_bill", "Society Bill", "RE Society Bill", "re_booking"),
						  link("re_plot", "Plot", "RE Plot", "re_society_bill", in_standard_filter=1)],
		"Payment Entry": [link("re_payment", "RE Receipt", "RE Payment", "party_name")],
		"Project": [{"fieldname": "re_cost_head", "fieldtype": "Data", "label": "Development Cost Head", "insert_after": "re_project", "read_only": 1},
					{"fieldname": "re_expense_account", "fieldtype": "Link", "options": "Account", "label": "Cost Head Account", "insert_after": "re_cost_head"}],
		"Asset": [{"fieldname": "re_project", "fieldtype": "Link", "options": "RE Project", "label": "Housing Scheme", "insert_after": "location"},
				  {"fieldname": "re_map_feature", "fieldtype": "Link", "options": "RE Map Feature", "label": "Map Feature", "insert_after": "re_project"}],
		"Purchase Invoice": [link("re_project", "Housing Scheme", "RE Project", "supplier_name", read_only=0)],
		"Stock Entry": [link("re_project", "Housing Scheme", "RE Project", "stock_entry_type", read_only=0)],
	}


# ---------------------------------------------------------------- phase B postings
B_ACCOUNTS = [("Transfer Fee Income", "Indirect Income", "Income Account"), ("Commissions Payable", "Current Liabilities", None)]
B_ITEMS = [("RE-TRANSFER-FEE", "Plot Transfer Fee", "Transfer Fee Income"), ("RE-MERGE-FEE", "Plot Merge Fee", "Transfer Fee Income"),
		   ("RE-REALLOT-FEE", "Plot Re-allotment Fee", "Transfer Fee Income")]


def setup_phase_b(company):
	for name, parent, account_type in B_ACCOUNTS:
		_account(company, name, parent, account_type)
	for code, name, income in B_ITEMS:
		if not frappe.db.exists("Item", code):
			doc = frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": "Society Charges", "stock_uom": "Nos",
								  "is_stock_item": 0, "is_sales_item": 1, "is_purchase_item": 0})
			doc.append("item_defaults", {"company": company, "income_account": acc(company, income)})
			doc.insert(ignore_permissions=True)
	if not frappe.db.exists("Sales Partner Type", "Property Dealer") and frappe.db.exists("DocType", "Sales Partner Type"):
		frappe.get_doc({"doctype": "Sales Partner Type", "sales_partner_type": "Property Dealer"}).insert(ignore_permissions=True)
	# banks & cash: an ERPNext Bank / Bank Account behind the bank ledger (Cash stays on the Cash ledger)
	if not frappe.db.exists("Bank", "Main Bank (sample)"):
		frappe.get_doc({"doctype": "Bank", "bank_name": "Main Bank (sample)"}).insert(ignore_permissions=True)
	if not frappe.db.exists("Bank Account", {"account": acc(company, "Main Bank Account")}):
		frappe.get_doc({"doctype": "Bank Account", "account_name": "Zarmeen Collections", "bank": "Main Bank (sample)", "account": acc(company, "Main Bank Account"),
						"is_company_account": 1, "is_default": 1, "company": company, "bank_account_no": "0000-0000000000 (sample)"}).insert(ignore_permissions=True)
	# recovery: ERPNext Dunning notices for overdue installments (the penalty itself is a Sales Invoice)
	if not frappe.db.exists("Dunning Type", {"company": company, "dunning_type": "Overdue Installments"}):
		frappe.get_doc({"doctype": "Dunning Type", "dunning_type": "Overdue Installments", "company": company, "is_default": 1, "dunning_fee": 0,
						"rate_of_interest": 0, "income_account": acc(company, "Late Payment Surcharge"), "cost_center": acc(company, "ZG Common Infrastructure"),
						"dunning_letter_text": [{"language": "en", "is_default_language": 1,
												 "body_text": "<p>Dear customer, the installments below for your plot at Zarmeen Gardens are overdue. "
															  "Please clear them at the earliest to avoid late payment surcharge.</p>",
												 "closing_text": "<p>Zarmeen Developers (Pvt) Ltd — Recovery Department</p>"}]}).insert(ignore_permissions=True)


def dunning_for(booking, posting_date=None):
	"""Submit an ERPNext Dunning (recovery notice) for the booking's overdue installments, unless one is already open."""
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import create_dunning

	if not booking.sales_invoice:
		return None
	open_ = frappe.db.sql("""select d.name from `tabDunning` d join `tabOverdue Payment` o on o.parent = d.name
		where d.docstatus = 1 and d.status = 'Unresolved' and o.sales_invoice = %s limit 1""", booking.sales_invoice)
	if open_:
		return open_[0][0]
	d = create_dunning(booking.sales_invoice, ignore_permissions=True)
	if not d.overdue_payments:
		return None
	d.posting_date = posting_date or nowdate()
	return _submit(d)


def _company_of(booking):
	return frappe.db.get_value("Sales Invoice", booking.sales_invoice, "company") if booking.get("sales_invoice") \
		else frappe.db.get_single_value("RE Settings", "company")


def _submit(doc):
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return doc.name


def sales_invoice(company, customer, posting_date, lines, cost_center=None, remarks=None, due_date=None, schedule=None, **links):
	"""Plain Sales Invoice: lines = [(item_code, rate, description)]."""
	cc = cost_center or acc(company, "ZG Common Infrastructure")
	return _submit(frappe.get_doc({
		"doctype": "Sales Invoice", "customer": customer, "company": company, "posting_date": posting_date, "set_posting_time": 1,
		"due_date": due_date or posting_date, "cost_center": cc, "remarks": remarks, **links,
		"items": [{"item_code": i, "qty": 1, "rate": r, "description": d, "cost_center": cc} for i, r, d in lines],
		**({"payment_schedule": schedule} if schedule else {}),
	}))


def _terms_fields(booking):
	from realestate.terms import apply_to_invoice

	return {k: v for k, v in apply_to_invoice({}, booking).items()}


def credit_note(invoice, amount, posting_date, remarks, own_outstanding=0):
	"""Return (credit note) against an invoice for `amount`. By default it reduces that invoice's outstanding (amount must not
	exceed it); with own_outstanding=1 the credit stays on the note itself, to be refunded with a Payment Entry against it."""
	si = frappe.get_doc("Sales Invoice", invoice)
	return _submit(frappe.get_doc({
		"doctype": "Sales Invoice", "is_return": 1, "return_against": invoice, "update_outstanding_for_self": own_outstanding,
		"customer": si.customer, "company": si.company,
		"posting_date": posting_date, "set_posting_time": 1, "cost_center": si.cost_center, "remarks": remarks,
		"re_booking": si.get("re_booking"), "re_plot": si.get("re_plot"),
		"items": [{"item_code": si.items[0].item_code, "qty": -1, "rate": amount, "description": remarks, "cost_center": si.cost_center}],
	}))


def refund_entry(invoice, amount, mode, posting_date, remarks):
	"""Payment Entry (Pay) refunding the negative outstanding of an invoice to the customer."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry("Sales Invoice", invoice)
	company = frappe.db.get_value("Sales Invoice", invoice, "company")
	paid_from = frappe.db.get_value("Mode of Payment Account", {"parent": mode, "company": company}, "default_account")
	pe.update({"posting_date": posting_date, "mode_of_payment": mode, "paid_amount": amount, "received_amount": amount,
			   "reference_no": remarks[:100], "reference_date": posting_date, "remarks": remarks})
	if paid_from:  # the company's cash / bank ledger is on the side opposite the customer's account
		if pe.payment_type == "Pay":
			pe.paid_from = paid_from
		else:
			pe.paid_to = paid_from
	for ref in pe.references:
		ref.allocated_amount = -amount if flt(ref.outstanding_amount) < 0 else amount
	return _submit(pe)


def transfer_post(t, booking):
	"""Old owner: credit note for the balance still owed + transfer-fee invoice. New owner: invoice for the balance with
	the remaining installments as its schedule. The booking then points at the new invoice."""
	company = _company_of(booking)
	out = {}
	if flt(t.transfer_fee):
		out["fee_invoice"] = sales_invoice(company, t.from_customer, t.transfer_date, [("RE-TRANSFER-FEE", t.transfer_fee, f"Transfer of plot {t.plot}")],
										   remarks=f"Transfer fee — plot {t.plot}", re_plot=t.plot)
	balance = flt(frappe.db.get_value("Sales Invoice", booking.sales_invoice, "outstanding_amount"))
	if balance > 0.5:
		out["credit_note"] = credit_note(booking.sales_invoice, balance, t.transfer_date, f"Plot {t.plot} transferred to {t.to_customer_name}")
		rows = {}
		for r in sorted(booking.installments, key=lambda r: r.due_date):
			pending = flt(r.amount) - flt(r.paid_amount)
			if pending > 0.5:
				d = max(getdate(r.due_date), getdate(t.transfer_date))
				row = rows.setdefault(str(d), {"due_date": d, "payment_amount": 0, "description": []})
				row["payment_amount"] += pending
				row["description"].append(r.label)
		schedule = [{**r, "description": " + ".join(r["description"]), "invoice_portion": r["payment_amount"] * 100 / balance} for r in rows.values()]
		block = frappe.db.get_value("RE Plot", t.plot, "block")
		out["new_invoice"] = sales_invoice(company, t.to_customer, t.transfer_date,
										   [(plot_item(company, booking.plot_size), balance, f"Plot {t.plot} — balance taken over from {t.from_customer_name}")],
										   cost_center=block_cost_center(company, block), remarks=f"Plot {t.plot} transfer {t.name}",
										   due_date=max(r["due_date"] for r in schedule), schedule=schedule, re_booking=booking.name, re_plot=t.plot,
										   **_terms_fields(booking))
	return out


def journal(company, posting_date, remark, lines):
	"""lines = [(account, debit, credit, cost_center)]"""
	return _submit(frappe.get_doc({
		"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": posting_date, "user_remark": remark,
		"accounts": [{"account": a, "debit_in_account_currency": d, "credit_in_account_currency": c, "cost_center": cc} for a, d, c, cc in lines],
	}))
