import { describe, expect, it } from "vitest";
import { fromGraph } from "@/lib/agent/team";
import { TOOLS, type FounderQuestion } from "@/lib/agent/tools";
import { INPUTS } from "@/lib/team/inputs";

// Founder, 21 Oct: never ask what the Brand Graph already says. Every subagent's question, planned or mid-run, goes past
// the graph first; the model reads it, and code keeps only an answer that cites a line it was shown. Names are fictional.

const facts = ["Tidewell Tins sells online and in independent grocers and gift shops in Maine.", "Founded in Portland, Maine."];
const reply = (known: unknown) => (async () => ({ text: JSON.stringify({ known }) })) as never;
const stockists = INPUTS.filter((q) => q.id === "input_stockists");

describe("answering from the Brand Graph", () => {
  it("keeps an answer the graph gives, citing a line", async () => {
    const out = await fromGraph(stockists, facts, true, reply([{ id: "input_stockists", answer: "Independent grocers and gift shops in Maine", said: "you're in independent grocers and gift shops", lines: [0] }]));
    expect(out).toEqual([{ q: stockists[0], answer: "Independent grocers and gift shops in Maine", said: "you're in independent grocers and gift shops" }]);
  });

  it("drops an answer that cites nothing it was shown, or a question it wasn't asked", async () => {
    expect(await fromGraph(stockists, facts, true, reply([{ id: "input_stockists", answer: "Whole Foods", said: "x", lines: [7] }]))).toEqual([]);
    expect(await fromGraph(stockists, facts, true, reply([{ id: "input_budget", answer: "Under $1,000", said: "x", lines: [0] }]))).toEqual([]);
  });

  it("asks as before with no model, no graph, or a failed call", async () => {
    const boom = (async () => { throw new Error("429"); }) as never;
    expect(await fromGraph(stockists, facts, false, reply([{ id: "input_stockists", answer: "a", lines: [0] }]))).toEqual([]);
    expect(await fromGraph(stockists, [], true, reply([{ id: "input_stockists", answer: "a", lines: [0] }]))).toEqual([]);
    expect(await fromGraph(stockists, facts, true, boom)).toEqual([]);
  });

  it("a subagent's own question is answered from the graph instead of reaching the founder", async () => {
    const tool = TOOLS.find((t) => t.name === "ask_founder")!;
    const asked: FounderQuestion[] = [];
    const state = { probes: [], asks: 0, ran: [] } as never;
    const ctx = { state, ask: (q: FounderQuestion) => asked.push(q), known: async () => "Independent grocers in Maine" } as never;
    const out = await tool.run({ question: "Where do you sell now?", why: "To skip shops you're in", options: [{ label: "Shops" }, { label: "Online only" }] }, ctx);
    expect(asked).toEqual([]);
    expect(out?.data).toMatchObject({ asked: false, answer: "Independent grocers in Maine" });
    const out2 = await tool.run({ question: "What's your budget?", why: "To size pitches", options: [{ label: "Small" }, { label: "Large" }] }, { ...(ctx as object), known: async () => undefined } as never);
    expect(asked).toHaveLength(1);
    expect(out2?.data).toMatchObject({ asked: true });
  });
});
