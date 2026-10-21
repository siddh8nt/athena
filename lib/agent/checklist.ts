import type { AgentEvent } from "@/lib/blocks/types";

// Onboarding's checklist (PRD §23.2 step 7.2e): the agent's own plan, pinned above the transcript. The model writes
// the steps at the start (lib/agent/sort.ts) and can change the ones still to come (update_plan); code ticks each step
// off from the run's own events, so the checklist and the transcript never disagree. Pure code, client-safe.

/** What a step does, so code can tell which events belong to it. "other" is ticked only by the agent itself. */
export const DOES = ["read_website", "read_file", "read_summary", "qloo_search", "web_search", "compare", "ask_founder", "finish_brief", "other"] as const;
export type Does = (typeof DOES)[number];

export type CheckItem = {
  id: string;
  step: string;
  does: Does;
  /** The file name or site it's about, when the plan names one. */
  ref?: string;
  state: "todo" | "now" | "done" | "skipped";
  /** A short result once done ("42 facts"). */
  result?: string;
};

export type PlanStep = { step: string; does: Does; ref?: string; done?: string };

/** Which kind of step an event is. The brief's check is the last step: writing the brief. */
const doesOf = (e: AgentEvent): Does | undefined => (e.tool === "check" ? "finish_brief" : (DOES as readonly string[]).includes(e.tool) && e.tool !== "other" && e.tool !== "finish_brief" ? (e.tool as Does) : undefined);

/** The first clause of a summary, short enough for a checklist row. */
export const shortResult = (s: string) => {
  const first = s.split(/;\s|\.\s/)[0].trim();
  return first.length > 70 ? `${first.slice(0, 68).trimEnd()}…` : first;
};

const clean = (steps: PlanStep[]) =>
  steps
    .map((s) => ({ ...s, step: s.step.replace(/\s+/g, " ").trim().slice(0, 70) }))
    .filter((s) => s.step && (DOES as readonly string[]).includes(s.does))
    .slice(0, 8);

export class Checklist {
  private list: CheckItem[] = [];
  private n = 0;

  constructor(steps: PlanStep[]) {
    this.list = clean(steps).map((s) => this.item(s));
  }

  private item(s: PlanStep): CheckItem {
    return { id: `c${this.n++}`, step: s.step, does: s.does, ref: s.ref, state: s.done ? "done" : "todo", result: s.done ? shortResult(s.done) : undefined };
  }

  items(): CheckItem[] {
    return this.list.map((i) => ({ ...i }));
  }

  /** The steps still to come, replaced with the agent's new plan; steps done or under way stay as they are. */
  replace(steps: PlanStep[]): void {
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const kept = this.list.filter((i) => i.state === "done" || i.state === "now");
    for (const s of clean(steps)) {
      const k = kept.find((i) => same(i.step, s.step));
      // A step the agent says it has done ticks the one under way.
      if (k) {
        if (s.done && k.state === "now") Object.assign(k, { state: "done", result: shortResult(s.done) });
        continue;
      }
      kept.push(this.item(s));
    }
    this.list = kept;
  }

  /** Ticks the plan from one event: a step starts when its first event runs, and is done with that event's result. */
  track(e: AgentEvent): boolean {
    const does = doesOf(e);
    if (!does || e.under) return false;
    // A ref tells apart the reads of different sites and files; a lookup's step matches whatever name the plan gave it.
    const ref = does.startsWith("read_") ? e.source?.label : undefined;
    const mine = (i: CheckItem) => i.does === does && (!i.ref || !ref || i.ref === ref);
    // A step only the agent can tick ("Synthesize findings") is done once the plan has moved past it.
    const past = (i: CheckItem) => {
      const at = this.list.indexOf(i);
      for (const x of this.list.slice(0, at)) if (x.does === "other" && (x.state === "todo" || x.state === "now")) x.state = "done";
    };
    if (e.status === "running") {
      if (this.list.some((i) => i.state === "now" && mine(i))) return false;
      const i = this.list.find((x) => x.state === "todo" && mine(x));
      if (!i) return false;
      i.state = "now";
      past(i);
      return true;
    }
    if (e.status === "needs_input") return false;
    const i = this.list.find((x) => x.state === "now" && mine(x)) ?? this.list.find((x) => x.state === "todo" && mine(x));
    if (!i) return false;
    past(i);
    // Checking the brief can run twice when the agent fixes a fact: writing it is done only once it's sent (finish()).
    if (does === "finish_brief") {
      if (i.state === "now") return false;
      i.state = "now";
      return true;
    }
    i.state = "done";
    i.result = shortResult(e.line?.replace(/^[^:]*:\s*/, "") || e.summary);
    return true;
  }

  /** The brief is in: steps under way are done, and steps that never came were skipped. */
  finish(result?: string): void {
    for (const i of this.list) {
      // The agent's own steps ("Synthesize findings") were part of writing it.
      if (i.state === "now" || ((i.does === "finish_brief" || i.does === "other") && i.state === "todo")) Object.assign(i, { state: "done", result: i.does === "finish_brief" && result ? shortResult(result) : i.result });
      else if (i.state === "todo") i.state = "skipped";
    }
  }
}

/** The phone's one line: "Step 3 of 6 · Find you in Qloo". */
export function checklistLine(items: CheckItem[]): string {
  const live = items.filter((i) => i.state !== "skipped");
  if (!live.length) return "";
  const at = live.findIndex((i) => i.state === "now" || i.state === "todo");
  if (at < 0) return `All ${live.length} steps done`;
  return `Step ${at + 1} of ${live.length} · ${live[at].step}`;
}
