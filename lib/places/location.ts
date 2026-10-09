import type { Metro } from "@/lib/playbook/metros";
import type { QlooParams } from "@/lib/qloo/types";
import { loadOutlines, loadPlaces } from "./data";
import { resolvePlace, type Interpret, type Interpretation, type Resolution } from "./resolve";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";

// Where Qloo searches (PRD §9.3). Named and Qloo-labelled metros go by name, as before. A place the founder typed
// goes as its real area (WKT): states and counties by their outline, everything else by its box. Verified 10 Oct:
// heatmaps, venues and festivals all accept WKT polygons and multipolygons.

/** Longer WKT than this goes as the bounding box instead. Long areas are sent as POST (the client switches). */
const MAX_WKT = 40_000;

const boxWkt = (b: Metro["bbox"]) => `((${b[0]} ${b[1]},${b[2]} ${b[1]},${b[2]} ${b[3]},${b[0]} ${b[3]},${b[0]} ${b[1]}))`;

/** "POLYGON((…))" or "MULTIPOLYGON(((…)),((…)))" → its polygon bodies "((…))". */
function bodies(wkt: string): string[] {
  const t = wkt.trim();
  if (t.startsWith("MULTIPOLYGON")) {
    const inner = t.slice(t.indexOf("(") + 1, t.lastIndexOf(")"));
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") depth === 0 && (start = i), depth++;
      else if (inner[i] === ")" && --depth === 0) out.push(inner.slice(start, i + 1));
    }
    return out;
  }
  if (t.startsWith("POLYGON")) return [t.slice(t.indexOf("("))];
  return [];
}

export async function areaWkt(m: Pick<Metro, "area" | "bbox">): Promise<string> {
  const outlines = await loadOutlines().catch(() => ({}) as Record<string, string>);
  const polys = (m.area ?? []).flatMap((part) => {
    if (part.startsWith("o:")) return bodies(outlines[part.slice(2)] ?? "");
    if (part.startsWith("b:")) {
      const b = part.slice(2).split(",").map(Number);
      return b.length === 4 && b.every(Number.isFinite) ? [boxWkt(b as Metro["bbox"])] : [];
    }
    return [];
  });
  const wkt = polys.length === 1 ? `POLYGON${polys[0]}` : polys.length ? `MULTIPOLYGON(${polys.join(",")})` : "";
  return wkt && wkt.length <= MAX_WKT ? wkt : `POLYGON${boxWkt(m.bbox)}`;
}

/** The location parameters for a Qloo call scoped to this metro or place. */
export async function locationParams(m: Metro): Promise<QlooParams> {
  if (!m.area?.length) return { "filter.location.query": m.query };
  return { "filter.location": await areaWkt(m) };
}

const SYSTEM = `A founder typed a US location. Turn it into real, named US places that maps use.
Return JSON only: {"label": short display name, "parts": ["name|kind|ST" or "name|neighborhood|ST|city", ...], "ask": a short question if you can't tell}.
kind is state, county, city, neighborhood or zip; ST is the two-letter state code. Example part: "Alameda County|county|CA".
- A region ("Bay Area", "Pacific Northwest", "the Midwest", "Northern California", "Tri-State Area"): list every state it covers, or, when it's part of a state, every county in it, by official name ("Alameda County"). At most 60.
- A landmark, campus or venue ("near UCLA", "by Wrigley Field"): the neighborhood it's in, with its city.
- A misspelling ("Clevland"): the place meant.
- Outside the US, or too vague to place: no parts, and an "ask".
Never invent a place.`;

/**
 * The model's reading of an informal place (Flash-Lite). Usually 1–2 s, but Vertex's tail ran past 20 s on 10 Oct,
 * so two identical requests race and the first good answer wins. Readings are kept per text for the instance.
 */
const readings = new Map<string, Promise<Interpretation | undefined>>();
export const interpretPlace: Interpret = (text) => {
  const key = text.trim().toLowerCase();
  const hit = readings.get(key);
  if (hit) return hit;
  const once = async () => {
    const res = await generate({ model: "lite", json: true, thinking: "MINIMAL", temperature: 0, maxOutputTokens: 2000, budgetMs: 18_000, system: SYSTEM, prompt: `Location: ${text.slice(0, 120)}` });
    const raw = parseJson<{ label?: string; parts?: (string | Interpretation["parts"][number])[]; ask?: string }>(res.text);
    if (!raw) throw new Error("unreadable");
    // Parts come as compact "name|kind|ST|city" strings (fewer tokens, so long county lists stay fast).
    const parts = (raw.parts ?? []).flatMap((p) => {
      if (typeof p !== "string") return p?.name ? [p] : [];
      const [name, kind, state, city] = p.split("|").map((x) => x.trim());
      return name ? [{ name, kind: kind ?? "", state, city }] : [];
    });
    return { label: raw.label, parts, ask: raw.ask };
  };
  const p = Promise.any([once(), once()]).catch(() => undefined);
  readings.set(key, p);
  if (readings.size > 500) readings.delete(readings.keys().next().value!);
  void p.then((r) => r || readings.delete(key));
  return p;
};

/** Resolve a typed location with the local data, and the model only for informal places. */
export async function resolveTyped(text: string): Promise<Resolution> {
  const [rows, outlines] = await Promise.all([loadPlaces(), loadOutlines()]);
  return resolvePlace(text, { rows, outlines: new Set(Object.keys(outlines)) }, llmConfigured() ? interpretPlace : undefined);
}
