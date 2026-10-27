import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { ExecState, TeamState } from "@/lib/team/types";
import type { ExecItem, ExecPlan, Lookup, Social } from "@/lib/exec/plan";

// §23.5 (r): after one human step the Executive works by itself. Start is the only question with no default; after it
// every item is looked up in small groups, Now first, until each reaches Ready or Needs a contact, with no button
// pressed. Results come through chat. Every name here is made up; the recorded run lives in the gitignored .cache/dev
// (no Qloo data in the repo), so that part skips where it isn't.

vi.mock("server-only", () => ({}));
const store = new Map<string, unknown>();
vi.mock("@/lib/store", () => ({
  getStore: () => ({ get: async (ns: string, k: string) => (store.has(`${ns}:${k}`) ? { value: store.get(`${ns}:${k}`), at: Date.now() } : undefined), set: async (ns: string, k: string, v: unknown) => void store.set(`${ns}:${k}`, v) }),
}));
const generate = vi.fn(async (..._a: unknown[]) => ({ text: "{}", sources: [], retrievedUrls: [] }));
vi.mock("@/lib/llm/vertex", async (orig) => ({ ...(await orig<typeof import("@/lib/llm/vertex")>()), generate: (...a: unknown[]) => generate(...a) }));
const pages = new Map<string, { status: number; body: string; at?: string }>();
vi.mock("@/lib/enrich/safe-fetch", () => ({
  safeFetch: async (url: string) => {
    const p = pages.get(url);
    return p ? new Response(p.status === 404 ? "" : p.body, { status: p.status, headers: { "x-athena-url": p.at ?? url } }) : undefined;
  },
  fetchedUrl: (res: Response, asked: string) => res.headers.get("x-athena-url") ?? asked,
}));
vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ results: [] })));

const { findContact, runExec } = await import("@/lib/exec/contacts");
const { contactKey, execPlan, execQueue, planView, profileButtons, stageOf, statesOf } = await import("@/lib/exec/plan");
const { followCard, phoneCard, profileCard, sentCard, startCard, waitCard } = await import("@/lib/exec/asks");
const { checkRoute, givenContact, readPlanView, teamKnowledge } = await import("@/lib/agent/router");
const { readTeam } = await import("@/lib/team/read");
const { emptyTeam } = await import("@/lib/team/types");
const { fallbackWorkflow } = await import("@/lib/agent/workflow");
const { GOALS } = await import("@/lib/agent/goals");

const item = (over: Partial<ExecItem>): ExecItem => ({ id: "venue:a", kind: "venue", name: "A", agent: "rep", agents: ["rep"], rank: 0, crowds: ["Mystery readers"], cities: ["Los Angeles"], facets: {}, action: "Pitch A", outreach: true, ...over });
const planOf = (items: ExecItem[]): ExecPlan => ({ items, steps: [], byId: new Map(items.map((i) => [i.id, i])), leftOut: [] });
const team = (over: Partial<TeamState> = {}) => ({ works: {}, outcomes: [], ...over }) as unknown as TeamState;
const fresh = (): ExecState => ({ started: 1, contacts: {}, drafts: {} });

/**
 * After Start, as the page runs it: the line in order, one small group at a time, every event applied as it lands, and
 * the line read again until it's empty (a subagent's new items join it). Nothing here presses a button.
 */
async function autoRun(plan: ExecPlan, t: TeamState, exec: ExecState) {
  const st = statesOf(t);
  const run = { queue: [] as string[], rows: {} as Record<string, string> };
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (let line = execQueue(plan, exec), passes = 0; line.length; line = execQueue(plan, exec)) {
    expect(++passes).toBeLessThan(4);
    run.queue = [...new Set([...run.queue, ...line.flat().map((l) => l.key)])];
    for (const g of line) {
      groups.push(g.map((l) => l.key));
      await runExec(
        [g],
        { name: "Brand", sells: "tinned fish" },
        (e) => {
          if (e.type === "contact") exec.contacts[e.contact.key] = e.contact;
          if (e.type === "drafts") exec.drafts[e.item] = e.drafts;
          if (e.type !== "exec" || !e.key) return;
          run.queue = run.queue.filter((k) => k !== e.key);
          if (e.row) run.rows[e.key] = e.row;
          else delete run.rows[e.key];
          for (const it of plan.items) if (it.outreach && !it.left) seen.add(stageOf(it, st(it.id), exec, Date.now(), run));
        },
        false,
      );
    }
  }
  return { groups, run, seen, stage: (it: ExecItem) => stageOf(it, st(it.id), exec, Date.now(), run) };
}

describe("after Start, the run by itself", () => {
  const shop = (n: number) => item({ id: `venue:shop-${n}`, name: `Corner Shop ${n}`, rank: n });
  const items = [
    item({ id: "venue:paper-cove", name: "Paper Cove", now: { step: 1, order: 0 }, detail: { title: "Paper Cove", facts: [{ label: "Address", value: "1 Main St, Los Angeles" }, { label: "Phone", value: "(213) 555-0100" }] } }),
    item({ id: "podcast:tin-talk", kind: "podcast", name: "Tin Talk", agent: "scout", agents: ["scout"], now: { step: 1, order: 1 } }),
    item({ id: "event:la-fish-fair", kind: "event", name: "Fish Fair", agent: "promoter", agents: ["promoter"], now: { step: 2, order: 2 }, detail: { title: "Fish Fair", facts: [], links: [{ label: "Apply", url: "https://fishfair.example.com/vendors" }] } }),
    // The same shop as a Matchmaker retailer: one contact, looked up once with Now's.
    item({ id: "retailer:paper-cove", kind: "retailer", name: "Paper Cove", agent: "matchmaker", agents: ["matchmaker"], rank: 2 }),
    ...[1, 2, 3, 4, 5, 6].map(shop),
    item({ id: "partner:cafe-calm", kind: "partner", name: "Cafe Calm", agent: "matchmaker", agents: ["matchmaker"], detail: { title: "Cafe Calm", facts: [], links: [{ label: "Instagram", url: "https://www.instagram.com/cafecalm/" }] } }),
    item({ id: "creator:sal-cooks", kind: "creator", name: "Sal Cooks", agent: "scout", agents: ["scout"] }),
    item({ id: "message:hook-1", kind: "message", name: "Tins are the new snack board", agent: "scout", agents: ["scout"], outreach: false }),
    item({ id: "venue:old-shop", name: "Old Shop", rank: 99, left: true }),
  ];

  it("takes every item to Ready or Needs a contact, Now first, a few at a time, each contact once", async () => {
    const plan = planOf(items);
    const exec = fresh();
    const { groups, run, seen, stage } = await autoRun(plan, team(), exec);
    // Never in bulk, and Now's steps lead in Athena's order.
    for (const g of groups) expect(g.length).toBeLessThanOrEqual(4);
    expect(groups[0]).toEqual(["org:paper cove", "show:tin talk"]);
    expect(groups[1]).toEqual(["event:la-fish-fair"]);
    const keys = groups.flat();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("org:old shop");
    // Rows showed queued and drafting while it ran, and nothing is left in the line or on a row.
    expect(seen).toContain("queued");
    expect(seen).toContain("drafting");
    expect(run).toEqual({ queue: [], rows: {} });
    expect(execQueue(plan, exec)).toEqual([]);
    for (const it of items.filter((i) => i.outreach && !i.left)) expect(["ready", "needs"], it.id).toContain(stage(it));
    expect(stage(items[0])).toBe("ready");
    expect(stage(items[1])).toBe("needs");
    expect(stage(items[2])).toBe("ready");
    expect(stage(items[3])).toBe("ready");
    expect(stage(items.find((i) => i.id === "partner:cafe-calm")!)).toBe("ready");
    // Every outreach item has its drafts, a call script among them.
    for (const it of items.filter((i) => i.outreach && !i.left)) expect(exec.drafts[it.id]?.call.opener, it.id).toBeTruthy();
  });

  it("looks up only what's new when a subagent adds items after the run", async () => {
    const exec = fresh();
    await autoRun(planOf(items), team(), exec);
    const more = planOf([...items, item({ id: "venue:new-deli", name: "New Deli", rank: 7 })]);
    const { groups, stage } = await autoRun(more, team(), exec);
    expect(groups).toEqual([["org:new deli"]]);
    expect(stage(more.byId.get("venue:new-deli")!)).toBe("needs");
  });

  it("leaves a sent pitch where it is", async () => {
    const exec = fresh();
    const t = team({ outcomes: [{ item: "venue:paper-cove", kind: "venue", name: "Paper Cove", agent: "rep", mark: "pitched", at: Date.now() }] } as Partial<TeamState>);
    const { stage } = await autoRun(planOf(items), t, exec);
    expect(stage(items[0])).toBe("sent");
  });
});

const SNAPSHOTS = path.join(".cache", "dev", "snapshots");
function recorded(): TeamState | undefined {
  if (!fs.existsSync(SNAPSHOTS)) return undefined;
  for (const f of fs.readdirSync(SNAPSHOTS).filter((f) => f.endsWith(".json")).sort().reverse()) {
    const raw = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS, f), "utf8")).store?.["athena:journey:v1"];
    const t = raw ? (JSON.parse(raw).journey?.team as TeamState | undefined) : undefined;
    if (t?.plan?.steps?.length && t.works.rep?.page && t.works.matchmaker?.page && t.works.promoter?.page) return t;
  }
  return undefined;
}

describe.skipIf(!recorded())("after Start, the recorded run by itself", () => {
  it("takes every outreach item to Ready or Needs a contact, in small groups, each contact once", { timeout: 60_000 }, async () => {
    const t = recorded()!;
    const plan = execPlan(t);
    const exec = fresh();
    const { groups, stage } = await autoRun(plan, { ...t, outcomes: [] }, exec);
    for (const g of groups) expect(g.length).toBeLessThanOrEqual(4);
    const keys = groups.flat();
    expect(new Set(keys).size).toBe(keys.length);
    const now = plan.items.filter((i) => i.now && i.outreach && !i.left).map((i) => contactKey(i)!);
    expect(keys.slice(0, new Set(now).size).sort()).toEqual([...new Set(now)].sort());
    for (const it of plan.items.filter((i) => i.outreach && !i.left)) expect(["ready", "needs"], it.id).toContain(stage(it));
  });
});

describe("only Start pauses without a default", () => {
  const ig = (h: string) => ({ url: `https://www.instagram.com/${h}/`, src: { label: "Their site", url: "https://cafecalm.example.com" } });
  const contact = { key: "org:cafe calm", name: "Cafe Calm", checked: ["Their site's contact page"], by: "found" as const, at: 1, ask: { site: "Instagram", options: [ig("cafecalm"), ig("cafecalmla")] } };
  const shops = [item({ id: "venue:s1", name: "Shop One" }), item({ id: "venue:s2", name: "Shop Two" })];

  it("asks Start with no default, and everything else with one it carries on with", () => {
    const start = startCard(12);
    expect(start.id).toBe("exec");
    expect(start.assumed).toBe("");
    expect(start.options.map((o) => o.label)).toEqual(["Start now", "Later"]);
    const rest = [profileCard(contact), phoneCard(shops), sentCard(shops)!, followCard(shops, 7), waitCard];
    for (const c of rest) {
      expect(c.id.startsWith("exec-"), c.id).toBe(true);
      expect(c.assumed, c.id).toBeTruthy();
      expect([...c.options.map((o) => o.label), ...(c.multi ? ["All of them"] : [])], c.id).toContain(c.assumed);
    }
  });

  it("names the accounts to choose between, the first kept until the founder picks", () => {
    const c = profileCard(contact);
    expect(c.question).toBe("Two Instagram accounts look like Cafe Calm's: which one?");
    expect(c.options).toEqual([
      { label: "@cafecalm", hint: "Linked from Their site" },
      { label: "@cafecalmla", hint: "Linked from Their site" },
    ]);
    expect(c.assumed).toBe("@cafecalm");
  });

  it("asks whether drafts went out with every one ticked", () => {
    const c = sentCard(shops)!;
    expect(c).toMatchObject({ question: "Did these go out?", multi: true, ticked: true, assumed: "All of them" });
    expect(c.id).toBe("exec-sent-venue:s1|venue:s2");
    expect(sentCard([])).toBeUndefined();
    expect(sentCard([shops[0]])!.question).toBe("Did your message to Shop One go out?");
    expect(phoneCard(shops).question).toBe("2 shops list only a phone: write call scripts for them?");
  });
});

describe("results through chat", () => {
  const goal = GOALS.find((g) => g.id === "step_up")!;
  const t = {
    ...emptyTeam(),
    workflow: fallbackWorkflow([{ ...goal, recommended: false }], { fits: false, home: false }),
    plan: {
      steps: [
        {
          n: 1,
          what: "Pitch the shops and book the fair",
          phase: "win_first",
          crowds: [],
          lines: [],
          depends: [],
          items: [
            { id: "venue:museum-of-sex", kind: "venue", name: "Museum of Sex", agent: "rep" },
            { id: "event:la-smorgasburg", kind: "event", name: "Smorgasburg LA", agent: "promoter" },
          ],
        },
      ],
    },
  } as unknown as TeamState;
  const input = { message: "Emailed Museum of Sex", history: [], brand: { name: "Brand" }, facts: [], answers: [], team: t, open: [] };

  it("moves the item the founder names, and logs what they spent", () => {
    expect(checkRoute({ do: "outcome", marks: [{ name: "Museum of Sex", mark: "pitched" }], reply: "Moved Museum of Sex to Sent." }, input)).toEqual({
      do: "outcome",
      marks: [{ item: "venue:museum-of-sex", name: "Museum of Sex", mark: "pitched" }],
      reply: "Moved Museum of Sex to Sent.",
    });
    expect(checkRoute({ do: "outcome", marks: [{ name: "the Smorgasburg LA booth", mark: "yes" }], spend: [{ name: "Smorgasburg LA", usd: 200 }] }, input)).toEqual({
      do: "outcome",
      marks: [{ item: "event:la-smorgasburg", name: "Smorgasburg LA", mark: "yes" }],
      spend: [{ item: "event:la-smorgasburg", name: "Smorgasburg LA", usd: 200 }],
      reply: "Noted: Smorgasburg LA: Yes; $200 on Smorgasburg LA.",
    });
  });

  it("drops a mark or an amount that isn't real, and asks which item when none is on the plan", () => {
    const r = checkRoute({ do: "outcome", marks: [{ name: "Museum of Sex", mark: "maybe" }, { name: "Museum of Sex", mark: "no" }], spend: [{ name: "Museum of Sex", usd: 0 }, { name: "Museum of Sex", usd: 5e6 }] }, input);
    expect(r).toMatchObject({ do: "outcome", marks: [{ item: "venue:museum-of-sex", mark: "no" }] });
    expect(r).not.toHaveProperty("spend");
    expect(checkRoute({ do: "outcome", marks: [{ name: "Some Other Gallery", mark: "pitched" }] }, input)).toEqual({ do: "reply", reply: "Which one on the plan was that? Tell me its name and I'll move it." });
  });

  it("names every item on the plan to the model, past the first 60, so any of them can be moved", () => {
    const many = Array.from({ length: 70 }, (_, k) => ({ id: `venue:shop-${k}`, kind: "venue", name: `Shop ${k} Ltd`, agent: "rep" }));
    const big = { ...t, plan: { steps: [{ n: 1, what: "Pitch the shops", phase: "win_first", crowds: [], lines: [], depends: [], items: many }] } } as unknown as TeamState;
    const k = teamKnowledge({ ...input, team: big });
    for (const s of many) expect(k).toContain(s.name);
    expect(k.match(/ \(venue, /g)).toHaveLength(60);
    expect(k).toContain("Its other outreach items, by name: ");
  });

  it("reads the plan the page sends: the server keeps no plan or pages of its own", () => {
    const sent = JSON.parse(JSON.stringify(planView({ ...t, plan: { ...t.plan!, headline: "Win LA first" } }, Date.now())));
    const wire = { ...input, team: readTeam(JSON.parse(JSON.stringify(t))), plan: readPlanView(sent) };
    expect(wire.team.plan).toBeUndefined();
    expect(checkRoute({ do: "outcome", marks: [{ name: "Museum of Sex", mark: "pitched" }] }, wire)).toMatchObject({ do: "outcome", marks: [{ item: "venue:museum-of-sex", mark: "pitched" }] });
    expect(teamKnowledge(wire)).toContain("Museum of Sex (venue, not looked up yet)");
    expect(teamKnowledge(wire)).toContain("Your plan so far: Win LA first");
    // Anything malformed is left out.
    expect(readPlanView({ headline: "x", items: [{ id: "a", name: "A", stage: "lost" }, { id: "b", stage: "ready" }, { id: "c", name: "C", kind: "venue", stage: "ready" }] })?.items).toEqual([{ id: "c", name: "C", kind: "venue", stage: "ready" }]);
    expect(readPlanView({ items: [] })).toBeUndefined();
  });

  it("adds a way in the founder gives, and only what they wrote", () => {
    const said = { ...input, message: "Museum of Sex's email is Events@MuseumOfSex.com, call (212) 689-6337, and they're @museumofsex on Instagram" };
    const r = checkRoute(
      {
        do: "outcome",
        contacts: [
          { name: "Museum of Sex", email: "events@museumofsex.com", phone: "+1 212-689-6337", dm: "https://www.instagram.com/museumofsex/", website: "https://museumofsex.com" },
          { name: "Smorgasburg LA", email: "info@smorgasburg.com" },
        ],
      },
      said,
    );
    // The website and the second email aren't in what the founder wrote, so they're dropped.
    expect(r).toEqual({
      do: "outcome",
      marks: [],
      contacts: [{ item: "venue:museum-of-sex", name: "Museum of Sex", email: "events@museumofsex.com", phone: "+1 212-689-6337", dm: "https://www.instagram.com/museumofsex/" }],
      reply: "Noted: Museum of Sex's email and phone and profile.",
    });
    expect(givenContact({ phone: "555" }, "call 555")).toEqual({});
    expect(givenContact({ address: "1 Main St, Austin" }, "they're at 1 main st, austin tx")).toEqual({ address: "1 Main St, Austin" });
  });
});

describe("two profiles that look like theirs", () => {
  const channelPage = (desc: string, links: string) =>
    `<html><head><meta property="og:url" content="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"><meta property="og:description" content="${desc}"></head><body>${links}</body></html>`;
  const igRedirect = (h: string) => `<a href="https://www.youtube.com/redirect?event=channel_header&amp;q=https%3A%2F%2Fwww.instagram.com%2F${h}%2F&amp;v=1">ig</a>`;
  pages.set("https://www.youtube.com/@salcooks", { status: 200, body: channelPage("Cooking from tins. For business: sal [at] salcooks [dot] com", igRedirect("salcooks") + igRedirect("salcooksbackup")) });

  it("keeps the first with its source and asks the founder which", async () => {
    const seed: Social[] = [{ label: "YouTube", value: "https://www.youtube.com/@salcooks", src: { label: "Found by the Scout" } }];
    const l: Lookup = { key: "person:sal cooks", name: "Sal Cooks", kind: "creator", items: [], seed: { social: seed }, hints: {} };
    const c = await findContact(l, () => {}, true);
    const src = { label: "Their YouTube channel", url: "https://www.youtube.com/@salcooks" };
    expect(c.ask).toEqual({ site: "Instagram", options: [{ url: "https://www.instagram.com/salcooks/", src }, { url: "https://www.instagram.com/salcooksbackup/", src }] });
    expect(profileButtons({ social: c.social ?? [] }).map((b) => [b.site, b.url, b.src.label])).toEqual([
      ["YouTube", "https://www.youtube.com/@salcooks", "Their YouTube channel"],
      ["Instagram", "https://www.instagram.com/salcooks/", "Their YouTube channel"],
    ]);
    expect(profileCard(c).question).toBe("Two Instagram accounts look like Sal Cooks's: which one?");
  });
});
