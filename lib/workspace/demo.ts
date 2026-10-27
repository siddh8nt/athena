import "server-only";
import type { LinkMeta } from "./links";
import { readSnapshot } from "./server";

// The judges' demo link (PRD §23.6 e): one precomputed Fishwife workspace on the server, opened by one fixed,
// read-only connect link that's the same on every deploy, so the write-up and video can print it. The link is public
// by design, so it isn't a secret like a founder's: it never writes (scope "read" refuses every write tool and
// ask_athena, so one judge can't change what the next sees and nothing spends). The workspace is seeded once from a
// recorded dev run (`pnpm seed:demo`); recorded runs hold Qloo data, so the data lives only in the store, never in git.

/** The demo's workspace id. Browser ids are hex UUIDs, so nothing a browser makes can start with "demo-". */
export const DEMO_WS = "demo-fishwife";

/** The fixed path secret of the demo link: `/mcp/fishwife-sample-plan`. */
export const DEMO_SECRET = "fishwife-sample-plan";

/** What the demo link opens. */
export const DEMO_LINK: LinkMeta = { ws: DEMO_WS, scope: "read", at: 0, label: "Fishwife sample" };

/** A workspace id no browser may save over or mint a link for: the demo's (and any later "demo-" one). */
export const reserved = (ws: string) => ws.startsWith("demo-");

/** Whether the demo workspace has been seeded, so /plan shows its line only when the link would answer. */
export async function demoReady(): Promise<boolean> {
  const snap = await readSnapshot(DEMO_WS);
  const saved = snap?.saved as { journey?: { team?: { plan?: unknown } } } | undefined;
  return !!saved?.journey?.team?.plan;
}

/**
 * The part of a browser's saved journey the MCP server reads: the brief and the journey, without the chat, the turn
 * or the team's undo copy (`previous`), which nothing outside the app reads. Keeps the seeded document small.
 */
export function compactSaved(saved: unknown): { brief: unknown; journey: unknown } | undefined {
  const s = saved as { brief?: unknown; journey?: { team?: Record<string, unknown> } & Record<string, unknown> } | undefined;
  if (!s?.journey) return undefined;
  const { previous: _undo, ...team } = s.journey.team ?? {};
  return { brief: s.brief, journey: { ...s.journey, team } };
}
