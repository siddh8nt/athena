import { results, type QlooClient } from "@/lib/qloo/client";
import type { HeatmapCell, QlooEntity } from "@/lib/qloo/types";
import { METROS, US_CENTER, metroById, metroIdFor, type Metro } from "@/lib/playbook/metros";
import { blockSignal } from "@/lib/playbook/config";
import { isChainName } from "@/lib/methods/names";
import { withCalls } from "./run";
import { locationParams } from "@/lib/places/location";
import type { BlockContext, Enriched } from "./types";
import type { AreaFigures } from "@/lib/enrich/census";

export type MarketRow = {
  rank: number;
  metroId: string;
  name: string;
  reason: string;
  /** Brands method: the crowd's brands that score furthest above their own average here, and the metro's mean affinity. */
  leans?: string[];
  score?: number;
  /** Venues method: the metro's strongest venue and how many Qloo returned there. */
  topVenue?: { id: string; name: string };
  venueCount?: number;
  callId: string;
  census?: { population?: Enriched<number>; medianIncome?: Enriched<number> };
};

/** `at`: the mean of its cells (lat, lon). `around`: hot cells no name reached, named for the nearest place ("around Mission"). */
export type Neighbourhood = { name: string; cells: number; score: number; source: "Overture" | "Qloo"; at?: [number, number]; around?: boolean };

export type MarketsData = {
  /** "brands": every named metro scored on the crowd's brands (v4.0); "venues": one diversified places call (v3.0). */
  method?: "brands" | "venues";
  metros: MarketRow[];
  target: { metroId: string; name: string; center: [number, number]; bbox: Metro["bbox"] };
  heatmap: { cells: HeatmapCell[]; callId?: string };
  neighbourhoods: Neighbourhood[] | null; // null = "Neighbourhood names unavailable"
};

/** Optional hooks filled by enrichment sources (§9.19). They never change an order. */
export type MarketsEnrichers = {
  census?: (metro: Metro) => Promise<MarketRow["census"]>;
  neighbourhoods?: (metro: Metro, cells: HeatmapCell[]) => Promise<Neighbourhood[] | null>;
  /** Census tract and ZIP figures for points in a city (the Navigator's Level 3). */
  areas?: (points: [number, number][]) => Promise<(AreaFigures | undefined)[]>;
};

/** Below this many brands a metro's mean is too thin to rank on, and Markets uses the venues method instead. */
const MIN_BRANDS = 5;

/**
 * Markets (§9.3, v4.0). With a crowd, every named metro but home is scored on the crowd's brands: one location-signal
 * call per metro gives each brand's affinity there, and the metro's score is the mean over the brands Qloo scores.
 * Tuned on Brightland and Fishwife (13 Oct): it tracked independent stockists per million residents (Spearman 0.73 and
 * 0.62), where a mass-market crowd's brands ran the other way (-0.28 and -0.32), so it reads taste, not size. Without
 * enough brands, one diversified places call ranks metros by their best venue (v3.0). Then the target's heatmap (§9.4).
 */
export function markets(ctx: BlockContext, enrich: MarketsEnrichers = {}) {
  return withCalls(ctx, "markets", async ({ pb, qloo, emit }) => {
    const signal = blockSignal(pb, "markets");
    const home = pb.homeMetro ? metroById(pb.homeMetro) : undefined;
    const s = pb.signal;
    const brands = [...new Set([s.brand, ...(s.crowdBrands?.length ? s.crowdBrands : s.comparables)].filter((x): x is string => !!x))].slice(0, 50);
    const method = brands.length >= MIN_BRANDS ? "brands" : "venues";
    const metros = method === "brands" ? await byBrands(qloo, brands, home, emit) : await byVenues(ctx, signal, home);

    if (enrich.census) {
      await Promise.all(metros.map(async (row) => (row.census = await enrich.census!(metroById(row.metroId)).catch(() => undefined))));
    }

    let target = metroById(pb.targetMetro);
    const heat = await qloo.insights({ "filter.type": "urn:heatmap", ...(await locationParams(target)), "signal.interests.entities": signal });
    const cells = results(heat).heatmap ?? [];
    // A typed city with no known centre: centre the map on where its taste is strongest.
    if (target.center === US_CENTER && cells.length) {
      const top = [...cells].sort((a, b) => b.query.affinity_rank - a.query.affinity_rank).slice(0, Math.max(5, Math.ceil(cells.length / 5)));
      const c: [number, number] = [top.reduce((s, x) => s + x.location.latitude, 0) / top.length, top.reduce((s, x) => s + x.location.longitude, 0) / top.length];
      target = metroById(metroIdFor(target.name, c));
    }
    emit({ tool: "map_taste", why: `Mapping where the taste concentrates in ${target.name}`, status: cells.length ? "ok" : "empty", callIds: [heat.call.id], summary: `${cells.length} cells` });
    const neighbourhoods = enrich.neighbourhoods ? await enrich.neighbourhoods(target, cells).catch(() => null) : null;

    const data: MarketsData = {
      method,
      metros,
      target: { metroId: target.id, name: target.name, center: target.center, bbox: target.bbox },
      heatmap: { cells, callId: heat.call.id },
      neighbourhoods,
    };
    const thin = metros.length < 5;
    return { data, status: metros.length === 0 ? "empty" : thin ? "thin" : "ok", thinReason: thin ? `only ${metros.length} metros matched` : undefined };
  });
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join(""));

/** The brands method: each named metro but home, scored by the mean affinity of the crowd's brands there. */
async function byBrands(qloo: QlooClient, brands: string[], home: Metro | undefined, emit: BlockContext["emit"]): Promise<MarketRow[]> {
  const metros = METROS.filter((m) => m.id !== home?.id && m.name !== home?.name);
  emit({ tool: "rank_metros", why: `Scoring ${metros.length} cities on ${brands.length} of your crowd's brands`, status: "running", callIds: [], summary: "one Qloo call per city" });
  const names = new Map<string, string>();
  const scored = await Promise.all(
    metros.map(async (m) => {
      const res = await qloo.insights({ "filter.type": "urn:entity:brand", "signal.location.query": m.query, "filter.results.entities": brands, take: brands.length });
      const aff = new Map<string, number>();
      for (const e of results(res).entities ?? []) {
        if (typeof e.query?.affinity !== "number") continue;
        aff.set(e.entity_id, e.query.affinity);
        names.set(e.entity_id, e.name);
      }
      return { m, aff, score: aff.size ? mean([...aff.values()]) : -1, callId: res.call.id };
    }),
  );
  // A metro leans to the brands it scores furthest above their own average, in each brand's standard deviations across
  // the metros that score it, so a brand that swings everywhere doesn't top every metro's list.
  const across = new Map<string, number[]>();
  for (const x of scored) for (const [id, a] of x.aff) across.set(id, [...(across.get(id) ?? []), a]);
  const spread = new Map(
    [...across].filter(([, xs]) => xs.length >= 3).map(([id, xs]) => {
      const m = mean(xs);
      return [id, { m, sd: Math.sqrt(mean(xs.map((v) => (v - m) ** 2))) }] as const;
    }),
  );
  const rows = [...scored]
    .sort((a, b) => b.score - a.score)
    .map((x, i): MarketRow => {
      const leans = [...x.aff]
        .flatMap(([id, a]) => {
          const s = spread.get(id);
          return s && s.sd > 0 ? [{ name: names.get(id) ?? id, lift: (a - s.m) / s.sd }] : [];
        })
        .filter((l) => l.lift > 0.5)
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 3)
        .map((l) => l.name);
      return {
        rank: i + 1,
        metroId: x.m.id,
        name: x.m.name,
        reason: leans.length ? `Loves ${and(leans)} more than most places` : x.aff.size ? `Scored on ${x.aff.size} of your crowd's brands` : "Little of your crowd's taste shows here yet",
        leans,
        score: x.aff.size ? Math.round(x.score * 1000) / 1000 : undefined,
        callId: x.callId,
      };
    });
  emit({ tool: "rank_metros", why: "Ranking cities by how much of your crowd's taste they hold", status: rows.length ? "ok" : "empty", callIds: scored.map((x) => x.callId), summary: rows.slice(0, 5).map((m) => m.name).join(" · ") });
  return rows;
}

/** The venues method (v3.0): one diversified places call; metros in order of their best venue. */
async function byVenues({ pb, qloo, emit }: BlockContext, signal: string[], home: Metro | undefined): Promise<MarketRow[]> {
  const res = await qloo.insights({
    "filter.type": "urn:entity:place",
    "signal.interests.entities": signal,
    "filter.tags": pb.placeChannels,
    "operator.filter.tags": "union",
    "diversify.by": "properties.geocode.metro",
    // 8 Oct: take=2 per metro spreads 50 results over ~27 US metros (take=4 gave ~12); the country
    // filter drops Toronto, Tokyo and the like; the exclude string must be "New York", not "New York City".
    "diversify.take": 2,
    "filter.geocode.country_code": "US",
    "filter.exclude.location.query": home?.excludeQuery,
    take: 50,
    ...pb.tierParams,
  });

  // Qloo returns venues grouped by metro, ranked by each metro's best venue; first appearance = rank.
  const byMetro = new Map<string, QlooEntity[]>();
  for (const e of results(res).entities ?? []) {
    const raw = e.properties?.geocode?.metro;
    if (!raw) continue;
    // Any US metro (§9.3, v3.0); the first venue Qloo returns there gives an unnamed metro its centre.
    const id = metroIdFor(raw, e.location ? [e.location.lat, e.location.lon] : undefined);
    const known = [...byMetro.keys()].find((k) => metroById(k).name === metroById(id).name);
    if (id === home?.id || (home && metroById(id).name === home.name)) continue; // never the home metro
    byMetro.set(known ?? id, [...(byMetro.get(known ?? id) ?? []), e]);
  }
  const metros: MarketRow[] = [...byMetro].map(([metroId, all], i) => {
    const venues = all.filter((v) => !isChainName(v.name));
    const top = venues[0] ?? all[0];
    return {
      rank: i + 1,
      metroId,
      name: metroById(metroId).name,
      reason: `Strongest match: ${top.name}`,
      topVenue: { id: top.entity_id, name: top.name },
      venueCount: all.length,
      callId: res.call.id,
    };
  });
  emit({ tool: "rank_metros", why: "Ranking cities by how much of your crowd's taste they hold", status: metros.length ? "ok" : "empty", callIds: [res.call.id], summary: metros.slice(0, 5).map((m) => m.name).join(" · ") });
  return metros;
}
