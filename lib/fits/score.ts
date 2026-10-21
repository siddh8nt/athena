import { PARAMS, PARAM_LABEL, type Fit, type FitsResult, type Param, type ParamScore, type Tier, type WeightChange } from "./types";

// The combined score (PRD §23.2 step 5a–c, problem 1): every crowd scored on six parameters, each mapped to 0–1 on a
// fixed scale (never relative to the other crowds, so one brand's ranking means the same as another's), then a
// weighted mean. Weights start equal; the agent may move one, within bounds, only for a reason in the founder's
// context with its source. A parameter with nothing measured is left out of that crowd's score and named. Adjacent
// crowds compete on the same score, so the crowd nearest the seed only wins if it scores best. Pure and
// deterministic: the same evidence always gives the same ranking.

/** What was measured for one crowd. Every field is optional except who it is: thin data is scored on what's there. */
export type CrowdEvidence = {
  id: string;
  name: string;
  /** Mean percentile (0–1) of its members in the seed's own ranking: how close it sits to the brand. */
  fit?: number;
  members: number;
  core?: number;
  stability?: number;
  /** Mean specificity of its core members: how much more it loves them than their popularity explains. */
  specificity?: number;
  /** Residents of its significant hot clusters (Census), and those outside where the brand already sells. */
  reach?: { people: number; fresh: number; metros: string[] };
  /** Median year-on-year change in pageviews of its defining articles, and each article's. */
  momentum?: { yoy: number; titles: { title: string; yoy?: number }[] };
  /** Its attention by calendar month (1 = its average month), from years of pageviews. */
  season?: { index: number[]; years: number; titles: string[] };
  /** Dated events for its artists. */
  events?: { name: string; date: string; days: number; artist: string; metro: string; url?: string }[];
  /** The group next to the measured crowds (§23.5 c): scored like them, always Watch, ranked after them. */
  nearMiss?: boolean;
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`);
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A month counts as a peak when attention runs this far above the average month. */
export const PEAK = 1.15;

/** Next-six-months attention lift from a yearly profile, nearer months counting more (e-folding 60 days). */
export function upcomingLift(index: number[], date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  let lift = 0;
  for (let k = 0; k < 6; k++) {
    const mid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 15, 12);
    const days = Math.max(0, (mid - d.getTime()) / 86_400_000);
    lift += Math.max(0, index[(d.getUTCMonth() + k) % 12] - 1) * Math.exp(-days / 60);
  }
  return lift;
}

/** The next peak month from a profile within a year, with the month attention starts to climb toward it. */
export function nextPeak(index: number[], date: string): { month: number; index: number; date: string; days: number; rampDays: number } | undefined {
  const d = new Date(`${date}T12:00:00Z`);
  for (let k = 0; k < 12; k++) {
    const m = (d.getUTCMonth() + k) % 12;
    if (index[m] < PEAK) continue;
    // Skip a peak already under way only if the month is more than half gone.
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1, 12);
    if (k === 0 && d.getUTCDate() > 15) continue;
    // The ramp: how many months before the peak attention is already above average.
    let ramp = 0;
    while (ramp < 3 && index[(m + 11 - ramp) % 12] > 1) ramp++;
    const days = Math.max(0, Math.round((start - d.getTime()) / 86_400_000));
    return { month: m, index: r2(index[m]), date: new Date(start).toISOString().slice(0, 10), days, rampDays: 30 * ramp };
  }
  return undefined;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const pts = (n: number) => `${n} percentile point${n === 1 ? "" : "s"}`;

/** Each parameter's 0–1 score on a fixed scale, and the line that says what was measured. */
export function paramScores(c: CrowdEvidence, date: string): Record<Param, ParamScore> {
  const out = {} as Record<Param, ParamScore>;
  out.fit =
    c.fit === undefined
      ? { text: "not measured" }
      : // Members' mean percentile in the seed's ranking: 0.35 → 0, 0.65 → 1 (crowds measured so far span 0.41–0.61).
        { value: r2(c.fit), score: clamp((c.fit - 0.35) / 0.3), text: `its members sit at the ${ordinal(Math.round(c.fit * 100))} percentile of your brand's own Qloo ranking` };
  out.reach =
    c.reach === undefined
      ? { text: "not measured" }
      : // Log scale: 1M residents → 0, the whole US (2020 Census, 331M) → 1. Hot cells are coarse, so a broad crowd
        // over-indexes in places that together hold over 100M people; the scale has to reach that far to tell crowds apart.
        {
          value: c.reach.fresh,
          score: c.reach.fresh > 0 ? clamp(Math.log10(c.reach.fresh / 1e6) / Math.log10(331)) : 0,
          text: `${people(c.reach.fresh)} people live in the places where it over-indexes${c.reach.fresh < c.reach.people ? ` outside where you already sell (${people(c.reach.people)} in all)` : ""}${c.reach.metros.length ? `, led by ${c.reach.metros.slice(0, 2).join(" and ")}` : ""}`,
        };
  out.efficiency =
    c.specificity === undefined
      ? { text: "not measured" }
      : // Specificity in percentile points: −0.2 → 0, +0.2 → 1.
        {
          value: r2(c.specificity),
          score: clamp(0.5 + c.specificity / 0.4),
          text:
            Math.abs(c.specificity) < 0.02
              ? "it loves its core about as much as their popularity explains, so spend reaches it no better or worse than anyone"
              : c.specificity > 0
                ? `it ranks its core ${pts(Math.round(c.specificity * 100))} higher than their popularity alone explains, so spend reaches the crowd, not everyone`
                : `its core is ${pts(Math.round(-c.specificity * 100))} more mainstream than this crowd alone, so spend spills wider`,
        };
  out.momentum =
    c.momentum === undefined
      ? { text: "not measured" }
      : // Median year-on-year change in attention: −50% → 0, flat → 0.5, +50% → 1.
        { value: r2(c.momentum.yoy), score: clamp(0.5 + c.momentum.yoy), text: `attention to what it loves is ${pct(c.momentum.yoy)} on a year ago (Wikipedia pageviews)` };
  const lift = c.season ? upcomingLift(c.season.index, date) : undefined;
  const soon = (c.events ?? []).filter((e) => e.days >= 0);
  if (lift === undefined && c.events === undefined) out.moments = { text: "not measured" };
  else {
    // Events and seasonal peaks ahead, nearer ones counting more, into 0–1.
    const x = soon.reduce((s, e) => s + Math.exp(-e.days / 45), 0) + 3 * (lift ?? 0);
    const peak = c.season ? nextPeak(c.season.index, date) : undefined;
    const bits = [
      soon.length ? `${soon.length} event${soon.length === 1 ? "" : "s"} for its artists in the next 120 days` : "",
      peak && peak.days <= 183 ? `its attention peaks in ${MONTHS[peak.month]} (${peak.index}× its usual month)` : "",
    ].filter(Boolean);
    out.moments = { value: r2(x), score: clamp(1 - Math.exp(-x)), text: bits.join("; ") || "nothing dated in the next six months" };
  }
  out.signal =
    c.stability === undefined
      ? { text: "not measured" }
      : (() => {
          // Mean of stability (0.3 → 0, 0.8 → 1) and the share of members at its core.
          const share = c.members ? (c.core ?? 0) / c.members : 0;
          return { value: r2(c.stability), score: (clamp((c.stability - 0.3) / 0.5) + clamp(share)) / 2, text: `it comes back the same in ${Math.round(c.stability * 100)}% of resamples, with ${c.core ?? 0} of ${c.members} members at its core` };
        })();
  return out;
}

/** Weights: equal by default; a change is kept only within 0.5–2× and with a source. */
export function weightsOf(changes: WeightChange[]): { weights: Record<Param, number>; kept: WeightChange[] } {
  const weights = Object.fromEntries(PARAMS.map((p) => [p, 1])) as Record<Param, number>;
  const kept: WeightChange[] = [];
  for (const c of changes) {
    if (!PARAMS.includes(c.param) || !c.sources.length || !c.reason.trim() || !Number.isFinite(c.weight)) continue;
    const w = Math.max(0.5, Math.min(2, c.weight));
    weights[c.param] = w;
    kept.push({ ...c, weight: w });
  }
  return { weights, kept: kept.filter((c, i) => kept.findLastIndex((x) => x.param === c.param) === i) };
}

/** Near the top: within this much of the best score, a crowd is also Win first. */
const TIE = 0.03;
/** Watch: this far below the best, or a crowd whose signal is too weak to act on. */
const BEHIND = 0.15;
const WEAK = 0.3;

/** Scores, ranks and tiers the crowds; every reason comes from the numbers. */
export function rankFits(crowds: CrowdEvidence[], opts: { date: string; changes?: WeightChange[]; excluded?: FitsResult["excluded"] }): FitsResult {
  const { weights, kept } = weightsOf(opts.changes ?? []);
  const scored = crowds.map((c) => {
    const params = paramScores(c, opts.date);
    const present = PARAMS.filter((p) => params[p].score !== undefined);
    const total = present.reduce((s, p) => s + weights[p], 0);
    const score = total ? present.reduce((s, p) => s + weights[p] * params[p].score!, 0) / total : 0;
    return { c, params, present, score, missing: PARAMS.filter((p) => !present.includes(p)) };
  });
  // Measured crowds first: the near-miss group never moves Win first or Win next (§23.5 c). Ties break toward the
  // stronger signal, then the name, so the order never depends on input order.
  scored.sort((a, b) => Number(!!a.c.nearMiss) - Number(!!b.c.nearMiss) || b.score - a.score || (b.params.signal.score ?? 0) - (a.params.signal.score ?? 0) || a.c.name.localeCompare(b.c.name));
  const best = scored.find((s) => !s.c.nearMiss)?.score ?? 0;
  const mean = (p: Param) => {
    const xs = scored.map((s) => s.params[p].score).filter((x): x is number => x !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };

  const fits: Fit[] = scored.map((s, rank) => {
    const weak = (s.params.signal.score ?? 1) < WEAK;
    const tier: Tier = s.c.nearMiss ? "watch" : rank === 0 || (rank === 1 && best - s.score <= TIE && !weak) ? "win_first" : weak || best - s.score > BEHIND ? "watch" : "win_next";
    // Reasons: where it beats the other crowds most, then (below the top) what holds it back.
    const vs = s.present.map((p) => ({ p, d: (s.params[p].score! - mean(p)) * weights[p] })).sort((a, b) => b.d - a.d);
    const up = (scored.length > 1 ? vs.filter((x) => x.d > 0.02) : vs.filter((x) => s.params[x.p].score! >= 0.6)).slice(0, 2);
    const down = tier === "win_first" ? [] : vs.filter((x) => x.d < -0.02).slice(-1);
    const reasons = [
      ...up.map((x) => `${PARAM_LABEL[x.p]}: ${s.params[x.p].text}`),
      ...(weak ? [`${PARAM_LABEL.signal}, too soft to act on yet: ${s.params.signal.text}`] : []),
      ...down.filter((x) => !(weak && x.p === "signal")).map((x) => `Held back by ${PARAM_LABEL[x.p].toLowerCase()}: ${s.params[x.p].text}`),
    ];
    const peak = s.c.season ? nextPeak(s.c.season.index, opts.date) : undefined;
    const event = (s.c.events ?? []).filter((e) => e.days >= 0).sort((a, b) => a.days - b.days)[0];
    const when = [
      peak ? `Attention peaks in ${MONTHS[peak.month]} ${peak.date.slice(0, 4)} (${peak.days ? `in ${peak.days} days` : "now"})${peak.rampDays ? `, climbing from ${MONTHS[(peak.month + 12 - peak.rampDays / 30) % 12]}` : ""}` : "",
      event ? `${event.artist} plays ${event.metro} on ${event.date}` : "",
    ].filter(Boolean);
    return { crowd: s.c.id, name: s.c.name, rank: rank + 1, tier, score: r2(s.score), params: s.params, reasons, when: when.join("; ") || undefined, missing: s.missing, ...(s.c.nearMiss ? { nearMiss: true } : {}) };
  });
  return { fits, weights, changes: kept, excluded: opts.excluded ?? [], date: opts.date };
}

/**
 * A yearly attention profile from monthly views: each complete calendar year divided by its own mean, then the
 * median per month across years (so one viral spike doesn't make a season). Needs three complete years.
 */
export function seasonIndex(months: [string, number][]): { index: number[]; years: number } | undefined {
  const byYear = new Map<string, number[]>();
  for (const [ym, v] of months) {
    const [y, m] = ym.split("-");
    const row = byYear.get(y) ?? new Array<number>(12).fill(-1);
    row[Number(m) - 1] = v;
    byYear.set(y, row);
  }
  const years = [...byYear.values()].filter((r) => r.every((v) => v > 0)).map((r) => {
    const mean = r.reduce((a, b) => a + b, 0) / 12;
    return r.map((v) => v / mean);
  });
  if (years.length < 3) return undefined;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const raw = Array.from({ length: 12 }, (_, m) => median(years.map((r) => r[m])));
  const mean = raw.reduce((a, b) => a + b, 0) / 12;
  return { index: raw.map((v) => r2(v / mean)), years: years.length };
}

/** Several articles' profiles as one, each counting equally. */
export function meanIndex(indexes: number[][]): number[] | undefined {
  if (!indexes.length) return undefined;
  return Array.from({ length: 12 }, (_, m) => r2(indexes.reduce((s, x) => s + x[m], 0) / indexes.length));
}

/** The months a profile peaks in, strongest first. */
export const peaksOf = (index: number[]) =>
  index
    .map((v, month) => ({ month, index: v }))
    .filter((x) => x.index >= PEAK)
    .sort((a, b) => b.index - a.index);
