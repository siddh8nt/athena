import "server-only";
import { METROS, type Metro } from "@/lib/playbook/metros";
import type { MarketRow } from "@/lib/blocks/markets";

// US Census Bureau ACS 5-year, 2020–2024 (§9.19). One request covers all 25 metros by CBSA code
// (S20 passed on 8 Oct: 25 of 25). Values never change an order; they're cached for the server's life.

const URL_BASE = "https://api.census.gov/data/2024/acs/acs5";
export const CENSUS_LABEL = "Census, ACS 2020–2024";

let table: Promise<Map<string, { population: number; income: number }>> | undefined;

function load(apiKey: string | undefined) {
  const params = new URLSearchParams({
    get: "NAME,B01003_001E,B19013_001E",
    for: `metropolitan statistical area/micropolitan statistical area:${METROS.map((m) => m.cbsa).join(",")}`,
  });
  if (apiKey) params.set("key", apiKey);
  return fetch(`${URL_BASE}?${params}`, { signal: AbortSignal.timeout(30_000) })
    .then((r) => (r.ok ? (r.json() as Promise<string[][]>) : Promise.reject(new Error(`Census HTTP ${r.status}`))))
    .then(([head, ...rows]) => {
      const i = { pop: head.indexOf("B01003_001E"), inc: head.indexOf("B19013_001E"), cbsa: head.length - 1 };
      return new Map(rows.map((r) => [r[i.cbsa], { population: Number(r[i.pop]), income: Number(r[i.inc]) }]));
    });
}

export function censusMarket(apiKey: string | undefined): (metro: Metro) => Promise<MarketRow["census"]> {
  return async (metro) => {
    table ??= load(apiKey).catch((e) => {
      table = undefined; // retry on the next plan rather than caching a failure
      throw e;
    });
    const row = (await table).get(metro.cbsa);
    if (!row) return undefined;
    const fetchedAt = new Date().toISOString();
    return {
      population: row.population > 0 ? { value: row.population, source: "Census", fetchedAt } : undefined,
      medianIncome: row.income > 0 ? { value: row.income, source: "Census", fetchedAt } : undefined,
    };
  };
}
