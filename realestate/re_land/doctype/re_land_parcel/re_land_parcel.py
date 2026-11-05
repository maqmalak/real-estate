import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt

from realestate import land
from realestate import land_calc as L


class RELandParcel(Document):
	"""A khasra: revenue record, area per fard, co-owners and their shares, the acquisition stage (with history) and the
	due diligence checklist that gates the agreement stage."""

	def validate(self):
		ms = land.marla_sqft()
		self.area_sqft = L.to_sqft(cint(self.area_kanal), flt(self.area_marla), sarsai=flt(self.area_sarsai), ms=ms)
		self.area_acre = round(L.in_unit(self.area_sqft, "Acre", ms), 4)
		self.area_display = L.fmt_area(self.area_sqft, ms)
		self.title = f"{self.mauza or 'Mauza ?'} · Khasra {self.khasra_nos}"
		self.location_index = land.location_index(khewat=self.khewat_no, khatooni=self.khatooni_no, square=self.square_no,
												  killa=self.killa_nos, khasra=self.khasra_nos)
		self._owners(ms)
		self._checklist()
		self._stage()

	def _owners(self, ms):
		seen = set()
		for o in self.owners:
			if o.land_owner in seen:
				frappe.throw(_("Row {0}: {1} is listed twice").format(o.idx, o.owner_name or o.land_owner))
			seen.add(o.land_owner)
			o.share_sqft_total = L.to_sqft(cint(o.share_kanal), flt(o.share_marla), flt(o.share_sqft), ms=ms)
			o.share_pct = round(o.share_sqft_total / self.area_sqft * 100, 4) if self.area_sqft else 0
		self.owners_sqft = sum(o.share_sqft_total for o in self.owners)
		if self.area_sqft and self.owners_sqft > self.area_sqft + 1:
			frappe.throw(_("Co-owners' shares ({0}) exceed the khasra's area per fard ({1})").format(
				L.fmt_area(self.owners_sqft, ms), self.area_display), title=_("Shares exceed the fard"))
		if self.owners and self.area_sqft and abs(self.owners_sqft - self.area_sqft) > 1:
			frappe.msgprint(_("Co-owners' shares add up to {0} of {1} — check the fard").format(
				L.fmt_area(self.owners_sqft, ms), self.area_display), indicator="orange", alert=True)

	def _checklist(self):
		if not self.checks:
			for item, mandatory in land.CHECKLIST:
				self.append("checks", {"item": item, "mandatory": mandatory, "status": "Pending"})
		for c in self.checks:
			if c.status == "Verified" and not c.verified_by:
				c.verified_by, c.verified_on = frappe.session.user, frappe.utils.nowdate()
		self.diligence_clear = int(all(c.status == "Verified" for c in self.checks if c.mandatory))

	def pending_checks(self) -> list[str]:
		return [c.item for c in self.checks if c.mandatory and c.status != "Verified"]

	def _stage(self):
		before = self.get_doc_before_save()
		old = before.stage if before else None
		if self.stage == old:
			return
		if self.stage in land.AGREEMENT_PLUS and not (self.diligence_clear or self.diligence_override):
			frappe.throw(_("{0} needs the mandatory due diligence checks first: {1}. An Admin can override with a reason.").format(
				self.stage, ", ".join(self.pending_checks())), title=_("Due diligence pending"))
		if not self.stages or self.stages[-1].stage != self.stage:
			land.stage_row(self, self.stage)

	@frappe.whitelist()
	def override_diligence(self, reason: str):
		"""Admin only: let this parcel reach the agreement stage before every mandatory check passes."""
		if "System Manager" not in frappe.get_roles():
			frappe.throw(_("Only an Admin can override due diligence"), frappe.PermissionError)
		if not (reason or "").strip():
			frappe.throw(_("Give a reason for the override"))
		self.diligence_override, self.override_reason, self.override_by = 1, reason.strip(), frappe.session.user
		self.add_comment("Info", _("Due diligence overridden: {0}").format(reason.strip()))
		self.save()

	@frappe.whitelist()
	def set_stage(self, stage: str, notes: str | None = None):
		if stage not in land.STAGES:
			frappe.throw(_("Unknown stage {0}").format(stage))
		self.stage = stage
		self.save()
		if notes and self.stages:
			self.stages[-1].db_set("notes", notes)
