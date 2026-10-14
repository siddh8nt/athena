import { describe, expect, it } from "vitest";
import { runAgent, type AgentStreamEvent } from "@/lib/agent/loop";
import { ONBOARD_SYSTEM, PASTED, briefFinisher, onboardIntro, onboardTools, ONBOARD_BUDGET, type OnboardInput } from "@/lib/agent/onboard";
import type { Extracted } from "@/lib/brief/extract";
import { emptyBrief } from "@/lib/brief/types";
import type { ConverseResult, Turn } from "@/lib/llm/vertex";
import type { QlooClient } from "@/lib/qloo/client";
import type { Env } from "@/lib/env";

const fakeQloo = (): QlooClient => {
  const q = { withLog: () => q } as unknown as QlooClient;
  return q;
};
const call = (calls: { name: string; args: Record<string, unknown> }[]): ConverseResult => ({
  parts: calls.map((c) => ({ functionCall: c, thoughtSignature: "sig" })),
  calls,
  text: "",
  model: "fake",
  ms: 1,
});
const lastResponse = (turns: Turn[], name: string) =>
  turns
    .flatMap((t) => t.parts)
    .filter((p) => p.functionResponse?.name === name)
    .at(-1)?.functionResponse?.response as Record<string, unknown> | undefined;

const lineSheet: Extracted = {
  name: "line-sheet.txt",
  kind: "text",
  text: "Moonrise Pantry. Small-batch chili crisp, $14 a jar. Sold on moonrisepantry.example and in 2 shops. Goal: 40 stockists by spring.",
  parts: [],
  stockists: [{ name: "Lou's Market", city: "Portland" }, { name: "Corner Larder", city: "Seattle" }],
  status: "Read the text",
};

async function onboard(input: OnboardInput, model: (o: { turns: Turn[] }) => Promise<ConverseResult>, given: { tool: string; summary: string; data: unknown }[] = []) {
  const events: AgentStreamEvent[] = [];
  let fellBack = false;
  await runAgent({
    goal: "Understand the brand and write its brief",
    brand: { name: input.name ?? "the brand" },
    system: ONBOARD_SYSTEM,
    intro: onboardIntro(input, ONBOARD_BUDGET, given.length > 0),
    finisher: briefFinisher(input),
    given,
    budget: ONBOARD_BUDGET,
    tools: onboardTools(input).filter((t) => t.name === "read_file" || t.name === "ask_founder"),
    model,
    qloo: fakeQloo(),
    env: {} as Env,
    send: (e) => events.push(e),
    fallback: async () => {
      fellBack = true;
    },
  });
  const brief = events.find((e): e is Extract<AgentStreamEvent, { type: "brief" }> => e.type === "brief");
  return { brief, events, fellBack };
}

describe("onboarding", () => {
  it("writes the brief from files alone: every fact cites its file, code-read stockists go in, unsourced numbers come out", async () => {
    let n = 0;
    const model = async (o: { turns: Turn[] }): Promise<ConverseResult> => {
      n++;
      if (n === 1) return call([{ name: "read_file", args: { name: "line-sheet.txt", why: "Read the line sheet" } }]);
      const read = lastResponse(o.turns, "read_file");
      expect((read?.data as { stockists_read_in_code: number }).stockists_read_in_code).toBe(2);
      const finish = {
        name: { value: "Moonrise Pantry", sources: ["s1"] },
        sells: { value: "Small-batch chili crisp at $14 a jar", sources: ["s1"] },
        channel: { value: "both", sources: ["s1"] },
        notes: [
          { value: "Goal: 40 stockists by spring", sources: ["s1"] },
          { value: "Sells 900 jars a month", sources: ["s1"] },
        ],
        lookalikes: ["Fly By Jing", "Momofuku"],
        qloo_id: "made-up-id",
      };
      if (n === 2) return call([{ name: "finish_brief", args: finish }]);
      expect(lastResponse(o.turns, "finish_brief")?.rejected).toEqual([{ fact: "note: Sells 900 jars a month", reason: "900 not found in s1" }]);
      return call([{ name: "finish_brief", args: finish }]);
    };
    const { brief, fellBack } = await onboard({ websites: [], files: [lineSheet] }, model);
    expect(fellBack).toBe(false);
    const b = brief!.brief;
    expect(b.name).toEqual({ value: "Moonrise Pantry", source: { kind: "file", ref: "line-sheet.txt" } });
    expect(b.sells?.value).toBe("Small-batch chili crisp at $14 a jar");
    expect(b.notes.map((x) => x.value)).toEqual(["Goal: 40 stockists by spring"]);
    expect(b.stockists.map((s) => s.value.name)).toEqual(["Lou's Market", "Corner Larder"]);
    expect(b.proxies).toEqual(["Fly By Jing", "Momofuku"]);
    // A Qloo id no qloo_search returned is never trusted.
    expect(b.qloo).toBeUndefined();
    expect(brief!.dropped).toBe(1);
  });

  it("reads the pasted AI summary as its own source, and the founder's words win", async () => {
    const pasted = "Brand name: Moonrise Pantry\nWhat we sell: chili crisp, $14\nGoals: wholesale to 40 shops";
    const model = async (o: { turns: Turn[] }): Promise<ConverseResult> => {
      if (!lastResponse(o.turns, "read_file")) return call([{ name: "read_file", args: { name: PASTED, why: "Read the summary" } }]);
      return call([
        {
          name: "finish_brief",
          args: {
            name: { value: "Moonrise Pantry", sources: ["s2"] },
            sells: { value: "Chili crisp, $14", sources: ["s2"] },
            channels: { value: "Wholesale first", sources: ["s1"] },
            lookalikes: ["Fly By Jing"],
          },
        },
      ]);
    };
    const { brief } = await onboard({ websites: [], files: [], pasted, steer: "focus on wholesale" }, model, [{ tool: "founder", summary: "What you told me", data: { steering: "focus on wholesale" } }]);
    expect(brief!.brief.name?.source).toEqual({ kind: "pasted" });
    expect(brief!.brief.channels?.source).toEqual({ kind: "message" });
  });

  it("asks again for a name and what it sells, and stalls cleanly if they never come", async () => {
    const model = async (): Promise<ConverseResult> => call([{ name: "finish_brief", args: { lookalikes: ["Fly By Jing"] } }]);
    const { brief, fellBack } = await onboard({ websites: [], files: [lineSheet] }, model);
    expect(brief).toBeUndefined();
    expect(fellBack).toBe(true);
  });

  it("sends the brief back once when it leaves out what the founder said", async () => {
    let n = 0;
    const base = { name: { value: "Moonrise Pantry", sources: ["s2"] }, sells: { value: "Chili crisp", sources: ["s2"] }, lookalikes: ["Fly By Jing"] };
    const model = async (o: { turns: Turn[] }): Promise<ConverseResult> => {
      n++;
      if (n === 1) return call([{ name: "read_file", args: { name: "line-sheet.txt", why: "Read it" } }]);
      if (n === 2) return call([{ name: "finish_brief", args: base }]);
      expect(String(lastResponse(o.turns, "finish_brief")?.founder)).toContain("s1");
      return call([{ name: "finish_brief", args: { ...base, notes: [{ value: "Priority: more grocery stores", sources: ["s1"] }] } }]);
    };
    const { brief } = await onboard({ websites: [], files: [lineSheet], steer: "more grocery stores" }, model, [{ tool: "founder", summary: "What you told me", data: { steering: "more grocery stores" } }]);
    expect(n).toBe(3);
    expect(brief!.brief.notes).toEqual([{ value: "Priority: more grocery stores", source: { kind: "message" } }]);
  });
  it("a steer after a reload keeps the earlier brief and its sources, and adds only what the founder said", async () => {
    const prior = { ...emptyBrief(), name: { value: "Moonrise Pantry", source: { kind: "pasted" as const } }, sells: { value: "Chili crisp", source: { kind: "pasted" as const } } };
    const model = async (): Promise<ConverseResult> =>
      call([
        {
          name: "finish_brief",
          args: { name: { value: "Moonrise Pantry", sources: ["s1"] }, sells: { value: "Chili crisp", sources: ["s1"] }, notes: [{ value: "Priority: more grocery stores", sources: ["s1"] }], lookalikes: ["Fly By Jing"] },
        },
      ]);
    const { brief } = await onboard({ websites: [], files: [], steer: "more grocery stores", brief: prior }, model, [{ tool: "founder", summary: "What you told me", data: { steering: "more grocery stores" } }]);
    expect(brief!.brief.name?.source).toEqual({ kind: "pasted" });
    expect(brief!.brief.sells?.source).toEqual({ kind: "pasted" });
    expect(brief!.brief.notes).toEqual([{ value: "Priority: more grocery stores", source: { kind: "message" } }]);
  });
});
