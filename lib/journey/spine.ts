import { nameOf, type AgentId, type SpecialistId } from "@/lib/agent/specialists";

// The journey's one spine (PRD §23.9 e): six stages from the brand to Execute Plan, each done, now or to come. The
// current stage says what's happening or what's needed from the founder, and where one click takes them. Pure, so
// the dashboard, the top bar and the tests read the same stage from the same journey state.

export type StageId = "brand" | "crowds" | "goals" | "work" | "plan" | "execute";
/** Where a stage's click goes: the Brand Graph, the chat at the open question, Athena, Execute Plan or a subagent. */
export type SpineGo = "knowledge" | "chat" | "athena" | "executive" | SpecialistId;
export type Stage = { id: StageId; label: string; state: "done" | "now" | "todo"; line?: string; /** It needs the founder. */ you?: boolean; go?: SpineGo };

export type SpineIn = {
  /** The Analyst has measured and ranked the crowds. */
  crowds: boolean;
  /** Goals are chosen (beyond knowing the crowd) or a workflow is under way. */
  goals: boolean;
  /** The goals question waits on the founder. */
  goalsOpen: boolean;
  workflow?: { steps: { id: string; state: string }[] };
  /** The agent working now and the step it's on. */
  working?: { id: AgentId; step: string };
  /** A question that pauses a run, and who asks it. */
  waiting?: { id: AgentId; question: string };
  plan: boolean;
  exec: { started: boolean; running: boolean };
};

const LABELS: Record<StageId, string> = {
  brand: "Your brand",
  crowds: "Who loves you",
  goals: "Your goals",
  work: "The team's work",
  plan: "Your plan",
  execute: "Execute",
};
/** A done stage opens what it made: the Brand Graph, the ranked crowds, the plan. */
const DONE_GO: Partial<Record<StageId, { go: SpineGo }>> = { brand: { go: "knowledge" }, crowds: { go: "analyst" }, plan: { go: "executive" } };
const ORDER: StageId[] =["brand", "crowds", "goals", "work", "plan", "execute"];

const who = (id: AgentId) => (id === "athena" ? "Athena" : `The ${nameOf(id)}`);
/** "Finding the cities…" reads as "The Navigator is finding the cities…"; any other step keeps its own words. */
const doing = (id: AgentId, step: string) => (/^\w+ing\b/.test(step) ? `${who(id)} is ${step.charAt(0).toLowerCase()}${step.slice(1)}` : `${who(id)}: ${step}`);

/** Which stage the journey is at, from its state: the first one not yet done. */
export function stageAt(s: SpineIn): StageId {
  const work = s.workflow?.steps.filter((x) => x.id !== "athena") ?? [];
  const workDone = !!s.workflow && work.every((x) => x.state === "done");
  if (s.plan) return "execute";
  if (s.goals && workDone) return "plan";
  if (s.goals) return "work";
  if (s.crowds) return "goals";
  return "crowds";
}

/** The six stages, the current one with what's happening or what's needed, and where its click goes. */
export function spineOf(s: SpineIn): Stage[] {
  const at = stageAt(s);
  const i = ORDER.indexOf(at);
  const now = ((): Omit<Stage, "id" | "label" | "state"> => {
    // A paused run comes first, whichever stage it's in: the founder's answer is what moves it.
    if (s.waiting && !(at === "goals" && s.goalsOpen)) return { line: `${who(s.waiting.id)} needs your answer`, you: true, go: "chat" };
    const w = s.working;
    switch (at) {
      case "crowds":
        return { line: w?.id === "analyst" ? doing(w.id, w.step) : "The Analyst is ranking your crowds", go: "analyst" };
      case "goals":
        return s.goalsOpen ? { line: "Pick what to work on", you: true, go: "chat" } : { line: "Athena is suggesting what to work on", go: "athena" };
      case "work":
        if (w && w.id !== "athena") return { line: doing(w.id, w.step), go: w.id };
        return { line: s.workflow ? "Athena is handing out the next step" : "Athena is planning the work for your goals", go: "athena" };
      case "plan":
        return { line: "Athena is putting the team's work in order", go: "athena" };
    }
    // Execute.
    if (s.exec.running) return { line: "The Executive is finding how to reach everyone in your plan", go: "executive" };
    return s.exec.started ? { line: "Your plan is under way", go: "executive" } : { line: "Start the Executive", you: true, go: "executive" };
  })();
  return ORDER.map((id, k) => ({
    id,
    label: LABELS[id],
    state: k < i ? "done" : k === i ? "now" : "todo",
    ...(k === i ? now : k < i ? DONE_GO[id] : {}),
  }));
}

/** The dashboard's Start card (§23.9 e): only when nothing has started, never while work runs or a question waits. */
export function showStart(s: SpineIn & { running: boolean }): boolean {
  return !s.goals && !s.workflow && !s.running && !s.goalsOpen && !s.waiting;
}
