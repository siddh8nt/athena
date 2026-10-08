import { llmConfigured } from "@/lib/llm/vertex";
import { findPodcastNumbers, type PodcastInput } from "@/lib/enrich/podcast-numbers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");

/** Public figures for one podcast (§9.6): streams progress steps, then the checked figures. `fresh` searches again. Never sends an error. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const input: PodcastInput = {
    id: str(b.id, 64),
    name: str(b.name, 160),
    description: str(b.description, 300) || undefined,
    appleId: /^\d{3,15}$/.test(str(b.appleId, 20)) ? str(b.appleId, 20) : undefined,
    instagram: /^[\w.]{1,40}$/.test(str(b.instagram, 40)) ? str(b.instagram, 40) : undefined,
    website: /^https?:\/\//.test(str(b.website, 200)) ? str(b.website, 200) : undefined,
  };
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
        if (!llmConfigured() || !input.id || !input.name) throw new Error("needs live mode");
        const numbers = await findPodcastNumbers(input, (step) => send({ type: "step", step }), { fresh: b.fresh === true });
        if (!numbers) send({ type: "step", step: "Today's web lookups are used up; this card's Qloo audience is complete without them." });
        send({ type: "result", numbers: numbers ?? null });
      } catch (err) {
        console.error("podcast numbers failed", err);
        send({ type: "result", numbers: null });
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
