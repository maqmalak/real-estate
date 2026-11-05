"""Urdu helpers for the Urdu document templates (templates/docs/ur/*): values stored in English (installment labels,
statuses, payment modes, plot types, relations, charge heads) shown in Urdu, plus dates and amounts that stay
left-to-right inside right-to-left text. Registered as Jinja methods in hooks.py."""

import re

from frappe.utils import flt, formatdate, getdate

WORDS = {
	# installment schedule
	"Booking Amount": "بکنگ رقم", "Down Payment": "ڈاؤن پیمنٹ", "Full Payment": "یکمشت ادائیگی", "Possession": "قبضہ کے وقت",
	"Development Charges": "ترقیاتی چارجز", "Balance": "بقایا",
	# statuses
	"Paid": "ادا شدہ", "Unpaid": "غیر ادا شدہ", "Due": "واجب الادا", "Overdue": "زائد المیعاد", "Partly Paid": "جزوی ادا", "Draft": "مسودہ",
	"Cancelled": "منسوخ", "Booked": "بک شدہ", "Sold": "فروخت شدہ", "Available": "دستیاب", "Possession Given": "قبضہ دیا گیا",
	# payments
	"Cash": "نقد", "Cheque": "چیک", "Bank Transfer": "بینک ٹرانسفر", "Online": "آن لائن",
	"Booking": "پلاٹ کی قسط", "Society Bill": "سوسائٹی بل", "Surcharge": "لیٹ سرچارج",
	# plots
	"Residential": "رہائشی", "Commercial": "کمرشل", "Marla": "مرلہ", "Kanal": "کنال",
	# relations
	"Spouse": "شریکِ حیات", "Son": "بیٹا", "Daughter": "بیٹی", "Father": "والد", "Mother": "والدہ", "Brother": "بھائی", "Sister": "بہن",
	"Wife": "اہلیہ", "Husband": "شوہر",
	# society charge heads
	"Maintenance": "مینٹیننس", "Security": "سیکیورٹی", "Garbage Collection": "کوڑا اٹھانا", "Sweeper": "صفائی", "Park Maintenance": "پارک مینٹیننس",
	"Street Light": "اسٹریٹ لائٹ", "Water": "پانی",
	# land purchase (Module 0)
	"Token (bayana)": "بیعانہ", "Agreement amount": "اقرار نامہ کی رقم", "Final payment at registry": "رجسٹری پر حتمی ادائیگی", "Extension": "توسیع",
	"Refund to cancelled owner": "منسوخ شدہ مالک کو واپسی", "Registry Done": "رجسٹری مکمل", "Mutation Done": "انتقال مکمل", "Pending": "زیرِ التوا",
	"Acre": "ایکڑ", "Owner": "مالک", "Attorney": "مختارِ عام", "Legal Heir": "قانونی وارث", "Agent": "ایجنٹ", "Token": "بیعانہ", "Agreement": "اقرار نامہ",
	"Installment": "قسط", "Final": "حتمی ادائیگی", "Refund Received": "رقم کی واپسی", "Other": "دیگر", "Pay Order": "پے آرڈر",
	"S/O": "ولد", "D/O": "دختر", "W/O": "زوجہ", "Barani": "بارانی", "Nehri": "نہری", "Chahi": "چاہی", "Banjar": "بنجر",
	"Executed": "نافذ العمل", "In Payment": "ادائیگی جاری", "Completed": "مکمل", "Closed": "بند", "Partially Signed": "جزوی دستخط شدہ", "Disputed": "متنازعہ",
	"Invoice": "واجب الادا رقم", "Debit note": "کمی (ڈیبٹ نوٹ)", "Payment": "ادائیگی", "Plot adjustment": "پلاٹ کی صورت میں ادائیگی",
	# payment plans
	"3 Years Monthly": "3 سال ماہانہ", "2 Years Monthly": "2 سال ماہانہ", "3 Years Quarterly": "3 سال سہ ماہی", "2 Years Quarterly": "2 سال سہ ماہی",
}
PATTERNS = [
	(re.compile(r"^Installment (\d+)$"), "قسط {0}"),
	(re.compile(r"^Balloon (\d+)$"), "بیلون قسط {0}"),
	(re.compile(r"^Balloon Payment (\d+)$"), "بیلون قسط {0}"),
	(re.compile(r"^(\d+(?:\.\d+)?) Marla$"), "{0} مرلہ"),
	(re.compile(r"^(\d+(?:\.\d+)?) Kanal$"), "{0} کنال"),
	(re.compile(r"^([A-Z]) Block$"), "{0} بلاک"),
]


def ur(value):
	"""English value -> Urdu where known (exact words, then patterns such as "Installment 7"); otherwise unchanged."""
	if value is None:
		return ""
	s = str(value).strip()
	if s in WORDS:
		return WORDS[s]
	for rx, out in PATTERNS:
		m = rx.match(s)
		if m:
			return out.format(*m.groups())
	return s


def ur_date(value):
	"""Numeric date (12-11-2026), kept left-to-right so it never flips inside Urdu text."""
	if not value:
		return ""
	return f'<span class="ltr">{formatdate(getdate(value), "dd-MM-yyyy")}</span>'


def ur_money(value):
	"""Rs amount kept left-to-right (Rs 6,500,000)."""
	return f'<span class="ltr">Rs {flt(value):,.0f}</span>'


def ur_ltr(value):
	"""Any code / number / CNIC kept left-to-right."""
	return f'<span class="ltr">{value or ""}</span>' if value else ""
