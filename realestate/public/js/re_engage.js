// Real Estate: WhatsApp chat panel, call logging / WhatsApp calling, unified timeline.
// Used on Customer, CRM Lead, CRM Deal and RE Plot forms and by the team inbox page.

frappe.provide("realestate");

const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));
const TICKS = {
	Pending: '<span class="re-tick" title="Sending">🕓</span>',
	Sent: '<span class="re-tick" title="Sent">✓</span>',
	Delivered: '<span class="re-tick" title="Delivered">✓✓</span>',
	Read: '<span class="re-tick re-read" title="Read">✓✓</span>',
	Failed: '<span class="re-tick re-failed" title="Failed">⚠</span>',
};
const OUTCOMES = ["Answered", "No Answer", "Busy", "Promised to Pay", "Not Interested", "Call Back Later"];

realestate.fmt_time = (dt) => {
	if (!dt) return "";
	const m = moment(frappe.datetime.convert_to_user_tz(dt));
	return m.isSame(moment(), "day") ? m.format("h:mm A") : m.format("D MMM, h:mm A");
};

// ------------------------------------------------------------------ chat panel
realestate.ChatPanel = class ChatPanel {
	constructor(wrapper, opts) {
		this.$wrapper = $(wrapper);
		this.opts = opts; // {doctype, name} or {profile, conversation}
		this.make();
		this.load();
	}

	make() {
		this.$wrapper.html(`
			<div class="re-chat">
				<div class="re-chat-head"></div>
				<div class="re-chat-body"><div class="text-muted small p-3">${__("Loading…")}</div></div>
				<div class="re-chat-compose">
					<div class="re-quick-list hidden"></div>
					<textarea class="form-control re-input" rows="2" placeholder="${__("Type a message — / for quick replies")}"></textarea>
					<div class="re-chat-actions">
						<button class="btn btn-xs btn-default re-attach" title="${__("Send a document or image")}">📎 ${__("File")}</button>
						<button class="btn btn-xs btn-default re-template" title="${__("Send an approved template")}">📄 ${__("Template")}</button>
						<button class="btn btn-xs btn-default re-location" title="${__("Send the plot's location pin")}">📍 ${__("Location")}</button>
						<button class="btn btn-xs btn-default re-quick" title="${__("Quick replies")}">⚡</button>
						<span class="flex-1"></span>
						<button class="btn btn-xs btn-primary re-send">${__("Send")}</button>
					</div>
				</div>
			</div>`);
		this.$body = this.$wrapper.find(".re-chat-body");
		this.$input = this.$wrapper.find(".re-input");
		this.$wrapper.find(".re-send").on("click", () => this.send_text());
		this.$input.on("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.send_text();
			}
		});
		this.$input.on("input", () => this.show_quick(this.$input.val()));
		this.$wrapper.find(".re-attach").on("click", () => this.send_file());
		this.$wrapper.find(".re-template").on("click", () => this.send_template());
		this.$wrapper.find(".re-location").on("click", () => this.send_location());
		this.$wrapper.find(".re-quick").on("click", () => this.show_quick("/", true));
		frappe.realtime.on("whatsapp_message", (data) => this.on_realtime(data));
		frappe.realtime.on("re_inbox", (data) => {
			if (this.ctx && data.conversation === this.ctx.profile) this.load_thread();
		});
	}

	args() {
		return this.opts.profile
			? { doctype: "RE Conversation", name: this.opts.profile }
			: { doctype: this.opts.doctype, name: this.opts.name };
	}

	async load() {
		this.ctx = await frappe.xcall("realestate.whatsapp.api.get_context", this.args());
		if (this.ctx.party_type && this.ctx.party) frappe.realtime.doc_subscribe(this.ctx.party_type, this.ctx.party);
		this.render_head();
		await this.load_thread();
	}

	render_head() {
		const c = this.ctx;
		const name = c.party ? `<a href="/app/${frappe.router.slug(c.party_type)}/${encodeURIComponent(c.party)}">${esc(c.party_name || c.party)}</a>`
			: esc(c.phone || __("No number"));
		this.$wrapper.find(".re-chat-head").html(`
			<div class="re-chat-who">
				<span class="re-wa-dot"></span>
				<b>${name}</b> <span class="text-muted">${esc(c.phone || "")}</span>
				${c.opted_out ? `<span class="indicator-pill red">${__("Opted out")}</span>` : ""}
				${c.mock ? `<span class="indicator-pill gray" title="${__("RE Settings → Mock Mode")}">${__("Mock")}</span>` : ""}
				${c.agent ? `<span class="text-muted small"> · ${__("Agent")}: ${esc(frappe.user.full_name(c.agent))}</span>` : ""}
			</div>
			<div class="re-chat-head-actions">
				<button class="btn btn-xs btn-success re-call">📞 ${__("WhatsApp Call")}</button>
				<button class="btn btn-xs btn-default re-log-call">${__("Log Call")}</button>
				<button class="btn btn-xs btn-default re-complaint" title="${__("Log a maintenance complaint")}">🛠 ${__("Complaint")}</button>
			</div>`);
		this.$wrapper.find(".re-call").on("click", () => realestate.start_call(c));
		this.$wrapper.find(".re-log-call").on("click", () => realestate.log_call_dialog(c));
		this.$wrapper.find(".re-complaint").on("click", () => realestate.complaint_dialog(this.args(), c));
		const disabled = !c.phone;
		this.$wrapper.find(".re-chat-compose button, .re-input, .re-call").prop("disabled", disabled);
		this.$wrapper.find(".re-location").toggle(!!(c.plots && c.plots.length));
	}

	async load_thread() {
		const rows = await frappe.xcall("realestate.whatsapp.api.get_thread", this.opts.profile ? { profile: this.opts.profile } : this.args());
		if (!rows.length) {
			this.$body.html(`<div class="re-chat-empty">${__("No WhatsApp messages yet.")}<br><span class="small">${
				__("Free-text messages reach the customer only within 24 hours of their last message; use a template otherwise.")}</span></div>`);
			return;
		}
		let last_day = null;
		const html = rows.map((m) => {
			const day = moment(m.at).format("ddd, D MMM YYYY");
			const sep = day !== last_day ? `<div class="re-day">${day}</div>` : "";
			last_day = day;
			return sep + this.bubble(m);
		}).join("");
		this.$body.html(html);
		this.$body.scrollTop(this.$body[0].scrollHeight);
	}

	bubble(m) {
		const out = m.direction === "Outgoing";
		let content = "";
		if (m.template_label) content += `<div class="re-tpl">📄 ${esc(m.template_label)}</div>`;
		if (m.re_latitude) {
			const url = `https://www.google.com/maps?q=${m.re_latitude},${m.re_longitude}`;
			content += `<a class="re-loc" target="_blank" href="${url}">📍 ${esc(m.re_location_name || __("Location"))}<br><span class="small">${m.re_latitude}, ${m.re_longitude}</span></a>`;
		} else if (m.file_url) {
			const img = (m.mime_type || "").startsWith("image") || /\.(png|jpe?g|webp|gif)$/i.test(m.file_url);
			content += img ? `<a href="${m.file_url}" target="_blank"><img class="re-img" src="${m.file_url}"></a>`
				: `<a class="re-file" href="${m.file_url}" target="_blank">📎 ${esc(m.file_name || __("Document"))}</a>`;
		} else if (m.media_id && !m.message) {
			content += `<div class="text-muted">📎 ${esc(m.mime_type || __("Media"))}</div>`;
		}
		if (m.message && !(m.re_latitude)) content += `<div class="re-text">${esc(m.message).replace(/\n/g, "<br>")}</div>`;
		const meta = `${realestate.fmt_time(m.at)} ${out ? TICKS[m.status] || "" : ""}`;
		const err = m.error ? `<div class="re-err">${esc(m.error)}</div>` : "";
		const who = out && m.agent ? `<div class="re-agent">${esc(m.agent)}</div>` : "";
		return `<div class="re-msg ${out ? "re-out" : "re-in"}"><div class="re-bubble">${who}${content}${err}<div class="re-meta">${meta}</div></div></div>`;
	}

	on_realtime(data) {
		if (!this.ctx) return;
		if (data.reference_docname === this.ctx.party || data.reference_docname === this.opts.name) this.load_thread();
	}

	async do_send(args, label) {
		try {
			frappe.show_alert({ message: label || __("Sending…"), indicator: "blue" }, 2);
			await frappe.xcall("realestate.whatsapp.api.send", { ...this.args(), ...args, profile: this.opts.profile || this.ctx.profile });
		} finally {
			if (!this.ctx.profile) this.ctx = await frappe.xcall("realestate.whatsapp.api.get_context", this.args());
			await this.load_thread();
		}
	}

	async send_text() {
		const text = this.$input.val().trim();
		if (!text) return;
		this.$input.val("");
		this.$wrapper.find(".re-quick-list").addClass("hidden");
		await this.do_send({ message: text });
	}

	send_file() {
		new frappe.ui.FileUploader({
			doctype: this.ctx.party_type || this.opts.doctype,
			docname: this.ctx.party || this.opts.name,
			allow_multiple: false,
			on_success: (file) => {
				frappe.prompt({ fieldname: "caption", fieldtype: "Data", label: __("Caption (optional)") },
					(v) => this.do_send({ attach: file.file_url, message: v.caption || "" }, __("Uploading to WhatsApp…")),
					__("Send {0}", [file.file_name]));
			},
		});
	}

	send_template() {
		const { templates, refs } = this.ctx.template_refs || {};
		if (!templates || !templates.length) {
			frappe.msgprint(__("No approved template can be filled from this record."));
			return;
		}
		const d = new frappe.ui.Dialog({
			title: __("Send WhatsApp Template"),
			fields: [
				{ fieldname: "template", label: __("Template"), fieldtype: "Select", reqd: 1,
					options: templates.map((t) => ({ value: t.name, label: `${t.template_label} (${t.reference_doctype})` })) },
				{ fieldname: "ref", label: __("Fill From"), fieldtype: "Select", reqd: 1 },
				{ fieldname: "preview", fieldtype: "HTML" },
			],
			primary_action_label: __("Send"),
			primary_action: async (v) => {
				d.hide();
				await this.do_send({ template: v.template, template_ref: v.ref });
			},
		});
		const update = () => {
			const t = templates.find((x) => x.name === d.get_value("template"));
			if (!t) return;
			const options = refs[t.reference_doctype] || [];
			d.set_df_property("ref", "options", options);
			if (!options.includes(d.get_value("ref"))) d.set_value("ref", options[0] || "");
			d.fields_dict.preview.$wrapper.html(`<div class="re-tpl-preview">${esc(t.message).replace(/\n/g, "<br>")}</div>`);
		};
		d.fields_dict.template.$input.on("change", update);
		d.set_value("template", templates[0].name).then(update);
		d.show();
	}

	send_location() {
		const plots = this.ctx.plots || [];
		if (plots.length === 1) return this.do_send({ plot: plots[0].name });
		frappe.prompt({ fieldname: "plot", fieldtype: "Select", label: __("Plot"), reqd: 1,
			options: plots.map((p) => ({ value: p.name, label: `${p.name} · ${p.plot_size} · ${p.status}` })) },
		(v) => this.do_send({ plot: v.plot }), __("Send Location Pin"));
	}

	async show_quick(text, force) {
		const $list = this.$wrapper.find(".re-quick-list");
		if (!force && !text.startsWith("/")) return $list.addClass("hidden");
		this.quick = this.quick || (await frappe.xcall("realestate.whatsapp.api.quick_replies"));
		const q = force ? "" : text.slice(1).toLowerCase();
		const hits = this.quick.filter((r) => !q || (r.shortcut || "").toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
		if (!hits.length) return $list.addClass("hidden");
		$list.html(hits.map((r, i) => `<div class="re-quick-item" data-i="${i}"><b>${esc(r.shortcut || "")}</b> ${esc(r.title)}<div class="text-muted small">${esc(r.message)}</div></div>`).join(""))
			.removeClass("hidden");
		$list.find(".re-quick-item").on("click", (e) => {
			this.$input.val(hits[$(e.currentTarget).data("i")].message).trigger("focus");
			$list.addClass("hidden");
		});
	}
};

// ------------------------------------------------------------------ calls
realestate.start_call = (ctx) => {
	if (!ctx.phone) return frappe.msgprint(__("No mobile number"));
	if (ctx.calling_api && window.RTCPeerConnection && navigator.mediaDevices) return realestate.webrtc_call(ctx);
	window.open(ctx.wa_link, "_blank");
	realestate.log_call_dialog(ctx, { channel: "WhatsApp Click-to-Call",
		intro: __("WhatsApp opened in a new tab. After the call, log what happened.") });
};

realestate.log_call_dialog = (ctx, opts = {}) => {
	const d = new frappe.ui.Dialog({
		title: __("Log Call · {0}", [ctx.party_name || ctx.phone]),
		fields: [
			{ fieldtype: "HTML", fieldname: "intro", options: opts.intro ? `<p class="text-muted">${esc(opts.intro)}</p>` : "" },
			{ fieldname: "direction", label: __("Direction"), fieldtype: "Select", options: "Outgoing\nIncoming", default: opts.direction || "Outgoing" },
			{ fieldname: "outcome", label: __("Outcome"), fieldtype: "Select", options: OUTCOMES.join("\n"), default: "Answered", reqd: 1 },
			{ fieldname: "duration", label: __("Duration (minutes)"), fieldtype: "Float", default: opts.duration_min || 0 },
			{ fieldtype: "Column Break" },
			{ fieldname: "promised_amount", label: __("Promised Amount"), fieldtype: "Currency", options: "PKR", depends_on: "eval:doc.outcome=='Promised to Pay'" },
			{ fieldname: "promised_date", label: __("Promised By"), fieldtype: "Date", depends_on: "eval:doc.outcome=='Promised to Pay'",
				mandatory_depends_on: "eval:doc.outcome=='Promised to Pay'" },
			{ fieldname: "next_follow_up", label: __("Next Follow-up"), fieldtype: "Datetime" },
			{ fieldtype: "Section Break" },
			{ fieldname: "notes", label: __("Notes"), fieldtype: "Small Text" },
		],
		primary_action_label: __("Save"),
		primary_action: async (v) => {
			if (!ctx.party) return frappe.msgprint(__("This number is not linked to a lead or customer yet."));
			await frappe.xcall("realestate.whatsapp.calls.log_call", {
				party_type: ctx.party_type, party: ctx.party, direction: v.direction, outcome: v.outcome,
				duration: Math.round((v.duration || 0) * 60), notes: v.notes, promised_amount: v.promised_amount,
				promised_date: v.promised_date, next_follow_up: v.next_follow_up, phone: ctx.phone,
				channel: opts.channel || "WhatsApp Click-to-Call", call_log: opts.call_log,
			});
			d.hide();
			frappe.show_alert({ message: __("Call logged"), indicator: "green" });
			$(document).trigger("re-timeline-refresh");
		},
	});
	d.show();
	return d;
};

realestate._wait_ice = (pc) => new Promise((resolve) => {
	if (pc.iceGatheringState === "complete") return resolve();
	const t = setTimeout(resolve, 3000);
	pc.addEventListener("icegatheringstatechange", () => {
		if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
	});
});

realestate._peer = async () => {
	const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	stream.getTracks().forEach((t) => pc.addTrack(t, stream));
	const audio = new Audio();
	audio.autoplay = true;
	pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
	pc._cleanup = () => { stream.getTracks().forEach((t) => t.stop()); pc.close(); audio.srcObject = null; };
	return pc;
};

// Business-initiated call through the WhatsApp Business Calling API (WebRTC in the browser).
realestate.webrtc_call = async (ctx) => {
	const pc = await realestate._peer();
	await pc.setLocalDescription(await pc.createOffer());
	await realestate._wait_ice(pc);
	const { call_id, call_log } = await frappe.xcall("realestate.whatsapp.calls.start_call",
		{ party_type: ctx.party_type, party: ctx.party, sdp_offer: pc.localDescription.sdp });
	const started = Date.now();
	const d = new frappe.ui.Dialog({ title: __("Calling {0}…", [ctx.party_name || ctx.phone]), fields: [{ fieldtype: "HTML", fieldname: "s" }],
		primary_action_label: __("Hang up"), primary_action: () => frappe.xcall("realestate.whatsapp.calls.end_call", { call_id }) });
	d.fields_dict.s.$wrapper.html(`<p class="re-call-state">${__("Ringing…")}</p>`);
	d.show();
	const on_answer = async (data) => {
		if (data.call_id !== call_id) return;
		await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
		d.fields_dict.s.$wrapper.find(".re-call-state").text(__("Connected"));
	};
	const on_end = (data) => {
		if (data.call_id !== call_id) return;
		pc._cleanup();
		d.hide();
		frappe.realtime.off("re_wa_call_answer", on_answer);
		frappe.realtime.off("re_wa_call_ended", on_end);
		realestate.log_call_dialog(ctx, { call_log, channel: "WhatsApp Calling API", duration_min: Math.round((Date.now() - started) / 600) / 100 });
	};
	frappe.realtime.on("re_wa_call_answer", on_answer);
	frappe.realtime.on("re_wa_call_ended", on_end);
};

// Incoming WhatsApp calls ring every sales user's desk; the first to accept takes it.
realestate._incoming = {};
frappe.realtime.on("re_wa_incoming_call", (data) => {
	if (realestate._incoming[data.call_id]) return;
	const d = new frappe.ui.Dialog({
		title: __("Incoming WhatsApp call"),
		fields: [{ fieldtype: "HTML", fieldname: "who", options: `<h4>${esc(data.name)}</h4><p class="text-muted">${esc(data.phone)}</p>` }],
		primary_action_label: __("Accept"),
		primary_action: async () => {
			const pc = await realestate._peer();
			await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
			await pc.setLocalDescription(await pc.createAnswer());
			await realestate._wait_ice(pc);
			await frappe.xcall("realestate.whatsapp.calls.accept_call", { call_id: data.call_id, sdp_answer: pc.localDescription.sdp });
			d.set_title(__("On call with {0}", [data.name]));
			d.set_primary_action(__("Hang up"), () => frappe.xcall("realestate.whatsapp.calls.end_call", { call_id: data.call_id }));
			const started = Date.now();
			const on_end = (e) => {
				if (e.call_id !== data.call_id) return;
				pc._cleanup();
				d.hide();
				frappe.realtime.off("re_wa_call_ended", on_end);
				realestate.log_call_dialog({ party_type: data.party_type, party: data.party, party_name: data.name, phone: data.phone },
					{ call_log: data.call_log, direction: "Incoming", channel: "WhatsApp Calling API", duration_min: Math.round((Date.now() - started) / 600) / 100 });
			};
			frappe.realtime.on("re_wa_call_ended", on_end);
		},
		secondary_action_label: __("Decline"),
		secondary_action: () => { frappe.xcall("realestate.whatsapp.calls.end_call", { call_id: data.call_id, reject: 1 }); d.hide(); },
	});
	realestate._incoming[data.call_id] = d;
	d.show();
});
frappe.realtime.on("re_wa_call_taken", (data) => {
	const d = realestate._incoming[data.call_id];
	if (d && data.by !== frappe.session.user) d.hide();
});

// ------------------------------------------------------------------ maintenance complaints
realestate.complaint_dialog = (args, ctx = {}) => {
	const plots = (ctx.plots || []).map((p) => p.name);
	const d = new frappe.ui.Dialog({
		title: __("Maintenance Complaint"),
		fields: [
			{ fieldname: "subject", label: __("Problem"), fieldtype: "Data", reqd: 1, placeholder: __("e.g. Street light not working outside plot") },
			{ fieldname: "maintenance_type", label: __("Type"), fieldtype: "Link", options: "Task Type", reqd: 1, default: "Street Lights" },
			{ fieldname: "priority", label: __("Priority"), fieldtype: "Select", options: "Critical\nHigh\nNormal", default: "Normal" },
			{ fieldname: "plot", label: __("Plot"), fieldtype: plots.length > 1 ? "Select" : "Link", options: plots.length > 1 ? plots : "RE Plot",
				default: plots[0], hidden: args.doctype === "RE Plot" ? 1 : 0 },
			{ fieldname: "description", label: __("Details"), fieldtype: "Small Text" },
		],
		primary_action_label: __("Create Task"),
		primary_action: async (v) => {
			const task = await frappe.xcall("realestate.maintenance.raise_complaint", { ...args, ...v });
			d.hide();
			frappe.show_alert({ message: __("Maintenance task {0} created and assigned", [`<a href="/app/task/${task}">${task}</a>`]), indicator: "green" }, 7);
			$(document).trigger("re-timeline-refresh");
		},
	});
	d.show();
};

// ------------------------------------------------------------------ unified timeline
realestate.Timeline = class Timeline {
	constructor(wrapper, party_type, party) {
		this.$wrapper = $(wrapper);
		this.party_type = party_type;
		this.party = party;
		this.filter = "all";
		this.$wrapper.html(`<div class="re-timeline">
			<div class="re-tl-filters">${["all", "whatsapp", "call", "visit", "payment", "booking", "bill", "maintenance", "document", "reminder", "task"]
				.map((k) => `<button class="btn btn-xs ${k === "all" ? "btn-primary" : "btn-default"}" data-k="${k}">${__(frappe.utils.to_title_case(k))}</button>`).join("")}</div>
			<div class="re-tl-list"></div></div>`);
		this.$wrapper.find(".re-tl-filters button").on("click", (e) => {
			this.filter = $(e.currentTarget).data("k");
			this.$wrapper.find(".re-tl-filters button").removeClass("btn-primary").addClass("btn-default");
			$(e.currentTarget).addClass("btn-primary").removeClass("btn-default");
			this.render();
		});
		$(document).on("re-timeline-refresh", () => this.load());
		this.load();
	}

	async load() {
		this.items = await frappe.xcall("realestate.api.get_timeline", { party_type: this.party_type, party: this.party });
		this.render();
	}

	render() {
		const items = this.items.filter((i) => this.filter === "all" || i.kind === this.filter);
		const icons = { whatsapp: "💬", call: "📞", visit: "📍", payment: "💰", booking: "🏠", bill: "🧾", document: "📎", reminder: "🔔", task: "✅", note: "📝", maintenance: "🛠" };
		this.$wrapper.find(".re-tl-list").html(items.length ? items.map((i) => `
			<div class="re-tl-item re-tl-${i.kind}">
				<div class="re-tl-icon">${icons[i.kind] || "•"}</div>
				<div class="re-tl-main">
					<div><a href="/app/${frappe.router.slug(i.doctype)}/${encodeURIComponent(i.name)}">${esc(i.title)}</a>
						${i.status ? `<span class="re-tl-status">${esc(__(i.status))}</span>` : ""}</div>
					${i.body ? `<div class="re-tl-body">${esc(i.body)}</div>` : ""}
					<div class="re-tl-time">${realestate.fmt_time(i.at)} · ${frappe.datetime.comment_when(i.at, true)}</div>
				</div>
			</div>`).join("") : `<div class="text-muted p-3">${__("Nothing yet")}</div>`);
	}
};

// ------------------------------------------------------------------ form integration
realestate.render_engagement = (frm, party_type, party) => {
	const field = frm.fields_dict.re_engagement_html;
	if (!field || frm.is_new()) return;
	const key = `${frm.doctype}/${frm.docname}`;
	if (field.$wrapper.data("re-key") === key) return;
	field.$wrapper.data("re-key", key).html(`
		<div class="row re-engage">
			<div class="col-md-7"><div class="re-chat-wrap"></div></div>
			<div class="col-md-5"><h6 class="re-section-title">${__("Timeline")}</h6><div class="re-tl-wrap"></div></div>
		</div>`);
	new realestate.ChatPanel(field.$wrapper.find(".re-chat-wrap"), { doctype: frm.doctype, name: frm.docname });
	if (party) new realestate.Timeline(field.$wrapper.find(".re-tl-wrap"), party_type, party);
	else field.$wrapper.find(".re-tl-wrap").html(`<p class="text-muted">${__("Shown once the plot is booked.")}</p>`);
};

realestate.add_party_buttons = (frm, party_type, party) => {
	if (frm.is_new() || !party) return;
	const group = __("WhatsApp");
	frm.add_custom_button(__("Open Chat"), () => frm.scroll_to_field("re_engagement_html"), group);
	frm.add_custom_button(__("Call"), async () => realestate.start_call(await frappe.xcall("realestate.whatsapp.api.get_context", { doctype: frm.doctype, name: frm.docname })), group);
	frm.add_custom_button(__("Log Call"), async () => realestate.log_call_dialog(await frappe.xcall("realestate.whatsapp.api.get_context", { doctype: frm.doctype, name: frm.docname })), group);
	frm.add_custom_button(__("Schedule Site Visit"), () => frappe.new_doc("RE Site Visit", { party_type, party, mobile_no: frm.doc.mobile_no }), group);
};

// ------------------------------------------------------------------ documents (English / Urdu)
realestate.generate_document = (frm) => {
	frappe.xcall("realestate.documents.available", { doctype: frm.doctype, name: frm.doc.name }).then((docs) => {
		if (!docs.length) return frappe.msgprint(__("No documents for this record"));
		const label = (v) => `v${v.version} · ${v.language === "ur" ? "اردو" : "English"} · ${frappe.datetime.str_to_user(v.issued_on)}`;
		const d = new frappe.ui.Dialog({
			title: __("Generate document"),
			fields: [
				{ fieldname: "document_type", label: __("Document"), fieldtype: "Select", reqd: 1, options: docs.map((x) => x.document_type).join("\n"),
					default: docs[0].document_type, onchange: () => refresh() },
				{ fieldname: "language", label: __("Language"), fieldtype: "Select", reqd: 1, options: [{ value: "en", label: "English" }, { value: "ur", label: "اردو (Urdu)" }],
					default: localStorage.getItem("re-doc-lang") === "ur" ? "ur" : "en" },
				{ fieldname: "versions", fieldtype: "HTML" },
			],
			primary_action_label: __("Generate PDF"),
			primary_action: (v) => {
				localStorage.setItem("re-doc-lang", v.language);
				d.hide();
				frappe.xcall("realestate.documents.generate", { document_type: v.document_type, reference_name: frm.doc.name, language: v.language }).then((r) => {
					frappe.show_alert({ message: __("{0} v{1} generated", [v.document_type, r.version]), indicator: "green" });
					window.open(r.file_url, "_blank");
					frm.reload_doc();
				});
			},
		});
		const refresh = () => {
			const cur = docs.find((x) => x.document_type === d.get_value("document_type"));
			if (cur && !cur.languages.includes("ur")) d.set_value("language", "en");
			const rows = (cur?.versions || []).map((v) => `<li>${v.file ? `<a href="${v.file}" target="_blank">${frappe.utils.escape_html(label(v))}</a>` : frappe.utils.escape_html(label(v))}</li>`).join("");
			d.fields_dict.versions.$wrapper.html(rows ? `<div class="text-muted small">${__("Earlier versions")}</div><ul class="small">${rows}</ul>` : "");
		};
		d.show();
		refresh();
	});
};

["RE Booking", "RE Plot", "RE Society Bill", "RE Payment", "RE Plot Transfer", "Customer"].forEach((dt) => {
	frappe.ui.form.on(dt, {
		refresh(frm) {
			if (frm.is_new()) return;
			frm.add_custom_button(__("Generate document"), () => realestate.generate_document(frm), __("Documents"));
		},
	});
});
