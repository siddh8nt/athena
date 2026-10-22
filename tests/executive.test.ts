import { describe, expect, it } from "vitest";
import { needsOf, statusFromMark, tasksOf } from "@/lib/agent/executive";
import { EXECUTIVE, SPECIALIST_IDS, isSubagent, nameOf } from "@/lib/agent/specialists";
import type { GrowthPlan, Outcome, PlanStep } from "@/lib/team/types";

// The Executive skeleton (§23.5 n): Athena's plan as tracked tasks, marks back to the subagent that owns the result, and
// nothing sent. Every name is fictional.

const step = (n: number, s: Partial<PlanStep>): PlanStep => ({ n, what: `Step ${n}`, crowds: ["Crowd A"], phase: "win_first", lines: [], depends: [], ...s });
const plan: GrowthPlan = {
  headline: "3 steps",
  steps: [
    step(1, { what: "Open in Riverton", phase: "shared", lines: [{ kind: "where", agent: "navigator", text: "Riverton: Old Mill" }, { kind: "when", text: "Start now" }] }),
    step(2, {
      what: "Get on the shelves where Crowd A shop",
      depends: [1],
      items: [
        { id: "venue:corner-larder", kind: "venue", name: "Corner Larder", agent: "rep", group: "deli" },
        { id: "venue:salt-shelf", kind: "venue", name: "Salt Shelf", agent: "rep", group: "bottle shop" },
      ],
    }),
    step(3, { what: "Partner and show up", depends: [1, 2], items: [{ id: "c1", kind: "creator", name: "Pat Kettle", agent: "matchmaker" }, { id: "e1", kind: "event", name: "Harbour Fair", agent: "promoter" }] }),
  ],
  disagreements: [],
  open: [],
  from: {},
  at: 1,
};
const out = (item: string, agent: Outcome["agent"], mark: Outcome["mark"], at: number): Outcome => ({ item, agent, kind: "x", name: item, mark, at });

describe("the Executive (§23.5 n)", () => {
  it("is a subagent in the registry that never acts", () => {
    expect(EXECUTIVE.canAct).toBe(false);
    expect(isSubagent("executive")).toBe(true);
    expect(nameOf("executive")).toBe("Executive");
    // It runs no research, so it isn't one of the workflow's steps.
    expect((SPECIALIST_IDS as readonly string[]).includes("executive")).toBe(false);
  });

  it("maps each step to tasks: one per result it acts on, or one for the step, with who it's from, the action and what it needs", () => {
    const tasks = tasksOf(plan, []);
    expect(tasks.map((t) => [t.step, t.agent, t.action, t.needs, t.status])).toEqual([
      [1, "navigator", "Open in Riverton", "Ready now", "todo"],
      [2, "rep", "Pitch Corner Larder", "Once step 1 holds", "todo"],
      [2, "rep", "Pitch Salt Shelf", "Once step 1 holds", "todo"],
      [3, "matchmaker", "Ask Pat Kettle", "Once steps 1 and 2 hold", "todo"],
      [3, "promoter", "Show up at Harbour Fair", "Once steps 1 and 2 hold", "todo"],
    ]);
    expect(tasks[1].item).toEqual({ id: "venue:corner-larder", kind: "venue", name: "Corner Larder", group: "deli" });
    expect(tasksOf(undefined, [])).toEqual([]);
    expect(needsOf(step(9, { depends: [2, 3, 4] }))).toBe("Once steps 2–4 hold");
  });

  it("reads status from the marks: No is Skipped, Yes or Went Done, Pitched or No reply Doing", () => {
    expect(["no", "yes", "went", "pitched", "no_reply", undefined].map((m) => statusFromMark(m as never))).toEqual(["skipped", "done", "done", "doing", "doing", "todo"]);
    const tasks = tasksOf(plan, [out("venue:corner-larder", "rep", "pitched", 5), out("e1", "promoter", "went", 6)]);
    expect(tasks.find((t) => t.id === "venue:corner-larder")).toMatchObject({ status: "doing", mark: "pitched" });
    expect(tasks.find((t) => t.id === "e1")).toMatchObject({ status: "done", mark: "went" });
  });

  it("lets the founder's status win until a newer mark, and keeps a worked task that left the plan", () => {
    const set = { "venue:salt-shelf": { status: "doing" as const, at: 10 } };
    expect(tasksOf(plan, [out("venue:salt-shelf", "rep", "no", 5)], set).find((t) => t.id === "venue:salt-shelf")?.status).toBe("doing");
    expect(tasksOf(plan, [out("venue:salt-shelf", "rep", "yes", 20)], set).find((t) => t.id === "venue:salt-shelf")?.status).toBe("done");

    // Marked No, it drops out of Athena's plan; the board still shows it under Skipped.
    const kept = tasksOf(plan, [], {})[2];
    const without: GrowthPlan = { ...plan, steps: plan.steps!.map((s) => ({ ...s, items: s.items?.filter((i) => i.id !== "venue:salt-shelf") })) };
    const tasks = tasksOf(without, [out("venue:salt-shelf", "rep", "no", 30)], { "venue:salt-shelf": { at: 0, task: kept } });
    expect(tasks.find((t) => t.id === "venue:salt-shelf")).toMatchObject({ left: true, status: "skipped", agent: "rep" });
  });
});
