"""WhatsApp Message extensions.

- Location (map pin) messages — the whatsapp app has no location type, so add one to its payload builder.
- Compatibility with Frappe CRM's WhatsApp hooks, which were written for the older frappe_whatsapp schema
  (`type`, `reference_name`); without these aliases every WhatsApp Message save raises AttributeError
  on sites that have both crm and whatsapp installed.
"""


class LocationMessageMixin:
	@property
	def type(self):
		return self.direction

	@property
	def reference_name(self):
		return self.reference_docname

	@reference_name.setter
	def reference_name(self, value):
		# CRM's contact match; realestate.whatsapp.inbox.link_party decides the reference
		self.flags.crm_reference_name = value

	def _build_payload(self) -> dict:
		if self.get("re_latitude") and not self.is_template:
			import frappe

			phone = frappe.get_cached_doc("WhatsApp Profile", self.to).phone_number
			location = {"latitude": float(self.re_latitude), "longitude": float(self.re_longitude)}
			if self.get("re_location_name"):
				location["name"] = self.re_location_name
			if self.get("re_location_address"):
				location["address"] = self.re_location_address
			return {"messaging_product": "whatsapp", "recipient_type": "individual", "to": phone,
					"type": "location", "location": location}
		return super()._build_payload()
