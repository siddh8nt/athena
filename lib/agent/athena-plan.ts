import { FITS, offerFor, type Budget, type RepRead, type Shop } from "./rep";
import { FIT_LABEL, fitOf, offerOf, type Creator, type MatchRead, type Partner } from "./matchmaker";
import { costFit, dayOf, feeLine, type PromoEvent, type PromoRead } from "./promoter";
import { ROLE_LABEL, isStrong, roles, verdict, type NavRead, type SavedNav } from "./navigator";
import { itemId } from "./outcomes";
import { nameOf, type SpecialistId } from "./specialists";
import { INPUTS } from "@/lib/team/inputs";
import { TIER_LABEL, TIER_ORDER, type CrowdPage, type CrowdTier, type Line } from "@/lib/team/page";
import type { GrowthPlan, Mark, Outcome, PlanItem, PlanLine, PlanStep, Work } from "@/lib/team/types";

// Athena's plan (PRD §23.5 m): the workflow's last step. It reads every subagent's finished result and does no new
// research. Numbered steps: the shared moves first (the cities where crowds overlap, shops and partners that fit
// several crowds, events for several), then each crowd in its order, Win first, Win next, Watch. Every line cites the
// subagent it came from; a date is only ever a sourced one, else "once step N holds". Items the founder marked No (or
// Skipped) drop out, and the Navigator's verdicts read the marks. Then where the subagents disagree and what's open.

const COUNT: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };

export type PlanCrowd = { id: string; name: string; tier: CrowdTier; why?: string };

export type AthenaPlanInput = {
  works: Partial<Record<SpecialistId, Work>>;
  /** The measured crowds in their tiers, from the Analyst. */
  crowds: PlanCrowd[];
  outcomes?: Outcome[];
  /** Disagreements still open on the Brand Graph or between subagents. */
  disagreements?: string[];
  /** The questions the founder answered, so an input the team went ahead without is listed as open. */
  answers?: { question: string }[];
  /** What the brand-fit check left out (§23.6 n): skipped like an item the founder marked No. */
  out?: Set<string>;
  now?: number;
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** Places by city, each city once: "San Francisco Bay: North Beach; New York: Williamsburg and SoHo". */
const places = (xs: { city: string; hood?: string }[]) => {
  const by = new Map<string, Set<string>>();
  for (const x of xs) {
    const hoods = by.get(x.city) ?? new Set<string>();
    if (x.hood && x.hood !== x.city) hoods.add(x.hood);
    by.set(x.city, hoods);
  }
  return [...by].map(([city, hoods]) => (hoods.size ? `${city}: ${list([...hoods])}` : city)).join("; ");
};
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const BUDGET_WORD: Record<Budget, string> = { low: "a small budget", mid: "a mid budget", high: "a larger budget" };
const MARK_NOTE: Partial<Record<Mark, string>> = { pitched: "pitched, waiting to hear", yes: "said yes", went: "went", no_reply: "no reply yet" };
const fitting = (x: { crowds: Record<string, number> }) => Object.entries(x.crowds).filter(([, v]) => v >= FITS).map(([k]) => k);
const range = (ns: number[]) => (ns.length === 1 ? `step ${ns[0]}` : ns.length === 2 ? `steps ${ns[0]} and ${ns[1]}` : `steps ${ns[0]}–${ns.at(-1)}`);
/** "Once step 3 holds", "once steps 3 and 4 hold". */
const holds = (ns: number[]) => `${range(ns)} ${ns.length === 1 ? "holds" : "hold"}`;

/** The Navigator's saved read with each crowd as the verdict reads it (its id and tier). */
const navOf = (s: SavedNav): NavRead => ({ ...s, crowds: s.crowds.map(({ id, ...c }) => ({ ...c, crowd: { id } as NavRead["crowds"][number]["crowd"] })) });

/** The Scout's words for a crowd: the first hook on its tab; across: the first line that works for all three. */
function scoutLine(page: CrowdPage | undefined, crowd?: string): string | undefined {
  const sections = crowd ? page?.tabs.find((t) => t.crowd.id === crowd)?.sections : page?.across?.sections;
  const blocks = sections?.find((s) => s.id === (crowd ? "words" : "message"))?.blocks ?? [];
  const lines = blocks.find((b): b is { type: "lines"; label?: string; lines: Line[] } => b.type === "lines" && (crowd ? b.label === "Hooks" : b.label === "Works for all three"));
  return lines?.lines[0]?.text;
}

/** The Scout's signal for moving on to a crowd ("Move on when … shows …"). */
function scoutSignal(page: CrowdPage | undefined, crowd: string): string | undefined {
  const block = page?.across?.sections.find((s) => s.id === "order")?.blocks.find((b) => b.type === "steps");
  return block?.type === "steps" ? block.steps.find((s) => s.crowd === crowd)?.signal : undefined;
}

export function athenaPlan(p: AthenaPlanInput): GrowthPlan {
  const w = p.works;
  const outcomes = p.outcomes ?? [];
  const last = new Map<string, Mark>();
  for (const o of [...outcomes].sort((a, b) => a.at - b.at)) last.set(o.item, o.mark);
  const live = (item: string) => last.get(item) !== "no" && !p.out?.has(item);
  const noted = (name: string, item: string) => (MARK_NOTE[last.get(item)!] ? `${name} (${MARK_NOTE[last.get(item)!]})` : name);

  const saved = w.navigator?.shared?.nav;
  const nav = saved ? navOf(saved) : undefined;
  const rep: RepRead | undefined = w.rep?.shared?.rep;
  const match: MatchRead | undefined = w.matchmaker?.shared?.match;
  const promo: PromoRead | undefined = w.promoter?.shared?.promo;
  const scout = w.scout?.page;
  const budget: Budget = rep?.budget ?? match?.budget ?? promo?.budget ?? "low";
  const crowds = [...p.crowds].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  // A crowd is named only once it's ranked: an id with no crowd behind it is left out, never shown raw.
  const crowdNames = (ids: string[]) => ids.flatMap((id) => crowds.find((c) => c.id === id)?.name ?? []);
  // Two or more crowds are said as what they mean for the founder, not their names glued together (§23.8 f).
  const reaches = (names: string[]) => (names.length > 1 ? `${COUNT[names.length] ?? names.length} of your crowds` : names[0]);

  const steps: PlanStep[] = [];
  const add = (s: Omit<PlanStep, "n">) => {
    const step = { ...s, n: steps.length + 1 };
    steps.push(step);
    return step.n;
  };
  const used = new Set<string>();

  const shopId = (s: Shop) => itemId("venue", s.name);
  const partnerId = (x: Creator | Partner) => ("platform" in x ? x.id : itemId(x.kind === "brand" ? "partner" : "podcast", x.name));
  const partnerCost = (x: Creator | Partner) => {
    const kind = "platform" in x ? "creator" : x.kind;
    const b = "platform" in x ? x.band : x.size;
    const fit = fitOf(b, budget);
    return `${x.name}: ${lower(offerOf(kind, b, budget))}${fit ? ` (${lower(FIT_LABEL[fit])})` : ""}`;
  };
  // Each step's results, with the subagent that owns them, so the Executive's marks go back to it (§23.5 n).
  const shopItem = (s: Shop): PlanItem => ({ id: shopId(s), kind: "venue", name: s.name, agent: "rep", group: s.kind });
  const partnerItem = (x: Creator | Partner): PlanItem => {
    const kind = "platform" in x ? "creator" : x.kind === "brand" ? "partner" : "podcast";
    return { id: partnerId(x), kind, name: x.name, agent: "matchmaker", group: kind };
  };
  const eventItem = (e: PromoEvent): PlanItem => ({ id: e.id, kind: "event", name: e.name, agent: "promoter", group: e.kind });
  // An event's cost: the fee as published, and how it sits with the budget when there is a fee to read.
  const eventCost = (e: PromoEvent) => {
    const fit = costFit(e, budget);
    return fit === "Ask" || fit === "See the fee" ? feeLine(e) : `${feeLine(e)} · ${fit}`;
  };
  const eventWhen = (e: PromoEvent, after?: number[]): PlanLine => ({
    kind: "when",
    agent: "promoter",
    text: `${dayOf(e.date)}, per ${e.site}${e.applyBy ? `; apply by ${dayOf(e.applyBy)}` : ""}${after?.length ? `, if ${holds(after)} by then` : ""}`,
    url: e.url,
  });

  // Shared 1: the cities where crowds overlap, with their anchor neighbourhoods.
  const yours = nav ? nav.cities.filter((c) => c.yours).map((c) => c.metroId) : [];
  const launch = nav ? nav.cities.filter((c) => verdict(nav, c.metroId, yours, outcomes) === "launch") : [];
  const strongHere = (metroId: string) => (nav?.crowds ?? []).filter((c) => isStrong(c.cities.find((f) => f.metroId === metroId))).map((c) => c.crowd.id);
  const anchors = (metroId: string) => {
    const city = nav?.cities.find((c) => c.metroId === metroId);
    return city ? [...roles(city)].filter(([, r]) => r === "anchor").map(([h]) => h) : [];
  };
  let cityStep: number | undefined;
  if (launch.length) {
    const strong = [...new Set(launch.flatMap((c) => strongHere(c.metroId)))];
    cityStep = add({
      what: `Open in ${list(launch.map((c) => c.name))}: ${strong.length > 1 ? `${strong.length} crowds are strong there` : "your first crowd is strong there"}`,
      crowds: strong,
      phase: "shared",
      lines: [
        ...launch.map((c): PlanLine => ({ kind: "where", agent: "navigator", text: anchors(c.metroId).length ? `${c.name}: start in ${list(anchors(c.metroId))}` : c.name })),
        { kind: "when", text: "Start now" },
        { kind: "cost", text: "No spend: this sets where the steps below happen" },
      ],
      depends: [],
    });
  }
  const after = cityStep ? [cityStep] : [];
  const inLaunch = (metroId: string) => !launch.length || launch.some((c) => c.metroId === metroId);
  const allThree = scoutLine(scout);

  // Shared 2: shops that fit several crowds, in the launch cities first.
  const multiShops = (rep?.shops ?? [])
    .filter((s) => !s.stocked && fitting(s).length >= 2 && live(shopId(s)))
    .sort((a, b) => Number(inLaunch(b.metroId)) - Number(inLaunch(a.metroId)) || fitting(b).length - fitting(a).length)
    .slice(0, 3);
  if (rep && multiShops.length) {
    multiShops.forEach((s) => used.add(shopId(s)));
    const ids = [...new Set(multiShops.flatMap(fitting))];
    add({
      what: `Pitch ${multiShops.length > 1 ? `${multiShops.length} shops` : "a shop"} that ${multiShops.length > 1 ? "each fit" : "fits"} several crowds: one pitch, more than one crowd`,
      crowds: ids,
      phase: "shared",
      lines: [
        { kind: "where", agent: "rep", text: places(multiShops) },
        { kind: "through", agent: "rep", text: list(multiShops.map((s) => noted(s.name, shopId(s)))) },
        ...(allThree ? [{ kind: "words", agent: "scout", text: allThree } as PlanLine] : []),
        { kind: "when", text: "Start now" },
        { kind: "cost", agent: "rep", text: `${offerFor(rep.budget)}, sized to ${BUDGET_WORD[rep.budget]}` },
      ],
      depends: after,
      items: multiShops.map(shopItem),
    });
  }

  // Shared 3: partners that fit several crowds.
  const partners: (Creator | Partner)[] = match ? [...match.brands, ...match.creators, ...match.podcasts] : [];
  const multiPartners = partners.filter((x) => fitting(x).length >= 2 && live(partnerId(x))).slice(0, 3);
  if (match && multiPartners.length) {
    multiPartners.forEach((x) => used.add(partnerId(x)));
    add({
      what: `Ask ${multiPartners.length > 1 ? `${multiPartners.length} partners` : "a partner"} whose audience spans several crowds`,
      crowds: [...new Set(multiPartners.flatMap(fitting))],
      phase: "shared",
      lines: [
        { kind: "through", agent: "matchmaker", text: list(multiPartners.map((x) => noted(x.name, partnerId(x)))) },
        ...(allThree ? [{ kind: "words", agent: "scout", text: allThree } as PlanLine] : []),
        { kind: "when", text: "Start now" },
        { kind: "cost", agent: "matchmaker", text: multiPartners.map(partnerCost).join("; ") },
      ],
      depends: after,
      items: multiPartners.map(partnerItem),
    });
  }

  // Shared 4: events for several crowds, soonest first.
  const multiEvents = (promo?.events ?? []).filter((e) => e.crowds.length >= 2 && live(e.id)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2);
  for (const e of multiEvents) {
    used.add(e.id);
    add({
      what: `Show up at ${noted(e.name, e.id)}${crowdNames(e.crowds).length ? `: it reaches ${reaches(crowdNames(e.crowds))}` : ""}`,
      crowds: e.crowds,
      phase: "shared",
      lines: [
        { kind: "where", agent: "promoter", text: `${e.city}${e.hood ? `, ${e.hood.name}` : ""}${e.venue ? ` (${e.venue})` : ""}` },
        eventWhen(e),
        { kind: "cost", agent: "promoter", text: eventCost(e) },
      ],
      depends: after,
      items: [eventItem(e)],
    });
  }

  // Then each crowd in its order, each step after the crowd before it holds.
  let before: number[] = [];
  for (const c of crowds) {
    const mine: number[] = [];
    const navCrowd = nav?.crowds.find((x) => x.crowd.id === c.id);
    const top = navCrowd?.cities.find((f) => !yours.includes(f.metroId) && nav?.cities.some((x) => x.metroId === f.metroId));
    const city = top && nav?.cities.find((x) => x.metroId === top.metroId);
    const hot = city
      ? [...city.hoods].filter((h) => h.heat[c.id] !== undefined).sort((a, b) => b.heat[c.id] - a.heat[c.id]).slice(0, 2).map((h) => `${h.name} (${ROLE_LABEL[roles(city).get(h.name) ?? "online"]})`)
      : [];
    const where: PlanLine | undefined = city ? { kind: "where", agent: "navigator", text: hot.length ? `${city.name}: ${list(hot)}` : city.name } : undefined;
    const words = scoutLine(scout, c.id);
    const wait = c.tier === "win_first" ? [...after] : before.length ? before : [...after];
    const signal = c.tier === "win_first" ? undefined : scoutSignal(scout, c.id);
    const when: PlanLine[] =
      c.tier === "win_first" || !before.length ? [{ kind: "when", text: "Start now" }] : [{ kind: "when", text: `Once ${holds(before)}` }, ...(signal ? [{ kind: "when", agent: "scout", text: signal } as PlanLine] : [])];
    // Who they are (the Analyst's reason), on the crowd's first step only.
    const who: PlanLine[] = c.why ? [{ kind: "who", agent: "analyst", text: c.why }] : [];
    const head = () => (mine.length ? [] : who);

    const shops = (rep?.shops ?? [])
      .filter((s) => !s.stocked && (s.crowds[c.id] ?? 0) >= FITS && !used.has(shopId(s)) && live(shopId(s)))
      .sort((a, b) => Number(b.metroId === city?.metroId) - Number(a.metroId === city?.metroId) || (b.crowds[c.id] ?? 0) - (a.crowds[c.id] ?? 0))
      .slice(0, 3);
    if (rep && shops.length) {
      mine.push(
        add({
          what: `Get on the shelves where ${c.name} shop`,
          crowds: [c.id],
          phase: c.tier,
          lines: [
            ...head(),
            { kind: "where", agent: "rep", text: places(shops) },
            { kind: "through", agent: "rep", text: list(shops.map((s) => noted(s.name, shopId(s)))) },
            ...(words ? [{ kind: "words", agent: "scout", text: words } as PlanLine] : []),
            ...when,
            { kind: "cost", agent: "rep", text: `${offerFor(rep.budget)}, sized to ${BUDGET_WORD[rep.budget]}` },
          ],
          depends: wait,
          items: shops.map(shopItem),
        }),
      );
    }

    const theirs = partners.filter((x) => (x.crowds[c.id] ?? 0) >= FITS && !used.has(partnerId(x)) && live(partnerId(x)));
    const pick = [theirs.find((x) => !("platform" in x) && x.kind === "brand"), theirs.find((x) => "platform" in x && x.audience === "matches") ?? theirs.find((x) => "platform" in x), theirs.find((x) => !("platform" in x) && x.kind === "podcast")].filter((x): x is Creator | Partner => !!x);
    if (match && pick.length) {
      pick.forEach((x) => used.add(partnerId(x)));
      mine.push(
        add({
          what: `Partner with names ${c.name} already follow`,
          crowds: [c.id],
          phase: c.tier,
          lines: [
            ...head(),
            { kind: "through", agent: "matchmaker", text: list(pick.map((x) => noted(x.name, partnerId(x)))) },
            ...(words ? [{ kind: "words", agent: "scout", text: words } as PlanLine] : []),
            ...when,
            { kind: "cost", agent: "matchmaker", text: pick.map(partnerCost).join("; ") },
          ],
          depends: wait,
          items: pick.map(partnerItem),
        }),
      );
    }

    const events = (promo?.events ?? []).filter((e) => e.crowds.includes(c.id) && !used.has(e.id) && live(e.id)).sort((a, b) => Number(b.metroId === city?.metroId) - Number(a.metroId === city?.metroId) || a.date.localeCompare(b.date)).slice(0, 2);
    if (promo && events.length) {
      events.forEach((e) => used.add(e.id));
      const first = events[0];
      mine.push(
        add({
          what: `Show up where ${c.name} gather: ${list(events.map((e) => noted(e.name, e.id)))}`,
          crowds: [c.id],
          phase: c.tier,
          lines: [
            ...head(),
            { kind: "where", agent: "promoter", text: places(events.map((e) => ({ city: e.city, hood: e.hood?.name }))) },
            ...(words ? [{ kind: "words", agent: "scout", text: words } as PlanLine] : []),
            ...events.map((e) => ({ ...eventWhen(e, c.tier === "win_first" ? undefined : before), text: `${e.name}: ${eventWhen(e, c.tier === "win_first" ? undefined : before).text}` })),
            { kind: "cost", agent: "promoter", text: eventCost(first) },
          ],
          depends: wait,
          items: events.map(eventItem),
        }),
      );
    }

    // A crowd with nothing to act on yet still gets its place: where, and the words, once the crowd before holds.
    if (!mine.length && (where || words)) {
      mine.push(
        add({
          what: `${c.tier === "watch" ? "Watch" : "Get ready for"} ${c.name}`,
          crowds: [c.id],
          phase: c.tier,
          lines: [...who, ...(where ? [where] : []), ...(words ? [{ kind: "words", agent: "scout", text: words } as PlanLine] : []), ...when, { kind: "cost", text: "No spend yet" }],
          depends: wait,
        }),
      );
    } else if (where && mine.length) {
      // The crowd's city goes on its first step, unless the step already names that city (its shops' neighbourhoods).
      const s = steps[mine[0] - 1];
      if (!s.lines.some((l) => l.kind === "where" && (l.agent === "navigator" || l.text.startsWith(`${city?.name}:`) || l.text === city?.name))) s.lines.splice(s.lines.findIndex((l) => l.kind !== "who"), 0, where);
    }
    // The Win first crowds start together, so the crowd after them waits for all of them.
    if (mine.length) before = c.tier === "win_first" && crowds[crowds.indexOf(c) - 1]?.tier === "win_first" ? [...before, ...mine] : mine;
  }

  // Where the subagents disagree, in code's reading of their results.
  const clashes: string[] = [];
  if (rep)
    for (const c of launch)
      if (rep.cities.some((x) => x.metroId === c.metroId) && !rep.shops.some((s) => s.metroId === c.metroId && !s.stocked && fitting(s).length))
        clashes.push(`The Navigator says launch in ${c.name}, but the Rep found no shop there that fits a crowd yet.`);
  if (promo && launch.length && promo.events.length && !promo.events.some((e) => launch.some((c) => c.metroId === e.metroId)))
    clashes.push(`The Navigator's launch ${launch.length > 1 ? "cities have" : "city has"} no event from the Promoter yet; its events are elsewhere.`);
  // Both are about the launch cities, so each is a note on the step that opens them (§23.5 q).
  if (cityStep && clashes.length) steps[cityStep - 1].notes = [...clashes];

  const answered = new Set((p.answers ?? []).map((a) => a.question.trim().toLowerCase()));
  const helped = (ids: SpecialistId[]) => ids.some((id) => w[id]);
  const open = [
    ...Object.values(w).flatMap((x) => (x?.handoff ? [`The ${nameOf(x.agent)} needs ${x.handoff.need.replace(/^(it )?needs /i, "")}`] : [])),
    ...INPUTS.filter((q) => helped(q.helps) && !answered.has(q.question.toLowerCase()) && !(q.id === "input_stockists" && rep?.shops.some((s) => s.stocked))).map((q) => `${q.question.replace(/[?.]$/, "")}: I went ahead with ${q.assumed}. Tell me if that's wrong.`),
    ...(match?.limits ?? []).map((l) => `The Matchmaker: ${l}`),
    ...(promo?.limits ?? []).map((l) => `The Promoter: ${l}`),
  ];

  const ran = Object.values(w).filter((x): x is Work => !!x);
  // Every Win first crowd leads; the rest follow.
  const lead = crowds.filter((c) => c.tier === "win_first").length ? crowds.filter((c) => c.tier === "win_first") : crowds.slice(0, 1);
  const rest = crowds.filter((c) => !lead.includes(c));
  return {
    headline: steps.length
      ? `${steps.length} steps${lead.length ? `, winning ${list(lead.map((c) => c.name))} first` : ""}${rest.length ? `, then ${rest.length > 1 ? `your other ${COUNT[rest.length] ?? rest.length} crowds` : rest[0].name}` : ""}, from what ${list(ran.map((x) => `the ${nameOf(x.agent)}`))} found.`
      : "The plan fills in as the subagents finish.",
    // The crowds by name, as the founder reads them.
    steps: steps.map((s) => ({ ...s, crowds: crowdNames(s.crowds) })),
    disagreements: [...(p.disagreements ?? []), ...clashes].slice(0, 6),
    open: [...new Set(open)].slice(0, 8),
    from: Object.fromEntries(ran.map((x) => [x.agent, x.at])),
    at: p.now ?? Date.now(),
  };
}

export { TIER_LABEL };
