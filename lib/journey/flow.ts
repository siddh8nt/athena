import type { FounderQuestion } from "@/lib/agent/tools";
import type { BrandBrief } from "@/lib/brief/types";
import type { Channel } from "./growth";

// The journey's one path (PRD §23.2 step 8.1): after onboarding, one growth question in the transcript, then the
// Analyst measures from the seed below. Pure, so the browser and the tests share it.

export type GrowthQuestion = Omit<FounderQuestion, "options"> & { id: string; options: (FounderQuestion["options"][number] & { channel: Channel })[]; assumedChannel: Channel };

const LABEL: Record<Channel, string> = { online: "Mostly online", offline: "Mostly in shops and venues", both: "Both online and in shops" };

/**
 * How the brand sells today, asked once. The option the research points to comes first, marked as what Athena found;
 * Other takes anything else in the founder's words, and the team reads that as it's written.
 */
export function growthQuestion(b: BrandBrief): GrowthQuestion {
  const guess = b.channel?.value;
  const order: Channel[] = guess ? [guess, ...(["online", "offline", "both"] as Channel[]).filter((c) => c !== guess)] : ["both", "online", "offline"];
  const name = b.name?.value || "your brand";
  const found = b.channel?.source.kind === "message" ? "You said so" : "From what I found";
  return {
    id: "growth",
    question: `How does ${name} sell today?`,
    why: "So the goals I suggest fit how you reach people now.",
    options: order.map((c, i) => ({ label: LABEL[c], channel: c, ...(i === 0 && guess ? { hint: found } : {}) })),
    multi: false,
    assumed: LABEL[order[0]],
    assumedChannel: order[0],
  };
}

/** What the Analyst measures from: the brand's Qloo match, the comparables, the lookalikes and the traits. */
export function seedOf(b: BrandBrief) {
  return { brand: b.qloo?.match, comparables: b.comparables.map((c) => c.value), lookalikes: b.proxies ?? [], traits: b.traits ?? [] };
}

/**
 * Onboarding's review gate (§23.9 d): "Looks right: plan my growth →" shows only once the Brand Graph is revealed and
 * nothing is open or still being written. Until then the panel's foot says what it waits on, never a button.
 */
export function reviewGate(s: { shown: boolean; running: boolean; grouping?: string; open: number }): { ready: true } | { ready: false; waiting: string } {
  if (s.open) return { ready: false, waiting: s.open === 1 ? "Waiting on one answer from you" : `Waiting on ${s.open} answers from you` };
  if (!s.shown) return { ready: false, waiting: s.grouping ? "Waiting for your themes to be grouped" : "Waiting for your Brand Graph to be built" };
  if (s.running || s.grouping) return { ready: false, waiting: s.grouping ? "Waiting for your themes to be grouped" : "Waiting for me to finish updating it" };
  return { ready: true };
}
