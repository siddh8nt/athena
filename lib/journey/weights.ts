import { GROWTH, type GrowthType, type StopId } from "./growth";
import type { CrowdCard, Lean, Pin, Reaction, TasteAxisCard } from "./types";

// The founder's reactions become the plan's signal (PRD §9.23 step 7): one weighted list of entities sent to Qloo,
// plus the entities to leave out. Pure, shared by the client and the server.

/** Starting weights [DECISION; tune]. The chosen crowd leads; a "Partly" crowd is blended in at half its weight. */
export const WEIGHT = { chosen: 3, partly: 1.5 } as const;
/** How many of a "Partly" crowd's entities join the signal, and how many of a "Not us" crowd's are left out. */
const PARTLY_TAKE = 6;
const NOT_US_TAKE = 8;
/** The API route keeps at most this many signal entities. */
export const MAX_SIGNAL = 24;

export type WeightedRef = { id: string; name: string; weight: number };
export type CrowdSignal = { name: string; signal: WeightedRef[]; exclude: string[]; brands?: { id: string; name: string }[] };

/**
 * The signal for one crowd under the founder's reactions. With no "Partly" crowds every weight is equal, so Qloo gets
 * the same plain request as before (and the same cached answer). "Not us" crowds never join and their strongest
 * entities are excluded from results. Entities pinned "us" in the Taste Galaxy lead at the chosen crowd's weight;
 * entities pinned "not us" never join and are excluded.
 */
export function crowdSignal(crowds: CrowdCard[], chosenId: string, reactions: Record<string, Reaction>, pins: Record<string, Pin> = {}): CrowdSignal | undefined {
  const chosen = crowds.find((c) => c.id === chosenId);
  if (!chosen) return undefined;
  const pinned = Object.entries(pins);
  const seen = new Set<string>(pinned.filter(([, p]) => p.pin === "not_us").map(([id]) => id));
  const signal: WeightedRef[] = [];
  const add = (refs: { id: string; name: string }[], weight: number) => {
    for (const r of refs) if (!seen.has(r.id) && signal.length < MAX_SIGNAL) (seen.add(r.id), signal.push({ ...r, weight }));
  };
  add(pinned.filter(([, p]) => p.pin === "us").map(([id, p]) => ({ id, name: p.name })), WEIGHT.chosen);
  add(chosen.signal, WEIGHT.chosen);
  for (const c of crowds) if (c.id !== chosenId && reactions[c.id] === "partly") add(c.signal.slice(0, PARTLY_TAKE), WEIGHT.partly);
  const inSignal = new Set(signal.map((s) => s.id));
  const exclude = [
    ...pinned.filter(([, p]) => p.pin === "not_us").map(([id]) => id),
    ...crowds.filter((c) => c.id !== chosenId && reactions[c.id] === "not_us").flatMap((c) => c.signal.slice(0, NOT_US_TAKE).map((s) => s.id)),
  ].filter((id) => !inSignal.has(id));
  // Equal weights read the same as no weights; keep them at 1 so requests (and cache keys) match the unweighted ones.
  const equal = signal.every((s) => s.weight === signal[0]?.weight);
  // Markets scores cities on the chosen crowd's brands (§9.3, v4.0), less any the founder marked "not us".
  const notUs = new Set(pinned.filter(([, p]) => p.pin === "not_us").map(([id]) => id));
  const brands = chosen.brands?.filter((b) => !notUs.has(b.id));
  return { name: chosen.name, signal: equal ? signal.map((s) => ({ ...s, weight: 1 })) : signal, exclude: [...new Set(exclude)], ...(brands?.length ? { brands } : {}) };
}

/**
 * Slider steps (§9.27) [DECISION; tune]: at position p an entity's weight is multiplied by 1 + α_p × its load on the
 * axis, so "more" pulls toward the axis and "less" pushes away; an entity off the axis keeps its weight.
 */
export const LEAN_ALPHA: Record<number, number> = { [-2]: -0.8, [-1]: -0.4, 0: 0, 1: 1, 2: 2 };
export const LEAN_STEPS = [-2, -1, 0, 1, 2] as const;
export const LEAN_LABEL: Record<number, string> = { [-2]: "Much less", [-1]: "Less", 0: "As measured", 1: "More", 2: "Much more" };

/** True when every slider is neutral. */
export const neutralLean = (lean?: Lean) => !lean || Object.values(lean).every((p) => !p);

/**
 * The signal under the sliders: w × Π over axes of (1 + α_p × load), rescaled so the largest weight is 10 (the API's
 * ceiling) and no weight falls to 0. Neutral sliders return the signal unchanged.
 */
export function leanSignal<T extends { id: string; weight: number }>(signal: T[], axes: TasteAxisCard[] | undefined, lean: Lean | undefined): T[] {
  if (!axes?.length || neutralLean(lean)) return signal;
  const raw = signal.map((s) => {
    let f = 1;
    for (const a of axes) {
      const p = lean?.[a.id] ?? 0;
      if (p) f *= 1 + (LEAN_ALPHA[p] ?? 0) * (a.load[s.id] ?? 0);
    }
    return Math.max(0.01, s.weight * f);
  });
  const top = Math.max(...raw);
  return signal.map((s, i) => ({ ...s, weight: Math.max(0.05, Math.round((raw[i] / top) * 10 * 100) / 100) }));
}

/** The "which crowd?" answer (§7.8): when New crowd is combined with other picks, do those target the current crowd or the new one? */
export type CrowdTarget = "current" | "new";

/**
 * Which crowd a stop follows. Normally the one the founder chose. With New crowd plus other picks and the answer
 * "current", the stops that only New crowd asked for follow the new crowd, and every other stop follows the main one.
 */
export function crowdIdForStop(stop: StopId, opts: { growth: GrowthType[]; crowds: CrowdCard[]; crowdId?: string; target?: CrowdTarget; reactions: Record<string, Reaction> }): string | undefined {
  const { growth, crowds, crowdId, target } = opts;
  if (!growth.includes("new_crowd") || target !== "current") return crowdId;
  const others = growth.filter((g) => g !== "new_crowd");
  const otherStops = new Set(others.flatMap((g) => GROWTH[g].stops));
  if (GROWTH.new_crowd.stops.includes(stop) && !otherStops.has(stop)) return crowdId;
  const current = crowds.find((c) => opts.reactions[c.id] === "us" && c.id !== crowdId) ?? crowds.find((c) => c.main && opts.reactions[c.id] !== "not_us");
  return current?.id ?? crowdId;
}
