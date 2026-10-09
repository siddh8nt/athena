import "server-only";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import type { Crowd } from "./graph";
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
