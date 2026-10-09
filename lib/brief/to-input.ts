import type { BrandInput } from "@/lib/agent/intake";
import type { BrandBrief } from "./types";

/** The brief → the plan's input (§9.22): Phase 2 reads only this. Stockists go as rows, never re-parsed. */
export function briefToInput(b: BrandBrief): BrandInput {
  const city = b.activeCity?.value?.trim();
  const tier = b.tierHint ? `${b.tierHint.value} price tier` : "";
  return {
    name: (b.name?.value ?? "").slice(0, 120),
    websites: b.websites.map((w) => w.value).slice(0, 3),
    description: [b.sells?.value, b.channels ? `Sold ${b.channels.value}` : "", tier, ...b.notes.map((n) => n.value)].filter(Boolean).join(". ").slice(0, 600),
    rows: b.stockists.map((s) => s.value).slice(0, 200),
    // The founder's own comparables win; otherwise, for a brand Qloo doesn't know, the proxies shown in the chat.
    comparables: (b.comparables.length ? b.comparables.map((c) => c.value) : b.taste?.proxy ? b.taste.signal.map((s) => s.name) : []).slice(0, 5),
    competitors: b.competitors.map((c) => c.value).slice(0, 3),
    city: city && !/^(none|nowhere|no)\b/i.test(city) ? city.slice(0, 60) : undefined,
    motions: b.howBought?.value,
    tierHint: b.tierHint?.value,
  };
}
