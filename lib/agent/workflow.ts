import { SPECIALIST_IDS, isSpecialist, nameOf, specialist, type SpecialistId } from "./specialists";
import { teamFor } from "./goals";
import { inputsFor } from "@/lib/team/inputs";
import type { Goal, Workflow, WorkflowStep } from "@/lib/team/types";

// Athena's workflow (PRD §23.2 step 8.5e): the steps that deliver the founder's goals, who does each, and after what.
// The model plans it; code checks the plan against the registry, so a step never starts before what it needs, every
// goal is covered and her synthesis comes last. With no model, or nothing usable, code builds its own from the same
// registry. Client-safe: the dashboard's diagram reads the same steps.

type StepId = SpecialistId | "athena";
export type Have = {
  /** The Analyst has measured and ranked the crowds already. */
  fits: boolean;
  /** The brand has a home city, which will do for the Promoter in place of the Navigator's. */
  home: boolean;
};

const order = (id: StepId) => (id === "athena" ? SPECIALIST_IDS.length : SPECIALIST_IDS.indexOf(id));
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/**
 * What a subagent must have done before it, from the registry's needs: the Analyst for crowds, the Navigator for a city.
 * A home city stands in for the Navigator's only when the Navigator isn't in the plan: when it is, its cities win.
 */
function deps(id: SpecialistId, have: Have, crew: StepId[] = []): SpecialistId[] {
  return specialist(id)
    .needs.filter((n) => !(n.key === "city" && n.home && have.home && !crew.includes("navigator")))
    .map((n) => n.from)
    .filter(isSpecialist)
    .filter((d) => d !== id);
}

/** The subagents the goals need, with everything they depend on, in the order the work flows. */
function crew(goals: Goal[], have: Have, extra: SpecialistId[] = []): SpecialistId[] {
  const want = new Set<SpecialistId>(["analyst", ...teamFor(goals), ...extra]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...want]) for (const d of deps(id, have)) if (!want.has(d)) (want.add(d), (grew = true));
  }
  return SPECIALIST_IDS.filter((id) => want.has(id));
}

const defaultTask = (id: SpecialistId, goals: Goal[]) => {
  const g = goals.find((x) => x.team.includes(id));
  return g ? `${specialist(id).role} for "${g.label}"` : specialist(id).role;
};
const defaultWhy = (id: SpecialistId, goals: Goal[]) => {
  if (id === "analyst") return "Every other step works from the crowds the Analyst measures.";
  const g = goals.find((x) => x.team.includes(id));
  return g ? `Part of "${g.label}".` : `The ${nameOf(id)} gives a later step what it needs.`;
};

const synthesis = (ids: SpecialistId[]): WorkflowStep => ({
  id: "athena",
  task: "Put every result together into one growth plan",
  needs: ids,
  why: "Reads what each subagent found and writes the plan per crowd, with no new research.",
  inputs: [],
  state: "todo",
});

/** The run order's lanes (§23.5 i): the steps in an earlier lane, which go first. */
const lanesBefore = (id: SpecialistId, ids: StepId[]) => ids.filter((x): x is SpecialistId => isSpecialist(x) && specialist(x).lane < specialist(id).lane);

function step(id: SpecialistId, have: Have, earlier: SpecialistId[], over: { task?: string; why?: string; needs?: StepId[] } = {}, crew: StepId[] = earlier): WorkflowStep {
  const needs = new Set<SpecialistId>(deps(id, have, crew));
  for (const n of over.needs ?? []) if (isSpecialist(n) && earlier.includes(n)) needs.add(n);
  const after = lanesBefore(id, earlier).filter((e) => !needs.has(e));
  return {
    id,
    task: over.task || "",
    needs: earlier.filter((e) => needs.has(e)),
    ...(after.length ? { after } : {}),
    why: over.why || "",
    inputs: inputsFor(id),
    state: id === "analyst" && have.fits ? "done" : "todo",
  };
}

/** Code's own workflow for the goals: the registry's needs decide the order. */
export function fallbackWorkflow(goals: Goal[], have: Have): Workflow {
  const ids = crew(goals, have);
  const steps: WorkflowStep[] = [];
  ids.forEach((id, i) => steps.push(step(id, have, ids.slice(0, i), { task: defaultTask(id, goals), why: defaultWhy(id, goals) }, ids)));
  return { goals: goals.map((g) => g.id), steps: [...steps, synthesis(ids)], by: "rules" };
}

/**
 * The model's plan, checked: only known subagents, once each; the Analyst first; every goal's subagents and what they
 * depend on included; each step needs only earlier ones, and the registry's needs always; Athena's synthesis last.
 * The model's words for the task and the why are kept. Undefined when nothing in it is usable.
 */
export function checkWorkflow(raw: unknown, goals: Goal[], have: Have): Workflow | undefined {
  const list = Array.isArray((raw as { steps?: unknown })?.steps) ? ((raw as { steps: unknown[] }).steps as unknown[]) : [];
  const told = new Map<SpecialistId, { task: string; why: string; needs: StepId[]; at: number }>();
  list.forEach((s, at) => {
    const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    if (!isSpecialist(r.id) || told.has(r.id)) return;
    const needs = (Array.isArray(r.needs) ? r.needs : []).filter((n): n is StepId => isSpecialist(n));
    told.set(r.id, { task: str(r.task, 160), why: str(r.why, 240), needs, at });
  });
  if (!told.size) return undefined;
  const extra = [...told.keys()];
  const ids = crew(goals, have, extra);
  // The model's order where it's valid, the registry's where it isn't: a subagent never goes before what it needs, nor
  // before an earlier lane of the run order.
  const placed: SpecialistId[] = [];
  const rank = (id: SpecialistId) => (id === "analyst" ? -1 : (told.get(id)?.at ?? 100 + order(id)));
  const pending = [...ids].sort((a, b) => rank(a) - rank(b));
  const may = (id: SpecialistId) => [...deps(id, have, ids), ...lanesBefore(id, ids)].every((d) => placed.includes(d));
  while (pending.length) {
    const i = pending.findIndex((id) => may(id) && (told.get(id)?.needs ?? []).every((n) => n === "athena" || placed.includes(n) || !ids.includes(n)));
    const at = i >= 0 ? i : pending.findIndex(may);
    placed.push(...pending.splice(at >= 0 ? at : 0, 1));
  }
  const steps = placed.map((id, i) => {
    const t = told.get(id);
    return step(id, have, placed.slice(0, i), { task: t?.task || defaultTask(id, goals), why: t?.why || defaultWhy(id, goals), needs: t?.needs }, placed);
  });
  return { goals: goals.map((g) => g.id), steps: [...steps, synthesis(placed)], by: "agent" };
}

/** The steps that can start now: not started, everything they need done, and every earlier lane still in the plan done. */
export function readySteps(w: Workflow): WorkflowStep[] {
  const done = new Set(w.steps.filter((s) => s.state === "done").map((s) => s.id));
  const inPlan = new Set(w.steps.map((s) => s.id));
  return w.steps.filter((s) => s.state === "todo" && s.needs.every((n) => done.has(n)) && (s.after ?? []).every((n) => done.has(n) || !inPlan.has(n)));
}

/** The workflow with these steps, and every step that depends on them, back to do again (an edited answer, a graph edit). */
export function resetFrom(w: Workflow, ids: StepId[]): Workflow {
  const again = new Set<StepId>(ids);
  for (const s of w.steps) if (s.needs.some((n) => again.has(n))) again.add(s.id);
  return { ...w, steps: w.steps.map((s) => (again.has(s.id) ? { ...s, state: "todo" } : s)) };
}

export const setStep = (w: Workflow, id: StepId, state: WorkflowStep["state"]): Workflow => ({ ...w, steps: w.steps.map((s) => (s.id === id ? { ...s, state } : s)) });

/** The workflow without a subagent (the founder said "skip events"): its dependents lose it, and those that can't do without it go too. */
export function dropStep(w: Workflow, id: SpecialistId, have: Have): Workflow {
  if (id === "analyst") return w;
  const gone = new Set<StepId>([id]);
  for (const s of w.steps) if (s.id !== "athena" && deps(s.id, have).some((d) => gone.has(d))) gone.add(s.id);
  const steps = w.steps.filter((s) => !gone.has(s.id)).map((s) => ({ ...s, needs: s.needs.filter((n) => !gone.has(n)), ...(s.after ? { after: s.after.filter((n) => !gone.has(n)) } : {}) }));
  return { ...w, steps };
}

/** The workflow with a subagent added (from its tile, or "add Austin"), placed after what it needs, before the synthesis. */
export function addStep(w: Workflow, id: SpecialistId, goals: Goal[], have: Have): Workflow {
  if (w.steps.some((s) => s.id === id)) return w;
  const ids = [...new Set([...w.steps.map((s) => s.id).filter(isSpecialist), ...crew([], have, [id])])].sort((a, b) => order(a) - order(b));
  const steps = ids.map((sid, i) => w.steps.find((s) => s.id === sid) ?? step(sid, have, ids.slice(0, i), { task: defaultTask(sid, goals), why: defaultWhy(sid, goals) }, ids));
  const last = w.steps.find((s) => s.id === "athena");
  return { ...w, steps: [...steps, { ...synthesis(ids), state: last?.state === "done" ? "todo" : (last?.state ?? "todo") }] };
}

/** Shape-check a workflow the client sends back. */
export function readWorkflow(raw: unknown): Workflow | undefined {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const steps = (Array.isArray(r.steps) ? r.steps : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .filter((s) => s.id === "athena" || isSpecialist(s.id))
    .slice(0, 8)
    .map(
      (s): WorkflowStep => ({
        id: s.id as StepId,
        task: str(s.task, 160),
        needs: (Array.isArray(s.needs) ? s.needs : []).filter((n): n is StepId => n === "athena" || isSpecialist(n)),
        ...(Array.isArray(s.after) ? { after: s.after.filter((n): n is StepId => isSpecialist(n)) } : {}),
        why: str(s.why, 240),
        inputs: (Array.isArray(s.inputs) ? s.inputs : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 4),
        state: s.state === "running" || s.state === "paused" || s.state === "done" ? s.state : "todo",
      }),
    );
  if (!steps.length) return undefined;
  return { goals: (Array.isArray(r.goals) ? r.goals : []).map((g) => str(g, 60)).filter(Boolean).slice(0, 5), steps, by: r.by === "agent" ? "agent" : "rules" };
}
