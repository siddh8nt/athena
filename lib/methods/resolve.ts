import type { QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { accept, cleanVenue, nameSim, norm, type Row } from "./names";

export type Resolved =
  | { status: "matched"; row: Row; entity: QlooEntity; sim: number; dist?: number; callIds: string[] }
  | { status: "ambiguous"; row: Row; options: QlooEntity[]; callIds: string[] }
  | { status: "unresolved"; row: Row; callIds: string[] };

/** Resolve one venue row (§9.1): address search first, then a 0.5-mile location search. */
export async function resolveVenue(qloo: QlooClient, row: Row): Promise<Resolved> {
  const name = cleanVenue(row.name);
  const attempts: Record<string, string | number>[] = [];
  if (row.address) attempts.push({ query: name, types: "urn:entity:place", "filter.address": row.address, take: 5 });
  if (row.lat !== undefined && row.lon !== undefined)
    attempts.push({ query: name, types: "urn:entity:place", "filter.location": `${row.lat.toFixed(6)},${row.lon.toFixed(6)}`, "filter.radius": 0.5, take: 5 });

  const callIds: string[] = [];
  const seen = new Map<string, { e: QlooEntity; sim: number; dist?: number }>();
  for (const params of attempts) {
    const res = await qloo.search(params);
    callIds.push(res.call.id);
    for (const e of res.entities) {
      const verdict = accept(row, { name: e.name, address: e.properties?.address, lat: e.location?.lat, lon: e.location?.lon });
      if (verdict.ok) seen.set(e.entity_id, { e, sim: verdict.sim, dist: verdict.dist });
    }
    if (seen.size) break;
  }
  if (!seen.size) return { status: "unresolved", row, callIds };
  const best = [...seen.values()].sort((a, b) => b.sim - a.sim || (a.dist ?? 1e9) - (b.dist ?? 1e9));
  if (best.length > 1 && best[0].sim - best[1].sim < 0.05 && (best[1].dist ?? 1e9) < 150)
    return { status: "ambiguous", row, options: best.slice(0, 3).map((b) => b.e), callIds };
  return { status: "matched", row, entity: best[0].e, sim: best[0].sim, dist: best[0].dist, callIds };
}

/** Resolve a brand name (§9.1): accept the top result when its normalised name matches. */
export async function resolveBrand(qloo: QlooClient, brandName: string): Promise<{ entity?: QlooEntity; options: QlooEntity[]; callId: string }> {
  const res = await qloo.search({ query: brandName, types: "urn:entity:brand", take: 5 });
  const top = res.entities[0];
  const exact = top && (norm(top.name.replace(/\(FIXTURE\)/, "")) === norm(brandName) || nameSim(top.name, brandName) >= 0.99);
  return { entity: exact ? top : undefined, options: res.entities.slice(0, 3), callId: res.call.id };
}

export async function resolveAll(qloo: QlooClient, rows: Row[], concurrency = 6): Promise<Resolved[]> {
  const out: Resolved[] = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (next < rows.length) {
        const i = next++;
        out[i] = await resolveVenue(qloo, rows[i]);
      }
    }),
  );
  return out;
}
