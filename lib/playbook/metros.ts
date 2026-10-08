// The 25 metros Athena shows (PRD §9.3): the same 25 used for the stockist lists in proof/stockists.
// `qloo` is the name Qloo's geocode.metro uses where seen on 8 Oct (New York City, Los Angeles, Chicago,
// Dallas, San Francisco…); the others are best guesses matched by alias. CBSA codes verified against the Census API on 8 Oct (S20: 25 of 25).

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

/** Maps a Qloo geocode.metro (or a city name) to one of the 25 metros, or undefined. */
export function metroFor(name: string | undefined): Metro | undefined {
  return name ? BY_ALIAS.get(key(name)) : undefined;
}

export function metroById(id: string): Metro {
  const metro = METROS.find((x) => x.id === id);
  if (!metro) throw new Error(`unknown metro ${id}`);
  return metro;
}
