// Precomputes data/cell-pop.json (PRD §9.26): residents per geohash-4 cell, so a crowd's heatmap can be weighted by
// people. One Census ACS call gives every county's population; each county is shared out over the geohash-4 cells it
// overlaps, by area, using its outline in data/outlines.json. Run once: `node scripts/cell-pop.mjs` (reads
// CENSUS_API_KEY from .env if present; the call also works without a key). Census data is public domain.

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const env = Object.fromEntries(
  readFileSync(new URL(".env", ROOT), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const STATES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

// ---- Census: one call, every county ----
const params = new URLSearchParams({ get: "NAME,B01003_001E", for: "county:*" });
if (env.CENSUS_API_KEY) params.set("key", env.CENSUS_API_KEY);
const res = await fetch(`https://api.census.gov/data/2024/acs/acs5?${params}`);
if (!res.ok) throw new Error(`Census HTTP ${res.status}`);
const [head, ...rows] = await res.json();
const iName = head.indexOf("NAME");
const iPop = head.indexOf("B01003_001E");

// ---- Outlines ----
const { outlines } = JSON.parse(readFileSync(new URL("data/outlines.json", ROOT), "utf8"));
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\bsaint\b/g, "st").replace(/\bste\b/g, "ste").replace(/\./g, "").replace(/'/g, "")
    .replace(/\b(county|parish|borough|city and borough|census area|municipality|planning region|city)\b/g, "")
    .replace(/[^a-z]+/g, "");
const byKey = new Map();
for (const k of Object.keys(outlines)) {
  if (!k.includes("|")) continue;
  const [st, name] = k.split("|");
  const nk = `${st}|${norm(name)}`;
  // "Baltimore County" and "Baltimore city" normalise alike: keep both, the exact-kind match is chosen below.
  byKey.set(nk, [...(byKey.get(nk) ?? []), k]);
}

function outlineFor(st, name) {
  if (st === "DC") return outlines["DC"] ? "DC" : undefined;
  const hits = byKey.get(`${st}|${norm(name)}`) ?? [];
  if (hits.length <= 1) return hits[0];
  const isCity = / city$/i.test(name);
  return hits.find((k) => /city$/i.test(k) === isCity) ?? hits[0];
}

// ---- Geometry ----
const parseWkt = (wkt) => {
  // → polygons, each a list of rings, each a list of [lon, lat].
  const polys = [];
  const body = wkt.trim().startsWith("MULTIPOLYGON") ? wkt.slice(wkt.indexOf("(") + 1, wkt.lastIndexOf(")")) : wkt.slice(wkt.indexOf("("));
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") { if (depth === 0) start = i; depth++; }
    else if (body[i] === ")" && --depth === 0) {
      const poly = body.slice(start + 1, i);
      polys.push([...poly.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].split(",").map((p) => p.trim().split(/\s+/).map(Number))));
    }
  }
  return polys;
};

const ringArea = (r) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

/** Sutherland–Hodgman: a ring clipped to an axis-aligned box. */
function clip(ring, [x0, y0, x1, y1]) {
  let out = ring;
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cut] of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i];
      const prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

const polyArea = (rings, box) => {
  const [outer, ...holes] = rings;
  const a = (r) => (box ? ringArea(clip(r, box)) : ringArea(r));
  return Math.max(0, a(outer) - holes.reduce((s, h) => s + a(h), 0));
};

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function encode(lat, lon, precision = 4) {
  let even = true, bit = 0, ch = 0, out = "";
  const la = [-90, 90], lo = [-180, 180];
  while (out.length < precision) {
    const r = even ? lo : la;
    const v = even ? lon : lat;
    const mid = (r[0] + r[1]) / 2;
    if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
    even = !even;
    if (++bit === 5) { out += BASE32[ch]; bit = 0; ch = 0; }
  }
  return out;
}
const W = 360 / 2 ** 10; // geohash-4: 10 longitude bits, 10 latitude bits
const H = 180 / 2 ** 10;

// ---- Share each county over the cells it overlaps ----
const cells = new Map(); // geohash → { pop, top: { key, pop } }
const missed = [];
let total = 0, placed = 0;
for (const r of rows) {
  const [county, stateName] = r[iName].split(", ");
  const st = STATES[stateName];
  const pop = Number(r[iPop]);
  if (!st || !(pop > 0)) continue; // Puerto Rico and empty rows
  total += pop;
  const key = outlineFor(st, county);
  if (!key) { missed.push(r[iName]); continue; }
  const polys = parseWkt(outlines[key]);
  const whole = polys.reduce((s, p) => s + polyArea(p), 0);
  if (!(whole > 0)) { missed.push(r[iName]); continue; }
  const pts = polys.flat(2);
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  for (let x = Math.floor((minX + 180) / W); x * W - 180 < maxX; x++) {
    for (let y = Math.floor((minY + 90) / H); y * H - 90 < maxY; y++) {
      const box = [x * W - 180, y * H - 90, (x + 1) * W - 180, (y + 1) * H - 90];
      const part = polys.reduce((s, p) => s + polyArea(p, box), 0) / whole;
      if (part <= 1e-6) continue;
      const gh = encode((box[1] + box[3]) / 2, (box[0] + box[2]) / 2);
      const c = cells.get(gh) ?? { pop: 0, top: { key: "", pop: 0 } };
      const share = pop * part;
      c.pop += share;
      if (share > c.top.pop) c.top = { key, pop: share };
      cells.set(gh, c);
      placed += share;
    }
  }
}

const out = {
  source: "U.S. Census Bureau, ACS 2020–2024 5-year (B01003, total population), shared over geohash-4 cells by area overlap with the county outlines in data/outlines.json",
  license: "Census: public domain. Outlines: see data/outlines.json.",
  counties: [],
  // geohash → [residents, index into counties of the county holding most of them ("ST|County Name")]
  cells: {},
};
for (const [g, c] of [...cells].filter(([, c]) => c.pop >= 1).sort(([a], [b]) => a.localeCompare(b))) {
  let i = out.counties.indexOf(c.top.key);
  if (i < 0) i = out.counties.push(c.top.key) - 1;
  out.cells[g] = [Math.round(c.pop), i];
}
writeFileSync(new URL("data/cell-pop.json", ROOT), JSON.stringify(out));
console.log(`${Object.keys(out.cells).length} cells; ${Math.round(placed).toLocaleString()} of ${total.toLocaleString()} residents placed (${((placed / total) * 100).toFixed(2)}%)`);
console.log(`unmatched counties: ${missed.length}`, missed.slice(0, 30));
