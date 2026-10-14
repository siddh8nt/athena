import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";

// Usage: pnpm live tests/live/agent.live.ts — one real agent run (§23.2 step 2), each model turn timed.
// AGENT_BRAND / AGENT_SITE / AGENT_THINK / AGENT_STALL pick the brand, its site, the thinking tier and a forced stall.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

it("runs one goal end to end", { timeout: 300_000 }, async () => {
  const { converse } = await import("@/lib/llm/vertex");
  const { runAgent } = await import("@/lib/agent/loop");
  const { getQloo } = await import("@/lib/qloo");
  const { readEnv } = await import("@/lib/env");
  const name = process.env.AGENT_BRAND ?? "Olipop";
  const think = (process.env.AGENT_THINK ?? "LOW") as "MINIMAL" | "LOW";
  const started = Date.now();
  const res = await runAgent({
    goal: `Decide who ${name} should win first, and how.`,
    brand: { name, websites: process.env.AGENT_SITE ? [process.env.AGENT_SITE] : [] },
    qloo: getQloo(),
    env: readEnv(),
    stallAt: process.env.AGENT_STALL ? Number(process.env.AGENT_STALL) : undefined,
    model: async (o) => {
      const t0 = Date.now();
      const r = await converse({ ...o, thinking: think }).catch((err) => {
        if (process.env.AGENT_DUMP) writeFileSync(process.env.AGENT_DUMP, JSON.stringify(o));
        console.log(`  turn: failed after ${Date.now() - t0} ms`);
        throw err;
      });
      console.log(`  turn: ${r.ms} ms, ${r.tokens} tokens, ${r.calls.map((c) => c.name).join(", ") || "(text)"}`);
      return r;
    },
    send: (e) => {
      if (e.type === "event" && e.event.status !== "running") console.log(`[${e.event.status}] ${e.event.t} ${e.event.tool}: ${e.event.why.slice(0, 110)} -> ${String(e.event.summary ?? "").slice(0, 180)}`);
      else if (e.type === "answer") {
        console.log("HEADLINE:", e.answer.headline);
        for (const c of e.answer.claims) console.log(" -", c.text, c.sources.join(","));
        console.log(" assumptions:", e.answer.assumptions, "dropped:", e.answer.dropped);
      } else if (e.type === "ask") console.log("ASK:", e.ask.question);
      else if (e.type === "done") console.log("done", e);
    },
    fallback: async () => console.log("FALLBACK"),
  });
  console.log(res, `${Date.now() - started} ms`);
});
