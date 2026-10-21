import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INPUTS } from "@/lib/team/inputs";

// Usage: pnpm live tests/live/graph-inputs.live.ts
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

// Live: the model reads Brand Graph lines like a real brand's and answers only what they settle (founder, 21 Oct).
const facts = [
  "Parks Project operates as a purpose-driven brand advocating for people and parks, guided by the mission 'Leave It Better'.",
  "Parks Project partners directly with over 45 Park Conservancies across the USA.",
  "Retail and Sales Channels: Parks Project sells direct-to-consumer on parksproject.us, in independent outdoor and gift shops, and through its own physical Discovery Center store in San Francisco.",
  "Parks Project sells accessories and outdoor gear including hats and beanies ($27.99–$45.00), socks ($14.00–$45.00) and camp chairs ($96.00).",
];

describe("answering from the Brand Graph, live", () => {
  it("takes the stockists from the graph and leaves budget and launch to the founder", async () => {
    const qs = INPUTS.filter((q) => ["input_stockists", "input_budget", "input_launch"].includes(q.id));
    const { fromGraph } = await import("@/lib/agent/team");
    const out = await fromGraph(qs, facts, true);
    console.log(JSON.stringify(out.map((k) => ({ id: k.q.id, answer: k.answer, said: k.said })), null, 2));
    expect(out.map((k) => k.q.id)).toContain("input_stockists");
    expect(out.map((k) => k.q.id)).not.toContain("input_budget");
    expect(out.map((k) => k.q.id)).not.toContain("input_launch");
  }, 60_000);
});
