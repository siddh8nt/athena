import { GROWTH, type GrowthType, type StopId } from "./growth";
import type { CrowdCard, Pin, Reaction } from "./types";

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
