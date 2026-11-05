"""Module 0 accounting — land owners as ERPNext Suppliers.

	Deal / new owner line approved -> Purchase Invoice per owner (non-stock "Land" item):
	                                  Dr Land Under Acquisition (CWIP, project cost center)   Cr Creditors - Land Owners
	Extension approved             -> Purchase Invoice for the extra amount (Dr extension account, configurable)
	Share reduced / owner cancelled-> Debit Note (Purchase Invoice return) for the difference
	Seller payment (RE Land Payment)-> Payment Entry (Pay) against the owner's invoices; token paid before the invoice is an
	                                  unallocated advance; withholding tax deducted to the tax payable account
	Refund from a cancelled owner  -> Payment Entry (Receive) against the debit note
	Plot adjustment                -> RE Payment "Land Deal Adjustment": Journal Entry Dr Creditors - Land Owners (Supplier)
	                                  Cr Debtors (Customer, against the booking's Sales Invoice)
	All land registered and paid   -> Journal Entry: Dr project land cost   Cr Land Under Acquisition

Every voucher carries re_land_deal / re_land_ser, and the deal's Paid, Adjusted and Balance are read back from them, so the
deal, the Land Purchase Status report, the supplier ledger and the AP aging always agree.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from realestate import erp
from realestate import land_calc as L

LAND_ITEM = "RE-LAND"
ADJUSTMENT_MODE = "Land Deal Adjustment"


# ---------------------------------------------------------------- setup
def custom_fields():
	tag = lambda after: [  # noqa: E731
		{"fieldname": "re_land_deal", "fieldtype": "Link", "options": "RE Land Deal", "label": "Land Deal", "insert_after": after, "read_only": 1,
		 "in_standard_filter": 1},
		{"fieldname": "re_land_ser", "fieldtype": "Int", "label": "Land Deal Owner Ser#", "insert_after": "re_land_deal", "read_only": 1},
	]
	return {
		"Purchase Invoice": tag("supplier_name"),
		"Payment Entry": [*tag("party_name"),
						  {"fieldname": "re_land_payment", "fieldtype": "Link", "options": "RE Land Payment", "label": "Land Payment", "insert_after": "re_land_ser", "read_only": 1}],
		"Journal Entry": tag("voucher_type"),
	}


def setup(company: str | None = None):
	"""Accounts, the Land item, Pay Order / Land Deal Adjustment payment modes and the RE Settings defaults (idempotent)."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields(custom_fields(), ignore_validate=True)
	company = company or frappe.db.get_single_value("RE Settings", "company") or frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		return
	cwip = erp._account(company, "Land Under Acquisition", "Fixed Assets", "Capital Work in Progress")
	creditors = erp._account(company, "Creditors - Land Owners", "Accounts Payable", "Payable")
	tax_parent = "Duties and Taxes" if frappe.db.exists("Account", erp.acc(company, "Duties and Taxes")) else "Current Liabilities"
	wht = erp._account(company, "Withholding Tax Payable - Land", tax_parent, "Tax")
	land_cost = erp.acc(company, "Land Cost") if frappe.db.exists("Account", erp.acc(company, "Land Cost")) else erp._account(company, "Land Cost", "Direct Expenses", "Expense Account")
	if not frappe.db.exists("Item", LAND_ITEM):
		group = "Real Estate" if frappe.db.exists("Item Group", "Real Estate") else frappe.db.get_value("Item Group", {"is_group": 0}, "name")
		frappe.get_doc({"doctype": "Item", "item_code": LAND_ITEM, "item_name": "Land (khasra purchase)", "item_group": group, "stock_uom": "Nos",
						"is_stock_item": 0, "is_purchase_item": 1, "is_sales_item": 0, "include_item_in_manufacturing": 0,
						"description": "Land bought from land owners (no stock; capitalised to Land Under Acquisition)",
						"item_defaults": [{"company": company, "expense_account": cwip}]}).insert(ignore_permissions=True)
	from realestate import land

	group = land.ensure_supplier_group()
	sg = frappe.get_doc("Supplier Group", group)
	if not any(a.company == company for a in sg.accounts):
		sg.append("accounts", {"company": company, "account": creditors})
		sg.save(ignore_permissions=True)
	bank = frappe.db.get_value("Mode of Payment Account", {"parent": "Bank Transfer", "company": company}, "default_account")
	for mode, kind, account in (("Pay Order", "Bank", bank), (ADJUSTMENT_MODE, "General", None)):
		if not frappe.db.exists("Mode of Payment", mode):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": kind, "enabled": 1,
							"accounts": [{"company": company, "default_account": account}] if account else []}).insert(ignore_permissions=True)
	defaults = {"land_cwip_account": cwip, "land_creditors_account": creditors, "land_extension_account": cwip, "land_cost_account": land_cost,
				"land_wht_account": wht, "land_item": LAND_ITEM}
	for field, value in defaults.items():
		if not frappe.db.get_single_value("RE Settings", field):
			frappe.db.set_single_value("RE Settings", field, value)


def settings():
	s = frappe.get_cached_doc("RE Settings")
	missing = [f for f in ("land_cwip_account", "land_creditors_account", "land_item") if not s.get(f)]
	if missing:
		frappe.throw(_("Set up land accounting first (RE Settings → Land): {0}").format(", ".join(missing)))
	return s


def company_of(deal) -> str:
	return deal.buyer_company or frappe.db.get_single_value("RE Settings", "company") or frappe.db.get_single_value("Global Defaults", "default_company")


def project_of(company: str) -> tuple[str | None, str]:
	"""(ERPNext Project for land, cost center): the 'Land & Legal' development cost head when it exists."""
	project = frappe.db.get_value("Project", {"re_cost_head": "Land & Legal", "company": company}, ["name", "cost_center"], as_dict=True) or \
		frappe.db.get_value("Project", {"project_name": ("like", "%Land & Legal%"), "company": company}, ["name", "cost_center"], as_dict=True)
	cc = (project and project.cost_center) or frappe.get_cached_value("Company", company, "cost_center")
	return (project.name if project else None), cc


def _submit(doc):
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return doc


# ---------------------------------------------------------------- invoices
def purchase_invoice(deal, line, amount: float, account: str, description: str, due_date=None, posting_date=None, is_return=0, return_against=None):
	s = settings()
	company = company_of(deal)
	project, cc = project_of(company)
	posting = getdate(posting_date or frappe.flags.get("land_posting_date") or nowdate())  # the demo backdates its history
	pi = frappe.get_doc({
		"doctype": "Purchase Invoice", "supplier": line.supplier, "company": company, "posting_date": posting, "set_posting_time": 1,
		"bill_no": f"{deal.name}/{line.ser}{'-R' if is_return else ''}", "bill_date": posting,
		"due_date": max(getdate(due_date), posting) if due_date else posting,
		"credit_to": s.land_creditors_account, "cost_center": cc, "project": project, "re_project": deal.project,
		"re_land_deal": deal.name, "re_land_ser": line.ser, "is_return": is_return, "return_against": return_against,
		"remarks": description, "update_stock": 0,
		"items": [{"item_code": s.land_item, "qty": -1 if is_return else 1, "rate": flt(amount), "description": description,
				   "expense_account": account, "cost_center": cc, "project": project}],
	})
	return _submit(pi).name


def post_line(deal, line):
	"""Purchase Invoice for an owner line's Due Amount (once)."""
	if line.purchase_invoice or line.status == "Cancelled" or flt(line.due_amount) <= 0:
		return None
	s = settings()
	area = f"{cint(line.kanal)}K-{flt(line.marla):g}M" + (f"-{flt(line.sqft):g}sqft" if flt(line.sqft) else "")
	name = purchase_invoice(deal, line, line.due_amount, s.land_cwip_account,
							_("Land deal {0} — {1}: {2} @ Rs {3} per {4}").format(deal.name, line.owner_name, area, frappe.utils.fmt_money(line.rate, 0), line.unit),
							due_date=line.mature_date)
	line.db_set("purchase_invoice", name)
	return name


def post_extension(deal, ext):
	if ext.purchase_invoice or ext.status != "Approved" or flt(ext.extra_amount) <= 0:
		return None
	s = settings()
	line = deal._line(ext.ser)
	name = purchase_invoice(deal, line, ext.extra_amount, s.land_extension_account or s.land_cwip_account,
							_("Land deal {0} — extension for {1} to {2}: {3}").format(deal.name, line.owner_name, frappe.utils.formatdate(ext.new_date), ext.reason),
							due_date=ext.new_date)
	ext.db_set("purchase_invoice", name)
	return name


def debit_note(deal, line, amount: float, reason: str):
	"""Purchase Invoice return reducing an owner's payable (share reduced, owner cancelled)."""
	if flt(amount) <= 0.5:
		return None
	s = settings()
	against = line.purchase_invoice or frappe.db.get_value("Purchase Invoice", {"re_land_deal": deal.name, "re_land_ser": line.ser, "docstatus": 1, "is_return": 0}, "name")
	return purchase_invoice(deal, line, amount, s.land_cwip_account, _("Land deal {0} — {1}: {2}").format(deal.name, line.owner_name, reason),
							is_return=1, return_against=against)


def post_deal(deal):
	"""On approval: an invoice per owner line and per approved extension that has none yet."""
	out = [post_line(deal, r) for r in deal.lines]
	out += [post_extension(deal, e) for e in deal.extensions]
	return [x for x in out if x]


# ---------------------------------------------------------------- ledger
def line_ledger(deal) -> dict[int, dict]:
	"""{ser: paid (cash + withholding tax settled), adjusted (plots), invoiced, refunded} from the vouchers tagged with this deal."""
	out: dict[int, dict] = {}
	if not deal.name or deal.is_new():
		return out

	def row(ser):
		return out.setdefault(cint(ser), {"paid": 0.0, "adjusted": 0.0, "invoiced": 0.0, "refunded": 0.0})

	creditors = frappe.db.get_single_value("RE Settings", "land_creditors_account")
	# the owner's side of each Payment Entry, from the GL: payments debit Creditors - Land Owners by cash + tax withheld,
	# refunds received from a cancelled owner credit it
	for pe in frappe.db.sql("""select pe.re_land_ser ser, sum(g.debit) paid, sum(g.credit) refunded from `tabPayment Entry` pe
			join `tabGL Entry` g on g.voucher_type='Payment Entry' and g.voucher_no=pe.name and g.is_cancelled=0
			where pe.re_land_deal=%s and pe.docstatus=1 and g.account=%s and g.party_type='Supplier' group by pe.re_land_ser""",
			(deal.name, creditors), as_dict=True):
		r = row(pe.ser)
		r["paid"] += flt(pe.paid)
		r["refunded"] += flt(pe.refunded)
	for je in frappe.db.sql("""select je.re_land_ser ser, sum(a.debit - a.credit) amount from `tabJournal Entry` je
			join `tabJournal Entry Account` a on a.parent=je.name where je.re_land_deal=%s and je.docstatus=1 and a.account=%s
			and a.party_type='Supplier' group by je.re_land_ser""", (deal.name, creditors), as_dict=True):
		row(je.ser)["adjusted"] += flt(je.amount)
	for pi in frappe.get_all("Purchase Invoice", {"re_land_deal": deal.name, "docstatus": 1}, ["re_land_ser", "grand_total"]):
		row(pi.re_land_ser)["invoiced"] += flt(pi.grand_total)
	for r in out.values():
		r["paid"] = round(r["paid"] - r["refunded"], 2)
	return out


def owner_balance(supplier: str, company: str | None = None) -> float:
	"""The owner's payable per the GL (credit - debit on Creditors - Land Owners)."""
	creditors = frappe.db.get_single_value("RE Settings", "land_creditors_account")
	return flt(frappe.db.sql("""select sum(credit - debit) from `tabGL Entry` where party_type='Supplier' and party=%s and account=%s
		and is_cancelled=0""", (supplier, creditors))[0][0])


@frappe.whitelist(methods=["GET"])
def reconciliation() -> dict:
	"""The deals' balances vs the Creditors - Land Owners balance in the GL. A deal with purchase invoices contributes its
	Balance; a deal not yet invoiced contributes only the advances paid on it (token before approval)."""
	from realestate import land

	land.guard()
	creditors = frappe.db.get_single_value("RE Settings", "land_creditors_account")
	gl = round(flt(frappe.db.sql("select sum(credit - debit) from `tabGL Entry` where account=%s and is_cancelled=0", creditors)[0][0]), 2)
	invoiced = set(frappe.get_all("Purchase Invoice", {"re_land_deal": ("is", "set"), "docstatus": 1}, pluck="re_land_deal"))
	rows, expected = [], 0.0
	for d in frappe.get_all("RE Land Deal", {"status": ("!=", "Cancelled")}, ["name", "balance_amount", "paid_amount", "adjusted_amount"]):
		part = flt(d.balance_amount) if d.name in invoiced else -(flt(d.paid_amount) + flt(d.adjusted_amount))
		if part:
			rows.append({"deal": d.name, "amount": round(part, 2), "invoiced": d.name in invoiced})
		expected += part
	expected = round(expected, 2)
	return {"creditors_account": creditors, "gl_balance": gl, "deal_balances": expected, "difference": round(gl - expected, 2),
			"matches": abs(gl - expected) <= 1, "deals": rows}


# ---------------------------------------------------------------- payments
def payment_entry(payment) -> str:
	"""Payment Entry for an RE Land Payment: Pay to the owner (allocated to their open invoices for that line, oldest first;
	the rest stays as an advance), or Receive a refund from a cancelled owner."""
	s = settings()
	deal = frappe.get_doc("RE Land Deal", payment.deal)
	company = company_of(deal)
	project, cc = project_of(company)
	bank = frappe.db.get_value("Mode of Payment Account", {"parent": payment.mode_of_payment, "company": company}, "default_account")
	if not bank:
		frappe.throw(_("Mode of payment {0} has no account for {1}").format(payment.mode_of_payment, company))
	refund = payment.payment_kind == "Refund Received"
	gross, wht = flt(payment.amount), flt(payment.wht_amount)
	pe = frappe.new_doc("Payment Entry")
	pe.update({
		"payment_type": "Receive" if refund else "Pay", "company": company, "posting_date": payment.posting_date, "mode_of_payment": payment.mode_of_payment,
		"party_type": "Supplier", "party": payment.supplier,
		"paid_from": s.land_creditors_account if refund else bank, "paid_to": bank if refund else s.land_creditors_account,
		"paid_amount": gross if refund else gross - wht, "received_amount": gross,
		"source_exchange_rate": 1, "target_exchange_rate": 1,
		"reference_no": payment.instrument_no or payment.name, "reference_date": payment.instrument_date or payment.posting_date,
		"cost_center": cc, "project": project,
		"remarks": _("{0} {1} — land deal {2}, {3}").format(payment.payment_kind, payment.name, deal.name, payment.owner_name),
		"re_land_deal": deal.name, "re_land_ser": payment.ser, "re_land_payment": payment.name,
	})
	if wht and not refund:
		pe.append("deductions", {"account": s.land_wht_account, "cost_center": cc, "amount": -wht,
								 "description": _("Withholding tax on land payment {0}").format(payment.name)})
	left = gross
	invoices = frappe.get_all("Purchase Invoice", {"re_land_deal": deal.name, "re_land_ser": payment.ser, "docstatus": 1,
												   "outstanding_amount": ("<", -0.5) if refund else (">", 0.5)},
							  ["name", "outstanding_amount", "grand_total", "due_date"], order_by="due_date asc, posting_date asc")
	for inv in invoices:
		if left <= 0.5:
			break
		take = min(left, abs(flt(inv.outstanding_amount)))
		pe.append("references", {"reference_doctype": "Purchase Invoice", "reference_name": inv.name, "total_amount": inv.grand_total,
								 "outstanding_amount": inv.outstanding_amount, "allocated_amount": -take if refund else take, "due_date": inv.due_date})
		left = round(left - take, 2)
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.paid_amount, pe.received_amount = (gross, gross) if refund else (gross - wht, gross)
	pe.set_amounts()
	return _submit(pe).name


# ---------------------------------------------------------------- plot adjustment
def adjustment_journal(receipt, adjustment) -> str:
	"""Journal Entry netting the owner's payable against the plot's Sales Invoice: no cash moves."""
	s = settings()
	si = frappe.db.get_value("RE Booking", receipt.booking, "sales_invoice")
	inv = frappe.db.get_value("Sales Invoice", si, ["company", "debit_to", "customer", "cost_center"], as_dict=True)
	project, cc = project_of(inv.company)
	amount = flt(receipt.amount)
	je = frappe.get_doc({
		"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": inv.company, "posting_date": receipt.posting_date,
		"user_remark": _("Plot {0} adjusted against land deal {1} ({2})").format(receipt.plot, adjustment.deal, adjustment.owner_name),
		"re_land_deal": adjustment.deal, "re_land_ser": adjustment.ser, "cheque_no": adjustment.name, "cheque_date": receipt.posting_date,
		"accounts": [
			{"account": s.land_creditors_account, "party_type": "Supplier", "party": adjustment.supplier, "debit_in_account_currency": amount,
			 "cost_center": cc, "project": project},
			{"account": inv.debit_to, "party_type": "Customer", "party": inv.customer, "credit_in_account_currency": amount,
			 "reference_type": "Sales Invoice", "reference_name": si, "cost_center": inv.cost_center or cc},
		],
	})
	return _submit(je).name


# ---------------------------------------------------------------- capitalisation
def capitalise(deal) -> str:
	"""Move the deal's land cost from Land Under Acquisition to the project's land cost (approved by Admin / Accounts)."""
	s = settings()
	if deal.get("capitalisation_entry"):
		frappe.throw(_("Already capitalised in {0}").format(deal.capitalisation_entry))
	if deal.status not in ("Completed", "Closed"):
		frappe.throw(_("Only a completed deal (executed, every owner registered) is capitalised — this one is {0}").format(deal.status))
	open_lines = [r.owner_name for r in deal.active() if r.status not in ("Registry Done", "Mutation Done") or flt(r.balance) > 0.5]
	if open_lines:
		frappe.throw(_("Capitalise once every owner is registered and paid; still open: {0}").format(", ".join(open_lines)))
	company = company_of(deal)
	project, cc = project_of(company)
	cost = flt(frappe.db.sql("""select sum(i.base_net_amount) from `tabPurchase Invoice Item` i join `tabPurchase Invoice` p on p.name=i.parent
		where p.re_land_deal=%s and p.docstatus=1 and i.expense_account=%s""", (deal.name, s.land_cwip_account))[0][0])
	if cost <= 0.5:
		frappe.throw(_("Nothing is held in {0} for this deal").format(s.land_cwip_account))
	je = frappe.get_doc({
		"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": nowdate(),
		"user_remark": _("Land deal {0} registered and paid — capitalised to project land cost").format(deal.name), "re_land_deal": deal.name,
		"accounts": [{"account": s.land_cost_account, "debit_in_account_currency": cost, "cost_center": cc, "project": project},
					 {"account": s.land_cwip_account, "credit_in_account_currency": cost, "cost_center": cc, "project": project}],
	})
	return _submit(je).name


# ---------------------------------------------------------------- transfer costs (stamp duty, registration, 236K, fees…)
PAYEES = {  # default payee per head (created on first use); the broker row uses the deal's broker
	"Stamp Duty": "Punjab Revenue Department (Stamp Duty)", "Registration Fee": "Sub-Registrar Office", "Mutation Fee": "Revenue Department (Mutation)",
	"CVT": "Punjab Excise & Taxation (CVT)", "Advance Tax 236K": "Federal Board of Revenue (236K)", "Withholding Tax": "Federal Board of Revenue",
	"TMA / District Council Fee": "District Council / TMA", "Patwari Fee": "Patwari / Revenue Staff", "Legal Fee": "Legal Counsel (Land)",
}


def _payee(head: str, deal) -> str | None:
	if head == "Broker Commission":
		return deal.broker
	name = PAYEES.get(head)
	if not name:
		return None
	if not frappe.db.exists("Supplier", name):
		group = frappe.db.get_value("Supplier Group", {"name": ("in", ["Services", "Local", "All Supplier Groups"])}, "name") or \
			frappe.db.get_value("Supplier Group", {}, "name")
		frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": group, "supplier_type": "Company", "country": "Pakistan"}).insert(ignore_permissions=True)
	return name


def estimate_transfer_costs(deal) -> int:
	province = frappe.db.get_single_value("RE Settings", "land_province") or "Punjab"
	years = frappe.get_all("RE Transfer Cost Rate", {"province": province, "enabled": 1}, pluck="fiscal_year", order_by="fiscal_year desc", limit=1)
	if not years:
		frappe.throw(_("Add RE Transfer Cost Rate rows for {0} first").format(province))
	have = {c.cost_head for c in deal.costs}
	kanal = L.in_unit(flt(deal.deal_area_sqft), "Kanal", frappe.db.get_single_value("RE Settings", "land_marla_sqft") or 272)
	added = 0
	for r in frappe.get_all("RE Transfer Cost Rate", {"province": province, "enabled": 1, "fiscal_year": years[0]}, ["cost_head", "basis", "rate"]):
		if r.cost_head in have or (r.cost_head == "Broker Commission" and not deal.broker):
			continue
		value = flt(deal.due_amount)
		amount = value * flt(r.rate) / 100 if r.basis == "% of value" else flt(r.rate) * kanal if r.basis == "Per Kanal" else flt(r.rate)
		if r.cost_head == "Broker Commission" and flt(deal.commission_pct):
			amount = flt(deal.commission_amount)
		deal.append("costs", {"cost_head": r.cost_head, "payee": _payee(r.cost_head, deal), "amount": round(amount),
							  "basis": f"{r.rate:g}% of value" if r.basis == "% of value" else f"Rs {r.rate:,.0f} per Kanal" if r.basis == "Per Kanal" else "Fixed",
							  "remarks": f"{province} {years[0]}"})
		added += 1
	return added


def post_transfer_costs(deal) -> list[str]:
	s = settings()
	company = company_of(deal)
	project, cc = project_of(company)
	payable = frappe.get_cached_value("Company", company, "default_payable_account")
	out = []
	for c in deal.costs:
		if c.purchase_invoice or flt(c.amount) <= 0 or not c.payee:
			continue
		posting = getdate(frappe.flags.get("land_posting_date") or nowdate())
		pi = frappe.get_doc({
			"doctype": "Purchase Invoice", "supplier": c.payee, "company": company, "posting_date": posting, "set_posting_time": 1, "due_date": posting,
			"bill_no": f"{deal.name}/{c.cost_head}"[:140], "bill_date": posting, "credit_to": payable, "cost_center": cc, "project": project,
			"re_project": deal.project, "re_land_deal": deal.name, "re_land_ser": 0, "update_stock": 0,
			"remarks": _("{0} — land deal {1}").format(c.cost_head, deal.name),
			"items": [{"item_code": s.land_item, "qty": 1, "rate": flt(c.amount), "description": _("{0} — land deal {1} ({2})").format(c.cost_head, deal.name, c.basis or ""),
					   "expense_account": s.land_cwip_account, "cost_center": cc, "project": project}],
		})
		name = _submit(pi).name
		c.db_set("purchase_invoice", name)
		out.append(name)
	return out
