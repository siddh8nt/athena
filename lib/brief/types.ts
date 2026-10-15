import type { Motion, Tier } from "@/lib/playbook/config";
import type { RetailCategory } from "@/lib/stops/retailers";

// The brand brief (§9.22): many messy inputs in, one typed brief out. Pure code, no server imports,
// so the client card and the tests can use it too.

// "web": found by Athena's own research (Google Search through Gemini); ref is the page. "inferred": Gemini
// read it between the lines. Every value shows its source, and the founder corrects anything in plain words.
// "pasted": the summary the founder brought from their own AI assistant (§23.2 step 3e).
export type SourceKind = "message" | "file" | "pasted" | "website" | "web" | "qloo" | "inferred" | "agent_guess";
/** at: where inside the source ("slide 4", "Summary!A2", a page), when the fact came from the founder's files or site (§23.2 step 4). */
export type Source = { kind: SourceKind; ref?: string; at?: string };
export type Sourced<T> = { value: T; source: Source; confirmed?: boolean };
export type Stockist = { name: string; address?: string; city?: string };

/** Something the founder marked wrong: the graph node's id, and what it was in plain words ("Whole Foods as a stockist"). */
export type Wrong = { key: string; text: string };

export type BrandBrief = {
  name?: Sourced<string>;
  sells?: Sourced<string>;
  /** How people buy it, in the agent's own words ("own site and Amazon, plus ~40 grocers in LA"). */
  channels?: Sourced<string>;
  /** The same, as the plan's growth motions (the agent reasons from channels to these). */
  howBought?: Sourced<Motion[]>;
  activeCity?: Sourced<string>; // a US city, or "none yet"; v3.0: optional, asked only at the Where stop
  /** v3.0 (§6.2.1 step 4): Athena's read of how it mostly sells, confirmed by the founder in one tap. */
  channel?: Sourced<"online" | "offline" | "both">;
  /** v3.0 (§9.23 step 1): short product traits for Qloo tag search ("tinned fish", "playful packaging"). */
  traits?: string[];
  /** v4.0 (§9.25): which kind of bigger retailer would carry it, read by the agent (picks the Next retailers list). */
  retail?: RetailCategory;
  websites: Sourced<string>[];
  stockists: Sourced<Stockist>[];
  comparables: Sourced<string>[];
  competitors: Sourced<string>[];
  tierHint?: Sourced<Tier>;
  stageHint?: Sourced<"prelaunch" | "early" | "scaling">;
  notes: Sourced<string>[];
  /** v5 (§23.2 step 7c): cities the founder added on the Brand Graph, each resolved through the place resolver. */
  cities?: Sourced<{ id: string; name: string }>[];
  /**
   * v5 (§23.2 step 7c): what the founder marked wrong on the Brand Graph. Every agent reads it as a source, so
   * nothing here is inferred again; `key` is the graph node's id, so a source re-adding it is left out by the merge.
   */
  wrong?: Wrong[];
  /** The Qloo brand lookup, done once a name is known: the best match and up to 3 candidates. */
  qloo?: { looked: string; match?: { id: string; name: string }; options: { id: string; name: string; hint?: string }[]; about?: string };
  /** Athena's web research on the brand: a dossier with the pages it rests on. Done once per brand name. */
  research?: { for: string; dossier: string; sources: { title?: string; uri?: string }[]; queries: string[] };
  /** Brands with a similar customer, proposed by the agent; read in Qloo when Qloo doesn't know the brand itself. */
  proxies?: string[];
  /** The taste glimpse from Qloo (taste.ts): what the crowd loves and where that taste concentrates. */
  taste?: {
    for: string;
    signal: { id: string; name: string }[];
    proxy: boolean;
    loves: { name: string; kind: string }[];
    tags: string[];
    cities: { name: string; venue: string }[];
    calls: number;
    callIds: string[];
  };
  /** How many times research ran for this brief (≤ MAX_RESEARCH). */
  researched?: number;
  /** Questions Athena has already asked, so it never asks the same thing twice. */
  asked?: string[];
  /** Turns taken and ingestion calls spent (§14.5: ≤ 4 follow-ups, ≤ 6 calls). */
  turns: number;
  calls: number;
};

export type RequiredFact = "name" | "sells" | "howBought" | "activeCity";
/**
 * v3.0 (§6.2.1 step 6): the conversation needs only the name and the product. The channel and the growth types are
 * one-tap choices after it, checked by the journey; the city is asked at the Where stop only when a pick needs it.
 */
export const REQUIRED: RequiredFact[] = ["name", "sells"];

export const CAPS = { websites: 3, stockists: 200, comparables: 5, competitors: 3, notes: 10, cities: 8, wrong: 40 } as const;

export const emptyBrief = (): BrandBrief => ({ websites: [], stockists: [], comparables: [], competitors: [], notes: [], turns: 0, calls: 0 });

// Typed beats file beats website beats Qloo beats a guess (§9.22). A founder's confirmation lifts any source.
const RANK: Record<SourceKind, number> = { message: 6, file: 5, pasted: 5, website: 4, web: 4, qloo: 3, inferred: 2, agent_guess: 1 };
const rank = (s: Sourced<unknown>) => RANK[s.source.kind] + (s.confirmed ? 10 : 0);

export type Conflict = { field: keyof BrandBrief; kept: Sourced<unknown>; dropped: Sourced<unknown> };

function pickScalar<T>(a: Sourced<T> | undefined, b: Sourced<T> | undefined, field: keyof BrandBrief, out: Conflict[]) {
  if (!a) return b;
  if (!b) return a;
  const winner = rank(b) >= rank(a) ? b : a;
  const loser = winner === a ? b : a;
  if (JSON.stringify(a.value) !== JSON.stringify(b.value) && loser.source.kind !== "agent_guess") {
    out.push({ field, kept: winner, dropped: loser });
  }
  return winner;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Each listed item's key: the Brand Graph's node id for it, and what a "wrong" mark names (§23.2 step 7c). */
export const itemKey = {
  comparable: (v: string) => `comparable:${norm(v)}`,
  competitor: (v: string) => `competitor:${norm(v)}`,
  stockist: (v: Stockist) => `stockist:${norm(`${v.name} ${v.city ?? ""}`)}`,
  city: (name: string) => `city:${norm(name)}`,
  note: (v: string) => `note:${norm(v)}`,
  /** A fact-strip anchor on the graph ("premium", "sold online"): which field, and its value. */
  trait: (field: "tierHint" | "stageHint" | "channel" | "activeCity", value: string) => `trait:${field}:${norm(value)}`,
};

/**
 * Leaves out what the founder marked wrong, unless it's the founder's own words again: a message re-adding it
 * wins (and clears the mark), a file, a site or a guess doesn't.
 */
function unwronged<T>(items: Sourced<T>[] | undefined, key: (v: T) => string, wrong: Set<string>, cleared: Set<string>) {
  return (items ?? []).filter((x) => {
    const k = key(x.value);
    if (!wrong.has(k)) return true;
    if (x.source.kind === "message") cleared.add(k);
    return x.source.kind === "message";
  });
}

const wrongs = (v: unknown): Wrong[] =>
  Array.isArray(v) ? v.filter((w): w is Wrong => !!w && typeof w.key === "string" && typeof w.text === "string").map((w) => ({ key: w.key.slice(0, 160), text: w.text.slice(0, 200) })) : [];

function mergeList<T>(a: Sourced<T>[], b: Sourced<T>[], key: (v: T) => string, cap: number) {
  const seen = new Map<string, Sourced<T>>();
  for (const item of [...a, ...b]) {
    const k = key(item.value);
    if (!k) continue;
    const prev = seen.get(k);
    if (!prev || rank(item) > rank(prev)) seen.set(k, item);
  }
  return [...seen.values()].slice(0, cap);
}

/** Merges a patch into the brief. Conflicts are returned so the card can show them, never resolved silently. */
export function mergeBrief(brief: BrandBrief, patch: Partial<BrandBrief>): { brief: BrandBrief; conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];
  const marked = [...wrongs(brief.wrong), ...wrongs(patch.wrong)];
  const wrong = new Set(marked.map((w) => w.key));
  const cleared = new Set<string>();
  const comparables = unwronged(patch.comparables, itemKey.comparable, wrong, cleared);
  const competitors = unwronged(patch.competitors, itemKey.competitor, wrong, cleared);
  const stockists = unwronged(patch.stockists, itemKey.stockist, wrong, cleared);
  const cities = unwronged(patch.cities, (v) => itemKey.city(v.name), wrong, cleared);
  const notes = unwronged(patch.notes, itemKey.note, wrong, cleared);
  // A scalar marked wrong isn't taken again from a file, a site or a guess; the founder's own words still win.
  const guard = <F extends "tierHint" | "stageHint" | "channel" | "activeCity">(field: F) => {
    const v = patch[field] as Sourced<string> | undefined;
    return v ? (unwronged([v], (x) => itemKey.trait(field, x), wrong, cleared)[0] as BrandBrief[F]) : undefined;
  };
  const scalars = { tierHint: guard("tierHint"), stageHint: guard("stageHint"), channel: guard("channel"), activeCity: guard("activeCity") };
  const proxies = patch.proxies?.filter((p) => !wrong.has(itemKey.comparable(p)));
  const kept = [...new Map(marked.filter((w) => !cleared.has(w.key)).map((w) => [w.key, w])).values()].slice(-CAPS.wrong);
  const out: BrandBrief = {
    ...brief,
    name: pickScalar(brief.name, patch.name, "name", conflicts),
    sells: pickScalar(brief.sells, patch.sells, "sells", conflicts),
    channels: pickScalar(brief.channels, patch.channels, "channels", conflicts),
    channel: pickScalar(brief.channel, scalars.channel, "channel", conflicts),
    traits: patch.traits?.length ? patch.traits.slice(0, 6) : brief.traits,
    retail: patch.retail ?? brief.retail,
    howBought: pickScalar(brief.howBought, patch.howBought, "howBought", conflicts),
    activeCity: pickScalar(brief.activeCity, scalars.activeCity, "activeCity", conflicts),
    tierHint: pickScalar(brief.tierHint, scalars.tierHint, "tierHint", conflicts),
    stageHint: pickScalar(brief.stageHint, scalars.stageHint, "stageHint", conflicts),
    websites: mergeList(brief.websites, patch.websites ?? [], (v) => v.toLowerCase().replace(/\/$/, ""), CAPS.websites),
    stockists: mergeList(brief.stockists, stockists, (v) => norm(`${v.name} ${v.city ?? ""}`), CAPS.stockists),
    comparables: mergeList(brief.comparables, comparables, norm, CAPS.comparables),
    competitors: mergeList(brief.competitors, competitors, norm, CAPS.competitors),
    notes: mergeList(brief.notes, notes, norm, CAPS.notes),
    ...(brief.cities?.length || cities.length ? { cities: mergeList(brief.cities ?? [], cities.filter((c) => typeof c.value?.id === "string" && typeof c.value.name === "string"), (v) => norm(v.name), CAPS.cities) } : {}),
    ...(kept.length ? { wrong: kept } : {}),
    proxies: proxies?.length ? proxies.slice(0, 5) : brief.proxies,
  };
  if (!kept.length) delete out.wrong;
  return { brief: out, conflicts };
}

/**
 * The guardrail (§6.2.1): which required facts still block "Build my plan". The agent decides what to ask;
 * code only checks the four facts are there. Researched and guessed values count: each shows its source and
 * the founder can correct it in plain words.
 */
export function missingRequired(brief: BrandBrief): RequiredFact[] {
  const filled = (s: Sourced<string | Motion[]> | undefined) => {
    if (!s) return false;
    const v = s.value;
    return Array.isArray(v) ? v.length > 0 : !!v.trim();
  };
  return REQUIRED.filter((f) => !filled(brief[f]));
}

/** Ready when nothing required is missing. */
export const ready = (brief: BrandBrief) => missingRequired(brief).length === 0;
