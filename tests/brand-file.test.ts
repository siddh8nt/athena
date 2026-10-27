import { describe, expect, it } from "vitest";
import { emptyJourney, type CrowdCard, type Journey } from "@/lib/journey/types";
import type { BrandBrief } from "@/lib/brief/types";
import type { CrowdPage } from "@/lib/team/page";
import type { GrowthPlan, TeamState, Work } from "@/lib/team/types";
import { brandFile } from "@/lib/workspace/brand-file";

// §23.6 f: athena-brand.md holds the brief, crowds, Athena's order and the open tasks, in plain words for an AI
// assistant, with no ids; an empty workspace still gives a valid file that says what's missing.

const src = { kind: "message" as const };
const brief = {
  name: { value: "Brightland", source: src },
  sells: { value: "olive oil", source: src },
  activeCity: { value: "Los Angeles", source: src },
  websites: [{ value: "brightland.co", source: src }],
  stockists: [],
  comparables: [{ value: "Graza", source: src }],
  competitors: [],
  notes: [{ value: "We never discount.", source: src }],
  turns: 0,
  calls: 0,
} as BrandBrief;

const crowd = (name: string, main: boolean, near = false) =>
  ({ id: name, name, main, loves: [{ name: "Diaspora Co.", kind: "brand" }], signal: [], cities: [{ metro: "la", name: "Los Angeles", venue: "", venues: 3 }], size: 40, ...(near ? { nearMiss: true } : {}) }) as CrowdCard;

const pageOf = (names: [string, string][]): CrowdPage =>
  ({ at: 1, tabs: [], across: { sources: [], method: "", sections: [{ id: "list", title: "List", blocks: [{ type: "names", label: "", groups: [{ label: "", names: names.map(([item, name]) => ({ item, name, note: `${name}: loved by Coastal cooks` })) }] }] }] } }) as unknown as CrowdPage;

const plan = {
  headline: "Win Los Angeles's home cooks first.",
  steps: [{ n: 1, what: "Pitch the shops your crowd already buys from", crowds: ["Coastal cooks"], phase: "win_first", lines: [{ kind: "where", text: "Fig Larder and Salt Shelf in Silver Lake" }], depends: [] }],
  disagreements: [],
  open: ["What's your wholesale price?"],
  from: {},
  at: 1,
} as GrowthPlan;

const team: TeamState = {
  goals: [],
  works: { rep: { page: pageOf([["venue:fig larder", "Fig Larder"], ["venue:salt shelf", "Salt Shelf"]]) } as unknown as Work },
  outcomes: [],
  plan,
  answered: [{ id: "q", agent: "rep", question: "Who buys it?", answer: "Home cooks who love good pantry staples." }],
} as unknown as TeamState;

const journey: Journey = { ...emptyJourney(), crowds: { crowds: [crowd("Coastal cooks", true), crowd("Next door", false, true)] } as unknown as Journey["crowds"], team };

describe("the brand context file (§23.6 f)", () => {
  const md = brandFile({ brief, journey }, Date.UTC(2026, 9, 27));

  it("opens with the brand and a line for the assistant", () => {
    expect(md.startsWith("# Brightland: brand context from Athena\n")).toBe(true);
    expect(md).toContain("For an AI assistant:");
    expect(md).toContain("Written 2026-10-27");
  });

  it("holds the brief, the founder's answers, the crowds, Athena's order and the open tasks", () => {
    expect(md).toContain("- Sells: olive oil");
    expect(md).toContain("- Home city: Los Angeles");
    expect(md).toContain("We never discount.");
    expect(md).toContain("Who buys it? Home cooks");
    expect(md).toContain("### Coastal cooks (the main crowd)");
    expect(md).toContain("Also loves: Diaspora Co.");
    expect(md).not.toContain("Next door"); // a near-miss group isn't a crowd
    expect(md).toContain("1. Pitch the shops your crowd already buys from (Win first: Coastal cooks)");
    expect(md).toContain("   - Fig Larder and Salt Shelf in Silver Lake");
    expect(md).toContain("- What's your wholesale price?");
    expect(md).toMatch(/## Open tasks[\s\S]*Fig Larder[\s\S]*Salt Shelf/);
  });

  it("names things in words, never by id", () => {
    expect(md).not.toMatch(/venue:|partner:|creator:|athena:\/\//);
  });

  it("is a valid file for an empty workspace", () => {
    const empty = brandFile({});
    expect(empty).toContain("# The brand: brand context from Athena");
    expect(empty).toContain("Athena hasn't been told about the brand yet.");
    expect(empty).toContain("hasn't written the plan yet");
  });
});
