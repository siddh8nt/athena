import type { Galaxy } from "@/lib/taste/galaxy";
import type { Channel, GrowthType, StopId } from "./growth";

// What the journey's client and server share (PRD §6.2.2, §13). Pure types, no server imports.

export type Ref = { id: string; name: string };
export type Love = { name: string; kind: "brand" | "artist" | "TV" | "film" | "podcast" | "book" };

/** One crowd as the founder sees it (§9.23 step 5). */
export type CrowdCard = {
  id: string;
  name: string;
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
};

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
};

export type CrowdsEvent = { type: "status"; text: string } | { type: "graph"; galaxy: Galaxy } | { type: "result"; result: CrowdsResult };

/** The journey's state, held by the client (stateless server, like the brief). */
export type Journey = {
  channel?: Channel;
  growth: GrowthType[];
  stop: StopId;
  done: StopId[];
  crowds?: CrowdsResult;
  /** The product input those crowds were built from, so a changed product rebuilds them. */
  crowdsFor?: string;
  /** The crowd the plan follows, and the founder's reactions to each. */
  crowdId?: string;
  reactions: Record<string, Reaction>;
  /** Entities the founder marked in the Taste Galaxy, by Qloo id. Absent in journeys saved before v4.0. */
  pins?: Record<string, Pin>;
  /** With New crowd plus other picks: do the other picks target the current crowd or the new one (§7.8)? */
  crowdTarget?: "current" | "new";
  city?: string;
};

export const emptyJourney = (): Journey => ({ growth: [], stop: "product", done: [], reactions: {}, pins: {} });
