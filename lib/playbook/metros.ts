// Metros (PRD §9.3, v3.0): ANY US metro. The 25 named here are only the ones with checked details (display name,
// Qloo's spelling, CBSA code, centre), collected on 8 Oct with the stockist lists in proof/stockists; they are not a
// limit. Any other metro Qloo returns, or any city a founder types, gets a self-describing id ("q~Bozeman~45.680,-111.040")
// so every part of the app can rebuild it without shared state. `qloo` is the name Qloo's geocode.metro uses where
// seen on 8 Oct (New York City, Los Angeles, Chicago, Dallas, San Francisco…). CBSA codes verified on 8 Oct (S20).

export type Metro = {
  id: string;
  name: string;
  /** Value for filter.location.query */
  query: string;
  /** Value for filter.exclude.location.query. On 8 Oct "New York City" was silently ignored here; "New York" worked. */
  excludeQuery: string;
  /** Names Qloo may use in properties.geocode.metro */
  aliases: string[];
  cbsa: string;
  center: [number, number]; // lat, lon
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat (for map fly-to and Overture)
  /**
   * A place the founder typed (lib/places): the area Qloo searches, as parts that are each an outline key from
   * data/outlines.json ("o:OH", "o:CA|Alameda County") or a box ("b:minLon,minLat,maxLon,maxLat"). Qloo's own
   * text lookup isn't used for these: on 10 Oct it sent "Bay Area" to Hong Kong and "Orange County" to Orlando.
   */
  area?: string[];
  /** "region" names towns on the heatmap; "local" names neighbourhoods (§9.4). */
  scale?: "region" | "local";
};

const m = (
  id: string,
  name: string,
  query: string,
  aliases: string[],
  cbsa: string,
  center: [number, number],
  span = 0.6,
): Metro => ({
  id,
  name,
  query,
  excludeQuery: id === "nyc" ? "New York" : query,
  aliases: [name, query, ...aliases],
  cbsa,
  center,
  bbox: [center[1] - span, center[0] - span * 0.75, center[1] + span, center[0] + span * 0.75],
});

export const METROS: Metro[] = [
  m("nyc", "New York", "New York City", ["New York City", "NYC", "Brooklyn"], "35620", [40.7128, -74.006]),
  m("la", "Los Angeles", "Los Angeles", ["LA"], "31080", [34.0522, -118.2437], 0.8),
  m("chicago", "Chicago", "Chicago", [], "16980", [41.8781, -87.6298]),
  m("dfw", "Dallas-Fort Worth", "Dallas", ["Dallas", "Fort Worth"], "19100", [32.7767, -96.797], 0.8),
  m("houston", "Houston", "Houston", [], "26420", [29.7604, -95.3698], 0.7),
  m("dc", "Washington DC", "Washington, D.C.", ["Washington", "Washington D.C.", "Washington, DC"], "47900", [38.9072, -77.0369]),
  m("philadelphia", "Philadelphia", "Philadelphia", [], "37980", [39.9526, -75.1652]),
  m("atlanta", "Atlanta", "Atlanta", [], "12060", [33.749, -84.388], 0.7),
  m("miami", "Miami", "Miami", ["Fort Lauderdale"], "33100", [25.7617, -80.1918]),
  m("phoenix", "Phoenix", "Phoenix", ["Scottsdale"], "38060", [33.4484, -112.074], 0.7),
  m("boston", "Boston", "Boston", ["Cambridge"], "14460", [42.3601, -71.0589]),
  m("riverside", "Riverside", "Riverside", ["Inland Empire", "San Bernardino"], "40140", [33.9533, -117.3962], 0.8),
  m("sf", "San Francisco Bay", "San Francisco", ["San Francisco", "Oakland", "San Jose", "Bay Area"], "41860", [37.7749, -122.4194], 0.7),
  m("detroit", "Detroit", "Detroit", [], "19820", [42.3314, -83.0458]),
  m("seattle", "Seattle", "Seattle", [], "42660", [47.6062, -122.3321]),
  m("minneapolis", "Minneapolis", "Minneapolis", ["Saint Paul", "St. Paul"], "33460", [44.9778, -93.265]),
  m("tampa", "Tampa", "Tampa", ["St. Petersburg"], "45300", [27.9506, -82.4572]),
  m("sandiego", "San Diego", "San Diego", [], "41740", [32.7157, -117.1611]),
  m("denver", "Denver", "Denver", ["Boulder"], "19740", [39.7392, -104.9903]),
  m("baltimore", "Baltimore", "Baltimore", [], "12580", [39.2904, -76.6122], 0.4),
  m("orlando", "Orlando", "Orlando", [], "36740", [28.5383, -81.3792]),
  m("charlotte", "Charlotte", "Charlotte", [], "16740", [35.2271, -80.8431]),
  m("stlouis", "St. Louis", "St. Louis", ["Saint Louis"], "41180", [38.627, -90.1994]),
  m("sanantonio", "San Antonio", "San Antonio", [], "41700", [29.4241, -98.4936]),
  m("austin", "Austin", "Austin", [], "12420", [30.2672, -97.7431]),
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const BY_ALIAS = new Map<string, Metro>();
for (const metro of METROS) for (const a of metro.aliases) BY_ALIAS.set(key(a), metro);

/** Maps a Qloo geocode.metro (or a city name) to one of the named metros, or undefined. */
export function metroFor(name: string | undefined): Metro | undefined {
  return name ? BY_ALIAS.get(key(name)) : undefined;
}

/** The middle of the contiguous US: a placeholder centre until a metro's own is known. */
export const US_CENTER: [number, number] = [39.5, -98.35];

/** "Bozeman Metro Area" → "Bozeman". */
export function cleanMetroName(name: string): string {
  return name.replace(/\s+(metropolitan|metro|micropolitan)(\s+(statistical\s+)?area)?$/i, "").replace(/\s+area$/i, "").trim();
}

/** A metro's id: the named one's, else a self-describing id carrying its name and, when known, its centre. */
export function metroIdFor(name: string, at?: [number, number]): string {
  const known = metroFor(name) ?? metroFor(cleanMetroName(name));
  if (known) return known.id;
  return `q~${encodeURIComponent(cleanMetroName(name))}${at ? `~${at[0].toFixed(3)},${at[1].toFixed(3)}` : ""}`;
}

/** A typed place's id (lib/places): label, box, scale and area parts, so it rebuilds anywhere without the data files. */
export function placeId(p: { label: string; bbox: [number, number, number, number]; scale: "region" | "local"; area: string[] }): string {
  return `p~${encodeURIComponent(p.label)}~${p.bbox.map((v) => v.toFixed(3)).join(",")}~${p.scale}~${p.area.map(encodeURIComponent).join(";")}`;
}

/** Any metro by id: a named one, or one rebuilt from its self-describing id. */
export function metroById(id: string): Metro {
  const named = METROS.find((x) => x.id === id);
  if (named) return named;
  if (id.startsWith("p~")) {
    const [, rawLabel, rawBox, scale, rawArea] = id.split("~");
    const bbox = (rawBox ?? "").split(",").map(Number);
    if (!rawLabel || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error(`unknown place ${id}`);
    const name = decodeURIComponent(rawLabel);
    const b = bbox as [number, number, number, number];
    return {
      id,
      name,
      query: name,
      excludeQuery: name,
      aliases: [name],
      cbsa: "",
      center: [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2],
      bbox: b,
      area: (rawArea ?? "").split(";").filter(Boolean).map(decodeURIComponent),
      scale: scale === "region" ? "region" : "local",
    };
  }
  const [tag, rawName, at] = id.split("~");
  if (tag !== "q" || !rawName) throw new Error(`unknown metro ${id}`);
  const name = decodeURIComponent(rawName);
  const ll = at?.split(",").map(Number);
  const center: [number, number] = ll && ll.length === 2 && ll.every(Number.isFinite) ? [ll[0], ll[1]] : US_CENTER;
  const metro = m(id, name, name, [], "", center, ll ? 0.45 : 12);
  return { ...metro, excludeQuery: name };
}

/**
 * Where a metro-level answer is wanted (a home base, a stockist's city): the named metro a typed place sits in, its
 * centre inside the metro's box and the place no wider than it, nearest first; else the place itself. "Los Angeles, CA"
 * typed as a home base is then the Los Angeles metro, not a second city beside it.
 */
export function metroLevel(p: Metro): Metro {
  if (!p.id.startsWith("p~")) return p;
  const [lat, lon] = p.center;
  const w = (b: Metro["bbox"]) => b[2] - b[0];
  const h = (b: Metro["bbox"]) => b[3] - b[1];
  const d = (n: Metro) => (n.center[0] - lat) ** 2 + (n.center[1] - lon) ** 2;
  const hit = METROS.filter((n) => lon >= n.bbox[0] && lon <= n.bbox[2] && lat >= n.bbox[1] && lat <= n.bbox[3] && w(p.bbox) <= w(n.bbox) && h(p.bbox) <= h(n.bbox));
  return hit.sort((a, b) => d(a) - d(b))[0] ?? p;
}

/** Does this id name a metro Athena can rebuild? */
export function isMetroId(id: string): boolean {
  try {
    metroById(id);
    return true;
  } catch {
    return false;
  }
}
