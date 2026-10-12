// Shared WhatsApp team inbox: unassigned / mine / unread / all, assign to agent, resolve, opt-out, live updates.

frappe.pages["re-inbox"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("WhatsApp Inbox"), single_column: true });
	wrapper.re_inbox = new Inbox(page);
};

frappe.pages["re-inbox"].on_page_show = function (wrapper) {
	const conv = frappe.route_options && frappe.route_options.conversation;
	frappe.route_options = null;
	if (wrapper.re_inbox && conv) wrapper.re_inbox.open(conv);
};

class Inbox {
	constructor(page) {
		this.page = page;
		this.view = "mine";
		this.active = null;
		page.set_primary_action(__("New Chat"), () => this.new_chat(), "add");
		page.add_menu_item(__("Quick Replies"), () => frappe.set_route("List", "RE Quick Reply"));
		page.add_menu_item(__("Broadcasts"), () => frappe.set_route("List", "RE Broadcast"));
		page.add_menu_item(__("WhatsApp Settings"), () => frappe.set_route("Form", "RE Settings"));
		$(page.body).html(`<div class="re-inbox">
			<div class="re-inbox-list">
				<div class="re-inbox-tabs"></div>
				<div class="re-inbox-search"><input class="form-control input-sm" placeholder="${__("Search name, number, record")}"></div>
				<div class="re-inbox-items"></div>
			</div>
			<div class="re-inbox-main">
				<div class="re-inbox-toolbar hidden"></div>
				<div class="re-inbox-chat"><div class="p-5 text-muted text-center">${__("Select a conversation")}</div></div>
			</div></div>`);
		this.$items = $(page.body).find(".re-inbox-items");
		$(page.body).find(".re-inbox-search input").on("input", frappe.utils.debounce((e) => { this.search = e.target.value; this.refresh(); }, 300));
		frappe.realtime.doctype_subscribe("RE Conversation");
		frappe.realtime.on("re_inbox", frappe.utils.debounce(() => this.refresh(), 400));
		frappe.db.get_single_value("RE Settings", "mock_mode").then((m) => {
			this.mock = !!m;
			if (this.mock) {
				page.add_inner_button(__("Simulate incoming message"), () => this.simulate_message(), __("Mock"));
				page.add_inner_button(__("Simulate incoming call"), () => this.simulate_call(), __("Mock"));
			}
		});
		this.refresh();
	}

	async refresh() {
		const [counts, rows] = await Promise.all([
			frappe.xcall("realestate.whatsapp.inbox.get_counts"),
			frappe.xcall("realestate.whatsapp.inbox.get_conversations", { view: this.view, search: this.search || null }),
		]);
		const tabs = [["mine", __("Mine"), counts.mine, counts.my_unread], ["unassigned", __("Unassigned"), counts.unassigned],
			["unread", __("Unread"), counts.unread], ["all", __("All open"), counts.all], ["resolved", __("Resolved")]];
		$(this.page.body).find(".re-inbox-tabs").html(tabs.map(([k, l, n, u]) =>
			`<button class="btn btn-xs ${k === this.view ? "btn-primary" : "btn-default"}" data-v="${k}">${l}${n != null ? ` <span class="badge">${n}</span>` : ""}${u ? ` <span class="re-unread">${u}</span>` : ""}</button>`).join(""))
			.find("button").on("click", (e) => { this.view = $(e.currentTarget).data("v"); this.refresh(); });
		this.$items.html(rows.length ? rows.map((c) => `
			<div class="re-conv ${c.name === this.active ? "active" : ""}" data-name="${c.name}">
				<div class="re-conv-top"><span class="re-conv-name">${frappe.utils.escape_html(c.contact_name || c.phone)}</span>
					<span class="text-muted small">${realestate.fmt_time(c.last_message_at)}</span></div>
				<div class="re-conv-top"><span class="re-conv-last">${c.last_direction === "Outgoing" ? "↪ " : ""}${frappe.utils.escape_html(c.last_message || "")}</span>
					${c.unread_count ? `<span class="re-unread">${c.unread_count}</span>` : ""}</div>
				<div class="re-conv-sub">${c.party ? frappe.utils.escape_html(`${c.party_type}: ${c.party}`) : __("Not linked")}
					· ${c.agent ? frappe.utils.escape_html(frappe.user.full_name(c.agent)) : `<span class="text-danger">${__("Unassigned")}</span>`}
					${c.opted_out ? ` · <span class="text-danger">${__("opted out")}</span>` : ""}</div>
			</div>`).join("") : `<div class="p-4 text-muted">${__("No conversations")}</div>`);
		this.$items.find(".re-conv").on("click", (e) => this.open($(e.currentTarget).data("name")));
	}

	async open(name) {
		this.active = name;
		this.$items.find(".re-conv").removeClass("active").filter(`[data-name="${CSS.escape(name)}"]`).addClass("active");
		const conv = await frappe.db.get_doc("RE Conversation", name);
		this.toolbar(conv);
		new realestate.ChatPanel($(this.page.body).find(".re-inbox-chat"), { profile: name, conversation: name });
		if (conv.unread_count) {
			await frappe.xcall("realestate.whatsapp.inbox.mark_read", { conversation: name });
			this.refresh();
		}
	}

	toolbar(conv) {
		const $t = $(this.page.body).find(".re-inbox-toolbar").removeClass("hidden").empty();
		const link = conv.party ? `<a class="btn btn-xs btn-default" href="/app/${frappe.router.slug(conv.party_type)}/${encodeURIComponent(conv.party)}">${__("Open")} ${__(conv.party_type)}</a>` : "";
		$t.append(`<span class="text-muted small">${__("Assigned to")}</span><div class="re-agent-field" style="width:220px"></div>${link}`);
		const agent = frappe.ui.form.make_control({
			parent: $t.find(".re-agent-field"), df: { fieldtype: "Link", options: "User", fieldname: "agent", placeholder: __("Unassigned"),
				get_query: () => ({ query: "frappe.core.doctype.user.user.user_query", filters: { ignore_user_type: 0 } }),
				change: () => {
					const v = agent.get_value();
					if ((v || null) !== (conv.agent || null)) frappe.xcall("realestate.whatsapp.inbox.assign", { conversation: conv.name, agent: v || "" })
						.then(() => { conv.agent = v; frappe.show_alert(__("Assigned")); this.refresh(); });
				} }, render_input: true,
		});
		agent.set_value(conv.agent || "");
		const mine = $(`<button class="btn btn-xs btn-default">${__("Assign to me")}</button>`).on("click", () => agent.set_value(frappe.session.user));
		const resolve = $(`<button class="btn btn-xs btn-default">${conv.status === "Resolved" ? __("Reopen") : __("Resolve")}</button>`).on("click", async () => {
			await frappe.xcall("realestate.whatsapp.inbox.assign", { conversation: conv.name, status: conv.status === "Resolved" ? "Open" : "Resolved" });
			this.refresh();
			this.open(conv.name);
		});
		const opt = $(`<button class="btn btn-xs ${conv.opted_out ? "btn-danger" : "btn-default"}">${conv.opted_out ? __("Opted out — re-subscribe") : __("Mark opted out")}</button>`)
			.on("click", async () => { await frappe.xcall("realestate.whatsapp.inbox.set_opted_out", { conversation: conv.name, opted_out: conv.opted_out ? 0 : 1 }); this.open(conv.name); });
		$t.append(mine, resolve, opt);
		if (!conv.party) {
			$t.append($(`<button class="btn btn-xs btn-primary">${__("Create Lead")}</button>`).on("click", () =>
				frappe.new_doc("CRM Lead", { first_name: conv.contact_name, mobile_no: "+" + (conv.phone || "").replace(/\D/g, "") })));
		}
	}

	new_chat() {
		frappe.prompt([
			{ fieldname: "party_type", fieldtype: "Select", label: __("With"), options: "Customer\nCRM Lead\nCRM Deal", default: "Customer", reqd: 1 },
			{ fieldname: "party", fieldtype: "Dynamic Link", options: "party_type", label: __("Record"), reqd: 1 },
		], (v) => frappe.set_route("Form", v.party_type, v.party), __("Start a chat"), __("Open"));
	}

	simulate_message() {
		frappe.prompt([
			{ fieldname: "phone", fieldtype: "Data", label: __("From number"), reqd: 1, default: "0300 1234567",
				description: __("An unknown number creates a new lead. Send STOP to test opt-out.") },
			{ fieldname: "name", fieldtype: "Data", label: __("Sender name"), default: "Test Customer" },
			{ fieldname: "text", fieldtype: "Small Text", label: __("Message"), reqd: 1, default: "Assalam o Alaikum, is a 10 Marla plot available in B Block?" },
		], async (v) => {
			await frappe.xcall("realestate.whatsapp.mock.simulate_incoming_message", v);
			frappe.show_alert({ message: __("Message received"), indicator: "green" });
			this.refresh();
		}, __("Simulate incoming WhatsApp message"), __("Receive"));
	}

	simulate_call() {
		frappe.prompt([
			{ fieldname: "phone", fieldtype: "Data", label: __("From number"), reqd: 1, default: "0300 1234567" },
			{ fieldname: "name", fieldtype: "Data", label: __("Caller name"), default: "Test Caller" },
			{ fieldname: "answered", fieldtype: "Check", label: __("Answered"), default: 0, description: __("Unanswered calls create a follow-up task for the agent") },
			{ fieldname: "duration", fieldtype: "Int", label: __("Duration (seconds)"), default: 95, depends_on: "answered" },
		], async (v) => {
			const log = await frappe.xcall("realestate.whatsapp.mock.simulate_incoming_call", v);
			frappe.show_alert({ message: __("Call logged: {0}", [log]), indicator: "green" });
		}, __("Simulate incoming WhatsApp call"), __("Call"));
	}
}
