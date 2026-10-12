import { getQloo } from "@/lib/qloo";
import { getStore } from "@/lib/store";
import { LIMITS, clientIp } from "@/lib/limits";
import { buildSeed, type SeedInput } from "@/lib/taste/seed";
import { DOMAINS, buildGraph, seedSignal, shortName, type Crowd, type Domain } from "@/lib/taste/graph";
import { crowdDetails } from "@/lib/taste/crowds";
import { nameCrowds } from "@/lib/taste/name";
import type { CrowdCard, CrowdsEvent, CrowdsResult, Love } from "@/lib/journey/types";
import type { Galaxy } from "@/lib/taste/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Crowd stop's engine (PRD §9.23): product → seed → taste graph → crowds with skew, cities and names.
// It starts as soon as the product is clear (§14.9), so it's usually ready when the founder reaches the stop.
// Streams short status lines, then one result. Cached per seed for 7 days, so a repeat brand is instant.

const TTL = 7 * 24 * 3600_000;

function readInput(raw: unknown): SeedInput {
  const b = (raw ?? {}) as Record<string, unknown>;
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, n);
  const brand = b.brand as { id?: unknown; name?: unknown } | undefined;
  return {
    brand: brand && typeof brand.id === "string" && typeof brand.name === "string" ? { id: brand.id.slice(0, 80), name: brand.name.slice(0, 120) } : undefined,
    comparables: strs(b.comparables, 5),
    lookalikes: strs(b.lookalikes, 5),
    traits: strs(b.traits, 5),
  };
}

const KIND: Record<Domain, Love["kind"]> = { brand: "brand", artist: "artist", tv_show: "TV", movie: "film", podcast: "podcast", book: "book" };

/**
 * Loves across domains, interleaved so a card shows brands, music, TV, film, podcasts and books, not ten brands. Within a
 * domain: the crowd's core members (placed more surely than shuffled data allows), most specific first (E3).
 */
function lovesOf(c: Crowd, n = 9): Love[] {
  const by = DOMAINS.map((d) => {
    const all = c.entities.filter((e) => e.domain === d);
    const central = all.filter((e) => e.core ?? true);
    return (central.length >= 2 ? central : all).sort((a, b) => (b.specificity ?? 0) - (a.specificity ?? 0));
  });
  const out: Love[] = [];
  for (let i = 0; out.length < n && i < 10; i++) for (const list of by) if (list[i] && out.length < n) out.push({ name: shortName(list[i].name, list[i].domain), kind: KIND[list[i].domain] });
  return out;
}

export async function POST(req: Request) {
  const input = readInput(await req.json().catch(() => ({})));
  const ip = clientIp(req);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CrowdsEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // The client went away.
        }
      };
      try {
        send({ type: "result", result: await run(input, ip, (text) => send({ type: "status", text }), (galaxy) => send({ type: "graph", galaxy })) });
      } catch (err) {
        // Never a failure state: the journey carries on without crowds.
        console.error("crowds failed", err);
        send({ type: "result", result: { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true } });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

async function run(input: SeedInput, ip: string, status: (t: string) => void, graphEvent: (g: Galaxy) => void): Promise<CrowdsResult> {
  // "v4.2": results from the probe-based graph (§9.23, v4.0) carry the Galaxy with null-calibrated cores and each
  // crowd's brand members (for Markets); older ones don't.
  const key = `v4.2|${JSON.stringify([input.brand?.id ?? "", [...input.comparables].sort(), [...input.lookalikes].sort(), [...input.traits].sort()]).toLowerCase()}`;
  const hit = await getStore().get<CrowdsResult>("crowds", key).catch(() => undefined);
  if (hit?.value?.crowds?.length) return hit.value;
  if (!LIMITS.ownBrand(ip).ok) return { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true };

  const t0 = Date.now();
  const qloo = process.env.ATHENA_DEBUG_QLOO ? getQloo().withLog((c) => console.log(`qloo +${Date.now() - t0}ms ${c.status} ${c.ms}ms ${c.cached ? "cached" : ""} ${c.params["filter.type"] ?? c.endpoint} ${c.params["filter.results.entities"] ? "pool" : ""}`)) : getQloo();
  status(input.brand ? `Reading ${input.brand.name}'s crowd in Qloo` : "Finding brands like yours in Qloo");
  const seed = await buildSeed(qloo, input);
  const graph = await buildGraph(qloo, seed, { onStep: status, onRound: graphEvent });
  // Report only the tags the graph actually used (they join the signal only when brands are scarce).
  const used = new Set(seedSignal(seed).tags);
  seed.tags = seed.tags.filter((t) => used.has(t.id));
  if (!graph.crowds.length) {
    return { seed: { brand: seed.brand, lookalikes: seed.lookalikes, tags: seed.tags, missing: seed.missing }, crowds: [], calls: seed.callIds.length + graph.calls, callIds: [...seed.callIds, ...graph.callIds], empty: true };
  }
  status(graph.crowds.length > 1 ? `Found ${graph.crowds.length} distinct crowds; checking where each one lives` : "Checking where this crowd lives");
  const [details, names] = await Promise.all([Promise.all(graph.crowds.map((c) => crowdDetails(qloo, c, { priority: c.main ? "now" : "next" }))), nameCrowds(graph.crowds)]);
  const crowds: CrowdCard[] = graph.crowds.map((c, i) => ({
    id: c.id,
    name: names[i],
    main: c.main,
    loves: lovesOf(c),
    signal: c.signal,
    brands: c.brands,
    skew: details[i].skew,
    cities: details[i].cities,
    size: c.entities.length,
    stability: c.stability,
    core: c.core,
  }));
  const callIds = [...seed.callIds, ...graph.callIds, ...details.flatMap((d) => d.callIds)];
  const result: CrowdsResult = { seed: { brand: seed.brand, lookalikes: seed.lookalikes, tags: seed.tags, missing: seed.missing }, crowds, calls: callIds.length, callIds, galaxy: graph.galaxy };
  await getStore().set("crowds", key, result, TTL).catch(() => undefined);
  return result;
}
