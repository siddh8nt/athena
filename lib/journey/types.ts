import type { Galaxy } from "@/lib/taste/galaxy";
import type { GraphState } from "@/lib/graph/edit";
import type { TeamState } from "@/lib/team/types";
import type { Calendar, FitsAnswer, FitsResult, SourceRef } from "@/lib/fits/types";
import type { Geography } from "@/lib/geo/types";
import type { StrategyRun } from "@/lib/strategy/types";
import type { LiveFact } from "@/lib/knowledge/types";
import type { SeedInput } from "@/lib/taste/seed";
import type { Channel, GrowthType, StopId } from "./growth";

// What the journey's client and server share (PRD §6.2.2, §13). Pure types, no server imports.

export type Ref = { id: string; name: string };
export type Love = { name: string; kind: "brand" | "artist" | "TV" | "film" | "podcast" | "book" };

/** One crowd as the founder sees it (§9.23 step 5). */
export type CrowdCard = {
  id: string;
  /** Named after two things it loves (§23.8 a): "Liquid I.V. and Rachel Hollis fans". */
  name: string;
  /** For mentions after the first: "the Liquid I.V. crowd". Absent on crowds named before §23.8. */
  handle?: string;
  /** The members the name is after, by their full names. Absent on crowds named before §23.8. */
  after?: string[];
  /** What they share, in one sentence: Athena's read, never a measured fact. */
  shared?: string;
  main: boolean;
  /** What this crowd loves, strongest first, across domains. */
  loves: Love[];
  /** The entities that stand for this crowd in later stops. */
  signal: Ref[];
  /** Its brand members, strongest first: Markets scores each city on them (§9.3, v4.0). */
  brands?: Ref[];
  skew?: { age: Record<string, number>; gender: Record<string, number>; clear: boolean };
  cities: { metro: string; name: string; venue: string; venues: number }[];
  size: number;
  /** Hennig's stability across resamples of the probes (0–1, v4.0). */
  stability?: number;
  /** Members at the crowd's core: placed more surely than shuffled data allows (v4.0). */
  core?: number;
  /** Not a measured crowd: the group next to them that fills Watch when fewer than three held (§23.5 c). */
  nearMiss?: boolean;
  /** A near-miss group's members by Qloo id: they aren't a crowd of the Galaxy, so its nodes don't name them. */
  members?: string[];
};

/** The near-miss group's label, wherever it appears (§23.5 c). */
export const NEAR_MISS_LABEL = "Next to your crowds, not yours yet";

/**
 * One taste axis (§9.27, v4.0): a direction the measured graph's landmarks pull along, from a non-negative
 * factorisation of U. `load` is each entity's share of its taste on this axis (0–1), by Qloo id.
 */
export type TasteAxisCard = { id: string; name: string; named: boolean; top: Ref[]; load: Record<string, number> };

/** Where two crowds meet (§9.28): the entities both love, with each side's percentile and the bridge score. */
export type CrowdMeeting = { a: string; b: string; items: { id: string; name: string; a: number; b: number; score: number }[] };

/** Slider positions per axis: −2 (much less) to 2 (much more); 0 or absent is neutral. */
export type Lean = Record<string, number>;

export type Reaction = "us" | "partly" | "not_us";

/** One entity the founder marked in the Taste Galaxy: "us" joins the plan's signal, "not_us" is left out (v4.0). */
export type Pin = { name: string; pin: "us" | "not_us" };

export type CrowdsResult = {
  /** What the graph started from, in plain words, for "How I read it". */
  seed: { brand?: Ref; lookalikes: Ref[]; tags: Ref[]; missing: string[] };
  crowds: CrowdCard[];
  calls: number;
  callIds: string[];
  /** When the seed had nothing Qloo knows: the journey carries on without crowds. */
  empty?: boolean;
  /** The measured taste graph behind the crowds, for the Taste Galaxy (v4.0). */
  galaxy?: Galaxy;
  /** Entities the founder probed (click to probe, §13.11), in order. */
  probes?: string[];
  /** The graph's taste axes, strongest first (§9.27). Absent when the graph was too thin to factorise. */
  axes?: TasteAxisCard[];
  /** Where the main crowd meets each other crowd (§9.28), read from the measured graph. */
  meetings?: CrowdMeeting[];
};

export type CrowdsEvent = { type: "status"; text: string } | { type: "graph"; galaxy: Galaxy } | { type: "result"; result: CrowdsResult };

/** The journey's state, held by the client (stateless server, like the brief). */
export type Journey = {
  channel?: Channel;
  /** The growth question as the founder answered it (§23.2 step 8.1a), read by the team as a fact. */
  told?: { question: string; answer: string };
  /** The founder's answers on the dashboard (§23.2 step 8.4h), by question id; "" is skipped. */
  inputs?: Record<string, string>;
  growth: GrowthType[];
  stop: StopId;
  done: StopId[];
  crowds?: CrowdsResult;
  /** The product input those crowds were built from, so a changed product rebuilds them. */
  crowdsFor?: string;
  /** The seed the Analyst chose and measured them from, so later runs read the same cached crowds. */
  crowdsSeed?: SeedInput;
  /** The crowd the later stops follow: the Win first crowd (§23.2 step 6f). */
  crowdId?: string;
  /** Retired (§23.2 step 6f: every top fit gets its own strategy, so there's no crowd to choose). Older saves carry it; it's ignored. */
  crowdChosen?: boolean;
  /** Reactions and pins are gone (§23.2 step 5e: taste is Qloo's job); kept empty so older saves still load. */
  reactions: Record<string, Reaction>;
  pins?: Record<string, Pin>;
  /** The founder's knowledge base as onboarding left it (§23.2 step 4), for the fits run. */
  facts?: LiveFact[];
  /** The raw facts behind the notes (§23.2 step 8.2a): each note's sources, and what a re-synthesis reads. */
  raw?: LiveFact[];
  /** The most valuable fits (§23.2 step 5), with the inputs they were ranked from. */
  fits?: FitsRun;
  /** A strategy for every most valuable fit (§23.2 step 6), built from the fits run above and the founder's context. */
  strategy?: StrategyRun;
  /** With New crowd plus other picks: do the other picks target the current crowd or the new one (§7.8)? */
  crowdTarget?: "current" | "new";
  /** The founder's taste-axis sliders (§9.27): they re-rank the current stop's list. */
  lean?: Lean;
  city?: string;
  /** The Brand Graph's edits (§23.2 step 7): hidden nodes, the edit log with Undo, and the runs held until re-run. */
  graph?: GraphState;
  /** Athena's team (§23.2 step 8): the goals, each specialist's work and the founder's outcome marks. */
  team?: TeamState;
};

/** One fits run as the journey keeps it; `key` is what it was ranked from. */
export type FitsRun = {
  key: string;
  fits: FitsResult;
  calendar: Calendar;
  answer: FitsAnswer;
  sources: SourceRef[];
  /** Each crowd's strongest metros by taste-weighted reach, from the run's geography, for the strategies' where. */
  reach?: Record<string, { metro: string; people: number }[]>;
};

/** Each crowd's metros by taste-weighted reach, strongest first: the compact part of a geography the strategies read. */
export function reachOf(g?: Geography): FitsRun["reach"] {
  if (!g?.crowds.length) return undefined;
  return Object.fromEntries(g.crowds.map((c) => [c.id, [...c.reach].sort((a, b) => b.reach - a.reach).slice(0, 8).map((m) => ({ metro: m.name, people: m.people }))]));
}

/** The crowd the later stops follow once fits are ranked: the Win first crowd, whatever an older save chose (§23.2 step 6f). */
export const crowdAfterFits = (fits: FitsResult, current?: string) => fits.fits[0]?.crowd ?? current;

/** A saved journey as it loads: a crowd an older save chose by hand gives way to the Win first crowd, and a plan saved
 *  before its crowds were named ("For c0, c1 and c2" on Execute Plan) names them from the Analyst's crowds. */
export function loadedJourney(j: Journey): Journey {
  const { crowdChosen: _retired, ...rest } = j;
  const out = j.fits ? { ...rest, crowdId: crowdAfterFits(j.fits.fits, j.crowdId) } : rest;
  return namedPlan(out);
}

function namedPlan(j: Journey): Journey {
  const plan = j.team?.plan;
  const names = new Map((j.crowds?.crowds ?? []).map((c) => [c.id, c.name]));
  if (!plan || !names.size || !plan.steps?.some((s) => s.crowds.some((c) => names.has(c)))) return j;
  const steps = plan.steps.map((s) => ({ ...s, crowds: [...new Set(s.crowds.map((c) => names.get(c) ?? c))] }));
  return { ...j, team: { ...j.team!, plan: { ...plan, steps } } };
}

export const emptyJourney = (): Journey => ({ growth: [], stop: "product", done: [], reactions: {}, pins: {} });
