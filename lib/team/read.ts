import { SPECIALIST_IDS, type SpecialistId } from "@/lib/agent/specialists";
import { readWorkflow } from "@/lib/agent/workflow";
import type { Role, SavedNav } from "@/lib/agent/navigator";
import type { RepRead, Shop } from "@/lib/agent/rep";
import type { Evidence, Source } from "@/lib/blocks/types";
import type { AreaFigures } from "@/lib/enrich/census";
import { MARKS, emptyTeam, type Answer, type Goal, type Mark, type Outcome, type TeamState, type Work, type WorkItem } from "./types";

// The team as the client sends it back (a stateless server: the journey holds its own state). Everything is
// shape-checked and cut to size; anything malformed is left out, never an error. Client-safe.

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const strs = (v: unknown, n: number, len = 200) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, n);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isAgent = (v: unknown): v is SpecialistId => typeof v === "string" && (SPECIALIST_IDS as readonly string[]).includes(v);
const team = (v: unknown) => (Array.isArray(v) ? v : []).filter(isAgent).slice(0, 6);

export function readGoal(raw: unknown): Goal | undefined {
  const g = rec(raw);
  const id = str(g.id, 60);
  const label = str(g.label, 160);
  if (!id || !label) return undefined;
  return {
    id,
    label,
    why: str(g.why, 300),
    team: team(g.team),
    conflicts: strs(g.conflicts, 8, 60),
    ...(g.recommended === true ? { recommended: true } : {}),
    ...(g.custom === true ? { custom: true } : {}),
    ...(str(g.outside, 300) ? { outside: str(g.outside, 300) } : {}),
  };
}

export const readGoals = (raw: unknown, n = 5) => (Array.isArray(raw) ? raw : []).map(readGoal).filter((g): g is Goal => !!g).slice(0, n);

const nums = (v: unknown, n: number) => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : undefined);
const figs = (v: unknown) => {
  const x = rec(v);
  return { ...(num(x.residents) ? { residents: num(x.residents) } : {}), ...(num(x.income) ? { income: num(x.income) } : {}) };
};

function readArea(raw: unknown): AreaFigures | undefined {
  const a = rec(raw);
  const zip = rec(a.zip);
  const tract = rec(a.tract);
  const out: AreaFigures = {
    ...(str(zip.id, 10) ? { zip: { id: str(zip.id, 10), ...figs(zip) } } : {}),
    ...(str(tract.id, 30) && str(tract.name, 120) ? { tract: { id: str(tract.id, 30), name: str(tract.name, 120), ...figs(tract) } } : {}),
  };
  return out.zip || out.tract ? out : undefined;
}

/** The Navigator's read as a journey kept it (§23.5 e): the Rep and Promoter of a later run work its cities. Cells
 * are left out: they never travel, only the page draws them. */
export function readNav(raw: unknown): SavedNav | undefined {
  const r = rec(raw);
  const crowds = (Array.isArray(r.crowds) ? r.crowds : []).slice(0, 3).flatMap((x) => {
    const c = rec(x);
    const id = str(c.id, 80);
    const tier = str(c.tier, 20);
    if (!id || !["win_first", "win_next", "watch"].includes(tier)) return [];
    const cities = (Array.isArray(c.cities) ? c.cities : []).slice(0, 12).flatMap((y) => {
      const f = rec(y);
      const metroId = str(f.metroId, 80);
      const name = str(f.name, 120);
      return metroId && name
        ? [{ metroId, name, ...(typeof f.score === "number" && Number.isFinite(f.score) ? { score: f.score } : {}), z: num(f.z), reason: str(f.reason, 300), leans: strs(f.leans, 8, 120) }]
        : [];
    });
    return [{ id, tier: tier as SavedNav["crowds"][number]["tier"], cities }];
  });
  const cities = (Array.isArray(r.cities) ? r.cities : []).slice(0, 8).flatMap((x) => {
    const c = rec(x);
    const metroId = str(c.metroId, 80);
    const name = str(c.name, 120);
    const center = nums(c.center, 2) as [number, number] | undefined;
    if (!metroId || !name || !center) return [];
    const bbox = nums(c.bbox, 4) as [number, number, number, number] | undefined;
    const census = figs(c.census);
    const hoods = (Array.isArray(c.hoods) ? c.hoods : []).slice(0, 16).flatMap((y) => {
      const h = rec(y);
      const hn = str(h.name, 120);
      if (!hn) return [];
      const at = nums(h.at, 2) as [number, number] | undefined;
      const heat = Object.fromEntries(Object.entries(rec(h.heat)).slice(0, 3).filter(([, v]) => typeof v === "number" && Number.isFinite(v)).map(([k, v]) => [k.slice(0, 80), v as number]));
      const area = readArea(h.area);
      return [{ name: hn, ...(h.around === true ? { around: true } : {}), ...(at ? { at } : {}), cells: num(h.cells), heat, ...(area ? { area } : {}) }];
    });
    const layers = (Array.isArray(c.layers) ? c.layers : []).slice(0, 3).flatMap((y) => {
      const l = rec(y);
      return str(l.crowd, 80) ? [{ crowd: str(l.crowd, 80), cells: [] as [number, number, number][], ...(str(l.callId, 80) ? { callId: str(l.callId, 80) } : {}) }] : [];
    });
    return [{ metroId, name, center, ...(bbox ? { bbox } : {}), ...(Object.keys(census).length ? { census } : {}), rivals: strs(c.rivals, 8, 120), yours: c.yours === true, layers, hoods }];
  });
  return crowds.length && cities.length ? { crowds, cities, cap: num(r.cap) || 2, calls: num(r.calls), callIds: strs(r.callIds, 300, 80) } : undefined;
}

const ROLES = ["anchor", "spillover", "popup", "online"];
const TIERS = ["win_first", "win_next", "watch"];
const EVIDENCE = ["contribution", "tag", "growth", "price", "fit", "rank"];
const opt = (k: string, v: string) => (v ? { [k]: v } : {});
const optNum = (k: string, v: unknown) => (typeof v === "number" && Number.isFinite(v) ? { [k]: v } : {});
const named = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : []).slice(0, n).flatMap((x) => (str(rec(x).id, 120) && str(rec(x).name, 160) ? [{ id: str(rec(x).id, 120), name: str(rec(x).name, 160) }] : []));
const why = (v: unknown) =>
  (Array.isArray(v) ? v : []).slice(0, 6).flatMap((x) => (str(rec(x).id, 120) && typeof rec(x).score === "number" ? [{ id: str(rec(x).id, 120), score: num(rec(x).score) }] : []));
const enriched = (v: unknown) => {
  const e = rec(v);
  return str(e.value, 300) && str(e.source, 40) ? { value: str(e.value, 300), source: str(e.source, 40) as Source, ...opt("url", str(e.url, 300)), ...opt("callId", str(e.callId, 80)) } : undefined;
};

function readShop(raw: unknown): Shop | undefined {
  const s = rec(raw);
  const id = str(s.id, 120);
  const name = str(s.name, 200);
  const metroId = str(s.metroId, 80);
  if (!id || !name || !metroId) return undefined;
  const contact = rec(s.contact);
  const phone = enriched(contact.phone);
  const website = enriched(contact.website);
  const site = rec(s.site);
  const crowds = Object.fromEntries(Object.entries(rec(s.crowds)).slice(0, 3).filter(([, v]) => typeof v === "number" && Number.isFinite(v)).map(([k, v]) => [k.slice(0, 80), v as number]));
  const role = str(s.role, 20);
  const reasons = (Array.isArray(s.reasons) ? s.reasons : []).slice(0, 6).flatMap((x): Evidence[] => {
    const e = rec(x);
    const kind = str(e.kind, 20);
    return EVIDENCE.includes(kind) && str(e.label, 300) ? [{ kind: kind as Evidence["kind"], label: str(e.label, 300), ...optNum("value", e.value), callId: str(e.callId, 80) }] : [];
  });
  const emails = (Array.isArray(site.emails) ? site.emails : []).slice(0, 3).flatMap((x) => (str(rec(x).value, 200) && str(rec(x).src, 300) ? [{ value: str(rec(x).value, 200), src: str(rec(x).src, 300) }] : []));
  return {
    rank: num(s.rank),
    id,
    name,
    ...opt("address", str(s.address, 300)),
    ...opt("neighbourhood", str(s.neighbourhood, 120)),
    ...optNum("lat", s.lat),
    ...optNum("lon", s.lon),
    ...optNum("priceLevel", s.priceLevel),
    ...optNum("popularity", s.popularity),
    reasons,
    tags: named(s.tags, 10),
    contact: { ...(phone ? { phone } : {}), ...(website ? { website } : {}) },
    ...(why(s.why).length ? { why: why(s.why) } : {}),
    metroId,
    city: str(s.city, 120),
    ...opt("hood", str(s.hood, 120)),
    ...(ROLES.includes(role) ? { role: role as Role } : {}),
    ...optNum("rating", s.rating),
    ...opt("hours", str(s.hours, 200)),
    ...(s.events === true ? { events: true } : {}),
    kind: str(s.kind, 60),
    crowds,
    stocked: s.stocked === true,
    ...opt("widened", str(s.widened, 200)),
    ...(str(site.src, 300)
      ? {
          site: {
            brands: strs(site.brands, 40, 120),
            sameNiche: strs(site.sameNiche, 20, 120),
            ...opt("wholesale", str(site.wholesale, 300)),
            emails,
            ...opt("form", str(site.form, 300)),
            ...opt("size", str(site.size, 120)),
            src: str(site.src, 300),
          },
        }
      : {}),
    ...(s.faire === true ? { faire: true } : {}),
    callId: str(s.callId, 80),
  };
}

/** The Rep's read as a journey kept it (§23.5 f): a pitch or a question about the shops works from it, not a new read. */
export function readRep(raw: unknown): RepRead | undefined {
  const r = rec(raw);
  const crowds = (Array.isArray(r.crowds) ? r.crowds : []).slice(0, 3).flatMap((x) => {
    const c = rec(x);
    const id = str(c.id, 80);
    const tier = str(c.tier, 20);
    if (!id || !TIERS.includes(tier)) return [];
    return [{ id, name: str(c.name, 160), tier: tier as RepRead["crowds"][number]["tier"], ...(c.nearMiss === true ? { nearMiss: true } : {}), brands: named(c.brands, 12), cities: strs(c.cities, 12, 80) }];
  });
  const cities = (Array.isArray(r.cities) ? r.cities : []).slice(0, 12).flatMap((x) => {
    const c = rec(x);
    const metroId = str(c.metroId, 80);
    const center = nums(c.center, 2) as [number, number] | undefined;
    if (!metroId || !center) return [];
    const bbox = nums(c.bbox, 4) as [number, number, number, number] | undefined;
    const hoods = (Array.isArray(c.hoods) ? c.hoods : []).slice(0, 24).flatMap((y) => {
      const h = rec(y);
      return str(h.name, 120) && ROLES.includes(str(h.role, 20)) ? [{ name: str(h.name, 120), role: str(h.role, 20) as Role }] : [];
    });
    return [{ metroId, name: str(c.name, 120), center, ...(bbox ? { bbox } : {}), yours: c.yours === true, notes: strs(c.notes, 12, 300), hoods }];
  });
  const shops = (Array.isArray(r.shops) ? r.shops : []).slice(0, 300).map(readShop).filter((s): s is Shop => !!s);
  const retailers = Object.fromEntries(
    Object.entries(rec(r.retailers)).slice(0, 3).map(([k, v]) => [
      k.slice(0, 80),
      (Array.isArray(v) ? v : []).slice(0, 20).flatMap((x) => {
        const p = rec(x);
        if (!str(p.id, 120) || !str(p.name, 160)) return [];
        return [{ id: str(p.id, 120), name: str(p.name, 160), affinity: num(p.affinity), rank: num(p.rank), ownLabel: p.ownLabel === true, qlooPick: p.qlooPick === true, callId: str(p.callId, 80), ...(why(p.why).length ? { why: why(p.why) } : {}), cities: strs(p.cities, 12, 80) }];
      }),
    ]),
  );
  const brand = rec(r.brand);
  const budget = str(r.budget, 10);
  if (!crowds.length || !cities.length || !shops.length) return undefined;
  return {
    crowds,
    cities,
    shops,
    retailers,
    budget: budget === "mid" || budget === "high" ? budget : "low",
    brand: { name: str(brand.name, 160), product: str(brand.product, 200) },
    competitors: strs(r.competitors, 12, 160),
    calls: num(r.calls),
    callIds: strs(r.callIds, 300, 80),
  };
}

/** Pitches written this session, by shop id. */
const readPitches = (raw: unknown) =>
  Object.fromEntries(Object.entries(rec(raw)).slice(0, 30).flatMap(([k, v]) => (str(rec(v).body, 4000) ? [[k.slice(0, 120), { subject: str(rec(v).subject, 300), body: str(rec(v).body, 4000) }]] : [])));

function readItem(raw: unknown): WorkItem | undefined {
  const x = rec(raw);
  const id = str(x.id, 200);
  const name = str(x.name, 200);
  if (!id || !name) return undefined;
  return {
    id,
    kind: str(x.kind, 40),
    name,
    why: str(x.why, 400),
    ...(str(x.group, 60) ? { group: str(x.group, 60) } : {}),
    ...(str(x.detail, 400) ? { detail: str(x.detail, 400) } : {}),
    ...(str(x.ref, 120) ? { ref: str(x.ref, 120) } : {}),
    sources: strs(x.sources, 8, 12),
    callIds: strs(x.callIds, 20, 80),
  };
}

function readWork(raw: unknown, agent: SpecialistId): Work | undefined {
  const w = rec(raw);
  const headline = str(w.headline, 300);
  if (!headline && !Array.isArray(w.results)) return undefined;
  const shared = rec(w.shared);
  const city = rec(shared.city);
  const handoff = rec(w.handoff);
  const nav = agent === "navigator" ? readNav(shared.nav) : undefined;
  const rep = agent === "rep" ? readRep(shared.rep) : undefined;
  const pitch = agent === "rep" ? readPitches(shared.pitch) : {};
  const kept = {
    ...(str(city.id, 80) && str(city.name, 120) ? { city: { id: str(city.id, 80), name: str(city.name, 120) } } : {}),
    ...(str(shared.crowd, 120) ? { crowd: str(shared.crowd, 120) } : {}),
    ...(nav ? { nav } : {}),
    ...(rep ? { rep } : {}),
    ...(Object.keys(pitch).length ? { pitch } : {}),
  };
  return {
    agent,
    goal: str(w.goal, 160),
    headline,
    results: (Array.isArray(w.results) ? w.results : []).map(readItem).filter((x): x is WorkItem => !!x).slice(0, 20),
    claims: (Array.isArray(w.claims) ? w.claims : []).map((c) => ({ text: str(rec(c).text, 400), sources: strs(rec(c).sources, 6, 12) })).filter((c) => c.text).slice(0, 8),
    ...(str(handoff.need, 200) ? { handoff: { need: str(handoff.need, 200) } } : {}),
    sources: (Array.isArray(w.sources) ? w.sources : [])
      .map((s) => ({ id: str(rec(s).id, 12), tool: str(rec(s).tool, 60), summary: str(rec(s).summary, 400), callIds: strs(rec(s).callIds, 20, 80) }))
      .filter((s) => s.id)
      .slice(0, 30),
    ms: num(w.ms),
    qlooCalls: num(w.qlooCalls),
    at: num(w.at),
    ...(str(w.outcomes, 400) ? { outcomes: str(w.outcomes, 400) } : {}),
    ...(str(w.changed, 400) ? { changed: str(w.changed, 400) } : {}),
    ...(Object.keys(kept).length ? { shared: kept } : {}),
    by: w.by === "agent" ? "agent" : "rules",
  };
}

function readWorks(raw: unknown): Partial<Record<SpecialistId, Work>> {
  const r = rec(raw);
  const out: Partial<Record<SpecialistId, Work>> = {};
  for (const id of SPECIALIST_IDS) {
    const w = r[id] ? readWork(r[id], id) : undefined;
    if (w) out[id] = w;
  }
  return out;
}

function readOutcome(raw: unknown): Outcome | undefined {
  const o = rec(raw);
  const item = str(o.item, 200);
  if (!item || !isAgent(o.agent) || !(MARKS as readonly string[]).includes(o.mark as string)) return undefined;
  return { item, agent: o.agent, kind: str(o.kind, 40), name: str(o.name, 200), ...(str(o.group, 60) ? { group: str(o.group, 60) } : {}), mark: o.mark as Mark, at: num(o.at) };
}

/** The founder's kept answers: one per question id, the latest. */
export function readAnswers(raw: unknown): Answer[] {
  const out = new Map<string, Answer>();
  for (const a of Array.isArray(raw) ? raw : []) {
    const r = rec(a);
    const id = str(r.id, 80);
    const question = str(r.question, 300);
    const answer = str(r.answer, 400);
    const agent = r.agent === "athena" || isAgent(r.agent) ? (r.agent as Answer["agent"]) : undefined;
    if (id && question && answer && agent) out.set(id, { id, agent, question, answer, ...(r.from === "graph" ? { from: "graph" as const } : {}) });
  }
  return [...out.values()].slice(-24);
}

export function readTeam(raw: unknown): TeamState {
  if (!raw || typeof raw !== "object") return emptyTeam();
  const t = rec(raw);
  const rev = rec(t.rev);
  return {
    ...(Array.isArray(t.proposed) ? { proposed: readGoals(t.proposed) } : {}),
    goals: readGoals(t.goals),
    works: readWorks(t.works),
    ...(t.previous ? { previous: readWorks(t.previous) } : {}),
    outcomes: (Array.isArray(t.outcomes) ? t.outcomes : []).map(readOutcome).filter((o): o is Outcome => !!o).slice(-300),
    rev: Object.fromEntries(SPECIALIST_IDS.filter((id) => typeof rev[id] === "number").map((id) => [id, num(rev[id])])),
    ...(readWorkflow(t.workflow) ? { workflow: readWorkflow(t.workflow) } : {}),
    ...(Array.isArray(t.answered) ? { answered: readAnswers(t.answered) } : {}),
  };
}
