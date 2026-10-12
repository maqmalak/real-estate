"""Per development head (ERPNext Project): budget (Budget), committed (open POs), actual (GL), paid and payable (Purchase Invoices)."""

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	rng = [filters.get("from_date") or "2000-01-01", filters.get("to_date") or "2100-01-01"]
	projects = frappe.get_all("Project", {"re_cost_head": ("is", "set")}, ["name", "re_cost_head", "re_expense_account"], order_by="name")
	data = []
	for p in projects:
		budget = flt(frappe.db.sql("select sum(budget_amount) from `tabBudget` where project=%s and docstatus=1", p.name)[0][0])
		actual = flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry` where project=%s and is_cancelled=0 and posting_date between %s and %s
			and account in (select name from `tabAccount` where root_type='Expense')""", (p.name, *rng))[0][0])
		committed = flt(frappe.db.sql("""select sum(base_net_total * (100 - per_billed) / 100) from `tabPurchase Order`
			where project=%s and docstatus=1 and status not in ('Closed', 'Completed')""", p.name)[0][0])
		billed, outstanding = frappe.db.sql("""select sum(base_grand_total), sum(outstanding_amount) from `tabPurchase Invoice`
			where project=%s and docstatus=1 and posting_date between %s and %s""", (p.name, *rng))[0]
		billed, outstanding = flt(billed), flt(outstanding)
		consumed = flt(frappe.db.get_value("Project", p.name, "total_consumed_material_cost"))
		data.append({
			"project": p.name, "head": p.re_cost_head, "budget": budget, "actual": actual, "consumed": consumed, "committed": committed,
			"paid": billed - outstanding, "payable": outstanding, "variance": budget - actual - committed if budget else None,
			"used_pct": round((actual + committed) * 100 / budget, 1) if budget else None,
		})
	cur = {"fieldtype": "Currency", "options": "PKR", "width": 130}
	columns = [{"fieldname": "head", "label": _("Cost Head"), "fieldtype": "Data", "width": 190},
			   {"fieldname": "project", "label": _("Project"), "fieldtype": "Link", "options": "Project", "width": 160},
			   {"fieldname": "budget", "label": _("Budget"), **cur}, {"fieldname": "actual", "label": _("Actual (GL)"), **cur},
			   {"fieldname": "consumed", "label": _("Material Consumed"), **cur}, {"fieldname": "committed", "label": _("Committed (open POs)"), **cur},
			   {"fieldname": "paid", "label": _("Paid"), **cur}, {"fieldname": "payable", "label": _("Payable"), **cur},
			   {"fieldname": "variance", "label": _("Remaining Budget"), **cur}, {"fieldname": "used_pct", "label": _("Used %"), "fieldtype": "Percent", "width": 90}]
	chart = {"data": {"labels": [d["head"] for d in data], "datasets": [{"name": _("Budget"), "values": [d["budget"] for d in data]},
																		 {"name": _("Actual"), "values": [d["actual"] for d in data]}]},
			 "type": "bar", "colors": ["#94a3b8", "#0f766e"]}
	tb, ta = sum(d["budget"] for d in data), sum(d["actual"] for d in data)
	summary = [{"label": _("Budget"), "value": tb, "datatype": "Currency", "currency": "PKR", "indicator": "Blue"},
			   {"label": _("Actual"), "value": ta, "datatype": "Currency", "currency": "PKR", "indicator": "Green" if ta <= tb else "Red"},
			   {"label": _("Payable to Suppliers"), "value": sum(d["payable"] for d in data), "datatype": "Currency", "currency": "PKR", "indicator": "Orange"}]
	return columns, data, None, chart, summary
