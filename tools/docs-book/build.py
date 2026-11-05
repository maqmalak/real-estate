"""Build docs/fsd/Zarmeen-Gardens-Generated-Documents.pdf: a cover, how documents are generated, a contents page and one
specimen of every document type in English and Urdu, with PDF bookmarks.

    python3 tools/docs-book/build.py            # renders specimens from the realestate site, then binds the book
    python3 tools/docs-book/build.py --no-render  # rebind from the last render
"""

import datetime
import html
import json
import os
import subprocess
import sys

from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "../.."))
BENCH = os.path.abspath(os.path.join(APP, "../.."))
WORK = os.path.join(HERE, "out")
TARGET = os.path.join(APP, "docs/fsd/Zarmeen-Gardens-Generated-Documents.pdf")
SITE = os.environ.get("RE_SITE", "realestate")

# what each document is for and when the system allows it (mirrors realestate/documents.py _guard)
ABOUT = {
	"Booking Application Form": ("Buyer's application with CNIC, nominee, plot and plan", "Any booking"),
	"Allotment Letter": ("Confirms the plot allotted to the buyer and the terms", "Submitted booking"),
	"Payment Schedule": ("Every installment with due date, amount, paid and status", "Any booking"),
	"Payment Receipt": ("Receipt for one payment with amount in words", "Submitted receipt"),
	"Installment Reminder": ("Next installment and total outstanding", "Any booking; also sent 3 days before a due date"),
	"Final Notice": ("Overdue amount and deadline before cancellation", "Booking with overdue installments"),
	"Cancellation Letter": ("Cancellation with deduction and refund", "After an approved cancellation"),
	"No Demand Certificate": ("Certifies nothing is owed on the plot", "Fully paid booking and no society dues"),
	"Possession Letter": ("Hands over possession with the plot location", "Fully paid booking"),
	"Sale Agreement": ("Agreement to sell with clauses and the schedule", "Any booking"),
	"Site Plan": ("Plot outline, neighbours, dimensions and coordinates", "Any plot"),
	"NOC for Construction": ("Permission to build, with conditions", "Sold or possessed plot with an owner"),
	"Maintenance Bill": ("Monthly society bill by charge head with arrears", "Any society bill"),
	"Customer Account Statement": ("All bookings, receipts and balances of an owner", "Any customer"),
	"Transfer Application": ("Seller and buyer details and the dues position", "Transfer request"),
	"Transfer Letter": ("Confirms the plot now belongs to the buyer", "Approved transfer"),
	"Land Purchase Agreement": ("Iqrar nama: every seller with CNIC, khasra, share, price, schedule and signature blocks", "Any land deal"),
	"Land Payment Receipt": ("Token / payment / refund receipt with tax withheld, signed by the seller", "Approved seller payment"),
	"Land Final Settlement": ("One page per fully paid seller: no further claim", "At least one seller fully paid"),
	"Plot Adjustment Memo": ("Plots given to a land owner instead of cash, with values and balances", "Approved plot adjustment"),
	"Land Owner Statement": ("A land owner's deals and ledger with running balance", "Any land owner"),
}


def render():
	os.makedirs(WORK, exist_ok=True)
	subprocess.run(["bench", "--site", SITE, "execute", "realestate.demo.sample_documents.render",
					"--kwargs", json.dumps({"out": WORK})], cwd=BENCH, check=True)


def esc(s):
	return html.escape(str(s or ""))


CSS = """
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Nastaliq+Urdu:wght@500&display=swap');
:root{--ink:#14201e;--muted:#51625f;--accent:#0f766e;--deep:#0b3b37;--mint:#5eead4;--soft:#eef6f4;--line:#d5e5e1;--amber:#b45309}
*{box-sizing:border-box} html,body{margin:0;background:#fff;color:var(--ink);font:400 10.5pt/1.5 'IBM Plex Sans',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;padding:20mm 18mm 16mm;position:relative;overflow:hidden;page-break-after:always}
.page:last-child{page-break-after:auto}
h1,h2,h3{font-family:'IBM Plex Serif',Georgia,serif;margin:0}
.eyebrow{font:600 8pt/1 'IBM Plex Sans';letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.foot{position:absolute;left:18mm;right:18mm;bottom:9mm;display:flex;justify-content:space-between;font-size:7.5pt;color:var(--muted);border-top:1px solid var(--line);padding-top:6px}
/* cover */
.cover{background:var(--deep);color:#fff;padding:0}
.cover .ring{position:absolute;border-radius:50%;border:1.5px solid rgba(94,234,212,.45)}
.cover .r1{width:150mm;height:150mm;right:-45mm;top:-40mm;background:rgba(15,118,110,.5)}
.cover .r2{width:70mm;height:70mm;right:22mm;top:150mm;background:rgba(94,234,212,.12)}
.cover .inner{position:absolute;left:20mm;right:20mm;top:88mm}
.cover .eyebrow{color:var(--mint)}
.cover h1{font-size:40pt;line-height:1.08;margin:6mm 0 5mm;max-width:150mm}
.cover p{color:#ccfbf1;font-size:12.5pt;max-width:135mm;margin:0}
.cover .ur{font-family:'Noto Nastaliq Urdu',serif;font-size:20pt;color:var(--mint);margin-top:8mm;line-height:2}
.cover .meta{position:absolute;left:20mm;right:20mm;bottom:20mm;display:grid;grid-template-columns:repeat(4,1fr);gap:6mm;border-top:1px solid rgba(204,251,241,.35);padding-top:6mm}
.cover .meta b{display:block;font:600 7.5pt/1 'IBM Plex Sans';letter-spacing:.14em;text-transform:uppercase;color:var(--mint);margin-bottom:2mm}
.cover .meta span{font-size:10pt}
/* about */
h2{font-size:21pt;margin:3mm 0 4mm} h3{font-size:12pt;color:var(--accent);margin:0 0 2mm}
.lead{font-size:11pt;color:var(--muted);max-width:165mm;margin:0 0 6mm}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.card{background:var(--soft);border-radius:3mm;padding:4.5mm 5mm}
.card p{margin:0;font-size:9.5pt}
.num{display:inline-flex;width:7mm;height:7mm;border-radius:50%;background:var(--accent);color:#fff;font:600 9pt/7mm 'IBM Plex Serif';justify-content:center;margin-right:2.5mm;vertical-align:middle}
.flow{display:flex;gap:2mm;align-items:center;margin:5mm 0 6mm;flex-wrap:wrap}
.flow span{background:#fff;border:1px solid var(--accent);border-radius:20px;padding:1.5mm 3.5mm;font-size:9pt}
.flow i{color:var(--muted);font-style:normal}
/* contents */
table{width:100%;border-collapse:collapse;font-size:8.3pt;line-height:1.32}
th{background:var(--accent);color:#fff;text-align:left;font-weight:600;padding:1.8mm 2.2mm}
td{padding:1.45mm 2.2mm;border-bottom:1px solid var(--line);vertical-align:top}
tr:nth-child(even) td{background:#f7fbfa}
td.n{font:600 10pt 'IBM Plex Serif';color:var(--accent);width:8mm}
td.p{text-align:center;font-weight:600;width:14mm}
td small{display:block;color:var(--muted);font-size:7.4pt}
td code{white-space:nowrap}
.tag{display:inline-block;white-space:nowrap;margin-top:.6mm;background:#fff7ed;color:var(--amber);border:1px solid #fed7aa;border-radius:10px;padding:0 2mm;font-size:7.5pt;margin-left:1.5mm}
code{font:500 8.3pt ui-monospace,Menlo,monospace;color:var(--deep)}
"""


PER_CONTENTS_PAGE = 16


def contents_pages(rows) -> int:
	return -(-len({r["type"] for r in rows}) // PER_CONTENTS_PAGE)


def front_html(rows, starts, total, generated):
	types = []
	for r in rows:
		if r["type"] not in [t["type"] for t in types]:
			types.append(r)
	foot = lambda n: f'<div class="foot"><span>Zarmeen Gardens · Generated documents · specimens</span><span>{n}</span></div>'
	cover = f"""<section class="page cover"><div class="ring r1"></div><div class="ring r2"></div>
	<div class="inner"><div class="eyebrow">Zarmeen Gardens Housing Scheme · Real Estate ERP</div>
	<h1>Generated documents</h1>
	<p>One specimen of every letter, form and statement the system issues — each on the letterhead with a QR verification code, in English and in Urdu.</p>
	<div class="ur">تیار شدہ دستاویزات — انگریزی اور اردو</div></div>
	<div class="meta"><div><b>Document types</b><span>{len(types)}</span></div><div><b>Languages</b><span>English · اردو</span></div>
	<div><b>Pages</b><span>{total}</span></div><div><b>Rendered</b><span>{esc(generated)}</span></div></div></section>"""

	about = f"""<section class="page"><div class="eyebrow">How documents are generated</div><h2>One click, a versioned PDF</h2>
	<p class="lead">Staff open a booking, plot, receipt, society bill, transfer or customer and choose <b>Actions → Letters &amp; forms</b>.
	The document is rendered from the record's live data, stored as a numbered version and attached to the record; owners download their own copies from the portal.</p>
	<div class="flow"><span>Source record</span><i>→</i><span>Rules check</span><i>→</i><span>Print format (English or اردو)</span><i>→</i><span>PDF on the letterhead</span><i>→</i><span>RE Generated Document vN</span><i>→</i><span>Attached · portal · WhatsApp</span></div>
	<div class="grid">
	<div class="card"><h3><span class="num">1</span>Letterhead and verification</h3><p>Every page carries the Zarmeen Gardens letterhead and a QR code that opens the verification page for that exact record, so a printed copy can be checked.</p></div>
	<div class="card"><h3><span class="num">2</span>English or Urdu</h3><p>Each type has an English and an Urdu print format. The Urdu version is fully right-to-left, with the same figures, tables and signatures.</p></div>
	<div class="card"><h3><span class="num">3</span>Versions, never overwritten</h3><p>Issuing again creates version 2, 3… with who issued it and when. Earlier versions stay in the record's history and the document register.</p></div>
	<div class="card"><h3><span class="num">4</span>Rules before printing</h3><p>The system refuses documents that would be untrue: no NDC or possession letter before full payment, no cancellation letter before an approved cancellation, no transfer letter before approval.</p></div>
	<div class="card"><h3><span class="num">5</span>Where to find them</h3><p>Staff app <b>Documents → Generated</b>, the record's Connections tab, the owner portal's Documents page, and the desk (print formats prefixed <code>RE</code>).</p></div>
	<div class="card"><h3><span class="num">6</span>About these specimens</h3><p>Rendered from the demo scheme on {esc(generated)} without saving a version. Names, CNICs and phone numbers are fictional demo data.</p></div>
	</div>{foot(2)}</section>"""

	body = []
	for t in types:
		en = next(r for r in rows if r["type"] == t["type"] and r["language"] == "en")
		purpose, when = ABOUT.get(t["type"], ("", ""))
		tag = '<span class="tag">specimen · rule not met</span>' if t.get("specimen") else ""
		page = lambda lang: starts.get((t["no"], lang), "—")
		body.append(f"""<tr><td class="n">{t['no']:02d}</td><td><b>{esc(t['type'])}</b><small>{esc(purpose)}</small>{tag}</td>
		<td>{esc(t['doctype'])}<small>{esc(when)}</small></td><td><code>{esc(en['ref'])}</code></td>
		<td class="p">{page('en')}</td><td class="p">{page('ur')}</td></tr>""")
	head = '<table><thead><tr><th>No.</th><th>Document</th><th>Generated from · allowed when</th><th>Specimen record</th><th>English</th><th>اردو</th></tr></thead>'
	pages = [body[i:i + PER_CONTENTS_PAGE] for i in range(0, len(body), PER_CONTENTS_PAGE)]
	contents = "".join(
		f"""<section class="page"><div class="eyebrow">Contents{f' (continued)' if n else ''}</div>"""
		+ (f"""<h2 style="margin-bottom:2mm">{len(types)} documents, two languages</h2>
	<p class="lead" style="margin-bottom:4mm">English first, then Urdu. Page numbers are PDF pages; the bookmarks list every document too.</p>""" if not n else "")
		+ f"""{head}<tbody>{''.join(chunk)}</tbody></table>{foot(3 + n)}</section>""" for n, chunk in enumerate(pages))
	return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{cover}{about}{contents}</body></html>'


def build():
	rows = json.load(open(os.path.join(WORK, "index.json")))
	failed = [r for r in rows if not r.get("file")]
	if failed:
		sys.exit(f"missing renders: {[(r['type'], r['language'], r.get('error')) for r in failed]}")
	generated = datetime.date.fromtimestamp(os.path.getmtime(os.path.join(WORK, "index.json"))).strftime("%d %B %Y")
	front_pages = 2 + contents_pages(rows)
	starts, page = {}, front_pages + 1
	for r in rows:
		starts[(r["no"], r["language"])] = page
		page += len(PdfReader(r["file"]).pages)
	total = page - 1
	src = os.path.join(WORK, "front.html")
	with open(src, "w") as f:
		f.write(front_html(rows, starts, total, generated))
	front = os.path.join(WORK, "front.pdf")
	subprocess.run(["node", os.path.join(HERE, "print.mjs"), src, front], check=True)
	assert len(PdfReader(front).pages) == front_pages, "front matter overflowed — adjust the layout"

	w = PdfWriter()
	w.append(front)
	w.add_outline_item("Cover", 0)
	w.add_outline_item("How documents are generated", 1)
	w.add_outline_item("Contents", 2)  # continued on the next page when there are more than PER_CONTENTS_PAGE documents
	parent = None
	for r in rows:
		w.append(r["file"])
		if r["language"] == "en":
			parent = w.add_outline_item(f"{r['no']:02d}  {r['type']}", starts[(r["no"], "en")] - 1)
		w.add_outline_item("English" if r["language"] == "en" else "اردو (Urdu)", starts[(r["no"], r["language"])] - 1, parent=parent)
	w.add_metadata({"/Title": "Zarmeen Gardens — Generated documents (specimens)", "/Author": "Real Estate app (realestate)",
					"/Subject": "Every generated document type in English and Urdu"})
	w.page_mode = "/UseOutlines"
	os.makedirs(os.path.dirname(TARGET), exist_ok=True)
	with open(TARGET, "wb") as f:
		w.write(f)
	print(f"wrote {TARGET} ({total} pages)")


if __name__ == "__main__":
	if "--no-render" not in sys.argv:
		render()
	build()
