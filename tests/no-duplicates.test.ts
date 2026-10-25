import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readNav, readRep, readMatch, readPromo } from "@/lib/team/read";
import { repPage } from "@/lib/agent/rep";
import { matchPage } from "@/lib/agent/matchmaker";
import { promoterPage } from "@/lib/agent/promoter";
import { navigatorPage, restoreNav } from "@/lib/agent/navigator";
import { scoutPage, type CrowdRead } from "@/lib/agent/scout";
import type { Block, CrowdPage } from "@/lib/team/page";
import { duplicates, itemsOf } from "./dupes";

// §23.5 (p): no page lists the same thing twice. The pages are rebuilt with today's builders from the reads a recorded
// run saved, so a change to a builder shows here. The recording lives in the gitignored .cache/dev (no Qloo data in
// the repo), so that part skips where it isn't; the Scout, whose reads aren't saved, is checked on a made-up read.

const SNAPSHOTS = path.join(".cache", "dev", "snapshots");

/** The newest saved snapshot with all six subagents' work in it. */
function recorded(): { journey: { team: { works: Record<string, { shared?: Record<string, unknown>; page?: CrowdPage }> }; crowds: { crowds: never[] }; channel?: "online" | "offline" | "both" } } | undefined {
  if (!fs.existsSync(SNAPSHOTS)) return undefined;
  const files = fs.readdirSync(SNAPSHOTS).filter((f) => f.endsWith(".json")).sort().reverse();
  for (const f of files) {
    const snap = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS, f), "utf8"));
    const raw = snap.store?.["athena:journey:v1"];
    const j = raw ? JSON.parse(raw).journey : undefined;
    const w = j?.team?.works;
    if (w?.rep?.shared?.rep && w?.matchmaker?.shared?.match && w?.promoter?.shared?.promo && w?.navigator?.shared?.nav && j.crowds?.crowds) return { journey: j };
  }
  return undefined;
}

function pages(): Record<string, CrowdPage> {
  const r = recorded()!;
  const w = r.journey.team.works;
  const s = (k: string) => w[k].shared!;
  const nav = restoreNav(readNav(s("navigator").nav)!, r.journey.crowds.crowds, w.navigator.page)!;
  return {
    Rep: repPage(readRep(s("rep").rep)!, { pitches: s("rep").pitch as never }),
    Matchmaker: matchPage(readMatch(s("matchmaker").match)!, { asks: s("matchmaker").ask as never }),
    Promoter: promoterPage(readPromo(s("promoter").promo)!, { inquiries: s("promoter").inquiry as never }),
    Navigator: navigatorPage(nav, [], { channel: r.journey.channel }),
  };
}

const blocks = (p: CrowdPage, where: "tabs" | "across") => (where === "tabs" ? p.tabs.flatMap((t) => t.sections) : (p.across?.sections ?? [])).flatMap((s) => s.blocks);
const facts = (bs: Block[]) => bs.flatMap((b) => (b.type === "facts" ? b.rows.map((r) => r.label) : []));

describe.skipIf(!recorded())("the pages of the recorded run", () => {
  const all = recorded() ? pages() : {};

  for (const [name, page] of Object.entries(all))
    it(`the ${name} lists nothing twice`, () => {
      expect(duplicates(name, page)).toEqual([]);
    });

  it("the Promoter's calendar holds dated things only, and online places only in the Online table", () => {
    const cals = [...blocks(all.Promoter, "tabs"), ...blocks(all.Promoter, "across")].filter((b): b is Extract<Block, { type: "calendar" }> => b.type === "calendar");
    expect(cals.length).toBeGreaterThan(0);
    for (const c of cals) {
      expect(c.items.filter((i) => !i.date)).toEqual([]);
      expect(c.cities).not.toContain("Online");
    }
    expect(all.Promoter.tabs.flatMap((t) => t.sections.map((s) => s.id))).not.toContain("events");
    expect(all.Promoter.across!.sections.map((s) => s.id)).not.toContain("year");
  });

  it("the Matchmaker's Across keeps the shortlist, not the full tables, and the budget bands only in the Budget plan", () => {
    const across = all.Matchmaker.across!.sections;
    expect(across.flatMap((s) => s.blocks).filter((b) => b.type === "table")).toEqual([]);
    expect(facts(blocks(all.Matchmaker, "tabs"))).not.toContain("Budget fit by band");
    expect(facts(across.find((s) => s.id === "budget")!.blocks)).toContain("Budget fit by band");
  });

  it("each of the Navigator's actions for a city names a place once", () => {
    for (const s of all.Navigator.across!.sections.filter((x) => x.id.startsWith("city:"))) {
      const hoods = s.blocks.flatMap((b) => (b.type === "table" ? b.rows.map((r) => r.cells[0]) : []));
      const actions = s.blocks.flatMap((b) => (b.type === "lines" && b.label === "Actions" ? b.lines.map((l) => l.text) : []));
      for (const h of hoods) expect(actions.filter((a) => a.includes(h)).length, `${s.title}: ${h}`).toBeLessThanOrEqual(1);
    }
  });
});

// ---- The Scout, on a made-up read ------------------------------------------------------------------------------

const chip = (name: string) => ({ id: `t:${name}`, name, type: "urn:tag:keyword:qloo", rank: 1, callId: "q1" });
const read = (id: string, name: string, tier: CrowdRead["tier"]): CrowdRead =>
  ({
    crowd: { id, name, main: id === "c1", loves: [], signal: [], cities: [{ metro: "m1", name: "Portland", venue: "x", venues: 4 }], size: 20 },
    tier,
    message: {
      themes: [chip("Reality TV"), chip("Craft")],
      styleTags: [],
      references: [
        { id: `${id}-tv`, name: `${name} Show`, kind: "tv_show", callId: "q2" },
        { id: `${id}-art`, name: `${name} Band`, kind: "artist", callId: "q2" },
      ],
      positioning: [],
      skew: null,
      interests: [],
      label: name,
      hooks: { hooks: [{ text: `A hook for ${name}`, claims: [] }], ideas: [], removed: 0 },
    },
    online: { creators: [{ id: `${id}-cr`, name: `${name} Creator`, role: "Chef", callId: "q3" }], podcasts: [{ id: `${id}-pod`, name: `${name} Pod`, callId: "q3" }], interests: [], calls: 2, callIds: ["q3"] },
    phrases: [chip("Reality TV"), chip(`${name} phrase`)],
    calls: 12,
    callIds: ["q1", "q2", "q3"],
  }) as unknown as CrowdRead;

describe("the Scout's page", () => {
  const reads = [read("c1", "Slow cooks", "win_first"), read("c2", "Wellness", "win_next"), read("c3", "Gift buyers", "watch")];
  const page = scoutPage(reads, { brand: { name: "Brightland", product: "olive oil", competitors: [] } as never, meetings: [], oneLine: { hooks: [{ text: "One line for all", claims: [] }], ideas: [], removed: 0 } as never });

  it("lists nothing twice", () => {
    expect(duplicates("Scout", page)).toEqual([]);
  });

  it("keeps shows, podcasts and creators under attention only", () => {
    const who = page.tabs[0].sections.find((s) => s.id === "who")!.blocks.flatMap(itemsOf);
    expect(who).toContain("Slow cooks Band");
    expect(who).not.toContain("Slow cooks Show");
    const att = page.tabs[0].sections.find((s) => s.id === "attention")!.blocks.flatMap(itemsOf);
    expect(att).toEqual(expect.arrayContaining(["Slow cooks Show", "Slow cooks Pod", "Slow cooks Creator"]));
  });

  it("keeps the line for all three, not each tab's hooks again", () => {
    const labels = page.across!.sections.flatMap((s) => s.blocks.map((b) => ("label" in b ? b.label : undefined)));
    expect(labels).toContain("Works for all three");
    expect(labels).not.toContain("Works for one");
  });
});
