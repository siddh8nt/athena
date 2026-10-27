import { describe, expect, it } from "vitest";
import { emptyJourney, type Journey } from "@/lib/journey/types";
import type { CrowdPage } from "@/lib/team/page";
import type { GrowthPlan, TeamState, Work } from "@/lib/team/types";
import type { PromoRead } from "@/lib/agent/promoter";
import { rowHref, thisWeek, weekEmpty, weekText } from "@/lib/workspace/week";
import { weekHtml, weekSubject } from "@/lib/workspace/week-email";

// §23.6 j: This week, at the top of Overview, in the Monday email and from the MCP prompt: pitches with no reply after
// their wait, what falls due in the next seven days, and the next events, each row once, each line linking to its row.

const PITCHED = Date.UTC(2026, 9, 20, 15);
const event = (id: string, name: string, date: string, more: Partial<PromoRead["events"][number]> = {}) =>
  ({ id, name, kind: "festival", date, url: `https://example.com/${id}`, site: "example.com", metroId: "la", city: "Los Angeles", crowds: ["c1"], why: "Its crowd, in one place.", formats: ["booth"], ...more }) as PromoRead["events"][number];

const promo = {
  crowds: [{ id: "c1", name: "Coastal cooks" }],
  events: [
    event("event:smorgasburg", "Smorgasburg LA", "2026-11-15", { venue: "ROW DTLA", applyBy: "2026-11-01", applyUrl: "https://example.com/apply" }),
    event("event:fair", "Coastal fair", "2026-12-05"),
    event("event:market", "Night market", "2026-12-12"),
    event("event:expo", "Food expo", "2027-01-20"),
    event("event:past", "Past fair", "2026-10-01"),
  ],
  moments: [{ id: "moment:tinned", name: "Tinned Fish Day", date: "2026-11-02", kind: "cultural", site: "nationaltoday.com", url: "https://example.com/tinned", why: "The day its crowd talks about it.", crowds: ["c1"] }],
  brand: { name: "Brightland", product: "olive oil" },
  launch: { window: [30, 90], text: "in one to three months" },
} as unknown as PromoRead;

const pageOf = (names: [string, string][]): CrowdPage =>
  ({ at: 1, tabs: [], across: { sources: [], method: "", sections: [{ id: "list", title: "List", blocks: [{ type: "names", label: "", groups: [{ label: "", names: names.map(([item, name]) => ({ item, name, note: `${name}: loved by Coastal cooks` })) }] }] }] } }) as unknown as CrowdPage;

const team = {
  goals: [],
  works: {
    rep: { page: pageOf([["venue:fig larder", "Fig Larder"], ["venue:olive bar", "Olive Bar"]]) } as unknown as Work,
    promoter: { page: pageOf([["event:smorgasburg", "Smorgasburg LA"], ["event:fair", "Coastal fair"]]), shared: { promo } } as unknown as Work,
  },
  outcomes: [
    { item: "venue:fig larder", agent: "rep", kind: "venue", name: "Fig Larder", mark: "pitched", at: PITCHED },
    { item: "venue:olive bar", agent: "rep", kind: "venue", name: "Olive Bar", mark: "pitched", at: Date.UTC(2026, 9, 26) },
  ],
  plan: { headline: "Win Los Angeles first.", steps: [], disagreements: [], open: [], from: {}, at: 1 } as unknown as GrowthPlan,
} as unknown as TeamState;

const saved = { journey: { ...emptyJourney(), team } as Journey };
const NOW = Date.UTC(2026, 9, 28, 9); // Wednesday, October 28

describe("This week (§23.6 j)", () => {
  const w = thisWeek(saved, NOW);

  it("lists a pitch past its wait under No reply yet, and one still inside it as due when its wait runs out", () => {
    expect(w.quiet.map((l) => l.title)).toEqual(["Fig Larder"]);
    expect(w.quiet[0]).toMatchObject({ row: "venue:fig larder" });
    expect(w.quiet[0].sub).toBe("Pitched October 20, no reply after 7 days. Time to follow up.");
    expect(w.due.map((l) => l.title)).toContain("Follow up: Olive Bar");
  });

  it("lists what falls due in the next seven days, earliest first", () => {
    expect(w.due.map((l) => [l.date, l.title])).toEqual([
      ["2026-11-01", "Apply: Smorgasburg LA"],
      ["2026-11-02", "Follow up: Olive Bar"],
      ["2026-11-02", "Tinned Fish Day (a moment for Brightland)"],
    ]);
  });

  it("lists the next three events, never a past one, and no row twice", () => {
    // Smorgasburg's row is already listed by its apply-by line, so the next events start after it.
    expect(w.events.map((l) => l.title)).toEqual(["Coastal fair (Los Angeles)", "Night market (Los Angeles)", "Food expo (Los Angeles)"]);
    const rows = [...w.quiet, ...w.due, ...w.events].map((l) => l.row ?? l.key);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("links each line to its row, or to its source when it has none", () => {
    expect(w.due[0].row).toBe("event:smorgasburg");
    expect(rowHref("venue:fig larder", "https://a.example")).toBe("https://a.example/plan?tab=executive&item=venue%3Afig%20larder");
    expect(w.events.find((l) => l.title.startsWith("Night"))).toMatchObject({ url: "https://example.com/event:market" });
  });

  it("says so plainly when nothing is due", () => {
    const empty = thisWeek({}, NOW);
    expect(weekEmpty(empty)).toBe(true);
    expect(weekText(empty)).toContain("Nothing is due this week");
  });
});

describe("the Monday email (§23.6 j)", () => {
  const w = thisWeek(saved, NOW);

  it("has a subject with the brand and how much is to do", () => {
    expect(weekSubject(w)).toBe("Brightland: this week (4 to do)");
  });

  it("uses the serif heading and cards, links rows back to Athena, and escapes text", () => {
    const html = weekHtml(w, { base: "https://athena.example" });
    expect(html).toContain("Georgia");
    expect(html).toContain("border-radius:16px");
    expect(html).toContain('href="https://athena.example/plan?tab=executive&amp;item=venue%3Afig%20larder"');
    expect(html).toContain("No reply yet");
    const evil = weekHtml({ ...w, brand: "<b>x</b>" });
    expect(evil).not.toContain("<b>x</b>");
  });

  it("links to sources only when there's no base (the judges' sample)", () => {
    const html = weekHtml(w, { note: "A sample." });
    expect(html).not.toContain("/plan?tab=executive");
    expect(html).toContain("https://example.com/apply");
    expect(html).toContain("A sample.");
  });

  it("gives the AI tool the same lists as text", () => {
    const t = weekText(w, "https://athena.example");
    expect(t).toContain("No reply yet\n- Fig Larder: Pitched October 20");
    expect(t).toContain("Due this week\n- Apply: Smorgasburg LA");
    expect(t).toContain("Next events\n- Coastal fair (Los Angeles)");
  });
});
