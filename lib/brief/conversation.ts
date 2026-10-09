import type { Motion } from "@/lib/playbook/config";

// Chapter 1's guardrails (§6.2.1). The agent (agent.ts) researches, reasons and decides what to ask; code only
// bounds it: the required facts, a turn cap, a call cap, and never the same question twice. Gaps are filled by the
// founder or by research, never by a guess (decided 10 Oct).

export const MAX_TURNS = 4;
export const MAX_CALLS = 8;
/** Web research runs at most this many times per brief (each is one grounded prompt, §14.5). */
export const MAX_RESEARCH = 2;

export const MOTION_WORDS: Record<Motion, string> = {
  venue: "in cafés, bars and restaurants",
  retail: "in shops",
  city_launch: "through an app or service, city by city",
  partnership: "through partnerships and collaborations",
  location_opening: "in your own locations",
  online: "online: its own site, marketplaces, social and creators",
};

export const OPENING =
  "Tell me about your product. Even just the brand name works: I'll look it up and come back with what I find. Drop in anything you have: a deck, photos, a stockist list, your website.";

/** Always offered while the brief isn't ready, so the founder can hand any gap to Athena. */
/** The founder doesn't know: Athena looks it up instead of guessing (decided 10 Oct: search or ask, never a blind guess). */
export const GUESS = "Not sure, look it up for me";

export type Turn = {
  text: string;
  /** Short replies the agent suggests; tapping one sends it as a message. */
  replies: string[];
  ready: boolean;
};

/** Same question, different words? Compares content words, so a rephrased repeat still counts. */
export function isRepeat(question: string, asked: string[]): boolean {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const q = words(question);
  if (q.size < 3) return false;
  return asked.some((a) => {
    const w = words(a);
    const shared = [...q].filter((x) => w.has(x)).length;
    return shared / Math.min(q.size, w.size || 1) >= 0.7;
  });
}
