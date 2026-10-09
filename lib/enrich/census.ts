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
