import { getQloo } from "@/lib/qloo";
import { LIMITS, clientIp } from "@/lib/limits";
import { nextRetailers } from "@/lib/stops/retailers";
import { onlineStop } from "@/lib/stops/online";
import { MAX_SIGNAL } from "@/lib/journey/weights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The journey's stops that sit outside the six blocks (§9.24, §9.25): Next retailers and Online. Each takes the
// chosen crowd's signal and returns its data in one response (a few Qloo calls, a few seconds).

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  // The signal is ids, or weighted ids from the founder's reactions (§9.23 step 7).
  const raw = (Array.isArray(body.signal) ? body.signal : []).slice(0, MAX_SIGNAL);
  const weighted = raw
    .map((x) => (typeof x === "string" ? { id: x, weight: 1 } : (x as { id?: unknown; weight?: unknown })))
    .filter((x): x is { id: string; weight: unknown } => typeof x.id === "string")
    .map((x) => ({ id: x.id.slice(0, 80), weight: typeof x.weight === "number" && x.weight > 0 && x.weight <= 10 ? x.weight : 1 }));
  const signal = weighted.map((x) => x.id);
  const product = typeof body.product === "string" ? body.product.slice(0, 400) : "";
  const evidence = (Array.isArray(body.evidence) ? body.evidence : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 300);
  if (!signal.length || (kind !== "retailers" && kind !== "online")) return Response.json({ error: "A crowd signal and a stop are required" }, { status: 400 });
  const cap = LIMITS.rerun(clientIp(req));
  if (!cap.ok) return Response.json({ note: cap.message });
  const base = getQloo();
  const qloo = weighted.some((x) => x.weight !== 1) ? base.withWeights(new Map(weighted.map((x) => [x.id, x.weight]))) : base;
  try {
    return Response.json(kind === "retailers" ? await nextRetailers(qloo, signal, evidence, product) : await onlineStop(qloo, signal));
  } catch (err) {
    // Never a failure state: an empty stop says what it would need.
    console.error(`stop ${kind} failed`, err);
    return Response.json(kind === "retailers" ? { picks: [], already: [], calls: 0, callIds: [] } : { creators: [], podcasts: [], interests: [], calls: 0, callIds: [] });
  }
}
