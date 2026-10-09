import type { HeatmapCell } from "@/lib/qloo/types";
import type { Metro } from "@/lib/playbook/metros";
import type { Neighbourhood } from "@/lib/blocks/markets";
import { loadPlaces, type PlaceRow } from "@/lib/places/data";

// Names for the taste heatmap (PRD §9.4, §9.19). Qloo's locality boundary still returns HTTP 500 (8 and 10 Oct), so
// names come from Overture (data/places.json, built once from BigQuery's public Overture tables). The level follows
// the area: a city names its neighbourhoods; a state, county or region names its towns. Taste stays Qloo's.

/** Areas wider than this (km, across the taste cells) name towns instead of neighbourhoods. */
const REGION_KM = 80;
const LEVELS = {
  /** Neighbourhoods: a cell joins a point within 2.5 km. */
  local: { kinds: new Set(["n", "u"]), maxKm: 2.5, minCells: 3 },
  /** Towns: a cell (about 5 km across at this zoom) joins a town within 25 km. */
  region: { kinds: new Set(["l"]), maxKm: 25, minCells: 2 },
} as const;
const PRIOR_CELLS = 5;
/**
 * For a state or region, name real cities, not their suburbs (10 Oct: Ohio split Cleveland's cells across Lakewood
 * and Brooklyn). The first population tier with at least 5 towns in the area is used.
 */
const TOWN_TIERS = [50_000, 10_000, 2_000];
/** Unlinked Overture points that are housing developments, not neighbourhoods (data cleaning, not a judgement call). */
const COMPLEX = /\b(apartments?|apts|condominiums?|condos?|townhomes|townhouses|mobile home|trailer|senior living|residences|lofts)\b/i;

const km = (a: [number, number], b: [number, number]) => {
  const dLat = (b[0] - a[0]) * 111;
  const dLon = (b[1] - a[1]) * 111 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
};

/**
 * Names the strongest areas: each heatmap cell goes to the nearest named place within reach; an area's score is the
 * mean `affinity_rank` of its cells, shrunk toward the overall mean by 5 cells so a few lucky cells don't win.
 * Wikidata-linked names come first (the names people know); unlinked ones only fill gaps. Null when none.
 */
export function nameNeighbourhoods(all: PlaceRow[], cells: HeatmapCell[], scale?: Metro["scale"]): Neighbourhood[] | null {
  if (!cells.length) return null;
  const lats = cells.map((c) => c.location.latitude);
  const lons = cells.map((c) => c.location.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const spanKm = km([Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]);
  const level = LEVELS[scale ?? (spanKm > REGION_KM ? "region" : "local")];
  // The search area is the cells' own extent, widened by the join distance.
  const pad = level.maxKm / 111;
  const padLon = pad / Math.cos((midLat * Math.PI) / 180);
  const [s, w, n, e] = [Math.min(...lats) - pad, Math.min(...lons) - padLon, Math.max(...lats) + pad, Math.max(...lons) + padLon];
  const inBox = all.filter((r) => level.kinds.has(r[1]) && r[7] >= s && r[7] <= n && r[8] >= w && r[8] <= e);
  const towns = (min: number) => inBox.filter((r) => r[1] === "l" && r[3] >= min);
  const tier = TOWN_TIERS.find((min) => towns(min).length >= 5) ?? TOWN_TIERS[TOWN_TIERS.length - 1];
  const known = inBox.filter((r) => (r[1] === "l" ? r[3] >= tier : r[4] === 1));
  const other = inBox.filter((r) => !known.includes(r) && r[1] !== "l" && !COMPLEX.test(r[0]));
  if (!known.length && !other.length) return null;
  const nearest = (at: [number, number], pool: PlaceRow[]) => {
    let best: PlaceRow | undefined;
    let bestKm: number = level.maxKm;
    for (const r of pool) {
      const d = km(at, [r[7], r[8]]);
      if (d < bestKm) (best = r), (bestKm = d);
    }
    return best;
  };

  const byName = new Map<string, number[]>();
  for (const c of cells) {
    const at: [number, number] = [c.location.latitude, c.location.longitude];
    const best = nearest(at, known) ?? nearest(at, other);
    if (!best) continue;
    const ranks = byName.get(best[0]) ?? [];
    ranks.push(c.query.affinity_rank);
    byName.set(best[0], ranks);
  }
  const mean = cells.reduce((a, c) => a + c.query.affinity_rank, 0) / cells.length;
  const out = [...byName.entries()]
    .filter(([, ranks]) => ranks.length >= level.minCells)
    .map(([name, ranks]) => ({ name, cells: ranks.length, score: (ranks.reduce((a, b) => a + b, 0) + PRIOR_CELLS * mean) / (ranks.length + PRIOR_CELLS), source: "Overture" as const }))
    .sort((a, b) => b.score - a.score || b.cells - a.cells);
  return out.length ? out : null;
}

/** The Markets enricher (§9.19). Never throws. */
export async function overtureNeighbourhoods(metro: Metro, cells: HeatmapCell[]): Promise<Neighbourhood[] | null> {
  try {
    return nameNeighbourhoods(await loadPlaces(), cells, metro.scale);
  } catch (err) {
    console.error("neighbourhood names failed", err);
    return null;
  }
}
