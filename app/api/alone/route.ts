import { llmConfigured } from "@/lib/llm/vertex";
import { ALONE_STOPS, askAlone, cachedAlone, type AloneInput, type AloneStop } from "@/lib/proof/alone";
import { isMetroId } from "@/lib/playbook/metros";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// With / Without (§13.2): one stop's question to Gemini alone, no Qloo. A cached answer is free; a new one is capped
// (§14.5). Never an error: an empty answer carries a note the panel shows instead.

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function readInput(b: Record<string, unknown>): AloneInput | undefined {
  const stop = b.stop as AloneStop;
  if (!ALONE_STOPS.includes(stop)) return undefined;
  const metroId = str(b.metroId, 120);
  const candidates = (Array.isArray(b.candidates) ? b.candidates : [])
    .slice(0, 50)
    .map((c) => (c ?? {}) as Record<string, unknown>)
    .map((c) => ({ id: str(c.id, 80), label: str(c.label, 80) }))
    .filter((c) => c.id && c.label);
  const input: AloneInput = { stop, brand: str(b.brand, 120) || "The brand", product: str(b.product, 400), tier: str(b.tier, 20) || undefined, metroId: metroId && isMetroId(metroId) ? metroId : undefined, candidates: stop === "retailers" ? candidates : undefined };
  return input.product ? input : undefined;
}

export const POST = dated(async function post(req: Request) {
  const input = readInput((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const none = (note: string) => Response.json({ answer: null, note });
  if (!input) return none("Tell me what you sell and Gemini alone can answer this stop's question too.");
  const hit = await cachedAlone(input);
  if (hit) return Response.json({ answer: hit });
  if (!llmConfigured()) return none("Gemini alone answers when Athena runs live.");
  const cap = LIMITS.alone(clientIp(req));
  if (!cap.ok) return none(cap.message);
  try {
    const answer = await askAlone(input);
    return answer.items.length ? Response.json({ answer }) : none("Gemini alone didn't give a usable answer this time. Ask again in a minute.");
  } catch (err) {
    console.error("alone failed", err);
    return none("Gemini is busy right now. Ask again in a minute.");
  }
});
