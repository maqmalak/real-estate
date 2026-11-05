"""Module 0 reports. Each standard script report (realestate/re_land/report/<name>/) calls one function here, so the desk,
the React report centre (realestate.exports) and the PDF / Excel exports all run the same code.

	Land Purchase Status        the client's layout: a section per deal, its owner lines, deal subtotals, grand total
	Land Owner Ledger           an owner's statement from Creditors - Land Owners (all owners summarised without one)
	Land Payables Aging         owner balances by days past the mature / extended date
	Seller Payments Due         schedule rows overdue or due within a week / month / quarter
	Seller Payment Schedule     every seller's schedule with paid, status and days late
	Payments by Seller          payments, withholding tax and modes per owner
	Land Owners Trial Balance   opening, invoiced, paid, adjusted, closing per owner + the account check
	Plots Adjusted Against Land plots given to owners instead of cash
	Land Cost Cash vs Plots     per deal: settled in cash, settled with plots, still payable
	Land Acquisition by Stage   khasras and Kanal per pipeline stage against the target
	Land Cost per Kanal         cost per Kanal / marla by khasra
	Transfer Cost Summary       stamp duty, registration, mutation, CVT, 236K… estimated from the rate table
	Pending Registry and Mutation  owners not yet registered, with the registry deadline
	Litigation Register         court cases with khasras, area and the next hearing
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, getdate, nowdate

from realestate import land
from realestate import land_calc as L

CUR = {"fieldtype": "Currency", "options": "PKR", "width": 120}
ACQUIRED = ("Registry / Mutation Done", "Possession Taken", "Acquired")
OPEN_CASES = ("Pending", "Under Hearing", "Stay Order")


def _col(fieldname, label, fieldtype="Data", width=110, **kw):
	return {"fieldname": fieldname, "label": _(label), "fieldtype": fieldtype, "width": width, **kw}


def _money(fieldname, label, width=120):
	return {"fieldname": fieldname, "label": _(label), **CUR, "width": width}


def _kanal(sqft):
	return round(L.in_unit(flt(sqft), "Kanal", land.marla_sqft()), 3)


def _deal_filters(f, alias="d"):
	cond, args = [f"{alias}.status != 'Cancelled'"], {}
	if f.get("from_date"):
		cond.append(f"{alias}.deal_date >= %(from_date)s")
		args["from_date"] = f["from_date"]
	if f.get("to_date"):
		cond.append(f"{alias}.deal_date <= %(to_date)s")
		args["to_date"] = f["to_date"]
	if f.get("land_for"):
		cond.append(f"{alias}.land_for like %(land_for)s")
		args["land_for"] = f"%{f['land_for']}%"
	if f.get("owners_type"):
		cond.append(f"{alias}.land_owners_type = %(owners_type)s")
		args["owners_type"] = f["owners_type"]
	if f.get("deal_status"):
		cond.append(f"{alias}.status = %(deal_status)s")
		args["deal_status"] = f["deal_status"]
	return " and ".join(cond), args


# ---------------------------------------------------------------- Land Purchase Status
def land_purchase_status(filters):
	f = filters or {}
	ms = land.marla_sqft()
	cond, args = _deal_filters(f)
	deals = frappe.db.sql(f"""select name, deal_date, description, land_for, land_owners_type, khewat_no, khatooni_no, square_no, killa_nos, status,
		total_kanal, total_marla, total_sqft, deal_area_sqft, deal_area_display from `tabRE Land Deal` d where {cond} order by deal_date, name""", args, as_dict=True)
	lines = {}
	for l in frappe.get_all("RE Land Deal Line", {"parent": ("in", [d.name for d in deals] or [""]), "parenttype": "RE Land Deal"},
							["parent", "ser", "owner_name", "group_members", "line_type", "kanal", "marla", "sqft", "area_sqft", "unit", "total_area", "rate",
							 "due_amount", "mature_date", "extra_amount", "date_ext", "net_due", "paid_amount", "adjusted_amount", "balance", "status", "overdue"],
							order_by="parent, ser", limit=0):
		lines.setdefault(l.parent, []).append(l)
	data, grand = [], {k: 0.0 for k in ("kanal", "marla", "sqft", "due", "extra", "net_due", "paid", "adjusted", "balance", "area_sqft")}
	sr = 0
	for d in deals:
		rows = [l for l in lines.get(d.name, []) if l.status != "Cancelled" or flt(l.balance)]
		if f.get("balance_only"):
			rows = [l for l in rows if flt(l.balance) > 0.5]
		if f.get("matured_unpaid"):
			rows = [l for l in rows if l.overdue]
		if not rows:
			continue
		sr += 1
		data.append({"sr": sr, "deal": d.name, "deal_date": d.deal_date, "description": d.description, "land_for": d.land_for, "owners": d.land_owners_type,
					 "khewat": d.khewat_no, "khatooni": d.khatooni_no, "square": d.square_no, "killa": d.killa_nos, "status": d.status, "indent": 0, "row_type": "deal"})
		sub = {k: 0.0 for k in grand}
		for l in rows:
			members = [m.strip() for m in (l.group_members or "").splitlines() if m.strip()]
			name = f"{l.ser}. {l.owner_name}" + (f" ({', '.join(members[1:])})" if len(members) > 1 else "") + ("" if l.line_type == "Owner" else f" [{l.line_type}]")
			data.append({"description": name, "kanal": cint(l.kanal), "marla": flt(l.marla), "sqft": flt(l.sqft),
						 "total_area": f"{flt(l.total_area):g} {l.unit}", "unit": l.unit.upper(), "rate": l.rate, "due": l.due_amount, "mature_date": l.mature_date,
						 "extra": l.extra_amount, "date_ext": l.date_ext, "net_due": l.net_due, "paid": l.paid_amount, "adjusted": l.adjusted_amount, "balance": l.balance,
						 "status": "Overdue" if l.overdue else l.status, "indent": 1, "row_type": "line", "deal": d.name})
			if l.status != "Cancelled":
				for k, v in (("kanal", cint(l.kanal)), ("marla", flt(l.marla)), ("sqft", flt(l.sqft)), ("area_sqft", flt(l.area_sqft)), ("due", l.due_amount),
							 ("extra", l.extra_amount), ("net_due", l.net_due)):
					sub[k] += flt(v)
			for k, v in (("paid", l.paid_amount), ("adjusted", l.adjusted_amount), ("balance", l.balance)):
				sub[k] += flt(v)
		total_area = L.to_sqft(sub["kanal"], sub["marla"], sub["sqft"], ms=ms)
		data.append({"description": _("Deal subtotal · total deal area {0}").format(L.fmt_area(total_area, ms)), "kanal": sub["kanal"], "marla": sub["marla"],
					 "sqft": sub["sqft"], "total_area": L.fmt_area(total_area, ms), "due": sub["due"], "extra": sub["extra"], "net_due": sub["net_due"],
					 "paid": sub["paid"], "adjusted": sub["adjusted"], "balance": sub["balance"], "indent": 1, "row_type": "subtotal", "bold": 1, "deal": d.name})
		for k in grand:
			grand[k] += sub[k]
	if data:
		gt = L.to_sqft(grand["kanal"], grand["marla"], grand["sqft"], ms=ms)
		data.append({"description": _("Grand total · {0} deals · {1}").format(sr, L.fmt_area(gt, ms)), "kanal": grand["kanal"], "marla": grand["marla"],
					 "sqft": grand["sqft"], "total_area": L.fmt_area(gt, ms), "due": grand["due"], "extra": grand["extra"], "net_due": grand["net_due"],
					 "paid": grand["paid"], "adjusted": grand["adjusted"], "balance": grand["balance"], "indent": 0, "row_type": "total", "bold": 1})
	columns = [
		_col("sr", "Sr", "Int", 45), _col("deal", "Deal No", "Link", 95, options="RE Land Deal"), _col("deal_date", "Deal Date", "Date", 95),
		_col("description", "Deal Desc / Owner", "Data", 300), _col("land_for", "Land For", "Data", 110), _col("owners", "Land Owners", "Data", 80),
		_col("khewat", "Khewat", "Data", 80), _col("khatooni", "Khatooni", "Data", 75), _col("square", "Square", "Data", 65), _col("killa", "Killa", "Data", 90),
		_col("kanal", "Kanals", "Float", 65), _col("marla", "Marlas", "Float", 65), _col("sqft", "Sqft", "Float", 65), _col("total_area", "Total Area", "Data", 110),
		_col("unit", "Unit", "Data", 60), _money("rate", "Rate", 110), _money("due", "Due Amount"), _col("mature_date", "Mature Date", "Date", 95),
		_money("extra", "Extra Amount", 105), _col("date_ext", "Date Ext", "Date", 95), _money("net_due", "Net Due Amount", 125), _money("paid", "Paid Amount"),
		_money("adjusted", "Adjusted (Plots)", 115), _money("balance", "Balance Amount", 125), _col("status", "Status", "Data", 105),
	]
	summary = [{"label": _("Deals"), "value": sr, "datatype": "Int"},
			   {"label": _("Deal area"), "value": L.fmt_area(L.to_sqft(grand["kanal"], grand["marla"], grand["sqft"], ms=ms), ms), "datatype": "Data"},
			   {"label": _("Net due"), "value": grand["net_due"], "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Paid"), "value": grand["paid"], "datatype": "Currency", "currency": "PKR", "indicator": "Green"},
			   {"label": _("Adjusted (plots)"), "value": grand["adjusted"], "datatype": "Currency", "currency": "PKR", "indicator": "Blue"},
			   {"label": _("Balance"), "value": grand["balance"], "datatype": "Currency", "currency": "PKR", "indicator": "Red" if grand["balance"] > 0.5 else "Green"}]
	chart = {"data": {"labels": [_("Paid (cash)"), _("Adjusted (plots)"), _("Balance")], "datasets": [{"name": _("Land cost"), "values": [grand["paid"], grand["adjusted"], max(grand["balance"], 0)]}]},
			 "type": "donut", "colors": ["#16a34a", "#8b5cf6", "#f59e0b"]}
	return columns, data, None, chart, summary


# ---------------------------------------------------------------- ledgers
def _creditors():
	return frappe.db.get_single_value("RE Settings", "land_creditors_account")


def _owner_supplier(f):
	if f.get("land_owner"):
		return frappe.db.get_value("RE Land Owner", f["land_owner"], "supplier")
	return None


def land_owner_ledger(filters):
	f = filters or {}
	acc = _creditors()
	supplier = _owner_supplier(f)
	if not supplier:  # every owner summarised
		cols, rows, *_rest = land_owners_trial_balance(f)
		return cols, rows, _("Choose a land owner for their full statement; all owners are summarised below."), None, None
	frm, to = f.get("from_date"), f.get("to_date") or nowdate()
	opening = flt(frappe.db.sql("""select sum(credit - debit) from `tabGL Entry` where account=%s and party_type='Supplier' and party=%s and is_cancelled=0
		{0}""".format("and posting_date < %s" if frm else "and 1=0"), (acc, supplier, frm) if frm else (acc, supplier))[0][0])
	entries = frappe.db.sql("""select posting_date, voucher_type, voucher_no, debit, credit, remarks from `tabGL Entry` where account=%s and party_type='Supplier'
		and party=%s and is_cancelled=0 and posting_date <= %s {0} order by posting_date, creation""".format("and posting_date >= %s" if frm else ""),
							(acc, supplier, to, frm) if frm else (acc, supplier, to), as_dict=True)
	tags = {}
	for dt in ("Purchase Invoice", "Payment Entry", "Journal Entry"):
		for v in frappe.get_all(dt, {"name": ("in", [e.voucher_no for e in entries if e.voucher_type == dt] or [""])}, ["name", "re_land_deal", "re_land_ser"]):
			tags[v.name] = v
	bal = opening
	data = [{"posting_date": frm, "description": _("Opening balance"), "balance": opening, "bold": 1}] if frm else []
	for e in entries:
		bal += flt(e.credit) - flt(e.debit)
		t = tags.get(e.voucher_no) or {}
		kind = {"Purchase Invoice": _("Invoice") if flt(e.credit) else _("Debit note"), "Payment Entry": _("Payment") if flt(e.debit) else _("Refund received"),
				"Journal Entry": _("Plot adjustment")}.get(e.voucher_type, e.voucher_type)
		data.append({"posting_date": e.posting_date, "voucher_type": e.voucher_type, "voucher_no": e.voucher_no, "deal": t.get("re_land_deal"), "kind": kind,
					 "description": (e.remarks or "")[:160], "payable": e.credit, "paid": e.debit, "balance": bal})
	data.append({"description": _("Closing balance"), "balance": bal, "bold": 1})
	columns = [_col("posting_date", "Date", "Date", 95), _col("kind", "Entry", "Data", 110), _col("voucher_type", "Voucher type", "Data", 120),
			   _col("voucher_no", "Voucher", "Dynamic Link", 150, options="voucher_type"), _col("deal", "Deal", "Link", 95, options="RE Land Deal"),
			   _col("description", "Details", "Data", 320), _money("payable", "Payable (Cr)"), _money("paid", "Paid / adjusted (Dr)"), _money("balance", "Balance", 130)]
	owner = frappe.db.get_value("RE Land Owner", f["land_owner"], ["display_name", "cnic"], as_dict=True)
	summary = [{"label": _("Owner"), "value": owner.display_name, "datatype": "Data"}, {"label": _("CNIC"), "value": owner.cnic or "—", "datatype": "Data"},
			   {"label": _("Closing balance"), "value": bal, "datatype": "Currency", "currency": "PKR", "indicator": "Red" if bal > 0.5 else "Green"}]
	return columns, data, None, None, summary


def land_owners_trial_balance(filters):
	f = filters or {}
	acc = _creditors()
	frm, to = f.get("from_date") or "1900-01-01", f.get("to_date") or nowdate()
	owners = {o.supplier: o for o in frappe.get_all("RE Land Owner", {"supplier": ("is", "set")}, ["name", "display_name", "supplier", "cnic"], limit=0)}
	rows = frappe.db.sql("""select party, sum(if(posting_date < %(frm)s, credit - debit, 0)) opening,
		sum(if(posting_date >= %(frm)s and voucher_type='Purchase Invoice', credit - debit, 0)) invoiced,
		sum(if(posting_date >= %(frm)s and voucher_type='Payment Entry', debit - credit, 0)) paid,
		sum(if(posting_date >= %(frm)s and voucher_type='Journal Entry', debit - credit, 0)) adjusted,
		sum(credit - debit) closing
		from `tabGL Entry` where account=%(acc)s and party_type='Supplier' and is_cancelled=0 and posting_date <= %(to)s group by party""",
						 {"frm": frm, "to": to, "acc": acc}, as_dict=True)
	data = []
	for r in rows:
		o = owners.get(r.party) or {}
		data.append({"land_owner": o.get("name"), "owner_name": o.get("display_name") or r.party, "cnic": o.get("cnic"), "supplier": r.party,
					 "opening": r.opening, "invoiced": r.invoiced, "paid": r.paid, "adjusted": r.adjusted, "closing": r.closing})
	data.sort(key=lambda r: -flt(r["closing"]))
	gl = flt(frappe.db.sql("select sum(credit - debit) from `tabGL Entry` where account=%s and is_cancelled=0 and posting_date <= %s", (acc, to))[0][0])
	total = sum(flt(r["closing"]) for r in data)
	data.append({"owner_name": _("Total — {0}").format(acc), "opening": sum(flt(r["opening"]) for r in data), "invoiced": sum(flt(r["invoiced"]) for r in data),
				 "paid": sum(flt(r["paid"]) for r in data), "adjusted": sum(flt(r["adjusted"]) for r in data), "closing": total, "bold": 1})
	columns = [_col("land_owner", "Owner", "Link", 110, options="RE Land Owner"), _col("owner_name", "Name", "Data", 240), _col("cnic", "CNIC", "Data", 125),
			   _col("supplier", "Supplier", "Link", 160, options="Supplier"), _money("opening", "Opening"), _money("invoiced", "Invoiced (net)"),
			   _money("paid", "Paid (net of refunds)"), _money("adjusted", "Adjusted (plots)"), _money("closing", "Closing", 130)]
	ok = abs(gl - total) <= 1
	summary = [{"label": _("Owners"), "value": len(data) - 1, "datatype": "Int"},
			   {"label": _("Closing (owners)"), "value": total, "datatype": "Currency", "currency": "PKR"},
			   {"label": _("{0} (GL)").format(acc), "value": gl, "datatype": "Currency", "currency": "PKR", "indicator": "Green" if ok else "Red"}]
	return columns, data, None if ok else _("Owners' balances differ from the account by Rs {0}").format(frappe.utils.fmt_money(gl - total, 0)), None, summary


# ---------------------------------------------------------------- aging and schedules
def _open_lines(f):
	cond, args = _deal_filters(f)
	return frappe.db.sql(f"""select d.name deal, d.description, d.land_for, l.ser, l.land_owner, l.owner_name, l.net_due, l.paid_amount, l.adjusted_amount,
		l.balance, l.mature_date, l.date_ext, l.status from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent
		where {cond} and l.status != 'Cancelled' and l.balance > 0.5 order by d.name, l.ser""", args, as_dict=True)


def land_payables_aging(filters):
	f = filters or {}
	as_of = getdate(f.get("as_of") or nowdate())
	buckets = (("not_due", None), ("b0_30", 30), ("b31_90", 90), ("b91_180", 180), ("b180", 10**6))
	data = []
	for r in _open_lines(f):
		due = r.date_ext or r.mature_date
		row = {"deal": r.deal, "land_for": r.land_for, "ser": r.ser, "land_owner": r.land_owner, "owner_name": r.owner_name, "due_date": due, "net_due": r.net_due,
			   "paid": flt(r.paid_amount) + flt(r.adjusted_amount), "balance": r.balance, **{k: 0 for k, _d in buckets}}
		age = date_diff(as_of, due) if due else -1
		key = "not_due" if age <= 0 else next(k for k, limit in buckets[1:] if age <= limit)
		row[key] = r.balance
		row["days"] = max(age, 0)
		data.append(row)
	data.sort(key=lambda r: -r["days"])
	columns = [_col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("ser", "Ser", "Int", 45), _col("owner_name", "Owner", "Data", 230),
			   _col("land_for", "Land for", "Data", 100), _col("due_date", "Mature / ext. date", "Date", 115), _col("days", "Days late", "Int", 75),
			   _money("not_due", "Not due"), _money("b0_30", "0–30 days"), _money("b31_90", "31–90 days"), _money("b91_180", "91–180 days"),
			   _money("b180", "Over 180 days"), _money("balance", "Balance", 130)]
	keys = ("b0_30", "b31_90", "b91_180", "b180")
	chart = {"data": {"labels": ["Not due", "0–30", "31–90", "91–180", "180+"], "datasets": [{"name": _("Balance"), "values": [sum(flt(r[k]) for r in data) for k in ("not_due", *keys)]}]},
			 "type": "bar", "colors": ["#f59e0b"]}
	summary = [{"label": _("Not yet due"), "value": sum(flt(r["not_due"]) for r in data), "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Overdue"), "value": sum(flt(r[k]) for r in data for k in keys), "datatype": "Currency", "currency": "PKR", "indicator": "Red"}]
	return columns, data, None, chart, summary


def _schedule(f, until=None):
	cond, args = _deal_filters(f)
	if until:
		cond += " and s.due_date <= %(until)s"
		args["until"] = until
	return frappe.db.sql(f"""select d.name deal, d.description, s.ser, l.owner_name, l.land_owner, s.label, s.due_date, s.amount, s.paid, s.status
		from `tabRE Land Deal Schedule` s join `tabRE Land Deal` d on d.name=s.parent
		left join `tabRE Land Deal Line` l on l.parent=d.name and l.ser=s.ser where {cond} order by s.due_date, d.name, s.ser""", args, as_dict=True)


def seller_payments_due(filters):
	f = filters or {}
	window = {"Week": 7, "Month": 31, "Quarter": 92}.get(f.get("window") or "Month", 31)
	today = getdate(nowdate())
	data = []
	for s in _schedule({**f, "deal_status": None}, add_days(today, window)):
		if s.status in ("Paid", "Refund") or flt(s.amount) - flt(s.paid) <= 0.5:
			continue
		data.append({**s, "pending": flt(s.amount) - flt(s.paid), "days": date_diff(today, s.due_date) if s.due_date else None,
					 "when": _("Overdue") if s.due_date and getdate(s.due_date) < today else _("Due")})
	columns = [_col("due_date", "Due date", "Date", 95), _col("when", "When", "Data", 75), _col("days", "Days late", "Int", 70),
			   _col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("owner_name", "Owner", "Data", 230), _col("label", "Payment", "Data", 160),
			   _money("amount", "Amount"), _money("paid", "Paid"), _money("pending", "To pay", 130)]
	summary = [{"label": _("Overdue"), "value": sum(r["pending"] for r in data if r["when"] == _("Overdue")), "datatype": "Currency", "currency": "PKR", "indicator": "Red"},
			   {"label": _("Due in the window"), "value": sum(r["pending"] for r in data if r["when"] == _("Due")), "datatype": "Currency", "currency": "PKR"}]
	return columns, data, None, None, summary


def seller_payment_schedule(filters):
	f = filters or {}
	today = getdate(nowdate())
	data = []
	for s in _schedule(f):
		late = date_diff(today, s.due_date) if s.due_date and s.status in ("Overdue",) else 0
		data.append({**s, "pending": max(flt(s.amount) - flt(s.paid), 0) if s.status != "Refund" else 0, "days": late})
	columns = [_col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("ser", "Ser", "Int", 45), _col("owner_name", "Owner", "Data", 230),
			   _col("label", "Payment", "Data", 170), _col("due_date", "Due date", "Date", 95), _money("amount", "Amount"), _money("paid", "Paid"),
			   _money("pending", "Pending"), _col("status", "Status", "Data", 90), _col("days", "Days late", "Int", 70)]
	by = {}
	for r in data:
		by[r["status"]] = by.get(r["status"], 0) + flt(r["amount"])
	chart = {"data": {"labels": list(by), "datasets": [{"name": _("Amount"), "values": list(by.values())}]}, "type": "donut"}
	return columns, data, None, chart, None


def payments_by_seller(filters):
	f = filters or {}
	cond = {"docstatus": 1}
	if f.get("from_date"):
		cond["posting_date"] = ("between", [f["from_date"], f.get("to_date") or nowdate()])
	rows = frappe.get_all("RE Land Payment", cond, ["land_owner", "owner_name", "payment_kind", "amount", "wht_amount", "net_paid", "mode_of_payment", "posting_date"], limit=0)
	data = {}
	for p in rows:
		d = data.setdefault(p.land_owner, {"land_owner": p.land_owner, "owner_name": p.owner_name, "payments": 0, "gross": 0.0, "wht": 0.0, "net": 0.0,
										   "refunds": 0.0, "cash": 0.0, "bank": 0.0, "last": None})
		if p.payment_kind == "Refund Received":
			d["refunds"] += flt(p.amount)
			continue
		d["payments"] += 1
		d["gross"] += flt(p.amount)
		d["wht"] += flt(p.wht_amount)
		d["net"] += flt(p.net_paid)
		d["cash" if p.mode_of_payment == "Cash" else "bank"] += flt(p.net_paid)
		d["last"] = max(filter(None, [d["last"], getdate(p.posting_date)]))
	out = sorted(data.values(), key=lambda r: -r["gross"])
	columns = [_col("land_owner", "Owner", "Link", 110, options="RE Land Owner"), _col("owner_name", "Name", "Data", 230), _col("payments", "Payments", "Int", 80),
			   _money("gross", "Settled (gross)", 130), _money("wht", "Tax withheld"), _money("net", "Net paid", 130), _money("bank", "By bank / cheque / pay order", 150),
			   _money("cash", "In cash"), _money("refunds", "Refunds received"), _col("last", "Last payment", "Date", 100)]
	summary = [{"label": _("Settled"), "value": sum(r["gross"] for r in out), "datatype": "Currency", "currency": "PKR"},
			   {"label": _("Tax withheld"), "value": sum(r["wht"] for r in out), "datatype": "Currency", "currency": "PKR"},
			   {"label": _("In cash"), "value": sum(r["cash"] for r in out), "datatype": "Currency", "currency": "PKR", "indicator": "Orange"}]
	return columns, out, None, None, summary


# ---------------------------------------------------------------- plots against land
def plots_adjusted_against_land(filters):
	f = filters or {}
	rows = frappe.db.sql("""select a.name adjustment, a.deal, a.owner_name, a.posting_date, a.workflow_state, a.docstatus, p.plot, p.block, p.plot_size, p.list_price,
		p.agreed_value, p.booking, p.receipt from `tabRE Plot Adjustment` a join `tabRE Plot Adjustment Plot` p on p.parent=a.name where a.docstatus < 2
		{0} order by a.posting_date, a.name""".format("and p.block=%(block)s" if f.get("block") else ""), {"block": f.get("block")}, as_dict=True)
	for r in rows:
		r.adjusted = flt(frappe.db.get_value("RE Payment", r.receipt, "amount")) if r.receipt else 0
		r.receivable = flt(r.agreed_value) - r.adjusted
		r.plot_status = frappe.db.get_value("RE Plot", r.plot, "status")
	columns = [_col("adjustment", "Adjustment", "Link", 120, options="RE Plot Adjustment"), _col("posting_date", "Date", "Date", 95),
			   _col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("owner_name", "Owner", "Data", 220), _col("plot", "Plot", "Link", 80, options="RE Plot"),
			   _col("block", "Block", "Data", 80), _col("plot_size", "Size", "Data", 90), _money("list_price", "List price"), _money("agreed_value", "Agreed value"),
			   _money("adjusted", "Adjusted against land", 140), _money("receivable", "Receivable from owner", 140), _col("booking", "Booking", "Link", 140, options="RE Booking"),
			   _col("plot_status", "Plot", "Data", 80), _col("workflow_state", "Approval", "Data", 90)]
	summary = [{"label": _("Plots"), "value": len(rows), "datatype": "Int"},
			   {"label": _("Adjusted against land"), "value": sum(r.adjusted for r in rows), "datatype": "Currency", "currency": "PKR"}]
	return columns, rows, None, None, summary


def land_cost_cash_vs_plots(filters):
	f = filters or {}
	cond, args = _deal_filters(f)
	rows = frappe.db.sql(f"""select name deal, deal_date, description, land_for, net_due_amount net_due, paid_amount paid, adjusted_amount adjusted, balance_amount balance
		from `tabRE Land Deal` d where {cond} order by deal_date""", args, as_dict=True)
	for r in rows:
		r.plots_pct = round(flt(r.adjusted) * 100 / flt(r.net_due), 1) if flt(r.net_due) else 0
	columns = [_col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("deal_date", "Date", "Date", 95), _col("description", "Description", "Data", 260),
			   _col("land_for", "Land for", "Data", 100), _money("net_due", "Net due", 130), _money("paid", "Settled in cash", 130),
			   _money("adjusted", "Settled with plots", 130), _col("plots_pct", "Plots %", "Percent", 70), _money("balance", "Still payable", 130)]
	t = {k: sum(flt(r[k]) for r in rows) for k in ("net_due", "paid", "adjusted", "balance")}
	chart = {"data": {"labels": [_("Cash"), _("Plots"), _("Still payable")], "datasets": [{"name": _("Land cost"), "values": [t["paid"], t["adjusted"], max(t["balance"], 0)]}]},
			 "type": "pie", "colors": ["#16a34a", "#8b5cf6", "#f59e0b"]}
	summary = [{"label": _("Cash"), "value": t["paid"], "datatype": "Currency", "currency": "PKR", "indicator": "Green"},
			   {"label": _("Plots"), "value": t["adjusted"], "datatype": "Currency", "currency": "PKR", "indicator": "Blue"},
			   {"label": _("Still payable"), "value": t["balance"], "datatype": "Currency", "currency": "PKR", "indicator": "Orange"}]
	return columns, rows, None, chart, summary


# ---------------------------------------------------------------- acquisition
def land_acquisition_by_stage(filters):
	project = frappe.db.get_single_value("RE Settings", "default_project")
	target = flt(frappe.db.get_value("RE Project", project, "total_area_kanal")) if project else 0
	parcels = frappe.get_all("RE Land Parcel", {}, ["name", "stage", "area_sqft"], limit=0)
	lines = frappe.db.sql("""select l.parcel, sum(l.net_due) net_due, sum(l.paid_amount + l.adjusted_amount) paid, sum(l.balance) balance
		from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent where d.status!='Cancelled' and l.status!='Cancelled' group by l.parcel""", as_dict=True)
	money = {r.parcel: r for r in lines}
	data = []
	for stage in land.STAGES:
		ps = [p for p in parcels if p.stage == stage]
		if not ps:
			continue
		k = sum(_kanal(p.area_sqft) for p in ps)
		data.append({"stage": stage, "group": land.LAYER.get(stage), "khasras": len(ps), "kanal": round(k, 2), "pct": round(k * 100 / target, 2) if target else 0,
					 "net_due": sum(flt((money.get(p.name) or {}).get("net_due")) for p in ps), "paid": sum(flt((money.get(p.name) or {}).get("paid")) for p in ps),
					 "balance": sum(flt((money.get(p.name) or {}).get("balance")) for p in ps)})
	columns = [_col("stage", "Stage", "Data", 180), _col("group", "Map colour group", "Data", 140), _col("khasras", "Khasras", "Int", 80), _col("kanal", "Kanal", "Float", 90),
			   _col("pct", "% of target", "Percent", 90), _money("net_due", "Net due", 130), _money("paid", "Paid / adjusted", 130), _money("balance", "Balance", 130)]
	acq = sum(r["kanal"] for r in data if r["stage"] in ACQUIRED)
	chart = {"data": {"labels": [r["stage"] for r in data], "datasets": [{"name": _("Kanal"), "values": [r["kanal"] for r in data]}]}, "type": "bar", "colors": ["#16a34a"]}
	summary = [{"label": _("Target"), "value": f"{target:g} Kanal", "datatype": "Data"},
			   {"label": _("Acquired"), "value": f"{acq:.1f} Kanal ({acq * 100 / target:.1f}%)" if target else f"{acq:.1f} Kanal", "datatype": "Data", "indicator": "Green"},
			   {"label": _("Khasras"), "value": len(parcels), "datatype": "Int"}]
	return columns, data, None, chart, summary


def land_cost_per_kanal(filters):
	ms = land.marla_sqft()
	parcels = frappe.get_all("RE Land Parcel", {}, ["name", "khasra_nos", "mauza", "stage", "area_sqft", "area_display", "land_type"], order_by="khasra_nos", limit=0)
	cost = {r.parcel: r for r in frappe.db.sql("""select l.parcel, sum(l.net_due) net_due, sum(l.area_sqft) bought, group_concat(distinct d.name) deals
		from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent where d.status!='Cancelled' and l.status!='Cancelled' group by l.parcel""", as_dict=True)}
	data = []
	for p in parcels:
		c = cost.get(p.name) or {}
		bought = flt(c.get("bought"))
		k = L.in_unit(bought, "Kanal", ms) if bought else 0
		data.append({"parcel": p.name, "khasra_nos": p.khasra_nos, "mauza": p.mauza, "land_type": p.land_type, "stage": p.stage, "area": p.area_display,
					 "bought": L.fmt_area(bought, ms) if bought else "—", "deals": c.get("deals"), "net_due": c.get("net_due") or 0,
					 "per_kanal": round(flt(c.get("net_due")) / k, 0) if k else 0, "per_marla": round(flt(c.get("net_due")) / k / 20, 0) if k else 0})
	columns = [_col("parcel", "Parcel", "Link", 120, options="RE Land Parcel"), _col("khasra_nos", "Khasra", "Data", 90), _col("mauza", "Mauza", "Data", 150),
			   _col("land_type", "Type", "Data", 75), _col("stage", "Stage", "Data", 150), _col("area", "Area (fard)", "Data", 100), _col("bought", "Bought", "Data", 100),
			   _col("deals", "Deals", "Data", 120), _money("net_due", "Cost (net due)", 130), _money("per_kanal", "Per Kanal", 120), _money("per_marla", "Per marla", 110)]
	priced = [r for r in data if r["per_kanal"]]
	chart = {"data": {"labels": [r["khasra_nos"] for r in priced], "datasets": [{"name": _("Per Kanal"), "values": [r["per_kanal"] for r in priced]}]}, "type": "bar", "colors": ["#8b5cf6"]}
	return columns, data, None, chart, None


def transfer_cost_summary(filters):
	"""Estimated transfer costs per deal from the RE Transfer Cost Rate table (province in RE Settings, latest fiscal year)."""
	f = filters or {}
	province = frappe.db.get_single_value("RE Settings", "land_province") or "Punjab"
	years = frappe.get_all("RE Transfer Cost Rate", {"province": province, "enabled": 1}, pluck="fiscal_year", order_by="fiscal_year desc", limit=1)
	rates = frappe.get_all("RE Transfer Cost Rate", {"province": province, "enabled": 1, "fiscal_year": years[0]}, ["cost_head", "basis", "rate"]) if years else []
	cond, args = _deal_filters(f)
	deals = frappe.db.sql(f"select name, deal_date, description, due_amount, deal_area_sqft from `tabRE Land Deal` d where {cond} order by deal_date", args, as_dict=True)
	heads = [r.cost_head for r in rates]
	data = []
	for d in deals:
		row = {"deal": d.name, "deal_date": d.deal_date, "description": d.description, "value": d.due_amount}
		total = 0.0
		for r in rates:
			amt = flt(d.due_amount) * flt(r.rate) / 100 if r.basis == "% of value" else flt(r.rate) * _kanal(d.deal_area_sqft) if r.basis == "Per Kanal" else flt(r.rate)
			row[frappe.scrub(r.cost_head)] = round(amt, 0)
			total += amt
		row["total"] = round(total, 0)
		row["pct"] = round(total * 100 / flt(d.due_amount), 2) if flt(d.due_amount) else 0
		data.append(row)
	columns = [_col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("deal_date", "Date", "Date", 95), _col("description", "Description", "Data", 220),
			   _money("value", "Land value", 130), *[_money(frappe.scrub(h), h, 115) for h in heads], _money("total", "Total transfer cost", 140),
			   _col("pct", "% of value", "Percent", 80)]
	msg = _("Estimated with the {0} {1} rates in RE Transfer Cost Rate — confirm against the current notification before paying.").format(province, years[0]) if years \
		else _("Add RE Transfer Cost Rate rows for {0} to estimate transfer costs.").format(province)
	summary = [{"label": _("Estimated transfer cost"), "value": sum(r["total"] for r in data), "datatype": "Currency", "currency": "PKR"}]
	return columns, data, msg, None, summary


def pending_registry_and_mutation(filters):
	today = getdate(nowdate())
	rows = frappe.db.sql("""select d.name deal, d.description, d.status deal_status, d.registry_deadline, d.possession_date, l.ser, l.owner_name, l.status,
		l.net_due, l.balance, p.khasra_nos from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent left join `tabRE Land Parcel` p on p.name=l.parcel
		where d.status in ('Partially Signed','Executed','In Payment') and l.status='Pending' order by d.registry_deadline, d.name, l.ser""", as_dict=True)
	for r in rows:
		r.days_left = date_diff(r.registry_deadline, today) if r.registry_deadline else None
		r.ready = _("Paid — ready for registry") if flt(r.balance) <= 0.5 else _("Balance due first")
	columns = [_col("deal", "Deal", "Link", 95, options="RE Land Deal"), _col("deal_status", "Contract", "Data", 100), _col("khasra_nos", "Khasra", "Data", 90),
			   _col("ser", "Ser", "Int", 45), _col("owner_name", "Owner", "Data", 230), _col("registry_deadline", "Registry deadline", "Date", 115),
			   _col("days_left", "Days left", "Int", 75), _money("balance", "Balance"), _col("ready", "Readiness", "Data", 170), _col("possession_date", "Possession", "Date", 100)]
	summary = [{"label": _("Owners pending"), "value": len(rows), "datatype": "Int"},
			   {"label": _("Past the deadline"), "value": sum(1 for r in rows if r.days_left is not None and r.days_left < 0), "datatype": "Int", "indicator": "Red"}]
	return columns, rows, None, None, summary


def litigation_register(filters):
	f = filters or {}
	cond = {"status": ("in", OPEN_CASES)} if f.get("open_only") else {}
	cases = frappe.get_all("RE Land Case", cond, ["name", "case_title", "court", "case_no", "filed_on", "status", "next_hearing", "lawyer", "affected_area", "deal", "responsible"],
						   order_by="next_hearing", limit=0)
	today = getdate(nowdate())
	for c in cases:
		c.khasras = ", ".join(frappe.get_all("RE Land Case Parcel", {"parent": c.name}, pluck="khasra_nos"))
		c.days = date_diff(c.next_hearing, today) if c.next_hearing and c.status in OPEN_CASES else None
	columns = [_col("name", "Case", "Link", 110, options="RE Land Case"), _col("case_title", "Title", "Data", 260), _col("court", "Court", "Data", 160),
			   _col("case_no", "Case no", "Data", 100), _col("filed_on", "Filed", "Date", 95), _col("status", "Status", "Data", 110),
			   _col("next_hearing", "Next hearing", "Date", 100), _col("days", "In days", "Int", 65), _col("khasras", "Khasras", "Data", 110),
			   _col("affected_area", "Area", "Data", 90), _col("lawyer", "Lawyer", "Data", 150), _col("deal", "Deal", "Link", 95, options="RE Land Deal")]
	summary = [{"label": _("Open cases"), "value": sum(1 for c in cases if c.status in OPEN_CASES), "datatype": "Int", "indicator": "Red"},
			   {"label": _("Hearings within 7 days"), "value": sum(1 for c in cases if c.days is not None and 0 <= c.days <= 7), "datatype": "Int", "indicator": "Orange"}]
	return columns, cases, None, None, summary


def owner_statement(land_owner: str) -> dict:
	"""Rows for the Land Owner Statement document: the owner's lines across deals and their ledger with a running balance."""
	cols, rows, *_rest = land_owner_ledger({"land_owner": land_owner})
	lines = frappe.db.sql("""select d.name deal, d.deal_date, d.status, l.ser, l.parcel, l.kanal, l.marla, l.sqft, l.unit, l.rate, l.net_due, l.paid_amount,
		l.adjusted_amount, l.balance, l.status line_status, l.mature_date, l.date_ext from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent
		where l.land_owner=%s and d.status!='Cancelled' order by d.deal_date""", land_owner, as_dict=True)
	for l in lines:
		l.khasra = frappe.db.get_value("RE Land Parcel", l.parcel, "khasra_nos") if l.parcel else ""
	return {"ledger": [r for r in rows if r.get("voucher_no") or r.get("bold")], "lines": lines,
			"closing": rows[-1].get("balance") if rows else 0}
