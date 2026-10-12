import frappe
from frappe.model.document import Document


class REMaintenancePlan(Document):
	@frappe.whitelist()
	def create_task_now(self):
		from realestate.maintenance import create_task

		self.check_permission("write")
		self.db_set("last_task", create_task(self.title, self.maintenance_type, self.project, self.assign_to, f"{frappe.utils.nowdate()} 17:00:00",
											 self.priority, (self.checklist or "").replace("\n", "<br>"), "Planned Maintenance",
											 block=self.block, map_feature=self.map_feature, plan=self.name))
		return self.last_task
