import "server-only";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import type { Crowd } from "./graph";
import type { Axis } from "./axes";
import { candidatesOf, validName } from "./crowds";
import { checkPicks, type Candidate, type CrowdName, type NamePick } from "./naming";
import type { CrowdCard } from "@/lib/journey/types";

// Crowd names (PRD §23.8 a): the agent names each crowd after two of its own core members a founder would recognise,
// with one sentence on what they share; naming.ts checks the picks (both on the crowd's list, short forms from their
// names, no member naming two crowds) and falls back to the strongest members.

const SYSTEM = `You name taste crowds for the founder of a consumer brand. A crowd is a group of people whose tastes overlap: the brands, artists, TV shows, films, podcasts and books listed under it are what they love, from Qloo's taste graph, most widely known first.
For each crowd, in order:
- "after": the two things from THAT crowd's list a founder would recognise fastest, copied exactly as listed. Prefer household names over niche ones, and two different kinds (a brand and a show, say) when the list allows.
- "short": how people say each of those two in conversation, using only words from its listed name ("Rachel Hollis" for "The Rachel Hollis Podcast"); the listed name when it's already short.
- "shared": one plain sentence of at most 14 words on what these people seem to have in common, read from the whole list and its tags: their tastes and habits, like "Wellness routines, small-town TV dramas and country radio." Start with what they love, not "These people" or "This crowd". Never age, gender, ethnicity, religion, politics or health.
Return JSON only: {"crowds": [{"after": ["…", "…"], "short": ["…", "…"], "shared": "…"}, …]}`;

async function named(lists: { cands: Candidate[]; tags: string[] }[]): Promise<CrowdName[]> {
  const cands = lists.map((l) => l.cands);
  if (!lists.length || !llmConfigured()) return checkPicks([], cands);
  const listing = lists
    .map((l, i) => `Crowd ${i + 1}: ${l.cands.map((c) => `${c.name} (${c.kind})`).join(", ")}${l.tags.length ? `\nTags: ${l.tags.join(", ")}` : ""}`)
    .join("\n\n");
  try {
    const res = await generate({ model: "lite", json: true, temperature: 0.3, maxOutputTokens: 700, budgetMs: 12_000, system: SYSTEM, prompt: listing });
    const picks = parseJson<{ crowds?: NamePick[] }>(res.text)?.crowds ?? [];
    return checkPicks(picks, cands);
  } catch {
    return checkPicks([], cands);
  }
}

/** Names for freshly measured crowds, from their core members and tags. */
export function nameCrowds(crowds: Crowd[]): Promise<CrowdName[]> {
  return named(crowds.map((c) => ({ cands: candidatesOf(c), tags: [...new Set(c.entities.flatMap((n) => n.tags))].slice(0, 30) })));
}

/** Names for crowd cards cached before §23.8: from the loves they already carry (no tags, no Qloo calls). */
export function nameCards(cards: CrowdCard[]): Promise<CrowdName[]> {
  return named(cards.map((c) => ({ cands: c.loves.map((l) => ({ name: l.name, kind: l.kind })), tags: [] })));
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
