import { readFileSync } from "node:fs";
import { it } from "vitest";

// Usage: AGENT_DUMP=<file> pnpm live tests/live/replay.live.ts — replays one dumped agent turn to time it.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

it("replays a dumped turn", { timeout: 600_000 }, async () => {
  const { converse } = await import("@/lib/llm/vertex");
  const o = JSON.parse(readFileSync(process.env.AGENT_DUMP!, "utf-8"));
  const chars = JSON.stringify(o.turns).length;
  for (let i = 0; i < Number(process.env.REPLAYS ?? 4); i++) {
    const t0 = Date.now();
    const r = await converse({ ...o, budgetMs: 90_000 }).catch((e) => ({ err: String(e) }));
    console.log(`replay ${i}: ${Date.now() - t0} ms, ${chars} chars,`, "err" in r ? r.err : `${r.tokens} tokens ${r.finishReason} ${r.calls.map((c) => c.name)}`);
  }
});
