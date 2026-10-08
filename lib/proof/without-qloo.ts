import "server-only";
import { getStore } from "@/lib/store";
import { results, type QlooClient } from "@/lib/qloo/client";
import { generateStream, parseJson } from "@/lib/llm/vertex";
import { cleanVenue, nameSim, norm } from "@/lib/methods/names";
import { median } from "@/lib/methods/rank";
import { metroById } from "@/lib/playbook/metros";

// Without Qloo (§9.9, §10.2): the same question answered by Gemini 3.1 Pro with Google Search and no Qloo
// tools, then every venue checked against Qloo. Every metric is "demonstrated", never an accuracy claim.
// Demo brands' answers are cached with their date (the warm job fills them); other brands run on request.

export type LlmVenue = {
  name: string;
  address?: string;
  why?: string;
  status: "found" | "closed" | "unverified";
  qlooId?: string;
  popularity?: number;
  /** Athena's rank for this venue, when it's also in Athena's picks. */
  athenaRank?: number;
  lat?: number;
  lon?: number;
};

export type PlacesComparison = {
  metroId: string;
  model: string;
  ranAt: string;
  llm: LlmVenue[];
  metrics: {
    cantFindOrClosed: number; // share of chatbot venues unverified or closed
    mostObviousLlm: number; // share of found chatbot venues with popularity ≥ 0.95
    mostObviousAthena: number;
    medianPopLlm?: number;
    medianPopAthena?: number;
    evidenceAthena: number; // share of Athena picks with ≥ 2 Qloo evidence chips (always 1)
    evidenceLlm: number; // 0 by construction
    tasteFitMedianRank?: number; // chatbot's found venues, median rank in a shared pool with Athena's top 25
    poolSize?: number;
  };
};

export type ComparisonInput = {
  key: string; // cache key: brand slug or custom name
  brandName: string;
  whatYouSell: string;
  tier: string;
  metroId: string;
  channels: string[];
  signal: string[];
  athena: { id: string; name: string; popularity?: number; rank: number; evidence: number }[];
};

const NS = "comparisons";
const TTL = 7 * 24 * 60 * 60 * 1000;

async function cached(key: string): Promise<PlacesComparison | undefined> {
  return (await getStore().get<PlacesComparison>(NS, key))?.value;
}

async function store(key: string, c: PlacesComparison) {
  await getStore().set(NS, key, c, TTL);
}

/** §9.1-style check of one chatbot venue: found (with popularity), closed, or unverified. Never "fake". */
async function checkVenue(qloo: QlooClient, v: { name: string; address?: string }, metroQuery: string, center: [number, number]): Promise<Omit<LlmVenue, "why">> {
  const res = await qloo
    .search({ query: cleanVenue(v.name), types: "urn:entity:place", "filter.location": `${center[0]},${center[1]}`, "filter.radius": 40, take: 5 })
    .catch(() => undefined);
  const best = (res?.entities ?? [])
    .map((e) => ({ e, sim: nameSim(cleanVenue(v.name), e.name) }))
    .filter((x) => x.sim >= 0.85)
    .sort((a, b) => b.sim - a.sim)[0];
  if (!best) return { name: v.name, address: v.address, status: "unverified" };
  return { name: v.name, address: v.address ?? best.e.properties?.address, status: best.e.properties?.is_closed ? "closed" : "found", qlooId: best.e.entity_id, popularity: best.e.popularity, lat: best.e.location?.lat, lon: best.e.location?.lon };
}

export const comparisonKey = (key: string, metroId: string) => norm(`${key} ${metroId}`).replace(/ /g, "-");

/** The cached comparison for a brand and city, if one has run in the last 7 days. */
export function getCachedComparison(key: string, metroId: string): Promise<PlacesComparison | undefined> {
  return cached(comparisonKey(key, metroId));
}

export async function compareWithoutQloo(qloo: QlooClient, input: ComparisonInput, onStep: (step: string) => void): Promise<PlacesComparison> {
  const key = comparisonKey(input.key, input.metroId);
  const hit = await cached(key);
  if (hit) return hit;

  const metro = metroById(input.metroId);
  onStep("Asking a chatbot with Google Search, and no Qloo, the same question");
  const res = await generateStream(
    {
      model: "pro",
      grounding: true,
      thinking: "LOW",
      temperature: 1.0,
      maxOutputTokens: 8192, // thinking counts against this (9 Oct)
      timeoutMs: 120_000,
      prompt:
        `You help consumer brands find stockists and partner venues.\n` +
        `Brand: ${input.brandName}. What it sells: ${input.whatYouSell}. Price tier: ${input.tier}.\n` +
        `List the 20 best independent, open venues in ${metro.name} for this brand to approach first, from these types: ${input.channels.join(", ")}.\n` +
        `Reply with JSON only: [{"name": "...", "address": "street, city", "why": "≤ 12 words"}]`,
    },
    (t) => onStep(t),
  );
  const list = (parseJson<{ name?: string; address?: string; why?: string }[]>(res.text) ?? []).filter((v) => v.name).slice(0, 20);
  onStep(`Checking the chatbot's ${list.length} venues against Qloo`);
  const athenaById = new Map(input.athena.map((a) => [a.id, a]));
  const llm: LlmVenue[] = await Promise.all(
    list.map(async (v) => {
      const c = await checkVenue(qloo, { name: v.name!, address: v.address }, metro.query, metro.center);
      return { ...c, why: v.why, athenaRank: c.qlooId ? athenaById.get(c.qlooId)?.rank : undefined };
    }),
  );

  // Taste fit: the chatbot's found venues and Athena's top 25, scored together under Athena's signal (≤ 50).
  const found = llm.filter((v) => v.status === "found" && v.qlooId);
  let tasteFitMedianRank: number | undefined;
  let poolSize: number | undefined;
  if (found.length && input.signal.length) {
    onStep("Scoring both lists in one shared pool under your crowd's taste");
    const pool = [...new Set([...input.athena.slice(0, 25).map((a) => a.id), ...found.map((v) => v.qlooId!)])].slice(0, 50);
    const scored = await qloo
      .insights({ "filter.type": "urn:entity:place", "signal.interests.entities": input.signal, "filter.results.entities": pool, take: pool.length })
      .catch(() => undefined);
    const order = (scored ? (results(scored).entities ?? []) : []).map((e) => e.entity_id);
    // Unscored items tie below every scored item (§9.7).
    const rankOf = (id: string) => (order.includes(id) ? order.indexOf(id) + 1 : order.length + 1);
    tasteFitMedianRank = median(found.map((v) => rankOf(v.qlooId!)));
    poolSize = pool.length;
  }

  const share = (n: number, d: number) => (d ? n / d : 0);
  const athenaPop = input.athena.map((a) => a.popularity).filter((p): p is number => typeof p === "number");
  const llmPop = found.map((v) => v.popularity).filter((p): p is number => typeof p === "number");
  const comparison: PlacesComparison = {
    metroId: metro.id,
    model: res.model,
    ranAt: new Date().toISOString(),
    llm,
    metrics: {
      cantFindOrClosed: share(llm.filter((v) => v.status !== "found").length, llm.length),
      mostObviousLlm: share(llmPop.filter((p) => p >= 0.95).length, llmPop.length),
      mostObviousAthena: share(athenaPop.filter((p) => p >= 0.95).length, athenaPop.length),
      medianPopLlm: median(llmPop),
      medianPopAthena: median(athenaPop),
      evidenceAthena: share(input.athena.filter((a) => a.evidence >= 2).length, input.athena.length),
      evidenceLlm: 0,
      tasteFitMedianRank,
      poolSize,
    },
  };
  if (llm.length) await store(key, comparison);
  return comparison;
}
