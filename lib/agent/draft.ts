import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import { bridges as bridgeMath, percentiles } from "@/lib/methods/rank";
import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import { properNouns, validate, type Sentence } from "@/lib/methods/validator";

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
export type DraftTo = {
  kind: "venue" | "partner" | "event" | "creator" | "podcast";
  id?: string;
  name: string;
  neighbourhood?: string;
  tags: string[];
  reasons: string[];
  /** Something real from their work (a creator's latest video, a show's latest episode), to open on. */
  work?: string;
  /** What to offer, sized to the founder's budget ("Gifting first, then a paid post"). */
  offer?: string;
};

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
  creator: {
    system: "an independent creator whose audience it would like to reach",
    ask: "a low-pressure ask (whether they'd be open to it)",
    fallback: "Would you be open to it?",
    fits: "would fit what your audience already loves",
  },
  podcast: {
    system: "the host of a podcast it would like to work with",
    ask: "a low-pressure ask (a short call about it)",
    fallback: "Would you be open to a short call about it?",
    fits: "would fit what your listeners already love",
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

  const allowed = { brand: [brand], theme: [], tag: [...tags, ...(neighbourhood ? [neighbourhood] : [])], reference: to.work ? [to.work] : [], interest: [], venue: [venueName], partner: found.map((x) => x.name) };
  const fallback = (): DraftResponse => ({
    subject: `${brand} for ${venueName}`,
    sentences: [
      { text: `Hi ${venueName} team,` },
      found.length
        ? { text: `Crowds like yours and ours both over-index on ${found.map((x) => x.name).join(" and ")}, so we think ${brand} ${words.fits}.` }
        : { text: `We think ${brand} would fit what your ${to.kind === "venue" ? "regulars" : "crowd"} already love${tags.length ? `: ${tags.slice(0, 2).join(" and ").toLowerCase()}` : ""}.` },
      ...(to.work ? [{ text: `We enjoyed "${to.work}".` }] : []),
      ...(to.offer ? [{ text: `We'd love to explore ${to.offer.toLowerCase().replace(/^gifting only: /, "")}.` }] : []),
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
          `Evidence: ${found.length ? `both crowds over-index on ${found.map((x) => x.name).join(" and ")} (shared loves)` : "no shared loves found"}; venue tags: ${tags.join(", ") || "none"}; why this venue: ${reasons.join("; ") || "taste match"}${to.work ? `; their recent work: "${to.work}"` : ""}${to.offer ? `; what to offer: ${to.offer}` : ""}.\n` +
          `Write a subject (≤ 8 words) and 4 sentences: a greeting; ${found.length ? 'open with the shared loves, as "Crowds like yours and ours both over-index on X and Y"' : "why the brand fits the venue, from the tags"}; what the brand makes; ${to.offer ? "the offer; " : ""}${words.ask}.${to.work ? ` Mention their recent work by its exact title (a "reference" claim).` : ""}\n` +
          `Each sentence lists claims: {"kind": "brand"|"venue"|"partner"|"tag"${to.work ? '|"reference"' : ""}, "ref": exact name}.\n` +
          `Return {"subject": "...", "sentences": [{"text","claims"}]}` +
          feedback,
      }), late]).finally(() => clearTimeout(timer));
      if (!res) break;
      const j = parseJson<{ subject?: string; sentences?: Sentence[] }>(res.text);
      if (!j?.sentences?.length) continue;
      const v = validate(j.sentences, allowed as never, [brand, venueName, ...(to.work ? [to.work] : []), ...found.map((x) => x.name)]);
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

export const DRAFT_TONES = ["Warmer", "Shorter", "More premium"] as const;
export type DraftTone = (typeof DRAFT_TONES)[number];

/**
 * A draft rewritten in place by a tone button (§23.5 g). The rewrite may only use the names already in the draft or
 * in its evidence, and no new numbers; when it strays, the draft stays as it was.
 */
/** What a tone rewrite works on: an email, a DM, or a hook to post (§23.5 r). */
export type ToneKind = "email" | "dm" | "hook";
const TONE_SYSTEM: Record<ToneKind, string> = {
  email: "You rewrite a short first-contact email from a small consumer brand in a new tone. Keep every fact; add no names, numbers or claims. Keep the greeting and sign-off lines. Reply with JSON only.",
  dm: "You rewrite a short first-contact direct message from a small consumer brand in a new tone. Keep every fact; add no names, numbers or claims. It stays a DM: no subject line, no formal sign-off. Reply with JSON only.",
  hook: "You rewrite a one-line marketing hook for a small consumer brand in a new tone. Keep its idea; add no names, numbers or claims. It stays one or two short sentences to post as is. Reply with JSON only.",
};

export async function retoneDraft(input: { subject?: string; body: string; tone: DraftTone; names: string[]; kind?: ToneKind; generate?: typeof generate }): Promise<{ subject?: string; body: string; changed: boolean }> {
  const same = { subject: input.subject, body: input.body, changed: false };
  const gen = input.generate ?? generate;
  const res = await gen({
    model: "flash",
    json: true,
    thinking: "LOW",
    temperature: 0.6,
    maxOutputTokens: 1024,
    budgetMs: 20_000,
    system: TONE_SYSTEM[input.kind ?? "email"],
    prompt: `Tone: ${input.tone}${input.tone === "Shorter" ? ` (at most ${(input.kind ?? "email") === "email" ? 3 : 2} sentences)` : ""}\nSubject: ${input.subject ?? ""}\nBody:\n${input.body}\n\nReturn {"subject": "...", "body": "..."}`,
  }).catch(() => undefined);
  const j = res && parseJson<{ subject?: string; body?: string }>(res.text);
  const body = typeof j?.body === "string" ? j.body.trim().slice(0, 4000) : "";
  if (!body) return same;
  const subject = input.subject ? (typeof j?.subject === "string" && j.subject.trim() ? j.subject.trim().slice(0, 120) : input.subject) : undefined;
  const lc = (s: string) => s.toLowerCase();
  const known = [...input.names, ...properNouns(`${input.subject ?? ""}. ${input.body}`)].map(lc);
  const text = `${subject ?? ""}. ${body}`;
  const stray = properNouns(text).find((n) => !known.some((k) => k === lc(n) || k.includes(lc(n)) || lc(n).includes(k)));
  const digits = (s: string) => new Set(s.match(/\d+/g) ?? []);
  const was = digits(`${input.subject ?? ""} ${input.body}`);
  if (stray || [...digits(text)].some((d) => !was.has(d))) return same;
  return { subject, body, changed: true };
}
