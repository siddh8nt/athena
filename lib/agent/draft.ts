import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import { bridges as bridgeMath, percentiles } from "@/lib/methods/rank";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import { validate, type Sentence } from "@/lib/methods/validator";

// A first-contact draft (§9.8, §9.10): shared loves from one Qloo call (the recipient's crowd scored over the brand's
// partner brands), then a Gemini draft whose every name is checked against this evidence. Nothing is ever sent.
// The draft route and the team's draft tools (§23.2 step 8: the Rep's pitch, the Matchmaker's ask, the Promoter's
// inquiry) both write through here.

export type DraftPartner = { id: string; name: string; pForward: number };
export type DraftResponse = {
  subject: string;
  sentences: Sentence[];
  bridges: { name: string; pAccounts: number; pVenue: number }[];
  removed: number;
};

/** Who it's to. venue: the pitch to a shop (the original prompt, unchanged); partner and event change only the ask. */
export type DraftTo = { kind: "venue" | "partner" | "event"; id?: string; name: string; neighbourhood?: string; tags: string[]; reasons: string[] };

// [VERIFY] live: the partner and event asks are new wording; the venue ask is the route's, as it was.
const ASK: Record<DraftTo["kind"], { system: string; ask: string; fallback: string; fits: string }> = {
  venue: {
    system: "an independent venue",
    ask: "a low-pressure ask (sample or tasting)",
    fallback: "Could we drop off a sample this month?",
    fits: "would fit your shelves",
  },
  partner: {
    system: "a brand or podcast it would like to partner with",
    ask: "a low-pressure ask (a short call about a small collaboration)",
    fallback: "Would you be open to a short call about a small collaboration?",
    fits: "would fit alongside you",
  },
  event: {
    system: "the organisers of an event",
    ask: "a low-pressure ask (what it would take to have a stand or a tasting there)",
    fallback: "What would it take for us to have a stand or a tasting there?",
    fits: "would fit what your crowd comes for",
  },
};

/** How long the model gets to write before the template is used; inside the Rep's 30 s tool limit. */
export const DRAFT_MS = 20_000;

export async function writeDraft(input: { qloo?: QlooClient; brand: string; product?: string; to: DraftTo; partners: DraftPartner[]; generate?: typeof generate; llm?: boolean; maxMs?: number }): Promise<DraftResponse> {
  // Writing stops at the deadline and the template stands in, so a slow model never leaves the founder without a draft.
  const until = Date.now() + (input.maxMs ?? DRAFT_MS);
  const { brand, product = "", to, partners } = input;
  const { name: venueName, neighbourhood = "", tags, reasons } = to;
  const words = ASK[to.kind];

  // Shared loves: min(your crowd's percentile, the recipient crowd's percentile) ≥ 0.70, top 2 (§9.8).
  let found: DraftResponse["bridges"] = [];
  try {
    if (input.qloo && to.id && partners.length) {
      const res = await input.qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": to.id, "filter.results.entities": partners.map((p) => p.id), take: partners.length });
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
        ? { text: `Crowds like yours and ours both over-index on ${found.map((x) => x.name).join(" and ")}, so we think ${brand} ${words.fits}.` }
        : { text: `We think ${brand} would fit what your ${to.kind === "venue" ? "regulars" : "crowd"} already love${tags.length ? `: ${tags.slice(0, 2).join(" and ").toLowerCase()}` : ""}.` },
      { text: words.fallback },
    ],
    bridges: found,
    removed: 0,
  });
  if (!(input.llm ?? llmConfigured())) return fallback();
  const gen = input.generate ?? generate;

  let feedback = "";
  for (let attempt = 0; attempt < 3 && Date.now() < until; attempt++) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<undefined>((res) => (timer = setTimeout(() => res(undefined), Math.max(0, until - Date.now()))));
      const res = await Promise.race([gen({
        model: "flash",
        json: true,
        thinking: "LOW",
        temperature: 0.7,
        maxOutputTokens: 1024,
        system:
          `You write short, warm, specific first-contact emails from a small consumer brand to ${words.system}. ` +
          "Use only names from the evidence. Never claim facts about the venue or its customers beyond the evidence; no numbers; no superlatives. Reply with JSON only.",
        prompt:
          `From: ${brand} (${product || "a consumer brand"})\nTo: ${venueName}${neighbourhood ? ` in ${neighbourhood}` : ""}\n` +
          `Evidence: ${found.length ? `both crowds over-index on ${found.map((x) => x.name).join(" and ")} (shared loves)` : "no shared loves found"}; venue tags: ${tags.join(", ") || "none"}; why this venue: ${reasons.join("; ") || "taste match"}.\n` +
          `Write a subject (≤ 8 words) and 4 sentences: a greeting; ${found.length ? 'open with the shared loves, as "Crowds like yours and ours both over-index on X and Y"' : "why the brand fits the venue, from the tags"}; what the brand makes; ${words.ask}.\n` +
          `Each sentence lists claims: {"kind": "brand"|"venue"|"partner"|"tag", "ref": exact name}.\n` +
          `Return {"subject": "...", "sentences": [{"text","claims"}]}` +
          feedback,
      }), late]).finally(() => clearTimeout(timer));
      if (!res) break;
      const j = parseJson<{ subject?: string; sentences?: Sentence[] }>(res.text);
      if (!j?.sentences?.length) continue;
      const v = validate(j.sentences, allowed as never, [brand, venueName, ...found.map((x) => x.name)]);
      if (v.violations.length && attempt < 2 && v.ok.length < j.sentences.length - 1) {
        feedback = `\n\nFix these unsupported sentences:\n${v.violations.map((x) => `- "${x.text}": ${x.reason}`).join("\n")}`;
        continue;
      }
      const subject = (typeof j.subject === "string" ? j.subject.slice(0, 120).trim() : "") || `${brand} for ${venueName}`;
      return { subject, sentences: v.ok, bridges: found, removed: v.violations.length };
    } catch (err) {
      console.error("draft failed", err);
    }
  }
  return fallback();
}
