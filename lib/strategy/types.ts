import type { SourceRef, Tier } from "@/lib/fits/types";

// A strategy for every most valuable fit (PRD §23.2 step 6) as the client sees it. Pure types, client-safe.

/** The founder's context that changes the actions (§23.2 step 6c), one key per rule. */
export type ContextKey = "stockists" | "budget" | "launch" | "capacity";
export const CONTEXT_LABEL: Record<ContextKey, string> = { stockists: "Already stocked", budget: "Budget", launch: "Launch date", capacity: "Capacity" };

export type BudgetBand = "lean" | "moderate" | "ample";
export const BUDGET_BANDS: BudgetBand[] = ["lean", "moderate", "ample"];

/**
 * The context as code applies it. The agent reads it from the founder's sources; each item carries the source ids
 * that say so, and `said` is the founder's own words (checked against those sources).
 */
export type StrategyContext = {
  /** Stores and retailers the brand already sells through; `metro` when the source places one. */
  stockists: { name: string; metro?: string; sources: string[] }[];
  /** Metros the brand already sells in (the fits run's "already yours"), left out of where. */
  soldIn: { metro: string; sources: string[] }[];
  budget?: { band: BudgetBand; said: string; sources: string[] };
  /** A launch date ahead of today (YYYY-MM-DD): nothing starts before it. */
  launch?: { date: string; said: string; sources: string[] };
  /** How many regions the brand can work at once. */
  capacity?: { regions: number; said: string; sources: string[] };
};

export type Channel = "own" | "indie" | "creators" | "podcasts" | "paid_social" | "retail" | "retail_promo" | "events";
export const CHANNEL_LABEL: Record<Channel, string> = {
  own: "Your own channels",
  indie: "Independent shops",
  creators: "Creators",
  podcasts: "Podcasts",
  paid_social: "Paid social",
  retail: "Retailers",
  retail_promo: "In-store promotion",
  events: "Events",
};

/** Now (the first wave), next (the wave after), or before a dated moment. */
export type ActionWhen = "now" | "next" | "before";
export const WHEN_LABEL: Record<ActionWhen, string> = { now: "Now", next: "Next", before: "Before each moment" };

export type Action = {
  /** Stable across runs, so a changed fact shows as a changed action. */
  id: string;
  when: ActionWhen;
  channel: Channel;
  text: string;
  /** The metro it happens in, for regional actions. */
  where?: string;
  /** Start by this date (YYYY-MM-DD). */
  startBy: string;
  /** For "before" actions: the moment and its date. */
  moment?: { name: string; date: string };
  sources: string[];
  /** The context rules that chose or changed this action. */
  shapedBy: ContextKey[];
};

export type Strategy = {
  crowd: string;
  name: string;
  tier: Tier;
  rank: number;
  /** Who: the crowd in its own loves. */
  who: { text: string; sources: string[] };
  /** Where: the crowd's strongest metros the brand isn't in yet; `now` ones start first (capacity). */
  where: { metro: string; now: boolean; sources: string[] }[];
  /** Through what: the channel mix the budget sets. */
  through: Channel[];
  actions: Action[];
};

/** One line of "what your context changed": the fact, in the founder's words, and its sources. */
export type ContextLine = { key: ContextKey; text: string; sources: string[] };

export type StrategyResult = {
  strategies: Strategy[];
  context: ContextLine[];
  /** What code went ahead assuming where the context said nothing (no budget, no capacity…). */
  assumed: string[];
  date: string;
};

/** The agent's sourced sentences over the strategies (crowd "" for all of them). */
export type StrategyAnswer = { headline: string; lines: { crowd: string; text: string; sources: string[] }[]; assumptions: string[] };

/** One strategy run as the journey keeps it; `key` is what it was built from. */
export type StrategyRun = { key: string; result: StrategyResult; answer: StrategyAnswer; sources: SourceRef[] };
