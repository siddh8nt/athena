import type { BrandBrief } from "./types";

/** The Brand Knowledge Base as short facts: what the brief holds, then the notes the founder kept. */
export function briefFacts(b: BrandBrief | undefined, notes: string[]): string[] {
  if (!b) return notes.slice(0, 30);
  const list = (label: string, xs: string[]) => (xs.length ? [`${label}: ${xs.slice(0, 12).join(", ")}`] : []);
  return [
    ...(b.channels ? [`How it sells: ${b.channels.value}`] : []),
    ...list("Websites", b.websites.map((w) => w.value)),
    ...list("Stockists", b.stockists.map((s) => (s.value.city ? `${s.value.name} (${s.value.city})` : s.value.name))),
    ...list("Comparable brands", b.comparables.map((c) => c.value)),
    ...list("Competitors", b.competitors.map((c) => c.value)),
    ...list("Cities", (b.cities ?? []).map((c) => c.value.name)),
    ...(b.traits?.length ? [`Traits: ${b.traits.join(", ")}`] : []),
    ...b.notes.slice(0, 12).map((n) => n.value),
    ...notes.slice(0, 20),
  ];
}
