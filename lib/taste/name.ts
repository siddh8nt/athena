import "server-only";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import type { Crowd } from "./graph";
import type { Axis } from "./axes";
import { fallbackName, validName } from "./crowds";

// Crowd names (PRD §9.23 step 5): the agent writes a 2–4 word name from only the crowd's own entities and Qloo
// tags; the validator rejects any word that isn't there, and the fallback ("The Great Jones crowd") is always valid.

const SYSTEM = `You name taste crowds for a growth planner. Each crowd is a set of brands, artists and TV shows that the same people love, from Qloo's taste graph.
Give each crowd a short, vivid name of 2-4 words that a founder would instantly get, like "Indie folk home cooks" or "Emo rap streetwear".
Use ONLY words that appear in that crowd's entity names or tags below (plural or singular is fine). Don't use words that aren't there. Never describe people by age, gender, ethnicity, religion, politics or health.
Return JSON only: {"names": ["name for crowd 1", "name for crowd 2", ...]}`;

export async function nameCrowds(crowds: Crowd[]): Promise<string[]> {
  const fallback = crowds.map(fallbackName);
  if (!crowds.length || !llmConfigured()) return fallback;
  const listing = crowds
    .map((c, i) => {
      const ents = c.entities.slice(0, 12).map((n) => `${n.name} (${n.domain === "tv_show" ? "TV" : n.domain})`).join(", ");
      const tags = [...new Set(c.entities.flatMap((n) => n.tags))].slice(0, 30).join(", ");
      return `Crowd ${i + 1}: ${ents}\nTags: ${tags}`;
    })
    .join("\n\n");
  try {
    const res = await generate({ model: "lite", json: true, temperature: 0.4, maxOutputTokens: 400, budgetMs: 12_000, system: SYSTEM, prompt: listing });
    const names = parseJson<{ names?: unknown[] }>(res.text)?.names ?? [];
    return crowds.map((c, i) => {
      const n = typeof names[i] === "string" ? (names[i] as string).trim().replace(/[."]+$/g, "").slice(0, 48) : "";
      return n && validName(n, c) ? n : fallback[i];
    });
  } catch {
    return fallback;
  }
}

const AXIS_SYSTEM = `You name taste axes for a growth planner. Each axis is a direction of taste in Qloo's taste graph: the brands, artists and TV shows listed load most on it, so a founder can lean their plan toward it or away from it.
Give each axis a short name of 2-4 words a founder would instantly get, like "Natural wine and ceramics" or "Streetwear and rap". Name what the axis is about, not who the people are.
Use ONLY words that appear in that axis's entity names or tags below (plural or singular is fine). Make the names different from each other. Never describe people by age, gender, ethnicity, religion, politics or health.
Return JSON only: {"names": ["name for axis 1", "name for axis 2", ...]}`;

/** Axis names (§9.27): from each axis's top-loading entities and their tags only, under the same validator; else "Axis N". */
export async function nameAxes(axes: Axis[]): Promise<{ name: string; named: boolean }[]> {
  const fallback = axes.map((_, i) => ({ name: `Axis ${i + 1}`, named: false }));
  if (!axes.length || !llmConfigured()) return fallback;
  const listing = axes
    .map((a, i) => {
      const ents = a.top.map((n) => `${n.name} (${n.domain === "tv_show" ? "TV" : n.domain})`).join(", ");
      const tags = [...new Set(a.top.flatMap((n) => n.tags))].slice(0, 30).join(", ");
      return `Axis ${i + 1}: ${ents}\nTags: ${tags}`;
    })
    .join("\n\n");
  try {
    const res = await generate({ model: "lite", json: true, temperature: 0.4, maxOutputTokens: 400, budgetMs: 12_000, system: AXIS_SYSTEM, prompt: listing });
    const names = parseJson<{ names?: unknown[] }>(res.text)?.names ?? [];
    const seen = new Set<string>();
    return axes.map((a, i) => {
      const n = typeof names[i] === "string" ? (names[i] as string).trim().replace(/[."]+$/g, "").slice(0, 48) : "";
      if (!n || seen.has(n.toLowerCase()) || !validName(n, { entities: a.top })) return fallback[i];
      seen.add(n.toLowerCase());
      return { name: n, named: true };
    });
  } catch {
    return fallback;
  }
}
