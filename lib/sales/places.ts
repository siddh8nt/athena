import "server-only";
import { loadPlaces } from "@/lib/places/data";
import { METROS, US_CENTER, metroById, type Metro } from "@/lib/playbook/metros";
import type { SalesPlace } from "./orders";

// Each ZIP of an orders export to a metro (PRD §23.6 i), from the Census ZCTAs already in data/places.json: the
// nearest of the named metros and the crowds' own cities whose box holds the ZIP, else the ZIP's own town. Server only,
// since the table is about 13 MB.

let zips: Promise<Map<string, { at: [number, number]; town: string; state: string }>> | undefined;
const loadZips = () =>
  (zips ??= loadPlaces().then((rows) => new Map(rows.filter((r) => r[1] === "z").map((r) => [r[0], { at: [r[7], r[8]] as [number, number], town: r[5], state: r[2] }]))));

const km = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * 111, (b[1] - a[1]) * 111 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180)));
const holds = (m: Metro, [lat, lon]: [number, number]) => lon >= m.bbox[0] && lon <= m.bbox[2] && lat >= m.bbox[1] && lat <= m.bbox[3];

/** Each ZIP's place. `metros` adds the crowds' own city ids to the named metros, so a crowd's city matches by id. */
export async function placeZips(list: string[], metros: string[] = []): Promise<Record<string, SalesPlace>> {
  const table = await loadZips();
  const extra = metros.flatMap((id) => {
    try {
      if (METROS.some((m) => m.id === id)) return [];
      // A metro known only by name has no centre yet, and its stand-in box would cover the country: its ZIPs keep their towns.
      const m = metroById(id);
      return m.center === US_CENTER ? [] : [m];
    } catch {
      return [];
    }
  });
  const all = [...METROS, ...extra];
  const out: Record<string, SalesPlace> = {};
  for (const z of new Set(list)) {
    const row = table.get(z);
    if (!row) continue;
    const near = all
      .filter((m) => holds(m, row.at))
      .map((m) => ({ m, d: km(m.center, row.at) }))
      .sort((a, b) => a.d - b.d)[0]?.m;
    out[z] = near ? { metro: near.id, name: near.name } : { name: row.town ? `${row.town}, ${row.state}` : `ZIP ${z}` };
  }
  return out;
}
