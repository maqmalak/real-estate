"""Straight-line depreciation for the scheme's fixed assets (ERPNext Asset + Asset Depreciation Schedule).

* `setup_categories()` — useful life per asset category (monthly, straight line); land does not depreciate.
* `asset_finance_book(category, purchase_date)` — the finance-book row a new asset needs (used by the demo generator).
* `enable_on_demo_assets()` — demo assets that were submitted without depreciation are cancelled and amended with it
  (ERPNext does not allow switching depreciation on after submit), their map features are repointed to the amended
  asset, and depreciation is posted up to today.

    bench --site realestate execute realestate.demo.depreciation.enable_on_demo_assets
"""

import frappe
from frappe.utils import flt, get_last_day, getdate, nowdate

# category -> useful life in years (None = not depreciated)
LIFE = {"Land": None, "Buildings": 20, "Transformers & Grid": 15, "Electric Installation": 15, "Generators": 10, "Machinery": 10, "Tools": 5}
SALVAGE_PCT = {"Buildings": 10, "Generators": 5, "Machinery": 5}


def setup_categories():
	"""Monthly straight-line depreciation rules on each asset category (idempotent)."""
	for cat, years in LIFE.items():
		if not years or not frappe.db.exists("Asset Category", cat):
			continue
		doc = frappe.get_doc("Asset Category", cat)
		doc.enable_cwip_accounting = doc.get("enable_cwip_accounting") or 0
		doc.set("finance_books", [{"depreciation_method": "Straight Line", "frequency_of_depreciation": 1, "total_number_of_depreciations": years * 12}])
		doc.flags.ignore_permissions = True
		doc.save()


def asset_finance_book(category, purchase_date, cost):
	"""Finance-book row for a new asset in this category, or None when the category does not depreciate."""
	years = LIFE.get(category)
	if not years:
		return None
	return {"depreciation_method": "Straight Line", "frequency_of_depreciation": 1, "total_number_of_depreciations": years * 12,
			"depreciation_start_date": get_last_day(purchase_date),
			"expected_value_after_useful_life": round(flt(cost) * SALVAGE_PCT.get(category, 0) / 100)}


def enable_on_demo_assets():
	"""Cancel & amend submitted demo assets that have no depreciation, then post depreciation to date."""
	real_enqueue = frappe.enqueue

	def inline(method, *args, **kwargs):
		kwargs["now"] = True
		return real_enqueue(method, *args, **kwargs)

	frappe.enqueue = inline
	try:
		return _enable()
	finally:
		frappe.enqueue = real_enqueue


def _enable():
	project = frappe.db.get_single_value("RE Settings", "default_project")
	if not (project and frappe.db.get_value("RE Project", project, "is_demo")):
		print("Not the demo project — nothing changed")
		return {}
	setup_categories()
	frappe.db.commit()
	done, skipped = [], []
	for a in frappe.get_all("Asset", {"docstatus": 1, "calculate_depreciation": 0, "re_project": project},
							["name", "asset_category", "purchase_date", "net_purchase_amount"], order_by="name"):
		fb = asset_finance_book(a.asset_category, a.purchase_date, a.net_purchase_amount)
		if not fb:
			skipped.append(a.name)
			continue
		old = frappe.get_doc("Asset", a.name)
		feature = old.get("re_map_feature")
		old.flags.ignore_permissions = True
		old.cancel()
		new = frappe.copy_doc(old)
		new.amended_from = old.name
		new.calculate_depreciation = 1
		new.set("finance_books", [fb])
		new.flags.ignore_permissions = True
		new.insert()
		new.submit()
		for f in frappe.get_all("RE Map Feature", {"asset": old.name}, pluck="name"):
			frappe.db.set_value("RE Map Feature", f, "asset", new.name, update_modified=False)
		if feature:
			frappe.db.set_value("RE Map Feature", feature, "asset", new.name, update_modified=False)
		frappe.db.commit()
		done.append((old.name, new.name))
	from erpnext.assets.doctype.asset.depreciation import post_depreciation_entries

	post_depreciation_entries(date=nowdate())
	frappe.db.commit()
	posted = frappe.db.count("Journal Entry", {"voucher_type": "Depreciation Entry", "docstatus": 1})
	print(f"amended {len(done)} assets with depreciation, skipped {len(skipped)} (land); {posted} depreciation entries posted to {getdate(nowdate())}")
	return {"amended": done, "skipped": skipped, "entries": posted}
