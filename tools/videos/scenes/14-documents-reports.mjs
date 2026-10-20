// 14 — Documents (English / Urdu) and the report centre.
export default async function (page, h) {
  await h.title("Documents & reports", "Letters and forms on the letterhead in English or Urdu, the document vault, and the report centre.");
  await h.go("/re/documents", 3000);
  await h.say("Generate any document by type and reference, in English or اردو; each run is a new numbered version.", "Documents");
  await h.click(page.getByRole("radio", { name: "اردو" }).first(), 1500);
  await h.go("/re/reports?r=Collection%20Summary", 4000);
  await h.say("The report centre: every report with filters, summary cards, a sortable table with totals, Excel and PDF.", "Reports");
  await h.click(page.getByRole("button", { name: /^Chart$/ }), 2500);
  await h.say("Chart view: bar, line, area, pie and donut, a trend line and colour per series.");
  await h.click(page.getByRole("button", { name: /^Donut$/ }), 2500);
  await h.hush(); await h.pause(800);
}
