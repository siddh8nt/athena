import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { TeamState } from "@/lib/team/types";
import { contactKey, contactOf, execPlan, holds, inScope, nextOf, nowLookups, lookupsFor, statesOf, tabItems, templateDrafts, waitOf, waitingSteps, whose, type ExecItem, type ExecPlan, type NowStep } from "@/lib/exec/plan";
import type { CrowdPage } from "@/lib/team/page";

// §23.5 (q): Execute Plan holds every item on every page once, Athena's picks under Now in her order, and looks
// a contact up once however many items share it. The recorded run lives in the gitignored .cache/dev (no Qloo data in
// the repo), so that part skips where it isn't.

const SNAPSHOTS = path.join(".cache", "dev", "snapshots");

/** The newest saved snapshot whose team has Athena's plan and the subagents' pages. */
function recorded(): TeamState | undefined {
  if (!fs.existsSync(SNAPSHOTS)) return undefined;
  for (const f of fs.readdirSync(SNAPSHOTS).filter((f) => f.endsWith(".json")).sort().reverse()) {
    const raw = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS, f), "utf8")).store?.["athena:journey:v1"];
    const t = raw ? (JSON.parse(raw).journey?.team as TeamState | undefined) : undefined;
    if (t?.plan?.steps?.length && t.works.rep?.page && t.works.matchmaker?.page && t.works.promoter?.page) return t;
  }
  return undefined;
}

/** Every item id a page carries, wherever it lists it. */
function pageIds(page: CrowdPage): string[] {
  const out: string[] = [];
  for (const s of [...page.tabs.flatMap((t) => t.sections), ...(page.across?.sections ?? [])])
    for (const b of s.blocks) {
      if (b.type === "names") b.groups.forEach((g) => g.names.forEach((n) => n.item && out.push(n.item)));
      if (b.type === "lines") b.lines.forEach((l) => l.item && out.push(l.item));
      if (b.type === "table") b.rows.forEach((r) => r.detail?.item && out.push(r.detail.item));
      if (b.type === "calendar") [...b.items.map((c) => c.item), ...(b.list?.rows ?? []).map((r) => r.detail?.item)].forEach((i) => i && out.push(i));
      if (b.type === "checks") b.checks.forEach((c) => out.push(c.item));
      if (b.type === "pipeline" || b.type === "working") b.items.forEach((i) => out.push(i.item));
    }
  return out;
}

describe.skipIf(!recorded())("Execute Plan of the recorded run", () => {
  const team = recorded()!;
  const plan = team ? execPlan(team) : undefined!;

  it("holds every item on every page exactly once", () => {
    const ids = plan.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ["rep", "matchmaker", "promoter", "navigator", "scout"] as const) {
      const page = team.works[a]?.page;
      if (page) for (const id of pageIds(page)) expect(plan.byId.has(id), `${a}: ${id}`).toBe(true);
    }
  });

  it("puts Athena's picks under Now in her order", () => {
    const now = tabItems(plan, "now");
    const want: string[] = [];
    for (const s of team.plan!.steps ?? []) for (const id of s.items?.length ? s.items.map((i) => i.id) : [`step:${s.what}`]) if (!want.includes(id)) want.push(id);
    expect(now.map((i) => i.id)).toEqual(want);
    for (const it of now) expect(it.now!.step).toBe(team.plan!.steps!.find((s) => (s.items?.length ? s.items.some((i) => i.id === it.id) : `step:${s.what}` === it.id))!.n);
  });

  it("files every item under one subagent, a planned one under the subagent Athena planned it for", () => {
    for (const s of team.plan!.steps ?? []) for (const pi of s.items ?? []) expect(plan.byId.get(pi.id)!.agent).toBe(pi.agent);
    for (const it of plan.items) expect(it.agent === "athena" || it.kind === "step" || it.agents.includes(it.agent) || !!it.left).toBe(true);
  });

  it("gives no contact detail without its source", () => {
    for (const it of plan.items) {
      const c = contactOf(it, team.exec);
      if (!c) continue;
      for (const f of [c.address, c.website, c.phone, c.email, c.form, ...c.social]) if (f) expect(f.src.label, `${it.id}`).toBeTruthy();
    }
  });

  it("looks a shared contact up once, and a re-run only what's new", () => {
    const groups = nowLookups(plan, team.exec);
    const keys = groups.flat().map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Save the first step's contacts and drafts beside what the run already holds: the next run leaves them out.
    const first = groups[0] ?? [];
    const exec = {
      ...team.exec,
      contacts: { ...team.exec?.contacts, ...Object.fromEntries(first.map((l) => [l.key, { key: l.key, name: l.name, checked: ["A web search"], by: "found" as const, at: 1 }])) },
      drafts: { ...team.exec?.drafts, ...Object.fromEntries(first.flatMap((l) => l.items.map((i) => [i.id, templateDrafts(i, { name: "Brand" })]))) },
    };
    const again = nowLookups(plan, exec).flat().map((l) => l.key);
    for (const l of first) expect(again).not.toContain(l.key);
    expect(again.length).toBe(keys.length - first.length);
  });
});

// ---- Made-up items

const item = (over: Partial<ExecItem>): ExecItem => ({ id: "venue:a", kind: "venue", name: "A", agent: "rep", agents: ["rep"], rank: 0, crowds: ["Mystery readers"], cities: ["Los Angeles"], facets: {}, action: "Pitch A", outreach: true, ...over });
const team = (over: Partial<TeamState> = {}) => ({ works: {}, outcomes: [], ...over }) as unknown as TeamState;
const DAY = 24 * 60 * 60 * 1000;

describe("the next action on an item", () => {
  const it0 = item({});
  const none = statesOf(team())(it0.id);

  it("walks Find contact → Review draft → Mark pitched → Log reply → Follow up", () => {
    expect(nextOf(it0, none, undefined, 0)?.do).toBe("find");
    const found = { contacts: { [contactKey(it0)!]: { key: contactKey(it0)!, name: "A", email: { value: "hi@a.com", src: { label: "Their site" } }, checked: ["Their site"], by: "found" as const, at: 0 } }, drafts: {} };
    expect(nextOf(it0, none, found, 0)?.do).toBe("draft");
    expect(nextOf(it0, none, { ...found, opened: { [it0.id]: 1 } }, 0)?.do).toBe("pitched");
    const pitched = statesOf(team({ outcomes: [{ item: it0.id, kind: "venue", name: "A", agent: "rep", mark: "pitched", at: 0 }] } as never))(it0.id);
    expect(nextOf(it0, pitched, found, 3 * DAY)?.do).toBe("reply");
    expect(nextOf(it0, pitched, found, 8 * DAY)?.do).toBe("follow");
  });

  it("asks for a contact, not a send, when the lookup found no way in", () => {
    const k = contactKey(it0)!;
    const bare = (over = {}) => ({ contacts: { [k]: { key: k, name: "A", checked: ["A web search"], by: "found" as const, at: 0, ...over } }, drafts: {} });
    expect(nextOf(it0, none, bare(), 0)?.do).toBe("add");
    expect(nextOf(it0, none, bare({ website: { value: "https://a.com", src: { label: "A web search" } } }), 0)?.do).toBe("add");
    expect(nextOf(it0, none, bare({ phone: { value: "212 555 0100", src: { label: "A web search" } } }), 0)?.do).toBe("draft");
    expect(nextOf(it0, none, bare({ social: [{ label: "Instagram", value: "https://instagram.com/a", src: { label: "A web search" } }] }), 0)?.do).toBe("draft");
  });

  it("asks nothing of an item that's done, skipped or answered", () => {
    const done = statesOf(team({ outcomes: [{ item: it0.id, kind: "venue", name: "A", agent: "rep", mark: "yes", at: 0 }] } as never))(it0.id);
    expect(nextOf(it0, done, undefined, 0)).toBeUndefined();
  });

  it("gives a step or a hook one Done button", () => {
    expect(nextOf(item({ id: "step:x", kind: "step", outreach: false }), none, undefined, 0)?.do).toBe("done");
    expect(nextOf(item({ id: "message:x", kind: "message", outreach: false }), none, undefined, 0)?.do).toBe("hook");
  });
});

describe("steps that wait on another", () => {
  const step = (n: number, items: string[], depends: number[] = []): NowStep => ({ n, what: `Step ${n}`, phase: "shared", crowds: [], needs: "", depends, items });
  const plan = { items: [], steps: [step(1, ["venue:a", "venue:b"]), step(2, ["venue:c"], [1])], byId: new Map() } as unknown as ExecPlan;
  const marked = (marks: [string, "yes" | "no"][]) => statesOf(team({ outcomes: marks.map(([item, mark], i) => ({ item, kind: "venue", name: item, agent: "rep", mark, at: i })) } as never));

  it("opens once every item of the step it waits on is settled and one went well", () => {
    expect(waitingSteps(plan, marked([])).get(2)).toEqual([1]);
    expect(holds(plan, marked([["venue:a", "no"], ["venue:b", "no"]]), 1)).toBe(false);
    expect(waitingSteps(plan, marked([["venue:a", "yes"], ["venue:b", "no"]])).has(2)).toBe(false);
  });

  it("stops waiting once the founder starts it anyway", () => {
    expect(waitingSteps(plan, marked([]), { contacts: {}, drafts: {}, early: [2] }).has(2)).toBe(false);
  });
});

describe("the follow-up wait", () => {
  const venue = item({});
  const pod = item({ id: "podcast:b", kind: "podcast", name: "B", agent: "matchmaker", agents: ["matchmaker"] });

  it("is the default, or the latest rule that covers the item", () => {
    expect(waitOf(venue).days).toBe(7);
    const exec = { contacts: {}, drafts: {}, wait: { days: 5, rules: [{ days: 14, scope: { kinds: ["podcast"] }, text: "podcasts get two weeks", at: 1 }] } };
    expect(waitOf(venue, exec).days).toBe(5);
    expect(waitOf(pod, exec)).toEqual({ days: 14, rule: "podcasts get two weeks" });
  });

  it("covers by subagent, city and crowd", () => {
    expect(inScope({ agents: ["rep"], cities: ["Los Angeles"] }, venue)).toBe(true);
    expect(inScope({ agents: ["matchmaker"] }, venue)).toBe(false);
    expect(inScope({ cities: ["Chicago"] }, venue)).toBe(false);
    expect(inScope({ crowds: ["mystery"] }, venue)).toBe(true);
  });
});

describe("contacts and lookups", () => {
  it("keys a shop listed twice as one place, and a creator as a person", () => {
    expect(contactKey({ kind: "venue", name: "The Last Bookstore" })).toBe(contactKey({ kind: "partner", name: "Last Bookstore" }));
    expect(contactKey({ kind: "creator", name: "Ann" })).toBe("person:ann");
    expect(contactKey({ kind: "neighbourhood", name: "Glendale" })).toBeUndefined();
    expect(contactKey({ id: "event:tour los angeles", kind: "event", name: "Tour" })).not.toBe(contactKey({ id: "event:tour new york", kind: "event", name: "Tour" }));
  });

  it("puts what the founder added ahead of what was found", () => {
    const it0 = item({});
    const key = contactKey(it0)!;
    const c = contactOf(it0, { contacts: { [key]: { key, name: "A", email: { value: "a@a.com", src: { label: "Their site" } }, checked: ["Their site's contact page"], by: "found", at: 0 } }, yours: { [key]: { key, name: "A", email: { value: "buyer@a.com", src: { label: "Added by you" } }, checked: [], by: "you", at: 1 } }, drafts: {} })!;
    expect(c.email?.value).toBe("buyer@a.com");
  });

  it("groups a manual lookup in small sets, top-ranked first, a shared contact once", () => {
    const its = Array.from({ length: 9 }, (_, i) => item({ id: `venue:v${i}`, name: `V${i % 8}`, rank: 9 - i }));
    const groups = lookupsFor(its);
    expect(groups.map((g) => g.length)).toEqual([4, 4]);
    expect(groups[0][0].name).toBe("V0");
  });

  it("looks again, when asked, only at a contact that gave no way in", () => {
    const it0 = item({});
    const k = contactKey(it0)!;
    const saved = (over = {}) => ({ contacts: { [k]: { key: k, name: "A", checked: ["A web search"], by: "found" as const, at: 0, ...over } }, drafts: { [it0.id]: { email: { subject: "s", body: "b" }, dm: "d", call: {} as never, at: 0 } } });
    const bare = lookupsFor([it0], saved()).flat();
    expect(bare.map((l) => [l.key, !!l.known, !!l.again])).toEqual([[k, false, true]]);
    expect(lookupsFor([it0], saved({ phone: { value: "212 555 0100", src: { label: "A web search" } } }))).toEqual([]);
  });

  it("makes a name possessive once (Rothy's stays Rothy's)", () => {
    expect([whose("Rothy's"), whose("Book Soup"), whose("Joe’s ")]).toEqual(["Rothy's", "Book Soup's", "Joe’s"]);
  });

  it("writes template drafts from the item alone", () => {
    const d = templateDrafts({ id: "venue:a", kind: "venue", name: "Book Soup", agent: "rep", action: "Pitch Book Soup", facts: [] }, { name: "Fishwife", sells: "tinned fish" });
    expect(d.email.body).toContain("Fishwife");
    expect(d.dm).toContain("Book Soup");
    expect(d.call.opener).toContain("Fishwife");
  });
});
