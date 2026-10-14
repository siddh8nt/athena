import { describe, expect, it, vi } from "vitest";
import { checkClaims, numbersIn } from "@/lib/agent/cite";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import type { Tool } from "@/lib/agent/tools";
import type { ConverseResult, Turn } from "@/lib/llm/vertex";
import type { QlooClient } from "@/lib/qloo/client";
import type { Env } from "@/lib/env";

const src = (entries: Record<string, unknown>) => new Map(Object.entries(entries).map(([k, data]) => [k, { data }]));

describe("citations", () => {
  it("reads numbers with their precision, not ids, ordinals or dates", () => {
    expect(numbersIn("Reach 1.2 million in s3, the 3rd crowd, on 2026-10-31; up 18% and $85k").map((n) => n.raw)).toEqual(["1.2 million", "18%", "$85k"]);
  });

  it("keeps a number a cited source holds, rounded or as a percentage of a fraction", () => {
    const s = src({ s1: { population: 1_234_567, yoy: 0.183 }, s2: { metros: ["a", "b", "c"] } });
    const { kept, rejected } = checkClaims(
      [
        { text: "About 1.2 million people live there.", sources: ["s1"] },
        { text: "Attention is up 18% on last year.", sources: ["s1"] },
        { text: "It leads in 3 metros.", sources: ["s2"] },
      ],
      s,
    );
    expect(rejected).toEqual([]);
    expect(kept).toHaveLength(3);
  });

  it("rejects a number no cited source holds, a claim with no source, and a date not in its source", () => {
    const s = src({ s0: { date: "2026-10-14", moments: [{ name: "Halloween", date: "2026-10-31", days: 17 }] }, s1: { population: 950_000 } });
    const { kept, rejected } = checkClaims(
      [
        { text: "Halloween is 17 days away, on 2026-10-31.", sources: ["s0"] },
        { text: "About 2 million people live there.", sources: ["s1"] },
        { text: "This crowd is growing fast.", sources: [] },
        { text: "Launch by 2026-12-01.", sources: ["s0"] },
        { text: "950,000 people.", sources: ["s9"] },
      ],
      s,
    );
    expect(kept.map((c) => c.text)).toEqual(["Halloween is 17 days away, on 2026-10-31."]);
    expect(rejected.map((c) => c.reason)).toEqual(["2 million not found in s1", "cites no source", "2026-12-01 not found in s0", "cites unknown sources s9"]);
  });
});

// ---- The loop, with a scripted model --------------------------------------------------------------------------

const fakeQloo = (): QlooClient => {
  const q = { withLog: () => q } as unknown as QlooClient;
  return q;
};
const ENV = {} as Env;
const call = (name: string, args: Record<string, unknown>): ConverseResult => ({
  parts: [{ functionCall: { name, args }, thoughtSignature: "sig" }],
  calls: [{ name, args }],
  text: "",
  model: "fake",
  ms: 1,
});
/** The response the model saw last for a tool, as the loop sent it. */
const lastResponse = (turns: Turn[], name: string) =>
  turns
    .flatMap((t) => t.parts)
    .filter((p) => p.functionResponse?.name === name)
    .at(-1)?.functionResponse?.response as Record<string, unknown> | undefined;

const tools = (stability: number): Tool[] => [
  {
    name: "measure",
    description: "",
    properties: {},
    qloo: () => 10,
    run: async () => ({ summary: `1 crowd, stability ${stability}`, data: { crowds: [{ id: "c1", stability, people: 420_000 }] } }),
  },
  {
    name: "probe",
    description: "",
    properties: {},
    qloo: () => 10,
    run: async () => ({ summary: "firmer", data: { crowds: [{ id: "c1", stability: 0.81, people: 420_000 }] } }),
  },
  { name: "huge", description: "", properties: {}, qloo: () => 1000, run: async () => ({ summary: "", data: {} }) },
];

/** A model that reacts to evidence: it probes only when the measured crowd is soft. */
function reactiveModel(log: { force?: string[] }[]) {
  return async (o: { turns: Turn[]; force?: string[] }): Promise<ConverseResult> => {
    log.push({ force: o.force });
    const measured = lastResponse(o.turns, "measure");
    const probed = lastResponse(o.turns, "probe");
    if (!measured) return call("measure", { why: "Measure the crowds" });
    const stability = ((measured.data as { crowds: { stability: number }[] }).crowds[0]).stability;
    if (stability < 0.6 && !probed) return call("probe", { why: "The crowd is soft; probing to firm it up" });
    const id = probed ? (probed.source as string) : (measured.source as string);
    return call("finish", { headline: "Win the main crowd first", claims: [{ text: "About 420,000 people sit in its hot clusters.", sources: [id] }] });
  };
}

async function runWith(opts: Partial<Parameters<typeof runAgent>[0]> & { model: Parameters<typeof runAgent>[0]["model"] }) {
  const events: AgentStreamEvent[] = [];
  let fellBack = false;
  const res = await runAgent({
    goal: "Decide who to win first",
    brand: { name: "Test Co" },
    qloo: fakeQloo(),
    env: ENV,
    send: (e) => events.push(e),
    fallback: async () => {
      fellBack = true;
    },
    tools: tools(0.9),
    ...opts,
  });
  const steps = events.flatMap((e) => (e.type === "event" ? [e.event] : []));
  const answer = events.find((e): e is Extract<AgentStreamEvent, { type: "answer" }> => e.type === "answer");
  return { res, events, steps, answer, fellBack: () => fellBack };
}

describe("the agent loop", () => {
  it("chooses its next tool from the evidence: probes a soft crowd, skips the probe for a firm one", async () => {
    const soft = await runWith({ model: reactiveModel([]), tools: tools(0.42) });
    const firm = await runWith({ model: reactiveModel([]), tools: tools(0.9) });
    const used = (s: typeof soft) => s.steps.filter((e) => e.status !== "running").map((e) => e.tool);
    expect(used(soft)).toEqual(["today", "goal", "measure", "probe", "check"]);
    expect(used(firm)).toEqual(["today", "goal", "measure", "check"]);
    expect(soft.steps.find((e) => e.tool === "probe")?.why).toBe("The crowd is soft; probing to firm it up");
    // The answer cites the probe's source, and every source is listed with its tool.
    expect(soft.answer?.answer.claims[0].sources).toEqual(["s2"]);
    expect(soft.answer?.sources.map((s) => `${s.id}:${s.tool}`)).toEqual(["s0:today", "s1:measure", "s2:probe"]);
    expect(soft.fellBack()).toBe(false);
  });

  it("gives one chance to fix an unsourced number, then drops what's still unsourced", async () => {
    let n = 0;
    const model = async (o: { turns: Turn[] }): Promise<ConverseResult> => {
      n++;
      if (n === 1) return call("measure", { why: "Measure" });
      if (n === 2) return call("finish", { headline: "Win them", claims: [{ text: "About 3 million people.", sources: ["s1"] }, { text: "About 420,000 people.", sources: ["s1"] }] });
      const fix = lastResponse(o.turns, "finish");
      expect(fix?.accepted).toBe(false);
      expect(fix?.rejected).toEqual([{ text: "About 3 million people.", reason: "3 million not found in s1" }]);
      return call("finish", { headline: "Win them", claims: [{ text: "Still 3 million.", sources: ["s1"] }, { text: "About 420,000 people.", sources: ["s1"] }] });
    };
    const { answer } = await runWith({ model });
    expect(answer?.answer.claims.map((c) => c.text)).toEqual(["About 420,000 people."]);
    expect(answer?.answer.dropped).toBe(1);
  });

  it("still gives the fix-up round when finish comes on the last turn", async () => {
    let n = 0;
    const model = async (): Promise<ConverseResult> => {
      n++;
      if (n === 1) return call("measure", { why: "Measure" });
      if (n === 2) return call("finish", { headline: "Win them", claims: [{ text: "About 3 million people.", sources: ["s1"] }] });
      return call("finish", { headline: "Win them", claims: [{ text: "About 420,000 people.", sources: ["s1"] }] });
    };
    const { answer, fellBack } = await runWith({ model, budget: { turns: 2 } });
    expect(n).toBe(3);
    expect(fellBack()).toBe(false);
    expect(answer?.answer.claims.map((c) => c.text)).toEqual(["About 420,000 people."]);
  });

  it("hedges a slow model turn with a second request, and the first answer wins", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const model = async (): Promise<ConverseResult> => {
        n++;
        if (n === 1) return new Promise(() => undefined); // a turn that never comes back
        return call("finish", { headline: "Done", claims: [{ text: "Planned from today.", sources: ["s0"] }] });
      };
      const run = runWith({ model });
      await vi.advanceTimersByTimeAsync(10_001);
      const { answer, fellBack } = await run;
      expect(n).toBe(2);
      expect(fellBack()).toBe(false);
      expect(answer?.answer.claims).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a tool that would pass the Qloo budget, without running it", async () => {
    let n = 0;
    let seen: Record<string, unknown> | undefined;
    const model = async (o: { turns: Turn[] }): Promise<ConverseResult> => {
      if (++n === 1) return call("huge", { why: "Everything at once" });
      seen = lastResponse(o.turns, "huge");
      return call("finish", { headline: "Done", claims: [{ text: "Today is the plan date.", sources: ["s0"] }] });
    };
    const { steps } = await runWith({ model, budget: { qloo: 150 } });
    expect(String(seen?.refused)).toContain("needs up to 1000 Qloo calls");
    expect(steps.find((e) => e.tool === "huge")?.summary).toContain("Skipped to stay within the budget");
  });

  it("forces finish on the last turn", async () => {
    const log: { force?: string[] }[] = [];
    const model = async (o: { turns: Turn[]; force?: string[] }): Promise<ConverseResult> => {
      log.push({ force: o.force });
      return o.force ? call("finish", { headline: "Done", claims: [{ text: "Planned from today.", sources: ["s0"] }] }) : call("measure", { why: "again" });
    };
    const { answer } = await runWith({ model, budget: { turns: 3 } });
    expect(log.map((l) => !!l.force)).toEqual([false, false, true]);
    expect(answer).toBeDefined();
  });

  it("falls back to the fixed pipeline when the agent stalls, with no failure shown", async () => {
    const stalled = await runWith({ model: reactiveModel([]), stallAt: 2 });
    expect(stalled.fellBack()).toBe(true);
    expect(stalled.answer).toBeUndefined();
    expect(stalled.steps.at(-1)).toMatchObject({ tool: "plan", why: "Finishing with the standard plan", status: "ok" });
    expect(stalled.steps.some((e) => e.status === "error")).toBe(false);

    const broken = await runWith({ model: async () => Promise.reject(new Error("Vertex 503")) });
    expect(broken.fellBack()).toBe(true);
    expect(broken.res.reason).toBe("model error");

    const silent = await runWith({ model: async () => ({ parts: [{ text: "hmm" }], calls: [], text: "hmm", model: "fake", ms: 1 }) });
    expect(silent.res.reason).toBe("no tool calls");
  });
});
