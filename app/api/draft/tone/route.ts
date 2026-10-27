import { llmConfigured } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { DRAFT_TONES, retoneDraft, type DraftTone } from "@/lib/agent/draft";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const list = (v: unknown, n: number, m = 200) => (Array.isArray(v) ? v.map((x) => str(x, m)).filter(Boolean).slice(0, n) : []);

/**
 * The tone buttons on an ask (§23.5 g) and on the Executive's emails, DMs and hooks (§23.5 r): the draft rewritten in
 * place with no Qloo call. A rewrite that adds a name or a number the draft didn't have is thrown away and the draft
 * comes back as it was.
 */
export const POST = dated(async function post(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const body = str(b.body, 4000);
  const tone = str(b.tone, 40) as DraftTone;
  if (!body || !DRAFT_TONES.includes(tone)) return Response.json({ error: "a draft and a tone are required" }, { status: 400 });
  const subject = str(b.subject, 300) || undefined;
  if (!llmConfigured()) return Response.json({ subject, body, changed: false });
  const cap = LIMITS.brief(clientIp(req));
  if (!cap.ok) return Response.json({ error: cap.message }, { status: 429 });
  const kind = b.kind === "dm" || b.kind === "hook" ? b.kind : "email";
  return Response.json(await retoneDraft({ subject, body, tone, names: list(b.names, 40), kind }));
});
