import { getQloo } from "@/lib/qloo";
import { llmConfigured } from "@/lib/llm/vertex";
import { compareWithoutQloo, getCachedComparison, type ComparisonInput } from "@/lib/proof/without-qloo";
import { METROS } from "@/lib/playbook/metros";
import { LIMITS } from "@/lib/limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[0-9A-Fa-f-]{36}$/.test(x)).slice(0, 50) : []);

/** Without Qloo for Places (§9.9): streams progress steps, then the checked comparison. Never sends an error. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const metroId = str(b.metroId, 20);
  const input: ComparisonInput = {
    key: str(b.key, 80) || "brand",
    brandName: str(b.brandName, 120),
    whatYouSell: str(b.whatYouSell, 200),
    tier: str(b.tier, 20),
    metroId: METROS.some((m) => m.id === metroId) ? metroId : "la",
    channels: (Array.isArray(b.channels) ? b.channels : []).map((c) => str(c, 40)).filter(Boolean).slice(0, 10),
    signal: ids(b.signal),
    athena: (Array.isArray(b.athena) ? b.athena : []).slice(0, 25).flatMap((a) => {
      const x = a as Record<string, unknown>;
      return typeof x.id === "string" ? [{ id: x.id, name: str(x.name, 120), popularity: typeof x.popularity === "number" ? x.popularity : undefined, rank: Number(x.rank) || 0, evidence: Number(x.evidence) || 0 }] : [];
    }),
  };
  const qloo = getQloo();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
        } catch {
          // Client went away.
        }
      };
      try {
        if (qloo.mode !== "live" || !llmConfigured() || !input.brandName) throw new Error("comparison needs live mode");
        const cachedHit = await getCachedComparison(input.key, input.metroId).catch(() => undefined);
        if (!cachedHit) {
          const cap = LIMITS.comparison();
          if (!cap.ok) {
            send({ type: "step", step: cap.message });
            send({ type: "result", comparison: null });
            return;
          }
        }
        const comparison = cachedHit ?? (await compareWithoutQloo(qloo, input, (step) => send({ type: "step", step })));
        send({ type: "result", comparison });
      } catch (err) {
        console.error("comparison failed", err);
        send({ type: "result", comparison: null });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
}

/** The cached comparison for the landing line (§2.2); null when none has run yet. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const c = await getCachedComparison(str(u.searchParams.get("key"), 80), str(u.searchParams.get("metroId"), 20)).catch(() => undefined);
  return Response.json(c ?? null, { headers: { "Cache-Control": "no-store" } });
}
