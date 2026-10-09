import type { Channel, GrowthType, StopId } from "./growth";

// What the journey's client and server share (PRD §6.2.2, §13). Pure types, no server imports.

export type Ref = { id: string; name: string };
export type Love = { name: string; kind: "brand" | "artist" | "TV" };

/** One crowd as the founder sees it (§9.23 step 5). */
export type CrowdCard = {
  id: string;
  name: string;
  main: boolean;
  /** What this crowd loves, strongest first, across domains. */
  loves: Love[];
  /** The entities that stand for this crowd in later stops. */
  signal: Ref[];
  skew?: { age: Record<string, number>; gender: Record<string, number>; clear: boolean };
  cities: { metro: string; name: string; venue: string; venues: number }[];
  size: number;
};

export type Reaction = "us" | "partly" | "not_us";

export type CrowdsResult = {
  /** What the graph started from, in plain words, for "How I read it". */
  seed: { brand?: Ref; lookalikes: Ref[]; tags: Ref[]; missing: string[] };
  crowds: CrowdCard[];
  calls: number;
  callIds: string[];
  /** When the seed had nothing Qloo knows: the journey carries on without crowds. */
  empty?: boolean;
};

export type CrowdsEvent = { type: "status"; text: string } | { type: "result"; result: CrowdsResult };

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
  /** With New crowd plus other picks: do the other picks target the current crowd or the new one (§7.8)? */
  crowdTarget?: "current" | "new";
  city?: string;
};

export const emptyJourney = (): Journey => ({ growth: [], stop: "product", done: [], reactions: {} });
