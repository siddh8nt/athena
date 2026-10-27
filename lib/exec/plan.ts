import type { CrowdPage, Detail } from "@/lib/team/page";
import type { Contact, Drafts, ExecState, Field, FitVerdict, Mark, PlanStep, Src, Task, TaskStatus, TeamState, WaitScope } from "@/lib/team/types";
import { nameOf, type SpecialistId } from "@/lib/agent/specialists";
import { needsOf, statusFromMark, stepAgent, stepId } from "@/lib/agent/executive";
import { latest } from "@/lib/agent/outcomes";
import { founderLine } from "@/lib/agent/founder-line";

// Execute Plan (PRD §23.5 q): Athena's order turned into the founder's end output. Every trackable item on every
// subagent's page is on it exactly once, under the subagent that owns it; Athena's picks are also under Now, in her
// order. The Executive adds no reasoning about order: Now is her plan's steps as they stand. Contacts are saved per
// place, organisation or person, so an item two subagents list, or a chain with several items, is looked up once.
// Pure code, client-safe.

export type ExecAgent = SpecialistId | "athena";

/** The plan's tabs: Now, a tab per subagent with tasks, then Results. The Analyst has none: its tiers set the order. */
export const EXEC_TABS = ["now", "rep", "matchmaker", "promoter", "navigator", "scout", "results"] as const;
export type ExecTab = (typeof EXEC_TABS)[number];

/** Who owns an item several subagents list: the one whose work acts on it most directly. */
const OWNERS: SpecialistId[] = ["rep", "matchmaker", "promoter", "navigator", "scout"];

/** One of Athena's steps, as Now shows it: what it waits on, and where the subagents disagree about it. `items` is every
 *  item the step names, including one first placed under an earlier step. */
export type NowStep = { n: number; what: string; phase: PlanStep["phase"]; crowds: string[]; needs: string; depends: number[]; items: string[]; notes?: string[] };

export type ExecItem = {
  /** The subagents' item id, so a mark here is the same mark there. */
  id: string;
  kind: string;
  name: string;
  group?: string;
  /** The subagent it files under and whose marks it carries; "athena" for a step that acts on no result. */
  agent: ExecAgent;
  /** Every subagent whose page lists it. */
  agents: SpecialistId[];
  /** Its place in the owner's own ranking (the order its page lists it). */
  rank: number;
  crowds: string[];
  cities: string[];
  /** The owner's filters for it (neighbourhood, entry route, band, budget fit…), crowd and city aside. */
  facets: Record<string, string[]>;
  /** The owner's detail: its facts, links and pitch. */
  detail?: Detail;
  /** One action, in the founder's words: "Pitch Museum of Sex". */
  action: string;
  /** It's reached by writing to someone, so it has a contact and drafts. */
  outreach: boolean;
  /** A step of an event's checklist: the event's id. */
  parent?: string;
  /** A sourced date (an event's, a moment's). */
  date?: string;
  /** Why it's here, from the owner: a reason, a "lead with…". */
  note?: string;
  /** No longer on any page, kept because the founder worked on it. */
  left?: boolean;
  /** Its place under Now: the step it's first named in, and its order across Now. */
  now?: { step: number; order: number };
  /** The brand-fit check's note for the founder (§23.6 n): "Adults-only venue: lead with the gift shop". */
  caution?: string;
};

/** An item the brand-fit check left out (§23.6 n), with its reason, for the "Left out" line. */
export type LeftOut = { id: string; name: string; kind: string; agent: SpecialistId; why: string };

export type ExecPlan = { items: ExecItem[]; steps: NowStep[]; byId: Map<string, ExecItem>; leftOut: LeftOut[] };

/** The items the brand-fit check left out, less the ones the founder brought back. */
export function leftOutOf(fit: Record<string, FitVerdict> | undefined, kept: string[] = []): Set<string> {
  const back = new Set(kept);
  return new Set(Object.entries(fit ?? {}).flatMap(([id, v]) => (v.fit === "out" && !back.has(id) ? [id] : [])));
}

const kindOf = (id: string) => id.slice(0, Math.max(0, id.indexOf(":")));
/** "Los Angeles, CA" and "Los Angeles" are one city on the plan. */
const cityOf = (s: string) => s.replace(/,\s*[A-Z]{2}$/, "").trim();
export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w ]+/g, "").replace(/\s+/g, " ").replace(/^the /, "").trim();

const ACTION: Record<string, (name: string, it: { facets: Record<string, string[]> }) => string> = {
  venue: (n) => `Pitch ${n}`,
  retailer: (n) => `Apply to ${n}`,
  partner: (n) => `Ask ${n}`,
  creator: (n) => `Ask ${n}`,
  podcast: (n) => `Ask ${n} to have you on`,
  event: (n) => `Apply to ${n}`,
  moment: (n) => `Tie in ${n}`,
  audience: (n) => `Show up in ${n}`,
  show: (n) => `Reference ${n}`,
  message: (n) => n,
  neighbourhood: (n, it) => {
    const role = it.facets.Role?.[0] ?? "";
    return /anchor/i.test(role) ? `Start in ${n}` : /spill/i.test(role) ? `Test ${n}` : /pop/i.test(role) ? `Pop up in ${n}` : /online|geo|target/i.test(role) ? `Geo-target ${n}` : `Try ${n}`;
  },
};
const OUTREACH = new Set(["venue", "retailer", "partner", "creator", "podcast", "event"]);
export const actionOf = (kind: string, name: string, facets: Record<string, string[]> = {}) => (ACTION[kind] ?? ((n: string) => n))(name, { facets });

// ---- Reading the pages

type Visit = { id: string; name: string; weak?: boolean; group?: string; crowds: string[]; cities: string[]; facets?: Record<string, string[]>; detail?: Detail; note?: string; date?: string; parent?: string };

/** Every item a page lists, in its order (the subagent's ranking): crowd tabs first, then Across all three. */
function visits(page: CrowdPage): Visit[] {
  const out: Visit[] = [];
  const titles = new Map((page.across?.sections ?? []).map((s) => [s.id, s.title]));
  const secs = [...page.tabs.flatMap((t) => t.sections.map((s) => ({ s, crowd: t.crowd.name as string | undefined }))), ...(page.across?.sections ?? []).map((s) => ({ s, crowd: undefined }))];
  for (const { s, crowd } of secs) {
    const here = { crowds: crowd ? [crowd] : [], cities: s.id.startsWith("city:") ? [cityOf(s.title)] : [] };
    const parent = /^Plan for /.test(s.title) ? s.title.slice(9).trim() : undefined;
    for (const b of s.blocks) {
      if (b.type === "names") for (const g of b.groups) for (const n of g.names) n.item && out.push({ id: n.item, name: n.name, ...here, note: n.note });
      if (b.type === "lines") for (const l of b.lines) l.item && out.push({ id: l.item, name: l.text, weak: true, ...here, note: l.reason });
      if (b.type === "table") {
        const role = b.columns.indexOf("Role");
        for (const r of b.rows) {
          const d = r.detail;
          if (!d?.item) continue;
          const facets = { ...(r.facets ?? {}), ...(role >= 0 && r.cells[role] ? { Role: [r.cells[role]] } : {}) };
          out.push({ id: d.item, name: d.title || (r.cells[0] ?? "").replace(/^\d+\.\s+/, ""), group: d.group, ...here, facets, detail: d });
        }
      }
      if (b.type === "calendar") {
        for (const c of b.items) c.item && out.push({ id: c.item, name: c.name, group: c.group, crowds: [...here.crowds, ...c.crowds], cities: c.city && c.city !== "US-wide" ? [cityOf(c.city)] : here.cities, detail: c.detail, date: c.date, note: c.note });
        for (const r of b.list?.rows ?? []) r.detail?.item && out.push({ id: r.detail.item, name: r.detail.title, group: r.detail.group, ...here, facets: r.facets, detail: r.detail });
      }
      if (b.type === "checks")
        for (const c of b.checks) {
          const city = here.cities.length ? here.cities : c.group && titles.has(`city:${c.group}`) ? [cityOf(titles.get(`city:${c.group}`)!)] : [];
          out.push({ id: c.item, name: c.text, group: c.group, crowds: here.crowds, cities: city, note: c.detail, parent });
        }
      if (b.type === "pipeline") for (const i of b.items) out.push({ id: i.item, name: i.name, weak: true, group: i.group, ...here, facets: i.facets });
    }
  }
  return out;
}

type Acc = { id: string; name: string; weak: boolean; group?: string; first: Map<SpecialistId, number>; crowds: Set<string>; cities: Set<string>; facets: Map<string, Set<string>>; details: Map<SpecialistId, Detail>; note?: string; date?: string; parent?: string };

/**
 * Execute Plan from the team as it stands: every item on every page once, owned by one subagent; Athena's steps
 * as Now; and what the founder worked on that has since left the pages.
 */
export function execPlan(team: TeamState): ExecPlan {
  const acc = new Map<string, Acc>();
  for (const agent of OWNERS) {
    const page = team.works[agent]?.page;
    if (!page) continue;
    visits(page).forEach((v, i) => {
      const a: Acc = acc.get(v.id) ?? { id: v.id, name: v.name, weak: !!v.weak, first: new Map(), crowds: new Set(), cities: new Set(), facets: new Map(), details: new Map() };
      acc.set(v.id, a);
      if (a.weak && !v.weak) Object.assign(a, { name: v.name, weak: false });
      if (!a.first.has(agent)) a.first.set(agent, i);
      a.group ??= v.group;
      for (const c of v.crowds) a.crowds.add(c);
      for (const c of v.cities) a.cities.add(c);
      for (const [k, vals] of Object.entries(v.facets ?? {})) {
        if (k === "Crowd") vals.forEach((c) => a.crowds.add(c));
        else if (k === "City") vals.forEach((c) => a.cities.add(cityOf(c)));
        else vals.forEach((x) => (a.facets.get(k) ?? a.facets.set(k, new Set()).get(k)!).add(x));
      }
      if (v.detail && !a.details.has(agent)) a.details.set(agent, v.detail);
      a.note ??= v.note;
      a.date ??= v.date;
      a.parent ??= v.parent;
    });
  }

  // What the brand-fit check left out isn't a row, unless the founder already worked on it (§23.6 n).
  const fit = team.plan?.fit;
  const marked = new Set([...(team.outcomes ?? []).map((o) => o.item), ...Object.keys(team.tasks ?? {})]);
  const out = new Set([...leftOutOf(fit, team.exec?.kept)].filter((id) => !marked.has(id)));
  const leftOut: LeftOut[] = [...out].flatMap((id) => (acc.has(id) ? [{ id, name: fit![id].name, kind: fit![id].kind, agent: fit![id].agent, why: fit![id].why ?? "" }] : []));
  for (const id of out) acc.delete(id);

  const planned = new Map<string, SpecialistId>();
  for (const s of team.plan?.steps ?? []) for (const pi of s.items ?? []) if (!planned.has(pi.id)) planned.set(pi.id, pi.agent);

  const items: ExecItem[] = [];
  const byId = new Map<string, ExecItem>();
  const add = (it: ExecItem) => (items.push(it), byId.set(it.id, it), it);
  for (const a of acc.values()) {
    const agents = OWNERS.filter((x) => a.first.has(x));
    const pa = planned.get(a.id);
    const agent = pa && a.first.has(pa) ? pa : agents[0];
    const kind = kindOf(a.id);
    const facets = Object.fromEntries([...a.facets].map(([k, v]) => [k, [...v]]));
    const detail = a.details.get(agent) ?? [...a.details.values()][0];
    add({
      id: a.id,
      kind,
      name: a.name,
      ...(a.group ? { group: a.group } : {}),
      agent,
      agents,
      rank: a.first.get(agent) ?? 0,
      crowds: [...a.crowds],
      cities: [...a.cities],
      facets,
      ...(detail ? { detail } : {}),
      action: kind === "step" ? a.name : actionOf(kind, a.name, facets),
      outreach: OUTREACH.has(kind),
      ...(a.date ? { date: a.date } : {}),
      ...(a.note ? { note: a.note } : {}),
      ...(a.parent ? { parent: a.parent } : {}),
      ...(fit?.[a.id]?.fit === "note" && fit[a.id].why ? { caution: fit[a.id].why } : {}),
    });
  }
  // A checklist step belongs to its event: the "Plan for …" section names it.
  const events = new Map(items.filter((i) => i.kind === "event").map((i) => [norm(i.name), i.id]));
  for (const it of items) if (it.parent) it.parent = events.get(norm(it.parent)) ?? it.parent;

  // Now: Athena's steps in her order. An item goes under the first step that names it; a step that acts on no result is
  // a task of its own.
  const steps: NowStep[] = [];
  let order = 0;
  for (const s of team.plan?.steps ?? []) {
    steps.push({ n: s.n, what: s.what, phase: s.phase, crowds: s.crowds, needs: needsOf(s), depends: s.depends, items: s.items?.length ? s.items.filter((i) => !out.has(i.id)).map((i) => i.id) : [stepId(s)], ...(s.notes?.length ? { notes: s.notes } : {}) });
    const place = (it: ExecItem) => void (it.now ??= { step: s.n, order: order++ });
    if (!s.items?.length) {
      const id = stepId(s);
      place(byId.get(id) ?? add({ id, kind: "step", name: s.what, agent: stepAgent(s), agents: [], rank: s.n, crowds: s.crowds, cities: [], facets: {}, action: s.what, outreach: false }));
      continue;
    }
    for (const pi of s.items) {
      if (out.has(pi.id)) continue;
      place(byId.get(pi.id) ?? add({ id: pi.id, kind: pi.kind, name: pi.name, ...(pi.group ? { group: pi.group } : {}), agent: pi.agent, agents: [pi.agent], rank: 0, crowds: s.crowds, cities: [], facets: {}, action: actionOf(pi.kind, pi.name), outreach: OUTREACH.has(pi.kind) }));
    }
  }

  // What the founder marked or set that's no longer on any page stays, so Skipped and Results still show it.
  for (const o of latest(team.outcomes))
    if (!byId.has(o.item)) add({ id: o.item, kind: o.kind, name: o.name, ...(o.group ? { group: o.group } : {}), agent: o.agent, agents: [o.agent], rank: Number.MAX_SAFE_INTEGER, crowds: [], cities: [], facets: {}, action: actionOf(o.kind, o.name), outreach: OUTREACH.has(o.kind), left: true });
  for (const [id, n] of Object.entries(team.tasks ?? {})) {
    if (byId.has(id) || !n.task) continue;
    const kind = n.task.item?.kind ?? "step";
    add({ id, kind, name: n.task.item?.name ?? n.task.action, agent: n.task.agent, agents: n.task.agent === "athena" ? [] : [n.task.agent], rank: Number.MAX_SAFE_INTEGER, crowds: n.task.crowds, cities: [], facets: {}, action: n.task.action, outreach: OUTREACH.has(kind), left: true });
  }
  return { items, steps, byId, leftOut };
}

/** A tab's items: Now in Athena's order, a subagent's in its own ranking. */
export function tabItems(plan: ExecPlan, tab: ExecTab): ExecItem[] {
  if (tab === "results") return [];
  if (tab === "now") return plan.items.filter((i) => i.now).sort((a, b) => a.now!.order - b.now!.order);
  return plan.items.filter((i) => i.agent === tab).sort((a, b) => a.rank - b.rank);
}

// ---- Status

/** Where an item stands: a status set by hand after its latest mark wins, else the mark decides. */
export type ItemState = { status: TaskStatus; mark?: Mark; at?: number; by?: SpecialistId };

export function statesOf(team: TeamState): (id: string) => ItemState {
  const last = new Map(latest(team.outcomes).map((o) => [o.item, o]));
  return (id) => {
    const m = last.get(id);
    const n = team.tasks?.[id];
    const status = n?.status && (!m || n.at >= m.at) ? n.status : statusFromMark(m?.mark);
    return { status, ...(m ? { mark: m.mark, at: m.at, by: m.agent } : {}) };
  };
}

/** An item as a status set by hand keeps it, so it stays on the plan if it leaves the pages. */
export function taskOf(plan: ExecPlan, it: ExecItem, status: TaskStatus): Task {
  const s = plan.steps.find((x) => x.n === it.now?.step);
  return {
    id: it.id,
    step: s?.n ?? 0,
    stepWhat: s?.what ?? "",
    phase: s?.phase ?? "shared",
    crowds: it.crowds,
    agent: it.agent,
    action: it.action,
    needs: s?.needs ?? "",
    ...(it.kind !== "step" ? { item: { id: it.id, kind: it.kind, name: it.name, ...(it.group ? { group: it.group } : {}) } } : {}),
    status,
  };
}

/** A step holds once each of its items is settled (done or skipped) and at least one went well: what waits on it opens. */
export function holds(plan: ExecPlan, state: (id: string) => ItemState, n: number): boolean {
  const ids = plan.steps.find((s) => s.n === n)?.items ?? [];
  const st = ids.map((id) => state(id).status);
  return st.length > 0 && st.every((x) => x === "done" || x === "skipped") && st.includes("done");
}

/** Now's steps that still wait, with the steps they wait on: one they depend on doesn't hold yet, and the founder
 *  hasn't started them anyway. */
export function waitingSteps(plan: ExecPlan, state: (id: string) => ItemState, exec?: ExecState): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const s of plan.steps) {
    if (exec?.early?.includes(s.n)) continue;
    const on = s.depends.filter((d) => !holds(plan, state, d));
    if (on.length) out.set(s.n, on);
  }
  return out;
}

// ---- Contacts

const CONTACT_KIND: Record<string, "org" | "person" | "show" | "event"> = { venue: "org", retailer: "org", partner: "org", creator: "person", podcast: "show", event: "event" };
export const isPerson = (kind: string) => CONTACT_KIND[kind] === "person" || CONTACT_KIND[kind] === "show";
/** A name made possessive once: a brand already called "Rothy's" stays "Rothy's". */
export const whose = (name: string) => (/['’]s$/i.test(name.trim()) ? name.trim() : `${name.trim()}'s`);

/** One key per place, organisation, person or show: a venue that's a Rep shop and a Promoter host, or a chain with
 *  several items, is one contact. An event is one per city (its id says which): a tour's dates are different venues. */
export const contactKey = (it: { id?: string; kind: string; name: string }) =>
  it.kind === "event" && it.id ? `event:${it.id.slice(6)}` : CONTACT_KIND[it.kind] ? `${CONTACT_KIND[it.kind]}:${norm(it.name)}` : undefined;

/** A DM link. `ok`: the page Athena's server saw the profile on, which a profile button needs (§23.5 r). */
export type Social = Field & { label: string; ok?: Src };

/** Instagram, TikTok and YouTube profiles: the ones that get an "Open on …" button. */
export type ProfileSite = "Instagram" | "TikTok" | "YouTube";
const IG_NOT_PROFILES = /^(p|reel|reels|tv|explore|stories|accounts|about|developer|legal|direct|web|api|privacy|terms)$/i;

/** A profile link's platform, handle and plain address, or undefined when the link isn't one person's or show's profile. */
export function profileOf(url?: string | null): { site: ProfileSite; handle: string; url: string } | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return undefined;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const [a, b] = u.pathname.split("/").filter(Boolean).map((x) => decodeURIComponent(x));
  if (host === "instagram.com" && a && /^[A-Za-z0-9._]{1,30}$/.test(a) && !IG_NOT_PROFILES.test(a)) return { site: "Instagram", handle: a.toLowerCase(), url: `https://www.instagram.com/${a}/` };
  if (host === "tiktok.com" && a && /^@[A-Za-z0-9._]{2,24}$/.test(a)) return { site: "TikTok", handle: a.slice(1).toLowerCase(), url: `https://www.tiktok.com/${a}` };
  if (host === "youtube.com") {
    if (a && /^@[A-Za-z0-9._-]{3,30}$/.test(a)) return { site: "YouTube", handle: a.slice(1).toLowerCase(), url: `https://www.youtube.com/${a}` };
    if (a === "channel" && b && /^UC[\w-]{22}$/.test(b)) return { site: "YouTube", handle: b, url: `https://www.youtube.com/channel/${b}` };
    if ((a === "c" || a === "user") && b && /^[\w.-]{1,100}$/.test(b)) return { site: "YouTube", handle: `${a}/${b}`.toLowerCase(), url: `https://www.youtube.com/${a}/${b}` };
  }
  return undefined;
}

/** The "Open on …" buttons: profiles the server saw, or the founder gave; each with the page that shows it. */
export function profileButtons(c?: { social: Social[] }): { site: ProfileSite; url: string; src: Src }[] {
  const out = new Map<string, { site: ProfileSite; url: string; src: Src }>();
  for (const s of c?.social ?? []) {
    const p = profileOf(s.value);
    const src = s.ok ?? (s.src.label === "From you" ? s.src : undefined);
    if (p && src && !out.has(p.site)) out.set(p.site, { site: p.site, url: p.url, src });
  }
  return [...out.values()];
}
/** What the subagents' pages already hold for an item, each with its source. */
export type Seed = { address?: Field; website?: Field; phone?: Field; email?: Field; form?: Field; social?: Social[] };

const SOCIAL: Record<string, string> = { instagram: "Instagram", x: "X", twitter: "X", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", linkedin: "LinkedIn", threads: "Threads", twitch: "Twitch", profile: "Profile" };
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const cap = (s: string) => `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`;
/** A link without the tracking a listing adds to it (?y_source=…, ?utm_…), so the founder sees the plain address. */
const bare = (url: string): string => {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|y_source$|fbclid$|gclid$|ref$|ref_src$)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
};

export function seedOf(it: ExecItem): Seed {
  const d = it.detail;
  if (!d) return {};
  const by = it.agent === "athena" ? "Athena" : `the ${nameOf(it.agent)}`;
  const fromQloo = it.kind === "venue" && it.agent === "rep";
  const fact = (l: string) => d.facts.find((f) => f.label === l)?.value?.trim();
  const out: Seed = {};
  const address = fact("Address");
  if (address && !isPerson(it.kind)) out.address = { value: address, src: { label: fromQloo ? "Qloo's place record" : `Found by ${by}` } };
  const phone = fact("Phone");
  if (phone && /\d{3}/.test(phone)) out.phone = { value: phone, src: { label: fromQloo ? "Qloo's place record" : `Found by ${by}` } };
  for (const l0 of d.links ?? []) {
    const l = { ...l0, url: bare(l0.url) };
    const k = l.label.toLowerCase();
    if (k === "website") out.website ??= { value: l.url, src: { label: fromQloo ? "Qloo's place record" : `Found by ${by}`, url: l.url } };
    else if (k === "contact form" || k === "apply" || k === "partnerships page") out.form ??= { value: l.url, src: { label: `Found by ${by}`, url: l.url } };
    else if (SOCIAL[k]) (out.social ??= []).push({ label: SOCIAL[k], value: l.url, src: { label: `Found by ${by}`, url: l.url } });
  }
  if (d.draft?.to) out.email = { value: d.draft.to, src: /^https?:/.test(d.draft.toSrc ?? "") ? { label: "Their site", url: d.draft.toSrc } : { label: cap(d.draft.toSrc || `Found by ${by}`) } };
  for (const l of ["Contact", "Buyer contact", "Email"]) {
    const v = fact(l);
    const e = v?.match(EMAIL)?.[0];
    if (!e || out.email) continue;
    const from = /\(from ([^)]+)\)/.exec(v!)?.[1] ?? /\(([^)]+)\)/.exec(v!)?.[1];
    out.email = { value: e.toLowerCase(), src: { label: from ? cap(from) : `Found by ${by}` } };
  }
  return out;
}

/** An item's contact card: the founder's own first, then what the pages hold, then what a lookup found. */
export type ContactView = Seed & { key: string; social: Social[]; looked: boolean; checked: string[]; yours: boolean };

export function contactOf(it: ExecItem, exec?: ExecState): ContactView | undefined {
  const key = contactKey(it);
  if (!key) return undefined;
  const you = exec?.yours?.[key];
  const found = exec?.contacts[key];
  const seed = seedOf(it);
  const pick = <K extends keyof Seed>(k: K) => (you?.[k] ?? seed[k] ?? found?.[k]) as Seed[K];
  const social = new Map<string, Social>();
  // One per platform: the founder's first, then the pages', then the lookup's; a profile the server saw wins over one it didn't.
  for (const s of [...(you?.social ?? []), ...(seed.social ?? []), ...(found?.social ?? [])]) {
    const had = social.get(s.label);
    if (!had || (s.ok && !had.ok && had.src.label !== "From you")) social.set(s.label, s);
  }
  const view: ContactView = { key, social: [...social.values()], looked: !!found?.checked.length || !!you, checked: found?.checked ?? [], yours: !!you };
  for (const k of ["address", "website", "phone", "email", "form"] as const) {
    const f = pick(k);
    if (f) view[k] = f as Field;
  }
  if (isPerson(it.kind)) delete view.address;
  return view;
}

/** A contact icon: found, looked for and not published, or not looked up yet. */
export type Icon = "found" | "none" | "unknown";
export function iconsOf(c: ContactView | undefined, kind: string): { address?: Icon; website: Icon; phone: Icon; email: Icon; dm: Icon } {
  const at = (has: boolean): Icon => (has ? "found" : c?.looked ? "none" : "unknown");
  return { ...(isPerson(kind) ? {} : { address: at(!!c?.address) }), website: at(!!c?.website), phone: at(!!c?.phone), email: at(!!c?.email), dm: at(!!c?.social.length || !!c?.form) };
}

// ---- What to do next

export type Next = { do: "find" | "add" | "draft" | "pitched" | "reply" | "follow" | "hook" | "done"; label: string };

/** A way to send the drafts: an email, a phone, a form, a DM link, or an address to walk in at. A website alone is not one. */
export const wayIn = (c?: ContactView) => !!c && !!(c.email || c.phone || c.form || c.social.length || c.address);

const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_WAIT = 7;

/** Whether a rule covers an item: every field it gives must match. Athena reads the founder's words into the scope. */
export function inScope(scope: WaitScope, it: ExecItem): boolean {
  const any = (want: string[] | undefined, have: string[]) => !want?.length || want.some((w) => have.some((h) => norm(h) === norm(w) || (norm(w).length > 2 && norm(h).includes(norm(w)))));
  return (
    (!scope.agents?.length || scope.agents.some((a) => a === it.agent || it.agents.includes(a))) &&
    (!scope.kinds?.length || scope.kinds.includes(it.kind)) &&
    any(scope.groups, [it.group ?? "", it.kind]) &&
    any(scope.crowds, it.crowds) &&
    any(scope.cities, it.cities) &&
    any(scope.names, [it.name])
  );
}

/** How long to wait for a reply before following up: the latest rule that covers it, else the default. */
export function waitOf(it: ExecItem, exec?: ExecState): { days: number; rule?: string } {
  const rule = [...(exec?.wait?.rules ?? [])].sort((a, b) => b.at - a.at).find((r) => inScope(r.scope, it));
  return rule ? { days: rule.days, rule: rule.text } : { days: exec?.wait?.days ?? DEFAULT_WAIT };
}

/** A pitch past its wait, counted from when the founder marked it Pitched. */
export const followDue = (it: ExecItem, st: ItemState, exec: ExecState | undefined, now: number) => st.mark === "pitched" && st.at != null && now - st.at >= waitOf(it, exec).days * DAY;

/** A row's one status (§23.5 r): Queued → Reading → Drafting → Ready (or Needs a contact), then Sent → Waiting →
 *  Replied yes or no, or Follow-up. */
export type Stage = "queued" | "reading" | "drafting" | "ready" | "needs" | "sent" | "waiting" | "follow" | "yes" | "no";

/** Where a row stands. `run`: the contacts still waiting in the Executive's line, and the row text of the ones it's on. */
export function stageOf(it: ExecItem, st: ItemState, exec: ExecState | undefined, now: number, run?: { queue: string[]; rows: Record<string, string> }): Stage {
  if (st.mark === "yes" || st.mark === "went") return "yes";
  if (st.mark === "no") return "no";
  if (!it.outreach) return "ready";
  if (st.mark === "no_reply" || followDue(it, st, exec, now)) return "follow";
  if (st.mark === "pitched") return st.at != null && now - st.at < DAY ? "sent" : "waiting";
  const key = contactKey(it);
  const row = key ? run?.rows[key] : undefined;
  if (row) return /^Drafting/.test(row) ? "drafting" : "reading";
  if ((key && run?.queue.includes(key)) || !exec?.drafts[it.id]) return "queued";
  return wayIn(contactOf(it, exec)) ? "ready" : "needs";
}

/** What Athena's chat reads of Execute Plan (§23.5 r). The page builds it and sends it with each message: the
 *  server keeps neither the subagents' pages nor the plan, so without it "emailed Amorino Gelato" names no row.
 *  `items`: the outreach rows, Now first, each where its row stands. */
export type PlanView = {
  headline: string;
  started?: number;
  later?: number;
  /** Contacts found or added so far. */
  found: number;
  /** Days before a pitch with no reply comes up again, and the founder's rules for particular cases. */
  wait: number;
  rules: { text: string; days: number }[];
  spent: number;
  items: { id: string; name: string; kind: string; stage: Stage }[];
};

export function planView(team: TeamState, now: number, run?: { queue: string[]; rows: Record<string, string> }): PlanView | undefined {
  if (!team.plan) return undefined;
  const x = team.exec;
  const st = statesOf(team);
  const items = execPlan(team)
    .items.filter((it) => it.outreach && !it.left)
    .sort((a, b) => (a.now?.order ?? 1e9) - (b.now?.order ?? 1e9) || a.rank - b.rank)
    .slice(0, 400)
    .map((it) => ({ id: it.id, name: it.name, kind: it.kind, stage: stageOf(it, st(it.id), x, now, run) }));
  return {
    headline: team.plan.headline,
    ...(x?.started ? { started: x.started } : {}),
    ...(x?.later ? { later: x.later } : {}),
    found: x ? new Set([...Object.keys(x.contacts), ...Object.keys(x.yours ?? {})]).size : 0,
    wait: x?.wait?.days ?? DEFAULT_WAIT,
    rules: x?.wait?.rules.map((r) => ({ text: r.text, days: r.days })) ?? [],
    spent: Object.values(x?.spend ?? {}).reduce((n, s) => n + s.usd, 0),
    items,
  };
}

/**
 * The one button a row shows: Find contact → Review draft → Mark pitched → Log reply → Follow up. A contact looked up
 * with no way in published asks the founder to add one (or ask Athena) before its draft counts as ready to send.
 */
export function nextOf(it: ExecItem, st: ItemState, exec: ExecState | undefined, now: number): Next | undefined {
  if (st.status === "done" || st.status === "skipped" || it.left) return undefined;
  if (!it.outreach) return it.kind === "message" ? { do: "hook", label: "Use this hook" } : { do: "done", label: "Done" };
  if (followDue(it, st, exec, now) || st.mark === "no_reply") return { do: "follow", label: "Follow up" };
  if (st.mark === "pitched") return { do: "reply", label: "Log reply" };
  if (st.mark) return undefined;
  if (exec?.opened?.[it.id]) return { do: "pitched", label: "Mark pitched" };
  const key = contactKey(it);
  if (key && !exec?.contacts[key] && !exec?.yours?.[key]) return { do: "find", label: "Find contact" };
  if (key && !wayIn(contactOf(it, exec))) return { do: "add", label: "Add contact" };
  return { do: "draft", label: "Review draft" };
}

// ---- Lookups: never in bulk

/** An item a lookup writes drafts for: its action, the owner's pitch and a few facts, so the drafts add nothing. */
export type LookupItem = { id: string; kind: string; name: string; agent: ExecAgent; action: string; pitch?: { subject?: string; body: string; names?: string[] }; facts: string[] };
/** One contact to find (or, `known`, already saved: only the drafts are written), with what the pages already hold. */
export type Lookup = { key: string; name: string; kind: string; items: LookupItem[]; seed: Seed; hints: { city?: string; place?: string; platform?: string; listing?: string }; known?: Contact; again?: boolean };

const lookupItem = (it: ExecItem): LookupItem => ({
  id: it.id,
  kind: it.kind,
  name: it.name,
  agent: it.agent,
  action: it.action,
  ...(it.detail?.draft?.body ? { pitch: { ...(it.detail.draft.subject ? { subject: it.detail.draft.subject } : {}), body: it.detail.draft.body, ...(it.detail.draft.names ? { names: it.detail.draft.names } : {}) } } : {}),
  facts: (it.detail?.facts ?? []).filter((f) => f.value.length <= 160 && !/^(Hours|Rating|Fit for )/.test(f.label)).slice(0, 10).map((f) => `${f.label}: ${f.value}`),
});

function lookupOf(key: string, its: ExecItem[], exec?: ExecState, asked = false): Lookup {
  const seed: Seed = {};
  for (const it of its) for (const [k, v] of Object.entries(seedOf(it)) as [keyof Seed, never][]) seed[k] ??= v;
  const first = its[0];
  // Asked for by name, a saved lookup that found no way in runs again; one that found a way in never does.
  const found = exec?.contacts[key];
  const again = asked && !!found && !exec?.yours?.[key] && !wayIn(contactOf(first, exec));
  const known = exec?.yours?.[key] ?? (again ? undefined : found);
  const fact = (l: string) => first.detail?.facts.find((f) => f.label === l)?.value;
  const platform = fact("Platform");
  // An event's "Date: site" link is its listing, the first place its organiser's contact shows; "Where" names its venue.
  const listing = first.kind === "event" ? first.detail?.links?.find((l) => /^Date: /.test(l.label))?.url : undefined;
  const place = first.kind === "event" ? fact("Where") : first.facets.Neighbourhood?.[0];
  return {
    key,
    name: first.name,
    kind: first.kind,
    items: its.filter((i) => !exec?.drafts[i.id]).map(lookupItem),
    seed,
    hints: { ...(first.cities[0] ? { city: first.cities[0] } : {}), ...(place ? { place } : {}), ...(platform ? { platform } : {}), ...(listing ? { listing } : {}) },
    ...(known ? { known } : {}),
    ...(again ? { again } : {}),
  };
}

/** What's left to do: a lookup for a saved contact is only worth sending when an item still needs its drafts. */
const worth = (l: Lookup) => !l.known || l.items.length > 0;

/**
 * Now's lookups, one of Athena's steps at a time in her order: each group is a step's new contacts. A contact two
 * items share goes with the first step that names it, and a saved one is never looked up again. It writes the drafts
 * for every item on that contact, under Now or not, so none waits on a lookup that's already been done.
 */
export function nowLookups(plan: ExecPlan, exec?: ExecState): Lookup[][] {
  const keyed = new Map<string, { step: number; items: ExecItem[] }>();
  for (const it of tabItems(plan, "now")) {
    const key = it.outreach && !it.left ? contactKey(it) : undefined;
    if (!key) continue;
    const k = keyed.get(key) ?? keyed.set(key, { step: it.now!.step, items: [] }).get(key)!;
    k.items.push(it);
  }
  for (const it of plan.items) {
    const key = !it.now && it.outreach && !it.left ? contactKey(it) : undefined;
    if (key) keyed.get(key)?.items.push(it);
  }
  const byStep = new Map<number, Lookup[]>();
  for (const [key, k] of keyed) {
    const l = lookupOf(key, k.items, exec);
    if (worth(l)) (byStep.get(k.step) ?? byStep.set(k.step, []).get(k.step)!).push(l);
  }
  return [...byStep.values()];
}

/** Lookups for items the founder or the chat asked about: top-ranked first, in small groups. One looked up before with no way in is looked up again. */
export function lookupsFor(its: ExecItem[], exec?: ExecState, size = 4): Lookup[][] {
  const keyed = new Map<string, ExecItem[]>();
  for (const it of [...its].sort((a, b) => a.rank - b.rank)) {
    const key = it.outreach && !it.left ? contactKey(it) : undefined;
    if (key) (keyed.get(key) ?? keyed.set(key, []).get(key)!).push(it);
  }
  const all = [...keyed].map(([key, xs]) => lookupOf(key, xs, exec, true)).filter(worth);
  const out: Lookup[][] = [];
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

/**
 * Everything the Executive works through after Start (§23.5 r): Now's contacts first, in Athena's order, then each
 * subagent's items in its own ranking, in small groups. A contact is in the line once; a saved one with its drafts isn't.
 */
export function execQueue(plan: ExecPlan, exec?: ExecState, size = 4): Lookup[][] {
  const out: Lookup[][] = [];
  const chunk = (ls: Lookup[]) => {
    for (let i = 0; i < ls.length; i += size) out.push(ls.slice(i, i + size));
  };
  const seen = new Set<string>();
  for (const it of tabItems(plan, "now")) {
    const key = it.outreach && !it.left ? contactKey(it) : undefined;
    if (key) seen.add(key);
  }
  nowLookups(plan, exec).forEach(chunk);
  for (const agent of OWNERS) {
    const keyed = new Map<string, ExecItem[]>();
    for (const it of tabItems(plan, agent as ExecTab)) {
      const key = it.outreach && !it.left ? contactKey(it) : undefined;
      if (key && !seen.has(key)) (keyed.get(key) ?? keyed.set(key, []).get(key)!).push(it);
    }
    for (const key of keyed.keys()) seen.add(key);
    chunk([...keyed].map(([key, xs]) => lookupOf(key, xs, exec)).filter(worth));
  }
  return out;
}

// ---- Drafts the Executive writes when there's no model, or the model's strayed

const GREET: Record<string, (n: string) => string> = { creator: (n) => `Hi ${n}`, podcast: (n) => `Hi ${n} team` };
const ASK: Record<string, string> = {
  venue: "Could I drop off a sample for whoever handles buying?",
  retailer: "I'd like to apply to sell with you. Who is the right person to talk to?",
  partner: "Would you be open to a short call about a small collaboration?",
  creator: "Would you be open to trying it, with no strings attached?",
  podcast: "Would you be open to having me on, or to a host-read spot?",
  event: "Do you have vendor or sampling spots open, and how do I apply?",
};
const WHO: Record<string, string> = { venue: "buying", retailer: "new vendors", partner: "partnerships", creator: "brand work", podcast: "guests and sponsors", event: "vendors" };
const FIT: Record<string, string> = {
  venue: "I think it would fit your shelves.",
  retailer: "I think it would fit your shelves.",
  partner: "I think our customers overlap.",
  creator: "I think your audience would like it.",
  podcast: "I think your listeners would like it.",
  event: "I think your crowd would like it.",
};

/** Plain drafts from the item alone: no claim, name or number beyond what it states. */
export function templateDrafts(it: LookupItem, brand: { name: string; sells?: string }): Drafts {
  const hi = (GREET[it.kind] ?? ((n: string) => `Hi ${n} team`))(it.name);
  const me = founderLine(brand.name, brand.sells ?? "");
  const ask = ASK[it.kind] ?? "Would you be open to a short chat?";
  const offer = it.facts.find((f) => f.startsWith("Offer: "))?.slice(7);
  return {
    email: it.pitch?.body
      ? { subject: it.pitch.subject ?? `${brand.name} for ${it.name}`, body: it.pitch.body }
      : { subject: it.kind === "event" ? `Vendor inquiry: ${brand.name} at ${it.name}` : `${brand.name} for ${it.name}`, body: `${hi},\n\n${me} ${FIT[it.kind] ?? ""} ${ask}\n\nThanks,\n${brand.name}`.replace(/ {2,}/g, " ") },
    dm: `${hi}! ${me} ${ask}`,
    call: {
      opener: `Hi, ${me} Is the person who handles ${WHO[it.kind] ?? "this"} around?`,
      why: FIT[it.kind] ?? "I think it would fit.",
      offer: offer ? `${offer}.`.replace(/\.\.$/, ".") : ask,
      send: "Of course. What's the best email? I'll send a short note with photos today.",
      close: "Thanks for your time. When's a good moment to follow up?",
    },
    at: Date.now(),
  };
}

/** A follow-up on a pitch with no reply, from the email that went. */
export function followUpDraft(d: Drafts, it: { name: string; kind: string }, brand: { name: string }): { subject: string; body: string } {
  const hi = (GREET[it.kind] ?? ((n: string) => `Hi ${n} team`))(it.name);
  return { subject: d.email.subject.startsWith("Re: ") ? d.email.subject : `Re: ${d.email.subject}`, body: `${hi},\n\nJust following up on my note about ${brand.name}. ${ASK[it.kind] ?? "Would you be open to a short chat?"}\n\nThanks,\n${brand.name}` };
}

// ---- The top strip and Results

export type Strip = { nowDone: number; nowOf: number; waiting: number; yes: number; spent: number; follow: string[]; close: string[]; ready: string[] };

/** The top strip's numbers, and what needs the founder today: follow-ups due, close event dates, contacts ready to send. */
export function stripOf(plan: ExecPlan, state: (id: string) => ItemState, exec: ExecState | undefined, now: number): Strip {
  const now$ = tabItems(plan, "now");
  const live = plan.items.filter((i) => !i.left);
  const soon = (d?: string) => !!d && Date.parse(d) >= now - DAY && Date.parse(d) - now <= 30 * DAY;
  return {
    nowDone: now$.filter((i) => state(i.id).status === "done").length,
    nowOf: now$.length,
    waiting: live.filter((i) => state(i.id).mark === "pitched").length,
    yes: plan.items.filter((i) => state(i.id).mark === "yes").length,
    spent: Object.values(exec?.spend ?? {}).reduce((s, x) => s + x.usd, 0),
    follow: live.filter((i) => nextOf(i, state(i.id), exec, now)?.do === "follow").map((i) => i.id),
    close: live.filter((i) => i.kind === "event" && soon(i.date) && !["done", "skipped"].includes(state(i.id).status)).map((i) => i.id),
    ready: now$.filter((i) => nextOf(i, state(i.id), exec, now)?.do === "draft").map((i) => i.id),
  };
}

/** One line of Results: how a kind of item has gone, and the subagent that re-ranks from it. */
export type ResultLine = { agent: SpecialistId; by: string; value: string; yes: number; no: number; waiting: number; went: number; of: number };

const DIMS: Partial<Record<SpecialistId, (it: ExecItem) => [string, string[]][]>> = {
  rep: (it) => [["Shop type", [it.group ?? it.kind]], ["Neighbourhood", it.facets.Neighbourhood ?? []], ["Entry route", it.facets.Wholesale ?? []]],
  matchmaker: (it) => [["Group", [it.group ?? it.kind]], ["Band", it.facets.Band ?? []]],
  promoter: (it) => [["Kind", [it.group ?? it.kind]]],
  navigator: (it) => [["City", it.cities]],
  scout: (it) => [["Kind", [it.kind]]],
};

export function resultsOf(plan: ExecPlan, team: TeamState): ResultLine[] {
  const by = new Map<string, ResultLine>();
  for (const o of latest(team.outcomes)) {
    const it = plan.byId.get(o.item);
    const agent = it && it.agent !== "athena" ? it.agent : o.agent;
    const dims = it && DIMS[agent] ? DIMS[agent]!(it) : [["Kind", [o.group ?? o.kind]] as [string, string[]]];
    for (const [d, values] of dims)
      for (const value of values.filter(Boolean)) {
        const k = `${agent}|${d}|${value}`;
        const r = by.get(k) ?? by.set(k, { agent, by: d, value, yes: 0, no: 0, waiting: 0, went: 0, of: 0 }).get(k)!;
        r.of++;
        if (o.mark === "yes") r.yes++;
        else if (o.mark === "went") r.went++;
        else if (o.mark === "no") r.no++;
        else r.waiting++;
      }
  }
  return [...by.values()].sort((a, b) => b.of - a.of || b.yes - a.yes);
}
