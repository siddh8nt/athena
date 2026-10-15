import { CAPS, itemKey, mergeBrief, type BrandBrief, type Source, type Sourced, type Stockist, type Wrong } from "@/lib/brief/types";
import type { Tier } from "@/lib/playbook/config";
import type { LiveFact } from "@/lib/knowledge/types";
import type { FounderQuestion } from "@/lib/agent/tools";
import { allNodes } from "./build";
import { READS, changedKeys, settle, type Held, type RunId, type Snapshot } from "./stale";
import { NODE_TYPES, factKey, type GraphInput, type GraphNode, type InputKey } from "./types";

// Edits to the Brand Graph (PRD §13.12, §23.2 step 7c–e): one set of operations for a click on the graph and for a
// message in chat. Every change goes through the brief merge (the founder's words beat a file, which beats a guess);
// each edit records what it changed, can be undone, and holds the runs whose inputs moved. Pure, client-safe.

export const SET_FIELDS = ["name", "sells", "channels", "channel", "tierHint", "stageHint", "activeCity"] as const;
export type SetField = (typeof SET_FIELDS)[number];
export const ADD_TYPES = ["comparable", "competitor", "stockist", "city", "note"] as const;
export type AddType = (typeof ADD_TYPES)[number];

/**
 * One change. Additions arrive resolved (a brand through Qloo, a venue or a city through the place resolver), so
 * nothing is added that couldn't be. `remove` hides a node; `wrong` also stops every agent inferring it.
 */
export type Op =
  | { op: "set"; field: SetField; value: string }
  | { op: "add"; type: AddType; value: string; city?: string; address?: string; id?: string }
  | { op: "wrong"; node: string }
  | { op: "remove"; node: string };

/**
 * A question about an edit ("Did you mean Sightglass Coffee, SF?"): each option is the operations it stands for. With
 * `other`, a typed answer fills its one empty field (the name, the city or the address).
 */
export type EditQuestion = FounderQuestion & { id: string; choices: Op[][]; other?: Op };

/** A typed answer, filled into the question's `other` operation. */
export function fillOther(op: Op, answer: string): Op {
  const a = clean(answer);
  return Object.fromEntries(Object.entries(op).map(([k, v]) => [k, v === "" ? a : v])) as Op;
}

export type GraphEdit = {
  id: string;
  at: number;
  /** The one-line note (§13.12): "Moved to premium: from your message". */
  note: string;
  /** Why the held runs may change, in plain words: "you added a comparable". */
  why: string;
  by: "chat" | "graph";
  /** The nodes to flash: new or changed by this edit. */
  changed: string[];
  keys: InputKey[];
  /** What it was before, for Undo. Kept for the latest few edits only. */
  before?: { brief: BrandBrief; facts: LiveFact[]; hidden: string[] };
};

export type GraphState = {
  hidden: string[];
  log: GraphEdit[];
  /** Runs held on the inputs they ran on, until re-run (§23.2 step 7e). */
  held: Partial<Record<RunId, Held>>;
  /** Re-run counters: a one-click re-run bumps its run's, so it runs again on the current inputs. */
  rev: Partial<Record<RunId, number>>;
};

export const emptyGraphState = (): GraphState => ({ hidden: [], log: [], held: {}, rev: {} });

/** Reads a saved state, so a save from before the graph (or a damaged one) loads as empty. */
export function graphState(v: unknown): GraphState {
  const s = (v && typeof v === "object" ? v : {}) as Partial<GraphState>;
  return {
    hidden: Array.isArray(s.hidden) ? s.hidden.filter((x): x is string => typeof x === "string") : [],
    log: Array.isArray(s.log) ? s.log.filter((e) => e && typeof e.id === "string" && typeof e.note === "string") : [],
    held: s.held && typeof s.held === "object" ? s.held : {},
    rev: s.rev && typeof s.rev === "object" ? s.rev : {},
  };
}

/** The reply when a message can't be read now (no model, or past the hourly count): the graph still takes every edit. */
export const POINTER = "Tap it on the graph to change that; I'll read messages like this again in a few minutes.";

/** Edits past this size are shown first and applied as one step with one Undo. */
export const PREVIEW_AT = 8;
const LOG = 10;
const UNDOABLE = 3;
const MAX = 200;

const TIERS: Tier[] = ["mass", "mainstream", "premium", "luxury"];
const STAGES = ["prelaunch", "early", "scaling"] as const;
const CHANNELS = ["online", "offline", "both"] as const;
const STAGE_WORDS = { prelaunch: "pre-launch", early: "early stage", scaling: "scaling" } as const;
const CHANNEL_WORDS = { online: "online", offline: "in stores", both: "online and in stores" } as const;
const TRAIT_FIELDS = ["tierHint", "stageHint", "channel", "activeCity"] as const;
type TraitField = (typeof TRAIT_FIELDS)[number];

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX) : "");

/** Checks one operation against the registry and the graph's nodes: anything else is dropped, never guessed at. */
export function validOp(o: unknown, nodes: { id: string; type: string }[]): Op | undefined {
  if (!o || typeof o !== "object") return undefined;
  const x = o as Record<string, unknown>;
  if (x.op === "set") {
    const field = x.field as SetField;
    const value = clean(x.value).toLowerCase();
    if (!SET_FIELDS.includes(field)) return undefined;
    if (field === "tierHint") return TIERS.includes(value as Tier) ? { op: "set", field, value } : undefined;
    if (field === "stageHint") return (STAGES as readonly string[]).includes(value) ? { op: "set", field, value } : undefined;
    if (field === "channel") return (CHANNELS as readonly string[]).includes(value) ? { op: "set", field, value } : undefined;
    const v = clean(x.value);
    return v ? { op: "set", field, value: v } : undefined;
  }
  if (x.op === "add") {
    const type = x.type as AddType;
    const value = clean(x.value);
    if (!ADD_TYPES.includes(type) || !value) return undefined;
    const extra = Object.fromEntries((["city", "address", "id"] as const).map((k) => [k, clean(x[k])]).filter(([, v]) => v));
    return { op: "add", type, value, ...extra };
  }
  if (x.op === "wrong" || x.op === "remove") {
    const n = nodes.find((m) => m.id === x.node);
    if (!n || n.id.startsWith("group:")) return undefined;
    const t = NODE_TYPES[n.type];
    // Facts, never taste (§23.2 step 7c): only the founder's facts can be removed or marked wrong.
    if (!t || t.edit !== "fact") return undefined;
    return { op: x.op, node: n.id };
  }
  return undefined;
}

/** What the founder marked wrong, in plain words: "Whole Foods as a stockist". */
const wrongText = (n: GraphNode) => `${n.label} as ${/^[aeiou]/i.test(NODE_TYPES[n.type].label) ? "an" : "a"} ${NODE_TYPES[n.type].label.toLowerCase()}`;

/** Drops everything marked wrong from the brief: the lists, the proxies and the fact-strip fields. */
export function dropWrong(b: BrandBrief): BrandBrief {
  const wrong = new Set((b.wrong ?? []).map((w) => w.key));
  if (!wrong.size) return b;
  const out: BrandBrief = {
    ...b,
    comparables: b.comparables.filter((c) => !wrong.has(itemKey.comparable(c.value))),
    competitors: b.competitors.filter((c) => !wrong.has(itemKey.competitor(c.value))),
    stockists: b.stockists.filter((s) => !wrong.has(itemKey.stockist(s.value))),
    notes: b.notes.filter((n) => !wrong.has(itemKey.note(n.value))),
    ...(b.cities ? { cities: b.cities.filter((c) => !wrong.has(itemKey.city(c.value.name))) } : {}),
    ...(b.proxies ? { proxies: b.proxies.filter((p) => !wrong.has(itemKey.comparable(p))) } : {}),
  };
  for (const f of TRAIT_FIELDS) {
    const s = out[f] as Sourced<string> | undefined;
    if (s && wrong.has(itemKey.trait(f, s.value))) delete out[f];
  }
  return out;
}

/** The founder's facts, less those marked wrong (also used when a later file is read). */
export const dropWrongFacts = (facts: LiveFact[], b: BrandBrief) => {
  const wrong = new Set((b.wrong ?? []).map((w) => w.key));
  return wrong.size ? facts.filter((f) => !wrong.has(factKey(f))) : facts;
};

const RANK: Record<string, number> = { message: 6, file: 5, pasted: 5, website: 4, web: 4, qloo: 3, inferred: 2, agent_guess: 1 };

/** At the cap, the lowest-ranked item (the last of equals) makes room; returns the list without it, and its name. */
function makeRoom<T>(list: Sourced<T>[], cap: number, name: (v: T) => string): { list: Sourced<T>[]; out?: string } {
  if (list.length < cap) return { list };
  let at = 0;
  list.forEach((x, i) => {
    const r = RANK[x.source.kind] + (x.confirmed ? 10 : 0);
    const was = RANK[list[at].source.kind] + (list[at].confirmed ? 10 : 0);
    if (r <= was) at = i;
  });
  return { list: list.filter((_, i) => i !== at), out: name(list[at].value) };
}

type Step = { note: string; why: string; out?: string };

/** One operation applied: the brief, the facts and the hidden nodes after it, and its note. Undefined when it changes nothing. */
function step(cur: { brief: BrandBrief; facts: LiveFact[]; hidden: string[] }, op: Op, nodes: GraphNode[], source: Source): (typeof cur & Step) | undefined {
  const { brief, facts, hidden } = cur;
  const merge = (patch: Partial<BrandBrief>, b = brief) => dropWrong(mergeBrief(b, patch).brief);
  const sourced = <T>(value: T): Sourced<T> => ({ value, source, confirmed: true });
  if (op.op === "set") {
    const prev = (brief[op.field] as Sourced<string> | undefined)?.value;
    if (prev === op.value) return undefined;
    const words: Record<SetField, () => Step> = {
      name: () => ({ note: `Renamed to ${op.value}`, why: "you renamed the brand" }),
      sells: () => ({ note: `Product set to “${op.value}”`, why: "you changed what it sells" }),
      channels: () => ({ note: `Sold through ${op.value}`, why: "you changed how it's sold" }),
      channel: () => ({ note: `Now sold ${CHANNEL_WORDS[op.value as keyof typeof CHANNEL_WORDS]}`, why: "you changed where it mostly sells" }),
      tierHint: () => ({ note: `Moved to ${op.value}`, why: `you moved it to ${op.value}` }),
      stageHint: () => ({ note: `Stage set to ${STAGE_WORDS[op.value as keyof typeof STAGE_WORDS]}`, why: "you changed the stage" }),
      activeCity: () => ({ note: `Home city set to ${op.value}`, why: "you changed the home city" }),
    };
    return { brief: merge({ [op.field]: sourced(op.value) }), facts, hidden, ...words[op.field]() };
  }
  if (op.op === "add") {
    const what = { comparable: "a brand like you", competitor: "a competitor", stockist: "a stockist", city: "a city to grow in", note: "a fact" }[op.type];
    const why = { comparable: "you added a comparable", competitor: "you added a competitor", stockist: "you added a stockist", city: "you added a city", note: "you added a fact" }[op.type];
    let b = brief;
    let out: string | undefined;
    let patch: Partial<BrandBrief>;
    if (op.type === "comparable" || op.type === "competitor") {
      const key = itemKey[op.type];
      const list = b[op.type === "comparable" ? "comparables" : "competitors"];
      if (list.some((x) => key(x.value) === key(op.value))) return undefined;
      const room = makeRoom(list, op.type === "comparable" ? CAPS.comparables : CAPS.competitors, (v) => v);
      out = room.out;
      b = { ...b, [op.type === "comparable" ? "comparables" : "competitors"]: room.list };
      patch = { [op.type === "comparable" ? "comparables" : "competitors"]: [sourced(op.value)] };
    } else if (op.type === "stockist") {
      const s: Stockist = { name: op.value, ...(op.address ? { address: op.address } : {}), ...(op.city ? { city: op.city } : {}) };
      if (b.stockists.some((x) => itemKey.stockist(x.value) === itemKey.stockist(s))) return undefined;
      patch = { stockists: [sourced(s)] };
    } else if (op.type === "city") {
      if ((b.cities ?? []).some((c) => itemKey.city(c.value.name) === itemKey.city(op.value))) return undefined;
      const room = makeRoom(b.cities ?? [], CAPS.cities, (v) => v.name);
      out = room.out;
      b = { ...b, cities: room.list };
      patch = { cities: [sourced({ id: op.id ?? op.value, name: op.value })] };
    } else {
      if (b.notes.some((n) => itemKey.note(n.value) === itemKey.note(op.value))) return undefined;
      const room = makeRoom(b.notes, CAPS.notes, (v) => v);
      out = room.out;
      b = { ...b, notes: room.list };
      patch = { notes: [sourced(op.value)] };
    }
    const label = op.type === "note" ? `“${op.value.length > 48 ? `${op.value.slice(0, 47)}…` : op.value}”` : op.value;
    return { brief: merge(patch, b), facts, hidden, note: `Added ${label} as ${what}${out ? `, in place of ${out}` : ""}`, why, ...(out ? { out } : {}) };
  }
  const n = nodes.find((m) => m.id === op.node);
  if (!n) return undefined;
  const t = NODE_TYPES[n.type];
  if (op.op === "remove") {
    if (hidden.includes(n.id)) return undefined;
    return { brief, facts, hidden: [...hidden, n.id], note: `Hid ${n.label}`, why: "" };
  }
  const key = n.key ?? n.id;
  if ((brief.wrong ?? []).some((w) => w.key === key)) return undefined;
  const mark: Wrong = { key, text: wrongText(n) };
  const b = dropWrong({ ...brief, wrong: [...(brief.wrong ?? []), mark].slice(-CAPS.wrong) });
  return { brief: b, facts: n.id.startsWith("fact:") ? dropWrongFacts(facts, b) : facts, hidden, note: `Marked ${n.label} wrong as ${/^[aeiou]/i.test(t.label) ? "an" : "a"} ${t.label.toLowerCase()}`, why: `you marked ${/^[aeiou]/i.test(t.label) ? "an" : "a"} ${t.label.toLowerCase()} wrong` };
}

/** The changed nodes: in the graph after the edit, and new or different from before. */
function changedNodes(before: GraphInput, after: GraphInput) {
  const was = new Map(allNodes(before).nodes.map((n) => [n.id, JSON.stringify([n.label, n.detail, n.source, n.confirmed, n.key])]));
  return allNodes(after)
    .nodes.filter((n) => was.get(n.id) !== JSON.stringify([n.label, n.detail, n.source, n.confirmed, n.key]))
    .map((n) => n.id);
}

const joinMore = (xs: string[]) => (xs.length > 1 ? `${xs[0]} and ${xs.length - 1} more` : xs[0]);

export type Applied = { brief: BrandBrief; facts: LiveFact[]; state: GraphState; edit: GraphEdit };

/**
 * Applies operations as one edit, with one note and one Undo. `input` is the graph as it stands (with the runs'
 * results), `ran` the runs that have results to hold. Undefined when nothing changes.
 */
export function applyEdit(input: GraphInput, state: GraphState, ops: Op[], ctx: { by: "chat" | "graph"; ran: RunId[]; at?: number }): Applied | undefined {
  const nodes = allNodes(input).nodes;
  const source: Source = ctx.by === "graph" ? { kind: "message", ref: "you" } : { kind: "message" };
  let cur = { brief: input.brief, facts: input.facts, hidden: state.hidden };
  const steps: (Step & { keys: InputKey[] })[] = [];
  for (const op of ops) {
    const s = step(cur, op, nodes, source);
    if (!s) continue;
    const keys = changedKeys(cur, s);
    cur = { brief: s.brief, facts: s.facts, hidden: s.hidden };
    steps.push({ ...s, keys });
  }
  if (!steps.length) return undefined;
  const before: Snapshot = { brief: input.brief, facts: input.facts };
  const after: Snapshot = { brief: cur.brief, facts: cur.facts };
  const whyOf = (of: typeof steps) => {
    const whys = [...new Set(of.map((s) => s.why).filter(Boolean))];
    return whys.length > 2 ? `${whys.slice(0, 2).join(", ")} and more` : whys.join(" and ");
  };
  const why = whyOf(steps);
  // Each run's flag names only the changes it reads ("Cities may change: you moved it to premium", not also the channel).
  const whyFor = (run: RunId) => whyOf(steps.filter((s) => s.keys.some((k) => READS[run].includes(k)))) || why;
  const at = ctx.at ?? Date.now();
  const edit: GraphEdit = {
    id: `edit-${at}-${state.log.length}`,
    at,
    // A full list that made room says so even when its step is folded into "and N more".
    note: `${joinMore(steps.map((s) => s.note))}${steps.length > 1 && steps.some((s) => s.out) ? `; ${steps.flatMap((s) => (s.out ? [s.out] : [])).join(", ")} made room` : ""}: ${ctx.by === "graph" ? "from you" : "from your message"}`,
    why,
    by: ctx.by,
    changed: changedNodes({ ...input, hidden: state.hidden }, { ...input, ...after, hidden: cur.hidden }),
    keys: changedKeys(before, after),
    before: { brief: input.brief, facts: input.facts, hidden: state.hidden },
  };
  const log = [...state.log, edit].slice(-LOG).map((e, i, all) => (i < all.length - UNDOABLE ? { ...e, before: undefined } : e));
  return { ...after, state: { ...state, hidden: cur.hidden, log, held: why ? settle(state.held, ctx.ran, before, after, whyFor) : state.held }, edit };
}

/** Undoes the latest edit that can be: the brief, the facts and the hidden nodes go back, and runs it held let go. */
export function undo(input: GraphInput, state: GraphState, ran: RunId[]): Omit<Applied, "edit"> & { undone: GraphEdit } | undefined {
  const last = state.log.at(-1);
  if (!last?.before) return undefined;
  const now: Snapshot = { brief: input.brief, facts: input.facts };
  const back: Snapshot = { brief: last.before.brief, facts: last.before.facts };
  return {
    ...back,
    state: { ...state, hidden: last.before.hidden, log: state.log.slice(0, -1), held: settle(state.held, ran, now, back, "you undid an edit") },
    undone: last,
  };
}

/** Which runs a re-run also lets go: what reads its result runs again with it. */
const DOWNSTREAM: Partial<Record<RunId, RunId[]>> = { crowds: ["fits", "strategy"], fits: ["strategy"] };

/** The one-click re-run (§23.2 step 7e): the run reads the current inputs, under a new key so it runs again. */
export function rerun(state: GraphState, run: RunId): GraphState {
  const held = { ...state.held };
  for (const r of [run, ...(DOWNSTREAM[run] ?? [])]) delete held[r];
  return { ...state, held, rev: { ...state.rev, [run]: (state.rev[run] ?? 0) + 1 } };
}

/** A big edit, shown before it's applied: "This changes 14 things: …". */
export function previewOf(input: GraphInput, state: GraphState, ops: Op[]): { count: number; lines: string[] } {
  const nodes = allNodes(input).nodes;
  let cur = { brief: input.brief, facts: input.facts, hidden: state.hidden };
  const lines: string[] = [];
  for (const op of ops) {
    const s = step(cur, op, nodes, { kind: "message" });
    if (!s) continue;
    cur = { brief: s.brief, facts: s.facts, hidden: s.hidden };
    lines.push(s.note);
  }
  return { count: lines.length, lines };
}

/** The line a preview asks with. */
export const previewLine = (p: { count: number; lines: string[] }) =>
  `This changes ${p.count} things: ${p.lines.slice(0, 4).join("; ")}${p.count > 4 ? `; and ${p.count - 4} more` : ""}. Apply?`;

const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A file read after onboarding (§23.2 step 7d): its facts and the stockists it lists join the graph as one edit,
 * with one note and one Undo. A file ranks below the founder's own words, and nothing marked wrong comes back.
 */
export function applyFiles(input: GraphInput, state: GraphState, read: { facts: LiveFact[]; stockists: { ref: string; list: Stockist[] }[]; read: string[] }, ctx: { ran: RunId[]; at?: number }): Applied | undefined {
  const seen = new Set(input.facts.flatMap((f) => [f.id, normText(f.text)]));
  const fresh = dropWrongFacts(read.facts, input.brief).filter((f) => !seen.has(f.id) && !seen.has(normText(f.text)) && !!seen.add(f.id).add(normText(f.text)));
  const patch = read.stockists.flatMap((s) => s.list.map((v) => ({ value: v, source: { kind: "file" as const, ref: s.ref } })));
  const brief = dropWrong(mergeBrief(input.brief, { stockists: patch }).brief);
  const added = brief.stockists.length - input.brief.stockists.length;
  if (!fresh.length && added <= 0) return undefined;
  const facts = [...input.facts, ...fresh];
  const before: Snapshot = { brief: input.brief, facts: input.facts };
  const after: Snapshot = { brief, facts };
  const what = [fresh.length ? `${fresh.length} fact${fresh.length === 1 ? "" : "s"}` : "", added > 0 ? `${added} stockist${added === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  const names = read.read.length > 1 ? `${read.read[0]} and ${read.read.length - 1} more` : read.read[0] ?? "your file";
  const why = `you added ${names}`;
  const at = ctx.at ?? Date.now();
  const edit: GraphEdit = {
    id: `edit-${at}-${state.log.length}`,
    at,
    note: `Added ${what}: from ${names}`,
    why,
    by: "chat",
    changed: changedNodes({ ...input, hidden: state.hidden }, { ...input, ...after, hidden: state.hidden }),
    keys: changedKeys(before, after),
    before: { brief: input.brief, facts: input.facts, hidden: state.hidden },
  };
  const log = [...state.log, edit].slice(-LOG).map((e, i, all) => (i < all.length - UNDOABLE ? { ...e, before: undefined } : e));
  return { ...after, state: { ...state, log, held: settle(state.held, ctx.ran, before, after, why) }, edit };
}
