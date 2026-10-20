// 01 — A day in the app: home, dashboard, today's visits and follow-ups, insights, notifications.
export default async function (page, h) {
  await h.title("Your day in Zarmeen Gardens", "Home, dashboard, today's visits and follow-ups, insights and notifications.");
  await h.go("/re/home", 2500);
  await h.say("Home: every place you can open, grouped like the left menu — groups open and close, and the one you're in stays open.", "Home");
  await h.go("/re", 3500);
  await h.say("Dashboard: collections, sales, receivables ageing, block scorecards and what needs attention now.", "Dashboard");
  await h.scroll(700); await h.scroll(700);
  await h.say("The urgent queue: complaints by priority, documents due for renewal and approvals waiting.");
  await h.go("/re/today", 2500);
  await h.say("Today: site visits and follow-ups due, with one-click call and a WhatsApp chat that opens in the team inbox.", "Today");
  await h.go("/re/insights", 3500);
  await h.say("Insights for managers: sales and collections by month, agents, CRM funnel, cost vs revenue and the society.", "Insights");
  await h.scroll(800); await h.scroll(800);
  await h.click(h.button("Notifications"), 2000);
  await h.say("The bell: new bookings, large receipts, approvals needed, urgent complaints and @mentions — each opens the record in the app.", "Notifications");
  await page.keyboard.press("Escape");
  await h.hush(); await h.pause(600);
}
