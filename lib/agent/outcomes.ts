import type { Mark, Outcome, TeamState, Work, WorkItem } from "@/lib/team/types";
import { SPECIALISTS, nameOf, type SpecialistId } from "./specialists";

// Insights (PRD §23.2 step 8g): the founder marks results pitched / yes / no / no reply. A specialist reads its
// outcomes before deciding again; Athena reads them all for staleness, for patterns across the team, and for the one
// "What's working" overview. Pure code, client-safe.

export const itemId = (kind: string, name: string) => `${kind}:${name.toLowerCase().normalize("NFKD").replace(/[^\w ]+/g, "").replace(/\s+/g, " ").trim()}`;

const plural = (n: number, w: string) => (n === 1 ? w : /(s|sh|ch|x)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => WORDS[n] ?? String(n);
const SAID: Record<Mark, string> = { yes: "said yes", no: "said no", no_reply: "didn't reply", pitched: "pitched, no answer yet", went: "went" };

/** The latest mark for each result: a later mark replaces an earlier one. */
export function latest(outcomes: Outcome[]): Outcome[] {
  const by = new Map<string, Outcome>();
  for (const o of [...outcomes].sort((a, b) => a.at - b.at)) by.set(o.item, o);
  return [...by.values()];
}

type Tally = { group: string; yes: number; no: number; no_reply: number; pitched: number; went: number };

function tally(outcomes: Outcome[]): Tally[] {
  const by = new Map<string, Tally>();
  for (const o of latest(outcomes)) {
    const g = o.group ?? o.kind;
    const t = by.get(g) ?? { group: g, yes: 0, no: 0, no_reply: 0, pitched: 0, went: 0 };
    t[o.mark]++;
    by.set(g, t);
  }
  return [...by.values()];
}

/** "three cafés said no, two bottle shops said yes": what a specialist reads before it decides again. */
export function outcomeLine(outcomes: Outcome[], agent?: SpecialistId): string {
  const mine = outcomes.filter((o) => !agent || o.agent === agent);
  const parts = tally(mine).flatMap((t) =>
    (["no", "yes", "went", "no_reply"] as Mark[]).filter((m) => t[m]).map((m) => ({ n: t[m], text: `${count(t[m])} ${plural(t[m], t.group)} ${SAID[m]}` })),
  );
  return parts
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((p) => p.text)
    .join(", ");
}

/** Each group's lean from the marks: positive when it says yes, negative when it says no or doesn't reply. */
export function leanings(outcomes: Outcome[], agent?: SpecialistId): Map<string, number> {
  return new Map(tally(outcomes.filter((o) => !agent || o.agent === agent)).map((t) => [t.group, t.yes + t.went - t.no - 0.5 * t.no_reply]));
}

/**
 * The outcomes applied to a fresh list: results the founder already heard back from leave it, and groups that said no
 * move down while groups that said yes move up. Order within a group stays as the tools ranked it.
 */
export function applyOutcomes<T extends Pick<WorkItem, "id" | "group" | "kind">>(items: T[], outcomes: Outcome[], agent?: SpecialistId): { items: T[]; moved: boolean; dropped: number } {
  const marked = new Set(latest(outcomes.filter((o) => !agent || o.agent === agent)).filter((o) => o.mark !== "pitched").map((o) => o.item));
  const lean = leanings(outcomes, agent);
  const kept = items.filter((i) => !marked.has(i.id));
  const score = (i: T) => lean.get(i.group ?? i.kind) ?? 0;
  const sorted = kept.map((i, k) => ({ i, k })).sort((a, b) => score(b.i) - score(a.i) || a.k - b.k).map((x) => x.i);
  return { items: sorted, moved: sorted.some((x, k) => x !== kept[k]), dropped: items.length - kept.length };
}

/** Where a result lands in the founder's world, for patterns across the team. */
const CHANNEL: Record<string, string> = { venue: "on shelves", retailer: "on shelves", event: "at events", partner: "through partners", podcast: "on podcasts", audience: "online", creator: "online" };

/** Patterns across agents ("your crowd responds at events, not on shelves"), once there are enough marks to say so. */
export function patterns(outcomes: Outcome[]): string[] {
  const by = new Map<string, { yes: number; heard: number }>();
  for (const o of latest(outcomes)) {
    const ch = CHANNEL[o.kind];
    if (!ch || o.mark === "pitched") continue;
    const t = by.get(ch) ?? { yes: 0, heard: 0 };
    t.heard++;
    if (o.mark === "yes" || o.mark === "went") t.yes++;
    by.set(ch, t);
  }
  const rows = [...by.entries()].map(([ch, t]) => ({ ch, ...t, rate: t.yes / t.heard }));
  const good = rows.filter((r) => r.yes >= 2 && r.rate >= 0.5).sort((a, b) => b.rate - a.rate);
  const weak = rows.filter((r) => r.heard >= 2 && r.rate <= 0.25).sort((a, b) => a.rate - b.rate);
  if (good.length && weak.length) return [`Your crowd responds ${good[0].ch}, not ${weak[0].ch}: ${good[0].yes} of ${good[0].heard} yes against ${weak[0].yes} of ${weak[0].heard}.`];
  if (good.length) return [`Your crowd responds ${good[0].ch}: ${good[0].yes} of ${good[0].heard} said yes.`];
  if (weak.length) return [`Nothing has landed ${weak[0].ch} yet: ${weak[0].yes} of ${weak[0].heard} said yes.`];
  return [];
}

/**
 * What's stale (§23.2 step 8g): a specialist whose results were marked after it last ran, or whose Brand Graph inputs
 * moved since. Athena re-runs these; each comes with the reason, for the trace.
 */
export function staleRuns(team: TeamState, graphRev: number): { agent: SpecialistId; why: string }[] {
  return SPECIALISTS.flatMap(({ id }) => {
    const w = team.works[id];
    if (!w) return [];
    const fresh = team.outcomes.filter((o) => o.agent === id && o.at > w.at && o.mark !== "pitched");
    if (fresh.length) return [{ agent: id, why: `${fresh.length} new outcome${fresh.length > 1 ? "s" : ""} since it last ran` }];
    // The Analyst's own runs go stale through the crowds and fits flags the founder re-runs; the team's notes don't
    // re-measure them.
    if (id !== "analyst" && (team.rev?.[id] ?? 0) < graphRev) return [{ agent: id, why: "the Brand Graph changed since it last ran" }];
    return [];
  });
}

/** Against the last run: what's new at the top and what dropped off ("New: Fig Larder. Gone: Wren Pantry."). */
export function whatChanged(before: Work | undefined, after: Pick<Work, "results">): string | undefined {
  if (!before) return undefined;
  const was = new Set(before.results.map((r) => r.id));
  const now = new Set(after.results.map((r) => r.id));
  const added = after.results.filter((r) => !was.has(r.id)).slice(0, 3).map((r) => r.name);
  const gone = before.results.filter((r) => !now.has(r.id)).slice(0, 3).map((r) => r.name);
  if (!added.length && !gone.length) return "Same results as last time.";
  return [added.length ? `New: ${added.join(", ")}.` : "", gone.length ? `Gone: ${gone.join(", ")}.` : ""].filter(Boolean).join(" ");
}

export type Overview = { lines: string[]; best: { name: string; agent: string }[]; counts: Record<Mark, number> };

/** The one "What's working" overview: the marks so far, what said yes, and the patterns. */
export function whatsWorking(team: TeamState): Overview {
  const all = latest(team.outcomes);
  const counts = { pitched: 0, yes: 0, no: 0, no_reply: 0, went: 0 } as Record<Mark, number>;
  for (const o of all) counts[o.mark]++;
  const lines = [
    ...patterns(all),
    ...SPECIALISTS.flatMap((s) => {
      const l = outcomeLine(all, s.id);
      return l ? [`${s.name}: ${l}.`] : [];
    }),
  ];
  return { lines, best: all.filter((o) => o.mark === "yes" || o.mark === "went").slice(-5).map((o) => ({ name: o.name, agent: nameOf(o.agent) })), counts };
}
