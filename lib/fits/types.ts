// Most valuable fits (PRD §23.2 step 5, problems 1 and 2) as the client sees them. Pure types, client-safe.

export const PARAMS = ["fit", "reach", "efficiency", "momentum", "moments", "signal"] as const;
export type Param = (typeof PARAMS)[number];

export const PARAM_LABEL: Record<Param, string> = {
  fit: "Brand fit",
  reach: "Addressable reach",
  efficiency: "Efficiency",
  momentum: "Cultural momentum",
  moments: "Moments",
  signal: "Signal strength",
};

export type Tier = "win_first" | "win_next" | "watch";
export const TIER_LABEL: Record<Tier, string> = { win_first: "Win first", win_next: "Win next", watch: "Watch" };

/** One parameter for one crowd: the measured value, its 0–1 score on a fixed scale, and what it was read from. */
export type ParamScore = { value?: number; score?: number; text: string };

/** A weight the agent moved from its default, and the founder's context it moved it for. */
export type WeightChange = { param: Param; weight: number; reason: string; sources: string[] };

/** A dated moment: when it is, how far off, and when to start (with where the lead time comes from). */
export type Moment = {
  name: string;
  kind: "retail" | "category" | "crowd" | "event";
  date: string;
  days: number;
  /** Start preparing this many days before; the basis says where that comes from. */
  lead?: { days: number; basis: string };
  /** Start by this date (date minus the lead time), when there's a lead time. */
  startBy?: string;
  /** The crowd it belongs to, for a crowd's moments. */
  crowd?: string;
  url?: string;
  detail?: string;
};

export type Horizon = "now" | "next_quarter" | "season" | "year";
export const HORIZON_LABEL: Record<Horizon, string> = { now: "Now · next 30 days", next_quarter: "Next quarter · 30–90 days", season: "This season · 3–6 months", year: "The 12-month calendar" };

/** A yearly pattern from years of pageviews: "this peaks every July". */
export type Recurring = { title: string; crowd?: string; peaks: { month: number; index: number }[]; years: number };

export type Calendar = { date: string; horizons: Record<Horizon, Moment[]>; recurring: Recurring[] };

export type Fit = {
  crowd: string;
  name: string;
  rank: number;
  tier: Tier;
  /** 0–1: the weighted mean of the parameters measured for this crowd. */
  score: number;
  params: Record<Param, ParamScore>;
  /** Why it sits in its tier, strongest first, from the numbers. */
  reasons: string[];
  /** When: its next attention peak and nearest dated moment. */
  when?: string;
  /** Parameters with nothing measured, left out of its score. */
  missing: Param[];
  /** The group next to the measured crowds, not one of them (§23.5 c): always Watch. */
  nearMiss?: boolean;
};

export type FitsResult = {
  fits: Fit[];
  weights: Record<Param, number>;
  changes: WeightChange[];
  /** Where the brand already sells, as metros left out of new reach, with their sources. */
  excluded: { metro: string; sources: string[] }[];
  date: string;
};

/** The fits run's answer (§23.2 step 5): the ranking from the math, with the agent's sourced reasons over it. */
export type FitsAnswer = {
  headline: string;
  /** Sourced sentences per crowd, and about the ranking as a whole (crowd ""). */
  reasons: { crowd: string; text: string; sources: string[] }[];
  assumptions: string[];
};

export type SourceRef = { id: string; tool: string; summary: string; callIds: string[] };
