import { getQloo } from "@/lib/qloo";
import { results } from "@/lib/qloo/client";
import { percentiles, rerank } from "@/lib/methods/rank";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ids = (v: unknown, n = 50) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 64).slice(0, n) : []);
type Tagged = { id: string; tags: string[] };

/**
 * Re-rank on outcomes (§9.7): fit = signal + wins over the fixed pool; decline = declines over the same pool;
 * score = pFit − 0.5·pDec. Items that move 5+ places get a reason from the tags they share with wins or declines.
 * Never errors: on any failure it returns the pool in its previous order.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const pool = ids(b.pool);
  const signal = ids(b.signal);
  const wins = ids(b.wins, 20);
  const declines = ids(b.declines, 20);
  const tagged: Tagged[] = Array.isArray(b.tags) ? (b.tags as Tagged[]).filter((t) => t && typeof t.id === "string").slice(0, 50) : [];
  const unchanged = { order: pool, moved: [] as { id: string; from: number; to: number; reason: string }[], calls: 0 };
  if (!pool.length || (!wins.length && !declines.length)) return Response.json(unchanged);
  try {
    const qloo = getQloo();
    const fitSignal = [...new Set([...signal, ...wins])].slice(0, 50);
    const [fitRes, decRes] = await Promise.all([
      qloo.insights({ "filter.type": "urn:entity:place", "signal.interests.entities": fitSignal, "filter.results.entities": pool, take: pool.length }),
      declines.length ? qloo.insights({ "filter.type": "urn:entity:place", "signal.interests.entities": declines, "filter.results.entities": pool, take: pool.length }) : Promise.resolve(undefined),
    ]);
    const pFit = percentiles((results(fitRes).entities ?? []).map((e) => e.entity_id));
    const pDec = decRes ? percentiles((results(decRes).entities ?? []).map((e) => e.entity_id)) : undefined;
    const order = rerank(pool, pFit, pDec).map((r) => r.id);

    const tagsOf = new Map(tagged.map((t) => [t.id, new Set(t.tags)]));
    const shared = (id: string, group: string[]) => {
      const mine = tagsOf.get(id) ?? new Set<string>();
      const counts = new Map<string, number>();
      for (const g of group) for (const t of tagsOf.get(g) ?? []) if (mine.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts].sort((a, c) => c[1] - a[1]).slice(0, 2).map(([t]) => t);
    };
    const moved = order
      .map((id, to) => ({ id, from: pool.indexOf(id), to }))
      .filter((m) => Math.abs(m.to - m.from) >= 5)
      .map((m) => {
        const up = m.to < m.from;
        const tags = shared(m.id, up ? wins : declines);
        return { ...m, reason: up ? `Moved up: resembles your wins${tags.length ? ` (${tags.join(", ")})` : ""}` : `Moved down: resembles your declines${tags.length ? ` (${tags.join(", ")})` : ""}` };
      });
    return Response.json({ order, moved, calls: decRes ? 2 : 1 });
  } catch (err) {
    console.error("rerank failed", err);
    return Response.json(unchanged);
  }
}
