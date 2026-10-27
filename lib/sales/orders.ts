// Sales from an orders export (PRD §23.6 i). The founder drops their store's Orders CSV into the Brand Knowledge Base;
// one small model call reads only the header row and names the columns that hold each order's date, total, ZIP and
// order number (model context, never column-name rules). The browser then reads the file itself and keeps, per order,
// only its date, total and ZIP: names, emails, phone numbers and street addresses never leave the founder's computer
// and are never stored. Code maps each ZIP to a metro on the server, and a metro to the crowds whose cities it is.
// Pure and client-safe, so the dashboard, Execute Plan, the team's prompts and the tests read the same numbers.

import { cleanMetroName, metroIdFor } from "@/lib/playbook/metros";

/** One order as kept: [YYYY-MM-DD, total, five-digit ZIP]. Nothing else about it is kept. */
export type Order = [date: string, total: number, zip: string];
/** The header's columns, by index, as the model named them. `id` joins a multi-line order's rows into one. */
export type OrderCols = { date: number; total: number; zip: number; id?: number };
/** Where a ZIP sits: a metro the app knows (its id), or the ZIP's own town. */
export type SalesPlace = { metro?: string; name: string };
export type Sales = {
  /** The file's name, as the founder dropped it. */
  file: string;
  at: number;
  /** The judges' demo: a made-up sample file, labelled Sample data wherever it shows (§23.6 i). */
  sample?: boolean;
  orders: Order[];
  /** Each ZIP's place, from the server's ZIP table. */
  places: Record<string, SalesPlace>;
};

/** The most orders kept from one file: enough for years of a small brand's sales, small enough to travel with the journey. */
export const MAX_ORDERS = 20_000;

/** A CSV file's rows, quoted fields and doubled quotes included. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** A US ZIP as five digits: "'02139", "02139-4307" and a spreadsheet's "2139" all read 02139. */
export function zip5(v: string): string | undefined {
  const d = v.replace(/^'/, "").trim().split("-")[0].replace(/\D/g, "");
  return d.length >= 3 && d.length <= 5 ? d.padStart(5, "0") : undefined;
}

function dayOf(v: string): string | undefined {
  const iso = v.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

function moneyOf(v: string): number | undefined {
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return v.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/**
 * The orders in a file's rows (header first), keeping only date, total and ZIP. An order spread over several rows (one
 * per line item) counts once, from its first row with a total; a row with no total, date or ZIP is skipped.
 */
export function readOrders(rows: string[][], cols: OrderCols): { orders: Order[]; skipped: number } {
  const orders: Order[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const id = cols.id !== undefined ? r[cols.id]?.trim() : undefined;
    if (id && seen.has(id)) continue;
    const date = dayOf(r[cols.date] ?? "");
    const total = moneyOf(r[cols.total] ?? "");
    const zip = zip5(r[cols.zip] ?? "");
    if (!date || total === undefined || !zip) {
      // A later row of the same order may carry the total; only a row with none of the three is an order skipped.
      if (!id) skipped++;
      continue;
    }
    if (id) seen.add(id);
    orders.push([date, total, zip]);
    if (orders.length >= MAX_ORDERS) break;
  }
  return { orders, skipped };
}

export type PlaceSale = { key: string; metro?: string; name: string; orders: number; revenue: number };
export type CrowdSale = { crowd: string; name: string; orders: number; revenue: number; places: string[] };
type CrowdCities = { id: string; name: string; nearMiss?: boolean; cities: { metro: string; name?: string }[] };
const townKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Sales by place, biggest first. */
export function salesByPlace(s: Sales): PlaceSale[] {
  const by = new Map<string, PlaceSale>();
  for (const [, total, zip] of s.orders) {
    const p = s.places[zip] ?? { name: "Other ZIPs" };
    const key = p.metro ?? p.name;
    const row = by.get(key) ?? { key, ...(p.metro ? { metro: p.metro } : {}), name: p.name, orders: 0, revenue: 0 };
    row.orders++;
    row.revenue = Math.round((row.revenue + total) * 100) / 100;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * Sales by crowd: each crowd's share is the sales in the cities where it clusters (its reach). A city two crowds share
 * counts for both, so the crowds' figures don't add up to the total, and the view says so.
 */
export function salesByCrowd(s: Sales, crowds: CrowdCities[]): CrowdSale[] {
  const places = salesByPlace(s);
  return crowds
    .filter((c) => !c.nearMiss)
    .map((c) => {
      // A crowd's cities carry Qloo's metro names ("New York City"); a place carries the app's metro id, or its own town.
      const ids = new Set(c.cities.map((x) => metroIdFor(x.metro)));
      const towns = new Set(c.cities.map((x) => townKey(cleanMetroName(x.name || x.metro))));
      const hit = places.filter((p) => (p.metro ? ids.has(p.metro) : towns.has(townKey(p.name.split(",")[0]))));
      return {
        crowd: c.id,
        name: c.name,
        orders: hit.reduce((n, p) => n + p.orders, 0),
        revenue: Math.round(hit.reduce((n, p) => n + p.revenue, 0) * 100) / 100,
        places: hit.map((p) => p.name),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The orders' first and last days. */
export function spanOf(s: Sales): { from?: string; to?: string } {
  const days = s.orders.map((o) => o[0]).sort();
  return { from: days[0], to: days[days.length - 1] };
}

/** One line on what sells, for the Navigator's and Rep's prompts and the founder's AI tool. */
export function salesLine(s: Sales | undefined, max = 8): string | undefined {
  if (!s?.orders.length) return undefined;
  const places = salesByPlace(s).slice(0, max);
  const { from, to } = spanOf(s);
  const total = s.orders.reduce((n, o) => n + o[1], 0);
  return (
    `${s.sample ? "A sample orders file (made-up data for the demo, not the brand's real sales)" : "The founder's own orders export"}, ${s.orders.length} orders worth ${usd(total)}${from ? ` from ${from} to ${to}` : ""}. ` +
    `By city: ${places.map((p) => `${p.name} ${usd(p.revenue)} (${p.orders} orders)`).join("; ")}.`
  );
}
