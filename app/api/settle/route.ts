import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";
import type { Resolution } from "@/lib/knowledge/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A founder's answer to a conflict, read by the model into what it means (§23.2 step 3): which of the sources'
// values still hold, and one plain fact in their terms, with the weights and caveats they gave. Never an error:
// without the model, the answer is kept as they wrote it, with every option they named.

type Body = { about?: unknown; options?: unknown; answer?: unknown; picked?: unknown };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const POST = dated(async function post(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const about = str(b.about, 200);
  const options = (Array.isArray(b.options) ? b.options : []).map((o) => str(o, 300)).filter(Boolean).slice(0, 10);
  const answer = str(b.answer, 400);
  const picked = (Array.isArray(b.picked) ? b.picked : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < options.length);
  const plain: Resolution = { keep: picked.length ? picked : options.map((_, i) => i), fact: `${about}: ${answer}`, said: answer };
  if (!about || !options.length || !answer) return Response.json(plain);
  if (!llmConfigured() || !LIMITS.brief(clientIp(req)).ok) return Response.json(plain);
  try {
    const r = await generate({
      model: "flash",
      json: true,
      thinking: "LOW",
      budgetMs: 20_000,
      maxOutputTokens: 600,
      prompt: [
        `Sources about a brand disagreed on: ${about}.`,
        `The values they gave: ${options.map((o, i) => `[${i}] ${o}`).join("; ")}.`,
        `The founder answered: "${answer}".`,
        "Read what they mean. It may be one value, several, a mix with different weights, or something new with caveats.",
        'Return JSON {"keep": [indexes of the values that still hold, possibly none], "fact": "one plain sentence stating the answer as a fact about the brand, keeping their weights and caveats, no hedging words they didn\'t use"}.',
      ].join("\n"),
    });
    const j = parseJson<{ keep?: unknown; fact?: unknown }>(r.text);
    const keep = (Array.isArray(j?.keep) ? j.keep : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < options.length);
    const fact = str(j?.fact, 400);
    if (!fact) return Response.json(plain);
    return Response.json({ keep: [...new Set(keep)], fact, said: answer } satisfies Resolution);
  } catch {
    return Response.json(plain);
  }
});
