import { results } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { cleanVenue, isChainName, norm } from "@/lib/methods/names";
import { metroById } from "@/lib/playbook/metros";
import { VENUE_LABELS, VENUE_TAGS, signalIds, type Tier, type VenueType } from "@/lib/playbook/config";
import { withCalls } from "./run";
import type { BlockContext, Enriched, Evidence, TagChip } from "./types";

export type VenuePick = {
  rank: number;
  id: string;
  name: string;
  address?: string;
  neighbourhood?: string;
  lat?: number;
  lon?: number;
  priceLevel?: number;
  popularity?: number;
  reasons: Evidence[];
  tags: { id: string; name: string }[];
  contact: { phone?: Enriched<string>; website?: Enriched<string> };
};

export type PlacesData = { picks: VenuePick[]; pool: string[]; metroId: string; page: number; hasMore: boolean; signal: string[]; channels: string[] };

const PRICE_RANGE: Record<Tier, [number, number]> = { mass: [1, 2], mainstream: [1, 3], premium: [2, 4], luxury: [3, 4] };

/** Template reasons from Qloo fields, never LLM text (§9.5). */
export function reasonsFor(e: QlooEntity, callId: string, names: Map<string, string>, fingerprint: TagChip[], tier: Tier): Evidence[] {
  const out: Evidence[] = [];
  const contributors = (e.query?.explainability?.["signal.interests.entities"] ?? [])
    .filter((c) => c.score >= 0.1 || out.length === 0)
    .filter((c) => names.has(c.entity_id))
    .slice(0, 2);
  if (contributors.length) out.push({ kind: "contribution", label: `Like your ${contributors.map((c) => names.get(c.entity_id)).join(" and ")}`, callId });
  const fp = new Set(fingerprint.map((t) => t.id));
  const shared = (e.tags ?? []).filter((t) => fp.has(t.id ?? t.tag_id ?? "")).slice(0, 2);
  if (shared.length) out.push({ kind: "tag", label: `Shared: ${shared.map((t) => t.name).join(", ")}`, callId });
  const growth = e.query?.measurements?.audience_growth;
  if (growth && growth > 0) out.push({ kind: "growth", label: "Crowd growing", value: growth, callId });
  const price = e.properties?.price_level;
  const [lo, hi] = PRICE_RANGE[tier];
  if (price && price >= lo && price <= hi) out.push({ kind: "price", label: "Price fits", value: price, callId });
  if (out.length < 2) out.push({ kind: "rank", label: `Taste match #${(e.query?.rank ?? 0) || "—"}`, callId });
  return out;
}

export function isPickable(e: QlooEntity, chainSet: Set<string>): boolean {
  if (e.properties?.is_closed) return false;
  if (isChainName(e.name)) return false;
  return !chainSet.has(norm(cleanVenue(e.name)));
}

/** Places (§9.5): ranked venues in the target metro; chains and closed venues removed; first 20 shown. */
export function places(ctx: BlockContext, opts: { fingerprint: TagChip[]; chainNames?: Set<string>; page?: number } = { fingerprint: [] }) {
  return withCalls(ctx, "places", async ({ pb, qloo, names, emit }) => {
    const metro = metroById(pb.targetMetro);
    const page = opts.page ?? 1;
    const res = await qloo.insights({
      "filter.type": "urn:entity:place",
      "signal.interests.entities": signalIds(pb.signal, pb.stage),
      "filter.location.query": metro.query,
      "filter.tags": pb.placeChannels,
      "operator.filter.tags": "union",
      "filter.exclude.entities": pb.exclude.slice(0, 50),
      "feature.explainability": true,
      take: 50,
      page,
      ...pb.tierParams,
    });
    const all = results(res).entities ?? [];
    const pool = all.map((e) => e.entity_id).slice(0, 50);
    const chainSet = opts.chainNames ?? new Set<string>();
    const picks: VenuePick[] = all
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => isPickable(e, chainSet))
      .slice(0, 20)
      .map(({ e }, k) => {
        const withRank = { ...e, query: { ...e.query, rank: k + 1 } };
        return {
          rank: k + 1,
          id: e.entity_id,
          name: e.name,
          address: e.properties?.address,
          neighbourhood: e.properties?.neighborhood,
          lat: e.location?.lat,
          lon: e.location?.lon,
          priceLevel: e.properties?.price_level,
          popularity: e.popularity,
          reasons: reasonsFor(withRank, res.call.id, names, opts.fingerprint, pb.tier),
          tags: (e.tags ?? []).filter((t) => !(t.type ?? "").includes("customer_identity")).slice(0, 6).map((t) => ({ id: t.id ?? t.tag_id ?? t.name, name: t.name })),
          contact: {
            phone: e.properties?.phone ? { value: e.properties.phone, source: "Qloo" as const, callId: res.call.id } : undefined,
            website: e.properties?.website ? { value: e.properties.website, source: "Qloo" as const, callId: res.call.id } : undefined,
          },
        };
      });
    emit({
      tool: "rank_venues",
      why: `Finding venues in ${metro.name} whose crowd matches yours`,
      status: picks.length >= 15 ? "ok" : picks.length ? "thin" : "empty",
      callIds: [res.call.id],
      summary: `${picks.length} venues, ${all.length - picks.length} removed (chains or closed)`,
    });
    const thin = picks.length < 15;
    return {
      data: {
        picks,
        pool,
        metroId: metro.id,
        page,
        hasMore: all.length >= 50,
        signal: signalIds(pb.signal, pb.stage),
        channels: pb.placeChannels.map((u) => VENUE_LABELS[(Object.keys(VENUE_TAGS) as VenueType[]).find((k) => VENUE_TAGS[k] === u)!]).filter(Boolean),
      } satisfies PlacesData,
      status: picks.length === 0 ? "empty" : thin ? "thin" : "ok",
      thinReason: thin ? `only ${picks.length} venues matched in ${metro.name}` : undefined,
    };
  });
}
