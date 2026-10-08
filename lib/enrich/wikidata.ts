import "server-only";
import { norm } from "@/lib/methods/names";
import type { PartnerCard } from "@/lib/blocks/partners";

// Official websites for partner brands from Wikidata (P856), via the Wikidata ID Qloo returns (§9.19).
// 8 Oct: Qloo's IDs are sometimes wrong (CARAA → a Brazilian government site; Ritual → the concept), so a
// site is kept only when its domain contains the brand's name and isn't a government or university site.
// Socials already come from Qloo's own `external` field.

const WEEK = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; site: string | null }>();

export function plausibleSite(brand: string, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (/\.(gov|edu|mil)(\.|$)|\.gov\.|\.gob\./.test(host)) return false;
  const squashed = host.replace(/[^a-z0-9]/g, "");
  const tokens = norm(brand).split(" ").filter((t) => t.length >= 3 && !["the", "and", "co", "inc", "brand", "foods", "food"].includes(t));
  return tokens.length > 0 && tokens.some((t) => squashed.includes(t));
}

/** Adds `contact.website` (source Wikidata) to brand cards that have a plausible official site. Never throws. */
export async function addWikidataWebsites(cards: PartnerCard[]): Promise<void> {
  const need = cards.filter((c) => c.kind === "brand" && c.wikidataId && !c.contact.website);
  const ids = need.map((c) => c.wikidataId!).filter((id) => {
    const hit = cache.get(id);
    return !hit || Date.now() - hit.at > WEEK;
  });
  if (ids.length) {
    try {
      const res = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.slice(0, 50).join("|")}&props=claims&format=json`, {
        headers: { "User-Agent": "Athena/1.0 (Qloo hackathon project; growth planner for consumer brands)" },
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { entities?: Record<string, { claims?: { P856?: { mainsnak?: { datavalue?: { value?: string } } }[] } }> };
      for (const id of ids) {
        const site = data.entities?.[id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value ?? null;
        cache.set(id, { at: Date.now(), site });
      }
    } catch {
      // Wikidata unavailable: cards simply show no website.
    }
  }
  const fetchedAt = new Date().toISOString();
  for (const c of need) {
    const site = cache.get(c.wikidataId!)?.site;
    if (site && plausibleSite(c.name, site)) c.contact.website = { value: site, source: "Wikidata", fetchedAt };
  }
}
