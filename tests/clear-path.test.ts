import { describe, expect, it } from "vitest";
import { reviewGate } from "@/lib/journey/flow";
import { finishLines, nextLine } from "@/lib/journey/next";
import { showStart, spineOf, stageAt, type SpineIn } from "@/lib/journey/spine";

// Step 8.10, one clear path: onboarding's review gate, the journey's spine and the Next line.

describe("the review gate (§23.9 d)", () => {
  it("shows no continue button before the Brand Graph is revealed", () => {
    expect(reviewGate({ shown: false, running: true, open: 0 })).toEqual({ ready: false, waiting: "Waiting for your Brand Graph to be built" });
    expect(reviewGate({ shown: false, running: false, grouping: "Grouping", open: 0 })).toEqual({ ready: false, waiting: "Waiting for your themes to be grouped" });
  });
  it("waits on the founder's open answers first, by count", () => {
    expect(reviewGate({ shown: true, running: false, open: 1 })).toEqual({ ready: false, waiting: "Waiting on one answer from you" });
    expect(reviewGate({ shown: false, running: false, open: 3 })).toEqual({ ready: false, waiting: "Waiting on 3 answers from you" });
  });
  it("holds the button while a later run updates the revealed graph", () => {
    expect(reviewGate({ shown: true, running: true, open: 0 }).ready).toBe(false);
  });
  it("offers the one button once the graph is revealed and nothing is open", () => {
    expect(reviewGate({ shown: true, running: false, open: 0 })).toEqual({ ready: true });
  });
});

const base: SpineIn = { crowds: false, goals: false, goalsOpen: false, plan: false, exec: { started: false, running: false } };
const now = (s: SpineIn) => spineOf(s).find((x) => x.state === "now")!;

describe("the journey's spine (§23.9 e)", () => {
  it("starts on Who loves you, with the brand done, while the Analyst ranks the crowds", () => {
    const st = spineOf(base);
    expect(st.map((x) => x.label)).toEqual(["Your brand", "Who loves you", "Your goals", "The team's work", "Your plan", "Execute"]);
    expect(st.map((x) => x.state)).toEqual(["done", "now", "todo", "todo", "todo", "todo"]);
    expect(st[0].go).toBe("knowledge");
    expect(now(base)).toMatchObject({ line: "The Analyst is ranking your crowds", go: "analyst" });
    expect(now({ ...base, working: { id: "analyst", step: "Finding your brand in Qloo" } }).line).toBe("The Analyst is finding your brand in Qloo");
  });

  it("asks for the goals when that question waits, and opens the chat", () => {
    const s = { ...base, crowds: true, goalsOpen: true, waiting: { id: "athena" as const, question: "What should we work on?" } };
    expect(stageAt(s)).toBe("goals");
    expect(now(s)).toMatchObject({ line: "Pick what to work on", you: true, go: "chat" });
  });

  it("says who is working and what on, in plain words", () => {
    const s = { ...base, crowds: true, goals: true, workflow: { steps: [{ id: "navigator", state: "working" }] }, working: { id: "navigator" as const, step: "Finding the cities your crowds live in" } };
    expect(stageAt(s)).toBe("work");
    expect(now(s)).toMatchObject({ line: "The Navigator is finding the cities your crowds live in", go: "navigator" });
  });

  it("puts a paused run's question first, in any stage", () => {
    const s = { ...base, crowds: true, goals: true, workflow: { steps: [{ id: "rep", state: "working" }] }, waiting: { id: "rep" as const, question: "Which shops?" } };
    expect(now(s)).toMatchObject({ line: "The Rep needs your answer", you: true, go: "chat" });
  });

  it("moves to Your plan once every subagent's step is done", () => {
    const s = { ...base, crowds: true, goals: true, workflow: { steps: [{ id: "athena", state: "working" }, { id: "scout", state: "done" }] } };
    expect(stageAt(s)).toBe("plan");
  });

  it("asks the founder to start the Executive once the plan is written, and never before", () => {
    const s = { ...base, crowds: true, goals: true, plan: true };
    expect(now(s)).toMatchObject({ label: "Execute", line: "Start the Executive", you: true, go: "executive" });
    expect(now({ ...s, exec: { started: true, running: true } }).line).toBe("The Executive is finding how to reach everyone in your plan");
    expect(now({ ...s, exec: { started: true, running: false } }).you).toBeUndefined();
  });

  it("shows the Start card only when nothing has started", () => {
    expect(showStart({ ...base, crowds: true, running: false })).toBe(true);
    expect(showStart({ ...base, running: true })).toBe(false);
    expect(showStart({ ...base, crowds: true, goalsOpen: true, running: false })).toBe(false);
    expect(showStart({ ...base, crowds: true, waiting: { id: "analyst", question: "?" }, running: false })).toBe(false);
    expect(showStart({ ...base, crowds: true, goals: true, running: false })).toBe(false);
  });
});

describe("the Next line after a subagent finishes (§23.9 f)", () => {
  const ranked: SpineIn = { ...base, crowds: true };
  const flow = (states: Record<string, "todo" | "running" | "done">) => ({ steps: Object.entries(states).map(([id, state]) => ({ id, state })) });

  it("asks the founder to pick goals once the Analyst is done, and says why", () => {
    const n = nextLine({ ...ranked, goalsOpen: true }, "analyst");
    expect(n).toMatchObject({ you: true, go: "chat" });
    expect(n.line).toBe("Pick what to work on: this decides which subagents run");
  });

  it("says nothing is needed and points at the subagent now at work", () => {
    const n = nextLine({ ...ranked, goals: true, workflow: flow({ analyst: "done", navigator: "running" }), working: { id: "navigator", step: "Finding cities" } }, "analyst");
    expect(n).toEqual({ you: false, line: "Next: the Navigator finds where these crowds live", go: "navigator", act: "Watch the Navigator" });
  });

  it("names the next step still to come when nobody is working yet", () => {
    const n = nextLine({ ...ranked, goals: true, workflow: flow({ analyst: "done", scout: "done", rep: "todo" }) }, "scout");
    expect(n).toMatchObject({ you: false, go: "rep", line: "Next: the Rep finds the shops to pitch" });
  });

  it("a paused run needs the founder, whoever asked", () => {
    const n = nextLine({ ...ranked, goals: true, workflow: flow({ navigator: "done", rep: "todo" }), waiting: { id: "rep", question: "Which city?" } }, "navigator");
    expect(n).toMatchObject({ you: true, go: "chat", line: "The Rep needs one answer from you before the work goes on" });
  });

  it("once every step is done Athena writes the plan, then the Executive waits on the founder", () => {
    const done = { ...ranked, goals: true, workflow: flow({ analyst: "done", navigator: "done", athena: "todo" }) };
    expect(nextLine(done, "navigator")).toMatchObject({ you: false, go: "athena", line: "Next: Athena puts the team's work into your plan" });
    expect(nextLine({ ...done, plan: true }, "navigator")).toMatchObject({ you: true, go: "executive" });
    expect(nextLine({ ...done, plan: true, exec: { started: true, running: false } }, "navigator")).toMatchObject({ you: false, line: "Your plan is under way" });
  });

  it("before any goals, Athena suggests what to work on", () => {
    expect(nextLine(ranked, "analyst")).toMatchObject({ you: false, go: "athena" });
  });

  it("a finish card has at most three plain lines, no repeats", () => {
    const lines = finishLines({
      headline: "Win the Graza crowd first",
      claims: [{ text: "They share your love of good oil", sources: ["s1"] }, { text: "Win the Graza crowd first", sources: [] }, { text: "They shop small grocers", sources: [] }, { text: "A fourth", sources: [] }],
      results: [],
    });
    expect(lines).toEqual(["Win the Graza crowd first", "They share your love of good oil", "They shop small grocers"]);
    expect(finishLines({ headline: "Start in Austin", claims: [], results: [{ name: "Austin", why: "all three crowds are strong" }] })).toEqual(["Start in Austin", "Austin: all three crowds are strong"]);
    // Code's rules write their tools' summaries as claims, so the results' reasons lead.
    const rules = finishLines({ headline: "Start in Austin", claims: [{ text: "3 cities: Austin; Denver; Boise.", sources: [] }], results: [{ name: "Austin", why: "all three crowds are strong" }], by: "rules" });
    expect(rules[1]).toBe("Austin: all three crowds are strong");
  });
});
