import type { Motion } from "@/lib/playbook/config";
import { missingRequired, needsYes, type BrandBrief, type Conflict, type RequiredFact, type Sourced } from "./types";

// Phase 1's turn logic (§6.2.1): code picks the next question from the checklist, one at a time; inferred
// answers become one-tap confirmations. Pure, so the order of questions is testable and never left to the LLM.

export const MAX_TURNS = 4;
export const MAX_CALLS = 6;

export const MOTION_WORDS: Record<Motion, string> = {
  venue: "in cafés, bars and restaurants",
  retail: "in shops",
  city_launch: "through an app or service, city by city",
  partnership: "through partnerships",
  location_opening: "in your own locations",
};

export const OPENING =
  "Tell me about your brand: what it is, what you sell, and how people buy it. Drop in anything else you have: a deck, a stockist list, a spreadsheet, screenshots, your website.";

export type Reply = { id: string; label: string };
export type Turn = {
  text: string;
  /** The fact this turn asks about; absent when the brief is ready. */
  fact?: RequiredFact;
  replies: Reply[];
  ready: boolean;
};

const showValue = (fact: RequiredFact, v: unknown) =>
  fact === "howBought" ? (v as Motion[]).map((m) => MOTION_WORDS[m]).join(" and ") : String(v);

const CONFIRM: Record<RequiredFact, (v: string) => string> = {
  name: (v) => `Is the brand called ${v}?`,
  sells: (v) => `Looks like you sell ${v}. Right?`,
  howBought: (v) => `Looks like people mostly buy it ${v}. Right?`,
  activeCity: (v) => (v === "none yet" ? "Sounds like you're not in a US city yet. Right?" : `Looks like ${v} is your strongest US city. Right?`),
};

const ASK: Record<RequiredFact, string> = {
  name: "What's the brand called?",
  sells: "What exactly do you sell? A product, an app, a service?",
  howBought: "Where do people buy it today: in shops and cafés, online, or somewhere else?",
  activeCity: "Which US city are you strongest in, or launching in first? \"Nowhere yet\" is a fine answer.",
};

const FIELD: Partial<Record<keyof BrandBrief, string>> = { name: "the name", sells: "what you sell", howBought: "how people buy it", activeCity: "your city", tierHint: "price tier", stageHint: "stage" };
const plain = (v: unknown) => (Array.isArray(v) ? v.map((m) => MOTION_WORDS[m as Motion] ?? m).join(" and ") : String(v));

const GUESS: Reply = { id: "guess", label: "Not sure, make your best guess" };

/** What Athena says next: a confirmation, an open question, or "ready", plus any conflicts it noticed. */
export function nextTurn(brief: BrandBrief, conflicts: Conflict[] = []): Turn {
  const note = conflicts
    .filter((c) => c.field !== "stockists")
    .filter((c) => FIELD[c.field])
    .map((c) => `For ${FIELD[c.field]} I went with "${plain(c.kept.value)}" over "${plain(c.dropped.value)}"; tell me if that's wrong.`)
    .join(" ");
  const missing = missingRequired(brief);
  if (!missing.length) {
    const bits = [
      brief.qloo?.match ? `find ${brief.qloo.match.name} in Qloo` : `look for ${brief.name?.value} in Qloo`,
      brief.stockists.length ? `match your ${brief.stockists.length} stockists` : "",
      brief.comparables.length ? `use ${brief.comparables.map((c) => c.value).join(", ")} as brands like you` : "pick brands like you",
    ].filter(Boolean);
    return { text: [note, `I have what I need. I'll ${bits.join(", ")}, then build your plan.`].filter(Boolean).join(" "), replies: [], ready: true };
  }
  const fact = missing[0];
  const current = brief[fact] as Sourced<unknown> | undefined;
  if (current && needsYes(current)) {
    return { text: [note, CONFIRM[fact](showValue(fact, current.value))].filter(Boolean).join(" "), fact, replies: [{ id: "yes", label: "Yes" }, { id: "no", label: "Not quite" }], ready: false };
  }
  return { text: [note, ASK[fact]].filter(Boolean).join(" "), fact, replies: [GUESS], ready: false };
}

/** The founder tapped Yes: the inferred value becomes theirs. */
export function confirm(brief: BrandBrief, fact: RequiredFact): BrandBrief {
  const s = brief[fact];
  return s ? { ...brief, [fact]: { ...s, confirmed: true } } : brief;
}

/** "Not quite": drop the inference so the open question is asked instead. */
export function reject(brief: BrandBrief, fact: RequiredFact): BrandBrief {
  return { ...brief, [fact]: undefined };
}

const FALLBACK: { [K in RequiredFact]: NonNullable<BrandBrief["guesses"]>[K] } = {
  name: "Your brand",
  sells: "consumer products",
  howBought: ["retail"],
  activeCity: "none yet",
};

/** "Not sure, make your best guess", or out of turns: fill from Gemini's guesses, labelled Agent · guessed. */
export function applyGuesses(brief: BrandBrief, facts: RequiredFact[]): BrandBrief {
  const out = { ...brief };
  for (const f of facts) {
    const v = brief.guesses?.[f] ?? FALLBACK[f];
    // An unconfirmed inference is a better guess than a blind one.
    const prev = brief[f] as Sourced<unknown> | undefined;
    (out as Record<string, unknown>)[f] = { value: prev?.value ?? v, source: { kind: "agent_guess" } };
  }
  return out;
}

/** After the last allowed turn, every remaining gap is guessed so the founder can always start (§6.2.1). */
export function closeIfOutOfTurns(brief: BrandBrief): BrandBrief {
  // The first message is not a follow-up, so out of turns means more than MAX_TURNS sent.
  return brief.turns > MAX_TURNS ? applyGuesses(brief, missingRequired(brief)) : brief;
}
