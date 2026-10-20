// Builds docs/fsd/Zarmeen-Gardens-FSD.pptx from the FSD content (docs/FSD.html) and the rendered DFD / video poster images.
// node build.js   (then: validate.py, soffice → PDF)
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const DOCS = path.resolve(__dirname, "../../docs");
const ASSETS = path.join(DOCS, "fsd-assets");
const OUT = path.join(DOCS, "fsd");
fs.mkdirSync(OUT, { recursive: true });
const img = (f) => path.join(ASSETS, f);

const THEME = {
  name: "Zarmeen Teal",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "14201E", lt1: "FFFFFF", dk2: "0B3B37", lt2: "EEF6F4",
    accent1: "0F766E", accent2: "5EEAD4", accent3: "D97706", accent4: "475569", accent5: "B91C1C", accent6: "7C3AED",
    hlink: "0F766E", folHlink: "134E4A",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "Zarmeen Gardens — Functional Specification";
pres.subject = "Real Estate & Society ERP — FSD v1.0";
pres.author = "Real Estate app (realestate)";
pres.company = "Zarmeen Gardens Housing Scheme";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333, H = 7.5, MX = 0.6;

// ---------- layouts ----------
const footer = (dark) => [
  { text: { text: "Zarmeen Gardens · Functional Specification v1.0", options: { x: MX, y: H - 0.42, w: 7, h: 0.3, fontSize: 9, color: dark ? C.accent2 : C.accent4, margin: 0 } } },
];
pres.defineSlideMaster({
  title: "RE Title", background: { color: C.text2 },
  objects: [
    { ellipse: { x: 8.6, y: -1.6, w: 6.4, h: 6.4, fill: { color: C.accent1, transparency: 55 }, line: { color: C.accent2, width: 1.5, transparency: 40 } } },
    { ellipse: { x: 10.9, y: 3.9, w: 3.2, h: 3.2, fill: { color: C.accent2, transparency: 82 }, line: { color: C.accent2, width: 1, transparency: 50 } } },
    { placeholder: { options: { name: "eyebrow", type: "body", x: MX, y: 1.55, w: 11, h: 0.4, fontSize: 13, bold: true, color: C.accent2, charSpacing: 4 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.0, w: 8.6, h: 2.1, fontSize: 44, bold: true, color: C.background1, valign: "top", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MX, y: 4.2, w: 7.8, h: 1.4, fontSize: 17, color: C.accent2, valign: "top", align: "left" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "RE Section", background: { color: C.text2 },
  objects: [
    { ellipse: { x: 9.2, y: 1.35, w: 4.8, h: 4.8, fill: { color: C.accent1, transparency: 50 }, line: { color: C.accent2, width: 1.5, transparency: 30 } } },
    { placeholder: { options: { name: "num", type: "body", x: 9.2, y: 2.75, w: 4.8, h: 2.0, fontSize: 60, bold: true, color: C.background1, align: "center", valign: "middle", fontFace: "Cambria" }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.45, w: 8.2, h: 1.3, fontSize: 40, bold: true, color: C.background1, valign: "bottom", align: "left" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: MX, y: 3.9, w: 7.8, h: 1.5, fontSize: 17, color: C.accent2, valign: "top", align: "left" }, text: "" } },
    ...footer(true),
  ],
  slideNumber: { x: W - 1.1, y: H - 0.45, w: 0.6, h: 0.3, fontSize: 9, color: C.accent2, align: "right" },
});
pres.defineSlideMaster({
  title: "RE Content", background: { color: C.background1 },
  margin: [0.5, 0.6, 0.7, 0.6],
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: MX, y: 0.38, w: 9, h: 0.3, fontSize: 11, bold: true, color: C.accent1, charSpacing: 3, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.66, w: W - 2 * MX, h: 0.75, fontSize: 28, bold: true, color: C.text1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { line: { x: MX, y: H - 0.55, w: W - 2 * MX, h: 0, line: { color: C.background2, width: 1 } } },
    ...footer(false),
  ],
  slideNumber: { x: W - 1.1, y: H - 0.45, w: 0.6, h: 0.3, fontSize: 9, color: C.accent4, align: "right" },
});

// ---------- helpers ----------
let sectionTitle = "Overview";
const sec = (t) => { sectionTitle = t; pres.addSection({ title: t }); };
const content = (eyebrow, title, notes) => {
  const s = pres.addSlide({ masterName: "RE Content", sectionTitle });
  s.addText(eyebrow.toUpperCase(), { placeholder: "eyebrow" });
  s.addText(title, { placeholder: "title" });
  if (notes) s.addNotes(notes);
  return s;
};
const divider = (num, title, body) => {
  const s = pres.addSlide({ masterName: "RE Section", sectionTitle });
  s.addText(num, { placeholder: "num" });
  s.addText(title, { placeholder: "title" });
  s.addText(body, { placeholder: "body" });
  return s;
};
const shadow = () => ({ type: "outer", color: "0B3B37", opacity: 0.12, blur: 6, offset: 2, angle: 90 });
const card = (s, x, y, w, h, opts = {}) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: opts.fill ?? C.background2 }, line: { color: opts.line ?? C.background2, width: 1 }, shadow: opts.shadow ? shadow() : undefined, objectName: opts.name });
// motif: the DFD process circle
const bubble = (s, x, y, d, label, opts = {}) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: opts.fill ?? C.accent1 }, line: { color: opts.line ?? C.accent1, width: 1 }, objectName: `bubble ${label}` });
  s.addText(label, { x, y, w: d, h: d, align: "center", valign: "middle", fontSize: opts.size ?? 13, bold: true, color: opts.color ?? C.background1, margin: 0, isTextBox: true, fontFace: "Cambria" });
};
const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: "top", color: C.text1, fontSize: 13, ...o });
const bullets = (items, o = {}) => items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, paraSpaceAfter: o.gap ?? 5, breakLine: i < items.length - 1 } }));
const fitImage = (file, box) => {
  const { w: iw, h: ih } = sizeOf(file);
  const r = Math.min(box.w / iw, box.h / ih);
  const w = iw * r, h = ih * r;
  return { path: file, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};
function sizeOf(file) { // PNG header
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const table = (s, rows, o) => {
  const head = rows[0].map((t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.accent1 }, fontSize: o.headSize ?? 11 } }));
  const body = rows.slice(1).map((r, i) => r.map((t, j) => ({ text: t, options: { fill: { color: i % 2 ? C.background1 : C.background2 }, bold: j === 0 && o.boldFirst !== false, color: j === 0 ? C.accent1 : C.text1 } })));
  s.addTable([head, ...body], { x: o.x ?? MX, y: o.y, w: o.w ?? W - 2 * MX, colW: o.colW, fontSize: o.fontSize ?? 11, fontFace: "Calibri", valign: "middle", border: { type: "solid", pt: 0.75, color: "D5E5E1" }, margin: [4, 7, 4, 7], rowH: o.rowH, autoPage: false });
};

// ================= Overview =================
sec("Overview");
{
  const s = pres.addSlide({ masterName: "RE Title", sectionTitle });
  s.addText("FUNCTIONAL SPECIFICATION · v1.0 · 20 OCTOBER 2026", { placeholder: "eyebrow" });
  s.addText("Zarmeen Gardens Real Estate & Society ERP", { placeholder: "title" });
  s.addText("How the system sells plots, collects installments, runs post-sale operations, bills and maintains the society, controls development cost and reports — on Frappe / ERPNext v16.", { placeholder: "body" });
  s.addNotes("Title. The FSD describes the Real Estate app (realestate) as built: all phases complete, acceptance 10 of 10.");
}
{
  const s = content("At a glance", "One scheme, one ledger, every operation end to end",
    "Demo scheme figures. Every money movement posts to standard ERPNext documents, so the general ledger is the single source of truth.");
  const stats = [["400", "Kanal boundary"], ["4", "Blocks"], ["352", "Plots on the map"], ["130", "Bookings"], ["16", "Document types, EN / اردو"], ["21", "Reports with charts"]];
  stats.forEach(([n, l], i) => {
    const x = MX + (i % 3) * 2.45, y = 1.75 + Math.floor(i / 3) * 2.05;
    card(s, x, y, 2.25, 1.8, { name: `stat ${l}` });
    txt(s, n, { x: x + 0.22, y: y + 0.22, w: 1.9, h: 0.85, fontSize: 44, bold: true, color: C.accent1, fontFace: "Cambria" });
    txt(s, l, { x: x + 0.22, y: y + 1.12, w: 1.9, h: 0.5, fontSize: 13, color: C.accent4 });
  });
  s.addChart(pres.charts.DOUGHNUT, [{ name: "Plots", labels: ["Available", "Booked", "Sold", "Possession", "Hold / blocked"], values: [218, 96, 29, 2, 7] }], {
    x: 8.2, y: 1.55, w: 4.55, h: 4.6, holeSize: 58,
    chartColors: ["99F6E4", HEX.accent1, HEX.dk2, HEX.accent3, HEX.accent4],
    showTitle: true, title: "Plot inventory today", titleFontSize: 13, titleColor: HEX.dk1, titleFontFace: "+mj-lt",
    showLegend: true, legendPos: "b", legendFontSize: 10, legendFontFace: "+mn-lt", legendColor: HEX.accent4,
    showValue: true, showPercent: false, dataLabelColor: HEX.dk1, dataLabelFontSize: 10, dataLabelFontFace: "+mn-lt",
  });
}
{
  const s = content("Purpose and scope", "Real-estate context around ERPNext accounting",
    "In scope versus out of scope for this release.");
  const col = (x, head, items, fill, colr) => {
    card(s, x, 1.65, 5.9, 5.0, { fill });
    txt(s, head, { x: x + 0.3, y: 1.85, w: 5.3, h: 0.4, fontSize: 16, bold: true, color: colr, fontFace: "Cambria" });
    s.addText(bullets(items), { x: x + 0.3, y: 2.35, w: 5.35, h: 4.15, fontSize: 13, color: C.text1, valign: "top", margin: 0, isTextBox: true });
  };
  col(MX, "In scope", ["Land and map: boundary, blocks, plots, infrastructure, KML / GeoJSON import", "CRM and WhatsApp; booking and payment plans", "Installments, receipts and recovery", "Transfers, cancellations, re-allotments, merges, surcharge waivers", "Agent and dealer commissions", "Society billing, maintenance and complaints", "Development cost, procurement, stock, assets with depreciation", "Documents in English and Urdu; reports, dashboards, owner portal"], C.background2, C.accent1);
  col(MX + 6.23, "Out of scope (this release)", ["Online card payments for owners", "Construction (building) management after possession", "Live WhatsApp Business account — runs in mock mode until credentials are supplied", "Google Maps — supported, needs an API key"], "FFF7ED", C.accent3);
}
{
  const s = content("Users and roles", "Eight roles, each scoped on the server",
    "Agents are scoped to their own records by server-side query conditions, not just by the screens.");
  const roles = [
    ["Admin", "Setup, settings, users, imports, acceptance checks", "Everything"],
    ["Sales Manager", "Bookings, discount and post-sale approvals, portal invites", "All sales, CRM, collections"],
    ["Sales Agent", "Leads, deals, visits, bookings, receipts, chats; raises requests", "Only their own records"],
    ["Accounts", "Receipts, invoices, refunds, commission and supplier payments", "All financial documents"],
    ["Recovery Officer", "Recovery calls, promises, dunning, waiver requests", "Overdue bookings, defaulters"],
    ["Society Manager", "Bills, bulk collection, charge heads, plans, merges", "Society, maintenance, map"],
    ["Projects", "Development projects, budgets, material requests, tasks", "Development, maintenance"],
    ["Plot owner", "Plots, schedule, bills, receipts, documents, complaints", "Only their own, via the portal"],
  ];
  roles.forEach(([r, d, v], i) => {
    const x = MX + (i % 4) * 3.07, y = 1.65 + Math.floor(i / 4) * 2.55;
    card(s, x, y, 2.87, 2.35, { name: `role ${r}` });
    bubble(s, x + 0.22, y + 0.22, 0.5, String(i + 1), { size: 12 });
    txt(s, r, { x: x + 0.85, y: y + 0.27, w: 1.9, h: 0.42, fontSize: 15, bold: true, fontFace: "Cambria", valign: "middle" });
    txt(s, d, { x: x + 0.22, y: y + 0.85, w: 2.45, h: 0.95, fontSize: 11.5 });
    txt(s, "Sees: " + v, { x: x + 0.22, y: y + 1.8, w: 2.45, h: 0.4, fontSize: 10.5, italic: true, color: C.accent1 });
  });
}

// ================= Data flow =================
sec("Data flow");
divider("DFD", "Data flow diagrams", "Level 0 shows the system against the outside world. Level 1 breaks it into ten processes and ten shared data stores (D1–D10).");
{
  const s = content("DFD Level 0 · Context", "The system as one process and the parties around it",
    "Circle = the system (process 0). Rectangles = external entities. Arrows = data flows labelled with what moves.");
  s.addImage({ ...fitImage(img("dfd-level-0.png"), { x: MX, y: 1.5, w: 8.2, h: 5.35 }), altText: "DFD Level 0 context diagram" });
  card(s, 9.2, 1.6, 3.53, 5.1);
  txt(s, "How to read it", { x: 9.45, y: 1.8, w: 3.1, h: 0.4, fontSize: 15, bold: true, color: C.accent1, fontFace: "Cambria" });
  s.addText(bullets(["Circle — the whole system, process 0", "Rectangle — an external entity: buyer, owner, agent, bank, supplier, contractor, regulator, WhatsApp", "Arrow — a data flow, labelled with what moves", "All stores live in the ERPNext database"], { gap: 8 }), { x: 9.45, y: 2.3, w: 3.1, h: 4.2, fontSize: 12.5, color: C.text1, valign: "top", margin: 0, isTextBox: true });
}
{
  const s = content("DFD Level 1 · Processes", "Ten processes share ten data stores",
    "Each process maps to a group of screens in the staff app and to standard ERPNext postings.");
  const P = [["1.0", "Project & land setup", "D1 D10"], ["2.0", "CRM & site visits", "D2"], ["3.0", "Booking & schedule", "D1 D3 D5"], ["4.0", "Collections & recovery", "D4 D5"], ["5.0", "Post-sale operations", "D1 D3 D5"],
    ["6.0", "Commissions", "D5"], ["7.0", "Society billing & maintenance", "D5 D6 D7"], ["8.0", "Development, stock & assets", "D5 D8"], ["9.0", "Documents & messaging", "D9"], ["10.0", "Reports & dashboards", "all"]];
  P.forEach(([n, t, d], i) => {
    const x = MX + (i % 5) * 2.45, y = 1.7 + Math.floor(i / 5) * 2.55;
    bubble(s, x + 0.55, y, 1.1, n, { size: 16, fill: i % 2 ? C.text2 : C.accent1, line: i % 2 ? C.text2 : C.accent1 });
    txt(s, t, { x, y: y + 1.2, w: 2.2, h: 0.62, fontSize: 13, bold: true, align: "center" });
    txt(s, d, { x, y: y + 1.82, w: 2.2, h: 0.3, fontSize: 11, align: "center", color: C.accent1 });
  });
}
const dfd = (file, eyebrow, title, note, side) => {
  const s = content(eyebrow, title, note);
  if (side) {
    s.addImage({ ...fitImage(img(file), { x: MX, y: 1.55, w: 9.0, h: 5.3 }), altText: title });
    card(s, 9.85, 1.6, 2.88, 5.1);
    s.addText(bullets(side, { gap: 8 }), { x: 10.05, y: 1.85, w: 2.5, h: 4.7, fontSize: 12, color: C.text1, valign: "top", margin: 0, isTextBox: true });
  } else {
    s.addImage({ ...fitImage(img(file), { x: MX, y: 1.6, w: W - 2 * MX, h: 4.0 }), altText: title });
  }
  return s;
};
dfd("dfd-1a-sell.png", "DFD Level 1 · Selling", "From enquiry to booked plot (2.0, 3.0)",
  "A won deal becomes a customer; the booking draws plot, price and payment plan, books the plot and posts a Sales Invoice.");
{
  const s = dfd("dfd-1a-collect.png", "DFD Level 1 · After the sale", "Collections, recovery and commissions (4.0, 6.0)",
    "Receipts allocate oldest due first; post-sale changes need approval and post credit notes, fees or refunds; commissions pay out after 25% collected.");
  const pts = [["4.0", "Receipts allocate oldest due first; surcharges and dunning post to the ledger"], ["4.0", "Reminders 3 days before due; overdue notices every 7 days"], ["6.0", "Commission becomes payable at 25% paid; payout by Payment Entry and voucher"]];
  pts.forEach(([n, t], i) => { const x = MX + i * 4.1; bubble(s, x, 5.85, 0.6, n, { size: 11 }); txt(s, t, { x: x + 0.75, y: 5.85, w: 3.2, h: 0.65, fontSize: 12, valign: "middle" }); });
}
dfd("dfd-1a-postsale.png", "DFD Level 1 · Post-sale", "Transfers, cancellations, re-allotments, merges (5.0)",
  "Every post-sale change waits for Sales Manager approval, then posts its accounting and its letter.",
  ["Owner or buyer raises the request; the wizard checks dues first", "Sales Manager approves or rejects; Revise sends it back", "Approval posts fee invoices, credit notes, refunds or waivers", "Plots are released, re-allotted or merged on the map", "Transfer and cancellation letters are versioned in D9"]);
dfd("dfd-1b-society.png", "DFD Level 1 · Society and development", "Society, maintenance and development (7.0, 8.0)",
  "Monthly bills with arrears; complaints become tasks; development cost heads are projects with budgets, procurement and assets.",
  ["7.0 bills every occupied plot on day 1, due in 15 days, arrears carried", "Complaints from portal, WhatsApp or staff become tasks; the owner is told when done", "8.0 runs each cost head as a Project with a Budget", "Material Request → PO → Receipt → Invoice; issues charge the head", "Assets depreciate straight line by category"]);
dfd("dfd-1c-setup-docs.png", "DFD Level 1 · Setup, documents, reports", "Setup, documents & messaging, reports (1.0, 9.0, 10.0)",
  "Setup feeds D1; documents and messages are versioned in D9; reports read every store.",
  ["1.0 builds the scheme: boundary, layout, sizes, prices", "9.0 makes 16 document types as versioned PDFs, English or Urdu", "WhatsApp first, SMS / email fallback", "10.0 reads every store for dashboards, insights and 21 reports"]);
{
  const s = content("Data stores", "D1–D10 are ordinary ERPNext and RE doctypes", "All stores live in the site database.");
  table(s, [["Store", "Holds", "DocTypes"],
    ["D1", "Land & map", "RE Project, RE Block, RE Plot (price history), RE Plot Size, RE Map Feature, RE Map Import, RE Land Use"],
    ["D2", "CRM", "CRM Lead, CRM Deal, CRM Task, CRM Call Log, RE Site Visit"],
    ["D3", "Bookings", "RE Booking (RE Installment rows), RE Payment Plan"],
    ["D4", "Receipts", "RE Payment (RE Payment Allocation rows)"],
    ["D5", "Ledger", "Sales Invoice, Payment Entry, Journal Entry, Dunning, GL Entry, RE Surcharge, RE Commission"],
    ["D6", "Society bills", "RE Society Bill (RE Bill Charge rows), RE Charge Head (RE Charge Rate rows)"],
    ["D7", "Maintenance", "Task, Project (maintenance), RE Maintenance Plan, ToDo"],
    ["D8", "Development", "Material Request, Purchase Order / Receipt / Invoice, Stock Entry, Asset, Depreciation Schedule, Budget, Project"],
    ["D9", "Documents & chat", "RE Generated Document, RE Vault Document, RE Conversation, WhatsApp Message, RE Reminder Log, RE Broadcast"],
    ["D10", "Settings", "RE Settings, RE Payment Plan, RE Quick Reply, approval workflows"]],
    { y: 1.55, colW: [0.8, 1.8, 9.53], fontSize: 11.5, rowH: 0.43 });
}

// ================= Functional requirements =================
sec("Functional requirements");
divider("FR", "Functional requirements", "What each process must do, the screen in the staff app and what it posts in ERPNext. The desk offers the same documents.");
const frSlide = (eyebrow, title, cols, note) => {
  const s = content(eyebrow, title, note);
  const n = cols.length, gap = 0.25, w = (W - 2 * MX - gap * (n - 1)) / n;
  cols.forEach(([num, head, items], i) => {
    const x = MX + i * (w + gap);
    card(s, x, 1.6, w, 5.15, { name: `fr ${num}` });
    bubble(s, x + 0.25, 1.82, 0.62, num, { size: 12 });
    txt(s, head, { x: x + 1.0, y: 1.82, w: w - 1.2, h: 0.62, fontSize: 15, bold: true, fontFace: "Cambria", valign: "middle" });
    s.addText(bullets(items, { gap: 7 }), { x: x + 0.25, y: 2.65, w: w - 0.45, h: 3.95, fontSize: 12, color: C.text1, valign: "top", margin: 0, isTextBox: true });
  });
};
frSlide("FR-1 to FR-3", "Land, CRM and booking", [
  ["1.0", "Project & land", ["Boundary drawn or imported (KML / GeoJSON); land use must total 100%", "Blocks, plot sizes with base price and maintenance; plots with flags and outline", "Price revisions kept as plot price history", "Infrastructure on the map; live map by status or payment health"]],
  ["2.0", "CRM & site visits", ["Leads from any source; an unknown WhatsApp number creates a lead", "Pipeline Opportunity → Site Visit → Negotiation → Booking creates the Customer", "Calls with outcome and promise to pay; missed calls create follow-ups", "Site visits with WhatsApp invitation and result"]],
  ["3.0", "Booking & schedule", ["Customer with CNIC and nominee, an available plot, price, discount, plan", "Discount above 5% waits for Sales Manager approval", "Submit builds the schedule, books the plot, posts a Sales Invoice with payment schedule", "Allotment letter and forms in English or Urdu"]],
], "FR-1.1 to FR-3.4.");
{
  const s = content("FR-4 and FR-5", "Collections, recovery and post-sale operations", "Every post-sale operation goes through an approval workflow.");
  txt(s, "4.0 Collections & recovery", { x: MX, y: 1.6, w: 4, h: 0.4, fontSize: 15, bold: true, color: C.accent1, fontFace: "Cambria" });
  s.addText(bullets(["Receipts by cash, transfer or cheque, allocated oldest due first → Payment Entry", "Unpaid → Due (7 days) → Overdue, driven by the calendar", "Monthly late-payment surcharge after the grace period", "Recovery calls, promises, final notice, dunning", "Reminders 3 days before due; overdue notices every 7 days"], { gap: 6 }), { x: MX, y: 2.05, w: 3.85, h: 4.7, fontSize: 12, color: C.text1, valign: "top", margin: 0, isTextBox: true });
  table(s, [["Operation", "Rule", "Posting on approval"],
    ["Transfer", "No overdue installments or society dues; fee Rs 50,000", "Fee invoice; credit note for seller; new invoice for buyer; transfer letter"],
    ["Cancellation", "Deduct 10% of price, never more than paid", "Credit notes, refund Payment Entry, plot released, unpaid commission cancelled"],
    ["Re-allotment", "A plot freed by a cancellation; fee Rs 25,000", "New booking and invoice; fee invoice"],
    ["Merge", "Adjacent available plots", "New plot with combined outline, area and price"],
    ["Surcharge waiver", "Part or all, with a reason", "Credit note against the surcharge invoice"]],
    { x: 4.75, y: 1.6, w: 7.98, colW: [1.55, 2.85, 3.58], fontSize: 11, rowH: 0.78 });
}
frSlide("FR-6 to FR-8", "Commissions, society and development", [
  ["6.0", "Commissions", ["Agent 1%, dealer 2% of net price accrue at booking", "Payable once the customer has paid 25%", "Paid in batches by Payment Entry with a printable voucher; cancelling reverses it"]],
  ["7.0", "Society", ["Charge heads: fixed, per marla or by plot size", "Monthly bill per occupied plot, day 1, due in 15 days, with arrears", "Bulk collection by owner or block", "Complaints become tasks; plans create tasks ahead of due"]],
  ["8.0", "Development", ["Each cost head is a Project with a Budget", "Material Request → PO → Receipt → Invoice; Stock Entry issues to the head", "Contractor bills and NOC fees as Purchase Invoices", "Assets depreciated straight line by category"]],
], "FR-6.1 to FR-8.4.");
frSlide("FR-9 and FR-10", "Documents, messaging, reports and portal", [
  ["9.0", "Documents & messaging", ["16 document types on the letterhead with a QR verification code", "Numbered PDF versions in English or Urdu (right to left)", "Vault for approvals, NOCs, registry, insurance with expiry alerts", "Shared WhatsApp inbox, templates, quick replies, opt-out keywords, rate-limited broadcasts"]],
  ["10.0", "Reports, dashboards & portal", ["Dashboard, Today, insights and a customer 360 with payer segment", "Report centre: preview, bar / line / area / pie / donut / trend, Excel and PDF", "Owner portal in English / اردو: plots on the map, schedule, bills, receipts, documents, complaints", "Staff preview the portal as an owner, read-only"]],
], "FR-9.1 to FR-10.3.");

// ================= Rules =================
sec("Rules and controls");
divider("§7", "Business rules and controls", "All money maths lives in one tested module (realestate/calc.py). Rates and fees are settings, not code — changes apply to new documents only.");
{
  const s = content("Business rules", "Six calculations every document follows", "Values in brackets are current RE Settings.");
  const R = [
    ["Installment schedule", "net = price − discount\nfixed parts = net × % (round Rs 1,000)\neach = (net − fixed) ÷ n; last absorbs the rest\nΣ schedule = net, always exact"],
    ["Receipt allocation", "pays unpaid rows oldest due first\nnever more than total outstanding"],
    ["Late-payment surcharge", "after 15 days grace:\nmax(Rs 500, overdue × 2% / month)\ncapped at overdue × 10%\none per booking per month"],
    ["Cancellation", "deduction = min(net × 10%, paid)\nrefund = paid − deduction"],
    ["Commission", "net × rate (agent 1%, dealer 2%)\nAccrued → Payable at 25% paid → Paid"],
    ["Society bill", "Σ charge heads for the plot\n(fixed | rate × marla | size rate)\npayable = bill + arrears"],
  ];
  R.forEach(([h, f], i) => {
    const x = MX + (i % 3) * 4.1, y = 1.6 + Math.floor(i / 3) * 2.6;
    card(s, x, y, 3.9, 2.4, { name: `rule ${h}` });
    txt(s, h, { x: x + 0.25, y: y + 0.2, w: 3.4, h: 0.4, fontSize: 15, bold: true, color: C.accent1, fontFace: "Cambria" });
    txt(s, f, { x: x + 0.25, y: y + 0.7, w: 3.45, h: 1.6, fontSize: 11.5, fontFace: "Courier New", color: C.text1 });
  });
}
{
  const s = content("Status models", "Every record moves through a fixed set of states", "Statuses change on submit, on receipts, on the daily refresh and on approvals.");
  const M = [
    ["Plot", ["Available", "Hold", "Booked", "Sold", "Possession"]],
    ["Booking", ["Draft", "Due", "Overdue", "Paid", "Cancelled"]],
    ["Installment", ["Unpaid", "Due", "Overdue", "Partly Paid", "Paid"]],
    ["Approval", ["Draft", "Pending", "Approved", "Rejected", "Revise"]],
    ["Society bill", ["Unpaid", "Due", "Overdue", "Partly Paid", "Paid"]],
    ["Commission", ["Accrued", "Payable", "Paid", "Cancelled"]],
    ["Task", ["Open", "Working", "Completed", "Overdue"]],
  ];
  M.forEach(([rec, st], i) => {
    const y = 1.6 + i * 0.72;
    txt(s, rec, { x: MX, y, w: 1.8, h: 0.5, fontSize: 14, bold: true, fontFace: "Cambria", valign: "middle" });
    st.forEach((t, j) => {
      const x = 2.55 + j * 2.07;
      const warn = /Overdue|Cancelled|Rejected/.test(t), done = /Paid$|Approved|Completed|Possession|Sold/.test(t) && t !== "Partly Paid";
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y + 0.04, w: 1.7, h: 0.44, rectRadius: 0.22, fill: { color: warn ? "FDECEC" : done ? C.accent1 : C.background2 }, line: { color: warn ? C.accent5 : C.accent1, width: 0.75 } });
      txt(s, t, { x, y: y + 0.04, w: 1.7, h: 0.44, fontSize: 11, align: "center", valign: "middle", bold: done, color: warn ? C.accent5 : done ? C.background1 : C.text1 });
      if (j < st.length - 1) s.addShape(pres.shapes.LINE, { x: x + 1.72, y: y + 0.26, w: 0.33, h: 0, line: { color: C.accent4, width: 1, endArrowType: "triangle" } });
    });
  });
}
{
  const s = content("Jobs and integrations", "What runs on its own, and what the system talks to", "Daily jobs are idempotent and safe to re-run.");
  txt(s, "Scheduled jobs", { x: MX, y: 1.6, w: 5.5, h: 0.4, fontSize: 15, bold: true, color: C.accent1, fontFace: "Cambria" });
  table(s, [["When", "Job"],
    ["Daily", "Refresh dues · society bills on bill day · reminders · overdue notices · vault expiry"],
    ["Daily", "Surcharges · dunnings · commission statuses"],
    ["Daily", "Planned maintenance tasks · mark overdue jobs"],
    ["Every minute", "WhatsApp delivery status · SMS fallback"],
    ["Month end", "Asset depreciation"],
    ["Demo only", "A live day of demo activity (re-daily-data)"]], { x: MX, y: 2.05, w: 6.0, colW: [1.35, 4.65], fontSize: 11, rowH: 0.62 });
  txt(s, "Integrations", { x: 6.95, y: 1.6, w: 5.5, h: 0.4, fontSize: 15, bold: true, color: C.accent1, fontFace: "Cambria" });
  table(s, [["Integration", "Use", "State"],
    ["WhatsApp Cloud API", "Templates, chat, delivery, webhook", "Mock until credentials"],
    ["SMS / email", "Fallback when WhatsApp fails", "Configured"],
    ["Maps", "MapLibre satellite; Google optional", "Live; Google needs key"],
    ["ERPNext", "Accounts, buying, stock, assets, projects, dunning", "Live"]], { x: 6.95, y: 2.05, w: 5.78, colW: [1.7, 2.35, 1.73], fontSize: 11, rowH: 0.75 });
}
{
  const s = content("Security, audit and quality", "Controls built into the platform", "Security and non-functional requirements (FSD §12–13).");
  const L = [["Role scoping", "Agents see only their own records — enforced by server-side query conditions"], ["Approvals", "Transfers, cancellations, re-allotments, merges, waivers and large discounts"], ["No deletion", "Submitted financial documents are cancelled and amended, never deleted"], ["Audit trail", "Version history and an activity chain on every financial and settings record"], ["Secrets", "API tokens and map keys stored encrypted in RE Settings"], ["Portal", "Owners reach only their own records; staff preview is read-only"]];
  L.forEach(([h, d], i) => {
    const y = 1.6 + i * 0.84;
    bubble(s, MX, y, 0.58, "✓", { size: 14 });
    txt(s, h, { x: MX + 0.78, y, w: 5.6, h: 0.3, fontSize: 13.5, bold: true });
    txt(s, d, { x: MX + 0.78, y: y + 0.3, w: 5.6, h: 0.42, fontSize: 11.5, color: C.accent4 });
  });
  const N = [["Usability", "Phone width (390 px), light and dark; portal and documents in English or Urdu"], ["Performance", "Lists and insights in about a second; previews up to 1,000 rows"], ["Reliability", "Idempotent daily jobs; missed demo days caught up (up to 14)"], ["Accuracy", "Schedules total the net price; ledger balances; 127 cross-page checks"], ["Maintainability", "Standard ERPNext accounting; money maths in one tested module"]];
  card(s, 7.15, 1.6, 5.58, 5.1);
  txt(s, "Non-functional requirements", { x: 7.4, y: 1.8, w: 5.1, h: 0.4, fontSize: 15, bold: true, color: C.accent1, fontFace: "Cambria" });
  N.forEach(([h, d], i) => {
    txt(s, [{ text: h + "  ", options: { bold: true, color: C.text1 } }, { text: d, options: { color: C.text1 } }], { x: 7.4, y: 2.35 + i * 0.85, w: 5.1, h: 0.75, fontSize: 12 });
  });
}

// ================= Setup =================
sec("Setup and go-live");
divider("§14", "Project and site setup", "Nine steps from an empty bench to a live scheme, checked by the acceptance command.");
{
  const s = content("Setup", "Nine steps to go live", "Demo commands only act when mock mode is on and the default project is flagged as the demo; they never touch real records.");
  const S = [["Install", "ERPNext v16, Frappe CRM, WhatsApp; get-app and install-app realestate"], ["Company & accounts", "Fiscal year July–June, cost centers per block, banks, modes of payment"], ["RE Settings", "Discount limit, fees, surcharge and commission rules, billing day, WhatsApp, map"], ["Project & map", "Boundary, land use, blocks, plot sizes and prices, plots, infrastructure"], ["Sales setup", "Payment plans, agents and dealers, quick replies and templates"], ["Society setup", "Charge heads and size rates, maintenance plans and assignee"], ["Development", "Cost-head projects and budgets, site store, suppliers, asset categories"], ["Users", "Staff with roles; owner-portal invites from the customer page"], ["Go live", "Turn on the scheduler; re-acceptance until every check passes"]];
  S.forEach(([h, d], i) => {
    const col = Math.floor(i / 3), row = i % 3;
    const x = MX + col * 4.1, y = 1.65 + row * 1.68;
    card(s, x, y, 3.9, 1.5, { name: `step ${i + 1}` });
    bubble(s, x + 0.2, y + 0.22, 0.55, String(i + 1), { size: 13, fill: i === 8 ? C.accent3 : C.accent1, line: i === 8 ? C.accent3 : C.accent1 });
    txt(s, h, { x: x + 0.9, y: y + 0.24, w: 2.85, h: 0.45, fontSize: 14, bold: true, fontFace: "Cambria", valign: "middle" });
    txt(s, d, { x: x + 0.9, y: y + 0.72, w: 2.85, h: 0.7, fontSize: 11 });
  });
}
{
  const s = content("Acceptance criteria", "Ten automated checks pass on the demo scheme", "bench --site realestate re-acceptance runs these checks.");
  const A = ["Land use totals 100% of the boundary (400.00 kanal)", "Every plot inside its block, blocks inside the boundary, no overlaps", "Every schedule = price − discount; invoice schedule = invoice total", "Every receipt has a matching submitted Payment Entry; ledger balances", "Map recolours live when a plot changes", "Scheduled jobs enabled and current", "Incoming WhatsApp reaches the inbox and timeline (mock)", "All documents render to PDF on the letterhead, English and Urdu", "Role scoping: agents, managers, portal owners", "Audit trail and no deletion of financial records", "Phone width, light and dark"];
  A.forEach((t, i) => {
    const col = i < 6 ? 0 : 1, row = i < 6 ? i : i - 6;
    const x = MX + col * 6.15, y = 1.6 + row * 0.82;
    card(s, x, y, 5.95, 0.68);
    txt(s, String(i + 1).padStart(2, "0"), { x: x + 0.2, y, w: 0.5, h: 0.68, fontSize: 14, bold: true, color: C.accent1, valign: "middle", fontFace: "Cambria" });
    txt(s, t, { x: x + 0.75, y, w: 4.05, h: 0.68, fontSize: 11.5, valign: "middle" });
    const pass = i < 10;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 4.9, y: y + 0.17, w: 0.9, h: 0.34, rectRadius: 0.17, fill: { color: pass ? C.accent1 : C.background1 }, line: { color: pass ? C.accent1 : C.accent4, width: 0.75 } });
    txt(s, pass ? "PASS" : "BY EYE", { x: x + 4.9, y: y + 0.17, w: 0.9, h: 0.34, fontSize: 9, bold: true, align: "center", valign: "middle", color: pass ? C.background1 : C.accent4 });
  });
}

// ================= Videos =================
sec("Video library");
const VIDEOS = [
  ["00-setup", "Project & site setup", "Install, settings, project and map, plots, plans, users, acceptance"],
  ["01-daily", "Your day in the app", "Home, dashboard, today's visits and follow-ups, notifications"],
  ["02-crm", "CRM & WhatsApp", "Leads, deals, site visits, the shared inbox"],
  ["03-booking", "Booking a plot", "Book, submit, schedule, invoice, Urdu allotment letter"],
  ["04-receipt", "Receiving a payment", "Oldest-due-first allocation, Payment Entry, ledger"],
  ["05-transfer", "Transferring a plot", "No-dues check, new owner, fee, approval"],
  ["06-cancellation", "Cancelling a booking", "Deduction and refund, approval, plot released"],
  ["07-reallotment", "Re-allotting a plot", "A freed plot goes to a waiting buyer"],
  ["08-merge", "Merging plots", "Two adjacent plots become one; the map updates"],
  ["09-recovery", "Recovery & surcharges", "Dunning, monthly surcharges, a waiver"],
  ["10-commissions", "Commissions", "Accrued, payable, paid with a voucher"],
  ["11-society", "Society billing", "Charge heads, bills with arrears, bulk collection"],
  ["12-maintenance", "Maintenance", "Plans, urgent queue, complaint jobs"],
  ["13-development", "Development & assets", "Budget vs actual, procurement, depreciation"],
  ["14-documents-reports", "Documents & reports", "English / Urdu documents, report centre"],
  ["15-portal", "Owner portal", "What a plot owner sees, English and Urdu"],
];
divider("▶", "Simulator videos", "Sixteen narrated screen recordings on the demo scheme — one per operation. Click a thumbnail to play it (files in the videos folder beside this deck).");
for (let p = 0; p < 2; p++) {
  const s = content("Video library", p ? "Post-sale, society, development and portal" : "Setup, daily work and selling", "Each video opens with a title card and narrates every step in a caption bar. Re-record with node tools/videos/record.mjs.");
  VIDEOS.slice(p * 8, p * 8 + 8).forEach(([file, t, d], i) => {
    const x = MX + (i % 4) * 3.07, y = 1.55 + Math.floor(i / 4) * 2.62;
    const poster = img(`posters/${file}.png`);
    card(s, x, y, 2.9, 2.45, { fill: C.background1, line: "D5E5E1", shadow: true, name: `video ${file}` });
    const link = { url: `videos/${file}.webm`, tooltip: `Play ${t}` };
    if (fs.existsSync(poster)) s.addImage({ path: poster, x: x + 0.08, y: y + 0.08, w: 2.74, h: 1.71, hyperlink: link, altText: `${t} video` });
    s.addShape(pres.shapes.OVAL, { x: x + 1.2, y: y + 0.68, w: 0.5, h: 0.5, fill: { color: C.text2, transparency: 15 }, line: { color: C.background1, width: 1.5 }, hyperlink: link });
    s.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + 1.39, y: y + 0.81, w: 0.2, h: 0.24, rotate: 90, fill: { color: C.background1 }, line: { color: C.background1, width: 0 } });
    txt(s, [{ text: file.slice(0, 2) + "  ", options: { color: C.accent1, bold: true } }, { text: t, options: { bold: true } }], { x: x + 0.12, y: y + 1.84, w: 2.68, h: 0.28, fontSize: 11.5 });
    txt(s, d, { x: x + 0.12, y: y + 2.1, w: 2.68, h: 0.3, fontSize: 9, color: C.accent4 });
  });
}
{
  const s = pres.addSlide({ masterName: "RE Title", sectionTitle });
  s.addText("ALL PHASES BUILT · ACCEPTANCE 10 / 10", { placeholder: "eyebrow" });
  s.addText("Ready for real data", { placeholder: "title" });
  s.addText("Open items need the owner: live WhatsApp Business credentials, a Google Maps key if wanted, and online card payments in a later release.", { placeholder: "body" });
}

(async () => {
  const file = path.join(OUT, "Zarmeen-Gardens-FSD.pptx");
  await pres.writeFile({ fileName: file });
  await applyTheme(file, THEME);
  console.log("wrote", file);
})();
