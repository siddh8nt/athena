import { describe, expect, it } from "vitest";
import { across, by, crowdTab, holdSignal, pathStrength, scoutPage, sharedThemes, writeCrowd, type CrowdRead } from "@/lib/agent/scout";
import { checkLook, type LookEvidence } from "@/lib/agent/looks";
import { scoutCrowds, type TeamCtx } from "@/lib/agent/plays";
import { mergePage, withHooks, type CrowdPage } from "@/lib/team/page";
import type { CrowdCard, CrowdMeeting } from "@/lib/journey/types";

// The Scout's page (§23.5 b + d): every crowd tab has the same six sections in the same order, Across all three
// reads the paths as strong / thin / leap and the order as a sequence, and a rewrite touches only one tab's hooks.

const chip = (name: string, callId = "q1") => ({ id: `t:${name}`, name, type: "urn:tag:keyword:qloo", rank: 1, callId });
const card = (id: string, name: string, extra: Partial<CrowdCard> = {}): CrowdCard => ({
  id,
  name,
  main: id === "c1",
  loves: [{ name: `${name} love`, kind: "artist" }] as unknown as CrowdCard["loves"],
  signal: [{ id: `${id}-s`, name: "sig" }],
  cities: [{ metro: "m1", name: "Portland", venue: "x", venues: 4 }],
  size: 20,
  ...extra,
});
const read = (id: string, name: string, tier: CrowdRead["tier"], themes: string[], extra: Partial<CrowdCard> = {}): CrowdRead =>
  ({
    crowd: card(id, name, extra),
    tier,
    message: {
      themes: themes.map((t) => chip(t)),
      styleTags: [chip("Rustic")],
      references: [
        { id: `${id}-tv`, name: `${name} Show`, kind: "tv_show", callId: "q2" },
        { id: `${id}-art`, name: `${name} Band`, kind: "artist", callId: "q2", image: "https://images.qloo.com/x.jpg" },
      ],
      positioning: [],
      skew: null,
      interests: [],
      label: name,
      hooks: { hooks: [{ text: `A hook for ${name}`, claims: [{ kind: "theme", ref: themes[0] }] }], ideas: [], removed: 0 },
    },
    online: { creators: [{ id: `${id}-cr`, name: `${name} Creator`, role: "Chef", callId: "q3" }], podcasts: [{ id: `${id}-pod`, name: `${name} Pod`, callId: "q3" }], interests: [], calls: 2, callIds: ["q3"] },
    phrases: [chip(`${name} phrase`)],
    calls: 12,
    callIds: ["q1", "q2", "q3"],
  }) as unknown as CrowdRead;

const brand = { name: "Brightland", product: "olive oil", ownId: "own", competitors: [{ id: "r1", name: "Graza" }] };

describe("a crowd tab", () => {
  const a = read("c1", "Slow cooks", "win_first", ["Seasonal", "Craft"]);
  const b = read("c2", "Wellness", "win_next", ["Craft", "Calm"]);
  const tab = crowdTab(a, { brand, others: [{ crowd: "Wellness", phrases: ["Wellness phrase"] }], rivals: [{ competitorId: "r1", competitorName: "Graza", onlyThem: ["Squeeze"], onlyYou: ["Gift"], shared: [] } as never] });

  it("has the six sections in the same order", () => {
    expect(tab.sections.map((s) => s.id)).toEqual(["who", "words", "mood", "product", "attention", "rivals"]);
    expect(crowdTab(b, { brand, others: [] }).sections.map((s) => s.id)).toEqual(tab.sections.map((s) => s.id));
  });

  it("puts the other crowds' phrases among the words to avoid", () => {
    const words = tab.sections.find((s) => s.id === "words")!;
    const names = words.blocks.flatMap((x) => (x.type === "names" ? x.groups.flatMap((g) => g.names.map((n) => n.name)) : []));
    expect(names).toContain("Wellness phrase");
    expect(names).toContain("Squeeze");
  });

  it("makes the hooks rewritable and markable", () => {
    const hooks = tab.sections.find((s) => s.id === "words")!.blocks.find((x) => x.type === "lines");
    expect(hooks && hooks.type === "lines" && hooks.rewrite).toBe(true);
    expect(hooks && hooks.type === "lines" && hooks.lines[0].item).toBe("message:a hook for slow cooks");
  });

  it("names where attention goes, by who it hands on to", () => {
    const att = tab.sections.find((s) => s.id === "attention")!.blocks[0];
    expect(att.type === "names" && att.groups.map((g) => g.label)).toEqual(["Shows", "Podcasts", "Creators"]);
  });

  it("links the rivals from the Analyst's map", () => {
    const rivals = tab.sections.find((s) => s.id === "rivals")!;
    expect(rivals.summary).toBe("From the Analyst's rival map");
    const l = rivals.blocks[0];
    expect(l.type === "lines" && l.lines[0].reason).toBe("Their ground: Squeeze · Your opening: Gift");
  });

  it("says how many Qloo signals it read", () => {
    expect(tab.method).toBe("Read from 12 Qloo signals");
  });
});

describe("across all three", () => {
  const reads = [
    read("c1", "Slow cooks", "win_first", ["Seasonal", "Craft"]),
    read("c2", "Wellness", "win_next", ["Craft", "Calm"]),
    read("c3", "Near", "watch", ["Calm"], { nearMiss: true }),
  ];
  const item = (n: string) => ({ id: n, name: n, a: 1, b: 1, score: 1 });
  const meetings: CrowdMeeting[] = [
    { a: "c1", b: "c2", items: [item("A"), item("B"), item("C")] },
    { a: "c2", b: "c3", items: [item("D")] },
  ];

  it("grades paths strong at three shared, thin at one or two, a leap at none", () => {
    expect([pathStrength(3), pathStrength(2), pathStrength(1), pathStrength(0)]).toEqual(["strong", "thin", "thin", "leap"]);
  });

  it("reads the hold signal by channel", () => {
    expect(holdSignal("online")).toBe("repeat buyers");
    expect(holdSignal("offline")).toBe("stockist reorders");
  });

  it("orders the crowds as a sequence, testing the near-miss group", () => {
    const x = across(reads, meetings, { channel: "online" });
    const paths = x.sections[0].blocks[0];
    expect(paths.type === "paths" && paths.edges.map((e) => e.strength)).toEqual(["strong", "leap", "thin"]);
    const steps = x.sections[1].blocks[0];
    expect(steps.type === "steps" && steps.steps.map((s) => s.text)).toEqual([
      "Win Slow cooks first",
      "Once Slow cooks holds, win Wellness, through A, B and C",
      "Once Wellness holds, test Near, through D",
    ]);
    expect(x.sections[1].summary).toBe("A sequence, not a schedule");
    expect(x.method).toBe("Read from 36 Qloo signals · 3 crowds");
  });

  it("falls back to the shared themes when no one line was written", () => {
    expect(sharedThemes(reads)).toEqual(["Craft", "Calm"]);
    const msg = across(reads, meetings, {}).sections[2].blocks[0];
    expect(msg.type === "names" && msg.groups[0].names.map((n) => n.name)).toEqual(["Craft", "Calm"]);
  });

  it("sorts the tabs Win first, Win next, Watch", () => {
    const page = scoutPage([reads[2], reads[0], reads[1]], { brand, meetings });
    expect(page.tabs.map((t) => t.crowd.tier)).toEqual(["win_first", "win_next", "watch"]);
    expect(page.tabs[2].crowd.nearMiss).toBe(true);
    expect(page.across).toBeDefined();
  });
});

describe("the page over time", () => {
  const page = (ids: string[], at: number): CrowdPage => ({
    tabs: ids.map((id, i) => ({ crowd: { id, name: id, tier: (["win_first", "win_next", "watch"] as const)[i] }, sections: [{ id: "words", title: "Words", blocks: [{ type: "lines", lines: [{ text: `old ${id}` }], rewrite: true }] }], sources: [], method: "" })),
    at,
  });

  it("merges a re-read of one crowd, keeping the others", () => {
    const next = { ...page(["b"], 2), tabs: [{ ...page(["b"], 2).tabs[0], crowd: { id: "b", name: "b", tier: "win_next" as const } }] };
    const m = mergePage(page(["a", "b", "c"], 1), next);
    expect(m.tabs.map((t) => t.crowd.id)).toEqual(["a", "b", "c"]);
    expect(m.at).toBe(2);
  });

  it("rewrites only one tab's hooks", () => {
    const m = withHooks(page(["a", "b"], 1), "b", [{ text: "new" }]);
    const text = (i: number) => (m.tabs[i].sections[0].blocks[0] as { lines: { text: string }[] }).lines[0].text;
    expect([text(0), text(1)]).toEqual(["old a", "new"]);
  });
});

describe("the look check", () => {
  const ev: LookEvidence = { brand: "Brightland", crowd: "Slow cooks", themes: ["Seasonal"], styleTags: ["Rustic"], references: ["Chef's Table"], phrases: [], knowledge: ["We sell Awake and Alive olive oils"], product: "olive oil" };

  it("keeps cited swatches and products the Knowledge Base names, drops the rest", () => {
    const { look, violations } = checkLook(
      {
        palette: [
          { name: "Olive", hex: "#556b2f", from: ["Rustic"] },
          { name: "Neon", hex: "#00ff00", from: ["Rave"] },
          { name: "Bad", hex: "green", from: ["Rustic"] },
        ],
        lead_with: { product: "Awake", reason: "Seasonal cooking wants a bright oil", from: ["Seasonal"] },
        skip: { product: "Truffle salt", reason: "Not what they cook", from: ["Seasonal"] },
      },
      ev,
    );
    expect(look.palette.map((s) => s.name)).toEqual(["Olive"]);
    expect(look.lead?.product).toBe("Awake");
    expect(look.skip).toBeUndefined();
    expect(look.removed).toBe(3);
    expect(violations.length).toBe(3);
  });
});

describe("which crowds the Scout reads", () => {
  const crowds = [card("c1", "One"), card("c2", "Two"), card("c3", "Three", { nearMiss: true })];

  it("follows the Analyst's tiers", () => {
    const t = { crowds: { crowds }, fits: { fits: [{ crowd: "c2", tier: "win_first" }, { crowd: "c1", tier: "win_next" }, { crowd: "c3", tier: "watch" }] } } as unknown as TeamCtx;
    expect(scoutCrowds(t).map((x) => [x.crowd.id, x.tier])).toEqual([["c2", "win_first"], ["c1", "win_next"], ["c3", "watch"]]);
  });

  it("puts the main crowd first and the near-miss group in Watch when nothing is ranked", () => {
    const t = { crowds: { crowds: [crowds[2], crowds[1], crowds[0]] } } as unknown as TeamCtx;
    expect(scoutCrowds(t).map((x) => [x.crowd.id, x.tier])).toEqual([["c1", "win_first"], ["c2", "win_next"], ["c3", "watch"]]);
  });
});

describe("the writing deadline", () => {
  const slow = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));

  it("leaves out a write still running at the deadline", async () => {
    expect(await by(slow("late", 200), Date.now() + 20)).toBeUndefined();
    expect(await by(slow("on time", 5), Date.now() + 200)).toBe("on time");
  });

  it("keeps a crowd's look when its hooks are late, and the hooks it had", async () => {
    const r = read("c1", "Slow cooks", "win_first", ["Seasonal"]);
    const deps = {
      brand,
      fingerprint: [],
      knowledge: [],
      writeHooks: () => slow({ hooks: [], ideas: [], removed: 0 }, 300),
      writeLooks: () => slow({ palette: [{ name: "Olive", hex: "#556b2f", from: ["Rustic"] }], removed: 0 }, 5),
      until: Date.now() + 60,
    };
    const out = await writeCrowd(r, deps as never);
    expect(out.look?.palette[0].name).toBe("Olive");
    expect(out.message.hooks?.hooks[0].text).toBe("A hook for Slow cooks");
  });
});
