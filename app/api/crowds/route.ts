import { getQloo } from "@/lib/qloo";
import { getStore } from "@/lib/store";
import { LIMITS, clientIp } from "@/lib/limits";
import { buildSeed, type SeedInput } from "@/lib/taste/seed";
import { DOMAINS, MAX_EXTRA, buildGraph, extendGraph, seedSignal, shortName, type Crowd, type Domain, type GraphState, type TasteGraph } from "@/lib/taste/graph";
import type { QlooClient } from "@/lib/qloo/client";
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

/** Click to probe (§13.11): the Qloo ids the founder probed, in order, at most MAX_EXTRA. */
function readProbes(raw: unknown): string[] {
  const p = (raw as { probes?: unknown } | null)?.probes;
  return (Array.isArray(p) ? p : []).filter((x): x is string => typeof x === "string" && /^[\w:-]{1,80}$/.test(x)).slice(0, MAX_EXTRA);
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
  const raw = await req.json().catch(() => ({}));
  const input = readInput(raw);
  const probes = readProbes(raw);
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
        send({ type: "result", result: await run(input, probes, ip, (text) => send({ type: "status", text }), (galaxy) => send({ type: "graph", galaxy })) });
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

/** The measured graph behind a result, kept so click to probe adds one landmark instead of re-measuring (§13.11). */
type SavedGraph = { state: GraphState; seed: CrowdsResult["seed"]; seedCallIds: string[] };

async function run(input: SeedInput, probes: string[], ip: string, status: (t: string) => void, graphEvent: (g: Galaxy) => void): Promise<CrowdsResult> {
  // "v4.2": results from the probe-based graph (§9.23, v4.0) carry the Galaxy with null-calibrated cores and each
  // crowd's brand members (for Markets); older ones don't.
  const base = `v4.2|${JSON.stringify([input.brand?.id ?? "", [...input.comparables].sort(), [...input.lookalikes].sort(), [...input.traits].sort()]).toLowerCase()}`;
  const keyOf = (p: string[]) => (p.length ? `${base}|probe:${p.join(",")}` : base);
  const cached = async (p: string[]) => (await getStore().get<CrowdsResult>("crowds", keyOf(p)).catch(() => undefined))?.value;
  const hit = await cached(probes);
  if (hit?.crowds?.length) return hit;

  const t0 = Date.now();
  const qloo = process.env.ATHENA_DEBUG_QLOO ? getQloo().withLog((c) => console.log(`qloo +${Date.now() - t0}ms ${c.status} ${c.ms}ms ${c.cached ? "cached" : ""} ${c.params["filter.type"] ?? c.endpoint} ${c.params["filter.results.entities"] ? "pool" : ""}`)) : getQloo();

  if (probes.length) {
    // Click to probe: the founder's entities join the stored graph as landmarks. Past the cap, the map stays as it was.
    const cap = LIMITS.probe(ip);
    if (!cap.ok) {
      status(cap.message);
      return (await cached(probes.slice(0, -1))) ?? (await cached([])) ?? run(input, [], ip, status, graphEvent);
    }
    // A result cached before its graph was kept: measure it again (Qloo's own cache makes repeat calls free for a day).
    const saved = (await getStore().get<SavedGraph>("graph", base).catch(() => undefined))?.value ?? (await measure(qloo, input, base, status, () => undefined)).saved;
    if (!saved) return (await cached([])) ?? { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true };
    const graph = await extendGraph(qloo, saved.state, probes, { onStep: status });
    if (graph.galaxy) graphEvent(graph.galaxy);
    const result = await resultOf(qloo, graph, saved.seed, saved.seedCallIds, status);
    if (result.crowds.length) await getStore().set("crowds", keyOf(probes), result, TTL).catch(() => undefined);
    return result;
  }

  if (!LIMITS.ownBrand(ip).ok) return { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true };
  return (await measure(qloo, input, base, status, graphEvent)).result;
}

/** Seed → taste graph → crowd cards; the result and its graph are stored for a week. */
async function measure(qloo: QlooClient, input: SeedInput, base: string, status: (t: string) => void, graphEvent: (g: Galaxy) => void): Promise<{ result: CrowdsResult; saved?: SavedGraph }> {
  status(input.brand ? `Reading ${input.brand.name}'s crowd in Qloo` : "Finding brands like yours in Qloo");
  const seed = await buildSeed(qloo, input);
  const graph = await buildGraph(qloo, seed, { onStep: status, onRound: graphEvent });
  // Report only the tags the graph actually used (they join the signal only when brands are scarce).
  const used = new Set(seedSignal(seed).tags);
  seed.tags = seed.tags.filter((t) => used.has(t.id));
  const seedOut = { brand: seed.brand, lookalikes: seed.lookalikes, tags: seed.tags, missing: seed.missing };
  const result = await resultOf(qloo, graph, seedOut, seed.callIds, status);
  const saved: SavedGraph | undefined = graph.state ? { state: graph.state, seed: seedOut, seedCallIds: seed.callIds } : undefined;
  if (result.crowds.length) {
    await getStore().set("crowds", base, result, TTL).catch(() => undefined);
    if (saved) await getStore().set<SavedGraph>("graph", base, saved, TTL).catch(() => undefined);
  }
  return { result, saved };
}

/** Each crowd's card: its skew and cities (2 calls each) and its name (the agent, under the validator). */
async function resultOf(qloo: QlooClient, graph: TasteGraph, seed: CrowdsResult["seed"], seedCallIds: string[], status: (t: string) => void): Promise<CrowdsResult> {
  if (!graph.crowds.length) return { seed, crowds: [], calls: seedCallIds.length + graph.calls, callIds: [...seedCallIds, ...graph.callIds], empty: true };
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
  const callIds = [...seedCallIds, ...graph.callIds, ...details.flatMap((d) => d.callIds)];
  return { seed, crowds, calls: callIds.length, callIds, galaxy: graph.galaxy, probes: graph.state?.extra.length ? graph.state.extra : undefined };
}
