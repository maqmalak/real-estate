"""Cost per block and per marla, and profitability: land + development cost allocated by each block's share of land,
against plot revenue booked and received."""

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	blocks = frappe.get_all("RE Block", ["name", "land_use_percent", "area_kanal", "project"], order_by="block_code")
	if not blocks:
		return [], []
	project_names = list({b.project for b in blocks})
	land = flt(frappe.db.sql("""select sum(net_purchase_amount) from `tabAsset` where docstatus=1 and asset_category='Land' and re_project in %s""",
							 (project_names,))[0][0])
	dev = flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry` where is_cancelled=0 and project in
		(select name from `tabProject` where re_cost_head is not null and re_project in %s)
		and account in (select name from `tabAccount` where root_type='Expense')""", (project_names,))[0][0])
	assets = flt(frappe.db.sql("""select sum(net_purchase_amount) from `tabAsset` where docstatus=1 and asset_category != 'Land' and re_project in %s""",
							   (project_names,))[0][0])
	total_share = sum(flt(b.land_use_percent) for b in blocks) or 1
	data = []
	for b in blocks:
		share = flt(b.land_use_percent) / total_share
		cost = (land + dev + assets) * share
		saleable = flt(frappe.db.sql("select sum(area_marla) from `tabRE Plot` where block=%s", b.name)[0][0])
		sold_marla, booked, received = frappe.db.sql("""select sum(p.area_marla), sum(bk.net_price), sum(bk.paid_amount) from `tabRE Booking` bk
			join `tabRE Plot` p on p.name = bk.plot where bk.docstatus=1 and bk.block=%s""", b.name)[0]
		inventory = flt(frappe.db.sql("select sum(list_price) from `tabRE Plot` where block=%s and status='Available'", b.name)[0][0])
		data.append({"block": b.name, "share": round(share * 100, 1), "cost": cost, "saleable_marla": saleable,
					 "cost_per_marla": cost / saleable if saleable else 0, "sold_marla": flt(sold_marla), "booked": flt(booked),
					 "received": flt(received), "inventory": inventory, "margin": flt(booked) + inventory - cost,
					 "margin_pct": round((flt(booked) + inventory - cost) * 100 / (flt(booked) + inventory), 1) if (flt(booked) + inventory) else 0})
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 135}
	columns = [{"fieldname": "block", "label": _("Block"), "fieldtype": "Link", "options": "RE Block", "width": 100},
			   {"fieldname": "share", "label": _("Land Share %"), "fieldtype": "Percent", "width": 100},
			   {"fieldname": "cost", "label": _("Allocated Cost"), **cur}, {"fieldname": "saleable_marla", "label": _("Saleable Marla"), "fieldtype": "Float", "width": 110},
			   {"fieldname": "cost_per_marla", "label": _("Cost / Marla"), **cur}, {"fieldname": "sold_marla", "label": _("Sold Marla"), "fieldtype": "Float", "width": 100},
			   {"fieldname": "booked", "label": _("Sales Booked"), **cur}, {"fieldname": "received", "label": _("Received"), **cur},
			   {"fieldname": "inventory", "label": _("Unsold at List"), **cur}, {"fieldname": "margin", "label": _("Projected Margin"), **cur},
			   {"fieldname": "margin_pct", "label": _("Margin %"), "fieldtype": "Percent", "width": 90}]
	chart = {"data": {"labels": [d["block"] for d in data], "datasets": [{"name": _("Cost"), "values": [d["cost"] for d in data]},
																		 {"name": _("Booked"), "values": [d["booked"] for d in data]},
																		 {"name": _("Received"), "values": [d["received"] for d in data]}]},
			 "type": "bar", "colors": ["#dc2626", "#3b82f6", "#16a34a"]}
	summary = [{"label": _("Land"), "value": land, "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Development"), "value": dev, "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Infrastructure Assets"), "value": assets, "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Sales Booked"), "value": sum(d["booked"] for d in data), "datatype": "Currency", "currency": "PKR", "indicator": "Green"}]
	return columns, data, None, chart, summary
