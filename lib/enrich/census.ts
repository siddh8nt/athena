import "server-only";
import type { Metro } from "@/lib/playbook/metros";
import type { MarketRow } from "@/lib/blocks/markets";

// US Census Bureau ACS 5-year, 2020–2024 (§9.19). One request covers every US metro and micropolitan area (about
// 930), matched by CBSA code for the named metros and by name for any other (§9.3, v3.0). Values never change an
// order; they're cached for the server's life.

const URL_BASE = "https://api.census.gov/data/2024/acs/acs5";
export const CENSUS_LABEL = "Census, ACS 2020–2024";

type Row = { name: string; population: number; income: number };
let table: Promise<Map<string, Row>> | undefined;

function load(apiKey: string | undefined) {
  const params = new URLSearchParams({
    get: "NAME,B01003_001E,B19013_001E",
    for: "metropolitan statistical area/micropolitan statistical area:*",
  });
  if (apiKey) params.set("key", apiKey);
  return fetch(`${URL_BASE}?${params}`, { signal: AbortSignal.timeout(30_000) })
    .then((r) => (r.ok ? (r.json() as Promise<string[][]>) : Promise.reject(new Error(`Census HTTP ${r.status}`))))
    .then(([head, ...rows]) => {
      const i = { name: head.indexOf("NAME"), pop: head.indexOf("B01003_001E"), inc: head.indexOf("B19013_001E"), cbsa: head.length - 1 };
      return new Map(rows.map((r) => [r[i.cbsa], { name: r[i.name], population: Number(r[i.pop]), income: Number(r[i.inc]) }]));
    });
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

/** A metro outside the named list, by name: its CBSA's first city ("Bozeman, MT Micropolitan…" or "Denver-Aurora…"). The largest match wins. */
export function byName(all: Map<string, Row>, name: string): Row | undefined {
  const want = words(name).join(" ");
  if (!want) return undefined;
  const hits = [...all.values()].filter((r) => r.name.split(",")[0].split("-").some((city) => words(city).join(" ") === want));
  return hits.sort((a, b) => b.population - a.population)[0];
}

export function censusMarket(apiKey: string | undefined): (metro: Metro) => Promise<MarketRow["census"]> {
  return async (metro) => {
    table ??= load(apiKey).catch((e) => {
      table = undefined; // retry on the next plan rather than caching a failure
      throw e;
    });
    const all = await table;
    const row = metro.cbsa ? all.get(metro.cbsa) : byName(all, metro.name);
    if (!row) return undefined;
    const fetchedAt = new Date().toISOString();
    return {
      population: row.population > 0 ? { value: row.population, source: "Census", fetchedAt } : undefined,
      medianIncome: row.income > 0 ? { value: row.income, source: "Census", fetchedAt } : undefined,
    };
  };
}

// Level 3 of the Navigator (§23.5 e, j): a heatmap point is mapped to its tract and ZIP (ZCTA) by the Census
// geocoder, then both are read from the same ACS table. Points and figures are cached for the server's life.

const GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
/** Geocoder lookups at once: it's a free public service, so it's asked gently. */
const AT_ONCE = 6;

export type AreaFigures = {
  zip?: { id: string; residents?: number; income?: number };
  tract?: { id: string; name: string; residents?: number; income?: number };
};

type Geo = { zip?: string; tract?: { state: string; county: string; tract: string; name: string } };
const geos = new Map<string, Promise<Geo | undefined>>();
const zips = new Map<string, { residents?: number; income?: number }>();
const tracts = new Map<string, { residents?: number; income?: number }>();

function geocode([lat, lon]: [number, number]): Promise<Geo | undefined> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = geos.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ x: String(lon), y: String(lat), benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "Census Tracts,2020 Census ZIP Code Tabulation Areas", format: "json" });
  const p = fetch(`${GEOCODER}?${params}`, { signal: AbortSignal.timeout(15_000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`geocoder HTTP ${r.status}`))))
    .then((d: { result?: { geographies?: Record<string, Record<string, string>[]> } }) => {
      const g = d.result?.geographies ?? {};
      const t = g["Census Tracts"]?.[0];
      const z = g["2020 Census ZIP Code Tabulation Areas"]?.[0];
      return { zip: z?.ZCTA5 ?? z?.BASENAME, tract: t ? { state: t.STATE, county: t.COUNTY, tract: t.TRACT, name: t.NAME } : undefined };
    })
    .catch(() => (geos.delete(key), undefined));
  geos.set(key, p);
  return p;
}

const figure = (v: string) => (Number(v) > 0 ? Number(v) : undefined);

async function acs(apiKey: string | undefined, forParam: string, inParam?: string): Promise<string[][]> {
  const params = new URLSearchParams({ get: "B01003_001E,B19013_001E", for: forParam });
  if (inParam) params.set("in", inParam);
  if (apiKey) params.set("key", apiKey);
  const r = await fetch(`${URL_BASE}?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Census HTTP ${r.status}`);
  return ((await r.json()) as string[][]).slice(1);
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) {
      const k = i++;
      out[k] = await f(xs[k]);
    }
  }));
  return out;
}

/** Each point's ZIP and tract, with residents and median household income. A point the geocoder can't place is undefined. Never throws. */
export function censusAreas(apiKey: string | undefined): (points: [number, number][]) => Promise<(AreaFigures | undefined)[]> {
  return async (points) => {
    const placed = await pool(points, AT_ONCE, geocode);
    const wantZips = [...new Set(placed.flatMap((g) => (g?.zip && !zips.has(g.zip) ? [g.zip] : [])))];
    const tractKey = (t: NonNullable<Geo["tract"]>) => `${t.state}${t.county}${t.tract}`;
    const wantTracts = new Map<string, NonNullable<Geo["tract"]>[]>();
    for (const g of placed) if (g?.tract && !tracts.has(tractKey(g.tract))) wantTracts.set(`${g.tract.state}:${g.tract.county}`, [...(wantTracts.get(`${g.tract.state}:${g.tract.county}`) ?? []), g.tract]);
    await Promise.all([
      ...Array.from({ length: Math.ceil(wantZips.length / 50) }, (_, k) =>
        acs(apiKey, `zip code tabulation area:${wantZips.slice(k * 50, k * 50 + 50).join(",")}`)
          .then((rows) => rows.forEach((r) => zips.set(r[2], { residents: figure(r[0]), income: figure(r[1]) })))
          .catch(() => undefined),
      ),
      ...[...wantTracts].map(([sc, ts]) => {
        const [state, county] = sc.split(":");
        return acs(apiKey, `tract:${[...new Set(ts.map((t) => t.tract))].join(",")}`, `state:${state} county:${county}`)
          .then((rows) => rows.forEach((r) => tracts.set(`${r[2]}${r[3]}${r[4]}`, { residents: figure(r[0]), income: figure(r[1]) })))
          .catch(() => undefined);
      }),
    ]);
    return placed.map((g) => {
      if (!g) return undefined;
      const z = g.zip ? zips.get(g.zip) : undefined;
      const t = g.tract ? tracts.get(tractKey(g.tract)) : undefined;
      if (!z && !t) return undefined;
      return {
        ...(g.zip && z ? { zip: { id: g.zip, ...z } } : {}),
        ...(g.tract && t ? { tract: { id: tractKey(g.tract), name: g.tract.name, ...t } } : {}),
      };
    });
  };
}
