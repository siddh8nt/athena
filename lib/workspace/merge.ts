import type { Journey } from "@/lib/journey/types";
import type { AgentId } from "@/lib/agent/specialists";
import { emptyTeam, type TaskStatus, type TeamState } from "@/lib/team/types";

// The workspace saved on the server (PRD §23.6 a). The browser keeps the working copy; every change is
// also mirrored to Firestore under the workspace id. Changes made from outside Athena — a founder's AI
// tool calling the MCP server's mark_task / answer_question / add_fact (§23.6 b) — are kept on the server
// as a per-item map, so a slow or repeated write never overwrites the whole journey. The app folds them in
// item by item on load and on focus, the newer change to an item winning. This file is the pure, client-safe
// part: the fold. The server read/write lives in `server.ts`.

/** Changes made to the workspace from outside Athena, kept per item so none overwrites the whole journey. */
export type External = {
  /** Execute Plan task statuses set from outside, by item id. */
  marks?: Record<string, { status: TaskStatus; at: number }>;
  /** Answers to a paused subagent's question, by question id. */
  answers?: Record<string, { agent: AgentId; question: string; answer: string; at: number }>;
  /** Facts added from outside; each is folded in through the merge rules like a typed edit (§23.6 b), so it's a list. */
  facts?: { id: string; text: string; at: number }[];
};

export type Applied = {
  journey: Journey;
  /** The newest `at` now folded in: the app keeps it so the same change is never folded in twice. */
  cursor: number;
  /** Facts still to fold in through the graph's merge rules, as the browser does for a typed edit. */
  newFacts: { id: string; text: string }[];
  /** Whether anything actually changed, so the app re-renders only when it did. */
  changed: boolean;
};

/**
 * Fold the server's external changes into the journey, item by item (§23.6 a). `cursor` is the newest `at`
 * already folded in; only changes newer than it are considered, and a per-item change is taken only when it's
 * newer than what the item already has, so the browser's own newer edit is never undone. Pure: no store, no clock.
 */
export function applyExternal(journey: Journey, ext: External | undefined, cursor: number): Applied {
  if (!ext) return { journey, cursor, newFacts: [], changed: false };
  let changed = false;
  let next = cursor;
  const team: TeamState = journey.team ?? emptyTeam();
  const tasks = { ...(team.tasks ?? {}) };
  const answered = [...(team.answered ?? [])];

  for (const [item, m] of Object.entries(ext.marks ?? {})) {
    next = Math.max(next, m.at);
    if (m.at <= cursor) continue;
    const have = tasks[item];
    if (have && have.at >= m.at) continue; // the browser's own change to this task is newer: it wins.
    tasks[item] = { ...have, status: m.status, at: m.at };
    changed = true;
  }

  for (const [id, a] of Object.entries(ext.answers ?? {})) {
    next = Math.max(next, a.at);
    if (a.at <= cursor) continue;
    const at = answered.findIndex((x) => x.id === id);
    const entry = { id, agent: a.agent, question: a.question, answer: a.answer };
    if (at >= 0) answered[at] = { ...answered[at], ...entry };
    else answered.push(entry);
    changed = true;
  }

  const newFacts: { id: string; text: string }[] = [];
  for (const f of ext.facts ?? []) {
    next = Math.max(next, f.at);
    if (f.at <= cursor) continue;
    newFacts.push({ id: f.id, text: f.text });
  }

  if (!changed && !newFacts.length) return { journey, cursor: next, newFacts: [], changed: false };
  return { journey: { ...journey, team: { ...team, tasks, answered } }, cursor: next, newFacts, changed: true };
}
