// What the team is doing, at a glance (§23.10): the status pill's line at the top right, and the few changes in the
// team's live state that earn a popup. Client-safe and pure; components/Activity.tsx draws them.

import { SPECIALIST_IDS, nameOf, type AgentId, type SpecialistId } from "@/lib/agent/specialists";
import type { AgentStatus } from "./types";

export type Statuses = Partial<Record<AgentId, AgentStatus>>;

export type PillLine = { tone: "ask" | "work" | "idle"; text: string };

const who = (id: AgentId | "executive") => (id === "athena" ? "Athena" : id === "executive" ? "The Executive" : `The ${nameOf(id)}`);

/** Who is working now, Athena first, then the subagents in the team's order, then the Executive. */
export function workingNow(status: Statuses, exec: boolean): (AgentId | "executive")[] {
  const ids: (AgentId | "executive")[] = (["athena", ...SPECIALIST_IDS] as AgentId[]).filter((id) => status[id]?.state === "working");
  return exec ? [...ids, "executive"] : ids;
}

/** The pill's line (§23.10 a): a waiting question first, then who is working, else the team is idle. */
export function pillLine(status: Statuses, p: { asking: boolean; exec: boolean }): PillLine {
  if (p.asking) return { tone: "ask", text: "Athena needs you" };
  const ids = workingNow(status, p.exec);
  if (!ids.length) return { tone: "idle", text: "Team idle" };
  return { tone: "work", text: ids.length === 1 ? `${who(ids[0])} is working` : `${ids.length} working` };
}

export type Moment = { kind: "start" | "done"; id: SpecialistId };

/**
 * A subagent starting or finishing between two states of the run. Picking up again after waiting on the founder is
 * neither: the subagent was already under way.
 */
export function moments(prev: Statuses, next: Statuses): Moment[] {
  const out: Moment[] = [];
  for (const id of SPECIALIST_IDS) {
    const was = prev[id]?.state;
    const is = next[id]?.state;
    if (is === was) continue;
    if (is === "working" && was !== "waiting") out.push({ kind: "start", id });
    else if (is === "done" && (was === "working" || was === "waiting")) out.push({ kind: "done", id });
  }
  return out;
}

/**
 * Whether a moment pops up (§23.10 b): never on the page it concerns, and a start never on the dashboard, whose
 * Starting card says it there.
 */
export function pops(m: Moment, page: string): boolean {
  if (page === m.id) return false;
  return m.kind === "done" || page !== "dashboard";
}

export { who as whoOf };
