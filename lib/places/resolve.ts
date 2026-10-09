import { placeId } from "@/lib/playbook/metros";
import type { Box, Kind, PlaceRow } from "./data";

// Any US location a founder types (PRD §9.3): a state ("Ohio", "OH"), county ("Cook County, IL"), city ("Austin TX"),
// neighbourhood ("Silver Lake, Los Angeles"), zip code ("11211"), or an informal region ("Bay Area", "Pacific
// Northwest", "near UCLA"). Exact names resolve from local data; when a name fits several real places of similar
// size ("Portland", "Springfield"), Athena asks; anything else is read by the model into real places, each checked
// against the data. Nothing is guessed: an unreadable place gets a question, never a silent pick.

export type PlaceOption = { id: string; label: string; detail: string };
export type Resolution =
  | { status: "ok"; id: string; label: string; detail: string; read?: string[] }
  | { status: "ask"; question: string; options: PlaceOption[] }
  | { status: "none"; question: string };

/** What the model returns for an informal place (only used when no exact name matches). */
export type Interpretation = { label?: string; parts: { name: string; kind: string; state?: string; city?: string }[]; ask?: string };
export type Interpret = (text: string) => Promise<Interpretation | undefined>;

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** A rival place is worth asking about when it's at least this share of the biggest match (Portland, ME is 10% of Portland, OR). */
const RIVAL_SHARE = 0.05;
const RIVAL_FLOOR = 10_000;
/** A region read by the model can be up to this many places (Northern California is about 48 counties). */
const MAX_PARTS = 60;
/** Areas wider than this name towns on the heatmap; smaller ones name neighbourhoods. */
const REGION_KM = 80;

const KIND_WORD: Record<Kind, string> = { s: "state", c: "county", l: "city", m: "area", n: "neighbourhood", u: "neighbourhood", z: "zip code" };

type Index = { byName: Map<string, PlaceRow[]>; states: Map<string, PlaceRow>; stateName: Map<string, string> };
const indexes = new WeakMap<PlaceRow[], Index>();
function indexOf(rows: PlaceRow[]): Index {
  const hit = indexes.get(rows);
  if (hit) return hit;
  const byName = new Map<string, PlaceRow[]>();
  const states = new Map<string, PlaceRow>();
  const stateName = new Map<string, string>();
  for (const r of rows) {
    const k = norm(r[0]);
    const list = byName.get(k);
    if (list) list.push(r);
    else byName.set(k, [r]);
    if (r[1] === "s") {
      states.set(norm(r[2]), r);
      states.set(k, r);
      stateName.set(r[2], r[0]);
    }
  }
  const idx = { byName, states, stateName };
  indexes.set(rows, idx);
  return idx;
}

/** How big a place is, for ranking same-named places and deciding whether to ask. */
function weight(r: PlaceRow): number {
  const [, kind, , pop, wd] = r;
  if (kind === "s") return pop || 10_000_000;
  if (kind === "c") return pop || 50_000;
  if (kind === "l") return pop || (wd ? 5_000 : 500);
  if (kind === "m") return wd ? 30_000 : 3_000;
  if (kind === "n") return wd ? 20_000 : 2_000;
  if (kind === "u") return wd ? 10_000 : 1_000;
  return 1_000;
}

/** A row's box, or one sized for its kind around its point. */
export function boxOf(r: PlaceRow): Box {
  if (r[9]) return r[9];
  const span = { s: 3, c: 0.4, l: r[3] > 200_000 ? 0.3 : 0.12, m: 0.06, n: 0.025, u: 0.015, z: 0.04 }[r[1]];
  const [lat, lon] = [r[7], r[8]];
  const dLon = span / Math.cos((lat * Math.PI) / 180);
  return [lon - dLon, lat - span, lon + dLon, lat + span];
}

const diagKm = (b: Box) => Math.hypot((b[2] - b[0]) * 111 * Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180), (b[3] - b[1]) * 111);
const union = (boxes: Box[]): Box => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];

/** The area Qloo searches for a row: a real outline for states and counties, else its box. */
function areaPart(r: PlaceRow, outlines: Set<string>): string {
  const b = boxOf(r);
  const box = `b:${b.map((v) => v.toFixed(3)).join(",")}`;
  if (r[1] === "s") return outlines.has(r[2]) ? `o:${r[2]}` : box;
  if (r[1] === "c") return outlines.has(`${r[2]}|${r[0]}`) ? `o:${r[2]}|${r[0]}` : box;
  return box;
}

function labelOf(r: PlaceRow): string {
  const [name, kind, st, , , city] = r;
  if (kind === "s") return name;
  if (kind === "z") return `${name} (${city ? `${city}, ` : ""}${st})`;
  if (kind === "n" || kind === "u" || kind === "m") return city ? `${name}, ${city}` : `${name}, ${st}`;
  return `${name}, ${st}`;
}

function detailOf(r: PlaceRow, idx: Index): string {
  const [, kind, st, pop, , , county] = r;
  const state = idx.stateName.get(st) ?? st;
  const parts = [KIND_WORD[kind]];
  if (kind !== "s") parts.push(kind === "c" ? state : county ? `${county}, ${state}` : state);
  if (pop) parts.push(`pop. ${pop >= 1e6 ? `${(pop / 1e6).toFixed(1)}M` : pop >= 1e3 ? `${Math.round(pop / 1e3)}k` : pop}`);
  return parts.join(" · ");
}

function placeFor(rows: PlaceRow[], label: string, outlines: Set<string>) {
  const boxes = rows.map(boxOf);
  const bbox = union(boxes);
  const scale = rows.some((r) => r[1] === "s") || diagKm(bbox) > REGION_KM ? "region" : "local";
  return placeId({ label, bbox, scale, area: rows.map((r) => areaPart(r, outlines)) });
}

const SMALL = new Set<Kind>(["n", "u", "m", "z"]);
const inside = (r: PlaceRow, b: Box) => r[8] >= b[0] && r[8] <= b[2] && r[7] >= b[1] && r[7] <= b[3];

/**
 * Does a row fit a qualifier the founder added ("TX", "Texas", "Cook County", "Brooklyn")? A state must match; a city
 * or county may be the row's own, or any named city, borough or county whose area holds it (Overture files
 * Williamsburg under New York, not Brooklyn).
 */
function fits(r: PlaceRow, q: string, idx: Index): boolean {
  const state = idx.states.get(q);
  if (state) return r[2] === state[2];
  const city = norm(r[5]);
  const county = norm(r[6]);
  if (q === city || q === county || `${q} county` === county || `${q} parish` === county) return true;
  return named(idx, q).some((a) => a !== r && ["l", "m", "c"].includes(a[1]) && a[2] === r[2] && inside(r, boxOf(a)));
}

/** Splits "Austin TX" / "Austin, Texas" / "Silver Lake, Los Angeles, CA" into the name and its qualifiers. */
function split(text: string, idx: Index): { head: string; quals: string[] } {
  const parts = text.split(",").map(norm).filter(Boolean);
  let head = parts[0] ?? "";
  const quals = parts.slice(1);
  if (quals.length === 0) {
    // "Austin TX", "Portland Oregon", "Kansas City Missouri": a trailing state with no comma.
    const words = head.split(" ");
    for (const n of [2, 1]) {
      if (words.length <= n) continue;
      const tail = words.slice(-n).join(" ");
      if (idx.states.has(tail) && idx.byName.has(words.slice(0, -n).join(" "))) {
        head = words.slice(0, -n).join(" ");
        quals.push(tail);
        break;
      }
    }
  }
  return { head, quals };
}

/** Same-named rows for one place (several points for one neighbourhood): keep the strongest per name, kind and state. */
function dedupe(rows: PlaceRow[]): PlaceRow[] {
  const best = new Map<string, PlaceRow>();
  for (const r of rows) {
    const k = `${r[1] === "u" || r[1] === "n" ? "n" : r[1]}|${r[2]}|${norm(r[5])}|${r[1] === "c" ? "" : norm(r[6])}`;
    const cur = best.get(k);
    if (!cur || weight(r) > weight(cur)) best.set(k, r);
  }
  return [...best.values()];
}

/** Rows named this; "X County" also finds a county Overture names plainly ("San Francisco", a city-county). */
function named(idx: Index, name: string): PlaceRow[] {
  const k = norm(name);
  const plain = k.replace(/ (county|parish|borough)$/, "");
  const out = [...(idx.byName.get(k) ?? [])];
  if (plain !== k) out.push(...(idx.byName.get(plain) ?? []).filter((r) => r[1] === "c"));
  return out;
}

const CODE_KIND: Record<string, Kind[]> = { state: ["s"], county: ["c"], city: ["l"], town: ["l"], neighborhood: ["n", "u", "m"], neighbourhood: ["n", "u", "m"], zip: ["z"] };

export async function resolvePlace(text: string, data: { rows: PlaceRow[]; outlines: Set<string> }, interpret?: Interpret): Promise<Resolution> {
  const idx = indexOf(data.rows);
  const raw = text.trim().replace(/^(near|around|in|at|the)\s+/i, "");
  const ask = `I couldn't place “${text.trim()}”. Which city, county, state, zip code or neighbourhood did you mean?`;
  let lastAsk: string | undefined;
  if (!raw) return { status: "none", question: ask };

  // Zip codes.
  const zip = raw.match(/^\d{5}$/)?.[0];
  if (zip) {
    const r = idx.byName.get(zip)?.find((x) => x[1] === "z");
    return r ? ok(r) : { status: "none", question: `I don't know the zip code ${zip}. Which city or neighbourhood is it in?` };
  }

  const { head, quals } = split(raw, idx);
  let found = dedupe(named(idx, head).filter((r) => r[1] !== "z" && quals.every((q) => fits(r, q, idx))));
  // A state code alone ("OH").
  if (!found.length && !quals.length && idx.states.get(head)) found = [idx.states.get(head)!];

  // An unqualified name whose only matches are tiny ("the Midwest" → a Detroit block and a Wyoming town of 285) is
  // read by the model first; the tiny match stays as the fallback (a real small town reads back as itself).
  const weak = found.length > 0 && !quals.length && found.every((r) => weight(r) < RIVAL_FLOOR);
  if (weak && interpret) {
    const viaModel = await fromModel();
    if (viaModel) return viaModel;
  }

  if (found.length) {
    const ranked = found.sort((a, b) => weight(b) - weight(a));
    const top = weight(ranked[0]);
    const rivals = ranked.filter((r) => weight(r) >= Math.max(RIVAL_FLOOR, top * RIVAL_SHARE));
    if (rivals.length > 1) {
      return {
        status: "ask",
        question: `Which ${ranked[0][0]} do you mean?`,
        options: rivals.slice(0, 4).map((r) => ({ id: placeFor([r], labelOf(r), data.outlines), label: labelOf(r), detail: detailOf(r, idx) })),
      };
    }
    return ok(ranked[0]);
  }

  return (!weak && (await fromModel())) || { status: "none", question: lastAsk ?? ask };

  // Informal or misspelled: the model reads it into real places, and only places found in the data are kept.
  async function fromModel(): Promise<Resolution | undefined> {
    const read = interpret ? await interpret(raw).catch(() => undefined) : undefined;
    const parts = (read?.parts ?? []).slice(0, MAX_PARTS).flatMap((p) => {
      const kinds = CODE_KIND[norm(p.kind)] ?? ["l", "c", "s", "n", "u", "m"];
      const st = p.state ? idx.states.get(norm(p.state))?.[2] : undefined;
      const rows = named(idx, p.name).filter((r) => kinds.includes(r[1]) && (!st || r[2] === st) && (!p.city || !r[5] || norm(r[5]) === norm(p.city)));
      const best = rows.sort((a, b) => weight(b) - weight(a))[0];
      return best ? [best] : [];
    })
      // "near UCLA" → Westwood (and Los Angeles): keep the neighbourhood, drop the city that contains it.
      .filter((p, _, all) => !(["l", "c", "s"].includes(p[1]) && all.some((q) => q !== p && SMALL.has(q[1]) && inside(q, boxOf(p)))));
    if (!parts.length) {
      lastAsk = read?.ask || undefined;
      return undefined;
  }
  const label = (read?.label || raw).replace(/,\s*(US|USA|United States)$/i, "").slice(0, 60);
  return {
    status: "ok",
    id: placeFor(parts, label, data.outlines),
    label,
    detail: parts.length > 1 ? `${parts.length} places` : detailOf(parts[0], idx),
    read: parts.map(labelOf),
  };
  }

  function ok(r: PlaceRow): Resolution {
    return { status: "ok", id: placeFor([r], labelOf(r), data.outlines), label: labelOf(r), detail: detailOf(r, idx) };
  }
}
