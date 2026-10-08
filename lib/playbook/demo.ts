import type { CategoryId, Motion, Tier } from "./config";

// Demo brands (PRD §7.7). Accounts come from the brand's public stockist list in proof/stockists,
// resolved live against Qloo (and cached), never from stored Qloo data.

export type DemoBrand = {
  slug: string;
  name: string;
  blurb: string;
  category: CategoryId;
  tier: Tier;
  motions: Motion[];
  comparables: string[];
  competitors: string[];
  homeMetro?: string;
  targetMetro: string;
  stockists?: { file: string; metro: string };
  description: string;
};

export const DEMO_BRANDS: DemoBrand[] = [
  {
    slug: "brightland",
    name: "Brightland",
    blurb: "Venues · partners · message",
    category: "G1",
    tier: "premium",
    motions: ["venue", "retail"],
    comparables: [],
    competitors: [],
    homeMetro: "nyc",
    targetMetro: "la",
    stockists: { file: "brightland.csv", metro: "New York" },
    description: "Premium olive oil and pantry goods, sold through independent grocers, gift shops and cafés.",
  },
  {
    slug: "timeleft",
    name: "Timeleft",
    blurb: "Launch cities · moments",
    category: "A1",
    tier: "mass",
    motions: ["city_launch"],
    comparables: ["Meetup", "Hinge", "Bumble"],
    competitors: [],
    targetMetro: "chicago",
    description: "An app that sets up weekly dinners with strangers, launching city by city.",
  },
  {
    slug: "master-dynamic",
    name: "Master & Dynamic",
    blurb: "Partners · moments",
    category: "T1",
    tier: "premium",
    motions: ["partnership", "retail"],
    comparables: ["Marshall Headphones", "Sonos"],
    competitors: [],
    targetMetro: "la",
    description: "Premium headphones and speakers, grown through brand collaborations and design-led retail.",
  },
];

export function demoBySlug(slug: string): DemoBrand | undefined {
  return DEMO_BRANDS.find((b) => b.slug === slug);
}
