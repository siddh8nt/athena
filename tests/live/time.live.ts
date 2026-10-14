import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Usage: pnpm live tests/live/time.live.ts — the same timing question on two run dates (§23.2 step 1).
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

it("timing follows the run date", async () => {
  const { generate } = await import("@/lib/llm/vertex");
  const { runAt, parseAsOf } = await import("@/lib/time/now");
  const ask = (asOf?: string) =>
    runAt(asOf ? parseAsOf(asOf) : undefined, () =>
      generate({ model: "lite", prompt: "A US tinned-fish brand wants one retail moment to prepare for next. Reply with only the moment's name and its date (YYYY-MM-DD).", maxOutputTokens: 200, temperature: 0 }),
    );
  const [now, spring] = await Promise.all([ask(), ask("2027-04-20")]);
  console.log({ now: now.text.trim(), spring: spring.text.trim() });
  expect(now.text).toMatch(/2026-1[0-2]/);
  expect(spring.text).toMatch(/2027-0[5-7]/);
});
