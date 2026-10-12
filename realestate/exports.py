"""Phase G — report centre for the React app: run any Real Estate / CRM script report with simple filters, preview it,
and download it as Excel (.xlsx) or PDF (on the project letterhead). Permissions are the report's own roles
(frappe.desk.query_report.run checks them), so each role only gets the reports it may open in the desk."""

import json

import frappe
from frappe import _
from frappe.utils import add_months, cstr, flt, fmt_money, formatdate, nowdate

# report -> (group, filters it accepts). Dates default to the last 12 months.
REPORTS = {
	"Collection Summary": ("Sales & Collections", []),
	"Installment Dues": ("Sales & Collections", []),
	"Plot Inventory": ("Sales & Collections", []),
	"Recovery Promised vs Received": ("Sales & Collections", []),
	"Sales by Block": ("Sales & Collections", ["from_date", "to_date"]),
	"Receivables Aging": ("Sales & Collections", ["block"]),
	"Commission Report": ("Sales & Collections", []),
	"Society Bill Status": ("Society", []),
	"Society Defaulters": ("Society", ["block", "min_months"]),
	"Society Dues by Charge Head": ("Society", ["block"]),
	"Society Income vs Expense": ("Society", ["from_date", "to_date"]),
	"Maintenance Tasks": ("Society", ["from_date", "to_date", "group_by"]),
	"Development Budget vs Actual": ("Development & Costs", ["from_date", "to_date"]),
	"Development Cost and Profitability": ("Development & Costs", []),
	"Lead Conversion": ("CRM", []),
	"Leads by Source": ("CRM", []),
	"Agent Activity": ("CRM", []),
	"Agent Response Time": ("CRM", []),
	"Missed Follow-ups": ("CRM", []),
}
MAX_PREVIEW = 300


def _filters(report, raw):
	given = json.loads(raw) if isinstance(raw, str) else (raw or {})
	accepted = REPORTS[report][1]
	f = {k: v for k, v in given.items() if k in accepted and v not in (None, "")}
	if "from_date" in accepted:
		f.setdefault("from_date", add_months(nowdate(), -12))
		f.setdefault("to_date", nowdate())
	if "min_months" in accepted:
		f.setdefault("min_months", 1)
	if "group_by" in accepted:
		f.setdefault("group_by", "Type")
	return f


def _run(report, filters):
	from frappe.desk.query_report import run

	from realestate import scope

	if scope.agent():  # scheme-wide reports are for managers; agents see their own business on the dashboard
		frappe.throw(_("Reports cover the whole scheme and are for managers."), frappe.PermissionError)
	if report not in REPORTS:
		frappe.throw(_("Unknown report {0}").format(report))
	result = run(report, filters=filters, ignore_prepared_report=True)
	columns = []
	for c in result.get("columns") or []:
		if isinstance(c, str):  # "Label:Type/Options:Width"
			label, _sep, rest = c.partition(":")
			c = {"label": label, "fieldname": frappe.scrub(label), "fieldtype": (rest.split(":")[0].split("/")[0] or "Data")}
		columns.append({"label": c.get("label"), "fieldname": c.get("fieldname"), "fieldtype": c.get("fieldtype") or "Data"})
	rows = []
	for r in result.get("result") or []:
		if isinstance(r, (list, tuple)):
			r = {columns[i]["fieldname"]: v for i, v in enumerate(r) if i < len(columns)}
		if isinstance(r, dict):
			rows.append(r)
	return columns, rows


@frappe.whitelist(methods=["GET"])
def catalogue() -> list[dict]:
	"""Reports this user may open, grouped, with the filters each accepts."""
	from realestate import scope

	if scope.agent():
		return []
	out = []
	for name, (group, accepted) in REPORTS.items():
		if not frappe.db.exists("Report", name):
			continue
		if not frappe.get_doc("Report", name).is_permitted():
			continue
		out.append({"name": name, "group": group, "filters": accepted})
	return out


@frappe.whitelist(methods=["GET"])
def preview(report: str, filters: str | None = None) -> dict:
	f = _filters(report, filters)
	columns, rows = _run(report, f)
	return {"columns": columns, "rows": rows[:MAX_PREVIEW], "total": len(rows), "filters": f}


def _cell(value, fieldtype, for_pdf=False):
	if value is None:
		return ""
	if fieldtype == "Currency":
		return fmt_money(flt(value), precision=0, currency="PKR") if for_pdf else flt(value)
	if fieldtype in ("Float", "Percent"):
		return flt(value, 2)
	if fieldtype == "Int":
		return int(flt(value))
	if fieldtype == "Date" and for_pdf:
		return formatdate(value)
	return cstr(value) if for_pdf or not isinstance(value, (int, float)) else value


@frappe.whitelist(methods=["GET"])
def download(report: str, file_format: str = "xlsx", filters: str | None = None):
	"""Stream the whole report (not just the preview) as .xlsx or .pdf."""
	f = _filters(report, filters)
	columns, rows = _run(report, f)
	stamp = nowdate()
	if file_format == "xlsx":
		from frappe.utils.xlsxutils import make_xlsx

		data = [[c["label"] for c in columns]] + [[_cell(r.get(c["fieldname"]), c["fieldtype"]) for c in columns] for r in rows]
		frappe.local.response.filecontent = make_xlsx(data, report[:31]).getvalue()
		frappe.local.response.filename = f"{report} {stamp}.xlsx"
	elif file_format == "pdf":
		from frappe.utils.pdf import get_pdf

		letter_head = frappe.render_template(frappe.db.get_value("Letter Head", "Zarmeen Gardens", "content") or "", {"doc": frappe._dict()})
		html = frappe.render_template("realestate/templates/docs/report_export.html", {
			"title": report, "letter_head": letter_head, "columns": columns, "filters": f, "generated": frappe.utils.now_datetime(),
			"rows": [[_cell(r.get(c["fieldname"]), c["fieldtype"], True) for c in columns] for r in rows],
			"numeric": [c["fieldtype"] in ("Currency", "Float", "Int", "Percent") for c in columns],
			"nowrap": [c["fieldtype"] in ("Currency", "Float", "Int", "Percent", "Date", "Link", "Datetime") for c in columns],
			"user": frappe.utils.get_fullname(frappe.session.user),
		})
		frappe.local.response.filecontent = get_pdf(html, {"orientation": "Landscape" if len(columns) > 6 else "Portrait"})
		frappe.local.response.filename = f"{report} {stamp}.pdf"
	else:
		frappe.throw(_("Format must be xlsx or pdf"))
	frappe.local.response.type = "download"
