import { SPECIALIST_IDS, type SpecialistId } from "@/lib/agent/specialists";
import { readWorkflow } from "@/lib/agent/workflow";
import type { SavedNav } from "@/lib/agent/navigator";
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
  const kept = {
    ...(str(city.id, 80) && str(city.name, 120) ? { city: { id: str(city.id, 80), name: str(city.name, 120) } } : {}),
    ...(str(shared.crowd, 120) ? { crowd: str(shared.crowd, 120) } : {}),
    ...(nav ? { nav } : {}),
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
