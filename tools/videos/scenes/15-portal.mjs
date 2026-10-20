// 15 — The owner portal (staff preview, read-only).
export default async function (page, h) {
  await h.title("Owner portal", "Plot owners see their plots, schedule, bills and receipts, download documents and raise complaints — in English or Urdu.");
  const [c] = await h.list("Customer", { re_demo: 1, re_portal_user: ["is", "set"] }, ["name", "customer_name"]);
  await h.go(`/portal?as=${encodeURIComponent(c.name)}`, 4000);
  await h.say(`${c.customer_name}'s portal (staff preview, read-only): what is paid, what is due, and the next installment.`, "Owner portal");
  await h.scroll(700); await h.scroll(700);
  await h.click(page.getByRole("link", { name: /Payments|ادائیگیاں/ }).first(), 2500);
  await h.say("Receipts and society bills, each downloadable as a PDF.");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await h.pause(900);
  await h.click(page.locator("header").getByText("اردو", { exact: true }).first(), 2500);
  await h.say("Switch to Urdu — the whole portal turns right-to-left.");
  await h.click(page.getByRole("link", { name: /Home|ہوم/ }).first(), 2500);
  await h.scroll(600);
  await h.hush(); await h.pause(1000);
}
