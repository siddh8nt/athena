import { getQloo } from "@/lib/qloo";
import { getStore } from "@/lib/store";
import { LIMITS, clientIp } from "@/lib/limits";
import { crowdGeography, type CrowdIn } from "@/lib/geo/geography";
import type { Geography } from "@/lib/geo/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Crowd geography (§9.26): where each crowd lives across the US. One heatmap call per crowd (about 10 s, in
// parallel), then the statistics. Cached per set of crowd signals for 7 days; a cached map costs nothing.

const TTL = 7 * 24 * 3600_000;
const MAX_CROWDS = 4;
const MAX_SIGNAL = 10;

function readCrowds(raw: unknown): CrowdIn[] {
  const list = (raw as { crowds?: unknown } | null)?.crowds;
  return (Array.isArray(list) ? list : [])
    .slice(0, MAX_CROWDS)
    .map((c) => (c ?? {}) as Record<string, unknown>)
    .map((c) => ({
      id: typeof c.id === "string" ? c.id.slice(0, 40) : "",
      name: typeof c.name === "string" ? c.name.slice(0, 80) : "",
      signal: (Array.isArray(c.signal) ? c.signal : []).filter((x): x is string => typeof x === "string" && /^[\w:-]{1,80}$/.test(x)).slice(0, MAX_SIGNAL),
    }))
    .filter((c) => c.id && c.signal.length);
}

const EMPTY: Geography = { crowds: [], cells: [], calls: 0, callIds: [], q: 0.05, empty: true };

export async function POST(req: Request) {
  const crowds = readCrowds(await req.json().catch(() => ({})));
  if (!crowds.length) return Response.json(EMPTY);
  const store = getStore();
  const key = `v2|${crowds.map((c) => c.signal.join(",")).join("|")}`;
  const named = (g: Geography): Geography => ({ ...g, crowds: g.crowds.map((c, k) => ({ ...c, id: crowds[k]?.id ?? c.id, name: crowds[k]?.name ?? c.name })) });
  const hit = await store.get<Geography>("geography", key);
  if (hit) return Response.json(named({ ...hit.value, calls: 0 }));
  const cap = LIMITS.geography(clientIp(req));
  if (!cap.ok) return Response.json({ ...EMPTY, note: cap.message });
  try {
    const g = await crowdGeography(getQloo(), crowds);
    if (!g.empty) await store.set("geography", key, g, TTL);
    return Response.json(named(g));
  } catch (err) {
    // Never a failure state: the panel says what it would need.
    console.error("geography failed", err);
    return Response.json(EMPTY);
  }
}
