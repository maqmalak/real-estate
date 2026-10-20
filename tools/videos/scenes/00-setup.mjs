// 00 — Project and site setup: install, settings, project and map, blocks, plot sizes, plots, plans, society heads, users.
export default async function (page, h) {
  await h.title("Project &amp; site setup", "Install the app, configure the company and rules, then build the scheme: project, map, blocks, plot sizes, plots and payment plans.");

  // install steps as a card
  await page.evaluate(() => {
    window.__reEnsure?.();
    const d = document.createElement("div"); d.id = "re-title";
    d.style.fontSize = "20px"; d.style.alignItems = "stretch";
    d.innerHTML = `<em style="align-self:center">Step 1 · Install</em>
      <pre style="font:500 20px/1.7 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.25);padding:28px 34px;border-radius:16px;margin:0 auto;text-align:left;white-space:pre">
bench get-app realestate
bench new-site realestate --install-app erpnext
bench --site realestate install-app crm whatsapp realestate
bench --site realestate re-acceptance      <span style="color:#99f6e4"># checks the setup</span>
bench --site realestate re-reset-demo      <span style="color:#99f6e4"># optional demo data</span></pre>`;
    document.body.appendChild(d);
  });
  await h.pause(5200);
  await page.evaluate(() => document.getElementById("re-title")?.remove());

  await h.go("/re/d/re-settings");
  await h.say("RE Settings holds the company, the default project and every rule: discount limit, surcharge, transfer and cancellation fees, commissions, billing day and WhatsApp.", "Step 2 · Settings");
  await h.scroll(600);
  await h.say("Rates and fees are settings, not code — changing them applies to new documents only.");
  await h.scroll(700);
  await h.scroll(-1300, 600);

  await h.go("/re/d/re-project");
  await h.say("Projects: each housing scheme with its boundary, land use and progress.", "Step 3 · Project");
  await h.click(page.locator("main a[href*='/re/d/re-project/'], main tr[role='button'], main tbody tr").first(), 2600);
  await h.say("The project profile shows land use (must total 100% of the boundary), sell-through, collections and development progress.");
  await h.scroll(700);
  await h.scroll(700);

  await h.go("/re/d/re-map-import");
  await h.say("Map Import brings the surveyed boundary, blocks and plots from KML or GeoJSON — previewed on the map before anything is created.", "Step 4 · Map");
  await h.click(page.locator("main tbody tr").first(), 2600);
  await h.scroll(600);

  await h.go("/re/map", 3500);
  await h.say("The society map: every plot coloured by status, blocks, roads, parks and infrastructure.");

  await h.go("/re/d/re-block");
  await h.say("Blocks with their plot size, planned plots and a sell-through gauge.", "Step 5 · Blocks");
  await h.go("/re/d/re-plot-size");
  await h.say("Plot sizes carry the base price and monthly maintenance; compare sell-through, stock and price per marla.", "Step 6 · Plot sizes");
  await h.go("/re/d/re-plot");
  await h.say("Plot records: number, block, size, street, corner / park-facing flags, outline and price history.", "Step 7 · Plots");
  await h.scroll(500);

  await h.go("/re/d/re-payment-plan");
  await h.say("Payment plans: down payment, monthly or quarterly installments, balloons, development charges and possession share.", "Step 8 · Payment plans");
  await h.click(page.locator("main tbody tr").first(), 2600);
  await h.say("The schedule preview shows exactly what a buyer pays, and it always totals the net price.");
  await h.scroll(600);

  await h.go("/re/d/re-charge-head");
  await h.say("Society charge heads — fixed, per marla or by plot size — and what each plot size pays every month.", "Step 9 · Society");
  await h.go("/re/settings/users");
  await h.say("Users & roles: Sales Manager, Sales Agent (own records only), Accounts, Recovery Officer, Society Manager.", "Step 10 · Users");
  await h.go("/re/acceptance", 3500);
  await h.say("Finally run the acceptance checks: land use, geometry, schedules, ledger, scheduler, documents and roles.", "Step 11 · Go live");
  await h.hush();
  await h.pause(800);
}
