"""Render one specimen of every generated document, in English and Urdu, for the document book
(tools/docs-book/build.py). Read-only: it prints with frappe.get_print and never creates
RE Generated Document versions or File attachments.

bench --site realestate execute realestate.demo.sample_documents.render --kwargs '{"out": "/path/to/dir"}'
"""

import json
import os

import frappe

from realestate import documents as D


def _pick():
	booking = lambda **f: frappe.db.get_value("RE Booking", {"docstatus": 1, **f}, "name", order_by="creation asc")
	main = booking(status="Overdue") or booking()
	sold_plot = {"status": ["in", ["Sold", "Possession Given"]], "customer": ["is", "set"]}
	# NDC needs a fully paid booking with no society dues; demo owners usually carry a small bill, so fall back to a specimen
	ndc = frappe.db.sql("""select b.name from `tabRE Booking` b where b.docstatus=1 and b.outstanding_amount<=0.5
		and not exists(select 1 from `tabRE Society Bill` s where s.customer=b.customer and s.outstanding_amount>0.5)
		order by b.creation limit 1""")
	paid = booking(outstanding_amount=["<=", 0.5])
	transfer = frappe.db.get_value("RE Plot Transfer", {"docstatus": 1}, "name", order_by="creation asc")
	owner = frappe.db.get_value("RE Booking", main, "customer")
	return {
		"Booking Application Form": (main, True),
		"Allotment Letter": (main, True),
		"Payment Schedule": (main, True),
		"Payment Receipt": (frappe.db.get_value("RE Payment", {"docstatus": 1, "customer": owner}, "name", order_by="creation desc")
							or frappe.db.get_value("RE Payment", {"docstatus": 1}, "name", order_by="creation desc"), True),
		"Installment Reminder": (booking(status="Due") or main, True),
		"Final Notice": (main, True),
		"Cancellation Letter": (frappe.db.get_value("RE Booking", {"status": "Cancelled"}, "name"), True),
		"No Demand Certificate": (ndc[0][0], True) if ndc else (paid, False),
		"Possession Letter": (paid, True),
		"Sale Agreement": (main, True),
		"Site Plan": (frappe.db.get_value("RE Plot", sold_plot, "name"), True),
		"NOC for Construction": (frappe.db.get_value("RE Plot", sold_plot, "name"), True),
		"Maintenance Bill": (frappe.db.get_value("RE Society Bill", {"customer": owner}, "name", order_by="creation desc")
							 or frappe.db.get_value("RE Society Bill", {}, "name", order_by="creation desc"), True),
		"Customer Account Statement": (owner, True),
		"Transfer Application": (transfer, True),
		"Transfer Letter": (transfer, True),
	}


def render(out: str) -> None:
	os.makedirs(out, exist_ok=True)
	refs = _pick()
	rows = []
	for no, (document_type, (doctype, _template)) in enumerate(D.DOCUMENTS.items(), 1):
		name, guarded = refs[document_type]
		for language in ("en", "ur"):
			row = {"no": no, "type": document_type, "doctype": doctype, "ref": name, "language": language,
				   "specimen": not guarded, "print_format": D.print_format_name(document_type, language)}
			try:
				if not name:
					raise frappe.ValidationError("no suitable record in the demo data")
				if guarded:
					D._guard(document_type, frappe.get_doc(doctype, name))
				pdf = frappe.get_print(doctype, name, print_format=row["print_format"], as_pdf=True, letterhead=D.LETTER_HEAD)
				row["file"] = os.path.join(out, f"{no:02d}-{language}.pdf")
				with open(row["file"], "wb") as f:
					f.write(pdf)
			except Exception as e:
				row["error"] = str(e)[:300]
			rows.append(row)
	frappe.db.rollback()
	with open(os.path.join(out, "index.json"), "w") as f:
		json.dump(rows, f, ensure_ascii=False, indent=1)
	print(json.dumps({"rendered": sum(1 for r in rows if r.get("file")), "failed": [r for r in rows if r.get("error")]}, ensure_ascii=False))

