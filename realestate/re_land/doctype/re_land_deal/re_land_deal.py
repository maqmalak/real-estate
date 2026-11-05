import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate

from realestate import land
from realestate import land_calc as L

LOCKED_FIELDS = ("land_owner", "parcel", "kanal", "marla", "sqft", "unit", "rate")
AFTER_EXECUTION = ("Executed", "In Payment", "Completed", "Closed")
STICKY = ("Cancelled", "Disputed", "Closed")


class RELandDeal(Document):
	"""The client's Land Purchase Deal and the iqrar nama (multi-owner agreement to sell) in one record.

	Owner lines carry area, unit and rate; Due = area in unit x rate, Net Due = Due + approved extensions, Paid and
	Adjusted come from the owner's ledger and Balance = Net Due - Paid - Adjusted. Once approved (or executed) the
	economic fields change only through approved amendments."""

	# ---------------------------------------------------------------- validate
	def validate(self):
		self.ms = land.marla_sqft()
		self._guard_locked()
		self._lines()
		self._totals()
		self._checks()
		self._status()
		self._refresh_schedule()

	def _guard_locked(self):
		before = self.get_doc_before_save()
		if not before or self.flags.amending:
			return
		if not (before.workflow_state == "Approved" or before.status in AFTER_EXECUTION):
			return
		old = {r.name: r for r in before.lines}
		new_names = {r.name for r in self.lines}
		for row in self.lines:
			prev = old.get(row.name)
			if not prev:
				frappe.throw(_("Owner lines of an approved deal are added through an amendment (row {0})").format(row.idx))
			if (row.status == "Cancelled") != (prev.status == "Cancelled"):
				frappe.throw(_("Row {0} ({1}): owners are cancelled or restored through an amendment").format(row.idx, row.owner_name))
			changed = [f for f in LOCKED_FIELDS if str(prev.get(f) or "") != str(row.get(f) or "")]
			if changed:
				frappe.throw(_("Row {0} ({1}): {2} cannot change on an approved deal — request an amendment").format(
					row.idx, row.owner_name, ", ".join(changed)), title=_("Approved deal"))
		if set(old) - new_names:
			frappe.throw(_("Owner lines of an approved deal are removed through an amendment"))

	def _lines(self):
		used = {cint(r.ser) for r in self.lines if cint(r.ser)}
		nxt = max(used or {0})
		ext = self._extensions()
		ledger = land.line_ledger(self)
		today = land.today()
		for r in self.lines:
			if not cint(r.ser):
				nxt += 1
				r.ser = nxt
			o = frappe.db.get_value("RE Land Owner", r.land_owner, ["display_name", "supplier", "iban", "bank_name"], as_dict=True) or {}
			r.owner_name = o.get("display_name") or r.land_owner
			r.supplier = o.get("supplier")
			if not r.bank_account and o.get("iban"):
				r.bank_account = " ".join(x for x in (o.get("bank_name"), o.get("iban")) if x)
			r.unit = r.unit or self.rate_unit or "Kanal"
			if not flt(r.rate) and flt(self.default_rate) and r.unit == self.rate_unit:
				r.rate = self.default_rate
			if not r.mature_date:
				r.mature_date = self.registry_deadline
			r.area_sqft = L.to_sqft(cint(r.kanal), flt(r.marla), flt(r.sqft), ms=self.ms)
			r.total_area = round(L.in_unit(r.area_sqft, r.unit, self.ms), 4)
			e = ext.get(cint(r.ser), {})
			led = ledger.get(cint(r.ser), {})
			line = L.Line(r.area_sqft, r.unit, flt(r.rate), extra=e.get("extra", 0), paid=led.get("paid", 0), adjusted=led.get("adjusted", 0))
			r.due_amount = line.due(self.ms)
			r.extra_amount = e.get("extra", 0)
			r.date_ext = e.get("date")
			r.net_due = line.net_due(self.ms)
			r.paid_amount, r.adjusted_amount = line.paid, line.adjusted
			# a cancelled owner keeps what the ledger says: negative while a refund is due back from them
			r.balance = line.balance(self.ms) if r.status != "Cancelled" else round(led.get("invoiced", 0) - line.paid - line.adjusted, 2)
			r.overdue = int(r.status != "Cancelled" and L.is_overdue(getdate(r.mature_date) if r.mature_date else None,
																	  getdate(r.date_ext) if r.date_ext else None, r.balance, today))
			if r.signed and not r.signed_on:
				r.signed_on = frappe.utils.nowdate()

	def _extensions(self) -> dict[int, dict]:
		out: dict[int, dict] = {}
		for e in self.extensions:
			if e.status != "Approved":
				continue
			d = out.setdefault(cint(e.ser), {"extra": 0.0, "date": None})
			d["extra"] = round(d["extra"] + flt(e.extra_amount), 2)
			d["date"] = max(filter(None, [d["date"], getdate(e.new_date)]))
		return out

	def active(self):
		return [r for r in self.lines if r.status != "Cancelled"]

	def _totals(self):
		act = self.active()
		area = L.deal_area([(cint(r.kanal), flt(r.marla), flt(r.sqft)) for r in act], self.ms)
		self.total_kanal, self.total_marla, self.total_sqft = area["kanal"], area["marla"], area["sqft"]
		self.deal_area_sqft, self.deal_area_display = area["total_sqft"], area["label"]
		for f in ("due_amount", "extra_amount", "paid_amount", "adjusted_amount"):
			self.set(f, round(sum(flt(r.get(f)) for r in act), 2))
		self.net_due_amount = round(sum(flt(r.net_due) for r in act), 2)
		self.balance_amount = round(sum(flt(r.balance) for r in self.lines), 2)  # includes refunds due from cancelled owners
		self.overdue_lines = sum(1 for r in act if r.overdue)
		for r in self.lines:
			r.share_pct = round(r.area_sqft / self.deal_area_sqft * 100, 4) if self.deal_area_sqft and r.status != "Cancelled" else 0
		members = sum(len([m for m in (r.group_members or "").splitlines() if m.strip()]) or 1 for r in act)
		self.land_owners_type = "MULTI" if members > 1 else "SINGLE"
		self.commission_amount = round(self.due_amount * flt(self.commission_pct) / 100, 2)
		self.transfer_cost_total = round(sum(flt(c.amount) for c in self.get("costs") or []), 2)
		parcels = list(dict.fromkeys(r.parcel for r in self.lines if r.parcel))
		khasras = [frappe.db.get_value("RE Land Parcel", p, "khasra_nos") for p in parcels]
		self.khasras = ", ".join(k for k in khasras if k)
		self.location_index = land.location_index(khewat=self.khewat_no, khatooni=self.khatooni_no, square=self.square_no,
												  killa=self.killa_nos, khasra=",".join(k for k in khasras if k))
		seller_lines = [r for r in act]
		self.signed_count = _("{0} / {1} sellers · {2} / 2 witnesses").format(
			sum(1 for r in seller_lines if r.signed), len(seller_lines), int(bool(self.witness_1_signed)) + int(bool(self.witness_2_signed)))

	def _checks(self):
		if flt(self.contract_total) and abs(self.due_amount - flt(self.contract_total)) > 1:
			frappe.throw(_("The owner lines' due amounts add up to Rs {0}, but the agreed total is Rs {1}").format(
				frappe.utils.fmt_money(self.due_amount, 0), frappe.utils.fmt_money(self.contract_total, 0)), title=_("Totals do not match"))
		by_parcel: dict[str, float] = {}
		for r in self.active():
			if r.parcel:
				by_parcel[r.parcel] = by_parcel.get(r.parcel, 0) + r.area_sqft
		for parcel, here in by_parcel.items():
			p = frappe.db.get_value("RE Land Parcel", parcel, ["area_sqft", "khasra_nos", "area_display"], as_dict=True)
			elsewhere = flt(frappe.db.sql("""select sum(l.area_sqft) from `tabRE Land Deal Line` l join `tabRE Land Deal` d on d.name=l.parent
				where l.parcel=%s and l.status!='Cancelled' and d.name!=%s and d.status!='Cancelled'""", (parcel, self.name or ""))[0][0])
			fard = {o.land_owner: o.share_sqft_total for o in frappe.get_all("RE Parcel Owner", {"parent": parcel, "parenttype": "RE Land Parcel"},
																		   ["land_owner", "share_sqft_total"])}
			sellers = {r.land_owner for r in self.active() if r.parcel == parcel}
			for r in self.active():
				if r.parcel == parcel and r.land_owner in fard and r.line_type == "Owner" and r.area_sqft > fard[r.land_owner] + 1:
					frappe.throw(_("Row {0}: {1} owns {2} of khasra {3} per fard but sells {4}").format(
						r.idx, r.owner_name, L.fmt_area(fard[r.land_owner], self.ms), p.khasra_nos, L.fmt_area(r.area_sqft, self.ms)))
			over = L.oversold(flt(p.area_sqft), [here, elsewhere])
			if over:
				frappe.throw(_("Khasra {0} is oversold by {1}: its fard area is {2}, this deal buys {3} and other deals {4}").format(
					p.khasra_nos, L.fmt_area(over, self.ms), p.area_display, L.fmt_area(here, self.ms), L.fmt_area(elsewhere, self.ms)),
					title=_("Khasra oversold"))
			missing = [frappe.db.get_value("RE Land Owner", o, "display_name") for o in fard if o not in sellers]
			if missing:
				frappe.msgprint(_("Partial purchase of khasra {0}: co-owners not in this deal — {1}").format(p.khasra_nos, ", ".join(missing)),
								indicator="orange", alert=True)

	def _status(self):
		if self.status in STICKY:
			return
		act = self.active()
		signed = sum(1 for r in act if r.signed)
		witnesses = bool(self.witness_1_signed) and bool(self.witness_2_signed)
		if act and signed == len(act) and witnesses:
			status = "Executed"
		elif signed or self.witness_1_signed or self.witness_2_signed:
			status = "Partially Signed"
		else:
			status = "Draft"
		if status == "Executed":
			self._diligence_gate()
			if flt(self.paid_amount) + flt(self.adjusted_amount) > flt(self.token_amount) + 1:  # the token alone is part of signing
				status = "In Payment"
			if act and all(r.status in ("Registry Done", "Mutation Done") for r in act):
				status = "Completed"
		self.status = status

	def _diligence_gate(self):
		blocked = []
		for parcel in {r.parcel for r in self.active() if r.parcel}:
			p = frappe.get_doc("RE Land Parcel", parcel)
			if not (p.diligence_clear or p.diligence_override):
				blocked.append(f"{p.khasra_nos} ({', '.join(p.pending_checks())})")
		if blocked:
			frappe.throw(_("The agreement cannot be executed before the mandatory due diligence checks pass: {0}").format("; ".join(blocked)),
						 title=_("Due diligence pending"))

	def _refresh_schedule(self):
		paid = {cint(r.ser): flt(r.paid_amount) + flt(r.adjusted_amount) for r in self.lines}
		today = land.today()
		window = cint(frappe.db.get_single_value("RE Settings", "land_due_window_days")) or 7
		by_ser: dict[int, list] = {}
		for s in self.schedule:
			if s.status == "Refund":
				continue
			by_ser.setdefault(cint(s.ser), []).append(s)
		for ser, rows in by_ser.items():
			rows.sort(key=lambda s: (getdate(s.due_date) if s.due_date else getdate("2999-12-31")))
			for s, p in zip(rows, L.allocate([flt(s.amount) for s in rows], paid.get(ser, 0))):
				s.paid = p
				s.status = L.schedule_status(flt(s.amount), p, getdate(s.due_date) if s.due_date else None, today, window)

	# ---------------------------------------------------------------- after save
	def on_update(self):
		self._sync_parcels()
		self._post()

	def _post(self):
		"""Accounting: invoices on approval, then whatever an approved extension or amendment queued."""
		from realestate import land_accounts as A

		before = self.get_doc_before_save()
		approved = self.workflow_state == "Approved"
		if approved and (not before or before.workflow_state != "Approved"):
			A.post_deal(self)
		if not approved:
			return
		for kind, ser, amount, reason in self.flags.get("postings") or []:
			line = self._line(ser)
			if kind == "line":
				A.post_line(self, line)
			elif kind == "invoice":
				A.purchase_invoice(self, line, amount, A.settings().land_cwip_account, reason, due_date=line.mature_date)
			elif kind == "debit":
				A.debit_note(self, line, amount, reason)
		for e in self.extensions:
			A.post_extension(self, e)
		if self.flags.get("postings"):
			self.flags.postings = []
			self.reload()
			self.flags.amending = True
			self.save()  # Paid / Balance from the ledger again

	def _sync_parcels(self):
		"""Move each khasra forward along the pipeline as the contract progresses (never backwards)."""
		target = {"Executed": "Agreement Signed", "In Payment": "Payment in Progress", "Completed": "Registry / Mutation Done",
				  "Closed": "Registry / Mutation Done", "Disputed": "Disputed"}.get(self.status)
		if not target:
			return
		for parcel in {r.parcel for r in self.active() if r.parcel}:
			p = frappe.get_doc("RE Land Parcel", parcel)
			ahead = target == "Disputed" or (p.stage in land.PIPELINE and land.PIPELINE.index(target) > land.PIPELINE.index(p.stage))
			if ahead and p.stage != target:
				p.stage = target
				land.stage_row(p, target, _("From land deal {0}").format(self.name))
				p.flags.ignore_permissions = True
				p.save()

	# ---------------------------------------------------------------- actions
	@frappe.whitelist()
	def make_schedule(self):
		"""(Re)build every seller's payment schedule from the contract terms, in proportion to their share of the price."""
		if any(flt(r.paid_amount) or flt(r.adjusted_amount) for r in self.lines):
			frappe.throw(_("Payments are already recorded — the schedule can no longer be regenerated"))
		contract = sum(flt(r.due_amount) for r in self.active())
		self.set("schedule", [])
		for r in self.active():
			final = getdate(r.mature_date) if r.mature_date else (getdate(self.registry_deadline) if self.registry_deadline else None)
			rows = L.seller_schedule(flt(r.due_amount), contract, flt(self.token_amount), flt(self.agreement_amount), cint(self.installments),
									 getdate(self.first_installment_date) if self.first_installment_date else None,
									 cint(self.installment_months) or 1, final,
									 getdate(self.token_date) if self.token_date else None,
									 getdate(self.agreement_date) if self.agreement_date else None)
			for label, due, amount in rows:
				self.append("schedule", {"ser": r.ser, "label": label, "due_date": due, "amount": amount})
		for e in self.extensions:
			if e.status == "Approved":
				self.append("schedule", {"ser": e.ser, "label": _("Extension"), "due_date": e.new_date, "amount": e.extra_amount})
		self.save()
		return len(self.schedule)

	def _line(self, ser) -> "Document":
		row = next((r for r in self.lines if cint(r.ser) == cint(ser)), None)
		if not row:
			frappe.throw(_("No owner line with Ser# {0}").format(ser))
		return row

	@frappe.whitelist()
	def request_extension(self, ser: int, extra_amount: float, new_date: str, reason: str):
		row = self._line(ser)
		if row.status == "Cancelled":
			frappe.throw(_("That owner line is cancelled"))
		if getdate(new_date) <= getdate(row.date_ext or row.mature_date or new_date):
			frappe.throw(_("The new date must be after the current mature date"))
		self.append("extensions", {"ser": row.ser, "extra_amount": flt(extra_amount), "new_date": new_date, "reason": reason,
								   "status": "Pending", "requested_by": frappe.session.user})
		self.save()

	@frappe.whitelist()
	def decide_extension(self, row: str, approve: int):
		e = next((x for x in self.extensions if x.name == row), None)
		if not e or e.status != "Pending":
			frappe.throw(_("No pending extension {0}").format(row))
		self._approver(e.requested_by)
		e.status, e.approved_by, e.approved_on = ("Approved" if cint(approve) else "Rejected"), frappe.session.user, land.now()
		if e.status == "Approved" and self.schedule:
			self.append("schedule", {"ser": e.ser, "label": _("Extension"), "due_date": e.new_date, "amount": e.extra_amount})
		self.flags.amending = True
		self.save()

	@frappe.whitelist()
	def request_amendment(self, amendment_type: str, details: str, ser: int | None = None, data: str | dict | None = None):
		if amendment_type != "Add Seller":
			self._line(ser)
		payload = json.loads(data) if isinstance(data, str) and data else (data or {})
		self.append("amendments", {"amendment_type": amendment_type, "ser": cint(ser) or None, "details": details,
								   "data": json.dumps(payload), "status": "Pending", "requested_by": frappe.session.user, "requested_on": land.now()})
		self.save()

	@frappe.whitelist()
	def decide_amendment(self, row: str, approve: int):
		a = next((x for x in self.amendments if x.name == row), None)
		if not a or a.status != "Pending":
			frappe.throw(_("No pending amendment {0}").format(row))
		self._approver(a.requested_by)
		a.status, a.approved_by, a.approved_on = ("Approved" if cint(approve) else "Rejected"), frappe.session.user, land.now()
		if a.status == "Approved":
			self._apply(a, json.loads(a.data or "{}"))
		self.flags.amending = True
		self.save()

	def _apply(self, a, data: dict):
		postings = self.flags.setdefault("postings", [])
		if a.amendment_type == "Add Seller":
			data.setdefault("land_owner", data.pop("owner", None))
			if not data.get("land_owner"):
				frappe.throw(_("The amendment has no owner"))
			ser = max([cint(r.ser) for r in self.lines] or [0]) + 1
			self.append("lines", {"ser": ser, **{k: data.get(k) for k in ("land_owner", "parcel", "kanal", "marla", "sqft", "unit", "rate", "mature_date",
																		  "line_type", "group_members", "attorney") if data.get(k) is not None}})
			postings.append(("line", ser, 0, a.details))
			return
		line = self._line(a.ser)
		if a.amendment_type == "Change Share":
			old_due = flt(line.due_amount)
			data.setdefault("land_owner", data.pop("owner", None))
			for k in ("kanal", "marla", "sqft", "rate", "unit", "land_owner"):
				if data.get(k) is not None:
					line.set(k, data[k])
			ms = land.marla_sqft()
			new_due = L.due_amount(L.to_sqft(cint(line.kanal), flt(line.marla), flt(line.sqft), ms=ms), line.unit, flt(line.rate), ms)
			diff = round(new_due - old_due, 2)
			if line.purchase_invoice and abs(diff) > 0.5:
				postings.append(("invoice" if diff > 0 else "debit", line.ser, abs(diff), _("Share changed: {0}").format(a.details)))
		elif a.amendment_type in ("Remove Seller", "Partial Cancellation"):
			refund = flt(line.paid_amount)
			if line.purchase_invoice:
				postings.append(("debit", line.ser, flt(line.net_due), _("Owner cancelled: {0}").format(a.details)))
			line.status = "Cancelled"
			if refund > 0.5:
				self.append("schedule", {"ser": line.ser, "label": _("Refund to cancelled owner"), "due_date": data.get("refund_date") or frappe.utils.nowdate(),
										 "amount": refund, "status": "Refund"})

	def _approver(self, requested_by: str | None):
		if not land.is_approver():
			frappe.throw(_("Only an Admin or Accounts Manager can approve this"), frappe.PermissionError)
		if requested_by == frappe.session.user and "System Manager" not in frappe.get_roles():
			frappe.throw(_("Someone other than the requester must approve it"))

	@frappe.whitelist()
	def estimate_transfer_costs(self):
		"""Fill the transfer costs from RE Transfer Cost Rate (province in RE Settings, latest fiscal year); posted rows are kept."""
		from realestate import land_accounts as A

		added = A.estimate_transfer_costs(self)
		self.flags.amending = True
		self.save()
		return added

	@frappe.whitelist()
	def post_transfer_costs(self):
		"""Post every transfer cost row that has a payee and no invoice yet (Dr Land Under Acquisition, Cr the payee)."""
		from realestate import land_accounts as A

		if not set(frappe.get_roles()) & {"System Manager", "Land Manager", "Accounts User", "Accounts Manager"}:
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		posted = A.post_transfer_costs(self)
		self.reload()
		return posted

	@frappe.whitelist()
	def capitalise(self):
		"""Admin / Accounts Manager: move the land cost from Land Under Acquisition to the project's land cost."""
		from realestate import land_accounts as A

		if not land.is_approver():
			frappe.throw(_("Only an Admin or Accounts Manager can capitalise land"), frappe.PermissionError)
		je = A.capitalise(self)
		self.db_set("capitalisation_entry", je)
		self.add_comment("Info", _("Land cost capitalised in {0}").format(je))
		return je

	@frappe.whitelist()
	def refresh_ledger(self):
		"""Re-read Paid / Adjusted / Balance from the vouchers (after a payment, adjustment or cancellation)."""
		self.flags.amending = True
		self.flags.ignore_permissions = True
		self.save()

	@frappe.whitelist()
	def set_status(self, status: str, reason: str | None = None):
		"""Cancel, mark disputed, close (after completion) or reopen a deal."""
		if status not in ("Cancelled", "Disputed", "Closed", "Reopen"):
			frappe.throw(_("Unknown status {0}").format(status))
		if status == "Closed" and self.status != "Completed":
			frappe.throw(_("Only a completed deal can be closed"))
		if status in ("Cancelled", "Disputed") and not (reason or "").strip():
			frappe.throw(_("Give a reason"))
		if status == "Cancelled" and (self.paid_amount or self.adjusted_amount):
			frappe.throw(_("Payments exist — cancel owners through amendments so refunds are scheduled"))
		self.status = "Draft" if status == "Reopen" else status
		self.status_reason = reason
		self.flags.amending = True
		self.save()
		self.add_comment("Info", _("Deal {0}{1}").format(self.status, f": {reason}" if reason else ""))
