// 08 — Merge two adjacent plots.
export default async function (page, h) {
  await h.title("Merging plots", "Two adjacent plots become one, with a combined outline, area and price.");
  await h.go("/re/operations?tab=merges&wizard=merge", 3500);
  await h.dialog().locator("#m-block").selectOption("C Block");
  await h.pause(1800);
  const chips = h.dialog().locator("button.border-emerald-400\\/50");
  await h.say("Pick adjacent available plots in the block.", "Step 1 · Plots");
  // selecting a chip restyles it, so resolve both labels first and click by text
  const labels = await chips.allInnerTexts();
  // pick two that touch: ask the merge preview (it rejects plots that don't share a side)
  const names = labels.map((t) => t.trim()).reverse();
  const ok = async (x, y) => page.evaluate(async (ps) => {
    const r = await fetch(`/api/method/realestate.operations.merge_preview?plots=${encodeURIComponent(JSON.stringify(ps))}`, { credentials: "include" });
    return (await r.json()).message?.ok;
  }, [`C-${x}`, `C-${y}`]);
  let a, b;
  outer: for (let i = 0; i < names.length; i++) for (const y of names.slice(i + 1, i + 6)) if (await ok(names[i], y)) { a = names[i]; b = y; break outer; }
  if (!a) throw new Error("no adjacent available pair in C Block");
  const chip = (t) => h.dialog().getByRole("button", { name: t, exact: true });
  await h.click(chip(a), 700);
  await h.click(chip(b), 2500);
  await h.say("The preview checks they touch and shows the merged area, size and combined price.", "Step 2 · Preview");
  await h.click(h.button("Submit for approval", h.dialog()), 3000);
  const [m] = await h.list("RE Plot Merge", { workflow_state: "Pending Approval" }, ["name"], { order_by: "creation desc" });
  await h.go("/re/operations?tab=approvals", 3000);
  await h.click(page.locator("div").filter({ hasText: m.name }).getByRole("button", { name: /Approve/ }).first(), 5000);
  await h.say("Approved: the merged plot is created and the source plots are retired.", "Step 3 · Approved");
  await h.go("/re/map", 4000);
  await h.say("The map shows the merged plot straight away.");
  await h.hush(); await h.pause(800);
}
