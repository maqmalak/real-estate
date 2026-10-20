// 02 — CRM and WhatsApp: leads pipeline, a lead, deals, site visits and the team inbox.
export default async function (page, h) {
  await h.title("CRM & WhatsApp", "Leads and deals, calls and follow-ups, site visits, and the shared WhatsApp inbox.");
  await h.go("/crm/leads", 3000);
  await h.say("Leads arrive from walk-ins, dealers, Facebook, the website and WhatsApp; each has an owning agent. Agents see only their own.", "Leads");
  await h.click(page.locator("main article").first(), 3000);
  await h.say("A lead: contact, interest (block, size, budget), activity, emails, WhatsApp and follow-ups in one place.");
  await h.scroll(600);
  await h.go("/crm/deals", 3000);
  await h.say("Deals move Opportunity → Site Visit → Negotiation → Booking; reaching Booking creates the ERPNext customer.", "Deals");
  await h.go("/re/d/re-site-visit", 2500);
  await h.say("Site visits are scheduled with a WhatsApp invitation and closed with an outcome.", "Site visits");
  await h.go("/re/inbox?view=all", 3000);
  await h.say("The shared WhatsApp inbox: mine, unassigned, unread, all and resolved.", "WhatsApp inbox");
  await h.click(page.locator("main button").filter({ hasText: /Customer|Lead|CRM Deal/ }).first(), 2500);
  const box = page.getByPlaceholder(/Message/).first();
  await h.type(box, "Assalam o Alaikum! Your next installment is due on the 10th. Reply if you need the bank details.", 900);
  await h.say("Reply in the thread — quick replies with “/”, approved templates and plot location pins are one click away.");
  await page.keyboard.press("Enter");
  await h.pause(2500);
  await h.say("Delivery ticks update live; a failed WhatsApp message falls back to SMS or email.");
  await h.hush(); await h.pause(600);
}
