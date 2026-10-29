import { describe, expect, it } from "vitest";
import { emptyJourney, type CrowdCard, type Journey } from "@/lib/journey/types";
import type { BrandBrief } from "@/lib/brief/types";
import type { CrowdPage } from "@/lib/team/page";
import type { GrowthPlan, TeamState, Work } from "@/lib/team/types";
import { planSheets, planWorkbook } from "@/lib/workspace/plan-sheets";
import { sheetNames } from "@/lib/workspace/xlsx";
import { readXlsxCells, rowsToTable } from "@/lib/brief/extract";

// The plan spreadsheet (athena-plan.xlsx): a tab per sheet from the saved journey, in words, never ids; no tab for a
// subagent that hasn't run; no column nothing fills; and a real workbook that opens and reads back.

const src = { kind: "message" as const };
const brief = {
  name: { value: "Brightland", source: src },
  sells: { value: "olive oil", source: src },
  activeCity: { value: "Los Angeles", source: src },
  websites: [],
  stockists: [],
  comparables: [],
  competitors: [],
  notes: [],
  turns: 0,
  calls: 0,
} as BrandBrief;

const crowd = (name: string, main: boolean, near = false) =>
  ({ id: name, name, main, loves: [{ name: "Diaspora Co.", kind: "brand" }], signal: [], cities: [{ metro: "la", name: "Los Angeles", venue: "", venues: 3 }], size: 40, ...(near ? { nearMiss: true } : {}) }) as CrowdCard;

// The Rep's page: the shops as names (what Execute Plan works from), and its table of every matching shop, where
// nothing filled the Wholesale column.
const repPage = {
  at: 1,
  tabs: [],
  across: {
    sources: [],
    method: "",
    sections: [
      {
        id: "where",
        title: "Where to sell",
        blocks: [
          { type: "names", label: "Shops", groups: [{ label: "", names: [{ item: "venue:fig larder", name: "Fig Larder", note: "Loved by Coastal cooks" }, { item: "venue:salt shelf", name: "Salt Shelf" }] }] },
          {
            type: "table",
            label: "Every matching shop (2)",
            columns: ["Shop", "City", "Wholesale", "Contact"],
            rows: [
              { cells: ["Fig Larder", "Los Angeles", "—", "Walk in"], detail: { links: [{ label: "Website", url: "https://figlarder.example" }] } },
              { cells: ["Salt Shelf", "Los Angeles", "—", "Email"] },
            ],
          },
        ],
      },
    ],
  },
} as unknown as CrowdPage;

const plan = {
  headline: "Win Los Angeles's home cooks first.",
  steps: [{ n: 1, what: "Pitch the shops your crowd already buys from", crowds: ["Coastal cooks"], phase: "win_first", lines: [{ kind: "where", text: "Fig Larder and Salt Shelf in Silver Lake" }], depends: [] }],
  disagreements: [],
  open: ["What's your wholesale price?"],
  from: {},
  at: 1,
} as GrowthPlan;

const PITCHED = Date.UTC(2026, 9, 20);
const team = {
  goals: [],
  works: { rep: { page: repPage } as unknown as Work },
  outcomes: [{ item: "venue:fig larder", agent: "rep", kind: "venue", name: "Fig Larder", mark: "pitched", at: PITCHED }],
  plan,
  answered: [{ id: "q", agent: "rep", question: "Who buys it?", answer: "Home cooks who love good pantry staples." }],
} as unknown as TeamState;

const journey: Journey = { ...emptyJourney(), crowds: { crowds: [crowd("Coastal cooks", true), crowd("Next door", false, true)] } as unknown as Journey["crowds"], team };
const NOW = Date.UTC(2026, 9, 28);

describe("the plan spreadsheet", () => {
  const sheets = planSheets({ brief, journey }, NOW);
  const tab = (name: string) => sheets.find((s) => s.name === name);

  it("has a tab for what was found, About first, and none for a subagent that hasn't run", () => {
    const names = sheets.map((s) => s.name);
    expect(names[0]).toBe("About");
    expect(names).toEqual(expect.arrayContaining(["Outreach", "Plan", "Crowds", "Rep – Every matching shop", "Rep – Findings", "Results"]));
    expect(names.some((n) => /Analyst|Scout|Navigator|Matchmaker|Promoter/.test(n))).toBe(false);
    expect(names).not.toContain("Drafts"); // nothing drafted yet
    expect(names).not.toContain("Left out");
  });

  it("opens with the brand, the founder's answers and an index of the tabs", () => {
    const about = tab("About")!.rows;
    expect(about[0]).toEqual(["Brightland: Athena's growth plan", "Written 2026-10-28"]);
    expect(about).toContainEqual(["Sells", "olive oil"]);
    expect(about).toContainEqual(["Who buys it?", "Home cooks who love good pantry staples."]);
    expect(about).toContainEqual(["Still open", "What's your wholesale price?"]);
    const index = about.findIndex((r) => r[0] === "Tabs in this file");
    expect(about.slice(index + 1).map((r) => r[0])).toEqual(sheets.slice(1).map((s) => s.name));
  });

  it("lists the outreach with where each stands, and when a pitch was made", () => {
    const [head, ...rows] = tab("Outreach")!.rows;
    const fig = rows.find((r) => r[head.indexOf("Name")] === "Fig Larder")!;
    expect(fig[head.indexOf("Type")]).toBe("Shop");
    expect(fig[head.indexOf("Subagent")]).toBe("Rep");
    expect(fig[head.indexOf("Pitched on")]).toEqual({ day: "2026-10-20" });
    expect(rows.find((r) => r[head.indexOf("Name")] === "Salt Shelf")).toBeTruthy();
  });

  it("leaves out the columns nothing filled", () => {
    expect(tab("Outreach")!.rows[0]).not.toContain("Email");
    const [head] = tab("Rep – Every matching shop")!.rows;
    expect(head).toEqual(["Shop", "City", "Contact", "Page section", "Links"]); // Wholesale was all "—", and no crowd tab holds it
    expect(tab("Crowds")!.rows.map((r) => r[1])).not.toContain("Next door"); // a near-miss group isn't a crowd
  });

  it("names things in words, never by id", () => {
    expect(JSON.stringify(sheets)).not.toMatch(/venue:|partner:|creator:|athena:\/\//);
  });

  it("writes a workbook that reads back tab for tab", () => {
    const back = readXlsxCells(planWorkbook({ brief, journey }, NOW));
    expect(back.map((s) => s.sheet)).toEqual(sheets.map((s) => s.name));
    const shops = rowsToTable(back.find((s) => s.sheet === "Rep – Every matching shop")!.rows);
    expect(shops[0]).toEqual(["Shop", "City", "Contact", "Page section", "Links"]);
    expect(shops[1]).toEqual(["Fig Larder", "Los Angeles", "Walk in", "Where to sell", "Website: https://figlarder.example"]);
    const results = rowsToTable(back.find((s) => s.sheet === "Results")!.rows);
    expect(+results[1][0]).toBe(PITCHED / 86_400_000 + 25_569); // a real date, as Excel counts days
  });

  it("is a valid workbook for an empty workspace", () => {
    expect(planSheets({}, NOW).map((s) => s.name)).toEqual(["About"]);
    expect(readXlsxCells(planWorkbook({}, NOW)).map((s) => s.sheet)).toEqual(["About"]);
  });
});

describe("sheet names", () => {
  it("keeps to Excel's rules: no []:*?/\\, 31 characters at most, none twice", () => {
    expect(sheetNames(["Rep: shops", "a/b?c"])).toEqual(["Rep shops", "a b c"]);
    expect(sheetNames(["x".repeat(40)])[0]).toHaveLength(31);
    expect(sheetNames(["Plan", "plan", "Plan"])).toEqual(["Plan", "plan 2", "Plan 3"]);
    expect(sheetNames(["", "''"])).toEqual(["Sheet", "Sheet 2"]);
  });
});
