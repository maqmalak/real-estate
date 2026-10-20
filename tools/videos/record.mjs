// node record.mjs                 → record every scene in scenes/
// node record.mjs 02 05           → only scenes whose file name starts with these prefixes
import { readdirSync } from "node:fs";
import { scene } from "./lib.mjs";

const dir = new URL("./scenes/", import.meta.url).pathname;
const only = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith(".mjs") && (!only.length || only.some((p) => f.startsWith(p)))).sort();
let failed = 0;
for (const f of files) {
  const mod = await import(`${dir}${f}`);
  if (!(await scene(f.replace(/\.mjs$/, ""), mod.default))) failed++;
}
process.exit(failed ? 1 : 0);
