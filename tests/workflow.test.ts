import { describe, expect, it } from "vitest";
import { GOALS } from "@/lib/agent/goals";
import { addStep, checkWorkflow, dropStep, fallbackWorkflow, readWorkflow, readySteps, resetFrom, setStep } from "@/lib/agent/workflow";
import { missingInputs } from "@/lib/team/inputs";
import { readTeam } from "@/lib/team/read";
import type { Goal } from "@/lib/team/types";

const goal = (id: string): Goal => ({ ...GOALS.find((g) => g.id === id)!, recommended: false });
const ids = (w: { steps: { id: string }[] }) => w.steps.map((s) => s.id);
const noFits = { fits: false, home: false };

describe("workflow", () => {
  it("falls back to the registry's order: the Analyst first, the Navigator before the Rep, Athena's synthesis last", () => {
    const w = fallbackWorkflow([goal("step_up")], noFits);
    expect(ids(w)).toEqual(["analyst", "navigator", "rep", "athena"]);
    expect(w.steps.find((s) => s.id === "rep")!.needs).toEqual(["analyst", "navigator"]);
    expect(w.steps.at(-1)!.needs).toEqual(["analyst", "navigator", "rep"]);
    expect(w.by).toBe("rules");
  });

  it("lets a home city stand in for the Navigator before the Promoter, and marks the Analyst done when the fits exist", () => {
    const w = fallbackWorkflow([goal("online")], { fits: true, home: true });
    expect(ids(w)).toEqual(["analyst", "scout", "promoter", "athena"]);
    expect(w.steps[0].state).toBe("done");
    expect(w.steps.find((s) => s.id === "promoter")!.needs).toEqual(["analyst"]);
  });

  it("asks each step's inputs just before it: regions for the Navigator, stockists and budget for the Rep, launch and budget for the Promoter", () => {
    const w = fallbackWorkflow([goal("launch_city")], noFits);
    const inputs = Object.fromEntries(w.steps.map((s) => [s.id, s.inputs]));
    expect(inputs.navigator).toEqual(["input_regions"]);
    expect(inputs.rep).toEqual(["input_stockists", "input_budget"]);
    expect(inputs.promoter).toEqual(["input_budget", "input_launch"]);
    expect(inputs.analyst).toEqual([]);
  });

  it("checks the model's plan: unknown and repeated ids dropped, missing goal subagents and needs added, nothing before what it needs", () => {
    const raw = {
      steps: [
        { id: "rep", task: "Find shops that match", why: "The goal is shops.", needs: ["promoter"] },
        { id: "wizard", task: "Magic" },
        { id: "rep", task: "Again" },
        { id: "analyst", task: "Measure the crowds" },
      ],
    };
    const w = checkWorkflow(raw, [goal("step_up")], noFits)!;
    expect(ids(w)).toEqual(["analyst", "navigator", "rep", "athena"]);
    const rep = w.steps.find((s) => s.id === "rep")!;
    expect(rep.task).toBe("Find shops that match");
    expect(rep.needs).toEqual(["analyst", "navigator"]);
    expect(w.by).toBe("agent");
  });

  it("keeps the model's order where it is valid", () => {
    const raw = { steps: [{ id: "analyst" }, { id: "matchmaker" }, { id: "scout" }] };
    const w = checkWorkflow(raw, [goal("partners")], noFits)!;
    expect(ids(w)).toEqual(["analyst", "matchmaker", "scout", "athena"]);
  });

  it("returns nothing for a plan with no known step, so the fallback runs", () => {
    expect(checkWorkflow({ steps: [{ id: "x" }] }, [goal("online")], noFits)).toBeUndefined();
    expect(checkWorkflow("nonsense", [goal("online")], noFits)).toBeUndefined();
  });

  it("runs steps in order: only those whose needs are done are ready, several at once when independent", () => {
    let w = fallbackWorkflow([goal("partners"), goal("step_up")], noFits);
    expect(readySteps(w).map((s) => s.id)).toEqual(["analyst"]);
    w = setStep(w, "analyst", "done");
    expect(readySteps(w).map((s) => s.id)).toEqual(["scout", "navigator", "matchmaker"]);
    w = setStep(setStep(setStep(w, "scout", "done"), "navigator", "done"), "matchmaker", "running");
    expect(readySteps(w).map((s) => s.id)).toEqual(["rep"]);
    w = setStep(setStep(w, "matchmaker", "done"), "rep", "done");
    expect(readySteps(w).map((s) => s.id)).toEqual(["athena"]);
  });

  it("re-runs only what an edit affects: the step and what depends on it", () => {
    let w = fallbackWorkflow([goal("launch_city")], noFits);
    for (const s of w.steps) w = setStep(w, s.id, "done");
    const again = resetFrom(w, ["navigator"]);
    expect(again.steps.filter((s) => s.state === "todo").map((s) => s.id)).toEqual(["navigator", "rep", "promoter", "athena"]);
    expect(again.steps[0].state).toBe("done");
  });

  it("drops a skipped subagent and what can't run without it; adds one after what it needs", () => {
    const w = fallbackWorkflow([goal("launch_city")], noFits);
    expect(ids(dropStep(w, "navigator", noFits))).toEqual(["analyst", "athena"]);
    expect(ids(dropStep(w, "promoter", noFits))).toEqual(["analyst", "navigator", "rep", "athena"]);
    expect(ids(dropStep(w, "analyst", noFits))).toEqual(ids(w));
    const more = addStep(fallbackWorkflow([goal("online")], noFits), "rep", [goal("online")], noFits);
    expect(ids(more)).toEqual(["analyst", "scout", "navigator", "rep", "promoter", "athena"]);
  });

  it("asks only the inputs not already known", () => {
    expect(missingInputs(["input_stockists", "input_budget"], [], { stockists: 3 }).map((q) => q.id)).toEqual(["input_budget"]);
    expect(missingInputs(["input_budget"], [{ question: "What can you spend on growth in the next three months?" }], { stockists: 0 })).toEqual([]);
  });

  it("reads a workflow and answers back from the journey, dropping anything malformed", () => {
    const w = fallbackWorkflow([goal("online")], noFits);
    expect(readWorkflow(JSON.parse(JSON.stringify(w)))).toEqual(w);
    const t = readTeam({ goals: [], works: {}, outcomes: [], workflow: { steps: [{ id: "nope" }] }, answered: [{ id: "a", agent: "rep", question: "Q?", answer: "Yes" }, { id: "b", agent: "x", question: "Q", answer: "A" }] });
    expect(t.workflow).toBeUndefined();
    expect(t.answered).toEqual([{ id: "a", agent: "rep", question: "Q?", answer: "Yes" }]);
  });
});
