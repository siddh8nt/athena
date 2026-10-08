import { results } from "@/lib/qloo/client";
import type { HeatmapCell, QlooEntity } from "@/lib/qloo/types";
import { metroById, metroFor, type Metro } from "@/lib/playbook/metros";
import { blockSignal } from "@/lib/playbook/config";
import { isChainName } from "@/lib/methods/names";
import { withCalls } from "./run";
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
      const metro = metroFor(e.properties?.geocode?.metro);
      if (!metro || metro.id === home?.id) continue; // only the 25 metros; never the home metro
      byMetro.set(metro.id, [...(byMetro.get(metro.id) ?? []), e]);
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

    const target = metroById(pb.targetMetro);
    const heat = await qloo.insights({ "filter.type": "urn:heatmap", "filter.location.query": target.query, "signal.interests.entities": signal });
    const cells = results(heat).heatmap ?? [];
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
