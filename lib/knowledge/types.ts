// The founder's knowledge base (PRD §23.2 step 4d): every source read into facts, each fact tagged with where it
// is (a file and its page, slide or cell; a site page's URL). Duplicates merge into one fact with every place it
// was found; disagreements become conflicts the founder settles in one click. Pure types and code, client-safe.

export type Where = {
  /** web: found by search, not on the brand's own site. */
  kind: "file" | "website" | "pasted" | "web";
  /** The file name, the page URL, or the pasted summary's label. */
  ref: string;
  /** Inside the source: "page 3", "slide 4", "Sales, row 12", "Products". */
  at?: string;
};

export const TOPICS = ["brand", "product", "price", "customer", "channel", "stockist", "sales", "goal", "budget", "plan", "team", "competitor", "press", "other"] as const;
export type Topic = (typeof TOPICS)[number];

export type Fact = { id: string; text: string; topic: Topic; where: Where[]; struck?: boolean };

export type Conflict = {
  id: string;
  /** What the sources disagree on: "Price of a single jar". */
  about: string;
  options: { value: string; facts: string[] }[];
  /** Athena's pick and why (the most recent or most specific source). */
  recommended: number;
  why: string;
};

/**
 * How the founder settled a conflict: one option by its index, or their own answer as the model read it, which can keep
 * one option, several (each with its own weight or caveat) or none, as one fact in plain words.
 */
export type Resolution = { keep: number[]; fact: string; said: string };
export type Settlement = number | Resolution;
export type Settled = Record<string, Settlement>;

export const isResolution = (s: unknown): s is Resolution => !!s && typeof s === "object" && Array.isArray((s as Resolution).keep) && typeof (s as Resolution).fact === "string";

/** The options of a conflict in use: the founder's pick, the ones their answer kept, else Athena's. */
export function keptOptions(c: Conflict, s: Settlement | undefined): number[] {
  const ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < c.options.length;
  if (isResolution(s)) return [...new Set(s.keep.filter(ok))];
  return [ok(s) ? s : c.recommended];
}

/** One source's read: what was taken, and whether the coverage pass found nothing left out. */
export type Coverage = { source: string; facts: number; added: number; clean: boolean };

export type Knowledge = { facts: Fact[]; conflicts: Conflict[]; coverage: Coverage[] };

export const emptyKnowledge = (): Knowledge => ({ facts: [], conflicts: [], coverage: [] });

/** "deck.pptx, slide 4" / "eatfishwife.com/pages/about". */
export function whereLabel(w: Where): string {
  let ref = w.ref;
  if (w.kind === "website" || w.kind === "web") {
    try {
      const u = new URL(w.ref);
      ref = `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
    } catch {
      // Keep it as given.
    }
  }
  return w.at ? `${ref}, ${w.at}` : ref;
}

const key = (w: Where) => `${w.kind}|${w.ref}|${w.at ?? ""}`;

/** Groups that share a fact are one group: [a, b] and [b, c] merge a, b and c. Maps each merged id to the one that stays. */
export function mergeTargets(groups: string[][]): Map<string, string> {
  const up = new Map<string, string>();
  const root = (id: string): string => {
    let r = id;
    while (up.has(r)) r = up.get(r)!;
    return r;
  };
  for (const g of groups)
    for (const id of g.slice(1)) {
      const a = root(g[0]);
      const b = root(id);
      if (a !== b) up.set(b, a);
    }
  return new Map([...up.keys()].map((id) => [id, root(id)]));
}

/**
 * Applies the merge: each group of duplicate facts becomes its first fact, carrying every place any of them was
 * found. Ids not in the list are ignored; groups that share a fact are joined.
 */
export function applyMerge(facts: Fact[], groups: string[][]): Fact[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const into = mergeTargets(groups.map((g) => g.filter((id) => byId.has(id))));
  const out = new Map<string, Fact>();
  for (const f of facts) {
    const target = into.get(f.id) ?? f.id;
    const t = out.get(target) ?? { ...byId.get(target)!, where: [...byId.get(target)!.where] };
    if (target !== f.id) for (const w of f.where) if (!t.where.some((x) => key(x) === key(w))) t.where.push(w);
    out.set(target, t);
  }
  return [...out.values()];
}

/** A fact as later runs read it: its text, where it is, and the file or page it came from. */
export type LiveFact = { id: string; text: string; where: string; source: string };

/** The knowledge base as it stands: facts not struck, each conflict as settled, and the founder's own answers as facts. */
export function liveFacts(kb: Knowledge, settled: Settled): LiveFact[] {
  const drop = new Set(kb.conflicts.flatMap((c) => { const keep = keptOptions(c, settled[c.id]); return c.options.filter((_, i) => !keep.includes(i)).flatMap((o) => o.facts); }));
  const said = kb.conflicts.flatMap((c) => { const s = settled[c.id]; return isResolution(s) ? [{ id: `said_${c.id}`, text: s.fact, where: "you told me", source: "the founder" }] : []; });
  return [...kb.facts.filter((f) => !f.struck && !drop.has(f.id)).map((f) => ({ id: f.id, text: f.text, where: f.where.map(whereLabel).join("; "), source: f.where[0]?.ref ?? "the founder" })), ...said];
}
