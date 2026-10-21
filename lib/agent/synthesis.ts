import { TIER_LABEL, type Fit } from "@/lib/fits/types";
import { nameOf, type SpecialistId } from "./specialists";
import type { GrowthPlan, PlanLine, Work, WorkItem } from "@/lib/team/types";

// Athena's growth plan (PRD §23.2 step 8.5m): the workflow's last step. It reads every subagent's finished work and
// writes, per target crowd, who it is (Analyst), where (Navigator), through what (Rep, Matchmaker, Promoter), the
// words (Scout) and when (Promoter), each line cited to the subagent it came from. No new research: only what the
// works say. Then the disagreements still open and what's left to settle. Pure and client-safe.

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const of = (w: Work | undefined, kinds: string[], n = 3): WorkItem[] => (w?.results ?? []).filter((r) => kinds.includes(r.kind)).slice(0, n);
const names = (items: WorkItem[]) => list(items.map((i) => i.name));
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[.\s]*$/, ".") : "");

export type PlanInput = {
  works: Partial<Record<SpecialistId, Work>>;
  fits?: Pick<Fit, "crowd" | "name" | "tier">[];
  /** Disagreements still open on the Brand Graph or between subagents. */
  disagreements?: string[];
  /** Questions Athena went ahead on an assumption for. */
  assumed?: { question: string; assumed: string }[];
  now?: number;
};

/** The lines for the crowd the work aimed at: one per kind the works can fill. */
function linesFor(works: PlanInput["works"], aim: string, isWinFirst: boolean): PlanLine[] {
  const out: PlanLine[] = [];
  const push = (kind: PlanLine["kind"], agent: SpecialistId, text: string) => text && out.push({ kind, agent, text: sentence(text) });
  const a = works.analyst;
  if (a && isWinFirst) push("who", "analyst", a.headline);
  const nav = works.navigator;
  if (nav && isWinFirst) {
    const city = of(nav, ["city"], 1)[0];
    const hoods = of(nav, ["neighbourhood"], 3);
    push("where", "navigator", city ? `${city.name}${hoods.length ? `, starting in ${names(hoods)}` : ""}` : nav.headline);
  }
  if (isWinFirst) {
    const shops = of(works.rep, ["retailer", "venue"]);
    if (shops.length) push("through", "rep", `Shops: ${names(shops)}`);
    const partners = of(works.matchmaker, ["partner", "podcast"]);
    if (partners.length) push("through", "matchmaker", `Partners: ${names(partners)}`);
    const online = of(works.promoter, ["audience", "creator"]);
    if (online.length) push("through", "promoter", `Online: ${names(online)}`);
  }
  const scout = works.scout;
  const scoutAim = scout?.shared?.crowd;
  if (scout && (scoutAim ? scoutAim === aim : isWinFirst)) {
    const words = of(scout, ["message", "mood"], 2);
    push("words", "scout", words.length ? words.map((w) => (w.detail ? `${w.name}: ${w.detail}` : w.name)).join("; ") : scout.headline);
  }
  if (isWinFirst) {
    const events = of(works.promoter, ["event"]);
    if (events.length) push("when", "promoter", events.map((e) => (e.detail ? `${e.name} (${e.detail})` : e.name)).join("; "));
  }
  return out;
}

export function buildPlan(p: PlanInput): GrowthPlan {
  const first = p.fits?.find((f) => f.tier === "win_first");
  const aim = first?.name ?? p.works.analyst?.shared?.crowd ?? "Your strongest crowd";
  const crowds: GrowthPlan["crowds"] = [{ crowd: aim, tier: TIER_LABEL.win_first, lines: linesFor(p.works, aim, true) }];
  // The Scout's crowd to win next gets its own section when it aimed somewhere else.
  const next = p.works.scout?.shared?.crowd;
  if (next && next !== aim) {
    const tier = p.fits?.find((f) => f.name === next)?.tier;
    crowds.push({ crowd: next, tier: tier ? TIER_LABEL[tier] : TIER_LABEL.win_next, lines: linesFor(p.works, next, false) });
  }
  const open = [
    ...Object.values(p.works).flatMap((w) => (w?.handoff ? [`The ${nameOf(w.agent)} needs ${w.handoff.need.replace(/^(it )?needs /i, "")}`] : [])),
    ...(p.assumed ?? []).map((a) => `${a.question.replace(/\?$/, "")}: I went ahead with ${a.assumed}. Tell me if that's wrong.`),
  ];
  const ran = Object.values(p.works).filter((w): w is Work => !!w);
  const filled = crowds[0].lines.length;
  return {
    headline: filled ? `Win ${aim} first: ${list([...new Set(crowds[0].lines.map((l) => l.kind))].map((k) => KIND_WORD[k]))}, from ${list(ran.map((w) => `the ${nameOf(w.agent)}`))}.` : `The plan fills in as the subagents finish.`,
    crowds,
    disagreements: (p.disagreements ?? []).slice(0, 6),
    open: open.slice(0, 6),
    from: Object.fromEntries(ran.map((w) => [w.agent, w.at])),
    at: p.now ?? Date.now(),
  };
}

const KIND_WORD: Record<PlanLine["kind"], string> = { who: "who they are", where: "where", through: "through whom", words: "what to say", when: "when" };
export const KIND_LABEL: Record<PlanLine["kind"], string> = { who: "Who", where: "Where", through: "Through", words: "The words", when: "When" };

/** The plan is out of date when a subagent it read has run again since. */
export const planStale = (plan: GrowthPlan, works: Partial<Record<SpecialistId, Work>>) => Object.entries(works).some(([id, w]) => w && plan.from[id as SpecialistId] !== undefined && w.at > (plan.from[id as SpecialistId] ?? 0));
