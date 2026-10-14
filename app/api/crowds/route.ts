import { getQloo } from "@/lib/qloo";
import { LIMITS, clientIp } from "@/lib/limits";
import type { SeedInput } from "@/lib/taste/seed";
import { MAX_EXTRA, type Galaxy } from "@/lib/taste/graph";
import { baseKey, cachedCrowds, measure, probeCrowds, storedExtras } from "@/lib/taste/engine";
import type { CrowdsEvent, CrowdsResult } from "@/lib/journey/types";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The Crowd stop's engine (PRD §9.23): product → seed → taste graph → crowds with skew, cities and names.
// It starts as soon as the product is clear (§14.9), so it's usually ready when the founder reaches the stop.
// Streams short status lines, then one result. Cached per seed for 7 days, so a repeat brand is instant.

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

export const POST = dated(async function post(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const input = readInput(raw);
  const probes = readProbes(raw);
  // Taste axes and crowd meetings for crowds a founder already has (§9.27, §9.28): from the stored graph only, never measured.
  if ((raw as { axesOnly?: unknown } | null)?.axesOnly === true) return Response.json((await storedExtras(baseKey(input), probes)) ?? {});
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
});

const EMPTY: CrowdsResult = { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true };

async function run(input: SeedInput, probes: string[], ip: string, status: (t: string) => void, graphEvent: (g: Galaxy) => void): Promise<CrowdsResult> {
  const hit = await cachedCrowds(input, probes);
  if (hit) return hit;

  const t0 = Date.now();
  const qloo = process.env.ATHENA_DEBUG_QLOO ? getQloo().withLog((c) => console.log(`qloo +${Date.now() - t0}ms ${c.status} ${c.ms}ms ${c.cached ? "cached" : ""} ${c.params["filter.type"] ?? c.endpoint} ${c.params["filter.results.entities"] ? "pool" : ""}`)) : getQloo();

  if (probes.length) {
    // Click to probe: the founder's entities join the stored graph as landmarks. Past the cap, the map stays as it was.
    const cap = LIMITS.probe(ip);
    if (!cap.ok) {
      status(cap.message);
      return (await cachedCrowds(input, probes.slice(0, -1))) ?? (await cachedCrowds(input)) ?? run(input, [], ip, status, graphEvent);
    }
    return (await probeCrowds(qloo, input, probes, status, graphEvent)) ?? (await cachedCrowds(input)) ?? EMPTY;
  }

  if (!LIMITS.ownBrand(ip).ok) return EMPTY;
  return (await measure(qloo, input, baseKey(input), status, graphEvent)).result;
}
