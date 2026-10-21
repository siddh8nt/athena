import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { cachedHooks } from "@/lib/agent/server-deps";
import type { HookEvidence } from "@/lib/agent/hooks";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const list = (v: unknown, n: number, m = 120) => (Array.isArray(v) ? v.map((x) => str(x, m)).filter(Boolean).slice(0, n) : []);

/**
 * The Scout's tone buttons (§23.5 d2): the hooks of one crowd rewritten in place, from the evidence they were first
 * written from (kept on the page), so a rewrite needs no Qloo call. Every claim is checked as before.
 */
export const POST = dated(async function post(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const e = (b.evidence ?? {}) as Record<string, unknown>;
  const ev: HookEvidence = {
    brand: str(e.brand, 120),
    themes: list(e.themes, 10),
    styleTags: list(e.styleTags, 8),
    references: list(e.references, 16),
    interests: list(e.interests, 8),
    positioning: list(e.positioning, 8),
    product: str(e.product, 200) || undefined,
    tone: str(b.tone, 80) || undefined,
    avoid: list(b.avoid, 20, 300),
  };
  if (!ev.brand || (!ev.themes.length && !ev.references.length)) return Response.json({ error: "evidence is required" }, { status: 400 });
  if (!llmConfigured()) return Response.json({ hooks: [] });
  const cap = LIMITS.brief(clientIp(req));
  if (!cap.ok) return Response.json({ error: cap.message }, { status: 429 });
  const hooks = await cachedHooks(ev).catch(() => undefined);
  return Response.json({ hooks: hooks?.hooks ?? [], tone: hooks?.tone?.text });
});
