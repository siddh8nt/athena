import { readFileSync } from "node:fs";
import path from "node:path";
import { METROS } from "@/lib/playbook/metros";
import { norm } from "@/lib/methods/names";
import { RETAILER_POOLS } from "@/lib/stops/retailers";

// Taste Bench ground truth (PRD §10.6) from the public stockist lists in proof/stockists (collected 8 Oct, before
// any Bench run). Pure apart from reading the files; no Qloo data.

export const BENCH_BRANDS = [
  { slug: "brightland", name: "Brightland", tuning: true },
  { slug: "fishwife", name: "Fishwife", tuning: true },
  { slug: "mcclures", name: "McClure's Pickles", tuning: false },
  { slug: "rishi-tea", name: "Rishi Tea & Botanicals", tuning: false },
  { slug: "paddywax", name: "Paddywax", tuning: false },
  { slug: "raaka", name: "Raaka Chocolate", tuning: false },
  { slug: "dick-taylor", name: "Dick Taylor Craft Chocolate", tuning: false },
  { slug: "diaspora-co", name: "Diaspora Co.", tuning: false },
  { slug: "juniper-ridge", name: "Juniper Ridge", tuning: false },
  { slug: "mud-wtr", name: "MUD\\WTR", tuning: false },
] as const;
export type BenchBrand = (typeof BENCH_BRANDS)[number];

export type StockistRow = { venue: string; address: string; city: string; state: string; metro: string; metroId?: string; chain: boolean; lat?: number; lon?: number };

/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"', i++);
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const METRO_BY_NAME = new Map(METROS.map((m) => [m.name, m.id]));

export function parseStockists(text: string): StockistRow[] {
  const [head, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  const at = (k: string) => head.indexOf(k);
  const num = (s: string | undefined) => (s && Number.isFinite(Number(s)) ? Number(s) : undefined);
  return rows.map((r) => ({
    venue: r[at("venue")] ?? "",
    address: r[at("address")] ?? "",
    city: r[at("city")] ?? "",
    state: r[at("state")] ?? "",
    metro: r[at("metro")] ?? "",
    metroId: METRO_BY_NAME.get(r[at("metro")] ?? ""),
    // Hand review (registered): the file's heuristic flag stands, and any store of a retailer on the §9.25 list is a chain.
    chain: (r[at("is_chain")] ?? "").trim().toLowerCase() === "yes" || RETAILER_POOLS.general.some((n) => isRetailerVenue(r[at("venue")] ?? "", n)),
    lat: num(r[at("lat")]),
    lon: num(r[at("lon")]),
  }));
}

export function readStockists(slug: string, dir = path.join(process.cwd(), "proof", "stockists")): StockistRow[] {
  return parseStockists(readFileSync(path.join(dir, `${slug}.csv`), "utf-8"));
}

/** Independent stockists per named metro (every one of the 25, zero where none). */
export function independentsByMetro(rows: StockistRow[]): Map<string, number> {
  const out = new Map(METROS.map((m) => [m.id, 0]));
  for (const r of rows) if (!r.chain && r.metroId) out.set(r.metroId, (out.get(r.metroId) ?? 0) + 1);
  return out;
}

/** T1 is scored only when the brand's independents reach at least this many of the 25 metros (registered). */
export const T1_MIN_METROS = 10;

export type MetroTruth = { metroId: string; independents: number; population: number; perMillion: number };

/** T1 truth: independent stockists per million residents, for each metro with a population. */
export function metroTruth(rows: StockistRow[], population: Map<string, number>): MetroTruth[] {
  return [...independentsByMetro(rows)]
    .filter(([id]) => (population.get(id) ?? 0) > 0)
    .map(([metroId, independents]) => ({ metroId, independents, population: population.get(metroId)!, perMillion: (independents / population.get(metroId)!) * 1e6 }));
}

/**
 * How a retailer's stores are named in the locators, beyond its own name (normalised). A venue matches when its
 * normalised name starts with the retailer's name or an alias: "FRESH MARKET #061" is The Fresh Market, "Citi Fresh
 * Market" isn't.
 */
const ALIASES: Record<string, string[]> = {
  "Whole Foods Market": ["whole foods"],
  "Sprouts Farmers Market": ["sprouts"],
  "The Fresh Market": ["fresh market"],
  "Trader Joe's": ["trader joes"],
  "Gelson's": ["gelsons"],
  "New Seasons Market": ["new seasons"],
  "H-E-B": ["heb"],
  "H Mart": ["hmart"],
  "Ulta Beauty": ["ulta"],
  "Credo Beauty": ["credo"],
  "Bloomingdale's": ["bloomingdales"],
  "Saks Fifth Avenue": ["saks"],
  "Foxtrot": ["foxtrot market"],
};

export function retailerAliases(retailer: string): string[] {
  return [...new Set([norm(retailer), ...(ALIASES[retailer] ?? []).map(norm)])].filter(Boolean);
}

/** Does this locator venue belong to the retailer? */
export function isRetailerVenue(venue: string, retailer: string): boolean {
  const v = ` ${norm(venue)} `;
  return retailerAliases(retailer).some((a) => v.startsWith(` ${a} `));
}

/** T2 truth: the retailers in the list with at least one row in the brand's file, with their row counts. */
export function stockedRetailers(rows: StockistRow[], retailers: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const name of retailers) {
    const n = rows.filter((r) => isRetailerVenue(r.venue, name)).length;
    if (n) out.set(name, n);
  }
  return out;
}

/** T3 metros: the two with the most independents (A gives the signal, B the pool); ties go to the larger metro list order. */
export function rankingCheckMetros(rows: StockistRow[]): { a: string; b: string; counts: [number, number] } {
  const top = [...independentsByMetro(rows)].sort((x, y) => y[1] - x[1]);
  return { a: top[0][0], b: top[1][0], counts: [top[0][1], top[1][1]] };
}
