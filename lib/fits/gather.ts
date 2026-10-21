import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import type { CrowdsResult } from "@/lib/journey/types";
import type { Geography } from "@/lib/geo/types";
import { crowdGeography, hotReach, loadCellPop } from "@/lib/geo/geography";
import { wikipediaMomentum, wikipediaSeason } from "@/lib/enrich/wikipedia";
import { ticketmasterShows } from "@/lib/enrich/ticketmaster";
import { metroById, type Metro } from "@/lib/playbook/metros";
import { today } from "@/lib/time/now";
import { meanIndex, seasonIndex, type CrowdEvidence } from "./score";
import type { SeasonIn } from "./calendar";

// What the score is computed from (§23.2 step 5a): for each crowd, the numbers the taste graph already holds (fit,
// specificity, stability, core), its hot clusters' residents (Census, minus where the brand already sells), the
// attention to what it loves (Wikipedia pageviews: this year against last, and the yearly pattern since 2015) and
// dated events for its artists (Ticketmaster). The agent chooses which articles stand for a crowd; when it doesn't,
// the crowd's own non-brand loves do. Every lookup is cached; nothing here throws.

const DAY = 86_400_000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** One article's yearly profile, or nothing when it has under three complete years of views. */
export async function seasonOf(title: string): Promise<SeasonIn | undefined> {
  const r = await wikipediaSeason(title).catch(() => undefined);
  if (!r || !("found" in r)) return undefined;
  const s = seasonIndex(r.found.months);
  return s ? { title: r.found.title, url: r.found.url, ...s } : undefined;
}

export type GatherIn = {
  qloo: QlooClient;
  crowds: CrowdsResult;
  geography?: Geography;
  /** Places the brand already sells, as metros: their residents don't count as new reach. */
  exclude: Metro[];
  /** Articles that stand for each crowd, by crowd id, chosen by the agent. */
  titles?: Record<string, string[]>;
  ticketmasterKey?: string;
  status?: (text: string) => void;
};

export type Gathered = { evidence: CrowdEvidence[]; geography?: Geography; seasons: Record<string, SeasonIn | undefined>; calls: number };

export async function gatherEvidence(g: GatherIn): Promise<Gathered> {
  const crowds = g.crowds.crowds;
  const nodes = g.crowds.galaxy?.nodes ?? [];
  let geography = g.geography;
  let calls = 0;
  if (!geography || crowds.some((c) => !geography!.crowds.some((x) => x.id === c.id))) {
    g.status?.("Mapping where each crowd lives");
    geography = await crowdGeography(g.qloo, crowds.map((c) => ({ id: c.id, name: c.name, signal: c.signal.map((s) => s.id) }))).catch(() => undefined);
    calls += geography?.calls ?? 0;
  }
  const cp = await loadCellPop();
  const shows = ticketmasterShows(g.ticketmasterKey);
  const date = today();
  const boxes = g.exclude.map((m) => m.bbox);

  g.status?.("Reading attention and dates for each crowd");
  const seasons: Record<string, SeasonIn | undefined> = {};
  const evidence = await Promise.all(
    crowds.map(async (c, i): Promise<CrowdEvidence> => {
      // The near-miss group isn't a crowd of the Galaxy (§23.5 c): its card names its members.
      const members = c.members?.length ? nodes.filter((n) => c.members!.includes(n.id)) : nodes.filter((n) => n.crowd === i);
      const core = members.filter((n) => n.core);
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

      const geo = geography?.crowds.find((x) => x.id === c.id);
      const reach = geo && geography && !geography.empty ? { ...hotReach(geography, c.id, boxes, cp), metros: geo.reach.filter((m) => !g.exclude.some((x) => x.id === m.metroId || x.name === m.name)).map((m) => m.name) } : undefined;

      // The articles that stand for it: always its own top loves that aren't brands (brands' pages track news about the
      // company, not the crowd's attention), so the measure is the same from run to run; the agent's picks are added.
      const own = c.loves.filter((l) => l.kind !== "brand").map((l) => l.name).slice(0, 4);
      const titles = [...own, ...(g.titles?.[c.id] ?? []).filter((t) => !own.some((o) => o.toLowerCase() === t.toLowerCase())).slice(0, 2)];
      const [moms, seas] = await Promise.all([
        Promise.all(titles.map((t) => wikipediaMomentum(t).catch(() => undefined))),
        Promise.all(titles.map((t) => seasonOf(t))),
      ]);
      const found = moms.flatMap((m) => (m && "found" in m && m.found.yoy !== undefined ? [{ title: m.found.title, yoy: m.found.yoy }] : []));
      const momentum = found.length ? { yoy: median(found.map((f) => f.yoy!)), titles: found } : undefined;
      const profiles = seas.filter((s): s is SeasonIn => !!s);
      const index = meanIndex(profiles.map((s) => s.index));
      const season = index ? { index, years: Math.min(...profiles.map((s) => s.years)), titles: profiles.map((s) => s.title) } : undefined;
      seasons[c.id] = season && { title: season.titles.join(", "), index: season.index, years: season.years };

      // Events for up to 4 of its artists near where it is strongest.
      const artists = c.loves.filter((l) => l.kind === "artist").slice(0, 4).map((l) => l.name);
      const where = geo?.reach.find((m) => !g.exclude.some((x) => x.id === m.metroId))?.metroId ?? c.cities[0]?.metro;
      const metro = where ? (() => { try { return metroById(where); } catch { return undefined; } })() : undefined;
      const events =
        shows && metro && artists.length
          ? (
              await Promise.all(
                artists.map(async (artist) =>
                  ((await shows(artist, metro).catch(() => [])) ?? []).map((e) => ({ name: e.name, date: e.date, days: Math.round((Date.parse(`${e.date}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / DAY), artist, metro: metro.name, url: e.url })),
                ),
              )
            ).flat()
          : undefined;

      return {
        id: c.id,
        name: c.name,
        fit: mean(members.map((n) => n.affinity)),
        members: c.size,
        core: c.core,
        stability: c.stability,
        specificity: mean(core.map((n) => n.specificity)) ?? mean(members.map((n) => n.specificity)),
        reach,
        momentum,
        season,
        events,
        ...(c.nearMiss ? { nearMiss: true } : {}),
      };
    }),
  );
  return { evidence, geography, seasons, calls };
}
