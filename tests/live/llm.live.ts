import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";

// Usage: pnpm live tests/live/llm.live.ts — grounded festival dates for Brightland's LA festivals.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

it("festival dates (grounded)", async () => {
  const { groundedFestivalDates } = await import("@/lib/enrich/festival-dates");
  const { metroById } = await import("@/lib/playbook/metros");
  const lookup = groundedFestivalDates(true)!;
  const la = metroById("la");
  const names = ["Unique LA", "Silverlake Flea", "Topanga Vintage Market", "Labyrinth of Jareth Masquerade Ball", "Northridge Farmers Market and Family Festival", "The Taste of Soul"];
  const out = await Promise.all(names.map(async (n) => [n, await lookup(n, la)] as const));
  mkdirSync(".cache/live", { recursive: true });
  writeFileSync(".cache/live/festival-dates.json", JSON.stringify(out, null, 1));
});
