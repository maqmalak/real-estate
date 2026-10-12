"""How fast agents answer incoming WhatsApp messages: first agent reply after each unanswered customer message."""

import statistics

import frappe

from realestate import scope
from frappe import _
from frappe.utils import add_days, get_datetime, get_fullname, now_datetime, time_diff_in_seconds

SYSTEM = ("Administrator", "Guest")


def execute(filters=None):
	filters = filters or {}
	sla = (filters.get("sla_minutes") or 30) * 60
	rng = [filters.get("from_date") or "2000-01-01", add_days(filters.get("to_date") or "2100-01-01", 1)]
	msgs = frappe.get_all("WhatsApp Message", {"creation": ("between", rng), "reaction": ("is", "not set")},
						  ["to", "direction", "owner", "creation", "timestamp"], order_by="creation asc", limit=0)
	agents_of = dict(frappe.get_all("RE Conversation", fields=["name", "agent"], as_list=True))
	waiting, stats = {}, {}

	def bucket(agent):
		return stats.setdefault(agent or _("Unassigned"), {"times": [], "unanswered": 0, "chats": set()})

	for m in msgs:
		at = get_datetime(m.timestamp or m.creation)
		if m.direction == "Incoming":
			waiting.setdefault(m.to, at)
		elif m.owner not in SYSTEM and m.to in waiting:
			b = bucket(m.owner)
			b["times"].append(time_diff_in_seconds(at, waiting.pop(m.to)))
			b["chats"].add(m.to)
	for profile, since in waiting.items():
		b = bucket(agents_of.get(profile))
		b["unanswered"] += 1
		b["chats"].add(profile)
	data = []
	for agent, b in stats.items():
		t = b["times"]
		data.append({
			"agent": agent, "agent_name": get_fullname(agent) if "@" in agent else agent, "chats": len(b["chats"]), "replies": len(t),
			"avg_min": round(sum(t) / len(t) / 60, 1) if t else None, "median_min": round(statistics.median(t) / 60, 1) if t else None,
			"within_sla": round(sum(1 for x in t if x <= sla) * 100 / len(t), 1) if t else 0, "unanswered": b["unanswered"],
		})
	data.sort(key=lambda d: (d["avg_min"] is None, d["avg_min"] or 0))
	if scope.agent():  # an agent sees only their own row
		data = [d for d in data if d["agent"] == scope.agent()]
	columns = [{"fieldname": "agent_name", "label": _("Agent"), "fieldtype": "Data", "width": 160},
			   {"fieldname": "chats", "label": _("Chats"), "fieldtype": "Int", "width": 80},
			   {"fieldname": "replies", "label": _("Replies"), "fieldtype": "Int", "width": 80},
			   {"fieldname": "avg_min", "label": _("Avg Response (min)"), "fieldtype": "Float", "precision": 1, "width": 150},
			   {"fieldname": "median_min", "label": _("Median (min)"), "fieldtype": "Float", "precision": 1, "width": 110},
			   {"fieldname": "within_sla", "label": _("Within SLA %"), "fieldtype": "Percent", "width": 110},
			   {"fieldname": "unanswered", "label": _("Waiting for Reply"), "fieldtype": "Int", "width": 130}]
	chart = {"data": {"labels": [d["agent_name"] for d in data], "datasets": [{"name": _("Avg minutes"), "values": [d["avg_min"] or 0 for d in data]}]},
			 "type": "bar", "colors": ["#16a34a"]}
	return columns, data, None, chart
