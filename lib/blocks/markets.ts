import { results } from "@/lib/qloo/client";
import type { HeatmapCell, QlooEntity } from "@/lib/qloo/types";
import { US_CENTER, metroById, metroIdFor, type Metro } from "@/lib/playbook/metros";
import { blockSignal } from "@/lib/playbook/config";
import { isChainName } from "@/lib/methods/names";
import { withCalls } from "./run";
import { locationParams } from "@/lib/places/location";
import type { BlockContext, Enriched } from "./types";

export type MarketRow = {
  rank: number;
  metroId: string;
  name: string;
  reason: string;
  topVenue: { id: string; name: string };
  venueCount: number;
  callId: string;
  census?: { population?: Enriched<number>; medianIncome?: Enriched<number> };
};

export type Neighbourhood = { name: string; cells: number; score: number; source: "Overture" | "Qloo" };

export type MarketsData = {
  metros: MarketRow[];
  target: { metroId: string; name: string; center: [number, number]; bbox: Metro["bbox"] };
  heatmap: { cells: HeatmapCell[]; callId?: string };
  neighbourhoods: Neighbourhood[] | null; // null = "Neighbourhood names unavailable"
};

/** Optional hooks filled by enrichment sources (§9.19). They never change an order. */
export type MarketsEnrichers = {
  census?: (metro: Metro) => Promise<MarketRow["census"]>;
  neighbourhoods?: (metro: Metro, cells: HeatmapCell[]) => Promise<Neighbourhood[] | null>;
};

/** Markets (§9.3): one diversified places call ranks metros; then the target metro's heatmap (§9.4). */
export function markets(ctx: BlockContext, enrich: MarketsEnrichers = {}) {
  return withCalls(ctx, "markets", async ({ pb, qloo, emit }) => {
    const signal = blockSignal(pb, "markets");
    const home = pb.homeMetro ? metroById(pb.homeMetro) : undefined;
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
      metros,
      target: { metroId: target.id, name: target.name, center: target.center, bbox: target.bbox },
      heatmap: { cells, callId: heat.call.id },
      neighbourhoods,
    };
    const thin = metros.length < 5;
    return { data, status: metros.length === 0 ? "empty" : thin ? "thin" : "ok", thinReason: thin ? `only ${metros.length} metros matched` : undefined };
  });
}
