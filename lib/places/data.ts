// US places and outlines (PRD §9.3, §9.4), loaded once per server instance. Built by jobs/overture-places.py from
// Overture divisions (ODbL; © Overture Maps Foundation, OpenStreetMap contributors) and Census ZCTAs (public domain).
// Server only: these files are about 13 MB and must never reach a client bundle.

export type Kind = "s" | "c" | "l" | "m" | "n" | "u" | "z";
export type Box = [number, number, number, number]; // minLon, minLat, maxLon, maxLat
/** [name, kind, state, population, wikidata, city, county, lat, lon, bbox | 0] */
export type PlaceRow = [string, Kind, string, number, 0 | 1, string, string, number, number, Box | 0];

let rows: Promise<PlaceRow[]> | undefined;
let outlines: Promise<Record<string, string>> | undefined;

export const loadPlaces = () => (rows ??= import("@/data/places.json").then((m) => (m.default ?? m).rows as PlaceRow[]));
export const loadOutlines = () => (outlines ??= import("@/data/outlines.json").then((m) => (m.default ?? m).outlines as Record<string, string>));
