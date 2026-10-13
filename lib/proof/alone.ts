import "server-only";
import { createHash } from "node:crypto";
import { getStore } from "@/lib/store";
import { generate, parseJson } from "@/lib/llm/vertex";
import { LLM_SYSTEM, brandLine, llmPrompt, shuffled, type Item, type Profile } from "@/lib/bench/arms";
import { METROS, metroById } from "@/lib/playbook/metros";

// With / Without on every stop (§13.2): the stop's question put to Gemini alone, with no Qloo. Where and Next retailers
// use the Taste Bench's registered prompts over the same candidates (§10.6), so the split shows the Bench's LLM arm;
// the other stops ask the same question in plain words. One answer per question, cached 7 days. Nothing here is a
// measurement: the measured comparison is the Bench line under the stop.

export type AloneStop = "crowd" | "where" | "retailers" | "partners" | "online" | "message" | "moments";
export const ALONE_STOPS: AloneStop[] = ["crowd", "where", "retailers", "partners", "online", "message", "moments"];

export type AloneItem = { name: string; why?: string; id?: string };
export type AloneAnswer = { stop: AloneStop; model: string; ranAt: string; items: AloneItem[]; headline?: string; search: boolean };

export type AloneInput = {
  stop: AloneStop;
  brand: string;
  product: string;
  tier?: string;
  /** The stop's city (Moments). */
  metroId?: string;
  /** Next retailers: the retailers Athena ranked, so both answer over the same list. */
  candidates?: Item[];
};

const NS = "alone";
const TTL = 7 * 24 * 3600_000;

export function aloneKey(input: AloneInput): string {
  const h = createHash("sha256").update(JSON.stringify([input.stop, input.brand, input.product, input.tier, input.metroId, input.candidates?.map((c) => c.id)])).digest("hex");
  return `v1|${input.stop}|${h.slice(0, 24)}`;
}

export async function cachedAlone(input: AloneInput): Promise<AloneAnswer | undefined> {
  return (await getStore().get<AloneAnswer>(NS, aloneKey(input)).catch(() => undefined))?.value;
}

const head = (i: AloneInput) => `${brandLine("known", { description: i.product } as Profile, i.brand)}${i.tier ? ` Price tier: ${i.tier}.` : ""}`;

/** The open questions, in the words the founder sees at each stop. JSON asked for in a fixed shape. */
function openPrompt(i: AloneInput): { prompt: string; search: boolean } {
  const h = head(i);
  const city = i.metroId ? metroById(i.metroId).name : "the US";
  switch (i.stop) {
    case "crowd":
      return { search: false, prompt: `${h}\n\nQuestion: who are this product's customers? Describe the 3 groups of US consumers most likely to love it, strongest first. For each, give a short name and 6 specific brands, artists, TV shows or podcasts that group loves.\n\nReturn JSON: {"items": [{"name": "...", "loves": ["...", "..."]}]}` };
    case "partners":
      return { search: false, prompt: `${h}\n\nQuestion: which 10 US brands and podcasts should this brand partner with (collaborations, co-marketing, sponsorships)? Best first.\n\nReturn JSON: {"items": [{"name": "...", "kind": "brand" or "podcast", "why": "at most 12 words"}]}` };
    case "online":
      return { search: false, prompt: `${h}\n\nQuestion: online, which 8 creators and podcasts do this product's customers follow, and which 5 interests should it target in ads? Best first.\n\nReturn JSON: {"items": [{"name": "...", "kind": "creator", "podcast" or "ad interest", "why": "at most 12 words"}]}` };
    case "message":
      return { search: false, prompt: `${h}\n\nQuestion: how should this brand talk to its customers? Give its positioning angle in one sentence, then 5 themes to talk about and 3 TV shows, films, artists or books its customers love, to reference.\n\nReturn JSON: {"angle": "...", "items": [{"name": "...", "kind": "theme" or "reference", "why": "at most 12 words"}]}` };
    case "moments":
      return { search: true, prompt: `${h}\n\nQuestion: which 8 dated events in ${city} in the next 6 months (concerts, festivals, fairs) should this brand show up at? Soonest first. Today is ${new Date().toISOString().slice(0, 10)}.\n\nReply with JSON only: {"items": [{"name": "...", "date": "YYYY-MM-DD", "why": "at most 12 words"}]}` };
    default:
      throw new Error(`no open question for ${i.stop}`);
  }
}

type OpenRow = { name?: unknown; loves?: unknown; kind?: unknown; why?: unknown; date?: unknown };
const s = (x: unknown, n = 120) => (typeof x === "string" ? x.trim().slice(0, n) : "");

function openItems(stop: AloneStop, rows: OpenRow[]): AloneItem[] {
  return rows
    .map((r) => {
      const name = s(r.name);
      if (stop === "crowd") return { name, why: Array.isArray(r.loves) ? r.loves.map((x) => s(x, 60)).filter(Boolean).slice(0, 8).join(", ") : "" };
      const why = [stop === "moments" ? s(r.date, 20) : s(r.kind, 20), s(r.why)].filter(Boolean).join(" · ");
      return { name, why };
    })
    .filter((x) => x.name)
    .slice(0, 12);
}

/** Asks Gemini alone, caches the answer, and returns it. An empty list means no usable answer this time. */
export async function askAlone(input: AloneInput): Promise<AloneAnswer> {
  const hit = await cachedAlone(input);
  if (hit) return hit;
  const ranked = input.stop === "where" || input.stop === "retailers";
  let items: AloneItem[] = [];
  let headline: string | undefined;
  let model = "";
  let search = false;
  if (ranked) {
    // The Bench's LLM arm: the registered prompt over the same candidates, shown in a seeded order.
    const pool: Item[] = input.stop === "where" ? METROS.map((m) => ({ id: m.id, label: m.name })) : (input.candidates ?? []);
    if (pool.length < 2) return { stop: input.stop, model: "", ranAt: new Date().toISOString(), items: [], search };
    const shown = shuffled(pool, `${input.brand}|${input.stop}`);
    const res = await generate({ model: "pro", system: LLM_SYSTEM, prompt: llmPrompt(input.stop === "where" ? "t1" : "t2", head(input), shown), json: true, thinking: "LOW", maxOutputTokens: 8192, budgetMs: 90_000 });
    model = res.model;
    const order = (parseJson<{ ranking?: unknown[] }>(res.text)?.ranking ?? []).map((x) => shown[Number(x) - 1]).filter((x): x is Item => !!x);
    items = [...new Map(order.map((x) => [x.id, x])).values()].map((x) => ({ id: x.id, name: x.label }));
  } else {
    const q = openPrompt(input);
    search = q.search;
    const res = await generate({ model: "pro", prompt: q.prompt, grounding: q.search, json: true, thinking: "LOW", maxOutputTokens: 8192, budgetMs: 90_000 });
    model = res.model;
    const j = parseJson<{ items?: OpenRow[]; angle?: unknown }>(res.text);
    items = openItems(input.stop, Array.isArray(j?.items) ? j.items : []);
    headline = s(j?.angle, 300) || undefined;
  }
  const answer: AloneAnswer = { stop: input.stop, model, ranAt: new Date().toISOString(), items, headline, search };
  if (items.length) await getStore().set(NS, aloneKey(input), answer, TTL).catch(() => undefined);
  return answer;
}
