import { nameOf, type SpecialistId } from "@/lib/agent/specialists";
import type { Claim } from "@/lib/agent/cite";
import type { WorkItem } from "@/lib/team/types";
import type { SpineGo, SpineIn } from "./spine";

// Every subagent finishes, and the founder knows what's next (PRD §23.9 f). A finished subagent's page ends on a finish
// card (what it found, in three plain lines) and one Next line: what happens now, and whether it needs the founder.
// Pure, so the page, the panel and the tests read the same line from the same journey state.

/** What a working subagent is doing for the founder, in their words, under its live step. */
export const DOING: Record<SpecialistId, string> = {
  analyst: "Measuring who loves your brand and ranking the crowds most like them",
  scout: "Working out the words, the look and the products to lead with for each crowd",
  navigator: "Finding the cities where your crowds are strongest",
  rep: "Finding the shops in your crowds' cities to pitch, and what to say to each",
  matchmaker: "Finding the creators, brands and podcasts your crowds already follow",
  promoter: "Finding the events your crowds turn up for, and when to book them",
};

/** What a subagent does next, said after its name: "Next: the Navigator finds where these crowds live". */
const NEXT: Record<SpecialistId, string> = {
  analyst: "ranks the crowds most like your customers",
  scout: "works out what to say to each crowd",
  navigator: "finds where these crowds live",
  rep: "finds the shops to pitch",
  matchmaker: "finds who to work with",
  promoter: "finds the events to be at",
};

/** The Next line: `you` when it waits on the founder; `go` is its one primary action, `act` that button's words. */
export type Next = { you: boolean; line: string; go?: SpineGo; act?: string };

/** What happens after `after` finished (or while it waits), from the journey's state. One line, one action. */
export function nextLine(s: SpineIn, after: SpecialistId): Next {
  // A question the run waits on comes first: answering it is what moves the plan.
  if (s.waiting) {
    const who = s.waiting.id === "athena" ? "Athena" : `The ${nameOf(s.waiting.id)}`;
    return { you: true, line: `${who} needs one answer from you before the work goes on`, go: "chat" };
  }
  if (s.goalsOpen) return { you: true, line: "Pick what to work on: this decides which subagents run", go: "chat" };
  if (s.plan) {
    if (s.exec.running) return { you: false, line: "The Executive is finding how to reach everyone in your plan", go: "executive", act: "Watch the Executive" };
    if (s.exec.started) return { you: false, line: "Your plan is under way", go: "executive", act: "Open Execute Plan" };
    return { you: true, line: "Your plan is ready: start the Executive to reach everyone in it", go: "executive", act: "Open Execute Plan" };
  }
  // Another subagent at work: the run carries on there, where the founder can watch it.
  const w = s.working;
  if (w && w.id !== "athena" && w.id !== after) return { you: false, line: `Next: the ${nameOf(w.id)} ${NEXT[w.id]}`, go: w.id, act: `Watch the ${nameOf(w.id)}` };
  const steps = s.workflow?.steps.filter((x) => x.id !== "athena") ?? [];
  const todo = steps.find((x) => x.id !== after && x.state !== "done");
  if (todo) {
    const id = todo.id as SpecialistId;
    return { you: false, line: `Next: the ${nameOf(id)} ${NEXT[id]}`, go: id, act: `Open the ${nameOf(id)}` };
  }
  if (s.workflow && steps.every((x) => x.state === "done")) return { you: false, line: "Next: Athena puts the team's work into your plan", go: "athena", act: "Watch Athena" };
  if (!s.goals) return { you: false, line: "Next: Athena suggests what to work on", go: "athena", act: "Open Athena" };
  return { you: false, line: "Next: Athena hands out the next step", go: "athena", act: "Open Athena" };
}

/**
 * The finish card's three lines (§23.9 f): the decision, then what it rests on, as the subagent wrote them. A run that
 * wrote few claims falls back to its top results and why each is there. A run decided by code's rules has claims that
 * are its tools' summaries ("3 crowds: …"), so its results' reasons come first. Never more than three.
 */
export function finishLines(work: { headline: string; claims: Claim[]; results: Pick<WorkItem, "name" | "why">[]; by?: "agent" | "rules" }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string | undefined) => {
    const line = t?.trim();
    if (!line || seen.has(line.toLowerCase()) || out.length >= 3) return;
    seen.add(line.toLowerCase());
    out.push(line);
  };
  const claims = () => work.claims.forEach((c) => add(c.text));
  const results = () => work.results.forEach((r) => add(r.why ? `${r.name}: ${r.why}` : undefined));
  add(work.headline);
  if (work.by === "rules") (results(), claims());
  else (claims(), results());
  return out;
}
