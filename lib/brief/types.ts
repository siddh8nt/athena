import type { Motion, Tier } from "@/lib/playbook/config";

// The brand brief (§9.22): many messy inputs in, one typed brief out. Pure code, no server imports,
// so the client card and the tests can use it too.

// "inferred": Gemini read it between the lines; like Qloo and website values, it needs the founder's Yes.
export type SourceKind = "message" | "file" | "website" | "qloo" | "inferred" | "agent_guess";
export type Source = { kind: SourceKind; ref?: string };
export type Sourced<T> = { value: T; source: Source; confirmed?: boolean };
export type Stockist = { name: string; address?: string; city?: string };

export type BrandBrief = {
  name?: Sourced<string>;
  sells?: Sourced<string>;
  howBought?: Sourced<Motion[]>;
  activeCity?: Sourced<string>; // a US city, or "none yet"
  websites: Sourced<string>[];
  stockists: Sourced<Stockist>[];
  comparables: Sourced<string>[];
  competitors: Sourced<string>[];
  tierHint?: Sourced<Tier>;
  stageHint?: Sourced<"prelaunch" | "early" | "scaling">;
  notes: Sourced<string>[];
  /** The Qloo brand lookup, done once a name is known: the best match and up to 3 candidates. */
  qloo?: { looked: string; match?: { id: string; name: string }; options: { id: string; name: string; hint?: string }[] };
  /** Gemini's best guesses for required facts, applied only on "Not sure, make your best guess" or after 4 turns. */
  guesses?: Partial<{ name: string; sells: string; howBought: Motion[]; activeCity: string }>;
  /** Turns taken and ingestion calls spent (§14.5: ≤ 4 follow-ups, ≤ 6 calls). */
  turns: number;
  calls: number;
};

export type RequiredFact = "name" | "sells" | "howBought" | "activeCity";
export const REQUIRED: RequiredFact[] = ["name", "sells", "howBought", "activeCity"];

export const CAPS = { websites: 3, stockists: 200, comparables: 5, competitors: 3, notes: 10 } as const;

export const emptyBrief = (): BrandBrief => ({ websites: [], stockists: [], comparables: [], competitors: [], notes: [], turns: 0, calls: 0 });

// Typed beats file beats website beats Qloo beats a guess (§9.22). A founder's confirmation lifts any source.
const RANK: Record<SourceKind, number> = { message: 6, file: 5, website: 4, qloo: 3, inferred: 2, agent_guess: 1 };
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
  const out: BrandBrief = {
    ...brief,
    guesses: { ...brief.guesses, ...patch.guesses },
    name: pickScalar(brief.name, patch.name, "name", conflicts),
    sells: pickScalar(brief.sells, patch.sells, "sells", conflicts),
    howBought: pickScalar(brief.howBought, patch.howBought, "howBought", conflicts),
    activeCity: pickScalar(brief.activeCity, patch.activeCity, "activeCity", conflicts),
    tierHint: pickScalar(brief.tierHint, patch.tierHint, "tierHint", conflicts),
    stageHint: pickScalar(brief.stageHint, patch.stageHint, "stageHint", conflicts),
    websites: mergeList(brief.websites, patch.websites ?? [], (v) => v.toLowerCase().replace(/\/$/, ""), CAPS.websites),
    stockists: mergeList(brief.stockists, patch.stockists ?? [], (v) => norm(`${v.name} ${v.city ?? ""}`), CAPS.stockists),
    comparables: mergeList(brief.comparables, patch.comparables ?? [], norm, CAPS.comparables),
    competitors: mergeList(brief.competitors, patch.competitors ?? [], norm, CAPS.competitors),
    notes: mergeList(brief.notes, patch.notes ?? [], norm, CAPS.notes),
  };
  return { brief: out, conflicts };
}

const NEEDS_YES = new Set<SourceKind>(["qloo", "website", "inferred"]);
export const needsYes = (s: Sourced<unknown> | undefined) => !!s && !s.confirmed && NEEDS_YES.has(s.source.kind);

/**
 * The checklist (§6.2.1): which required facts still block "Build my plan", in the order Athena asks.
 * Code decides this, not the LLM; Gemini only phrases the question.
 */
export function missingRequired(brief: BrandBrief): RequiredFact[] {
  // A guess counts (it's labelled and editable); an inference from Qloo or the website needs the founder's Yes.
  const filled = (s: Sourced<string | Motion[]> | undefined) => {
    if (!s) return false;
    const v = s.value;
    if (Array.isArray(v) ? v.length === 0 : !v.trim()) return false;
    return s.confirmed || !NEEDS_YES.has(s.source.kind);
  };
  return REQUIRED.filter((f) => !filled(brief[f]));
}

/** Ready when nothing required is missing. */
export const ready = (brief: BrandBrief) => missingRequired(brief).length === 0;
