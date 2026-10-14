import { readFileSync } from "node:fs";
import { it } from "vitest";

// Usage: pnpm live tests/live/converse.live.ts — function calling on Vertex with thought signatures (§23.2 step 2).
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

it("two tool turns, then forced finish", async () => {
  const { converse } = await import("@/lib/llm/vertex");
  type Turn = Parameters<typeof converse>[0]["turns"][number];
  const functions = [
    { name: "lookup", description: "Population of a US city.", parameters: { type: "object", properties: { city: { type: "string" }, why: { type: "string" } }, required: ["city", "why"] } },
    { name: "finish", description: "Final answer.", parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } },
  ];
  const turns: Turn[] = [{ role: "user", parts: [{ text: "Which is bigger, Austin or Denver? Look both up, then finish." }] }];
  for (let i = 0; i < 4; i++) {
    const r = await converse({ model: "flash", turns, functions, thinking: "LOW", force: i === 3 ? ["finish"] : undefined });
    console.log(i, r.model, r.ms, JSON.stringify(r.calls), "sig:", r.parts.map((p) => !!p.thoughtSignature), r.text.slice(0, 80));
    turns.push({ role: "model", parts: r.parts });
    if (r.calls.some((c) => c.name === "finish") || !r.calls.length) break;
    turns.push({ role: "user", parts: r.calls.map((c) => ({ functionResponse: { name: c.name, response: { population: c.args.city === "Austin" ? 979_882 : 716_577 } } })) });
  }
});
