import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";
import { readFacts, strs } from "@/lib/agent/inputs";
import { validWorkspace } from "@/lib/knowledge/uploads";
import { bySource } from "@/lib/knowledge/notes";
import { synthesize } from "@/lib/knowledge/synth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Knowledge from raw facts (PRD §23.2 step 8.2a): the client sends what was read (and, for a later file, the themes
// already there); the notes come back grouped into themes. Without the model, or past the hourly count, they come
// back grouped by source page or file. Never an error: every path answers.

export const POST = dated(async function post(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ws?: unknown; raw?: unknown; themes?: unknown; entities?: unknown };
  const raw = readFacts(body.raw);
  const ws = validWorkspace(body.ws) ? body.ws : undefined;
  const themes = strs(body.themes, 20, 60);
  const entities = strs(body.entities, 120, 80);
  try {
    const llm = llmConfigured() && LIMITS.brief(clientIp(req)).ok;
    return Response.json(await synthesize({ ws, raw, themes, entities }, { llm }));
  } catch (err) {
    console.error("synthesize failed", err);
    return Response.json({ notes: bySource(raw), asks: [], by: "source" });
  }
});
