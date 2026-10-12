// Chat panel + unified timeline + call buttons on Customer, CRM Lead and CRM Deal.
// Loaded as doctype_js for each of them; registers the handlers once.
if (!realestate._party_forms) {
	realestate._party_forms = true;
	["Customer", "CRM Lead", "CRM Deal"].forEach((doctype) => {
		frappe.ui.form.on(doctype, {
			refresh(frm) {
				realestate.add_party_buttons(frm, frm.doctype, frm.docname);
				realestate.render_engagement(frm, frm.doctype, frm.docname);
			},
		});
	});
}
