"""Desk entry points: dashboard (cards + charts), workspace, sidebar and the desktop icon."""

import json

import frappe

OPEN_TASK = ["Backlog", "Todo", "In Progress"]

NUMBER_CARDS = [
	# label, doctype, function, field, filters, dynamic filters, colour
	("Available Plots", "RE Plot", "Count", None, [["RE Plot", "status", "=", "Available"]], None, "#22c55e"),
	("Booked / Sold Plots", "RE Plot", "Count", None, [["RE Plot", "status", "in", ["Booked", "Sold"]]], None, "#3b82f6"),
	("Overdue Installments (PKR)", "RE Booking", "Sum", "overdue_amount", [["RE Booking", "docstatus", "=", 1]], None, "#ef4444"),
	("Collected This Month (PKR)", "RE Payment", "Sum", "amount",
	 [["RE Payment", "docstatus", "=", 1], ["RE Payment", "posting_date", "Timespan", "this month"]], None, "#0f766e"),
	("Unpaid Society Bills (PKR)", "RE Society Bill", "Sum", "outstanding_amount",
	 [["RE Society Bill", "status", "in", ["Unpaid", "Partly Paid", "Due", "Overdue"]]], None, "#f59e0b"),
	("Open Leads", "CRM Lead", "Count", None, [["CRM Lead", "converted", "=", 0], ["CRM Lead", "status", "not in", ["Junk", "Unqualified"]]], None, "#8b5cf6"),
	("Expiring / Expired Documents", "RE Vault Document", "Count", None, [["RE Vault Document", "status", "in", ["Expiring Soon", "Expired"]]], None, "#ea580c"),
	("Transfers Awaiting Approval", "RE Plot Transfer", "Count", None, [["RE Plot Transfer", "workflow_state", "=", "Pending Approval"]], None, "#d97706"),
	("Cancellations Awaiting Approval", "RE Booking Cancellation", "Count", None, [["RE Booking Cancellation", "workflow_state", "=", "Pending Approval"]], None, "#dc2626"),
	("Unread WhatsApp Chats", "RE Conversation", "Count", None, [["RE Conversation", "unread_count", ">", 0]], None, "#16a34a"),
	("Missed Follow-ups", "CRM Task", "Count", None, [["CRM Task", "status", "in", OPEN_TASK]],
	 [["CRM Task", "due_date", "<", "frappe.datetime.now_datetime()"]], "#dc2626"),
	("Open Maintenance Tasks", "Task", "Count", None, [["Task", "re_project", "is", "set"],
													  ["Task", "status", "in", ["Open", "Working", "Pending Review", "Overdue"]]], None, "#ea580c"),
	("My Open ToDos", "ToDo", "Count", None, [["ToDo", "status", "=", "Open"]], [["ToDo", "allocated_to", "=", "frappe.session.user"]], "#0ea5e9"),
]

CHARTS = [
	# name, doctype, chart type, kind, extra
	("RE Plots by Status", "RE Plot", "Group By", "Donut", {"group_by_based_on": "status"}),
	("RE Plot Payment Status", "RE Plot", "Group By", "Pie", {"group_by_based_on": "payment_status",
															 "filters_json": json.dumps([["RE Plot", "payment_status", "is", "set"]])}),
	("RE Monthly Collections", "RE Payment", "Sum", "Bar", {"based_on": "posting_date", "value_based_on": "amount", "timespan": "Last Year",
															"time_interval": "Monthly", "timeseries": 1, "filters_json": json.dumps([["RE Payment", "docstatus", "=", 1]])}),
	("RE Bookings by Status", "RE Booking", "Group By", "Donut", {"group_by_based_on": "status",
																 "filters_json": json.dumps([["RE Booking", "docstatus", "=", 1]])}),
	("RE Leads by Source", "CRM Lead", "Group By", "Bar", {"group_by_based_on": "source"}),
	("RE Society Bills by Status", "RE Society Bill", "Group By", "Pie", {"group_by_based_on": "status"}),
	("RE Calls by Outcome", "CRM Call Log", "Group By", "Bar", {"group_by_based_on": "re_outcome"}),
	("RE Reminders by Status", "RE Reminder Log", "Group By", "Donut", {"group_by_based_on": "status"}),
	("RE Maintenance by Type", "Task", "Group By", "Bar", {"group_by_based_on": "type",
														  "filters_json": json.dumps([["Task", "re_project", "is", "set"], ["Task", "status", "in", ["Open", "Working", "Pending Review", "Overdue"]]])}),
	("RE Maintenance by Status", "Task", "Group By", "Donut", {"group_by_based_on": "status", "filters_json": json.dumps([["Task", "re_project", "is", "set"]])}),
]

REPORTS = [
	("Real Estate", ["Plot Inventory", "Installment Dues", "Collection Summary", "Society Bill Status", "Maintenance Tasks",
					 "Development Budget vs Actual", "Development Cost and Profitability", "Society Income vs Expense", "Society Defaulters",
					 "Sales by Block", "Receivables Aging", "Commission Report", "Society Dues by Charge Head"]),
	("RE CRM", ["Leads by Source", "Lead Conversion", "Agent Response Time", "Agent Activity", "Missed Follow-ups", "Recovery Promised vs Received"]),
]


def setup_desk():
	for label, doctype, fn, field, filters, dyn, colour in NUMBER_CARDS:
		doc = frappe.get_doc("Number Card", label) if frappe.db.exists("Number Card", label) else frappe.new_doc("Number Card")
		doc.update({"label": label, "type": "Document Type", "document_type": doctype, "function": fn,
					"aggregate_function_based_on": field, "filters_json": json.dumps(filters),
					"dynamic_filters_json": json.dumps(dyn) if dyn else None, "is_public": 1, "color": colour,
					"show_full_number": 1, "currency": "PKR" if fn == "Sum" else None, "module": "Real Estate"})
		if doc.is_new():
			doc.name = label
		doc.flags.ignore_permissions = True
		doc.save()
	for name, doctype, chart_type, kind, extra in CHARTS:
		doc = frappe.get_doc("Dashboard Chart", name) if frappe.db.exists("Dashboard Chart", name) else frappe.new_doc("Dashboard Chart")
		doc.update({"chart_name": name, "chart_type": chart_type, "document_type": doctype, "type": kind, "is_public": 1,
					"filters_json": "[]", "module": "Real Estate", "number_of_groups": 0, **extra})
		if chart_type == "Group By":
			doc.group_by_type = "Count"
		doc.flags.ignore_permissions = True
		doc.save()

	dash = frappe.get_doc("Dashboard", "Real Estate") if frappe.db.exists("Dashboard", "Real Estate") else frappe.new_doc("Dashboard")
	dash.dashboard_name = "Real Estate"
	dash.module = "Real Estate"
	dash.cards = []
	dash.charts = []
	for c in NUMBER_CARDS:
		dash.append("cards", {"card": c[0]})
	for i, c in enumerate(CHARTS):
		dash.append("charts", {"chart": c[0], "width": "Full" if c[0] == "RE Monthly Collections" else "Half"})
	dash.flags.ignore_permissions = True
	dash.save()

	_workspace()
	_sidebar()
	_desktop_icon()
	society_workspace()


def _workspace():
	shortcuts = [
		("Site Map", "Page", "re-site-map", "#0f766e"), ("WhatsApp Inbox", "Page", "re-inbox", "#16a34a"),
		("Plots", "DocType", "RE Plot", "#3b82f6"), ("Bookings", "DocType", "RE Booking", "#6366f1"),
		("Payments", "DocType", "RE Payment", "#0ea5e9"), ("Society Bills", "DocType", "RE Society Bill", "#f59e0b"),
		("Leads", "DocType", "CRM Lead", "#8b5cf6"), ("Deals", "DocType", "CRM Deal", "#a855f7"),
		("Maintenance Tasks", "DocType", "Task", "#ea580c"), ("My ToDos", "DocType", "ToDo", "#0ea5e9"),
		("Frappe CRM", "URL", "/crm", "#64748b"), ("Settings", "DocType", "RE Settings", "#64748b"),
	]
	cards = [
		("Land & Map", [("RE Project", "DocType"), ("RE Block", "DocType"), ("RE Plot", "DocType"), ("RE Plot Size", "DocType"),
						("RE Map Feature", "DocType"), ("RE Map Import", "DocType")]),
		("Sales & Collections", [("RE Booking", "DocType"), ("RE Payment Plan", "DocType"), ("RE Payment", "DocType"),
								 ("RE Society Bill", "DocType"), ("Customer", "DocType")]),
		("Sales Operations", [("RE Plot Transfer", "DocType"), ("RE Booking Cancellation", "DocType"), ("RE Re-allotment", "DocType"),
							  ("RE Plot Merge", "DocType"), ("RE Surcharge", "DocType"), ("RE Surcharge Waiver", "DocType"), ("RE Commission", "DocType"),
							  ("Dunning", "DocType")]),
		("CRM", [("CRM Lead", "DocType"), ("CRM Deal", "DocType"), ("RE Site Visit", "DocType"), ("CRM Call Log", "DocType"),
				 ("CRM Task", "DocType")]),
		("WhatsApp", [("RE Conversation", "DocType"), ("RE Broadcast", "DocType"), ("RE Quick Reply", "DocType"),
					  ("WhatsApp Template", "DocType"), ("RE Reminder Log", "DocType"), ("WhatsApp Message", "DocType")]),
		("Development & Buying", [("Project", "DocType"), ("Budget", "DocType"), ("Material Request", "DocType"), ("Purchase Order", "DocType"),
								  ("Purchase Receipt", "DocType"), ("Purchase Invoice", "DocType"), ("Stock Entry", "DocType"), ("Supplier", "DocType"),
								  ("Development Budget vs Actual", "Report"), ("Development Cost and Profitability", "Report")]),
		("Assets", [("Asset", "DocType"), ("Asset Category", "DocType"), ("RE Map Feature", "DocType")]),
		("Accounts", [("Sales Invoice", "DocType"), ("Payment Entry", "DocType"), ("Journal Entry", "DocType"), ("RE Charge Head", "DocType"),
					  ("Society Income vs Expense", "Report"), ("Society Defaulters", "Report")]),
		("Documents", [("RE Generated Document", "DocType"), ("RE Vault Document", "DocType")]),
		("Maintenance", [("Task", "DocType"), ("ToDo", "DocType"), ("RE Maintenance Plan", "DocType"), ("Project", "DocType"),
						 ("Task Type", "DocType"), ("Maintenance Tasks", "Report")]),
		("Reports", [(r, "Report") for _m, rs in REPORTS for r in rs]),
	]
	content = [{"id": "h1", "type": "header", "data": {"text": "<span class=\"h4\"><b>Zarmeen Gardens</b></span>", "col": 12}}]
	content += [{"id": f"nc{i}", "type": "number_card", "data": {"number_card_name": c[0], "col": 3}} for i, c in enumerate(NUMBER_CARDS)]
	content += [{"id": f"sc{i}", "type": "shortcut", "data": {"shortcut_name": s[0], "col": 3}} for i, s in enumerate(shortcuts)]
	content += [{"id": f"ch{i}", "type": "chart", "data": {"chart_name": c[0], "col": 12 if c[0] == "RE Monthly Collections" else 6}}
				for i, c in enumerate(CHARTS)]
	content += [{"id": f"cd{i}", "type": "card", "data": {"card_name": c[0], "col": 4}} for i, c in enumerate(cards)]

	ws = frappe.get_doc("Workspace", "Real Estate") if frappe.db.exists("Workspace", "Real Estate") else frappe.new_doc("Workspace")
	ws.update({"label": "Real Estate", "title": "Real Estate", "module": "Real Estate", "icon": "home", "public": 1,
			   "app": "realestate", "content": json.dumps(content), "type": "Workspace"})
	if ws.is_new():
		ws.name = "Real Estate"
	ws.shortcuts, ws.links, ws.number_cards, ws.charts = [], [], [], []
	for label, kind, target, colour in shortcuts:
		row = {"label": label, "type": kind, "color": colour}
		if kind == "URL":
			row["url"] = target
		else:
			row["link_to"] = target
		ws.append("shortcuts", row)
	for c in NUMBER_CARDS:
		ws.append("number_cards", {"number_card_name": c[0], "label": c[0]})
	for c in CHARTS:
		ws.append("charts", {"chart_name": c[0], "label": c[0]})
	for card, links in cards:
		ws.append("links", {"type": "Card Break", "label": card, "link_count": len(links)})
		for target, kind in links:
			ws.append("links", {"type": "Link", "label": target.replace("RE ", ""), "link_type": kind, "link_to": target,
								"is_query_report": 1 if kind == "Report" else 0, "onboard": 0})
	ws.flags.ignore_permissions = True
	ws.flags.ignore_links = True
	ws.save()


def _sidebar():
	items = [
		("Link", "Home", "Workspace", "Real Estate", "home"),
		("Link", "Dashboard", "Dashboard", "Real Estate", "chart"),
		("Link", "Site Map", "Page", "re-site-map", "map"),
		("Link", "WhatsApp Inbox", "Page", "re-inbox", "message-circle"),
		("Section Break", "Land & Sales", None, None, "layers"),
		("Link", "Plots", "DocType", "RE Plot", "grid"),
		("Link", "Blocks", "DocType", "RE Block", "square"),
		("Link", "Bookings", "DocType", "RE Booking", "file-check"),
		("Link", "Payments", "DocType", "RE Payment", "wallet"),
		("Link", "Society Bills", "DocType", "RE Society Bill", "receipt"),
		("Link", "Customers", "DocType", "Customer", "customer"),
		("Section Break", "CRM", None, None, "users"),
		("Link", "Leads", "DocType", "CRM Lead", "users-round"),
		("Link", "Deals", "DocType", "CRM Deal", "handshake"),
		("Link", "Site Visits", "DocType", "RE Site Visit", "map-pin"),
		("Link", "Calls", "DocType", "CRM Call Log", "phone"),
		("Link", "Follow-ups", "DocType", "CRM Task", "check-square"),
		("Link", "Broadcasts", "DocType", "RE Broadcast", "megaphone"),
		("Link", "Templates", "DocType", "WhatsApp Template", "file-text"),
		("Link", "Open Frappe CRM", "URL", None, "external-link"),
		("Section Break", "Development & Buying", None, None, "hammer"),
		("Link", "Development Projects", "DocType", "Project", "folder-kanban"),
		("Link", "Budgets", "DocType", "Budget", "target"),
		("Link", "Material Requests", "DocType", "Material Request", "clipboard-list"),
		("Link", "Purchase Orders", "DocType", "Purchase Order", "shopping-cart"),
		("Link", "Purchase Receipts", "DocType", "Purchase Receipt", "package-check"),
		("Link", "Purchase Invoices", "DocType", "Purchase Invoice", "file-text"),
		("Link", "Material Issues", "DocType", "Stock Entry", "package-minus"),
		("Link", "Assets", "DocType", "Asset", "building-2"),
		("Section Break", "Accounts & Documents", None, None, "landmark"),
		("Link", "Sales Invoices", "DocType", "Sales Invoice", "receipt"),
		("Link", "Payment Entries", "DocType", "Payment Entry", "wallet"),
		("Link", "Charge Heads", "DocType", "RE Charge Head", "list"),
		("Link", "Generated Documents", "DocType", "RE Generated Document", "file-badge"),
		("Link", "Document Vault", "DocType", "RE Vault Document", "archive"),
		("Section Break", "Maintenance", None, None, "wrench"),
		("Link", "Maintenance Tasks", "DocType", "Task", "list-checks"),
		("Link", "ToDo", "DocType", "ToDo", "check"),
		("Link", "Maintenance Plans", "DocType", "RE Maintenance Plan", "calendar-clock"),
		("Link", "Projects", "DocType", "Project", "folder"),
		("Section Break", "Reports", None, None, "sheet"),
	] + [("Link", r, "Report", r, "") for _m, rs in REPORTS for r in rs] + [
		("Section Break", "Setup", None, None, "settings"),
		("Link", "RE Settings", "DocType", "RE Settings", "settings"),
		("Link", "Project", "DocType", "RE Project", "building"),
		("Link", "Map Import", "DocType", "RE Map Import", "upload"),
		("Link", "Payment Plans", "DocType", "RE Payment Plan", "calendar"),
		("Link", "Quick Replies", "DocType", "RE Quick Reply", "zap"),
	]
	sb = frappe.get_doc("Workspace Sidebar", "Real Estate") if frappe.db.exists("Workspace Sidebar", "Real Estate") else frappe.new_doc("Workspace Sidebar")
	sb.update({"title": "Real Estate", "header_icon": "home", "app": "realestate", "module": "Real Estate"})
	sb.items = []
	in_section = False
	for kind, label, link_type, target, icon in items:
		if kind == "Section Break":
			in_section = True
			sb.append("items", {"type": kind, "label": label, "icon": icon, "indent": 1, "collapsible": 1, "keep_closed": label in ("Reports", "Setup")})
			continue
		row = {"type": "Link", "label": label, "link_type": link_type, "link_to": target, "icon": icon, "child": int(in_section)}
		if link_type == "URL":
			row["url"] = "/crm"
		sb.append("items", row)
	sb.flags.ignore_permissions = True
	sb.flags.ignore_links = True
	sb.save()


def _desktop_icon():
	icon = frappe.get_doc("Desktop Icon", "Real Estate") if frappe.db.exists("Desktop Icon", "Real Estate") else frappe.new_doc("Desktop Icon")
	icon.update({"label": "Real Estate", "icon_type": "Link", "link_type": "Workspace Sidebar", "link_to": "Real Estate",
				 "icon": "home", "app": "realestate", "hidden": 0, "standard": 0, "bg_color": "blue"})
	icon.flags.ignore_permissions = True
	icon.save()


# ---------------------------------------------------------------- Society Operations workspace (desk)
TASK_OPEN = ["Open", "Working", "Pending Review", "Overdue"]  # ERPNext Task (OPEN_TASK above is Frappe CRM's follow-up statuses)
COMPLAINT_SOURCES = ["Customer Complaint", "WhatsApp"]

SOCIETY_CARDS = [
	("Society Bills Due", "RE Society Bill", "Count", None, [["RE Society Bill", "status", "=", "Due"]], None, "#f59e0b"),
	("Society Dues Overdue (PKR)", "RE Society Bill", "Sum", "outstanding_amount", [["RE Society Bill", "status", "=", "Overdue"]], None, "#dc2626"),
	("Society Collected This Month (PKR)", "RE Payment", "Sum", "amount",
	 [["RE Payment", "docstatus", "=", 1], ["RE Payment", "payment_against", "=", "Society Bill"], ["RE Payment", "posting_date", "Timespan", "this month"]],
	 None, "#0f766e"),
	("Open Complaints", "Task", "Count", None, [["Task", "re_source", "in", COMPLAINT_SOURCES], ["Task", "status", "in", TASK_OPEN]], None, "#ea580c"),
	("Critical Complaints", "Task", "Count", None, [["Task", "re_priority", "=", "Critical"], ["Task", "status", "in", TASK_OPEN]], None, "#b91c1c"),
	("Expiring / Expired Documents", "RE Vault Document", "Count", None, [["RE Vault Document", "status", "in", ["Expiring Soon", "Expired"]]], None, "#ea580c"),
]
SOCIETY_CHARTS = [
	("RE Society Collections", "RE Payment", "Sum", "Bar", {"based_on": "posting_date", "value_based_on": "amount", "timespan": "Last Year",
		"time_interval": "Monthly", "timeseries": 1,
		"filters_json": json.dumps([["RE Payment", "docstatus", "=", 1], ["RE Payment", "payment_against", "=", "Society Bill"]])}),
	("RE Society Bills by Status", "RE Society Bill", "Group By", "Pie", {"group_by_based_on": "status"}),
	("RE Complaints by Priority", "Task", "Group By", "Donut", {"group_by_based_on": "re_priority",
		"filters_json": json.dumps([["Task", "re_project", "is", "set"], ["Task", "status", "in", TASK_OPEN]])}),
	("RE Maintenance by Type", "Task", "Group By", "Bar", {"group_by_based_on": "type",
		"filters_json": json.dumps([["Task", "re_project", "is", "set"], ["Task", "status", "in", TASK_OPEN]])}),
]
SOCIETY_REPORTS = ["Society Bill Status", "Society Defaulters", "Society Dues by Charge Head", "Society Income vs Expense", "Maintenance Tasks"]


def society_workspace():
	"""Desk workspace + sidebar + desktop icon for everything society: billing & collection, complaints & maintenance,
	infrastructure, society expenses, documents and reports."""
	for label, doctype, fn, field, filters, dyn, colour in SOCIETY_CARDS:
		doc = frappe.get_doc("Number Card", label) if frappe.db.exists("Number Card", label) else frappe.new_doc("Number Card")
		doc.update({"label": label, "type": "Document Type", "document_type": doctype, "function": fn, "aggregate_function_based_on": field,
					"filters_json": json.dumps(filters), "dynamic_filters_json": json.dumps(dyn) if dyn else None, "is_public": 1, "color": colour,
					"show_full_number": 1, "currency": "PKR" if fn == "Sum" else None, "module": "Real Estate"})
		if doc.is_new():
			doc.name = label
		doc.flags.ignore_permissions = True
		doc.save()
	for name, doctype, chart_type, kind, extra in SOCIETY_CHARTS:
		doc = frappe.get_doc("Dashboard Chart", name) if frappe.db.exists("Dashboard Chart", name) else frappe.new_doc("Dashboard Chart")
		doc.update({"chart_name": name, "chart_type": chart_type, "document_type": doctype, "type": kind, "is_public": 1, "filters_json": "[]",
					"module": "Real Estate", "number_of_groups": 0, **extra})
		if chart_type == "Group By":
			doc.group_by_type = "Count"
		doc.flags.ignore_permissions = True
		doc.save()

	shortcuts = [
		("Society Bills", "DocType", "RE Society Bill", "#f59e0b"), ("Charge Heads", "DocType", "RE Charge Head", "#0ea5e9"),
		("Society Receipts", "DocType", "RE Payment", "#0f766e"), ("Complaints", "DocType", "Task", "#ea580c"),
		("Maintenance Plans", "DocType", "RE Maintenance Plan", "#6366f1"), ("Infrastructure", "DocType", "RE Map Feature", "#64748b"),
		("Society Expenses", "DocType", "Purchase Invoice", "#e11d48"), ("Document Vault", "DocType", "RE Vault Document", "#8b5cf6"),
		("Income vs Expense", "Report", "Society Income vs Expense", "#16a34a"), ("Defaulters", "Report", "Society Defaulters", "#dc2626"),
		("Site Map", "Page", "re-site-map", "#0f766e"), ("Maintenance Report", "Report", "Maintenance Tasks", "#0ea5e9"),
	]
	cards = [
		("Billing & Collection", [("RE Society Bill", "DocType"), ("RE Charge Head", "DocType"), ("RE Payment", "DocType"), ("Sales Invoice", "DocType"),
								  ("Payment Entry", "DocType"), ("RE Reminder Log", "DocType")]),
		("Complaints & Maintenance", [("Task", "DocType"), ("Task Type", "DocType"), ("RE Maintenance Plan", "DocType"), ("ToDo", "DocType"),
									  ("Project", "DocType")]),
		("Infrastructure & Assets", [("RE Map Feature", "DocType"), ("Asset", "DocType"), ("Asset Category", "DocType"), ("Location", "DocType")]),
		("Society Expenses", [("Purchase Invoice", "DocType"), ("Supplier", "DocType"), ("Journal Entry", "DocType"), ("Budget", "DocType"),
							  ("Cost Center", "DocType")]),
		("Documents", [("RE Vault Document", "DocType"), ("RE Generated Document", "DocType")]),
		("Society Reports", [(r, "Report") for r in SOCIETY_REPORTS]),
	]
	content = [{"id": "sh", "type": "header", "data": {"text": "<span class=\"h4\"><b>Society Operations</b></span>", "col": 12}}]
	content += [{"id": f"snc{i}", "type": "number_card", "data": {"number_card_name": c[0], "col": 4}} for i, c in enumerate(SOCIETY_CARDS)]
	content += [{"id": f"ssc{i}", "type": "shortcut", "data": {"shortcut_name": s[0], "col": 3}} for i, s in enumerate(shortcuts)]
	content += [{"id": f"sch{i}", "type": "chart", "data": {"chart_name": c[0], "col": 12 if i == 0 else 6}} for i, c in enumerate(SOCIETY_CHARTS)]
	content += [{"id": f"scd{i}", "type": "card", "data": {"card_name": c[0], "col": 4}} for i, c in enumerate(cards)]

	ws = frappe.get_doc("Workspace", "Society Operations") if frappe.db.exists("Workspace", "Society Operations") else frappe.new_doc("Workspace")
	ws.update({"label": "Society Operations", "title": "Society Operations", "module": "Real Estate", "icon": "building", "public": 1,
			   "app": "realestate", "content": json.dumps(content), "type": "Workspace"})
	if ws.is_new():
		ws.name = "Society Operations"
	ws.shortcuts, ws.links, ws.number_cards, ws.charts = [], [], [], []
	for label, kind, target, colour in shortcuts:
		row = {"label": label, "type": kind, "color": colour}
		if kind == "URL":
			row["url"] = target
		else:
			row["link_to"] = target
		if target == "Task":
			row["stats_filter"] = json.dumps([["Task", "re_source", "in", COMPLAINT_SOURCES], ["Task", "status", "in", TASK_OPEN]])
		if target == "RE Society Bill":
			row["stats_filter"] = json.dumps([["RE Society Bill", "status", "in", ["Due", "Overdue"]]])
		ws.append("shortcuts", row)
	for c in SOCIETY_CARDS:
		ws.append("number_cards", {"number_card_name": c[0], "label": c[0]})
	for c in SOCIETY_CHARTS:
		ws.append("charts", {"chart_name": c[0], "label": c[0]})
	for card, links in cards:
		ws.append("links", {"type": "Card Break", "label": card, "link_count": len(links)})
		for target, kind in links:
			ws.append("links", {"type": "Link", "label": target.replace("RE ", ""), "link_type": kind, "link_to": target,
								"is_query_report": 1 if kind == "Report" else 0, "onboard": 0})
	ws.flags.ignore_permissions = True
	ws.flags.ignore_links = True
	ws.save()

	items = [
		("Link", "Home", "Workspace", "Society Operations", "building"),
		("Link", "Site Map", "Page", "re-site-map", "map"),
		("Section Break", "Billing & Collection", None, None, "receipt"),
		("Link", "Society Bills", "DocType", "RE Society Bill", "receipt"),
		("Link", "Charge Heads", "DocType", "RE Charge Head", "list"),
		("Link", "Society Receipts", "DocType", "RE Payment", "wallet"),
		("Link", "Reminders", "DocType", "RE Reminder Log", "bell"),
		("Section Break", "Complaints & Maintenance", None, None, "wrench"),
		("Link", "Complaints & Tasks", "DocType", "Task", "list-checks"),
		("Link", "Maintenance Plans", "DocType", "RE Maintenance Plan", "calendar-clock"),
		("Link", "Task Types", "DocType", "Task Type", "tag"),
		("Link", "ToDo", "DocType", "ToDo", "check"),
		("Section Break", "Infrastructure & Expenses", None, None, "building-2"),
		("Link", "Infrastructure", "DocType", "RE Map Feature", "zap"),
		("Link", "Assets", "DocType", "Asset", "building-2"),
		("Link", "Society Expenses", "DocType", "Purchase Invoice", "file-text"),
		("Link", "Suppliers", "DocType", "Supplier", "truck"),
		("Link", "Document Vault", "DocType", "RE Vault Document", "archive"),
		("Section Break", "Reports", None, None, "sheet"),
	] + [("Link", r, "Report", r, "") for r in SOCIETY_REPORTS]
	sb = frappe.get_doc("Workspace Sidebar", "Society Operations") if frappe.db.exists("Workspace Sidebar", "Society Operations") else frappe.new_doc("Workspace Sidebar")
	sb.update({"title": "Society Operations", "header_icon": "building", "app": "realestate", "module": "Real Estate"})
	sb.items = []
	in_section = False
	for kind, label, link_type, target, icon in items:
		if kind == "Section Break":
			in_section = True
			sb.append("items", {"type": kind, "label": label, "icon": icon, "indent": 1, "collapsible": 1})
			continue
		sb.append("items", {"type": "Link", "label": label, "link_type": link_type, "link_to": target, "icon": icon, "child": int(in_section)})
	sb.flags.ignore_permissions = True
	sb.flags.ignore_links = True
	sb.save()

	icon = frappe.get_doc("Desktop Icon", "Society Operations") if frappe.db.exists("Desktop Icon", "Society Operations") else frappe.new_doc("Desktop Icon")
	icon.update({"label": "Society Operations", "icon_type": "Link", "link_type": "Workspace Sidebar", "link_to": "Society Operations",
				 "app": "realestate", "icon": "building", "hidden": 0, "standard": 0, "bg_color": "gray"})
	if icon.is_new():
		icon.name = "Society Operations"
	icon.flags.ignore_permissions = True
	icon.flags.ignore_links = True
	icon.save()
	frappe.db.commit()
