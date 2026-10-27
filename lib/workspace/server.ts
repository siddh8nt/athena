import "server-only";
import { getStore } from "@/lib/store";
import type { TaskStatus } from "@/lib/team/types";
import type { AgentId } from "@/lib/agent/specialists";
import type { External } from "./merge";

// The server side of the saved workspace (PRD §23.6 a). The browser mirrors its journey here under the
// workspace id; the MCP server (§23.6 b) reads that mirror and writes the founder's changes back into the
// external map, which the app folds in (see `merge.ts`). Everything is best-effort over `getStore`
// (Firestore in production, files locally): a slow save shows nothing, a failed one is retried by the next
// change. A workspace id is a random UUID the browser keeps; nothing here needs the founder's identity.

const SNAP = "ws-journey"; // the browser's mirrored journey, read by the MCP server
const EXT = "ws-external"; // changes made from outside Athena, folded back by the app

/** The browser's journey as last mirrored. `saved` is the same blob the browser keeps in localStorage. */
export type Snapshot = { saved: unknown; at: number };

/** Mirror the browser's working copy. Called a moment after each change; the browser copy stays the source. */
export async function saveSnapshot(ws: string, saved: unknown): Promise<void> {
  if (!ws) return;
  await getStore().set<Snapshot>(SNAP, ws, { saved, at: Date.now() });
}

export async function readSnapshot(ws: string): Promise<Snapshot | undefined> {
  if (!ws) return undefined;
  return (await getStore().get<Snapshot>(SNAP, ws))?.value;
}

export async function readExternal(ws: string): Promise<External> {
  if (!ws) return {};
  return (await getStore().get<External>(EXT, ws))?.value ?? {};
}

// Writes used by the MCP tools (§23.6 b). Read-modify-write: one founder works one workspace, so there's no
// real contention, and each write stamps its own `at` so the app folds in the newest per item.

/** `mark_task`: set an Execute Plan task's status from the founder's own AI tool. */
export async function markTask(ws: string, item: string, status: TaskStatus): Promise<void> {
  if (!ws || !item) return;
  const ext = await readExternal(ws);
  ext.marks = { ...(ext.marks ?? {}), [item]: { status, at: Date.now() } };
  await getStore().set<External>(EXT, ws, ext);
}

/** `answer_question`: answer a paused subagent's question from outside. */
export async function answerQuestion(ws: string, id: string, agent: AgentId, question: string, answer: string): Promise<void> {
  if (!ws || !id) return;
  const ext = await readExternal(ws);
  ext.answers = { ...(ext.answers ?? {}), [id]: { agent, question, answer, at: Date.now() } };
  await getStore().set<External>(EXT, ws, ext);
}

/** `add_fact`: a fact to fold in through the merge rules like a typed edit; kept as a list, newest last. */
export async function addFact(ws: string, id: string, text: string): Promise<void> {
  if (!ws || !text.trim()) return;
  const ext = await readExternal(ws);
  ext.facts = [...(ext.facts ?? []).filter((f) => f.id !== id), { id, text: text.trim(), at: Date.now() }].slice(-50);
  await getStore().set<External>(EXT, ws, ext);
}
