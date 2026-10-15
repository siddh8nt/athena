import type { AgentEvent } from "@/lib/blocks/types";

// Onboarding's live transcript (PRD §23.2 step 7.2d): the run's events as plain lines, never a timer. A step's later
// events update its line in place; each page of a site nests under the site's line, so a finished site folds to one
// line. The founder's own messages and the brief are lines too, so the transcript reads as one log across runs.
// Pure code, client-safe.

export type Line = { key: string; run: number; ev: AgentEvent; pages: Line[] };

/** Bookkeeping the founder doesn't need to watch: the date, the goal, the plan's own edits (shown on the checklist). */
const HIDDEN = new Set(["today", "goal", "update_plan", "think"]);

const findLast = <T>(xs: T[], f: (x: T) => boolean) => {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return i;
  return -1;
};

const at = <T>(xs: T[], i: number, x: T) => xs.map((y, k) => (k === i ? x : y));

/** The same step's line: a running line of that tool and purpose in this run. */
function upsert(lines: Line[], ev: AgentEvent, run: number, key: string, same: (l: Line) => boolean): Line[] {
  const i = findLast(lines, (l) => l.run === run && l.ev.status === "running" && same(l));
  if (i >= 0) return at(lines, i, { ...lines[i], ev });
  return [...lines, { key, run, ev, pages: [] }];
}

export function addEvent(lines: Line[], ev: AgentEvent, run: number): Line[] {
  if (HIDDEN.has(ev.tool)) return lines;
  if (ev.under) {
    const i = findLast(lines, (l) => l.run === run && l.ev.why === ev.under);
    if (i >= 0) {
      const p = lines[i];
      const id = ev.source?.url ?? ev.why;
      return at(lines, i, { ...p, pages: upsert(p.pages, ev, run, `${p.key}:${id}`, (l) => (l.ev.source?.url ?? l.ev.why) === id) });
    }
  }
  return upsert(lines, ev, run, `${run}:${lines.length}`, (l) => l.ev.tool === ev.tool && l.ev.why === ev.why);
}

/** The run is over: a line still running never finished, so it goes, rather than spin forever. */
export function settleRun(lines: Line[], run: number): Line[] {
  return lines
    .filter((l) => l.run !== run || l.ev.status !== "running")
    .map((l) => (l.run === run ? { ...l, pages: l.pages.filter((p) => p.ev.status !== "running") } : l));
}

/** What a line says: what it's doing while it runs, what it found once done. */
export function lineText(ev: AgentEvent): string {
  if (ev.status === "running") return ev.why;
  return ev.line ?? ev.why;
}

/** Detail under a line once it's opened: the summary, unless the line already says it. */
export function lineDetail(ev: AgentEvent): string {
  if (ev.status === "error" || !ev.summary) return "";
  return ev.line?.includes(ev.summary) ? "" : ev.summary;
}
