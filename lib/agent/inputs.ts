import type { SeedInput } from "@/lib/taste/seed";
import type { Calendar, Fit, FitsResult, Horizon, Moment, Tier } from "@/lib/fits/types";
import type { FitsInput } from "./fits";

// What the fits and strategy routes read from the client (a stateless server: the journey holds its own state).
// Everything is shape-checked and cut to size; anything malformed is left out, never an error.

export const strs = (v: unknown, n: number, len = 80) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, len)).slice(0, n);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function readSeed(raw: unknown): SeedInput {
  const b = (raw ?? {}) as Record<string, unknown>;
  const brand = b.brand as { id?: unknown; name?: unknown } | undefined;
  return {
    brand: brand && typeof brand.id === "string" && typeof brand.name === "string" ? { id: brand.id.slice(0, 80), name: brand.name.slice(0, 120) } : undefined,
    comparables: strs(b.comparables, 5),
    lookalikes: strs(b.lookalikes, 5),
    traits: strs(b.traits, 5),
  };
}

export function readFacts(raw: unknown): FitsInput["facts"] {
  return (Array.isArray(raw) ? raw : [])
    .map((x) => x as { id?: unknown; text?: unknown; where?: unknown; source?: unknown })
    .filter((f) => typeof f.id === "string" && typeof f.text === "string" && f.text.trim())
    .map((f) => {
      const where = typeof f.where === "string" ? f.where.slice(0, 200) : "";
      // The file or site a fact came from; older clients only send where ("deck.pptx, slide 4").
      const source = (typeof f.source === "string" && f.source.trim() ? f.source : where.split(", ")[0] || "the founder").slice(0, 200);
      return { id: (f.id as string).slice(0, 80), text: (f.text as string).slice(0, 500), where, source };
    })
    .slice(0, 400);
}

const TIERS: Tier[] = ["win_first", "win_next", "watch"];

/** The ranking the fits run gave the client. Only what a strategy reads is kept: who, rank, tier, when, left-out metros. */
export function readFits(raw: unknown): FitsResult | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fits: Fit[] = (Array.isArray(r.fits) ? r.fits : []).slice(0, 12).flatMap((x) => {
    const f = (x ?? {}) as Record<string, unknown>;
    const crowd = str(f.crowd, 40);
    const tier = f.tier as Tier;
    const rank = num(f.rank);
    if (!crowd || !TIERS.includes(tier) || rank === undefined) return [];
    return [{ crowd, name: str(f.name, 80) || crowd, rank, tier, score: num(f.score) ?? 0, params: {} as Fit["params"], reasons: [], when: str(f.when, 200) || undefined, missing: [] }];
  });
  if (!fits.length) return undefined;
  const excluded = (Array.isArray(r.excluded) ? r.excluded : []).slice(0, 25).flatMap((x) => {
    const metro = str((x as { metro?: unknown })?.metro, 60);
    return metro ? [{ metro, sources: [] }] : [];
  });
  return { fits, weights: {} as FitsResult["weights"], changes: [], excluded, date: iso(r.date) };
}

const HORIZONS: Horizon[] = ["now", "next_quarter", "season", "year"];
const KINDS: Moment["kind"][] = ["retail", "category", "crowd", "event"];

export function readCalendar(raw: unknown, date: string): Calendar {
  const c = (raw ?? {}) as { horizons?: Record<string, unknown> };
  const moments = (v: unknown): Moment[] =>
    (Array.isArray(v) ? v : []).slice(0, 40).flatMap((x) => {
      const m = (x ?? {}) as Record<string, unknown>;
      const name = str(m.name, 120);
      const d = iso(m.date);
      if (!name || !d || !KINDS.includes(m.kind as Moment["kind"])) return [];
      return [{ name, kind: m.kind as Moment["kind"], date: d, days: num(m.days) ?? 0, startBy: iso(m.startBy) || undefined, crowd: str(m.crowd, 40) || undefined, detail: str(m.detail, 120) || undefined }];
    });
  return { date, horizons: Object.fromEntries(HORIZONS.map((h) => [h, moments(c.horizons?.[h])])) as Calendar["horizons"], recurring: [] };
}

/** Each crowd's strongest metros, as the client kept them from the fits run's geography. */
export function readReach(raw: unknown): Record<string, { metro: string; people: number }[]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out = Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .slice(0, 12)
      .map(([id, ms]) => [id.slice(0, 40), (Array.isArray(ms) ? ms : []).slice(0, 8).flatMap((x) => {
        const m = (x ?? {}) as Record<string, unknown>;
        const metro = str(m.metro, 60);
        return metro ? [{ metro, people: num(m.people) ?? 0 }] : [];
      })] as const)
      .filter(([, ms]) => ms.length),
  );
  return Object.keys(out).length ? out : undefined;
}
