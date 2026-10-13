import { getQloo } from "@/lib/qloo";
import { LIMITS, clientIp } from "@/lib/limits";
import { MAX_SIGNAL } from "@/lib/journey/weights";
import { MAX_TAKE } from "@/lib/qloo/client";
import { contributions, type Contribution } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Taste-axis sliders (§9.27): re-rank a stop's current list under the leaned signal, in one Qloo call. The list is a
// fixed pool (filter.results.entities), so the answer is the same items in a new order, comparable as percentiles.
// Qloo's client caches each call, so a slider position already seen costs nothing.

const TYPES = new Set(["brand", "place", "podcast", "artist", "tv_show", "movie", "book"]);

export type LeanResult = { order: string[]; affinity: Record<string, number>; why?: Record<string, Contribution[]>; callId?: string; note?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const type = typeof body.type === "string" && TYPES.has(body.type) ? body.type : undefined;
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)))].slice(0, MAX_TAKE);
  const signal = (Array.isArray(body.signal) ? body.signal : [])
    .slice(0, MAX_SIGNAL)
    .map((x) => x as { id?: unknown; weight?: unknown })
    .filter((x): x is { id: string; weight: number } => typeof x.id === "string" && typeof x.weight === "number" && x.weight > 0 && x.weight <= 10)
    .map((x) => ({ id: x.id.slice(0, 80), weight: x.weight }));
  if (!type || ids.length < 2 || !signal.length) return Response.json({ error: "A type, at least two items and a signal are required" }, { status: 400 });
  const keep: LeanResult = { order: ids, affinity: {} };
  const cap = LIMITS.lean(clientIp(req));
  if (!cap.ok) return Response.json({ ...keep, note: cap.message });
  try {
    const res = await getQloo().insightsWeighted({ "filter.type": `urn:entity:${type}`, "filter.results.entities": ids, "feature.explainability": true, take: ids.length }, signal);
    const scored = (res.results.entities ?? []).filter((e) => ids.includes(e.entity_id));
    const seen = new Set(scored.map((e) => e.entity_id));
    // Items Qloo didn't score keep their place order, after the scored ones (as everywhere else, §9.4).
    const order = [...scored.map((e) => e.entity_id), ...ids.filter((id) => !seen.has(id))];
    const affinity = Object.fromEntries(scored.map((e) => [e.entity_id, Math.round((e.query?.affinity ?? 0) * 1000) / 1000]));
    const why = Object.fromEntries(scored.map((e) => [e.entity_id, contributions(e)]));
    return Response.json({ order, affinity, why, callId: res.call.id } satisfies LeanResult);
  } catch (err) {
    // Never a failure state: the list keeps the order it had.
    console.error("lean failed", err);
    return Response.json({ ...keep, note: "Qloo is busy, so the list keeps its order for now. Move the slider again in a moment." });
  }
}
