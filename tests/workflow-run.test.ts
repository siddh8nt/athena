import { describe, expect, it } from "vitest";
import { QlooClient, MemoryCache } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { planWorkflow, runWorkflow } from "@/lib/agent/team";
import { buildCtx } from "@/lib/agent/team-ctx";
import { GOALS } from "@/lib/agent/goals";
import { checkInterpret, codeInterpret, interpret } from "@/lib/agent/interpret";
import { emptyBrief } from "@/lib/brief/types";
import { emptyTeam, planSig, type TeamEvent, type Work, type Workflow } from "@/lib/team/types";

// Step 8.5's workflow, end to end on fixtures with code's decider (no model): the run order, the inputs asked just
// before the step that needs them, the resume after an answer, and the plan as the last step. Every name is fictional.

const said = (value: string) => ({ value, source: { kind: "message" as const } });
const goals = (...ids: string[]) => GOALS.filter((g) => ids.includes(g.id)).map((g) => ({ ...g }));

async function setup() {
  const qloo = new QlooClient({ transport: new FixtureTransport(), cache: new MemoryCache() });
  const brief = { ...emptyBrief(), name: said("Tidewell Tins"), sells: said("tinned fish") };
  const seed = { comparables: [], lookalikes: ["Lookalike One", "Lookalike Two"], traits: ["tinned fish"] };
  const state = emptyTeam();
  const t = await buildCtx({ brief, seed, probes: [], team: state, enrich: {}, llm: false, qloo });
  return { qloo, state, t };
}

describe("the workflow run (§23.2 step 8.5f)", () => {
  it("runs in order, pauses a step for its inputs while the rest go on, resumes on the answer, and ends with the plan", async () => {
    const { qloo, state, t } = await setup();
    const g = goals("partners", "step_up");
    const workflow = await planWorkflow(g, t, false);
    expect(workflow.steps.map((s) => s.id)).toEqual(["analyst", "scout", "navigator", "rep", "matchmaker", "athena"]);

    const events: TeamEvent[] = [];
    const first = await runWorkflow({ goals: g, team: t, state, graphRev: 0, qloo, env: {} as never, send: (e) => events.push(e), llm: false, workflow, answered: [] });
    // The Navigator's regions are asked before it starts; the Scout goes on beside it, and lane 3 waits for both (§23.5 i).
    const asks = events.flatMap((e) => (e.type === "ask" ? [`${e.agent}:${e.ask.id}`] : []));
    expect(asks).toContain("navigator:input_regions");
    // The line before them names the questions it leads into, so the client says it only for those it still shows.
    expect(events.find((e) => e.type === "reply" && e.asks?.agent === "navigator")).toMatchObject({ text: "The Navigator is next. First, one thing only you know.", asks: { ids: ["input_regions"] } });
    const started = events.flatMap((e) => (e.type === "status" && e.status.state === "working" && e.status.step === "Starting" ? [e.agent] : []));
    expect(started.slice(0, 1)).toEqual(["analyst"]);
    expect(started).toContain("scout");
    expect(started).not.toContain("matchmaker");
    expect(started).not.toContain("navigator");
    expect(started).not.toContain("rep");
    const state1 = Object.fromEntries(first.workflow.steps.map((s) => [s.id, s.state]));
    expect(state1).toMatchObject({ analyst: "done", scout: "done", matchmaker: "todo", navigator: "paused", rep: "todo", athena: "todo" });
    // Each handoff is narrated, with the subagent's trail under it.
    expect(events.some((e) => e.type === "reply" && e.run === "scout" && /^Handing to the Scout/.test(e.text))).toBe(true);
    // The workflow streams whole after every change.
    expect(events.filter((e) => e.type === "workflow").length).toBeGreaterThan(4);

    // The founder answers; the same workflow resumes: done steps are not run again, and the plan comes last.
    const works: Partial<Record<string, Work>> = { ...first.works };
    const again: TeamEvent[] = [];
    const answered = [{ question: "Which regions can you reach: ship to, visit, sell in?" }, { question: "What can you spend on growth in the next three months?" }, { question: "Which shops already stock you? Name them, or add a stockist sheet." }];
    const second = await runWorkflow({ goals: g, team: t, state: { ...state, works: works as never }, graphRev: 0, qloo, env: {} as never, send: (e) => again.push(e), llm: false, workflow: first.workflow, answered });
    const ran = again.flatMap((e) => (e.type === "status" && e.status.state === "working" && e.status.step === "Starting" ? [e.agent] : []));
    expect(ran[0]).toBe("navigator");
    expect([...ran].sort()).toEqual(["matchmaker", "navigator", "rep"]);
    expect(again.filter((e) => e.type === "ask")).toEqual([]);
    expect(second.workflow.steps.every((s) => s.state === "done")).toBe(true);
    const plan = again.find((e) => e.type === "plan");
    expect(plan && plan.type === "plan" && Array.isArray(plan.plan.steps)).toBe(true);
    // The plan is the very last step: nothing runs after it.
    const at = again.findIndex((e) => e.type === "plan");
    expect(again.slice(at).some((e) => e.type === "status" && e.status.state === "working")).toBe(false);
    // Athena's line comes before the plan, so the Start / Later card the plan brings follows it in the chat (§23.5 r).
    const line = again.findIndex((e) => e.type === "reply" && e.text.startsWith("The team's work is in order"));
    expect(line).toBeGreaterThanOrEqual(0);
    expect(line).toBeLessThan(at);

    // A mark re-writes the plan only (§23.2 step 8.6m): the marked subagent is stale, but nothing re-runs.
    const shop = second.works.rep?.results[0];
    const marked = { ...state, works: second.works as never, outcomes: [{ item: shop?.id ?? "x", agent: "rep" as const, kind: "shop", name: shop?.name ?? "x", mark: "no" as never, at: Date.now() + 1 }] };
    const third: TeamEvent[] = [];
    const resynth = await runWorkflow({ goals: g, team: t, state: marked, graphRev: 0, qloo, env: {} as never, send: (e) => third.push(e), llm: false, workflow: second.workflow, answered, resynth: true });
    expect(third.filter((e) => e.type === "status" && e.status.state === "working" && e.status.step === "Starting")).toEqual([]);
    expect(third.some((e) => e.type === "plan")).toBe(true);
    expect(third.some((e) => e.type === "reply" && e.text === "I updated the plan from your marks.")).toBe(true);
    expect(resynth.workflow.steps.every((s) => s.state === "done")).toBe(true);
    // A mark that leaves the plan as it was says nothing.
    const written = third.find((e) => e.type === "plan");
    const same: TeamEvent[] = [];
    await runWorkflow({ goals: g, team: t, state: marked, graphRev: 0, qloo, env: {} as never, send: (e) => same.push(e), llm: false, workflow: resynth.workflow, answered, resynth: true, planSig: planSig(written?.type === "plan" ? written.plan : undefined) });
    expect(same.some((e) => e.type === "plan")).toBe(true);
    expect(same.filter((e) => e.type === "reply")).toEqual([]);

    // Crowds lost on a resume: the Analyst measures again alone; the finished subagents are not started over.
    const lost: TeamEvent[] = [];
    const paused = { ...second.workflow, steps: second.workflow.steps.map((s) => (s.id === "rep" ? { ...s, state: "paused" as const } : s)) };
    await runWorkflow({ goals: g, team: { ...t, crowds: undefined }, state: { ...state, works: second.works as never }, graphRev: 0, qloo, env: {} as never, send: (e) => lost.push(e), llm: false, workflow: paused, answered });
    const rerun = lost.flatMap((e) => (e.type === "status" && e.status.state === "working" && e.status.step === "Starting" ? [e.agent] : []));
    expect([...new Set(rerun)].sort()).toEqual(["analyst", "rep"]);
  }, 60_000);
});

describe("no subagent works from crowds that aren't there", () => {
  // The model ends the Analyst's run without measuring, handing back to itself (seen live, 25 Oct).
  const quits = (async () => {
    const call = { name: "finish_work", args: { headline: "We need the crowds first", results: [], claims: [], handoff: "the crowds, from the Analyst" } };
    return { parts: [{ functionCall: call }], calls: [call], text: "", model: "test", ms: 0 };
  }) as never;

  it("code measures when the Analyst's model finishes without crowds, so the Scout gets them", async () => {
    const { qloo, state, t } = await setup();
    const g = goals("partners");
    const workflow = await planWorkflow(g, t, false);
    const events: TeamEvent[] = [];
    const out = await runWorkflow({ goals: g, team: t, state, graphRev: 0, qloo, env: {} as never, send: (e) => events.push(e), llm: false, model: (id) => (id === "analyst" ? quits : undefined), workflow, answered: [] });
    expect(t.crowds?.crowds.length).toBeGreaterThan(0);
    expect(out.workflow.steps.find((s) => s.id === "analyst")?.state).toBe("done");
    expect(out.works.scout?.results.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "step" && e.event.summary === "needs the crowds first")).toBe(false);
  }, 60_000);

  it("a subagent that handed back with nothing runs again once what it needs has delivered", async () => {
    const { qloo, state, t } = await setup();
    const g = goals("partners");
    const first = await runWorkflow({ goals: g, team: t, state, graphRev: 0, qloo, env: {} as never, send: () => {}, llm: false, workflow: await planWorkflow(g, t, false), answered: [] });
    // As a journey saved before the fix holds it: the Scout ran on no crowds and handed back, the Analyst measured later.
    const works = { ...first.works, scout: { ...first.works.scout!, results: [], handoff: { need: "the ranked crowds, from the Analyst" }, at: 1 } };
    const done = { ...first.workflow, steps: first.workflow.steps.map((s) => ({ ...s, state: "done" as const })) };
    const again: TeamEvent[] = [];
    await runWorkflow({ goals: g, team: t, state: { ...state, works: works as never }, graphRev: 0, qloo, env: {} as never, send: (e) => again.push(e), llm: false, workflow: done, answered: [] });
    const ran = again.flatMap((e) => (e.type === "status" && e.status.state === "working" && e.status.step === "Starting" ? [e.agent] : []));
    expect(ran).toContain("scout");
    expect(ran).not.toContain("analyst");
  }, 60_000);
});

describe("a subagent's own lookups stay in its trail", () => {
  it("a placement the founder didn't ask for isn't said in the chat, and a raw id never is", async () => {
    const { qloo, state, t } = await setup();
    const g = goals("partners");
    // The Analyst's model places an entity by id before handing over to code, unasked by the founder (seen live, 25 Oct).
    let turn = 0;
    const looks = (async () => {
      const call = turn++ === 0 ? { name: "place_entity", args: { entity_id: "DAEC51CD-0000-4000-8000-000000000000" } } : { name: "finish_work", args: { headline: "", results: [], claims: [] } };
      return { parts: [{ functionCall: call }], calls: [call], text: "", model: "test", ms: 0 };
    }) as never;
    const events: TeamEvent[] = [];
    await runWorkflow({ goals: g, team: t, state, graphRev: 0, qloo, env: {} as never, send: (e) => events.push(e), llm: false, model: (id) => (id === "analyst" ? looks : undefined), workflow: await planWorkflow(g, t, false), answered: [] });
    expect(events.some((e) => e.type === "step" && e.event.tool === "place_entity")).toBe(true);
    expect(events.filter((e) => e.type === "reply" && /DAEC51CD|measured map/.test(e.text))).toEqual([]);
  }, 60_000);
});

describe("Athena's handoff lines", () => {
  it("end in one full stop when the model's task already has one (seen live, 27 Oct)", async () => {
    const { qloo, state, t } = await setup();
    const g = goals("partners");
    const planned = await planWorkflow(g, t, false);
    const workflow = { ...planned, steps: planned.steps.map((s) => ({ ...s, task: `${s.task.replace(/\.$/, "")}.` })) };
    const events: TeamEvent[] = [];
    await runWorkflow({ goals: g, team: t, state, graphRev: 0, qloo, env: {} as never, send: (e) => events.push(e), llm: false, workflow, answered: [] });
    const handoffs = events.flatMap((e) => (e.type === "reply" && e.run ? [e.text] : []));
    expect(handoffs.length).toBeGreaterThan(0);
    for (const h of handoffs) expect(h).toMatch(/[^.]\.$/);
  }, 60_000);
});

describe("a typed answer (§23.2 step 8.5h)", () => {
  const question = { question: "What can you spend on growth in the next three months?", options: [{ label: "Under $1,000" }, { label: "$1,000 to $10,000" }] };
  const workflow: Workflow = { goals: ["launch_city"], by: "rules", steps: ["analyst", "navigator", "rep", "promoter", "athena"].map((id) => ({ id: id as never, task: "", needs: [], why: "", inputs: [], state: "todo" })) };

  it("without the model: an option's own label picks it; anything else is kept as the founder's words", async () => {
    expect(codeInterpret({ text: "under $1,000", question })).toEqual({ option: "Under $1,000" });
    expect(await interpret({ text: "about 800 dollars", question }, false)).toEqual({ fact: "about 800 dollars" });
  });

  it("holds the model to what's real: offered options, known subagents in the plan, a city that resolves", () => {
    expect(checkInterpret({ option: "under $1,000" }, { text: "x", question })).toEqual({ option: "Under $1,000" });
    expect(checkInterpret({ option: "A yacht" }, { text: "a yacht", question })).toEqual({ fact: "a yacht" });
    const out = checkInterpret({ fact: "We skip events", change: { skip: ["promoter", "analyst", "wizard"] } }, { text: "skip events", question, workflow });
    expect(out.change).toEqual({ skip: ["promoter"] });
    expect(out.line).toBe("I've taken the Promoter off the plan.");
    const city = checkInterpret({ fact: "Add Austin", change: { city: "Austin" } }, { text: "add Austin", question, workflow });
    expect(city.change?.city?.name).toMatch(/Austin/);
  });

  it("uses the model's reading when there is one, and code's when the model fails", async () => {
    const gen = (async () => ({ text: JSON.stringify({ option: "$1,000 to $10,000" }) })) as never;
    expect(await interpret({ text: "a few grand", question }, true, gen)).toEqual({ option: "$1,000 to $10,000" });
    const broken = (async () => { throw new Error("down"); }) as never;
    expect(await interpret({ text: "a few grand", question }, true, broken)).toEqual({ fact: "a few grand" });
  });
});
