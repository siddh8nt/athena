import { describe, expect, it } from "vitest";
import { emptyJourney, type CrowdCard, type Journey } from "@/lib/journey/types";
import type { BrandBrief } from "@/lib/brief/types";
import type { CrowdPage } from "@/lib/team/page";
import type { TeamState, Work } from "@/lib/team/types";
import { brandFile } from "@/lib/workspace/brand-file";
import { planSheets } from "@/lib/workspace/plan-sheets";

// §23.8 e: the brand file and the plan spreadsheet carry each crowd's name, what it's named after and what they share
// (as Athena's read), and say where every line came from, in the same words as the app's cards.

const src = { kind: "message" as const };
const brief = { name: { value: "Brightland", source: src }, websites: [], stockists: [], comparables: [], competitors: [], notes: [], turns: 0, calls: 0 } as unknown as BrandBrief;

const crowd = {
  id: "c1",
  name: "Graza and Bon Appétit fans",
  handle: "the Graza crowd",
  after: ["Graza", "Bon Appétit"],
  shared: "Cooking at home as a weekend project.",
  main: true,
  loves: [{ name: "Graza", kind: "brand" }, { name: "Bon Appétit", kind: "magazine" }],
  cities: [{ metro: "la", name: "Los Angeles", venue: "", venues: 3 }],
  signal: [],
} as unknown as CrowdCard;

const repPage = {
  at: 1,
  tabs: [],
  across: {
    sources: [{ id: "qloo-places", label: "Qloo places" }],
    method: "",
    sections: [
      {
        id: "where",
        title: "Where to sell",
        blocks: [
          { type: "names", label: "Shops", groups: [{ label: "", names: [{ item: "venue:fig larder", name: "Fig Larder" }, { item: "venue:salt shelf", name: "Salt Shelf" }] }] },
          { type: "table", label: "Every matching shop", columns: ["Shop", "City"], rows: [{ cells: ["Salt Shelf", "Los Angeles"] }] },
        ],
      },
    ],
  },
} as unknown as CrowdPage;

const rep = {
  agent: "rep",
  page: repPage,
  results: [{ id: "venue:fig larder", kind: "venue", name: "Fig Larder", why: "A pantry shop the Graza crowd visits", sources: ["S1"], callIds: [] }],
  claims: [],
  sources: [{ id: "S1", tool: "web_search", summary: "Searched LA pantry shops", callIds: [], pages: [{ title: "Fig Larder", url: "https://figlarder.example/about" }] }],
  qlooCalls: 12,
} as unknown as Work;

const team = { goals: [], works: { rep }, outcomes: [] } as unknown as TeamState;
const journey: Journey = { ...emptyJourney(), crowds: { crowds: [crowd], calls: 101 } as unknown as Journey["crowds"], team };
const NOW = Date.UTC(2026, 9, 29);

describe("the brand file says where each line came from (§23.8 e)", () => {
  const md = brandFile({ brief, journey }, NOW);

  it("gives each crowd its name, handle, what it's named after and what they share, as Athena's read", () => {
    expect(md).toContain("### Graza and Bon Appétit fans (the main crowd)");
    expect(md).toContain("- Called the Graza crowd for short");
    expect(md).toContain("- What they share (Athena's read): Cooking at home as a weekend project.");
    expect(md).toContain("- Named after Graza and Bon Appétit, two things it loves [1]");
    expect(md).not.toMatch(/What they share.*\[\d\]/);
  });

  it("closes with the numbered sources in plain words, never a tool or an id", () => {
    expect(md).toContain("## Where this came from");
    expect(md).toContain("1. The crowds: Qloo's taste graph, 101 calls");
    expect(md).not.toContain("Still to hear from the founder");
    expect(md).not.toMatch(/web_search|qloo_insights|\bS1\b/);
  });
});

describe("the plan spreadsheet says where each row came from (§23.8 e)", () => {
  const sheets = planSheets({ brief, journey }, NOW);
  const col = (tab: string, head: string) => {
    const rows = sheets.find((s) => s.name === tab)!.rows;
    const i = rows[0].indexOf(head);
    expect(i).toBeGreaterThanOrEqual(0);
    return rows.slice(1).map((r) => r[i]);
  };

  it("gives the Crowds tab what each crowd is named after, what they share and its source", () => {
    expect(col("Crowds", "Named after")).toEqual(["Graza and Bon Appétit"]);
    expect(col("Crowds", "What they share (Athena's read)")).toEqual(["Cooking at home as a weekend project."]);
    expect(col("Crowds", "Where it came from")).toEqual(["Qloo's taste graph, 101 calls"]);
  });

  it("names a result's source and its page, and falls back to what the page read", () => {
    const outreach = sheets.find((s) => s.name === "Outreach")!.rows;
    const at = outreach[0].indexOf("Where it came from");
    const fig = outreach.find((r) => r.includes("Fig Larder"))!;
    expect(fig[at]).toBe("The web: Fig Larder\nhttps://figlarder.example/about");
    expect(col("Rep – Every matching shop", "Where it came from")).toEqual(["Qloo's taste graph"]);
  });
});
