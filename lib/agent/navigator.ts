import "server-only";
import { results, type QlooClient } from "@/lib/qloo/client";
import type { HeatmapCell } from "@/lib/qloo/types";
import { METROS, metroById, type Metro } from "@/lib/playbook/metros";
import { locationParams } from "@/lib/places/location";
import type { MarketRow, Neighbourhood } from "@/lib/blocks/markets";
import type { AreaFigures } from "@/lib/enrich/census";
import { itemId } from "./outcomes";
import type { CrowdInput } from "./scout";
import type { CrowdCard } from "@/lib/journey/types";
import { TIER_LABEL, TIER_ORDER, type Block, type CrowdPage, type CrowdTier, type PageSource, type PageTab, type Row, type Section } from "@/lib/team/page";
import type { Outcome } from "@/lib/team/types";

// The Navigator's page (PRD §23.5 e), on all three crowds and three levels: which cities each crowd ranks, and where
// two or three crowds are strong at once (Level 1); each city's fit, market, rivals and verdict (Level 2); every hot
// neighbourhood in it, with Census tract and ZIP figures and a role (Level 3). Reading is Qloo and Census; building the
// page is pure, so it can be tested. The Rep's venue counts and the Promoter's moments are filled in after those run,
// never read into a verdict (§23.5 i).

/** A crowd is strong in a city this many standard deviations above its own mean across the cities. */
export const STRONG_Z = 0.5;
/** At most this many brands go into one Qloo call. */
const PER_CALL = 50;
/** Each crowd's brands read per city. */
const PER_CROWD = 16;
/** Cities worked to the neighbourhood level, at most. */
const MAX_WORKED = 5;
/** Heat cells kept per crowd layer on the map. */
const MAX_CELLS = 400;
/** Neighbourhoods kept per city. */
const MAX_HOODS = 20;
/** A spillover sits within this many km of an anchor. */
const SPILL_KM = 5;
/** A ZIP with fewer residents than this is a place people come to, not where they live: a pop-up or event spot. */
const VISITED = 8_000;

export type Verdict = "launch" | "test" | "later" | "home";
export const VERDICT_LABEL: Record<Verdict, string> = { launch: "Launch here", test: "Test here", later: "Later", home: "Already yours" };
const VERDICT_SO: Record<Verdict, string> = { launch: "a city to launch in", test: "one to test first", later: "one for later", home: "" };

/**
 * Why a city got its verdict, as a sentence the founder reads (§23.8 f): the crowds strong there by their handles,
 * never their full names glued into a list. "The Graza crowd and the Liquid I.V. crowd are strong here, so it's a
 * city to launch in."
 */
export function cityWhy(v: Verdict, crowds: CrowdCard[]): string {
  const names = crowds.map((c) => c.handle ?? c.name);
  const who = names.length ? `${and(names)} ${names.length > 1 ? "are" : "is"} strong here` : "";
  const line = v === "home" ? (who ? `Already yours, and ${who}` : "Already yours") : `${who || "No crowd is strong here yet"}, so it's ${VERDICT_SO[v]}`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}
export type Role = "anchor" | "spillover" | "popup" | "online";
export const ROLE_LABEL: Record<Role, string> = { anchor: "Anchor", spillover: "Spillover", popup: "Pop-up or event spot", online: "Online-target zip" };

export type CityFit = { metroId: string; name: string; score?: number; z: number; reason: string; leans: string[] };
export type CrowdCities = CrowdInput & { cities: CityFit[] };
export type Hood = { name: string; around?: boolean; at?: [number, number]; cells: number; heat: Record<string, number>; area?: AreaFigures };
export type CityRead = {
  metroId: string;
  name: string;
  center: [number, number];
  bbox?: [number, number, number, number];
  census?: { residents?: number; income?: number };
  /** The Analyst's rivals that score furthest above their own average here. */
  rivals: string[];
  yours: boolean;
  layers: { crowd: string; cells: [number, number, number][]; callId?: string }[];
  hoods: Hood[];
};
export type NavRead = { crowds: CrowdCities[]; cities: CityRead[]; cap: number; calls: number; callIds: string[] };

export type NavDeps = {
  rivals: { id: string; name: string }[];
  ownId?: string;
  comparables: { id: string; name: string }[];
  /** Metro ids the brand already sells in, and its home: "already yours", never counted as new. */
  yours: string[];
  /** How many new cities each crowd gets, from the founder's regions answer (2 unless they said). */
  cap: number;
  /** A city worked first whatever it scores: the home city, when the goal is to go deeper there. */
  must?: string;
  census?: (m: Metro) => Promise<MarketRow["census"]>;
  names?: (m: Metro, cells: HeatmapCell[]) => Promise<Neighbourhood[] | null>;
  areas?: (points: [number, number][]) => Promise<(AreaFigures | undefined)[]>;
  status?: (s: string) => void;
};

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
};
const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join(""));
const km = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * 111, (b[1] - a[1]) * 111 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180)));

/** Each brand's affinity in each metro, from one call per metro (or per 50 brands). */
async function affinities(qloo: QlooClient, ids: string[], status?: (s: string) => void) {
  const chunks = Array.from({ length: Math.ceil(ids.length / PER_CALL) }, (_, k) => ids.slice(k * PER_CALL, k * PER_CALL + PER_CALL));
  status?.(`Scoring ${METROS.length} cities on your crowds' brands, one Qloo call per city`);
  const names = new Map<string, string>();
  const callIds: string[] = [];
  const by = new Map<string, Map<string, number>>();
  await Promise.all(
    METROS.flatMap((m) =>
      chunks.map(async (chunk) => {
        const res = await qloo.insights({ "filter.type": "urn:entity:brand", "signal.location.query": m.query, "filter.results.entities": chunk, take: chunk.length }).catch(() => undefined);
        if (!res) return;
        callIds.push(res.call.id);
        const aff = by.get(m.id) ?? new Map<string, number>();
        for (const e of results(res).entities ?? []) {
          if (typeof e.query?.affinity !== "number") continue;
          aff.set(e.entity_id, e.query.affinity);
          names.set(e.entity_id, e.name);
        }
        by.set(m.id, aff);
      }),
    ),
  );
  return { by, names, callIds };
}

/** Each brand's lift in a metro: its affinity there in its own standard deviations across the metros that score it. */
function lifts(by: Map<string, Map<string, number>>) {
  const across = new Map<string, number[]>();
  for (const aff of by.values()) for (const [id, a] of aff) across.set(id, [...(across.get(id) ?? []), a]);
  const spread = new Map([...across].filter(([, xs]) => xs.length >= 3).map(([id, xs]) => [id, { m: mean(xs), s: sd(xs) }] as const));
  return (metro: string, id: string) => {
    const a = by.get(metro)?.get(id);
    const s = spread.get(id);
    return a === undefined || !s || s.s <= 0 ? undefined : (a - s.m) / s.s;
  };
}

/** One crowd's ranking of every city: the mean affinity of its brands, as a z-score across the cities. Pure. */
export function rankCities(brandIds: string[], by: Map<string, Map<string, number>>, names: Map<string, string>): CityFit[] {
  const lift = lifts(by);
  const raw = METROS.map((m) => {
    const xs = brandIds.flatMap((id) => (by.get(m.id)?.has(id) ? [by.get(m.id)!.get(id)!] : []));
    return { m, n: xs.length, score: xs.length ? mean(xs) : undefined };
  });
  const scored = raw.filter((x) => x.score !== undefined).map((x) => x.score!);
  const [mu, s] = [mean(scored), sd(scored)];
  return raw
    .map((x): CityFit => {
      const leans = brandIds
        .flatMap((id) => {
          const l = lift(x.m.id, id);
          return l !== undefined && l > STRONG_Z ? [{ name: names.get(id) ?? id, l }] : [];
        })
        .sort((a, b) => b.l - a.l)
        .slice(0, 3)
        .map((v) => v.name);
      return {
        metroId: x.m.id,
        name: x.m.name,
        score: x.score === undefined ? undefined : Math.round(x.score * 1000) / 1000,
        z: x.score === undefined || s <= 0 ? -9 : Math.round(((x.score - mu) / s) * 100) / 100,
        leans,
        reason: leans.length ? `Loves ${and(leans)} more than most places` : x.n ? `Scored on ${x.n} of its brands` : "Little of its taste shows here yet",
      };
    })
    .sort((a, b) => b.z - a.z);
}

export const isStrong = (f?: CityFit) => !!f && f.z >= STRONG_Z;

/** The cities worked to the neighbourhood level: each crowd's top new ones, overlap cities first, and home when it's strong. Pure. */
export function workedCities(crowds: CrowdCities[], yours: string[], cap: number, must?: string): string[] {
  const fresh = (c: CrowdCities) => c.cities.filter((f) => !yours.includes(f.metroId));
  const top = crowds.flatMap((c) => fresh(c).slice(0, cap).map((f) => f.metroId));
  const count = (id: string) => crowds.filter((c) => isStrong(c.cities.find((f) => f.metroId === id))).length;
  const overlap = [...new Set(crowds.flatMap((c) => fresh(c).filter((f) => count(f.metroId) >= 2).map((f) => f.metroId)))];
  const home = yours.filter((id) => count(id) >= 1).slice(0, 1);
  return [...new Set([...(must ? [must] : []), ...overlap.filter((id) => top.includes(id)), ...top, ...overlap, ...home])].slice(0, MAX_WORKED);
}

/**
 * The Navigator's read: every city scored for all three crowds at once (their brands and the rivals in one call per
 * city), then in each worked city a heatmap per crowd, its neighbourhoods named, and each one's tract and ZIP from the
 * Census. About 25 + 3 per worked city Qloo calls.
 */
export async function readCities(qloo: QlooClient, inputs: CrowdInput[], deps: NavDeps): Promise<NavRead> {
  const brandsOf = (x: CrowdInput) => (x.crowd.brands?.length ? x.crowd.brands : deps.comparables).map((b) => b.id).slice(0, PER_CROWD);
  const ids = [...new Set([...inputs.flatMap(brandsOf), ...deps.rivals.map((r) => r.id), ...(deps.ownId ? [deps.ownId] : [])])];
  const { by, names, callIds } = await affinities(qloo, ids, deps.status);
  const crowds = inputs.map((x) => ({ ...x, cities: rankCities(brandsOf(x), by, names) }));
  const lift = lifts(by);
  const worked = workedCities(crowds, deps.yours, deps.cap, deps.must);
  deps.status?.(`Mapping where each crowd's taste runs hot in ${and(worked.map((id) => metroById(id).name))}`);
  const cities = await Promise.all(
    worked.map(async (id): Promise<CityRead> => {
      const m = metroById(id);
      const loc = await locationParams(m);
      const [census, layers] = await Promise.all([
        deps.census?.(m).catch(() => undefined),
        Promise.all(
          inputs.map(async (x) => {
            const res = await qloo.insights({ "filter.type": "urn:heatmap", ...loc, "signal.interests.entities": x.crowd.signal.map((s) => s.id) }).catch(() => undefined);
            if (res) callIds.push(res.call.id);
            return { crowd: x.crowd.id, raw: res ? (results(res).heatmap ?? []) : [], callId: res?.call.id };
          }),
        ),
      ]);
      // Each crowd's neighbourhoods, merged by name: one row per place, with each crowd's heat there.
      const hoods = new Map<string, Hood>();
      await Promise.all(
        layers.map(async (l) => {
          const named = (await deps.names?.(m, l.raw).catch(() => null)) ?? [];
          for (const n of named) {
            const h = hoods.get(n.name) ?? { name: n.name, around: n.around, at: n.at, cells: 0, heat: {} };
            h.heat[l.crowd] = Math.round(n.score * 100) / 100;
            h.cells = Math.max(h.cells, n.cells);
            hoods.set(n.name, h);
          }
        }),
      );
      const kept = [...hoods.values()].sort((a, b) => Math.max(...Object.values(b.heat)) - Math.max(...Object.values(a.heat))).slice(0, MAX_HOODS);
      const areas = deps.areas ? await deps.areas(kept.map((h) => h.at ?? m.center)).catch(() => []) : [];
      kept.forEach((h, i) => (h.area = areas[i]));
      return {
        metroId: id,
        name: m.name,
        center: m.center,
        bbox: m.bbox,
        census: census ? { residents: census.population?.value, income: census.medianIncome?.value } : undefined,
        rivals: deps.rivals.filter((r) => (lift(id, r.id) ?? 0) > STRONG_Z).map((r) => r.name),
        yours: deps.yours.includes(id),
        layers: layers.map((l) => ({
          crowd: l.crowd,
          callId: l.callId,
          cells: [...l.raw]
            .sort((a, b) => b.query.affinity_rank - a.query.affinity_rank)
            .slice(0, MAX_CELLS)
            .map((c) => [c.location.latitude, c.location.longitude, Math.round(c.query.affinity_rank * 100) / 100] as [number, number, number]),
        })),
        hoods: kept,
      };
    }),
  );
  return { crowds, cities, cap: deps.cap, calls: callIds.length, callIds };
}

// ---- The page (pure) ----------------------------------------------------------------------------------------------

/** What the Rep and the Promoter found, filled in after they run: links on the page, never inputs to a verdict. */
export type BackFill = {
  venues?: { metroId: string; points: { name: string; lat?: number; lon?: number; neighbourhood?: string }[] }[];
  moments?: { metroId: string; names: string[]; hoods?: { hood: string; names: string[] }[] }[];
};

const money = (n?: number) => (n ? `$${Math.round(n / 1000)}k` : "—");
const people = (n?: number) => (!n ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));
// A spot with no place name is named by its ZIP; then the ZIP isn't repeated beside it.
const label = (h: Hood) => (h.around ? `around ${/^\d{5}$/.test(h.name) ? `ZIP ${h.name}` : h.name}` : h.name);

/** How many crowds are strong in a city, and which. */
const strongIn = (read: NavRead, metroId: string) => read.crowds.filter((c) => isStrong(c.cities.find((f) => f.metroId === metroId)));

/** A city's fit for a crowd as a z-score, -9 when unscored. */
const zIn = (c: CrowdCities, metroId: string) => c.cities.find((f) => f.metroId === metroId)?.z ?? -9;

/**
 * The new cities to launch in, as many as the team can work: those where two or more crowds are strong, or Win first's
 * top new city when it's strong, ranked by how many crowds are strong there, then by their summed fit.
 */
function launches(read: NavRead, yours: string[]): string[] {
  const first = read.crowds.find((c) => c.tier === "win_first");
  const top = first?.cities.find((f) => !yours.includes(f.metroId));
  const ids = [...new Set(read.crowds.flatMap((c) => c.cities.map((f) => f.metroId)))].filter((id) => !yours.includes(id));
  const fit = (id: string) => read.crowds.reduce((s, c) => s + Math.max(0, zIn(c, id)), 0);
  return ids
    .filter((id) => strongIn(read, id).length >= 2 || (top?.metroId === id && isStrong(top)))
    .sort((a, b) => strongIn(read, b).length - strongIn(read, a).length || fit(b) - fit(a))
    .slice(0, Math.max(1, read.cap));
}

/**
 * A city's verdict. Launch: one of the launches above, sized to what the team can work. Test: any other city where a
 * crowd is strong. Later: none. A step marked as not working moves it down one; one that worked moves it up one.
 */
export function verdict(read: NavRead, metroId: string, yours: string[], outcomes: Outcome[] = []): Verdict {
  if (yours.includes(metroId)) return "home";
  const strong = strongIn(read, metroId);
  const base: Verdict = launches(read, yours).includes(metroId) ? "launch" : strong.length ? "test" : "later";
  const marks = outcomes.filter((o) => o.agent === "navigator" && o.group === metroId);
  const order: Verdict[] = ["later", "test", "launch"];
  const shift = marks.some((o) => o.mark === "no") ? -1 : marks.some((o) => o.mark === "yes") ? 1 : 0;
  return order[Math.max(0, Math.min(2, order.indexOf(base) + shift))];
}

/** Heat bands within one crowd in one city: Hot at its top quarter, Warm above its median. */
function band(city: CityRead, crowd: string, v?: number): string {
  if (v === undefined) return "—";
  const xs = city.hoods.flatMap((h) => (h.heat[crowd] !== undefined ? [h.heat[crowd]] : [])).sort((a, b) => a - b);
  const at = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  return v >= at(0.75) ? "Hot" : v >= at(0.5) ? "Warm" : "Mild";
}

/** Each neighbourhood's role: the two hottest across the crowds anchor; a ZIP few people live in is a pop-up spot; near an anchor, spillover; else an online-target zip. */
export function roles(city: CityRead): Map<string, Role> {
  const total = (h: Hood) => mean(Object.values(h.heat));
  const order = [...city.hoods].sort((a, b) => total(b) - total(a));
  const anchors = order.slice(0, 2);
  const out = new Map<string, Role>();
  for (const h of order) {
    const residents = h.area?.zip?.residents;
    out.set(
      h.name,
      anchors.includes(h)
        ? "anchor"
        : residents !== undefined && residents < VISITED
          ? "popup"
          : h.at && anchors.some((a) => a.at && km(a.at, h.at!) <= SPILL_KM)
            ? "spillover"
            : "online",
    );
  }
  return out;
}

/** Venues the Rep found, counted to the nearest neighbourhood within 2.5 km, else by name. */
function venueCounts(city: CityRead, fill?: BackFill): Map<string, number> {
  const out = new Map<string, number>();
  const here = fill?.venues?.find((x) => x.metroId === city.metroId);
  if (!here) return out;
  for (const v of here.points) {
    let best: Hood | undefined;
    let bestKm = 2.5;
    if (v.lat !== undefined && v.lon !== undefined)
      for (const h of city.hoods) {
        const d = h.at ? km(h.at, [v.lat, v.lon]) : Infinity;
        if (d < bestKm) (best = h), (bestKm = d);
      }
    best ??= city.hoods.find((h) => h.name.toLowerCase() === v.neighbourhood?.toLowerCase());
    if (best) out.set(best.name, (out.get(best.name) ?? 0) + 1);
  }
  return out;
}

function hoodAction(h: Hood, role: Role, anchor: string | undefined, venues?: number): string {
  if (role === "anchor") return venues ? `Pitch the ${venues} matching ${venues === 1 ? "shop" : "shops"} in ${label(h)} first` : `Start here: the Rep pitches the shops in ${label(h)} first`;
  if (role === "spillover") return `Pitch the shops in ${label(h)} once ${anchor ?? "the anchor"} holds`;
  if (role === "popup") return `Run a pop-up or a sampling in ${label(h)}: more people come here than live here`;
  return h.area?.zip ? `Geo-target ads to ZIP ${h.area.zip.id}` : `Geo-target ads around ${h.name}`;
}

const crowdName = (read: NavRead, id: string) => read.crowds.find((c) => c.crowd.id === id)?.crowd.name ?? id;

/** One crowd's people in the city: the residents of the ZIPs where its taste runs hot. An estimate, and labelled so. */
export function crowdSize(city: CityRead, crowd: string): number | undefined {
  const hot = city.hoods.filter((h) => band(city, crowd, h.heat[crowd]) === "Hot" && h.area?.zip?.residents);
  const zips = new Map(hot.map((h) => [h.area!.zip!.id, h.area!.zip!.residents!]));
  return zips.size ? [...zips.values()].reduce((a, b) => a + b, 0) : undefined;
}

function hoodRow(read: NavRead, city: CityRead, h: Hood, role: Role, anchor: string | undefined, venues?: number, shops = false, events?: string[], showEvents = false): Row {
  const heat = read.crowds.map((c) => `${band(city, c.crowd.id, h.heat[c.crowd.id])}`);
  const z = h.area?.zip;
  const t = h.area?.tract;
  return {
    cells: [label(h), ...heat, z ? people(z.residents) : t ? people(t.residents) : "—", z ? money(z.income) : t ? money(t.income) : "—", ...(shops ? [venues ? String(venues) : "—"] : []), ...(showEvents ? [events?.length ? String(events.length) : "—"] : []), ROLE_LABEL[role]],
    detail: {
      title: label(h),
      kind: "neighbourhood",
      item: itemId("neighbourhood", `${city.name}: ${h.name}`),
      facts: [
        ...read.crowds.map((c) => ({ label: `Heat for ${c.crowd.name}`, value: h.heat[c.crowd.id] !== undefined ? `${band(city, c.crowd.id, h.heat[c.crowd.id])} (${h.heat[c.crowd.id]})` : "Not hot for this crowd" })),
        ...(z ? [{ label: `ZIP ${z.id}`, value: `${people(z.residents)} residents · median income ${money(z.income)}` }] : []),
        ...(t ? [{ label: t.name, value: `${people(t.residents)} residents · median income ${money(t.income)}` }] : []),
        { label: "Role", value: ROLE_LABEL[role] },
        ...(venues ? [{ label: "Matching shops", value: `${venues}, from the Rep` }] : []),
        ...(events?.length ? [{ label: "Events here, from the Promoter", value: events.join(" · ") }] : []),
      ],
      lines: [hoodAction(h, role, anchor, venues)],
    },
  };
}

/** A city's own page (Level 2 and 3): fit per crowd, market, crowd size, rivals, verdict, actions, moments, the map and every hot neighbourhood. */
function cityPage(read: NavRead, city: CityRead, v: Verdict, opts: { channel?: "online" | "offline" | "both"; fill?: BackFill }): Section {
  const fits = read.crowds.map((c) => ({ c, f: c.cities.find((x) => x.metroId === city.metroId) }));
  const strong = fits.filter((x) => isStrong(x.f));
  const lead = [...(strong.length ? strong : fits)].sort((a, b) => (b.f?.z ?? -9) - (a.f?.z ?? -9) || TIER_ORDER.indexOf(a.c.tier) - TIER_ORDER.indexOf(b.c.tier))[0];
  const role = roles(city);
  const venues = venueCounts(city, opts.fill);
  const anchors = city.hoods.filter((h) => role.get(h.name) === "anchor");
  const start = anchors.filter((h) => h.name !== city.name).map(label);
  const entry =
    v === "home"
      ? "Go deeper: the shops you aren't in yet"
      : opts.channel === "online"
        ? "Online first: geo-target the hot ZIPs, then a pop-up"
        : v === "launch"
          ? "Shops first"
          : v === "test"
            ? "A pop-up or an event first, to test demand"
            : "Online first, until a crowd here grows";
  const here = opts.fill?.moments?.find((m) => m.metroId === city.metroId);
  const moments = here?.names ?? [];
  const events = new Map((here?.hoods ?? []).map((x) => [x.hood, x.names]));
  const blocks: Block[] = [
    {
      type: "facts",
      rows: [
        { label: "Verdict", value: VERDICT_LABEL[v] },
        { label: "Residents", value: people(city.census?.residents), src: "census" },
        { label: "Median household income", value: money(city.census?.income), src: "census" },
        { label: "Rivals strong here", value: city.rivals.length ? and(city.rivals) : "None of your rivals over-index here" },
      ],
    },
    {
      type: "table",
      label: "Crowd by crowd",
      columns: ["Crowd", "Tier", "Fit", "People in its hot areas"],
      rows: fits.map(({ c, f }) => {
        const n = crowdSize(city, c.crowd.id);
        const fit = isStrong(f) ? "Strong here" : f && f.z > 0 ? "Above its average" : "Below its average";
        return {
          cells: [c.crowd.name, TIER_LABEL[c.tier], fit, n ? `about ${people(n)}` : "—"],
          detail: { title: `${c.crowd.name} in ${city.name}`, facts: [{ label: "Fit", value: f?.reason ?? fit }, ...(n ? [{ label: "People in its hot areas", value: `about ${people(n)} (estimate: residents of its hot ZIPs, Census)` }] : [])] },
        };
      }),
    },
    {
      type: "lines",
      label: "Actions",
      lines: [
        { text: entry, tag: "How to enter" },
        { text: `Lead with ${lead?.c.crowd.name ?? "your Win first crowd"}`, tag: "Which crowd" },
        ...(start.length ? [{ text: `Start in ${and(start)}`, tag: "Where" }] : []),
        { text: "The Rep finds the shops there; the Promoter looks for events and moments around them", tag: "Next" },
      ],
    },
    ...(moments.length ? [{ type: "names" as const, label: "Moments there, from the Promoter", groups: [{ label: "Moments", names: moments.map((name) => ({ name, kind: "moment" })) }] }] : []),
    {
      type: "heat",
      city: { name: city.name, center: city.center, bbox: city.bbox },
      layers: city.layers.filter((l) => l.cells.length).map((l) => ({ crowd: l.crowd, name: crowdName(read, l.crowd), tier: read.crowds.find((c) => c.crowd.id === l.crowd)?.tier ?? "watch", cells: l.cells })),
    },
    city.hoods.length
      ? {
          type: "table",
          label: `Every hot neighbourhood (${city.hoods.length})`,
          columns: ["Neighbourhood", ...read.crowds.map((c) => c.crowd.name), "Residents", "Income", ...(venues.size ? ["Shops"] : []), ...(events.size ? ["Events"] : []), "Role"],
          rows: city.hoods.map((h) => hoodRow(read, city, h, role.get(h.name) ?? "online", anchors[0] ? label(anchors[0]) : undefined, venues.get(h.name), venues.size > 0, events.get(h.name), events.size > 0)),
        }
      : { type: "note", text: `The taste map of ${city.name} is spread evenly, with no neighbourhood standing out yet` },
  ];
  return { id: `city:${city.metroId}`, title: city.name, summary: cityWhy(v, strong.map((x) => x.c.crowd)), blocks };
}

/** A crowd tab (Level 1 for that crowd): its city ranking, with why and the rivals strong there, and its hot neighbourhoods. */
export function crowdTab(read: NavRead, c: CrowdCities, yours: string[], outcomes: Outcome[] = []): PageTab {
  const fresh = c.cities.filter((f) => !yours.includes(f.metroId));
  const shown = fresh.slice(0, read.cap + 3);
  const census = new Map(read.cities.map((x) => [x.metroId, x]));
  const mine = c.cities.filter((f) => yours.includes(f.metroId));
  const worked = read.cities.filter((x) => !x.yours && shown.slice(0, read.cap).some((f) => f.metroId === x.metroId));
  const hot = worked.flatMap((city) => city.hoods.filter((h) => band(city, c.crowd.id, h.heat[c.crowd.id]) === "Hot").map((h) => ({ city, h })));
  const sections: Section[] = [
    {
      id: "cities",
      title: "Its cities",
      summary: `Its top ${Math.min(read.cap, shown.length)} new ${read.cap === 1 ? "city" : "cities"}, as many as you can work`,
      blocks: [
        {
          type: "table",
          columns: ["City", "Fit", "Why", "Residents", "Income", "Rivals strong here", "Verdict"],
          rows: shown.map((f, i) => {
            const x = census.get(f.metroId);
            const w = worked.find((y) => y.metroId === f.metroId);
            return {
              cells: [
                `${i + 1}. ${f.name}`,
                isStrong(f) ? "Strong" : f.z > 0 ? "Above average" : "Below average",
                i < read.cap ? f.reason : "",
                people(x?.census?.residents),
                money(x?.census?.income),
                w ? (w.rivals.length ? and(w.rivals) : "None") : "",
                i < read.cap ? VERDICT_LABEL[verdict(read, f.metroId, yours, outcomes)] : "Not worked yet",
              ],
              ...(x ? { goto: `city:${f.metroId}` } : {}),
              detail: { title: f.name, facts: [{ label: "Fit", value: f.reason }, { label: "Score", value: f.score !== undefined ? `${f.score} (${f.z >= 0 ? "+" : ""}${f.z} sd)` : "—" }] },
            };
          }),
        },
        ...(mine.length ? [{ type: "note" as const, text: `Already yours: ${and(mine.map((f) => `${f.name}${isStrong(f) ? " (strong for this crowd)" : ""}`))}. Kept as home base, not counted as new.` }] : []),
      ],
    },
    {
      id: "hoods",
      title: "Where it runs hot",
      summary: hot.length ? `${hot.length} hot ${hot.length === 1 ? "neighbourhood" : "neighbourhoods"} in its cities` : undefined,
      blocks: hot.length
        ? [{ type: "names", groups: worked.map((city) => ({ label: city.name, names: hot.filter((x) => x.city === city).map((x) => ({ name: label(x.h), kind: "neighbourhood", note: x.h.area?.zip && x.h.area.zip.id !== x.h.name ? `ZIP ${x.h.area.zip.id}` : undefined })) })).filter((g) => g.names.length) }]
        : [{ type: "note", text: "Its taste is spread evenly across its cities, with no neighbourhood standing out yet" }],
    },
  ];
  return {
    crowd: { id: c.crowd.id, name: c.crowd.name, tier: c.tier, ...(c.crowd.nearMiss ? { nearMiss: true } : {}) },
    sections,
    sources: [{ id: "census", label: "Census, ACS 2020–2024" }],
    method: `Read from ${METROS.length + worked.length} Qloo signals · Census ACS 2020–2024`,
  };
}

/** Across all three: the overview table, overlap cities, what's already yours, each city's own page and the next steps. */
export function across(read: NavRead, yours: string[], opts: { channel?: "online" | "offline" | "both"; fill?: BackFill; outcomes?: Outcome[] } = {}): NonNullable<CrowdPage["across"]> {
  const v = (id: string) => verdict(read, id, yours, opts.outcomes);
  const cities = [...read.cities].sort((a, b) => ["launch", "test", "later", "home"].indexOf(v(a.metroId)) - ["launch", "test", "later", "home"].indexOf(v(b.metroId)));
  const overlap = cities.filter((c) => !c.yours && strongIn(read, c.metroId).length >= 2);
  const mine = yours.map((id) => ({ id, name: metroById(id).name, strong: strongIn(read, id) }));
  const steps = cities
    .filter((c) => v(c.metroId) !== "later")
    .flatMap((c) => {
      const role = roles(c);
      const anchor = c.hoods.find((h) => role.get(h.name) === "anchor" && h.name !== c.name);
      const lead = [...strongIn(read, c.metroId)].sort((a, b) => zIn(b, c.metroId) - zIn(a, c.metroId))[0]?.crowd.name;
      const text = v(c.metroId) === "launch" ? `Launch in ${c.name}${anchor ? `, starting in ${label(anchor)}` : ""}` : v(c.metroId) === "test" ? `Test ${c.name} with a pop-up${anchor ? ` in ${label(anchor)}` : ""}` : `Go deeper in ${c.name}${anchor ? `, in ${label(anchor)}` : ""}`;
      return [{ text, item: itemId("step", text), group: c.metroId, ...(lead ? { detail: `Lead with ${lead}` } : {}) }];
    });
  const sections: Section[] = [
    {
      id: "overview",
      title: "Cities at a glance",
      summary: overlap.length ? `${overlap.length} overlap ${overlap.length === 1 ? "city" : "cities"}: one launch reaches two or three crowds` : undefined,
      blocks: [
        {
          type: "table",
          columns: ["City", "Crowds strong here", "One launch reaches", "Residents", "Income", "Verdict"],
          rows: cities.map((c) => ({
            cells: [
              c.name,
              strongIn(read, c.metroId).map((x) => x.crowd.name).join(", ") || "None yet",
              overlap.includes(c) ? `${strongIn(read, c.metroId).length} crowds: an efficient first launch` : "",
              people(c.census?.residents),
              money(c.census?.income),
              VERDICT_LABEL[v(c.metroId)],
            ],
            goto: `city:${c.metroId}`,
          })),
        },
        ...(overlap.length ? [] : [{ type: "note" as const, text: "No city is strong for two crowds at once yet, so each crowd starts in its own city" }]),
        ...(mine.length ? [{ type: "note" as const, text: `Already yours: ${and(mine.map((m) => `${m.name}${m.strong.length ? ` (strong for ${and(m.strong.map((x) => x.crowd.name))})` : ""}`))}. Kept as home base, not counted as new.` }] : []),
      ],
    },
    ...cities.map((c) => cityPage(read, c, v(c.metroId), opts)),
    {
      id: "next",
      title: "Next steps",
      summary: "Tick them as you go; what worked moves its city up",
      blocks: steps.length ? [{ type: "checks", checks: steps }] : [{ type: "note", text: "Start online while the crowds grow in these cities" }],
    },
  ];
  return { sections, sources: [{ id: "census", label: "Census, ACS 2020–2024" }], method: `Read from ${read.calls} Qloo signals · ${read.crowds.length} crowds · Census ACS 2020–2024` };
}

/** The whole page: a tab per crowd in tier order, then Across all three. */
export function navigatorPage(read: NavRead, yours: string[], opts: { channel?: "online" | "offline" | "both"; fill?: BackFill; outcomes?: Outcome[]; at?: number } = {}): CrowdPage {
  const tabs = [...read.crowds].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)).map((c) => crowdTab(read, c, yours, opts.outcomes));
  return { tabs, across: read.crowds.length > 1 ? across(read, yours, opts) : undefined, at: opts.at ?? Date.now() };
}

export type { CrowdTier, PageSource };

/** The read as it's saved with the Navigator's work, so a later run's Rep and Promoter have its cities: crowds by id
 * (their cards come back from the measured crowds) and no heat cells (those are on the saved page already). */
export type SavedNav = Omit<NavRead, "crowds"> & { crowds: (Omit<CrowdCities, "crowd"> & { id: string })[] };

export function saveNav(r: NavRead): SavedNav {
  return {
    ...r,
    crowds: r.crowds.map(({ crowd, ...c }) => ({ ...c, id: crowd.id })),
    cities: r.cities.map((c) => ({ ...c, layers: c.layers.map((l) => ({ ...l, cells: [] })) })),
  };
}

/** The saved read back, with each crowd's card and each city's heat from the saved page; crowds no longer measured drop out. */
export function restoreNav(s: SavedNav, cards: CrowdInput["crowd"][], page?: CrowdPage): NavRead | undefined {
  const crowds = s.crowds.flatMap(({ id, ...c }) => {
    const crowd = cards.find((x) => x.id === id);
    return crowd ? [{ ...c, crowd }] : [];
  });
  if (!crowds.length) return undefined;
  const heat = (metroId: string, crowd: string) => {
    const b = page?.across?.sections.find((x) => x.id === `city:${metroId}`)?.blocks.find((x) => x.type === "heat");
    return (b?.type === "heat" && b.layers.find((l) => l.crowd === crowd)?.cells) || [];
  };
  return { ...s, crowds, cities: s.cities.map((c) => ({ ...c, layers: c.layers.map((l) => ({ ...l, cells: heat(c.metroId, l.crowd) })) })) };
}
