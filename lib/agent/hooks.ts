import "server-only";
import { generate, parseJson } from "@/lib/llm/vertex";
import { validate, type Claim, type Sentence } from "@/lib/methods/validator";

// Hooks, content ideas and a tone line for the Message block (§9.15), written by Gemini 3.8 Flash from
// this run's Qloo evidence only, and checked by the grounding validator (§9.10). Never phrased as facts
// about the brand's customers ("people who love X…" is fine; "your customers are…" is not).

export type HookEvidence = {
  brand: string;
  themes: string[];
  styleTags: string[];
  references: string[];
  interests: string[];
  positioning: string[];
  /** What the brand sells, so hooks use only evidence that fits the product. */
  product?: string;
  /** How to pitch them this time ("more playful", "shorter"), from the founder's buttons or chat. */
  tone?: string;
  /** Hooks the founder marked no: never written again. */
  avoid?: string[];
};

export type Hooks = { hooks: Sentence[]; ideas: Sentence[]; tone?: Sentence; removed: number };

type Raw = { hooks?: Sentence[]; content_ideas?: Sentence[]; tone_line?: Sentence };

export async function writeHooks(ev: HookEvidence): Promise<Hooks | undefined> {
  const allowed: Partial<Record<Claim["kind"], string[]>> = {
    brand: [ev.brand],
    theme: ev.themes,
    tag: [...ev.styleTags, ...ev.positioning],
    reference: ev.references,
    interest: ev.interests,
  };
  const evidenceText =
    `Brand: ${ev.brand}\nTaste themes: ${ev.themes.join(", ")}\nStyle tags: ${ev.styleTags.join(", ") || "none"}\n` +
    `Cultural references the crowd over-indexes on: ${ev.references.join(", ")}\nInterests: ${ev.interests.join(", ") || "none"}\n` +
    `Positioning tags (only this brand vs competitors): ${ev.positioning.join(", ") || "none"}`;
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw: Raw | undefined;
    try {
      const res = await generate({
        model: "flash",
        json: true,
        thinking: "LOW",
        temperature: 1.0,
        maxOutputTokens: 2048,
        system:
          "You are a sharp consumer-brand copywriter. You write short, specific, human hooks grounded in taste evidence about the brand's crowd. " +
          "Write natural sentences with ordinary words; use at most one or two evidence items per line, chosen because they fit the brand. " +
          "Never list evidence words, never use evidence that doesn't fit the product, never describe customers as people ('your customers are…'), " +
          "no numbers, no superlatives you can't support. Capitalised names may only come from the evidence. Reply with JSON only.",
        prompt:
          `${evidenceText}

What the brand sells: ${ev.product ?? "see the brand name"}

` +
          (ev.tone ? `How the founder wants them this time: ${ev.tone}. Keep every other rule.
` : "") +
          (ev.avoid?.length ? `The founder turned these down; write different ones: ${ev.avoid.map((x) => `"${x}"`).join("; ")}
` : "") +
          `Write 5 hooks (≤ 12 words each), 5 content ideas (≤ 25 words, a concrete post or activation each) and 1 tone line (≤ 20 words, how the brand should sound).
` +
          `Good examples of the style (for a different brand): "Pour it like the chefs on Chef's Table do." · "A slow Sunday, a hot pan, something worth sharing."
` +
          `Bad (never do this): "Cooking, Healthy Living, and Chef's Table for the Foodie."
` +
          `Each item lists the evidence it uses as claims: {"kind": "brand"|"theme"|"tag"|"reference"|"interest", "ref": exact name from the evidence}.
` +
          `Return {"hooks": [{"text","claims"}], "content_ideas": [{"text","claims"}], "tone_line": {"text","claims"}}` +
          feedback,
      });
      raw = parseJson<Raw>(res.text);
    } catch {
      raw = undefined;
    }
    if (!raw) continue;
    const all = [...(raw.hooks ?? []), ...(raw.content_ideas ?? []), ...(raw.tone_line ? [raw.tone_line] : [])];
    const result = validate(all, allowed, ev.references);
    const ok = new Set(result.ok);
    if (result.violations.length && attempt < 2) {
      // Send the violations back and retry (§9.10); after 2 retries, unsupported sentences are dropped.
      feedback = `\n\nYour last answer had unsupported claims; fix them:\n${result.violations.slice(0, 8).map((v) => `- "${v.text}": ${v.reason}`).join("\n")}`;
      if (result.ok.length < all.length * 0.6) continue;
    }
    return {
      hooks: (raw.hooks ?? []).filter((h) => ok.has(h)).slice(0, 5),
      ideas: (raw.content_ideas ?? []).filter((h) => ok.has(h)).slice(0, 5),
      tone: raw.tone_line && ok.has(raw.tone_line) ? raw.tone_line : undefined,
      removed: all.length - result.ok.length,
    };
  }
  return undefined;
}
