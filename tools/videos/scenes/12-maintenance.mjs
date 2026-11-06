// 12 — Maintenance plans, complaints and jobs.
export default async function (page, h) {
  await h.title("Maintenance & complaints", "Planned upkeep and owner complaints become tasks for technicians; owners are told when the job is done.");
  await h.go("/re/d/re-maintenance-plan", 4000);
  await h.say("Maintenance plans: what's due in the next 30 days, who does it, and how reliably jobs are done on time.", "Plans");
  await h.scroll(700);
  await h.go("/re", 3000);
  await h.scroll(1400);
  await h.say("Complaints from the owner portal, WhatsApp or staff land in the urgent queue by priority.", "Complaints");
  const job = page.locator("main a[href*='/projects/tasks/']").first();
  if (await job.count()) await h.click(job, 3000); else await h.go("/projects/tasks", 3500);
  await h.say("Each complaint is an ERPNext Task with plot, priority, due date and assignee.", "Job");
  await h.go("/re/d/re-map-feature", 4000);
  await h.say("Infrastructure: build-out per network, upkeep jobs and the linked assets.", "Infrastructure");
  await h.hush(); await h.pause(800);
}
