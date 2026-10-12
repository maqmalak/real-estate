"""Sample development side of the scheme on standard ERPNext Buying / Stock / Assets / Budgets.

Per development head (an ERPNext Project): materials bought through Purchase Order -> Purchase Receipt (site store)
-> Purchase Invoice, consumed with Stock Entry (Material Issue) charged to the head's account and project;
contractor running bills, NOC fees and utility demand notices as Purchase Invoices; most invoices paid with
Payment Entries; a few open Material Requests; fixed assets (land, transformers, generators, tools, machinery)
as ERPNext Assets linked to their map features; society running costs on the Society Operations cost center.
"""

import random

import frappe
from frappe.utils import add_days, add_months, flt, get_first_day, getdate, nowdate

from realestate.erp import COST_HEADS, LOCATION, SITE_STORE, acc

SUPPLIERS = [
	("Al-Noor Building Materials", "Material Suppliers"), ("Punjab Steel Traders", "Material Suppliers"),
	("Green Valley Nursery", "Material Suppliers"), ("Shah Electric Works", "Contractors"), ("Zafar Construction Co.", "Contractors"),
	("City Pipe & Sewer Works", "Contractors"), ("Development Authority (sample)", "Authorities & Utilities"),
	("Electricity Distribution Co. (sample)", "Authorities & Utilities"), ("Gas Utility Co. (sample)", "Authorities & Utilities"),
	("Watch & Ward Security Services", "Contractors"),
]

# head -> (materials [(item, qty per month)], contractor, monthly contract bill range)
WORK = {
	"Roads & Streets": ([("CM-CRUSH", 3000), ("CM-BITUMEN", 1800), ("CM-SAND", 1500)], "Zafar Construction Co.", (1_800_000, 3_200_000)),
	"Sewerage": ([("CM-RCC-PIPE", 40), ("CM-CEMENT", 220), ("CM-BRICKS", 9000)], "City Pipe & Sewer Works", (900_000, 1_600_000)),
	"Water Supply": ([("CM-PVC-PIPE", 600), ("CM-CEMENT", 80)], "City Pipe & Sewer Works", (500_000, 900_000)),
	"Electrification (WAPDA)": ([("CM-CABLE", 700)], "Shah Electric Works", (1_200_000, 2_400_000)),
	"Street Lights": ([("CM-LED", 12), ("CM-CABLE", 150)], "Shah Electric Works", (150_000, 300_000)),
	"Boundary Wall & Gates": ([("CM-BRICKS", 14000), ("CM-CEMENT", 300), ("CM-STEEL", 2500), ("CM-SAND", 900)], "Zafar Construction Co.", (600_000, 1_100_000)),
	"Parks & Plantation": ([("PL-SAPLING", 120), ("PL-GRASS", 5000), ("PL-FERT", 6)], "Green Valley Nursery", (80_000, 160_000)),
	"Masjid & Public Buildings": ([("CM-CEMENT", 260), ("CM-STEEL", 3000), ("CM-BRICKS", 12000), ("CM-PAVER", 1500)], "Zafar Construction Co.", (700_000, 1_300_000)),
}
MATERIAL_SUPPLIER = {"CM-STEEL": "Punjab Steel Traders", "PL-SAPLING": "Green Valley Nursery", "PL-GRASS": "Green Valley Nursery",
					 "PL-FERT": "Green Valley Nursery", "CM-CABLE": "Shah Electric Works", "CM-LED": "Shah Electric Works"}
FEES = [  # (head, supplier, item, description, amount, months ago)
	("NOCs & Approvals", "Development Authority (sample)", "SV-NOC", "Layout plan approval fee", 2_400_000, 11),
	("NOCs & Approvals", "Development Authority (sample)", "SV-NOC", "Environmental NOC (EPA)", 650_000, 10),
	("NOCs & Approvals", "Development Authority (sample)", "SV-NOC", "Scrutiny & conversion fee", 1_350_000, 9),
	("Electrification (WAPDA)", "Electricity Distribution Co. (sample)", "SV-DEMAND", "Demand notice - 11 kV feeder & grid", 8_500_000, 8),
	("Gas (SNGPL)", "Gas Utility Co. (sample)", "SV-DEMAND", "Demand notice - gas network", 5_200_000, 6),
	("Water Supply", "Development Authority (sample)", "SV-DEMAND", "WASA connection charges", 1_100_000, 5),
	("Land & Legal", "Development Authority (sample)", "SV-SURVEY", "Demarcation survey & design", 900_000, 12),
]


def run(company, re_project, projects, rng=None):
	rng = rng or random.Random(11)
	_suppliers()
	wh = f"{SITE_STORE} - {frappe.get_cached_value('Company', company, 'abbr')}"
	cc = acc(company, "ZG Common Infrastructure")
	head_account = {h: acc(company, a) for h, a, _b in COST_HEADS}
	today = getdate(nowdate())
	invoices = []
	for months_ago in range(10, 0, -1):
		month = add_months(get_first_day(today), -months_ago)
		for head, (materials, contractor, bill_range) in WORK.items():
			if rng.random() < 0.25:
				continue
			project = projects[head]
			by_supplier = {}
			for item, qty in materials:
				by_supplier.setdefault(MATERIAL_SUPPLIER.get(item, "Al-Noor Building Materials"), []).append((item, qty * rng.uniform(0.7, 1.3)))
			for supplier, rows in by_supplier.items():
				day = add_days(month, rng.randint(1, 8))
				po = _po(company, supplier, rows, project, cc, wh, day)
				pr = _receipt(po, add_days(day, rng.randint(2, 6)))
				invoices.append(_invoice_from_receipt(pr, add_days(day, rng.randint(6, 12))))
				# consume most of what came in, later in the month
				_issue(company, rows, project, head_account[head], cc, wh, add_days(day, rng.randint(12, 20)), rng)
			# contractor running bill
			bill = round(rng.uniform(*bill_range), -3)
			invoices.append(_service_invoice(company, contractor, "SV-CIVIL", f"{head} — running bill {month.strftime('%b %Y')}", bill,
											 project, head_account[head], cc, add_days(month, rng.randint(20, 27))))
	for head, supplier, item, text, amount, ago in FEES:
		invoices.append(_service_invoice(company, supplier, item, text, amount, projects[head], head_account[head], cc,
										 add_days(add_months(today, -ago), rng.randint(0, 20))))
	# pay most supplier invoices
	for inv in invoices:
		if rng.random() < 0.8:
			_pay_supplier(inv, rng)
	_material_requests(company, projects, wh, rng)
	_assets(company, re_project, rng)
	_society_costs(company, rng)
	_map_progress(re_project, projects, rng)
	frappe.db.commit()


def _suppliers():
	for name, group in SUPPLIERS:
		if not frappe.db.exists("Supplier", name):
			frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": group, "supplier_type": "Company",
							"country": "Pakistan"}).insert(ignore_permissions=True)


def _rate(item):
	return flt(frappe.db.get_value("Item Price", {"item_code": item, "price_list": "Standard Buying"}, "price_list_rate")) or 100


def _po(company, supplier, rows, project, cc, wh, day):
	po = frappe.get_doc({
		"doctype": "Purchase Order", "supplier": supplier, "company": company, "transaction_date": day, "schedule_date": add_days(day, 5),
		"project": project, "cost_center": cc, "set_warehouse": wh,
		"items": [{"item_code": i, "qty": round(q), "rate": _rate(i), "warehouse": wh, "schedule_date": add_days(day, 5),
				   "project": project, "cost_center": cc} for i, q in rows],
	})
	po.insert(ignore_permissions=True)
	po.submit()
	return po.name


def _receipt(po, day):
	from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt

	pr = make_purchase_receipt(po)
	pr.posting_date, pr.set_posting_time = day, 1
	pr.insert(ignore_permissions=True)
	pr.submit()
	return pr.name


def _invoice_from_receipt(pr, day):
	from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

	pi = make_purchase_invoice(pr)
	pi.posting_date, pi.set_posting_time, pi.bill_date = day, 1, day
	pi.due_date = add_days(day, 30)
	pi.insert(ignore_permissions=True)
	pi.submit()
	return pi.name


def _service_invoice(company, supplier, item, text, amount, project, expense_account, cc, day):
	pi = frappe.get_doc({
		"doctype": "Purchase Invoice", "supplier": supplier, "company": company, "posting_date": day, "set_posting_time": 1,
		"bill_date": day, "due_date": add_days(day, 30), "project": project, "cost_center": cc,
		"items": [{"item_code": item, "description": text, "qty": 1, "rate": amount, "expense_account": expense_account,
				   "project": project, "cost_center": cc}],
	})
	pi.insert(ignore_permissions=True)
	pi.submit()
	return pi.name


def _issue(company, rows, project, expense_account, cc, wh, day, rng):
	items = []
	for item, qty in rows:
		available = flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": wh}, "actual_qty"))
		use = min(round(qty * rng.uniform(0.75, 0.95)), available)
		if use > 0:
			items.append({"item_code": item, "qty": use, "s_warehouse": wh, "expense_account": expense_account, "cost_center": cc, "project": project})
	if not items:
		return None
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "company": company, "posting_date": day,
						 "set_posting_time": 1, "from_warehouse": wh, "project": project, "items": items})
	se.insert(ignore_permissions=True)
	se.submit()
	return se.name


def _pay_supplier(invoice, rng):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pi = frappe.db.get_value("Purchase Invoice", invoice, ["posting_date", "company"], as_dict=True)
	pe = get_payment_entry("Purchase Invoice", invoice)
	day = min(getdate(add_days(pi.posting_date, rng.randint(5, 30))), getdate(nowdate()))
	pe.posting_date, pe.reference_no, pe.reference_date = day, f"CHQ{rng.randint(100000, 999999)}", day
	pe.mode_of_payment = "Cheque"
	pe.paid_from = acc(pi.company, "Main Bank Account")
	pe.insert(ignore_permissions=True)
	pe.submit()


def _material_requests(company, projects, wh, rng):
	for head, item, qty in (("Roads & Streets", "CM-BITUMEN", 2500), ("Sewerage", "CM-RCC-PIPE", 60), ("Street Lights", "CM-LED", 40),
							("Parks & Plantation", "PL-SAPLING", 300)):
		cc = acc(company, "ZG Common Infrastructure")
		mr = frappe.get_doc({"doctype": "Material Request", "material_request_type": "Purchase", "company": company, "cost_center": cc,
							 "transaction_date": nowdate(), "schedule_date": add_days(nowdate(), 14), "set_warehouse": wh,
							 "items": [{"item_code": item, "qty": qty, "warehouse": wh, "schedule_date": add_days(nowdate(), 14),
										"project": projects[head], "cost_center": cc}]})
		mr.insert(ignore_permissions=True)
		if rng.random() < 0.7:
			mr.submit()


def _asset(company, re_project, item, name, amount, day, feature=None):
	asset = frappe.get_doc({
		"doctype": "Asset", "item_code": item, "asset_name": name, "company": company, "location": LOCATION, "asset_type": "Existing Asset",
		"purchase_date": day, "available_for_use_date": day, "net_purchase_amount": amount, "purchase_amount": amount,
		"calculate_depreciation": 0, "cost_center": acc(company, "ZG Common Infrastructure"), "re_project": re_project, "re_map_feature": feature,
	})
	from realestate.demo.depreciation import asset_finance_book, setup_categories

	category = frappe.db.get_value("Item", item, "asset_category")
	fb = asset_finance_book(category, day, amount)
	if fb:  # straight-line depreciation by category (land is not depreciated)
		setup_categories()
		asset.calculate_depreciation = 1
		asset.set("finance_books", [fb])
	asset.insert(ignore_permissions=True)
	asset.submit()
	if feature:
		frappe.db.set_value("RE Map Feature", feature, {"asset": asset.name, "asset_status": "Completed", "completion_pct": 100, "estimated_cost": amount})
	return asset.name


def _assets(company, re_project, rng):
	today = getdate(nowdate())
	_asset(company, re_project, "FA-LAND", "Zarmeen Gardens land (400 Kanal)", 1_200_000_000, add_months(today, -14))
	_asset(company, re_project, "FA-OFFICE", "Site office & sales centre", 18_500_000, add_months(today, -12))
	for f in frappe.get_all("RE Map Feature", {"project": re_project, "feature_type": "Transformer"}, ["name", "feature_name"], order_by="feature_name"):
		_asset(company, re_project, "FA-TRANSFORMER", f.feature_name, round(rng.uniform(1_400_000, 1_900_000), -3), add_months(today, -rng.randint(2, 8)), f.name)
	grid = frappe.db.get_value("RE Map Feature", {"project": re_project, "feature_type": "Grid Station"})
	_asset(company, re_project, "FA-ELEC", "Grid station equipment", 42_000_000, add_months(today, -7), grid)
	for i in (1, 2):
		_asset(company, re_project, "FA-GENERATOR", f"Diesel generator 100 kVA #{i}", 3_800_000, add_months(today, -9))
	_asset(company, re_project, "FA-ELEC", "Street light poles & wiring - phase 1", 6_400_000, add_months(today, -3))
	_asset(company, re_project, "FA-TOOLS", "Site hand tools set", 450_000, add_months(today, -11))
	_asset(company, re_project, "FA-ROLLER", "Road roller 10 ton", 9_500_000, add_months(today, -10))
	_asset(company, re_project, "FA-MIXER", "Concrete mixer", 1_250_000, add_months(today, -10))


def _society_costs(company, rng):
	"""Society running costs on the Society Operations cost center (guards, sweepers, street-light electricity, repairs)."""
	cc = acc(company, "ZG Society Operations")
	for months_ago in range(6, 0, -1):
		day = add_days(add_months(get_first_day(nowdate()), -months_ago + 1), -2)
		je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": day,
							 "user_remark": f"Society staff salaries (guards & sweepers) {getdate(day).strftime('%b %Y')}",
							 "accounts": [{"account": acc(company, "Society Staff Salaries"), "debit_in_account_currency": 620_000, "cost_center": cc},
										  {"account": acc(company, "Cash"), "credit_in_account_currency": 620_000, "cost_center": cc}]})
		je.insert(ignore_permissions=True)
		je.submit()
		inv = _service_invoice(company, "Electricity Distribution Co. (sample)", "SV-DEMAND", f"Street lights & tube-well electricity {getdate(day).strftime('%b %Y')}",
							   round(rng.uniform(160_000, 240_000), -3), None, acc(company, "Society Electricity"), cc, add_days(day, -5))
		_pay_supplier(inv, rng)
		if rng.random() < 0.7:
			_service_invoice(company, "Watch & Ward Security Services", "SV-LABOUR", "Repairs & maintenance", round(rng.uniform(40_000, 120_000), -3),
							 None, acc(company, "Society Repairs & Maintenance"), cc, add_days(day, -10))


def _map_progress(re_project, projects, rng):
	head_of = {"Boulevard": "Roads & Streets", "Street": "Roads & Streets", "Perimeter Road": "Roads & Streets",
			   "Water Supply Line": "Water Supply", "Sewerage Line": "Sewerage", "Sewerage Disposal": "Sewerage", "Water Tank": "Water Supply",
			   "Electricity Line": "Electrification (WAPDA)", "Internet Cable": "Electrification (WAPDA)", "Main Gate": "Boundary Wall & Gates",
			   "Back Gate": "Boundary Wall & Gates", "Central Park": "Parks & Plantation", "Masjid": "Masjid & Public Buildings",
			   "School": "Masjid & Public Buildings"}
	for f in frappe.get_all("RE Map Feature", {"project": re_project, "asset": ("is", "not set")}, ["name", "feature_type"]):
		head = head_of.get(f.feature_type)
		if not head:
			continue
		pct = rng.choice([100, 100, 85, 70, 55, 40, 20])
		frappe.db.set_value("RE Map Feature", f.name, {"erp_project": projects[head], "completion_pct": pct,
													   "asset_status": "Completed" if pct == 100 else "In Progress",
													   "contractor": WORK.get(head, (None, "Zafar Construction Co."))[1]})
