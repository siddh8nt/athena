// Every claim cites a tool call (PRD §23.2 step 2d). Code, not the model, checks that each number in a claim
// appears in a source the claim cites: rounding is allowed, and a percentage may come from a fraction (0.183 → 18%).
// Dates must appear as written. Pure, so it's tested without the model.

export type Claim = { text: string; sources: string[] };
export type Rejected = Claim & { reason: string };

type Num = { value: number; tol: number; percent: boolean; raw: string };

const UNITS: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, b: 1e9, billion: 1e9 };
const DATE = /\b\d{4}-\d{2}(?:-\d{2})?\b/g;
// A number not glued to a word ("s3", "Q4" and "3rd" aren't counted), with an optional unit that ends a word.
const NUM = /(?<![\w.])\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?(%|percent|x|×|k|thousand|m|million|bn|b|billion)(?![a-z]))?(?!\d|st\b|nd\b|rd\b|th\b)/gi;

/** The numbers in a piece of text, each with the tolerance its written precision allows. Dates are left out. */
export function numbersIn(text: string): Num[] {
  const out: Num[] = [];
  for (const m of text.replace(DATE, " ").matchAll(NUM)) {
    const unit = m[3]?.toLowerCase();
    const mult = unit && UNITS[unit] ? UNITS[unit] : 1;
    const decimals = m[2] ? m[2].length - 1 : 0;
    const value = Number(`${m[1].replace(/,/g, "")}${m[2] ?? ""}`) * mult;
    out.push({ value, tol: (0.5 * mult) / 10 ** decimals, percent: unit === "%" || unit === "percent", raw: m[0].trim() });
  }
  return out;
}

/** Every number a source holds: its numbers, numbers inside its strings and keys ("35_and_younger"), and each list's length. */
export function sourceNumbers(data: unknown, out: number[] = []): number[] {
  if (typeof data === "number" && Number.isFinite(data)) out.push(data);
  else if (typeof data === "string") for (const n of numbersIn(data)) out.push(n.value);
  else if (Array.isArray(data)) {
    out.push(data.length);
    for (const x of data) sourceNumbers(x, out);
  } else if (data && typeof data === "object") {
    for (const [k, x] of Object.entries(data)) {
      for (const n of numbersIn(k)) out.push(n.value);
      sourceNumbers(x, out);
    }
  }
  return out;
}

/** A written number matches a source number when rounding explains the gap (or it's within 0.5%). */
function matches(n: Num, s: number): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= n.tol + 1e-9 || Math.abs(a - b) <= 0.005 * Math.abs(b);
  if (near(n.value, Math.abs(s))) return true;
  return n.percent && near(n.value, Math.abs(s * 100));
}

export type SourceData = { data: unknown };

/**
 * Splits claims into kept and rejected. A claim is kept when it cites at least one known source, every number in it
 * appears in a cited source, and every date in it appears in a cited source as written.
 */
export function checkClaims(claims: Claim[], sources: ReadonlyMap<string, SourceData>): { kept: Claim[]; rejected: Rejected[] } {
  const kept: Claim[] = [];
  const rejected: Rejected[] = [];
  for (const c of claims) {
    const cited = [...new Set(c.sources)].filter((id) => sources.has(id));
    if (!cited.length) {
      rejected.push({ ...c, reason: c.sources.length ? `cites unknown sources ${c.sources.join(", ")}` : "cites no source" });
      continue;
    }
    const data = cited.map((id) => sources.get(id)!.data);
    const nums = data.flatMap((d) => sourceNumbers(d));
    const missing = numbersIn(c.text).filter((n) => !nums.some((s) => matches(n, s)));
    const json = data.map((d) => JSON.stringify(d)).join(" ");
    const dates = (c.text.match(DATE) ?? []).filter((d) => !json.includes(d));
    if (missing.length || dates.length) {
      rejected.push({ ...c, sources: cited, reason: `${[...missing.map((n) => n.raw), ...dates].join(", ")} not found in ${cited.join(", ")}` });
      continue;
    }
    kept.push({ ...c, sources: cited });
  }
  return { kept, rejected };
}
