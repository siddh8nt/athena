import { results, type QlooClient } from "@/lib/qloo/client";
import type { HeatmapCell } from "@/lib/qloo/types";
import { METROS } from "@/lib/playbook/metros";
import { geohashBounds } from "./geohash";
import { clusters, hotCells, percentilesOf } from "./hotspots";
import type { GeoCell, GeoCrowd, Geography, Hotspot, MetroReach } from "./types";

// Crowd geography (§9.26). One US-wide heatmap per crowd (its core as the signal; verified 13 Oct: 7,500–9,300
// geohash-4 cells in 10–13 s). Each cell gets the crowd's percentile there, by the order of Qloo's affinity within that
// response. People come from data/cell-pop.json (Census county populations shared over the cells; scripts/cell-pop.mjs).
// Hotspots are Gi* clusters under Benjamini–Hochberg control; crowd weather colours each cell by the crowd whose
// percentile there is highest; reach weights a metro's residents by the percentile where they live.

/** Lower 48, Alaska and Hawaii as boxes; cells outside the US drop out because they have no residents in the table. */
export const US_WKT =
  "MULTIPOLYGON(((-125 24.3,-66.9 24.3,-66.9 49.4,-125 49.4,-125 24.3)),((-170 51,-129.9 51,-129.9 71.5,-170 71.5,-170 51)),((-160.5 18.8,-154.7 18.8,-154.7 22.3,-160.5 22.3,-160.5 18.8)))";

/** The false discovery rate hotspots are held to. */
export const FDR = 0.05;
const HOTSPOTS = 5;
const REACH = 8;

export type CellPop = { counties: string[]; cells: Record<string, [number, number]> };
let pop: Promise<CellPop> | undefined;
export const loadCellPop = () => (pop ??= import("@/data/cell-pop.json").then((m) => (m.default ?? m) as unknown as CellPop));

export type CrowdIn = { id: string; name: string; signal: string[] };

/** One heatmap call per crowd, in parallel; then the statistics (0 calls). Never throws. */
export async function crowdGeography(qloo: QlooClient, crowds: CrowdIn[]): Promise<Geography> {
  const callIds: string[] = [];
  const heat = await Promise.all(
    crowds.map(async (c) => {
      if (!c.signal.length) return null;
      // Slow by nature (about 10 s), so never hedged: a second copy would only double the cost.
      const res = await qloo.insights({ "filter.type": "urn:heatmap", "filter.location": US_WKT, "signal.interests.entities": c.signal }, { priority: "now", hedge: false }).catch(() => undefined);
      if (!res) return null;
      callIds.push(res.call.id);
      return res.status === 200 ? (results(res).heatmap ?? []) : null;
    }),
  );
  const g = geographyFrom(crowds, heat, await loadCellPop());
  return { ...g, calls: callIds.length, callIds };
}

const inBox = (b: [number, number, number, number], lat: number, lon: number) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const centres = new Map<string, [number, number]>();
const centre = (gh: string): [number, number] => {
  let c = centres.get(gh);
  if (!c) {
    const b = geohashBounds(gh)!;
    centres.set(gh, (c = [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2]));
  }
  return c;
};

/** The statistics behind the map, from each crowd's heatmap (null when its call failed). Pure. */
export function geographyFrom(crowds: CrowdIn[], heat: (HeatmapCell[] | null)[], cp: CellPop): Omit<Geography, "calls" | "callIds"> {
  const people = (gh: string) => cp.cells[gh]?.[0] ?? 0;
  // Each crowd's percentile per US cell with residents, by the order of affinity within its own response.
  const pct = heat.map((cells) => {
    const aff = new Map<string, number>();
    for (const c of cells ?? []) if (people(c.location.geohash) > 0 && typeof c.query?.affinity === "number") aff.set(c.location.geohash, c.query.affinity);
    return percentilesOf(aff);
  });
  const hot = pct.map((p) => hotCells(p, FDR));

  const placeName = (gh: string) => {
    const [lat, lon] = centre(gh);
    const metro = METROS.find((m) => inBox(m.bbox, lat, lon));
    if (metro) return metro.name;
    const [st, county] = (cp.counties[cp.cells[gh]?.[1] ?? -1] ?? "").split("|");
    return county ? `${county}, ${st}` : st || "the US";
  };

  // Crowd weather: the crowd whose percentile is highest in each cell.
  const all = new Set(pct.flatMap((p) => [...p.keys()]));
  const cells: GeoCell[] = [];
  const leads = crowds.map(() => 0);
  const leadCells = crowds.map(() => new Set<string>());
  for (const gh of all) {
    let best = -1;
    let top = -1;
    let mask = 0;
    pct.forEach((p, k) => {
      const v = p.get(gh);
      if (v !== undefined && v > top) (top = v), (best = k);
      if (hot[k].has(gh)) mask |= 1 << k;
    });
    if (best < 0) continue;
    leads[best] += people(gh);
    leadCells[best].add(gh);
    cells.push([gh, best, Math.round(top * 100), mask]);
  }

  const out: GeoCrowd[] = crowds.map((c, k) => {
    const p = pct[k];
    const spots = (cells: Set<string>): Hotspot[] =>
      clusters(cells)
        .map((group) => {
          const byPeople = [...group].sort((a, b) => people(b) - people(a));
          // Up to two place names, skipping one that repeats the first ("Los Angeles County, CA" after "Los Angeles").
          const names = byPeople.slice(0, 6).map(placeName).reduce<string[]>((acc, n) => (acc.length < 2 && !acc.some((x) => n.includes(x)) ? [...acc, n] : acc), []);
          const lead = centre(byPeople[0]);
          return {
            label: names.join(" and "),
            cells: group.length,
            people: Math.round(group.reduce((s, gh) => s + people(gh), 0)),
            reach: Math.round(group.reduce((s, gh) => s + people(gh) * (p.get(gh) ?? 0), 0)),
            center: lead,
          };
        })
        .sort((a, b) => b.reach - a.reach)
        .slice(0, HOTSPOTS);
    const hotspots = spots(hot[k]);
    // Where it stands out: its hot cells where no other crowd's percentile is higher (only with 2+ crowds).
    const standsOut = crowds.length > 1 ? spots(new Set([...hot[k]].filter((gh) => leadCells[k].has(gh)))) : [];
    const reach: MetroReach[] = METROS.map((m) => {
      let ppl = 0;
      let r = 0;
      for (const [gh, v] of p) {
        const [lat, lon] = centre(gh);
        if (!inBox(m.bbox, lat, lon)) continue;
        ppl += people(gh);
        r += people(gh) * v;
      }
      return { metroId: m.id, name: m.name, reach: Math.round(r), people: Math.round(ppl), pct: ppl ? Math.round((r / ppl) * 100) : 0 };
    })
      .filter((x) => x.people > 0)
      .sort((a, b) => b.reach - a.reach)
      .slice(0, REACH);
    const hotPeople = [...hot[k]].reduce((s, gh) => s + people(gh), 0);
    return { id: c.id, name: c.name, cells: p.size, hot: hot[k].size, hotspots, standsOut, reach, leads: Math.round(leads[k]), hotPeople: Math.round(hotPeople) };
  });
  return { crowds: out, cells, q: FDR, empty: !cells.length || undefined };
}

/**
 * Residents of a crowd's hot cells, and those outside the given boxes (minLon, minLat, maxLon, maxLat): the reach
 * left once places the brand already sells are taken out (§23.2 step 5b). From the cells already measured; 0 calls.
 */
export function hotReach(g: Geography, crowdId: string, exclude: [number, number, number, number][], cp: CellPop): { people: number; fresh: number } {
  const k = g.crowds.findIndex((c) => c.id === crowdId);
  if (k < 0) return { people: 0, fresh: 0 };
  let people = 0;
  let fresh = 0;
  for (const [gh, , , mask] of g.cells) {
    if (!(mask & (1 << k))) continue;
    const n = cp.cells[gh]?.[0] ?? 0;
    people += n;
    const [lat, lon] = centre(gh);
    if (!exclude.some((b) => inBox(b, lat, lon))) fresh += n;
  }
  return { people: Math.round(people), fresh: Math.round(fresh) };
}
