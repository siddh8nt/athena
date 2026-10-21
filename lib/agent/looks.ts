import "server-only";
import { generate, parseJson } from "@/lib/llm/vertex";
import { properNouns } from "@/lib/methods/validator";

// The Scout's look and product angle for one crowd (PRD §23.5 d3–d4), written by Gemini Flash from that crowd's Qloo
// evidence and the brand's own Knowledge Base, then checked: every swatch and texture names the evidence it's drawn
// from, every product it leads with is one the Knowledge Base names, and no other name gets in.

export type LookEvidence = {
  brand: string;
  crowd: string;
  themes: string[];
  styleTags: string[];
  references: string[];
  /** The crowd's own phrases (Qloo keyword tags). */
  phrases: string[];
  /** What the Brand Knowledge Base says, one line each: the products come from here. */
  knowledge: string[];
  product: string;
};

export type Swatch = { name: string; hex: string; from: string[] };
export type Texture = { text: string; from: string[] };
export type Angle = { product: string; reason: string; from: string[] };
export type Look = { palette: Swatch[]; textures: Texture[]; lead?: Angle; then?: Angle; skip?: Angle; removed: number };

type Raw = { palette?: Swatch[]; textures?: Texture[]; lead_with?: Angle; then?: Angle; skip?: Angle };

const lc = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim();

/** The checks, apart from the model so they can be tested: what passes, and why the rest didn't. */
export function checkLook(raw: Raw, ev: LookEvidence): { look: Look; violations: string[] } {
  const evidence = new Set([...ev.themes, ...ev.styleTags, ...ev.references, ...ev.phrases].map(lc));
  const known = lc([ev.product, ...ev.knowledge].join("\n"));
  const names = [ev.brand, ev.crowd, ...ev.themes, ...ev.styleTags, ...ev.references, ...ev.phrases].map(lc);
  const violations: string[] = [];
  const cited = (from: unknown, what: string) => {
    const f = Array.isArray(from) ? from.filter((x): x is string => typeof x === "string") : [];
    const bad = f.find((x) => !evidence.has(lc(x)));
    if (!f.length) violations.push(`${what}: names no evidence it's drawn from`);
    else if (bad) violations.push(`${what}: "${bad}" is not in the evidence`);
    return f.length > 0 && !bad;
  };
  const stray = (text: string, extra: string[] = []) => properNouns(text).find((n) => ![...names, ...extra.map(lc)].some((w) => w === lc(n) || w.includes(lc(n)) || lc(n).includes(w)));
  const palette = (raw.palette ?? []).filter((s) => {
    if (!s || typeof s.name !== "string" || typeof s.hex !== "string") return false;
    if (!/^#[0-9a-f]{6}$/i.test(s.hex)) return violations.push(`swatch "${s.name}": "${s.hex}" isn't a #rrggbb colour`), false;
    if (/\d/.test(s.name)) return violations.push(`swatch "${s.name}": no numbers in a colour's name`), false;
    return cited(s.from, `swatch "${s.name}"`);
  });
  const textures = (raw.textures ?? []).filter((x) => {
    if (!x || typeof x.text !== "string" || !x.text.trim()) return false;
    const n = stray(x.text);
    if (n) return violations.push(`texture "${x.text}": "${n}" is not in the evidence`), false;
    return cited(x.from, `texture "${x.text}"`);
  });
  const angle = (a: Angle | undefined, what: string): Angle | undefined => {
    if (!a || typeof a.product !== "string" || typeof a.reason !== "string" || !a.product.trim()) return undefined;
    if (!known.includes(lc(a.product))) return violations.push(`${what}: "${a.product}" isn't a product the Knowledge Base names`), undefined;
    if (/\d/.test(a.reason)) return violations.push(`${what}: no numbers in the reason`), undefined;
    const n = stray(a.reason, [a.product]);
    if (n) return violations.push(`${what}: "${n}" is not in the evidence`), undefined;
    return cited(a.from, what) ? { product: a.product.trim(), reason: a.reason.trim(), from: a.from } : undefined;
  };
  const lead = angle(raw.lead_with, "lead with");
  const then = angle(raw.then, "then");
  const skip = angle(raw.skip, "skip");
  const all = (raw.palette?.length ?? 0) + (raw.textures?.length ?? 0) + [raw.lead_with, raw.then, raw.skip].filter(Boolean).length;
  const kept = palette.length + textures.length + [lead, then, skip].filter(Boolean).length;
  return { look: { palette: palette.slice(0, 5), textures: textures.slice(0, 4), ...(lead ? { lead } : {}), ...(then ? { then } : {}), ...(skip ? { skip } : {}), removed: all - kept }, violations };
}

export async function writeLook(ev: LookEvidence): Promise<Look | undefined> {
  const evidence =
    `Brand: ${ev.brand}\nThe crowd: ${ev.crowd}\nTaste themes it over-indexes on: ${ev.themes.join(", ") || "none"}\n` +
    `Style tags: ${ev.styleTags.join(", ") || "none"}\nShows, films, music and books it loves: ${ev.references.join(", ") || "none"}\n` +
    `Its own phrases: ${ev.phrases.join(", ") || "none"}`;
  const knowledge = ev.knowledge.slice(0, 40).join("\n").slice(0, 5000);
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw: Raw | undefined;
    try {
      const res = await generate({
        model: "flash",
        json: true,
        thinking: "LOW",
        temperature: 0.8,
        maxOutputTokens: 2048,
        budgetMs: 40_000,
        system:
          "You are a brand art director and merchandiser. From one crowd's taste evidence you set a look (a palette and textures) and choose which of the brand's own products to lead with for that crowd. " +
          "Every swatch, texture and choice names the evidence items it is drawn from, by their exact names. Products come only from what the Knowledge Base says the brand sells. " +
          "Never describe the crowd as customers, no numbers, no names that aren't in the evidence. Reply with JSON only.",
        prompt:
          `${evidence}\n\nWhat the brand's Knowledge Base says:\n${knowledge || ev.product}\n\n` +
          `Return {"palette": [{"name", "hex": "#rrggbb", "from": [evidence names]}] (4 or 5 colours), ` +
          `"textures": [{"text" (≤ 10 words, a material, finish or photo treatment), "from": [...]}] (3), ` +
          `"lead_with": {"product" (its name as the Knowledge Base writes it), "reason" (≤ 20 words, why it fits this crowd), "from": [...]}, ` +
          `"then": {same, the next product}, "skip": {same, a product to keep out of this crowd's first look, and why}}. ` +
          `Leave out then and skip when the Knowledge Base names only one product.` +
          feedback,
      });
      raw = parseJson<Raw>(res.text);
    } catch {
      raw = undefined;
    }
    if (!raw) continue;
    const { look, violations } = checkLook(raw, ev);
    if (violations.length && attempt < 2) {
      feedback = `\n\nYour last answer had problems; fix them:\n${violations.slice(0, 8).map((v) => `- ${v}`).join("\n")}`;
      if (look.palette.length < 3 || !look.lead) continue;
    }
    return look;
  }
  return undefined;
}
