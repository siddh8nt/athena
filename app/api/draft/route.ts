import { getQloo } from "@/lib/qloo";
import { results } from "@/lib/qloo/client";
import { bridges as bridgeMath, percentiles } from "@/lib/methods/rank";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import { validate, type Sentence } from "@/lib/methods/validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const list = (v: unknown, n: number, m = 80) => (Array.isArray(v) ? v.map((x) => str(x, m)).filter(Boolean).slice(0, n) : []);

type Partner = { id: string; name: string; pForward: number };
export type DraftResponse = {
  subject: string;
  sentences: Sentence[];
  bridges: { name: string; pAccounts: number; pVenue: number }[];
  removed: number;
};

/**
 * A venue pitch (§9.8, §9.10): shared loves from one Qloo call (the venue's crowd scored over your partner
 * brands), then a Gemini draft whose every name is checked against this evidence. Nothing is ever sent.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const brand = str(b.brand, 120);
  const product = str(b.product, 200);
  const venue = b.venue as Record<string, unknown> | undefined;
  const venueId = str(venue?.id, 64);
  const venueName = str(venue?.name, 160);
  const neighbourhood = str(venue?.neighbourhood, 80);
  const tags = list(venue?.tags, 8);
  const reasons = list(venue?.reasons, 4, 160);
  const partners: Partner[] = (Array.isArray(b.partners) ? b.partners : []).slice(0, 50).flatMap((p) => {
    const x = p as Record<string, unknown>;
    return typeof x.id === "string" && typeof x.name === "string" ? [{ id: x.id, name: x.name.slice(0, 120), pForward: Number(x.pForward) || 0 }] : [];
  });
  if (!brand || !venueName) return Response.json({ error: "brand and venue are required" }, { status: 400 });

  // Shared loves: min(your crowd's percentile, the venue crowd's percentile) ≥ 0.70, top 2 (§9.8).
  let found: DraftResponse["bridges"] = [];
  try {
    if (venueId && partners.length) {
      const qloo = getQloo();
      const res = await qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": venueId, "filter.results.entities": partners.map((p) => p.id), take: partners.length });
      const pVenue = percentiles((results(res).entities ?? []).map((e) => e.entity_id));
      const pAcc = new Map(partners.map((p) => [p.id, p.pForward]));
      const names = new Map(partners.map((p) => [p.id, p.name]));
      found = bridgeMath(pAcc, pVenue).map((x) => ({ name: names.get(x.id) ?? x.id, pAccounts: x.pAccounts, pVenue: x.pVenue }));
    }
  } catch (err) {
    console.error("bridges failed", err);
  }

  const allowed = { brand: [brand], theme: [], tag: [...tags, ...(neighbourhood ? [neighbourhood] : [])], reference: [], interest: [], venue: [venueName], partner: found.map((x) => x.name) };
  const fallback = (): DraftResponse => ({
    subject: `${brand} for ${venueName}`,
    sentences: [
      { text: `Hi ${venueName} team,` },
      found.length
        ? { text: `Crowds like yours and ours both over-index on ${found.map((x) => x.name).join(" and ")}, so we think ${brand} would fit your shelves.` }
        : { text: `We think ${brand} would fit what your regulars already love${tags.length ? `: ${tags.slice(0, 2).join(" and ").toLowerCase()}` : ""}.` },
      { text: `Could we drop off a sample this month?` },
    ],
    bridges: found,
    removed: 0,
  });
  if (!llmConfigured()) return Response.json(fallback());

  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await generate({
        model: "flash",
        json: true,
        thinking: "LOW",
        temperature: 0.7,
        maxOutputTokens: 1024,
        system:
          "You write short, warm, specific first-contact emails from a small consumer brand to an independent venue. " +
          "Use only names from the evidence. Never claim facts about the venue or its customers beyond the evidence; no numbers; no superlatives. Reply with JSON only.",
        prompt:
          `From: ${brand} (${product || "a consumer brand"})\nTo: ${venueName}${neighbourhood ? ` in ${neighbourhood}` : ""}\n` +
          `Evidence: ${found.length ? `both crowds over-index on ${found.map((x) => x.name).join(" and ")} (shared loves)` : "no shared loves found"}; venue tags: ${tags.join(", ") || "none"}; why this venue: ${reasons.join("; ") || "taste match"}.\n` +
          `Write a subject (≤ 8 words) and 4 sentences: a greeting; ${found.length ? 'open with the shared loves, as "Crowds like yours and ours both over-index on X and Y"' : "why the brand fits the venue, from the tags"}; what the brand makes; a low-pressure ask (sample or tasting).\n` +
          `Each sentence lists claims: {"kind": "brand"|"venue"|"partner"|"tag", "ref": exact name}.\n` +
          `Return {"subject": "...", "sentences": [{"text","claims"}]}` +
          feedback,
      });
      const j = parseJson<{ subject?: string; sentences?: Sentence[] }>(res.text);
      if (!j?.sentences?.length) continue;
      const v = validate(j.sentences, allowed as never, [brand, venueName, ...found.map((x) => x.name)]);
      if (v.violations.length && attempt < 2 && v.ok.length < j.sentences.length - 1) {
        feedback = `\n\nFix these unsupported sentences:\n${v.violations.map((x) => `- "${x.text}": ${x.reason}`).join("\n")}`;
        continue;
      }
      const subject = str(j.subject, 120) || `${brand} for ${venueName}`;
      return Response.json({ subject, sentences: v.ok, bridges: found, removed: v.violations.length } satisfies DraftResponse);
    } catch (err) {
      console.error("draft failed", err);
    }
  }
  return Response.json(fallback());
}
