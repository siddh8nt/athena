import { describe, expect, it } from "vitest";
import { costFit, feeLine, launchOf, promoFill, promoterPage, readPromo, topEvent, type PromoCrowd, type PromoDeps, type PromoEvent, type PromoRead, type WebEvent } from "@/lib/agent/promoter";
import { readPromo as readSaved } from "@/lib/team/read";
import { markLabel, marksFor } from "@/lib/team/types";
import { leanings } from "@/lib/agent/outcomes";
import { today } from "@/lib/time/now";
import type { QlooClient } from "@/lib/qloo/client";

// The Promoter (PRD §23.5 h): events per crowd and city with lead time and a source on every date, fees only as
// published, moments and online audiences; creators are the Matchmaker's.

const DAY = 86_400_000;
const inDays = (n: number) => new Date(new Date(`${today()}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);

// Crowds with no Qloo signal read no artists or festivals, so these tests make no Qloo calls.
const qloo = { insights: async () => ({ call: { id: "x" }, results: { entities: [] } }) } as unknown as QlooClient;

const crowds: PromoCrowd[] = [
  { id: "a", name: "Pantry cooks", tier: "win_first", signal: [], loves: ["Fishwife"], metros: ["nyc"] },
  { id: "b", name: "Natural wine people", tier: "win_next", signal: [], loves: [], metros: ["nyc", "chicago"] },
  { id: "c", name: "Gift buyers", tier: "watch", signal: [], loves: [], metros: ["chicago"] },
];

const web = (name: string, extra: Partial<WebEvent> = {}): WebEvent => ({ name, kind: "market", date: inDays(60), url: `https://${name.toLowerCase().replace(/\W+/g, "")}.org`, site: "event page", formats: ["booth"], ...extra });

const deps = (over: Partial<PromoDeps> = {}): PromoDeps => ({
  brand: { name: "Brightland", product: "olive oil" },
  budget: "low",
  launch: {},
  cities: [
    { metroId: "nyc", name: "New York", yours: false },
    { metroId: "chicago", name: "Chicago", yours: false },
  ],
  hosts: [],
  ...over,
});

const ev = (name: string, extra: Partial<PromoEvent> = {}): PromoEvent => ({
  id: `event:${name}`,
  name,
  kind: "market",
  date: inDays(60),
  url: "https://example.org",
  site: "example.org",
  metroId: "nyc",
  city: "New York",
  crowds: ["a"],
  why: "A market Pantry cooks go to",
  formats: ["booth"],
  ...extra,
});

describe("the Promoter's read", () => {
  it("dedupes an event two crowds go to, ranks it first, and sources every date", async () => {
    const findEvents = async (c: { name: string }, city: string) =>
      city === "New York" ? (c.name === "Pantry cooks" ? [web("Smorgasburg", { date: inDays(90) }), web("Union Square Fair")] : [web("Smorgasburg", { date: inDays(90) })]) : [web("Maxwell Street Market")];
    const r = await readPromo(qloo, crowds, deps({ findEvents }));
    expect(r.events.find((e) => e.name === "Smorgasburg")?.crowds).toEqual(["a", "b"]);
    expect(r.events.find((e) => e.name === "Maxwell Street Market")?.crowds).toEqual(["b", "c"]);
    expect(r.events.at(-1)?.name).toBe("Union Square Fair");
    expect(r.events.every((e) => e.url && /^\d{4}-\d{2}-\d{2}$/.test(e.date))).toBe(true);
    expect(r.calls).toBe(0);
  });

  it("moves an event under 30 days away to its next edition, else leaves it out with the reason", async () => {
    const findEvents = async () => [web("Soon Fair", { date: inDays(10), next: { date: inDays(375), url: "https://soon.org/2027" } }), web("Gone Fair", { date: inDays(12) }), web("Closed Expo", { date: inDays(80), applyBy: inDays(-3) })];
    const r = await readPromo(qloo, [crowds[0]], deps({ findEvents }));
    const soon = r.events.find((e) => e.name === "Soon Fair")!;
    expect(soon.date).toBe(inDays(375));
    expect(soon.url).toBe("https://soon.org/2027");
    expect(soon.moved?.from).toBe(inDays(10));
    expect(r.events.some((e) => e.name === "Gone Fair" || e.name === "Closed Expo")).toBe(false);
    expect(r.moved.join(" ")).toMatch(/Gone Fair.*too close/);
    expect(r.moved.join(" ")).toMatch(/Closed Expo.*applications closed/);
  });

  it("says what isn't connected instead of guessing", async () => {
    const r = await readPromo(qloo, [crowds[0]], deps());
    expect(r.events).toEqual([]);
    expect(r.limits.join(" ")).toMatch(/web search isn't connected/);
    expect(r.moments.every((m) => m.kind === "retail" && m.url?.startsWith("https://www.timeanddate.com/holidays/us/"))).toBe(true);
  });

  it("keeps what came back by the deadline and names what's still being read", async () => {
    const findEvents = async (_c: { name: string }, city: string) => (city === "Chicago" ? new Promise<WebEvent[]>(() => {}) : [web("Smorgasburg")]);
    const r = await readPromo(qloo, crowds, deps({ findEvents, until: Date.now() + 50 }));
    expect(r.events.map((e) => e.name)).toEqual(["Smorgasburg"]);
    expect(r.limits.join(" ")).toMatch(/Markets and fairs in Chicago: still being read/);
  });

  it("adds the founder's launch as their own moment", async () => {
    const date = inDays(100);
    const r = await readPromo(qloo, [crowds[0]], deps({ launch: { date } }));
    expect(r.moments.find((m) => m.kind === "own")?.date).toBe(date);
  });

  it("reads the launch answer as a date or a window", () => {
    expect(launchOf([{ question: "When is your next launch or push?", answer: "Within a month" }]).window).toEqual([0, 30]);
    expect(launchOf([{ question: "Something else", answer: "Within a month" }])).toEqual({});
  });
});

describe("the Promoter's fees and pick", () => {
  it("shows a fee only as published, and sizes it to the budget", () => {
    expect(feeLine(ev("A"))).toBe("Fee not published, ask");
    expect(feeLine(ev("A", { fee: { text: "$150 per booth", url: "https://a.org/vendors", site: "a.org" } }))).toBe("$150 per booth (a.org)");
    expect(costFit(ev("A", { fee: { text: "$150 per booth", url: "u", site: "s" } }), "low")).toBe("Fits your budget");
    expect(costFit(ev("A", { fee: { text: "$5,000", url: "u", site: "s" } }), "low")).toBe("Beyond budget");
  });

  it("writes first to the event most crowds share", () => {
    expect(topEvent({ events: [ev("One crowd"), ev("Two crowds", { crowds: ["a", "b"], date: inDays(200) })] })?.name).toBe("Two crowds");
  });
});

const read = (over: Partial<PromoRead> = {}): PromoRead => ({
  crowds,
  cities: [
    { metroId: "nyc", name: "New York", yours: false },
    { metroId: "chicago", name: "Chicago", yours: false },
  ],
  events: [ev("Smorgasburg", { crowds: ["a", "b"] }), ev("Maxwell Street Market", { metroId: "chicago", city: "Chicago", crowds: ["c"] })],
  moments: [],
  audiences: [{ id: "audience:r/olives", kind: "subreddit", name: "r/olives", how: "Answer questions", why: "Pantry cooks read it", crowds: ["a"] }],
  hosts: [],
  budget: "low",
  brand: { name: "Brightland", product: "olive oil" },
  launch: {},
  moved: [],
  calls: 0,
  callIds: [],
  limits: [],
  at: today(),
  ...over,
});

describe("the Promoter's page", () => {
  it("has a tab per crowd in tier order and Across all three, with no creators", () => {
    const p = promoterPage(read());
    expect(p.tabs.map((t) => t.crowd.id)).toEqual(["a", "b", "c"]);
    expect(p.across?.sections.length).toBeGreaterThan(0);
    expect(JSON.stringify(p)).not.toMatch(/"creator"/);
    expect(JSON.stringify(p)).toMatch(/"type":"calendar"/);
  });

  it("shows a retail moment as US-wide, not online", () => {
    const p = promoterPage(read({ moments: [{ id: "moment:bf", kind: "retail", name: "Black Friday", date: inDays(40), site: "timeanddate.com", why: "A US retail moment", crowds: ["a", "b", "c"] }] }));
    const cal = JSON.stringify(p.across).match(/"name":"Black Friday"[^}]*/)?.[0] ?? "";
    expect(cal).toMatch(/"mark":"moment"/);
    expect(cal).toMatch(/"city":"US-wide"/);
  });

  it("hands the Navigator each city's events, soonest first and by neighbourhood", () => {
    const fill = promoFill(read({ events: [ev("Later Fair", { date: inDays(200) }), ev("Smorgasburg", { crowds: ["a", "b"], hood: { name: "Williamsburg", role: "anchor" } }), ev("Maxwell Street Market", { metroId: "chicago", city: "Chicago" })] }));
    expect(fill.map((f) => f.metroId)).toEqual(["nyc", "chicago"]);
    expect(fill[0].names[0]).toMatch(/^Smorgasburg \(/);
    expect(fill[0].names[1]).toMatch(/^Later Fair/);
    expect(fill[0].hoods).toEqual([{ hood: "Williamsburg", names: [fill[0].names[0]] }]);
  });

  it("comes back from the client shape-checked, dropping an event with no source", () => {
    const raw = JSON.parse(JSON.stringify(read({ events: [ev("Kept"), { ...ev("No source"), url: "" }] })));
    const back = readSaved(raw)!;
    expect(back.events.map((e) => e.name)).toEqual(["Kept"]);
    expect(back.audiences[0].name).toBe("r/olives");
  });
});

describe("the Promoter's marks", () => {
  it("reads Applied, Booked, Went and Skipped, and counts Went as a yes", () => {
    expect(marksFor("promoter").map((m) => markLabel(m, "promoter"))).toEqual(["Applied", "Booked", "Went", "Skipped"]);
    expect(marksFor("rep")).not.toContain("went");
    const l = leanings([{ item: "event:a", agent: "promoter", kind: "event", name: "A", group: "market", mark: "went", at: 1 }]);
    expect(l.get("market")).toBe(1);
  });
});
