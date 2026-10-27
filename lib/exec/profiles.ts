import "server-only";
import { getStore } from "@/lib/store";
import { domainOf } from "@/lib/llm/vertex";
import { fetchedUrl, safeFetch } from "@/lib/enrich/safe-fetch";
import { parseFeedHead } from "@/lib/enrich/apple-podcasts";
import { profileOf } from "./plan";

// Profiles for creators and shows (PRD §23.5 r): Athena's server checks each Instagram, TikTok and YouTube profile
// itself before it becomes an "Open on …" button, and reads the two places a creator or a show publishes a booking
// email: a YouTube channel's description and a podcast's RSS feed. Plain public pages and Apple's documented Search API
// only, fetched as Athena (its own user agent), through the safe fetcher.
//   - YouTube answers 404 at a handle that doesn't exist and 200 with the channel's tags at one that does [VERIFY 26 Oct,
//     live: @mkbhd 200, a made-up handle 404]. The description holds the business email ("business@MKBHD.com",
//     "business [at] howtocookthat.net") and the page links the channel's other profiles.
//   - Instagram and TikTok answer a server the same way at a real profile and a made-up one [VERIFY 26 Oct, live], so
//     neither is checked at its own address: one counts only when a page the server fetched links to it (their YouTube
//     channel, the show's feed, their own site).

const DAY = 24 * 60 * 60 * 1000;
const HEADERS = { "User-Agent": "Athena/0.1 (growth planning tool)", "Accept-Language": "en-US,en;q=0.9" };
// Apple asks for about 20 Search API calls a minute [VERIFY: Apple's iTunes Search API documentation].
const SEARCH_GAP_MS = 3_000;

const unescape = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The emails a text gives, including ones written to dodge scrapers ("business [at] site [dot] com"). */
export function emailsIn(text: string): string[] {
  const plain = text.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
  return [...new Set((plain.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,24}\b/gi) ?? []).map((e) => e.toLowerCase()))];
}

/** Every Instagram, TikTok and YouTube profile a page links to, including links YouTube wraps in a redirect. */
export function profilesIn(html: string): string[] {
  const text = html
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/%2F/gi, "/")
    .replace(/%3A/gi, ":")
    .replace(/%40/gi, "@");
  const out = new Map<string, string>();
  for (const m of text.matchAll(/(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|tiktok\.com|youtube\.com)\/[^\s"'<>&\\)?#]+(?:\/[^\s"'<>&\\)?#]+)?/gi)) {
    const p = profileOf(m[0]);
    if (p) out.set(`${p.site}:${p.handle}`, p.url);
  }
  return [...out.values()];
}

async function fetchPage(url: string, maxBytes: number): Promise<{ status: number; text: string; url: string } | undefined> {
  const res = await safeFetch(url, { headers: HEADERS, maxBytes, timeoutMs: 15_000 });
  if (!res) return undefined;
  return { status: res.status, text: res.status === 200 ? await res.text().catch(() => "") : "", url: fetchedUrl(res, url) };
}

/** same: the channel's own address as its page gives it (a handle and a /channel/ address are one channel). */
export type Channel = { url: string; same?: string; emails: string[]; profiles: string[] };

/**
 * A YouTube channel as its own page shows it: its description's emails and the Instagram and TikTok profiles it links.
 * null: YouTube says there's no such channel. undefined: the page didn't answer plainly (a consent or sign-in page,
 * a timeout), so nothing is confirmed either way.
 */
export async function youtubeChannel(url: string): Promise<Channel | null | undefined> {
  const p = profileOf(url);
  if (p?.site !== "YouTube") return undefined;
  const page = await fetchPage(p.url, 4_000_000);
  if (!page) return undefined;
  if (page.status === 404) return null;
  const og = /<meta property="og:url" content="([^"]*)"/i.exec(page.text)?.[1];
  if (page.status !== 200 || domainOf(page.url) !== "youtube.com" || !og) return undefined;
  const about = unescape(/<meta property="og:description" content="([^"]*)"/i.exec(page.text)?.[1] ?? "");
  const same = profileOf(unescape(og))?.url;
  return { url: p.url, ...(same && same !== p.url ? { same } : {}), emails: emailsIn(about), profiles: profilesIn(page.text).filter((u) => profileOf(u)?.site !== "YouTube") };
}

const showKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");
let lastSearch = 0;

/** A show's feed address from Apple's Search API: only a show whose name is this one's, never a near match. */
async function feedOf(name: string): Promise<string | undefined> {
  const key = showKey(name);
  if (!key) return undefined;
  const hit = await getStore()
    .get<string | null>("apple-feed", key)
    .catch(() => undefined);
  if (hit) return hit.value ?? undefined;
  const wait = lastSearch + SEARCH_GAP_MS - Date.now();
  lastSearch = Math.max(Date.now(), lastSearch + SEARCH_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=10&term=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  if (!res?.ok) return undefined;
  const results = ((await res.json().catch(() => ({}))) as { results?: { collectionName?: string; feedUrl?: string }[] }).results ?? [];
  const feed = results.find((r) => r.feedUrl && r.collectionName && showKey(r.collectionName) === key)?.feedUrl;
  await getStore()
    .set("apple-feed", key, feed ?? null, DAY)
    .catch(() => undefined);
  return feed;
}

/** owner: the contact email the show gives podcast apps; emails: any its description gives. */
export type Feed = { url: string; website?: string; owner?: string; emails: string[]; profiles: string[] };

/** A show's RSS feed as the show publishes it: its site, its contact emails and the profiles it links. */
export async function showFeed(name: string): Promise<Feed | undefined> {
  const url = await feedOf(name);
  if (!url) return undefined;
  // The channel block comes before the first episode; that's all that's read.
  // Apple gives some feeds as plain http; the safe fetcher opens https only, which feed hosts serve too.
  const page = await fetchPage(url.replace(/^http:\/\//i, "https://"), 400_000);
  if (!page || page.status !== 200 || !/<(rss|channel)[\s>]/i.test(page.text)) return undefined;
  const head = page.text.split(/<item[\s>]/i)[0];
  const { website, email } = parseFeedHead(head);
  const about = [...head.matchAll(/<(description|itunes:summary)>([\s\S]*?)<\/\1>/gi)].map((m) => unescape(m[2])).join("\n");
  return { url: page.url, ...(website ? { website } : {}), ...(email ? { owner: email } : {}), emails: emailsIn(about), profiles: profilesIn(head) };
}

/** The profiles a page links to, as the server fetched it; undefined when it didn't open. */
export async function profilesOn(url: string): Promise<string[] | undefined> {
  const page = await fetchPage(url, 1_500_000);
  return page?.status === 200 ? profilesIn(page.text) : undefined;
}
