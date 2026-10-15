import { itemKey, type BrandBrief, type Source } from "@/lib/brief/types";
import type { LiveFact } from "@/lib/knowledge/types";
import type { CrowdsResult, FitsRun } from "@/lib/journey/types";
import type { StrategyRun } from "@/lib/strategy/types";
import { TIER_LABEL, type Moment } from "@/lib/fits/types";
import type { ShapeName } from "./shapes";
import type { TeamState, Work } from "@/lib/team/types";
import { nameOf } from "@/lib/agent/specialists";

// The Brand Graph's registry (PRD §13.12, §23.2 step 7): every node type and edge type in one place. A new feature
// registers its node type here (label, shape, colour, how it folds, what an edit to it changes, and how its nodes come
// from the journey's state) and the graph view, the list view and the edits pick it up unchanged. Pure, client-safe.

/** What a run can read: an edit that changes one of these flags the runs that read it as stale (§23.2 step 7e). */
export type InputKey = "name" | "product" | "channel" | "tier" | "stage" | "home" | "comparables" | "competitors" | "stockists" | "cities" | "notes" | "facts" | "wrong";

/** Everything the graph is built from: the brief and the founder's facts, then each run's results as they arrive. */
export type GraphInput = {
  brief: BrandBrief;
  facts: LiveFact[];
  crowds?: CrowdsResult;
  fits?: FitsRun;
  strategy?: StrategyRun;
  /** What Athena's specialists found (§23.2 step 8c): each run's results become nodes, cited to its tool calls. */
  team?: TeamState;
  /** Nodes the founder removed: hidden from the view, still read by the agents. */
  hidden?: string[];
  /** Themes and notes the founder opened on the graph (§23.2 step 8.2b): collapsed otherwise. */
  open?: string[];
};

export type GraphNode = {
  id: string;
  type: string;
  label: string;
  detail?: string;
  source: Source;
  confirmed?: boolean;
  /** Overrides the source label where the source kind doesn't say it ("from the retail calendar"). */
  from?: string;
  /** What a "wrong" mark names, when it isn't the id (a trait's value). */
  key?: string;
  /** A crowd's place in the most valuable fits (§23.2 step 5). */
  tier?: { label: string; reason: string; watch: boolean };
  /** When a time-sensitive node matters ("Nov 27, start by Oct 28"). */
  when?: string;
  /** The crowd colour slot (0–3) for crowds and what they love. */
  crowd?: number;
  /** A folded group's members (§13.12: a type folds into a group past 12). */
  members?: GraphNode[];
  /** A note's theme node, or a source's note (§23.2 step 8.2b): shown only while that is open. */
  parent?: string;
  /** Names of existing nodes a note is about (a stockist, a city, a competitor, a comparable, a crowd). */
  about?: string[];
};

export type GraphEdge = { id: string; from: string; to: string; kind: EdgeKind; reason: string; source: Source };

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type AddKind = "brand" | "venue" | "place";

export type NodeType = {
  label: string;
  plural: string;
  shape: ShapeName;
  /** A CSS colour; crowd-coloured types use the node's crowd slot instead. */
  colour: string;
  size: number;
  /** Distance from the brand: 0 the centre, 1 the brand's own facts, 2 the crowds, 3 what the crowds love. */
  ring: 0 | 1 | 2 | 3;
  /** Display order in the list view. */
  order: number;
  /** Fold priority when the graph is over its budget: lower folds first; 0 never folds. */
  fold: number;
  /** "fact": the founder can remove it or mark it wrong; "taste" and "none" are read-only (§23.2 step 7c: facts, never taste). */
  edit: "fact" | "taste" | "none";
  /** Add by typing (§23.2 step 7c): what the typed name is resolved as. */
  add?: { kind: AddKind; placeholder: string };
  /** This type's nodes and edges from the journey's state. */
  from: (input: GraphInput) => Graph;
};

export const EDGE_TYPES = {
  is: "is",
  comparable: "comparable of",
  competes: "competes with",
  sold_at: "sold at",
  grows_in: "grows in",
  found_by: "found by",
  found_for: "found for",
  crowd_of: "crowd of",
  shares_fans: "shares fans with",
  loved_by: "loved by",
  matters_to: "matters to",
  about: "about",
} as const;
export type EdgeKind = keyof typeof EDGE_TYPES;

export const BRAND = "brand";
const YOU: Source = { kind: "message", ref: "you" };
const QLOO: Source = { kind: "qloo" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const brandName = (b: BrandBrief) => b.name?.value || "Your brand";
const edge = (kind: EdgeKind, from: string, to: string, reason: string, source: Source): GraphEdge => ({ id: `${kind}:${from}>${to}`, from, to, kind, reason, source });
const short = (s: string, n = 64) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** A theme's node id (§23.2 step 8.2b). */
export const themeId = (t: string) => `theme:${t}`;

/** A founder's fact's "wrong" key: by its words, so the same fact read again from a later file stays out. */
export const factKey = (f: { text: string }) => `fact:${norm(f.text).slice(0, 150)}`;

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Where a founder's fact came from, as a brief source: a page, a file, or the founder's own answer. */
export function factSource(f: LiveFact): Source {
  if (f.source === "the founder") return { kind: "message" };
  if (/^https?:\/\//.test(f.source)) return { kind: "website", ref: f.source };
  const at = f.where.split(";")[0].split(", ").slice(1).join(", ");
  return { kind: "file", ref: f.source, ...(at ? { at } : {}) };
}

/** The crowds by id, each with its colour slot (the Galaxy's: index mod 4) and its fit. */
function crowdsOf(input: GraphInput) {
  const fits = new Map((input.fits?.fits.fits ?? []).map((f) => [f.crowd, f]));
  return (input.crowds?.crowds ?? []).map((c, i) => ({ c, slot: i % 4, fit: fits.get(c.id), id: `crowd:${c.id}` }));
}

const TRAITS = [
  { field: "tierHint", label: (v: string) => v, what: "price tier" },
  { field: "channel", label: (v: string) => (v === "online" ? "Sold online" : v === "offline" ? "Sold in stores" : "Online and in stores"), what: "channel" },
  { field: "stageHint", label: (v: string) => (v === "prelaunch" ? "Pre-launch" : v === "early" ? "Early stage" : "Scaling"), what: "stage" },
  { field: "activeCity", label: (v: string) => v, what: "home city" },
] as const;

/** Moments from the calendar that matter soonest: now and next quarter, nearest first. */
function moments(input: GraphInput): Moment[] {
  const h = input.fits?.calendar.horizons;
  return h ? [...h.now, ...h.next_quarter].slice(0, 4) : [];
}

/** Result kinds that are someone to reach: the team's leads on the graph (crowds, cities and moments have their own types). */
const LEAD_KINDS = new Set(["venue", "retailer", "partner", "podcast", "event", "audience", "creator"]);
/** Leads per specialist on the graph; the rest stay in its workspace. */
const LEADS_PER_WORK = 6;

/** The nodes a specialist's run adds to the Brand Graph (§23.2 step 8c): its leads, and the Navigator's cities. */
export const nodesAdded = (w: Pick<Work, "agent" | "results">) =>
  w.results.filter((x) => LEAD_KINDS.has(x.kind)).slice(0, LEADS_PER_WORK).length + (w.agent === "navigator" ? w.results.filter((x) => x.kind === "city").length : 0);

export const NODE_TYPES: Record<string, NodeType> = {
  brand: {
    label: "Brand",
    plural: "Brand",
    shape: "star",
    colour: "var(--ink)",
    size: 11,
    ring: 0,
    order: 0,
    fold: 0,
    edit: "none",
    from: ({ brief }) => ({
      nodes: [{ id: BRAND, type: "brand", label: brandName(brief), detail: brief.sells?.value, source: brief.name?.source ?? YOU, confirmed: brief.name?.confirmed }],
      edges: [],
    }),
  },
  trait: {
    label: "Fact",
    plural: "Your facts",
    shape: "pill",
    colour: "var(--accent)",
    size: 5,
    ring: 1,
    order: 1,
    fold: 0,
    edit: "fact",
    from: ({ brief }) => {
      const out: Graph = { nodes: [], edges: [] };
      for (const t of TRAITS) {
        const s = brief[t.field];
        const v = typeof s?.value === "string" ? s.value.trim() : "";
        if (!s || !v || (t.field === "activeCity" && /^(none|nowhere|no)\b/i.test(v))) continue;
        const id = `trait:${t.field}`;
        out.nodes.push({ id, type: "trait", label: t.label(v), detail: `The ${t.what}`, source: s.source, confirmed: s.confirmed, key: itemKey.trait(t.field, v) });
        out.edges.push(edge("is", BRAND, id, `${brandName(brief)}'s ${t.what}`, s.source));
      }
      return out;
    },
  },
  comparable: {
    label: "Brand like you",
    plural: "Brands like you",
    shape: "circle",
    colour: "var(--graph-brand)",
    size: 6,
    ring: 1,
    order: 2,
    fold: 6,
    edit: "fact",
    add: { kind: "brand", placeholder: "A brand like yours" },
    from: ({ brief }) => {
      const out: Graph = { nodes: [], edges: [] };
      const seen = new Set<string>();
      for (const c of brief.comparables) {
        const id = itemKey.comparable(c.value);
        if (seen.has(id)) continue;
        seen.add(id);
        out.nodes.push({ id, type: "comparable", label: c.value, source: c.source, confirmed: c.confirmed });
        out.edges.push(edge("comparable", id, BRAND, `Comparable of ${brandName(brief)}: a brand with a similar customer`, c.source));
      }
      for (const p of brief.proxies ?? []) {
        const id = itemKey.comparable(p);
        if (seen.has(id)) continue;
        seen.add(id);
        out.nodes.push({ id, type: "comparable", label: p, detail: "A brand with a similar customer, read in Qloo for yours", source: { kind: "inferred" } });
        out.edges.push(edge("comparable", id, BRAND, `Comparable of ${brandName(brief)}: my read of a brand with a similar customer`, { kind: "inferred" }));
      }
      return out;
    },
  },
  competitor: {
    label: "Competitor",
    plural: "Competitors",
    shape: "triangle",
    colour: "var(--graph-rival)",
    size: 6,
    ring: 1,
    order: 3,
    fold: 5,
    edit: "fact",
    add: { kind: "brand", placeholder: "A competitor" },
    from: ({ brief }) => ({
      nodes: brief.competitors.map((c) => ({ id: itemKey.competitor(c.value), type: "competitor", label: c.value, source: c.source, confirmed: c.confirmed })),
      edges: brief.competitors.map((c) => edge("competes", itemKey.competitor(c.value), BRAND, `Competes with ${brandName(brief)}`, c.source)),
    }),
  },
  stockist: {
    label: "Stockist",
    plural: "Stockists",
    shape: "square",
    colour: "var(--graph-shop)",
    size: 5,
    ring: 1,
    order: 4,
    fold: 2,
    edit: "fact",
    add: { kind: "venue", placeholder: "A shop that sells you, and its city" },
    from: ({ brief }) => {
      const out: Graph = { nodes: [], edges: [] };
      const seen = new Set<string>();
      for (const s of brief.stockists) {
        const id = itemKey.stockist(s.value);
        if (seen.has(id)) continue;
        seen.add(id);
        out.nodes.push({ id, type: "stockist", label: s.value.name, detail: [s.value.address, s.value.city].filter(Boolean).join(", ") || undefined, source: s.source, confirmed: s.confirmed });
        out.edges.push(edge("sold_at", BRAND, id, `${brandName(brief)} is sold at ${s.value.name}`, s.source));
      }
      return out;
    },
  },
  city: {
    label: "City",
    plural: "Cities",
    shape: "diamond",
    colour: "var(--graph-place)",
    size: 5,
    ring: 1,
    order: 5,
    fold: 4,
    edit: "fact",
    add: { kind: "place", placeholder: "A city to grow in" },
    from: (input) => {
      const out: Graph = { nodes: [], edges: [] };
      const seen = new Set<string>();
      for (const c of input.brief.cities ?? []) {
        const id = itemKey.city(c.value.name);
        if (seen.has(id)) continue;
        seen.add(id);
        out.nodes.push({ id, type: "city", label: c.value.name, detail: "A city you want to grow in", source: c.source, confirmed: c.confirmed });
        out.edges.push(edge("grows_in", BRAND, id, `You want ${brandName(input.brief)} to grow in ${c.value.name}`, c.source));
      }
      const crowds = new Map(crowdsOf(input).map((x) => [x.c.id, x]));
      for (const s of input.strategy?.result.strategies ?? []) {
        const cr = crowds.get(s.crowd);
        for (const w of s.where.slice(0, 3)) {
          const id = itemKey.city(w.metro);
          if (!seen.has(id)) {
            seen.add(id);
            out.nodes.push({ id, type: "city", label: w.metro, detail: w.now ? "Where to start now" : "Where to go next", source: QLOO, from: "from Qloo, by taste-weighted reach" });
          }
          if (cr) out.edges.push(edge("found_by", cr.id, id, `Found by the strategy for ${s.name}: ${w.now ? "start here now" : "go here next"}`, QLOO));
        }
      }
      const nav = input.team?.works.navigator;
      for (const r of nav?.results.filter((x) => x.kind === "city") ?? []) {
        const id = itemKey.city(r.name);
        if (!seen.has(id)) {
          seen.add(id);
          out.nodes.push({ id, type: "city", label: r.name, detail: r.why, source: QLOO, from: "from the Navigator, by Qloo" });
        }
        out.edges.push(edge("grows_in", BRAND, id, `The Navigator's pick: ${r.why}`, QLOO));
      }
      return out;
    },
  },
  crowd: {
    label: "Crowd",
    plural: "Crowds",
    shape: "hexagon",
    colour: "crowd",
    size: 9,
    ring: 2,
    order: 6,
    fold: 0,
    edit: "taste",
    from: (input) => {
      const out: Graph = { nodes: [], edges: [] };
      const all = crowdsOf(input);
      for (const { c, slot, fit, id } of all) {
        out.nodes.push({
          id,
          type: "crowd",
          label: c.name,
          detail: c.loves.slice(0, 3).map((l) => l.name).join(", ") || undefined,
          source: QLOO,
          crowd: slot,
          ...(fit ? { tier: { label: TIER_LABEL[fit.tier], reason: fit.reasons[0] ?? "", watch: fit.tier === "watch" }, ...(fit.when ? { when: fit.when } : {}) } : {}),
        });
        out.edges.push(edge("crowd_of", id, BRAND, fit ? `${TIER_LABEL[fit.tier]} for ${brandName(input.brief)}${fit.reasons[0] ? `: ${fit.reasons[0]}` : ""}` : `A crowd that loves what ${brandName(input.brief)}'s customers love`, QLOO));
      }
      const ids = new Map(all.map((x) => [x.c.id, x.id]));
      for (const m of input.crowds?.meetings ?? []) {
        const a = ids.get(m.a);
        const b = ids.get(m.b);
        if (a && b && m.items.length) out.edges.push(edge("shares_fans", a, b, `Shares fans with it: both love ${m.items.slice(0, 2).map((x) => x.name).join(" and ")}`, QLOO));
      }
      return out;
    },
  },
  loved: {
    label: "Loved by a crowd",
    plural: "What they love",
    shape: "circle",
    colour: "crowd",
    size: 4,
    ring: 3,
    order: 7,
    fold: 7,
    edit: "taste",
    from: (input) => {
      const out: Graph = { nodes: [], edges: [] };
      const seen = new Set<string>();
      for (const { c, slot, id: cid } of crowdsOf(input)) {
        for (const l of c.loves.slice(0, 2)) {
          const id = `loved:${norm(l.name)}`;
          if (!seen.has(id)) {
            seen.add(id);
            out.nodes.push({ id, type: "loved", label: l.name, detail: `${/^[aeiou]/i.test(l.kind) ? "An" : "A"} ${l.kind}${l.kind === "TV" || l.kind === "film" ? " title" : ""}`, source: QLOO, crowd: slot });
          }
          out.edges.push(edge("loved_by", id, cid, `Loved by ${c.name}`, QLOO));
        }
      }
      return out;
    },
  },
  moment: {
    label: "Moment",
    plural: "Moments",
    shape: "pentagon",
    colour: "var(--graph-time)",
    size: 5,
    ring: 3,
    order: 8,
    fold: 3,
    edit: "none",
    from: (input) => {
      const out: Graph = { nodes: [], edges: [] };
      const crowds = new Map(crowdsOf(input).map((x) => [x.c.id, x]));
      for (const m of moments(input)) {
        const id = `moment:${norm(m.name)}:${m.date}`;
        const from = m.kind === "retail" ? "from the retail calendar" : m.kind === "event" ? "from Qloo" : "from Wikipedia pageviews";
        const source: Source = m.kind === "event" ? QLOO : { kind: "web", ref: m.kind === "retail" ? "the retail calendar" : "Wikipedia pageviews" };
        out.nodes.push({ id, type: "moment", label: m.name, detail: m.detail, source, from, when: `${day(m.date)}${m.startBy ? `, start by ${day(m.startBy)}` : ""}` });
        const cr = m.crowd ? crowds.get(m.crowd) : undefined;
        out.edges.push(edge("matters_to", id, cr?.id ?? BRAND, `Matters to ${cr ? cr.c.name : brandName(input.brief)} on ${day(m.date)}`, source));
      }
      return out;
    },
  },
  lead: {
    label: "Found by the team",
    plural: "What the team found",
    shape: "pill",
    colour: "var(--graph-shop)",
    size: 4,
    ring: 3,
    order: 8.5,
    fold: 2,
    edit: "none",
    from: ({ team }) => {
      const out: Graph = { nodes: [], edges: [] };
      for (const w of Object.values(team?.works ?? {})) {
        if (!w) continue;
        for (const r of w.results.filter((x) => LEAD_KINDS.has(x.kind)).slice(0, LEADS_PER_WORK)) {
          const id = `lead:${r.id}`;
          out.nodes.push({ id, type: "lead", label: r.name, detail: r.why, source: QLOO, from: `from the ${nameOf(w.agent)}, by Qloo` });
          out.edges.push(edge("found_for", id, BRAND, `${nameOf(w.agent)}: ${r.why}`, QLOO));
        }
      }
      return out;
    },
  },
  theme: {
    label: "Theme",
    plural: "Themes",
    shape: "square",
    colour: "var(--graph-fact)",
    size: 6,
    ring: 1,
    order: 8.9,
    fold: 0,
    edit: "fact",
    from: ({ brief, facts }) => {
      const out: Graph = { nodes: [], edges: [] };
      const themes = [...new Set(facts.flatMap((f) => (f.theme ? [f.theme] : [])))];
      for (const t of themes) {
        const n = facts.filter((f) => f.theme === t).length;
        const id = themeId(t);
        out.nodes.push({ id, type: "theme", label: t, detail: `${n} note${n === 1 ? "" : "s"}`, source: YOU, from: "from your files and site" });
        out.edges.push(edge("about", id, BRAND, `About ${brandName(brief)}`, YOU));
      }
      return out;
    },
  },
  fact: {
    label: "From your files",
    plural: "What your files and site say",
    shape: "rect",
    colour: "var(--graph-fact)",
    size: 4,
    ring: 1,
    order: 9,
    fold: 1,
    edit: "fact",
    from: ({ brief, facts }) => {
      const out: Graph = { nodes: [], edges: [] };
      for (const n of brief.notes) {
        const id = itemKey.note(n.value);
        out.nodes.push({ id, type: "fact", label: short(n.value), detail: n.value.length > 64 ? n.value : undefined, source: n.source, confirmed: n.confirmed });
        out.edges.push(edge("about", id, BRAND, `About ${brandName(brief)}`, n.source));
      }
      for (const f of facts) {
        const id = `fact:${f.id}`;
        const source = factSource(f);
        const parent = f.theme ? themeId(f.theme) : undefined;
        out.nodes.push({ id, type: "fact", label: short(f.text), detail: f.text.length > 64 ? f.text : undefined, source, key: factKey(f), ...(parent ? { parent } : {}), ...(f.about?.length ? { about: f.about } : {}) });
        out.edges.push(edge("about", id, parent ?? BRAND, parent ? `Under ${f.theme}` : `About ${brandName(brief)}${f.where ? `: ${f.where}` : ""}`, source));
      }
      return out;
    },
  },
  source: {
    label: "Source",
    plural: "Sources",
    shape: "pill",
    colour: "var(--graph-fact)",
    size: 3,
    ring: 1,
    order: 9.5,
    fold: 0,
    edit: "none",
    // Shown only under an open note (lib/graph/build.ts): never in the list on its own.
    from: () => ({ nodes: [], edges: [] }),
  },
};

/** The registry's types in list order. */
export const typesInOrder = () => Object.entries(NODE_TYPES).sort((a, b) => a[1].order - b[1].order);
