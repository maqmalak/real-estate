"""Land arithmetic for Module 0 (pure functions, no Frappe): Kanal-Marla-Sarsai-sqft areas, rates per Acre / Kanal /
Marla, deal subtotals, seller payment schedules and the khasra / killa list parser.

Units (Punjab revenue): 1 Acre = 8 Kanal, 1 Kanal = 20 Marla, 1 Marla = 9 Sarsai, 1 Marla = `ms` sqft (default 272,
configurable in RE Settings). Areas are stored as sqft; everything else is derived.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

MARLA_SQFT = 272.0
MARLA_PER_KANAL = 20
KANAL_PER_ACRE = 8
SARSAI_PER_MARLA = 9
UNITS = ("Acre", "Kanal", "Marla")


def to_sqft(kanal: float = 0, marla: float = 0, sqft: float = 0, sarsai: float = 0, ms: float = MARLA_SQFT) -> float:
	"""Area in sqft from its parts (any part may exceed its normal range, e.g. 15 Marla 430 sqft)."""
	marlas = (kanal or 0) * MARLA_PER_KANAL + (marla or 0) + (sarsai or 0) / SARSAI_PER_MARLA
	return round(marlas * ms + (sqft or 0), 4)


def split(sqft: float, ms: float = MARLA_SQFT) -> tuple[int, int, float]:
	"""Normalise sqft to (Kanal, Marla, sqft) with Marla < 20 and sqft < one Marla."""
	sqft = max(round(sqft or 0, 4), 0.0)
	marlas = int((sqft + 1e-6) // ms)
	rest = round(sqft - marlas * ms, 2)
	return marlas // MARLA_PER_KANAL, marlas % MARLA_PER_KANAL, rest


def in_unit(sqft: float, unit: str, ms: float = MARLA_SQFT) -> float:
	"""Area expressed in Acre / Kanal / Marla (e.g. 18K-10M = 2.3125 Acre = 370 Marla)."""
	if unit not in UNITS:
		raise ValueError(f"unit must be one of {UNITS}")
	per = {"Marla": ms, "Kanal": ms * MARLA_PER_KANAL, "Acre": ms * MARLA_PER_KANAL * KANAL_PER_ACRE}[unit]
	return (sqft or 0) / per


def due_amount(sqft: float, unit: str, rate: float, ms: float = MARLA_SQFT) -> float:
	"""Due Amount = area in the line's unit x rate per that unit (rounded to paisa)."""
	return round(in_unit(sqft, unit, ms) * (rate or 0), 2)


def fmt_area(sqft: float, ms: float = MARLA_SQFT) -> str:
	"""'25K-16M-158sqft' style label (zero parts dropped, '0' for an empty area)."""
	k, m, s = split(sqft, ms)
	parts = [f"{k}K" if k else "", f"{m}M" if m else "", f"{s:g}sqft" if s else ""]
	return "-".join(p for p in parts if p) or "0"


@dataclass
class Line:
	"""One owner line of a deal, with ledger figures filled in by the caller."""
	sqft: float
	unit: str
	rate: float
	extra: float = 0.0
	paid: float = 0.0
	adjusted: float = 0.0

	def due(self, ms: float = MARLA_SQFT) -> float:
		return due_amount(self.sqft, self.unit, self.rate, ms)

	def net_due(self, ms: float = MARLA_SQFT) -> float:
		return round(self.due(ms) + (self.extra or 0), 2)

	def balance(self, ms: float = MARLA_SQFT) -> float:
		return round(self.net_due(ms) - (self.paid or 0) - (self.adjusted or 0), 2)


def deal_area(parts: list[tuple[float, float, float]], ms: float = MARLA_SQFT) -> dict:
	"""Deal subtotal: raw sums of the Kanal, Marla and sqft columns plus the normalised total."""
	k = sum(p[0] or 0 for p in parts)
	m = sum(p[1] or 0 for p in parts)
	s = sum(p[2] or 0 for p in parts)
	total = to_sqft(k, m, s, ms=ms)
	nk, nm, ns = split(total, ms)
	return {"kanal": k, "marla": m, "sqft": s, "total_sqft": total, "normalised": (nk, nm, ns), "label": fmt_area(total, ms)}


def is_overdue(mature: date | None, extended: date | None, balance: float, today: date) -> bool:
	"""Overdue when the mature date, or the latest extended date, has passed with a balance left."""
	due = extended or mature
	return bool(due and due < today and (balance or 0) > 0.5)


def add_months(d: date, months: int) -> date:
	y, m = divmod(d.month - 1 + months, 12)
	y, m = d.year + y, m + 1
	days = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
	return date(y, m, min(d.day, days))


def seller_schedule(net: float, contract_net: float, token: float, agreement: float, installments: int, first_due: date | None,
					interval_months: int, final_due: date | None, token_due: date | None = None,
					agreement_due: date | None = None) -> list[tuple[str, date | None, float]]:
	"""One seller's schedule from the contract terms, in proportion to their share of the contract (net / contract_net):
	token, agreement amount, n installments, then the final payment at registry. Rows are whole rupees and always sum to
	the seller's net exactly (the final row absorbs rounding)."""
	net = round(net or 0, 2)
	if net <= 0:
		return []
	share = (net / contract_net) if contract_net else 1.0
	rows: list[tuple[str, date | None, float]] = []
	left = net

	def take(label: str, due: date | None, amount: float):
		nonlocal left
		amount = min(round(amount), round(left, 2))
		if amount > 0:
			rows.append((label, due, float(amount)))
			left = round(left - amount, 2)

	take("Token (bayana)", token_due, (token or 0) * share)
	take("Agreement amount", agreement_due, (agreement or 0) * share)
	n = max(int(installments or 0), 0)
	if n and first_due:
		body = left if not final_due else left * n / (n + 1)  # keep a share for the final payment at registry
		each = body / n
		for i in range(n):
			take(f"Installment {i + 1}", add_months(first_due, i * max(int(interval_months or 1), 1)), each)
	if left > 0:
		rows.append(("Final payment at registry", final_due, round(left, 2)))
	return rows


def allocate(rows: list[float], paid: float) -> list[float]:
	"""Spread a paid total over schedule rows in order (oldest first); returns the paid amount per row."""
	out, left = [], max(paid or 0, 0)
	for amount in rows:
		p = min(amount, left)
		out.append(round(p, 2))
		left = round(left - p, 2)
	return out


def schedule_status(amount: float, paid: float, due: date | None, today: date, window_days: int = 7) -> str:
	if paid >= amount - 0.5:
		return "Paid"
	if due and due < today:
		return "Overdue"
	if due and (due - today).days <= window_days:
		return "Due"
	return "Partly Paid" if paid > 0.5 else "Unpaid"


_RANGE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")


def parse_numbers(text: str | None, max_span: int = 200) -> list[str]:
	"""Khewat / khatooni / square / killa / khasra lists: '43-44' -> ['43', '44']; '5/2,16,17' -> ['5/2', '16', '17'].
	Ranges expand only for plain whole numbers in ascending order within max_span; anything else is kept as written."""
	out: list[str] = []
	for part in re.split(r"[,;\n]+", text or ""):
		part = part.strip()
		if not part:
			continue
		m = _RANGE.match(part)
		if m and int(m.group(1)) <= int(m.group(2)) <= int(m.group(1)) + max_span:
			out.extend(str(i) for i in range(int(m.group(1)), int(m.group(2)) + 1))
		else:
			out.append(re.sub(r"\s+", "", part))
	seen: set[str] = set()
	return [x for x in out if not (x in seen or seen.add(x))]


def oversold(parcel_sqft: float, sold: list[float], tolerance: float = 1.0) -> float:
	"""How many sqft of a khasra are sold beyond its fard area (0 when within)."""
	return max(round(sum(sold) - (parcel_sqft or 0), 2), 0.0) if sum(sold) > (parcel_sqft or 0) + tolerance else 0.0
