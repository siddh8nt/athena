// Name matching for resolution (PRD §9.1). A port of scripts/spike/resolve.py, which measured
// 24 of 25 certain matches on 8 Oct; keep the two in step.

const GENERIC = new Set(["coffee", "cafe", "café", "bakery", "the", "and", "shop", "store", "market", "co", "company", "inc", "llc"]);

export function norm(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Drops location suffixes: "A.MANO Brooklyn - Ground Floor", "Foo (Downtown)", "Foo #2". */
export function cleanVenue(name: string): string {
  const n = (name ?? "").split(/\s+[-–|/]\s+|\s*\(|\s+#\d/)[0].trim();
  return n || name;
}

/** Ratcliff/Obershelp similarity, as Python's difflib.SequenceMatcher.ratio() (no autojunk for short strings). */
export function seqRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches = matchingChars(a, b);
  return (2 * matches) / (a.length + b.length);
}

function matchingChars(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let bestI = 0, bestJ = 0, bestK = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagPrev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diagPrev + 1 : 0;
      if (prev[j] > bestK) {
        bestK = prev[j];
        bestI = i - bestK;
        bestJ = j - bestK;
      }
      diagPrev = tmp;
    }
  }
  if (!bestK) return 0;
  return bestK + matchingChars(a.slice(0, bestI), b.slice(0, bestJ)) + matchingChars(a.slice(bestI + bestK), b.slice(bestJ + bestK));
}

function tokens(s: string): Set<string> {
  const all = new Set(norm(s).split(" ").filter(Boolean));
  const kept = new Set([...all].filter((t) => !GENERIC.has(t)));
  return kept.size ? kept : all;
}

export function nameSim(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter((t) => tb.has(t)).sort().join(" ");
  const sa = [...ta].sort().join(" ");
  const sb = [...tb].sort().join(" ");
  const subset = [...ta].every((t) => tb.has(t)) || [...tb].every((t) => ta.has(t));
  if (inter && subset) return 1;
  return Math.max(seqRatio(sa, sb), inter ? seqRatio(inter, sa) : 0, inter ? seqRatio(inter, sb) : 0);
}

export function meters(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const d = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(d));
}

export function streetNo(address: string | undefined): string | undefined {
  const m = /^\s*(\d+[a-zA-Z]?)\b/.exec(address ?? "");
  return m ? m[1].toLowerCase() : undefined;
}

export type Row = { name: string; address?: string; city?: string; lat?: number; lon?: number };
export type Candidate = { name: string; address?: string; lat?: number; lon?: number };

/** Accept rule (§9.1): sim ≥ 0.85 and (street number match or ≤ 150 m); or sim ≥ 0.99 within 300 m. */
export function accept(row: Row, cand: Candidate): { ok: boolean; sim: number; dist?: number } {
  const sim = nameSim(cleanVenue(row.name), cand.name);
  const dist =
    row.lat !== undefined && row.lon !== undefined && cand.lat !== undefined && cand.lon !== undefined
      ? meters([row.lat, row.lon], [cand.lat, cand.lon])
      : undefined;
  const snRow = streetNo(row.address);
  const snCand = streetNo(cand.address);
  let ok = sim >= 0.85 && ((snRow !== undefined && snRow === snCand) || (dist !== undefined && dist <= 150));
  ok = ok || (sim >= 0.99 && dist !== undefined && dist <= 300);
  return { ok, sim, dist };
}

/** Chain list (§9.1), matched as whole words. Extend as QA finds misses. */
export const CHAINS = [
  "whole foods", "trader joe", "kroger", "safeway", "albertsons", "publix", "wegmans", "sprouts", "target", "walmart",
  "costco", "sam s club", "cvs", "walgreens", "rite aid", "starbucks", "dunkin", "peet s", "tim hortons", "panera",
  "corner bakery", "pret a manger", "blue bottle", "la colombe", "le pain quotidien", "erewhon", "h e b", "heb",
  "meijer", "hy vee", "giant", "stop and shop", "food lion", "harris teeter", "ralphs", "vons", "pavilions",
  "fred meyer", "qfc", "king soopers", "smith s", "fry s", "jewel osco", "mariano s", "shoprite", "acme", "foodtown",
  "fairway", "the fresh market", "fresh thyme", "natural grocers", "earth fare", "market of choice", "new seasons",
  "pcc", "bristol farms", "gelson s", "lazy acres", "central market", "tom thumb", "randalls", "bed bath",
  "home goods", "homegoods", "marshalls", "tj maxx", "t j maxx", "crate and barrel", "williams sonoma", "sur la table",
  "anthropologie", "urban outfitters", "world market", "pier 1", "barnes and noble", "nordstrom", "macy s",
  "bloomingdale s", "neiman marcus", "saks", "equinox", "planet fitness", "la fitness", "24 hour fitness",
  "orangetheory", "soulcycle", "corepower", "sephora", "ulta", "petco", "petsmart", "amazon fresh", "7 eleven",
];

const CHAIN_RES = CHAINS.map((c) => new RegExp(`(^| )${c.replace(/ /g, " ")}( |$)`));

export function isChainName(name: string): boolean {
  const n = norm(name);
  return CHAIN_RES.some((re) => re.test(n));
}

/** A venue is a chain if its normalised name appears ≥ 3 times across the brand's list, or matches CHAINS. */
export function chainNames(names: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const n of names.map((x) => norm(cleanVenue(x)))) counts.set(n, (counts.get(n) ?? 0) + 1);
  return new Set([...counts].filter(([, c]) => c >= 3).map(([n]) => n));
}
