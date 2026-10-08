import "server-only";
import { getStore } from "@/lib/store";
import type { PartnerCard } from "@/lib/blocks/partners";
import { safeFetch } from "./safe-fetch";

// Podcast details from Apple (§9.19), keyed by the iTunes ID that Qloo returns for each podcast.
// Replaces Podcast Index (8 Oct): Apple's public lookup needs no key and returned the real episode count and the
// latest episode date for all three Brightland podcasts in under a second; Qloo's `episode_count` was "15" for
// every podcast, so it isn't shown. The show's own RSS feed adds its website and the contact email it publishes.
// Apple asks for roughly 20 lookups a minute at most: calls run one at a time, spaced, and cached for a day.
// Enrichment only: it never changes an order.

const NS = "apple-podcasts";
const DAY = 24 * 60 * 60 * 1000;
const GAP_MS = 400;
const QUIET_AFTER_DAYS = 60;

export type ApplePodcast = { episodes?: number; lastEpisode?: string; genre?: string; website?: string; email?: string; appleUrl?: string };

/** Website and contact email from the top of an RSS feed (the channel block comes before the first item). */
export function parseFeedHead(xml: string): { website?: string; email?: string } {
  const head = xml.split(/<item[\s>]/i)[0] ?? xml;
  const link = /<link>\s*(?:<!\[CDATA\[)?\s*(https?:\/\/[^<\s\]]+)/i.exec(head)?.[1];
  const email = /<itunes:email>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+@[^<\s\]]+)/i.exec(head)?.[1]?.toLowerCase();
  // Hosting platforms put relay addresses here (8 Oct: "info+<uuid>@mg-eu.acast.com"); those aren't a contact.
  const relay = !!email && /\+[0-9a-f-]{16,}@|@mg[\w-]*\./.test(email);
  return { website: link, email: relay ? undefined : email };
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const res = await safeFetch(url, { headers: { "User-Agent": "Athena/0.1 (growth planning tool)" } });
  if (!res?.ok || !res.body) return "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (out.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
    if (/<item[\s>]/i.test(out)) break; // the channel block is all we need
  }
  await reader.cancel().catch(() => undefined);
  return out;
}

let lastFetch = 0;

export async function lookupApplePodcast(itunesId: string): Promise<ApplePodcast | undefined> {
  if (!/^\d{3,15}$/.test(itunesId)) return undefined;
  const hit = await getStore().get<ApplePodcast>(NS, itunesId);
  if (hit) return hit.value;
  // Space live lookups (cache hits skip this).
  const wait = lastFetch + GAP_MS - Date.now();
  lastFetch = Math.max(Date.now(), lastFetch + GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return undefined;
  const show = ((await res.json()) as { results?: Record<string, unknown>[] }).results?.[0];
  if (!show) return undefined;
  const str = (k: string) => (typeof show[k] === "string" ? (show[k] as string) : undefined);
  const feedUrl = str("feedUrl");
  const feed = feedUrl ? parseFeedHead(await fetchText(feedUrl, 200_000).catch(() => "")) : {};
  const value: ApplePodcast = {
    episodes: typeof show.trackCount === "number" ? show.trackCount : undefined,
    lastEpisode: str("releaseDate"),
    genre: str("primaryGenreName"),
    appleUrl: str("collectionViewUrl")?.split("?")[0],
    ...feed,
  };
  await getStore().set(NS, itunesId, value, DAY);
  return value;
}

/** Fills each podcast card's contact details. One lookup at a time, spaced; a miss leaves the card as it was. */
export async function addApplePodcastDetails(cards: PartnerCard[]): Promise<void> {
  const now = Date.now();
  for (const c of cards) {
    if (!c.itunesId) continue;
    const a = await lookupApplePodcast(c.itunesId).catch(() => undefined);
    if (a) {
      const at = new Date().toISOString();
      if (a.appleUrl) c.contact.website = { value: a.appleUrl, source: "Apple Podcasts", fetchedAt: at };
      if (a.website) c.contact.site = { value: a.website, source: "Apple Podcasts", fetchedAt: at };
      if (a.email) c.contact.email = { value: a.email, source: "Apple Podcasts", fetchedAt: at };
      if (a.episodes) c.contact.episodes = { value: a.episodes, source: "Apple Podcasts", fetchedAt: at };
      if (a.lastEpisode) {
        c.contact.lastEpisode = { value: a.lastEpisode, source: "Apple Podcasts", fetchedAt: at };
        c.inactive = now - new Date(a.lastEpisode).getTime() > QUIET_AFTER_DAYS * DAY;
      }
      if (a.genre) c.genre = a.genre;
    }
  }
}
