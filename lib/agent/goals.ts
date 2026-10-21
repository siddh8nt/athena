import type { Goal } from "@/lib/team/types";
import type { FounderQuestion } from "./tools";
import { SPECIALISTS, isSpecialist, specialist, type SpecialistId } from "./specialists";

// Goals, not a fixed path (PRD §23.2 step 8a). Athena reads the Brand Graph and proposes 3–4 goals the team can
// deliver; the founder picks one or several. A goal belongs to the founder, with the specialists as the team behind
// it, never one to one. This is code's proposal from the graph's facts, and the check every proposal passes (the
// model's too). Client-safe.

/** Every goal the team can deliver, with the specialists it takes. A new kind of goal is one entry here. */
export const GOALS: (Omit<Goal, "why" | "recommended"> & { why: string })[] = [
  // Never offered as a choice: the Analyst measures the crowds first on every journey (§23.2 step 8.1a), so the goals
  // the founder picks are growth goals. Kept for that first run.
  { id: "know_crowd", label: "Know who your customers are", why: "Everything else starts from the crowds.", team: ["analyst"], conflicts: [] },
  { id: "launch_city", label: "Launch in a new city", why: "Find the city where your crowd is strongest, then the shops and events there.", team: ["navigator", "rep", "promoter"], conflicts: ["deepen_home"] },
  { id: "deepen_home", label: "Win more of your home city", why: "Go deeper where you're already sold, before spreading out.", team: ["navigator", "rep"], conflicts: ["launch_city"] },
  { id: "step_up", label: "Step up to bigger retailers", why: "Your shops prove the crowd; a retailer whose shoppers match is next.", team: ["rep"], conflicts: [] },
  { id: "partners", label: "Borrow a crowd through partners", why: "Brands and podcasts whose fans would love you, and who'd love you back.", team: ["matchmaker", "scout"], conflicts: [] },
  { id: "new_crowd", label: "Reach a new crowd", why: "The crowd to win next, the path to it and the words for it.", team: ["scout", "matchmaker"], conflicts: [] },
  { id: "online", label: "Grow online", why: "The subreddits, communities and newsletters your crowd reads, and what to say.", team: ["promoter", "scout"], conflicts: [] },
  { id: "show_up", label: "Show up where your crowd gathers", why: "Events and moments ahead, with the lead time each needs.", team: ["promoter", "navigator"], conflicts: [] },
];

/** What Athena reads off the Brand Graph to propose goals. */
export type GoalFacts = {
  channel?: "online" | "offline" | "both";
  stockists: number;
  city?: string;
  crowds: boolean;
  /** A crowd ranked Win next. */
  winNext: boolean;
};

// At most 4: the goals are asked through step 3's question component, which offers 2–4 options plus Other.
const MAX = 4;

/** Code's proposal: each goal scored from the facts, the best first and marked recommended, 3–4 in all. */
export function proposeGoals(f: GoalFacts): Goal[] {
  const instore = f.channel !== "online";
  const score: Record<string, number> = {
    know_crowd: 0,
    launch_city: (instore ? 2 : 0.5) + (f.stockists >= 5 ? 1.5 : 0),
    deepen_home: f.city && instore ? (f.stockists < 5 ? 3 : 1.5) : 0,
    step_up: instore && f.stockists >= 10 ? 3 : instore && f.stockists >= 3 ? 1 : 0,
    partners: 1.5 + (f.channel === "online" ? 1.5 : 0),
    new_crowd: f.winNext ? 2.5 : f.crowds ? 1 : 0.5,
    online: f.channel === "online" ? 3.5 : f.channel === "both" ? 2 : 0.8,
    show_up: 1.2 + (instore ? 0.3 : 0),
  };
  const ranked = GOALS.map((g) => ({ g, s: score[g.id] ?? 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  // A conflicting pair can both be proposed (the founder chooses); the weaker one just can't be picked with it.
  const out = ranked.slice(0, MAX).map(({ g }) => ({ ...g, label: g.id === "deepen_home" && f.city ? `Win more of ${f.city}` : g.label }));
  return out.map((g, i) => ({ ...g, conflicts: g.conflicts.filter((c) => out.some((o) => o.id === c)), recommended: i === 0 }));
}

/** Every proposal passes this, the model's too: real specialists only, symmetric conflicts, the recommended first. */
export function checkGoals(raw: unknown): Goal[] {
  const list = (Array.isArray(raw) ? raw : []).slice(0, MAX).flatMap((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 80) : "";
    const team = [...new Set((Array.isArray(o.team) ? o.team : []).filter(isSpecialist))];
    if (!label || !team.length || o.id === "know_crowd" || team.every((s) => s === "analyst")) return [];
    const id = typeof o.id === "string" && /^[a-z_]{2,30}$/.test(o.id) ? o.id : `goal_${i}`;
    return [{ id, label, why: typeof o.why === "string" ? o.why.trim().slice(0, 200) : "", team, conflicts: (Array.isArray(o.conflicts) ? o.conflicts : []).filter((c): c is string => typeof c === "string"), recommended: o.recommended === true, ...(typeof o.outside === "string" && o.outside.trim() ? { outside: o.outside.trim().slice(0, 200) } : {}) } satisfies Goal];
  });
  const ids = new Set(list.map((g) => g.id));
  const pairs = list.map((g) => ({ ...g, conflicts: g.conflicts.filter((c) => ids.has(c) && c !== g.id) }));
  const sym = pairs.map((g) => ({ ...g, conflicts: [...new Set([...g.conflicts, ...pairs.filter((o) => o.conflicts.includes(g.id)).map((o) => o.id)])] }));
  const rec = Math.max(0, sym.findIndex((g) => g.recommended));
  return [sym[rec], ...sym.filter((_, i) => i !== rec)].filter(Boolean).map((g, i) => ({ ...g, recommended: i === 0 }));
}

/** The goals as step 3's question: pick one or several, the recommended first, conflicting ones can't go together. */
export function goalQuestion(goals: Goal[]): FounderQuestion {
  const label = (id: string) => goals.find((g) => g.id === id)?.label ?? id;
  return {
    question: "What do you want to work on?",
    why: "Pick one or several; I'll hand each to the specialists who can deliver it.",
    options: goals.map((g) => ({ label: g.label, hint: `${g.why} ${teamLine(g.team)}`.trim(), conflicts: g.conflicts.map(label) })),
    multi: true,
    assumed: goals[0]?.label ?? "",
  };
}

export const teamLine = (team: SpecialistId[]) => (team.length ? `With the ${list(team.map((t) => specialist(t).name))}.` : "");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The picked goals, by label, with conflicting picks after the first left out. */
export function pickGoals(goals: Goal[], answer: string): Goal[] {
  // The question joins the picked labels with ", ", and a label can hold one itself ("Win more of Portland, OR"),
  // so each label is found whole in the answer, in the order it was picked.
  const joined = `, ${answer.trim()}, `;
  const at = (g: Goal) => joined.indexOf(`, ${g.label}, `);
  const picked: Goal[] = [];
  for (const g of goals.filter((x) => at(x) >= 0).sort((a, b) => at(a) - at(b))) if (!picked.some((p) => p.conflicts.includes(g.id))) picked.push(g);
  return picked;
}

/** The specialists behind the picked goals, in the order the work flows (the Analyst before those it feeds). */
export function teamFor(goals: Goal[]): SpecialistId[] {
  const want = new Set(goals.flatMap((g) => g.team));
  return SPECIALISTS.map((s) => s.id).filter((id) => want.has(id));
}

/**
 * A custom goal when no model is there to read it: never a keyword match. Athena asks which of the team's missions is
 * closest, and the founder's own words go along as the goal's label.
 */
export function customQuestion(text: string): FounderQuestion {
  return {
    question: `Which of these is closest to "${text.slice(0, 80)}"?`,
    why: "I'll put the specialists who can do that part on it.",
    options: GOALS.slice(1, 5).map((g) => ({ label: g.label, hint: teamLine(g.team) })),
    multi: true,
    assumed: GOALS[1].label,
  };
}

/** A custom goal as the model split it: the part the team can do, and the rest named plainly. Checked against the registry. */
export function checkCustom(text: string, raw: unknown): Goal | undefined {
  const o = (raw ?? {}) as Record<string, unknown>;
  const team = [...new Set((Array.isArray(o.team) ? o.team : []).filter(isSpecialist))];
  const outside = typeof o.outside === "string" ? o.outside.trim().slice(0, 200) : "";
  if (!team.length && !outside) return undefined;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 80) : text.slice(0, 80);
  return { id: `custom_${hash(text)}`, label, why: typeof o.why === "string" ? o.why.trim().slice(0, 200) : "", team, conflicts: [], custom: true, ...(outside ? { outside } : {}) };
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
