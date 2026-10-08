import { readFileSync } from "node:fs";
import { it } from "vitest";

// `pnpm warm`: the warm-cache job (§14.9) run locally against the live APIs. On Cloud Run the same code
// runs from /api/warm, triggered daily by Cloud Scheduler.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

it("warm the demo brands", async () => {
  const { warmDemoBrands } = await import("@/lib/agent/warm");
  const slugs = process.env.DEMO?.split(",");
  await warmDemoBrands(slugs, (line) => process.stdout.write(`${line}\n`));
});
