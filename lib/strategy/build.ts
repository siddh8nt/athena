import type { Calendar, FitsResult, Horizon, Moment } from "@/lib/fits/types";
import type { CrowdCard } from "@/lib/journey/types";
import { MONTHS } from "@/lib/fits/score";
import { alreadyIn } from "@/lib/stops/retailers";
import { checkClaims, type SourceData } from "@/lib/agent/cite";
import { BUDGET_BANDS, CHANNEL_LABEL, type Action, type BudgetBand, type Channel, type ContextKey, type ContextLine, type Strategy, type StrategyContext, type StrategyResult } from "./types";

// A strategy for every most valuable fit (PRD §23.2 step 6). Code turns the ranking, the calendar, each crowd's
// retailers and creators, and the founder's context into who, where, through what and when, the same way every time.
// The agent decides what the founder's sources mean (which stores they're in, the budget, a launch date, capacity) and
// passes them with source ids; `readContext` keeps only what a source backs. Each of the four rules below is one
// function of one context item, so changing one fact changes the matching actions and nothing else. Pure.

/** Each crowd's retailers, creators, podcasts and interests from Qloo, strongest first. */
export type CrowdPicks = {
  retailers: { name: string; rank: number }[];
  creators: { name: string; role: string }[];
  podcasts: { name: string }[];
  interests: { name: string }[];
};

export type StrategyIn = {
  /** The run date (YYYY-MM-DD). */
  date: string;
  /** What the brand sells, in its own words ("tinned fish"). */
  product: string;
  fits: FitsResult;
  calendar: Calendar;
  crowds: CrowdCard[];
  /** Each crowd's strongest metros by taste-weighted reach (crowd geography), strongest first. */
  reach?: Record<string, { metro: string; people: number }[]>;
  picks: Record<string, CrowdPicks>;
  context: StrategyContext;
  /** Source ids: the fits run (ranking, calendar, reach), the crowds, and the picks. */
  src: { fits: string; crowds: string; picks?: string };
};

/** What a strategy run starts from: everything but the context the agent reads, and where the fits run left out. */
export type StrategyBase = Omit<StrategyIn, "context"> & { soldIn: StrategyContext["soldIn"] };

/** At most this many strategies: the Win first and Win next fits. */
export const MAX_STRATEGIES = 4;
/** Regions at once when the context gives no capacity. */
export const DEFAULT_REGIONS = 2;
/** Regions named per fit: the ones worked now, then the next ones. */
const MAX_WHERE = 5;
/** The first wave runs the calendar's "now" horizon (30 days); the next starts after it. */
const WAVE_DAYS = 30;
/** Budget sets the channel mix (§23.2 step 6c). Each band adds to the one before. */
export const MIX: Record<BudgetBand, Channel[]> = {
  lean: ["own", "indie", "creators"],
  moderate: ["own", "indie", "creators", "podcasts", "paid_social", "retail"],
  ample: ["own", "indie", "creators", "podcasts", "paid_social", "retail", "retail_promo", "events"],
};
const DEFAULT_BAND: BudgetBand = "lean";
/** Retail moments named per fit, nearest first. */
const RETAIL_MOMENTS = 2;
/** Prep before a moment when the calendar gives no sourced lead time: said as an assumption, never as a fact. */
export const DEFAULT_PREP_DAYS: Record<Moment["kind"], number> = { retail: 28, category: 28, crowd: 28, event: 14 };

const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const later = (a: string, b: string) => (a > b ? a : b);
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** "Mar 3, 2027", for context lines. */
export const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const uniq = <T>(xs: T[]) => [...new Set(xs)];

// ---- The guard: context the agent passes, kept only when a source backs it --------------------------------------

export type RawContext = {
  stockists?: { name?: unknown; metro?: unknown; sources?: unknown }[];
  budget?: { band?: unknown; said?: unknown; sources?: unknown };
  launch?: { date?: unknown; said?: unknown; sources?: unknown };
  capacity?: { regions?: unknown; said?: unknown; sources?: unknown };
};

const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};
/** The words appear, as written, in a cited source. A question the founder hasn't answered yet (ask_founder) holds nothing they said. */
function heldBy(words: string, src: string[], sources: ReadonlyMap<string, SourceData>): boolean {
  const w = norm(words);
  if (!w) return false;
  return src.some((id) => {
    const data = sources.get(id)?.data as { asked?: unknown } | undefined;
    if (!data || (typeof data === "object" && "asked" in data)) return false;
    return strings(data).some((x) => ` ${norm(x)} `.includes(` ${w} `));
  });
}

/**
 * Keeps each context item only when it cites a known source other than today (s0), the founder's words it quotes
 * appear in one of those sources (a stockist's name too) and pass the number check against them. A capacity outside 1–10, an unknown budget band, or a launch date
 * that isn't a date ahead of today is dropped. Returns what was kept and why the rest wasn't.
 */
export function readContext(raw: RawContext, sources: ReadonlyMap<string, SourceData>, date: string): { context: Omit<StrategyContext, "soldIn">; dropped: string[] } {
  const dropped: string[] = [];
  const ids = (v: unknown) => uniq((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x !== "s0" && sources.has(x))).slice(0, 6);
  /** The quoted words must hold up against the sources they cite (numbers and dates as written). */
  const backed = (said: string, src: string[]) => !!said && src.length > 0 && heldBy(said, src, sources) && checkClaims([{ text: said, sources: src }], sources).kept.length === 1;

  const stockists = (raw.stockists ?? []).slice(0, 60).flatMap((s) => {
    const name = text(s?.name, 80);
    const src = ids(s?.sources);
    if (!name || !src.length) return dropped.push(`stockist ${name || "?"}: needs a source`), [];
    if (!heldBy(name, src, sources)) return dropped.push(`stockist ${name}: its sources don't name it`), [];
    const metro = text(s?.metro, 60);
    return [{ name, ...(metro ? { metro } : {}), sources: src }];
  });

  let budget: StrategyContext["budget"];
  if (raw.budget) {
    const band = text(raw.budget.band, 12) as BudgetBand;
    const said = text(raw.budget.said, 200);
    const src = ids(raw.budget.sources);
    if (!BUDGET_BANDS.includes(band)) dropped.push("budget: the band must be lean, moderate or ample");
    else if (!backed(said, src)) dropped.push("budget: needs the founder's words and a source that holds them");
    else budget = { band, said, sources: src };
  }

  let launch: StrategyContext["launch"];
  if (raw.launch) {
    const d = text(raw.launch.date, 10);
    const said = text(raw.launch.said, 200);
    const src = ids(raw.launch.sources);
    const valid = ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);
    if (!valid) dropped.push("launch: the date must be YYYY-MM-DD");
    else if (d <= date) dropped.push(`launch: ${d} isn't ahead of today, so nothing waits for it`);
    else if (!backed(said, src)) dropped.push("launch: needs the founder's words and a source that holds them");
    else launch = { date: d, said, sources: src };
  }

  let capacity: StrategyContext["capacity"];
  if (raw.capacity) {
    const n = raw.capacity.regions;
    const said = text(raw.capacity.said, 200);
    const src = ids(raw.capacity.sources);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10) dropped.push("capacity: regions must be a whole number from 1 to 10");
    else if (!backed(said, src)) dropped.push("capacity: needs the founder's words and a source that holds them");
    else capacity = { regions: n, said, sources: src };
  }

  return { context: { stockists, budget, launch, capacity }, dropped };
}

// ---- The four rules -----------------------------------------------------------------------------------------------

/** Rule 1, stockists: is this store or retailer one the brand is already in? */
export const stocked = (name: string, ctx: StrategyContext) => alreadyIn(name, ctx.stockists.map((s) => s.name));

/** Rule 1, stockists: metros the brand already sells in, left out of where. */
export const soldMetros = (ctx: StrategyContext) => new Set([...ctx.soldIn.map((s) => key(s.metro)), ...ctx.stockists.flatMap((s) => (s.metro ? [key(s.metro)] : []))]);

/** Rule 2, budget: the channel mix. */
export const mixFor = (ctx: StrategyContext): Channel[] => MIX[ctx.budget?.band ?? DEFAULT_BAND];

/** Rule 3, launch date: the first wave starts on the later of today and the launch; the next one a wave after. */
export function waves(date: string, ctx: StrategyContext): { first: string; next: string } {
  const first = ctx.launch ? later(date, ctx.launch.date) : date;
  return { first, next: addDays(first, WAVE_DAYS) };
}

/** Rule 4, capacity: how many regions start now. */
export const regionsAtOnce = (ctx: StrategyContext) => ctx.capacity?.regions ?? DEFAULT_REGIONS;

// ---- Strategies ---------------------------------------------------------------------------------------------------

/** The fits that get a strategy: Win first and Win next, or the top fit when every crowd is Watch. */
export function topFits(fits: FitsResult) {
  const top = fits.fits.filter((f) => f.tier !== "watch");
  return (top.length ? top : fits.fits.slice(0, 1)).slice(0, MAX_STRATEGIES);
}

const allMoments = (c: Calendar) => (["now", "next_quarter", "season", "year"] as Horizon[]).flatMap((h) => c.horizons[h]);

export function buildStrategies(input: StrategyIn): StrategyResult {
  const { context: ctx, src } = input;
  const mix = mixFor(ctx);
  const sold = soldMetros(ctx);
  const regions = regionsAtOnce(ctx);
  const { first, next } = waves(input.date, ctx);
  const launched = ctx.launch ? (["launch"] as ContextKey[]) : [];
  const budgeted = ctx.budget ? (["budget"] as ContextKey[]) : [];
  const capped = ctx.capacity ? (["capacity"] as ContextKey[]) : [];
  const moments = allMoments(input.calendar);
  const picksSrc = src.picks ? [src.picks] : [];
  // Moments with no sourced lead time, which start a default prep window before; named in what was assumed.
  const unled = new Set<string>();

  const strategies: Strategy[] = topFits(input.fits).map((f) => {
    const card = input.crowds.find((c) => c.id === f.crowd);
    const picks = input.picks[f.crowd] ?? { retailers: [], creators: [], podcasts: [], interests: [] };
    const loves = (card?.loves ?? []).slice(0, 3).map((l) => l.name);
    const who = { text: loves.length ? `${f.name}: people who love ${list(loves)}.` : `${f.name}.`, sources: [src.crowds] };

    // Where: the crowd's strongest metros (geography, else the cities its venues concentrate in), minus where the
    // brand already sells; the first `regions` start now.
    const measured = input.reach?.[f.crowd]?.length ? { metros: input.reach[f.crowd].map((m) => m.metro), sources: [src.fits] } : { metros: (card?.cities ?? []).map((c) => c.name), sources: [src.crowds] };
    const candidates = uniq(measured.metros);
    const open = candidates.filter((m) => !sold.has(key(m)));
    const leftOut = open.length < candidates.length;
    const where = open.slice(0, MAX_WHERE).map((metro, i) => ({ metro, now: i < regions, sources: measured.sources }));

    const actions: Action[] = [];
    const add = (a: Omit<Action, "id"> & { id: string }) => actions.push({ ...a, id: `${f.crowd}:${a.id}`, sources: uniq(a.sources), shapedBy: uniq(a.shapedBy) });
    const wave = (now: boolean) => ({ when: (now ? "now" : "next") as Action["when"], startBy: now ? first : next });

    // Your own channels, now.
    if (mix.includes("own"))
      add({ id: "own", ...wave(true), channel: "own", text: `Make ${input.product} speak to ${f.name}: build your content and packaging around what they love${loves.length ? ` (${list(loves)})` : ""}.`, sources: [src.crowds], shapedBy: [...budgeted, ...launched] });

    // Independent shops in each region: now for the first ones, next for the rest. A venue the brand is already in
    // isn't named again.
    if (mix.includes("indie"))
      for (const w of where) {
        const city = card?.cities.find((c) => key(c.name) === key(w.metro));
        const skip = !!city?.venue && stocked(city.venue, ctx);
        const venue = city?.venue && !skip ? city.venue : "";
        add({
          id: `indie:${key(w.metro)}`,
          ...wave(w.now),
          channel: "indie",
          where: w.metro,
          text: venue ? `In ${w.metro}, pitch ${venue} and independent shops like it${city!.venues > 1 ? `: ${city!.venues} places there score for this crowd` : ""}.` : `In ${w.metro}, pitch the independent shops where this crowd's taste runs strongest.`,
          sources: [...w.sources, ...(venue ? [src.crowds] : [])],
          shapedBy: [...budgeted, ...launched, ...capped, ...(leftOut || skip ? (["stockists"] as ContextKey[]) : [])],
        });
      }

    // Creators the crowd follows: a gift on a lean budget, a paid partnership above it.
    if (mix.includes("creators") && picks.creators.length) {
      const cs = picks.creators.slice(0, 2);
      const lean = (ctx.budget?.band ?? DEFAULT_BAND) === "lean";
      add({
        id: "creators",
        ...wave(true),
        channel: "creators",
        text: lean ? `Send ${input.product} to ${list(cs.map((c) => c.name))}, creators this crowd follows (${cs[0].role}), as a gift with no ask.` : `Partner with ${list(cs.map((c) => c.name))}, creators this crowd follows (${cs[0].role}), on a paid post.`,
        sources: picksSrc,
        shapedBy: [...budgeted, ...launched],
      });
    }

    if (mix.includes("podcasts") && picks.podcasts.length)
      add({ id: "podcasts", ...wave(false), channel: "podcasts", text: `Sponsor ${list(picks.podcasts.slice(0, 2).map((p) => p.name))}: podcasts this crowd listens to.`, sources: picksSrc, shapedBy: [...budgeted, ...launched] });

    if (mix.includes("paid_social")) {
      const on = picks.interests.length ? picks.interests.slice(0, 3).map((i) => i.name) : loves;
      if (on.length)
        add({ id: "paid_social", ...wave(false), channel: "paid_social", text: `Test small paid social ads aimed at ${list(on)}.`, sources: picks.interests.length ? picksSrc : [src.crowds], shapedBy: [...budgeted, ...launched] });
    }

    // The retail step-up: the crowd's top retailer the brand isn't in yet.
    const open1 = picks.retailers.filter((r) => !stocked(r.name, ctx));
    const skipped = open1.length < picks.retailers.length ? (["stockists"] as ContextKey[]) : [];
    const retailer = open1[0];
    if (mix.includes("retail") && retailer)
      add({ id: "retail", ...wave(false), channel: "retail", text: `Pitch ${retailer.name}: of the retailers you're not in yet, it ranks first for this crowd in Qloo.`, sources: picksSrc, shapedBy: [...budgeted, ...launched, ...skipped] });
    if (mix.includes("retail_promo") && retailer && where[0])
      add({ id: "retail_promo", ...wave(false), channel: "retail_promo", where: where[0].metro, text: `Once ${retailer.name} carries it, run tastings or demo days in its ${where[0].metro} stores.`, sources: [...picksSrc, ...where[0].sources], shapedBy: [...budgeted, ...launched, ...skipped] });

    // Before each moment: this crowd's attention peak and events, the nearest category season and the next retail
    // moments. A moment before the launch is left out; prep that would start before it starts on it.
    const mine = moments.filter((m) => m.date >= first && ((m.kind === "crowd" && m.crowd === f.crowd) || (m.kind === "event" && m.crowd === f.crowd && mix.includes("events"))));
    const season = moments.find((m) => m.kind === "category" && m.date >= first);
    const retail = moments.filter((m) => m.kind === "retail" && m.date >= first).slice(0, RETAIL_MOMENTS);
    for (const m of [...mine, ...(season ? [season] : []), ...retail].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!m.startBy) unled.add(m.kind === "crowd" ? "each crowd's yearly peak" : m.name);
      const prep = m.startBy ?? addDays(m.date, -DEFAULT_PREP_DAYS[m.kind]);
      const startBy = later(prep, first);
      add({
        id: `before:${key(m.name)}:${m.date}`,
        when: "before",
        channel: m.kind === "event" ? "events" : "own",
        moment: { name: m.name, date: m.date },
        startBy,
        text: beforeText(m, f.name, input.product),
        sources: [src.fits],
        // The launch picks which moments come in (none before it) and can push the start, so it shapes them all.
        shapedBy: [...(m.kind === "event" ? budgeted : []), ...launched],
      });
    }

    return { crowd: f.crowd, name: f.name, tier: f.tier, rank: f.rank, who, where, through: mix.filter((c) => actions.some((a) => a.channel === c)), actions };
  });

  // The mix as used: a channel with nothing to suggest for any fit (no creators named yet) isn't claimed.
  const used = mix.filter((c) => strategies.some((s) => s.through.includes(c)));
  const shown = used.length ? used : mix;
  return { strategies, context: contextLines(ctx, shown), assumed: assumed(ctx, shown, [...unled]), date: input.date };
}

function beforeText(m: Moment, crowd: string, product: string): string {
  if (m.kind === "crowd") return `Time your ${crowd} push for its yearly peak: start as attention starts climbing.`;
  if (m.kind === "event") return `Be at ${m.name}${m.detail ? ` (${m.detail})` : ""} with samples, or send a creator.`;
  if (m.kind === "category") return `Lead with ${product} into ${m.name}.`;
  return `Have stock and an offer ready for ${m.name}.`;
}

/** What the context changed (§23.2 step 6d), each line with its source. */
function contextLines(ctx: StrategyContext, mix: Channel[]): ContextLine[] {
  const out: ContextLine[] = [];
  if (ctx.stockists.length)
    out.push({ key: "stockists", text: `You're already in ${list(ctx.stockists.slice(0, 6).map((s) => s.name))}${ctx.stockists.length > 6 ? ` and ${ctx.stockists.length - 6} more` : ""}, so they aren't suggested again`, sources: uniq(ctx.stockists.flatMap((s) => s.sources)) });
  const metros = uniq([...ctx.soldIn.map((s) => s.metro), ...ctx.stockists.flatMap((s) => (s.metro ? [s.metro] : []))]);
  if (metros.length)
    out.push({ key: "stockists", text: `You already sell in ${list(metros.slice(0, 6))}${metros.length > 6 ? ` and ${metros.length - 6} more` : ""}, so new regions come first`, sources: uniq([...ctx.soldIn.flatMap((s) => s.sources), ...ctx.stockists.filter((s) => s.metro).flatMap((s) => s.sources)]) });
  if (ctx.budget) out.push({ key: "budget", text: `“${ctx.budget.said}” reads as ${ctx.budget.band === "ample" ? "an" : "a"} ${ctx.budget.band} budget, so the mix is ${list(mix.map((c) => CHANNEL_LABEL[c].toLowerCase()))}`, sources: ctx.budget.sources });
  if (ctx.launch) out.push({ key: "launch", text: `“${ctx.launch.said}”: nothing starts before ${dayLabel(ctx.launch.date)}`, sources: ctx.launch.sources });
  if (ctx.capacity) out.push({ key: "capacity", text: `“${ctx.capacity.said}”: ${ctx.capacity.regions === 1 ? "one region" : `${ctx.capacity.regions} regions`} at once`, sources: ctx.capacity.sources });
  return out;
}

function assumed(ctx: StrategyContext, mix: Channel[], unled: string[]): string[] {
  return [
    ctx.budget ? "" : `no budget in your context, so a lean mix: ${list(mix.map((c) => CHANNEL_LABEL[c].toLowerCase()))}`,
    ctx.capacity ? "" : `no capacity in your context, so ${DEFAULT_REGIONS} regions at once`,
    unled.length ? `no lead time in your sources for ${list(unled.slice(0, 4))}${unled.length > 4 ? ` and ${unled.length - 4} more` : ""}, so prep starts ${DEFAULT_PREP_DAYS.retail / 7} weeks before (2 for events)` : "",
  ].filter(Boolean);
}
