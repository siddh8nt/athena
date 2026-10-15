import type { BrandBrief } from "@/lib/brief/types";
import type { LiveFact } from "@/lib/knowledge/types";
import type { InputKey } from "./types";

// Stale flags (PRD §23.2 step 7e): every run records what it read, as the inputs it ran on. An edit holds each run
// that already ran on the inputs it ran on, and flags it when what it reads has changed: nothing re-runs silently, and
// nothing already decided is thrown away. Until step 8, the runs are the crowds, the fits, the strategies and the
// journey's stops. Pure, client-safe.

export type RunId = "crowds" | "fits" | "strategy" | "where" | "places" | "partners" | "message" | "moments" | "retailers" | "online";

/** What one run read: the brief and the founder's facts. */
export type Snapshot = { brief: BrandBrief; facts: LiveFact[] };
/** A held run: the inputs it ran on, and the edit that changed them, in plain words ("you added a comparable"). */
export type Held = Snapshot & { why: string };

const STOPS: InputKey[] = ["name", "product", "tier", "notes", "stockists", "comparables", "competitors"];

/** What each run reads (§23.2 step 7e). The fits and the strategies read the whole brief and every fact. */
export const READS: Record<RunId, InputKey[]> = {
  crowds: ["comparables"],
  fits: ["name", "product", "channel", "tier", "stage", "home", "comparables", "competitors", "stockists", "cities", "notes", "facts", "wrong"],
  strategy: ["name", "product", "channel", "tier", "stage", "home", "comparables", "competitors", "stockists", "cities", "notes", "facts", "wrong"],
  where: STOPS,
  places: STOPS,
  partners: STOPS,
  message: STOPS,
  moments: STOPS,
  retailers: ["product", "stockists", "notes"],
  online: ["product", "stockists", "notes"],
};

/** How each run is named on its flag: "Cities may change: …". */
export const RUN_LABEL: Record<RunId, string> = {
  crowds: "Crowds",
  fits: "Most valuable fits",
  strategy: "Strategies",
  where: "Cities",
  places: "Places",
  partners: "Partners",
  message: "Message",
  moments: "Moments",
  retailers: "Next retailers",
  online: "Online",
};

/** One input's value in a snapshot, as a string to compare. */
export function keyValue(s: Snapshot, key: InputKey): string {
  const b = s.brief;
  const v = (x: unknown) => JSON.stringify(x ?? null);
  switch (key) {
    case "name":
      return v(b.name?.value);
    case "product":
      return v([b.sells?.value, b.channels?.value, b.traits]);
    case "channel":
      return v(b.channel?.value);
    case "tier":
      return v(b.tierHint?.value);
    case "stage":
      return v(b.stageHint?.value);
    case "home":
      return v(b.activeCity?.value);
    case "comparables":
      return v([b.comparables.map((c) => c.value), b.proxies]);
    case "competitors":
      return v(b.competitors.map((c) => c.value));
    case "stockists":
      return v(b.stockists.map((x) => [x.value.name, x.value.city ?? ""]));
    case "cities":
      return v((b.cities ?? []).map((c) => c.value.id));
    case "notes":
      return v(b.notes.map((n) => n.value));
    case "facts":
      return v(s.facts.map((f) => [f.id, f.text]));
    case "wrong":
      return v((b.wrong ?? []).map((w) => w.key));
  }
}

/** The inputs that differ between two snapshots. */
export const changedKeys = (a: Snapshot, b: Snapshot): InputKey[] => READS.fits.filter((k) => keyValue(a, k) !== keyValue(b, k));

/**
 * After a change from `before` to `after`: each run that ran is held on the inputs it ran on when something it reads
 * now differs (its flag says why, from the latest edit), and let go when nothing it reads differs any more (an undo
 * puts it back as it was).
 */
export function settle(held: Partial<Record<RunId, Held>>, ran: RunId[], before: Snapshot, after: Snapshot, why: string): Partial<Record<RunId, Held>> {
  const out: Partial<Record<RunId, Held>> = { ...held };
  const moved = changedKeys(before, after);
  for (const run of ran) {
    const was: Snapshot = held[run] ?? before;
    const differs = READS[run].some((k) => keyValue(was, k) !== keyValue(after, k));
    if (!differs) delete out[run];
    else if (READS[run].some((k) => moved.includes(k))) out[run] = { brief: was.brief, facts: was.facts, why };
  }
  return out;
}

/** The flag a held run shows (§13.12): "Cities may change: you added a comparable." */
export const staleLine = (run: RunId, h: Held) => `${RUN_LABEL[run]} may change: ${h.why}.`;
