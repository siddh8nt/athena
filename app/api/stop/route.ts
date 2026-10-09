import { getQloo } from "@/lib/qloo";
import { LIMITS, clientIp } from "@/lib/limits";
import { nextRetailers } from "@/lib/stops/retailers";
import { onlineStop } from "@/lib/stops/online";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The journey's stops that sit outside the six blocks (§9.24, §9.25): Next retailers and Online. Each takes the
// chosen crowd's signal and returns its data in one response (a few Qloo calls, a few seconds).

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  const signal = (Array.isArray(body.signal) ? body.signal : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 12);
  const product = typeof body.product === "string" ? body.product.slice(0, 400) : "";
  const evidence = (Array.isArray(body.evidence) ? body.evidence : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 300);
  if (!signal.length || (kind !== "retailers" && kind !== "online")) return Response.json({ error: "A crowd signal and a stop are required" }, { status: 400 });
  const cap = LIMITS.rerun(clientIp(req));
  if (!cap.ok) return Response.json({ note: cap.message });
  const qloo = getQloo();
  try {
    return Response.json(kind === "retailers" ? await nextRetailers(qloo, signal, evidence, product) : await onlineStop(qloo, signal));
  } catch (err) {
    // Never a failure state: an empty stop says what it would need.
    console.error(`stop ${kind} failed`, err);
    return Response.json(kind === "retailers" ? { picks: [], already: [], calls: 0, callIds: [] } : { creators: [], podcasts: [], interests: [], calls: 0, callIds: [] });
  }
}
