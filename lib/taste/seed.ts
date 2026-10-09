import type { Priority, QlooClient } from "@/lib/qloo/client";
import type { QlooTag } from "@/lib/qloo/types";
import { resolveBrand } from "@/lib/methods/resolve";
import { norm } from "@/lib/methods/names";
import type { Ref, Seed } from "./graph";

// Product → seed signal (PRD §9.23 step 1). The agent names the product's traits and 3–5 lookalike brands; code
// finds each in Qloo and keeps only what Qloo actually has. Tags are chosen only from what tag search returns,
// never invented (10 Oct: "clean beauty" matched only salon categories).

export type SeedInput = {
  /** The brand's own Qloo match, if any (from "Is this you?"). */
  brand?: Ref;
  /** Brands the founder named as like theirs: tried first. */
  comparables: string[];
  /** The agent's lookalikes (§6.2.1). */
  lookalikes: string[];
  /** Short product traits: "tinned fish", "premium", "playful packaging". */
  traits: string[];
};

export type SeedResult = Seed & { callIds: string[]; missing: string[] };

/**
 * Only tags that describe a product's taste: brand genres, then Qloo's style and theme tags. Everything else
 * describes places (10 Oct: "tinned fish" matched cuisine and menu tags, "premium" matched hotel-room and ambience
 * tags) and is never a seed.
 */
function tagScore(t: QlooTag): number {
  const id = t.id ?? t.tag_id ?? "";
  if (id.includes(":genre:brand:")) return 3;
  if (/^urn:tag:(style|theme):qloo:/.test(id)) return 2;
  return -1;
}

const words = (s: string) => norm(s).split(" ").filter((w) => w.length > 2);
/** A tag must share a word with the trait (prefix match, so "playful" ~ "play"): 10 Oct, "Gen Z" came back as "Ziti Alla Genovese". */
export function sharesWord(tagName: string, trait: string): boolean {
  const t = words(trait);
  // Words under 4 letters must match exactly ("gen" is not "genovese"); longer ones may differ in their ending.
  const same = (a: string, b: string) => (a.length < 4 || b.length < 4 ? a === b : a.startsWith(b.slice(0, Math.max(4, b.length - 2))) || b.startsWith(a.slice(0, Math.max(4, a.length - 2))));
  return words(tagName).some((w) => t.some((x) => same(w, x)));
}

export function pickTag(tags: QlooTag[], trait: string): Ref | undefined {
  const best = tags
    .filter((t) => sharesWord(t.name, trait))
    .map((t) => ({ t, s: tagScore(t) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0]?.t;
  const id = best?.id ?? best?.tag_id;
  return best && id ? { id, name: best.name } : undefined;
}

/** Never throws. At most 4 lookalikes and 4 tags. */
export async function buildSeed(qloo: QlooClient, input: SeedInput, opts: { priority?: Priority } = {}): Promise<SeedResult> {
  const callIds: string[] = [];
  const missing: string[] = [];
  const own = input.brand ? norm(input.brand.name) : "";
  const names = [...new Set([...input.comparables, ...input.lookalikes].map((n) => n.trim()).filter((n) => n && norm(n) !== own))].slice(0, 6);
  const [found, tags] = await Promise.all([
    Promise.all(
      names.map(async (n) => {
        const r = await resolveBrand(qloo, n).catch(() => undefined);
        if (r) callIds.push(r.callId);
        if (!r?.entity) missing.push(n);
        return r?.entity ? { id: r.entity.entity_id, name: r.entity.name } : undefined;
      }),
    ),
    Promise.all(
      input.traits.slice(0, 5).map(async (t) => {
        const r = await qloo.get("/v2/tags", { "filter.query": t, take: 8 }, opts).catch(() => undefined);
        if (r) callIds.push(r.call.id);
        const list = ((r?.body?.results as { tags?: QlooTag[] } | undefined)?.tags ?? []) as QlooTag[];
        return pickTag(list, t);
      }),
    ),
  ]);
  const seenTags = new Set<string>();
  return {
    brand: input.brand,
    lookalikes: found.filter((x): x is Ref => !!x).slice(0, 4),
    tags: tags.filter((t): t is Ref => !!t && !seenTags.has(t.id) && !!seenTags.add(t.id)).slice(0, 4),
    callIds,
    missing,
  };
}
