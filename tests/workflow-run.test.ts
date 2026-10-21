import { describe, expect, it } from "vitest";
import { QlooClient, MemoryCache } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { planWorkflow, runWorkflow } from "@/lib/agent/team";
import { buildCtx } from "@/lib/agent/team-ctx";
import { GOALS } from "@/lib/agent/goals";
import { checkInterpret, codeInterpret, interpret } from "@/lib/agent/interpret";
import { buildPlan } from "@/lib/agent/synthesis";
import { emptyBrief } from "@/lib/brief/types";
import { emptyTeam, type TeamEvent, type Work, type Workflow } from "@/lib/team/types";

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
    // The Navigator's regions are asked before it starts; the Scout and Matchmaker don't wait on it.
    const asks = events.flatMap((e) => (e.type === "ask" ? [`${e.agent}:${e.ask.id}`] : []));
    expect(asks).toContain("navigator:input_regions");
    const started = events.flatMap((e) => (e.type === "status" && e.status.state === "working" && e.status.step === "Starting" ? [e.agent] : []));
    expect(started.slice(0, 1)).toEqual(["analyst"]);
    expect(started).toContain("scout");
    expect(started).toContain("matchmaker");
    expect(started).not.toContain("navigator");
    expect(started).not.toContain("rep");
    const state1 = Object.fromEntries(first.workflow.steps.map((s) => [s.id, s.state]));
    expect(state1).toMatchObject({ analyst: "done", scout: "done", matchmaker: "done", navigator: "paused", rep: "todo", athena: "todo" });
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
    expect(ran).toEqual(["navigator", "rep"]);
    expect(again.filter((e) => e.type === "ask")).toEqual([]);
    expect(second.workflow.steps.every((s) => s.state === "done")).toBe(true);
    const plan = again.find((e) => e.type === "plan");
    expect(plan && plan.type === "plan" && plan.plan.crowds[0].lines.length).toBeGreaterThan(0);
    // The plan is the very last step: nothing runs after it.
    const at = again.findIndex((e) => e.type === "plan");
    expect(again.slice(at).some((e) => e.type === "status" && e.status.state === "working")).toBe(false);
  }, 60_000);
});

describe("the plan (§23.2 step 8.5m)", () => {
  const work = (agent: Work["agent"], results: [string, string, string?][], extra: Partial<Work> = {}): Work => ({
    agent, goal: "g", headline: `${agent} headline`, results: results.map(([kind, name, detail]) => ({ id: `${kind}:${name}`, kind, name, why: "", ...(detail ? { detail } : {}), sources: [], callIds: [] })), claims: [], sources: [], ms: 0, qlooCalls: 0, at: 1, by: "rules", ...extra,
  });

  it("writes who, where, through what, the words and when for the crowd to win first, each cited to its subagent", () => {
    const p = buildPlan({
      works: {
        analyst: work("analyst", [["crowd", "Coastal cooks"]]),
        navigator: work("navigator", [["city", "Fernvale"], ["neighbourhood", "Old Dock"]]),
        rep: work("rep", [["venue", "Fig Larder"]]),
        scout: work("scout", [["message", "Small tins, big taste"]]),
        promoter: work("promoter", [["event", "Harbour Food Fair", "in May"]], { handoff: { need: "a launch date" } }),
      },
      fits: [{ crowd: "c1", name: "Coastal cooks", tier: "win_first" }],
      disagreements: ["Two sources disagree on the price"],
    });
    expect(p.crowds[0].crowd).toBe("Coastal cooks");
    expect(p.crowds[0].lines.map((l) => `${l.kind}:${l.agent}`)).toEqual(["who:analyst", "where:navigator", "through:rep", "words:scout", "when:promoter"]);
    expect(p.crowds[0].lines[1].text).toBe("Fernvale, starting in Old Dock.");
    expect(p.disagreements).toEqual(["Two sources disagree on the price"]);
    expect(p.open[0]).toMatch(/^The Promoter needs a launch date/);
  });

  it("gives the Scout's crowd to win next its own section", () => {
    const p = buildPlan({ works: { scout: work("scout", [["message", "Hello"]], { shared: { crowd: "Night owls" } }) }, fits: [{ crowd: "c1", name: "Coastal cooks", tier: "win_first" }, { crowd: "c2", name: "Night owls", tier: "win_next" }] });
    expect(p.crowds.map((c) => `${c.crowd} (${c.tier})`)).toEqual(["Coastal cooks (Win first)", "Night owls (Win next)"]);
    expect(p.crowds[1].lines.map((l) => l.agent)).toEqual(["scout"]);
  });
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
