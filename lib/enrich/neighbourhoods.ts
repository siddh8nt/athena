import type { HeatmapCell } from "@/lib/qloo/types";
import type { Metro } from "@/lib/playbook/metros";
import type { Neighbourhood } from "@/lib/blocks/markets";

// Neighbourhood names for the taste heatmap (PRD §9.4, §9.19). Qloo's locality boundary still returns HTTP 500
// (8 and 10 Oct), so names come from Overture: every US neighbourhood point, extracted once from BigQuery's
// public Overture tables into data/overture-neighbourhoods.json (27 MB scanned). Lookups are local and instant,
// so any metro works. Taste stays Qloo's; Overture only names the places.

type Row = [name: string, lat: number, lon: number, wikidata: 0 | 1];
let rows: Promise<Row[]> | undefined;
const load = () => (rows ??= import("@/data/overture-neighbourhoods.json").then((m) => (m.default ?? m).rows as Row[]));

/** A cell joins a neighbourhood only if that neighbourhood's point is this close (km). */
const MAX_KM = 2.5;
/** Unlinked Overture points that are housing developments, not neighbourhoods (data cleaning, not a judgement call). */
const COMPLEX = /\b(apartments?|apts|condominiums?|condos?|townhomes|townhouses|mobile home|trailer|senior living|residences|lofts)\b/i;
const MIN_CELLS = 3;
const PRIOR_CELLS = 5;

const km = (a: [number, number], b: [number, number]) => {
  const dLat = (b[0] - a[0]) * 111;
  const dLon = (b[1] - a[1]) * 111 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
};

/**
 * Names the strongest neighbourhoods: each heatmap cell goes to the nearest neighbourhood point within 2.5 km;
 * a neighbourhood's score is the mean `affinity_rank` of its cells (shrunk toward the metro's mean), with ≥ 3 cells. Neighbourhoods with a Wikidata
 * link come first (they're the names people know); unlinked ones fill gaps, never housing complexes. Null when none.
 */
export function nameNeighbourhoods(all: Row[], cells: HeatmapCell[]): Neighbourhood[] | null {
  if (!cells.length) return null;
  // The search area is the cells' own extent, widened by the join distance (works for any metro, even one without a known box).
  const lats = cells.map((c) => c.location.latitude);
  const lons = cells.map((c) => c.location.longitude);
  const pad = MAX_KM / 111;
  const padLon = pad / Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const [s, w, n, e] = [Math.min(...lats) - pad, Math.min(...lons) - padLon, Math.max(...lats) + pad, Math.max(...lons) + padLon];
  const inBox = all.filter((r) => r[1] >= s && r[1] <= n && r[2] >= w && r[2] <= e);
  // Wikidata-linked names first; an unlinked one only for cells no linked name is near.
  const notable = inBox.filter((r) => r[3] === 1);
  const other = inBox.filter((r) => r[3] === 0 && !COMPLEX.test(r[0]));
  if (!notable.length && !other.length) return null;
  const nearest = (at: [number, number], pool: Row[]) => {
    let best: Row | undefined;
    let bestKm = MAX_KM;
    for (const r of pool) {
      const d = km(at, [r[1], r[2]]);
      if (d < bestKm) (best = r), (bestKm = d);
    }
    return best;
  };

  const byName = new Map<string, { ranks: number[] }>();
  for (const c of cells) {
    const at: [number, number] = [c.location.latitude, c.location.longitude];
    const best = nearest(at, notable) ?? nearest(at, other);
    if (!best) continue;
    const g = byName.get(best[0]) ?? { ranks: [] };
    g.ranks.push(c.query.affinity_rank);
    byName.set(best[0], g);
  }
  const cityMean = cells.reduce((a, c) => a + c.query.affinity_rank, 0) / cells.length;
  const out = [...byName.entries()]
    .filter(([, g]) => g.ranks.length >= MIN_CELLS)
    // Mean affinity rank, pulled toward the metro's mean by PRIOR_CELLS cells, so 3 lucky cells don't outrank 18 strong ones.
    .map(([name, g]) => ({ name, cells: g.ranks.length, score: (g.ranks.reduce((a, b) => a + b, 0) + PRIOR_CELLS * cityMean) / (g.ranks.length + PRIOR_CELLS), source: "Overture" as const }))
    .sort((a, b) => b.score - a.score || b.cells - a.cells);
  return out.length ? out : null;
}

/** The Markets enricher (§9.19). Never throws. */
export async function overtureNeighbourhoods(_metro: Metro, cells: HeatmapCell[]): Promise<Neighbourhood[] | null> {
  try {
    return nameNeighbourhoods(await load(), cells);
  } catch (err) {
    console.error("neighbourhood names failed", err);
    return null;
  }
}
