// Crowd names (PRD §23.8 a): a crowd is named after two of its own core members a founder would recognise
// ("Liquid I.V. and Rachel Hollis fans"), with a short handle for later mentions ("the Liquid I.V. crowd") and one
// sentence on what they share, shown as Athena's read. The model picks; this file checks its picks and falls back.
// Pure and client-safe.

/** A member the name may be after: its name as the founder reads it and its kind (brand, artist, TV…). */
export type Candidate = { name: string; kind: string };

export type CrowdName = {
  name: string;
  /** For mentions after the first: "the Liquid I.V. crowd". */
  handle: string;
  /** The members the name is after, by their full names. */
  after: string[];
  /** What they share, in one sentence: Athena's read, never a measured fact. */
  shared?: string;
};

/** What the model returns for one crowd. */
export type NamePick = { after?: unknown; short?: unknown; shared?: unknown };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "the Liquid I.V. crowd"; a leading "The" isn't doubled ("the Durrells crowd"). */
export const handleOf = (lead: string) => `the ${lead.replace(/^the\s+/i, "")} crowd`;

/** How people say a member: the model's short form when every word of it comes, in order, from the member's own name. */
export function shortOf(full: string, short: unknown): string {
  if (typeof short !== "string") return full;
  const t = short.trim().replace(/"+$/g, "");
  // A trailing period stays only when the name has it ("Liquid I.V."), not when it ends a sentence.
  const s = t.endsWith(".") && !full.toLowerCase().includes(t.toLowerCase()) ? t.replace(/\.+$/, "") : t;
  const n = norm(s);
  if (!n || n.replace(/\b(the|a|an|of|and)\b/g, "").trim().length < 2) return full;
  return ` ${norm(full)} `.includes(` ${n} `) ? s : full;
}

function build(full: string[], short: string[], shared?: string): CrowdName {
  const name = short.length > 1 ? `${short[0]} and ${short[1]} fans` : `${short[0]} fans`;
  return { name, handle: handleOf(short[0]), after: full, ...(shared ? { shared } : {}) };
}

/** Two members of different kinds where the list has them, strongest first; none already used by another crowd's name. */
export function fallbackFor(cands: Candidate[], used: Set<string> = new Set()): CrowdName {
  const free = cands.filter((c) => !used.has(norm(c.name)));
  const a = free[0];
  if (!a) return { name: "This crowd", handle: "this crowd", after: [] };
  const b = free.find((c) => c !== a && c.kind !== a.kind) ?? free.find((c) => c !== a);
  const full = b ? [a.name, b.name] : [a.name];
  return build(full, full);
}

/** One sentence, plain, no longer than a line; anything else is left out rather than shown. */
function sharedOf(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const s = x.trim().replace(/\s+/g, " ");
  if (s.length < 8 || s.length > 160) return undefined;
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/**
 * The model's pick for one crowd, checked: both members must be on this crowd's list (exactly, ignoring case and
 * punctuation), different from each other and from names already used; each short form must come from its member's
 * name. Anything that fails falls back to the strongest members, so a name never claims a taste Qloo didn't show.
 */
export function checkPick(pick: NamePick | undefined, cands: Candidate[], used: Set<string> = new Set()): CrowdName {
  const shared = sharedOf(pick?.shared);
  const after = Array.isArray(pick?.after) ? pick.after : [];
  const shorts = Array.isArray(pick?.short) ? pick.short : [];
  const found = after
    .slice(0, 2)
    .map((a) => (typeof a === "string" ? cands.find((c) => norm(c.name) === norm(a)) : undefined));
  const ok = found.length === 2 && found[0] && found[1] && found[0] !== found[1] && found.every((c) => !used.has(norm(c!.name)));
  if (!ok) {
    const fb = fallbackFor(cands, used);
    return shared && fb.after.length ? { ...fb, shared } : fb;
  }
  const full = found.map((c) => c!.name);
  return build(full, full.map((f, i) => shortOf(f, shorts[i])), shared);
}

/** Checks every crowd's pick in order, so no member names two crowds. */
export function checkPicks(picks: (NamePick | undefined)[], lists: Candidate[][]): CrowdName[] {
  const used = new Set<string>();
  return lists.map((cands, i) => {
    const n = checkPick(picks[i], cands, used);
    for (const a of n.after) used.add(norm(a));
    return n;
  });
}
