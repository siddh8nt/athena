import type { SpecialistId } from "./specialists";
import type { GrowthPlan, Mark, Outcome, PlanItem, PlanStep, Task, TaskNote, TaskStatus } from "@/lib/team/types";

// The Executive (PRD §23.5 n): a skeleton subagent that turns each step of Athena's plan into tasks the founder tracks.
// One task per result a step acts on (a shop to pitch, a partner to ask, an event to show up at), or one for the step
// when it acts on none. A mark on a task is an outcome for the subagent that owns the result, so it flows back there.
// It never sends, books or applies (`canAct: false` in the registry). Pure code, client-safe.

const ACTION: Record<string, (name: string) => string> = {
  venue: (n) => `Pitch ${n}`,
  creator: (n) => `Ask ${n}`,
  partner: (n) => `Ask ${n}`,
  podcast: (n) => `Ask ${n} to have you on`,
  event: (n) => `Show up at ${n}`,
};

/** What a step waits on, in the plan's words: ready now, or once the steps before it hold. */
export function needsOf(step: PlanStep): string {
  const d = step.depends;
  if (!d.length) return "Ready now";
  return d.length === 1 ? `Once step ${d[0]} holds` : d.length === 2 ? `Once steps ${d[0]} and ${d[1]} hold` : `Once steps ${d[0]}–${d.at(-1)} hold`;
}

/** A task's status from its mark when the founder hasn't set one since: No is Skipped, Yes or Went is Done, Pitched or No reply is Doing. */
export function statusFromMark(m?: Mark): TaskStatus {
  if (m === "no") return "skipped";
  if (m === "yes" || m === "went") return "done";
  if (m === "pitched" || m === "no_reply") return "doing";
  return "todo";
}

const stepId = (s: PlanStep) => `step:${s.what}`;
/** Who a step-only task is from: the subagent its first cited line names, else Athena. */
const stepAgent = (s: PlanStep): SpecialistId | "athena" => s.lines.find((l) => l.kind !== "when" && l.kind !== "cost" && l.agent)?.agent ?? s.lines.find((l) => l.agent)?.agent ?? "athena";

/**
 * The board's tasks, in the plan's order. `notes` is what the founder set on the board; a status set after the item's
 * latest mark wins, else the mark decides. A task the founder touched that has since left the plan (marked No) stays, as
 * it was, so Skipped still shows it.
 */
export function tasksOf(plan: GrowthPlan | undefined, outcomes: Outcome[], notes: Record<string, TaskNote> = {}): Task[] {
  const last = new Map<string, { mark: Mark; at: number }>();
  for (const o of [...outcomes].sort((a, b) => a.at - b.at)) last.set(o.item, { mark: o.mark, at: o.at });
  const status = (id: string, mark?: { mark: Mark; at: number }): TaskStatus => {
    const n = notes[id];
    return n?.status && (!mark || n.at >= mark.at) ? n.status : statusFromMark(mark?.mark);
  };

  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const s of plan?.steps ?? []) {
    const base = { step: s.n, stepWhat: s.what, phase: s.phase, crowds: s.crowds, needs: needsOf(s) };
    const items: PlanItem[] = s.items ?? [];
    if (!items.length) {
      const id = stepId(s);
      if (seen.has(id)) continue;
      seen.add(id);
      tasks.push({ ...base, id, agent: stepAgent(s), action: s.what, status: status(id) });
      continue;
    }
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const m = last.get(it.id);
      const { agent, ...item } = it;
      tasks.push({ ...base, id: it.id, agent, action: (ACTION[it.kind] ?? ((n: string) => n))(it.name), item, status: status(it.id, m), ...(m ? { mark: m.mark } : {}) });
    }
  }
  // Tasks the founder worked on the board that are no longer in the plan.
  for (const [id, n] of Object.entries(notes)) {
    if (seen.has(id) || !n.task) continue;
    const m = last.get(id);
    tasks.push({ ...n.task, left: true, status: status(id, m), ...(m ? { mark: m.mark } : {}) });
  }
  return tasks;
}
