import "server-only";
import { getStore } from "@/lib/store";
import { domainOf, generateStream } from "@/lib/llm/vertex";
import { safeFetch } from "./safe-fetch";
import { now as runNow, today } from "@/lib/time/now";

// Public audience figures for one podcast (§9.6, "Who listens"), found on demand with Gemini, Google Search and
// URL context. Tested 8–9 Oct on Fat Mascara, Forever35 and It's Me, Tinx:
//   - Gemini 3.1 Pro returned no grounding sources for this prompt in every run on 9 Oct (it did for festival
//     dates) and often wrote URLs from headlines that 404. Flash returned sources but took 140-250 s, so Pro
//     stays, and a figure whose cited page 404s is dropped;
//   - Athena opens every page itself: a figure is kept only if the page loads, names the show and shows the
//     figure's number. Pages that block automated visitors (Muck Rack: 403) are dropped, not trusted;
//   - figures can be old (Forever35's "125,000 downloads a week" is from 2019): every figure keeps its date,
//     and third-party estimators are labelled as estimates;
//   - the show is identified by what Qloo knows about it (description, Apple ID, Instagram handle);
//   - a list page ("top 50 beauty podcasts") names many shows, so the number must sit within 200 characters
//     before or 1,000 after the show's name (Feedspot's cards put the name, then a description, then the stats:
//     738 characters apart on 9 Oct), and a sponsor page must be the show's own (its website, or the show's name
//     in the URL);
//   - Gemini often cites a homepage (glossy.co) or a reconstructed URL; each figure is also checked on the real
//     pages of its site that Google's sources point to (resolveCitations).
//   - nothing is estimated by Athena. A podcast with no confirmed figures shows its contact instead.
//   - Searches vary between runs, so an empty answer is searched once more and never saved.
//   - Thinking used ~1,860 tokens on 9 Oct, so the output budget is 8,192 (2,048 cut answers off).
// Runs only on request. Confirmed figures are kept until a later search ("Search again") confirms newer ones of
// the same kind; a later search that confirms nothing keeps what was there. Shares the grounded budget (§14.5).

const NS = "podcast-numbers";
const TIMEOUT_MS = 60_000;
const DAILY_CAP = 60;
const ESTIMATORS = ["muckrack.com", "rephonic.com", "podchaser.com", "listennotes.com", "chartable.com", "podscan.fm", "hypeauditor.com", "billo.app", "similarweb.com"];

export type PodcastInput = { id: string; name: string; description?: string; appleId?: string; instagram?: string; website?: string };
// alts: other pages to check the figure on (from Google's sources); only used before the check, never shown or kept.
export type Figure = { text: string; asOf?: string; url: string; site: string; kind: "audience" | "chart" | "social" | "sponsor"; estimate: boolean; old: boolean; alts?: string[] };
// ranAt: when the figures shown were last confirmed; checkedAt: the latest search; unchanged: that search found nothing new.
export type PodcastNumbers = { figures: Figure[]; searchEntryPoint?: string; ranAt: number; checkedAt?: number; unchanged?: boolean; model: string };

/** New figures replace kept ones of the same kind (newer downloads replace older downloads); other kinds stay. */
export function mergeFigures(kept: Figure[], found: Figure[]): Figure[] {
  const kinds = new Set(found.map((f) => f.kind));
  const order = { sponsor: 0, audience: 1, chart: 2, social: 3 };
  return [...found, ...kept.filter((f) => !kinds.has(f.kind))].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 6);
}

// The date and "search, then open each page" matter: without them Gemini answered from memory on 9 Oct (no
// searches, invented URLs), as the festival-date prompt, which says both, didn't.
const PROMPT = (p: PodcastInput) => `Today is ${today()}. Use Google Search to find publicly stated audience numbers for the podcast "${p.name}", then open each page you cite and check that it states the figure.
What identifies it: ${[p.description?.slice(0, 300), p.appleId && `Apple Podcasts ID ${p.appleId}`, p.instagram && `Instagram @${p.instagram}`, p.website && `website ${p.website}`].filter(Boolean).join("; ")}.
Only report figures that a web page states explicitly: downloads per episode or per month, listeners, chart rankings (Apple Podcasts or Spotify, with country),
Instagram or YouTube followers, and the show's advertising, sponsorship or media kit page.
Never estimate or calculate. If a figure isn't stated anywhere, leave it out.
Answer with one line per figure, exactly in this form, and nothing else:
FIGURE: <the number and what it counts, as stated, e.g. "13 million downloads"> | AS OF: <the date the page gives, or "undated"> | URL: <the full address of the specific page that states it, never just a site's homepage>`;

const MEASURES = /listen|download|follower|subscriber|chart|rank|#\s?\d|rating|review|plays|streams|audience|sponsor|advertis|media kit|partner|promo/i;

function kindOf(text: string): Figure["kind"] {
  if (/sponsor|advertis|media kit|partner|promo/i.test(text)) return "sponsor";
  if (/chart|#\s?\d|rank/i.test(text)) return "chart";
  if (/instagram|youtube|tiktok|followers|subscribers/i.test(text)) return "social";
  return "audience";
}

/** Parses the model's "FIGURE | AS OF | URL" lines into candidates (not yet checked). */
export function parseFigures(text: string, year: number): Figure[] {
  const out: Figure[] = [];
  // Gemini sometimes formats the labels ("**FIGURE:**", "- `URL:`"); strip the markup so those lines still parse.
  text = text.replace(/[*`_]{1,3}(FIGURE|AS OF|URL):?[*`_]{0,3}:?/gi, "$1:");
  for (const m of text.matchAll(/FIGURE:\s*(.+?)\s*\|\s*AS OF:\s*(.+?)\s*\|\s*URL:\s*(\S+)/gi)) {
    const url = m[3].replace(/[).,>]+$/, "");
    const site = domainOf(url);
    if (!site || !/^https?:\/\//.test(url)) continue;
    const asOf = /undated/i.test(m[2]) ? undefined : m[2].slice(0, 40);
    const y = asOf ? Number(/\b(20\d{2})\b/.exec(asOf)?.[1]) : NaN;
    const figure = m[1].slice(0, 160);
    // A bare number ("282") says nothing; keep only figures that name what they count.
    if (!MEASURES.test(figure)) continue;
    out.push({ text: figure, asOf, url, site, kind: kindOf(figure), estimate: isEstimator(site), old: Number.isFinite(y) && y < year - 1 });
  }
  // One line per figure text; sponsor pages first, then audience, charts and socials.
  const order = { sponsor: 0, audience: 1, chart: 2, social: 3 };
  return [...new Map(out.map((f) => [f.text.toLowerCase(), f])).values()].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 6);
}

/** The ways a page may write a figure's first number: "13 million" also as "13m", "33K" also as "33,000". */
export function numberForms(figure: string): string[] {
  const m = /(#?)(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?\b/i.exec(figure);
  if (!m) return [];
  const n = m[2].replace(/,/g, "");
  const unit = (m[3] ?? "").toLowerCase();
  const forms = new Set([`${m[1]}${n}`]);
  const mult: Record<string, [string, number]> = { k: ["thousand", 1e3], thousand: ["k", 1e3], m: ["million", 1e6], million: ["m", 1e6], b: ["billion", 1e9], billion: ["b", 1e9] };
  if (unit && mult[unit]) {
    forms.clear();
    forms.add(`${n}${unit}`).add(`${n} ${unit}`).add(`${n}${mult[unit][0]}`).add(`${n} ${mult[unit][0]}`);
    const full = Number(n) * mult[unit][1];
    if (Number.isFinite(full) && Number.isInteger(full)) forms.add(String(full));
  }
  return [...forms];
}

/** Page text, lowercased, without tags, scripts or thousands separators. */
export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export type Show = { name: string; website?: string };

const BEFORE = 200;
const AFTER = 1000;
const slug = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");

function indexesOf(text: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = text.indexOf(needle); i >= 0 && out.length < 200; i = text.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/** A sponsor page counts only if it's the show's own: on its website, or with the show's name in the URL. */
export function ownPage(url: string, show: Show): boolean {
  const site = domainOf(url);
  const home = show.website ? domainOf(show.website) : undefined;
  if (site && home && (site === home || site.endsWith(`.${home}`))) return true;
  const name = slug(show.name);
  return name.length >= 4 && slug(url).includes(name);
}

/** Keeps a figure only if its page names the show and shows the number near it (200 characters before, 1,000 after). */
export function confirms(f: Figure, text: string, show: Show): boolean {
  const names = text ? indexesOf(text, show.name.toLowerCase()) : [];
  if (!names.length) return false;
  if (f.kind === "sponsor") return ownPage(f.url, show) && /sponsor|advertis|media kit|partner with/.test(text);
  return numberForms(f.text).some((x) => indexesOf(text, x.toLowerCase()).some((i) => names.some((n) => i - n <= AFTER && n - i <= BEFORE)));
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Athena/0.1)", Accept: "text/html" } });
    if (!res?.ok) return "";
    return pageText((await res.text()).slice(0, 800_000));
  } catch {
    return "";
  }
}

/**
 * Opens each cited page once (in parallel) and keeps the figures it confirms. A figure is checked against its
 * cited URL and then its alternatives (real pages on the same site from Google's sources), and keeps the first
 * page that confirms it.
 */
export async function checkFigures(candidates: Figure[], show: string | Show, fetcher: (url: string) => Promise<string> = fetchPage, log?: (line: string) => void): Promise<Figure[]> {
  const s = typeof show === "string" ? { name: show } : show;
  const tries = (f: Figure) => [f.url, ...(f.alts ?? [])];
  const urls = [...new Set(candidates.flatMap(tries))].slice(0, 12);
  const pages = new Map(await Promise.all(urls.map(async (u) => [u, await fetcher(u)] as const)));
  const kept: Figure[] = [];
  for (const f of candidates) {
    const { alts: _alts, ...base } = f;
    const hit = tries(f).find((u) => confirms({ ...base, url: u }, pages.get(u) ?? "", s));
    if (hit) kept.push(withUrl(base, hit));
    const text = pages.get(f.url) ?? "";
    const why = hit ? `kept${hit !== f.url ? ` (on ${hit})` : ""}` : !text ? "page didn't load" : !text.includes(s.name.toLowerCase()) ? "page doesn't name the show" : f.kind === "sponsor" ? "not the show's own page" : "number not near the name";
    log?.(`  "${f.text}" (${f.kind}) ${f.url}${f.alts?.length ? ` +${f.alts.length} alternatives` : ""}: ${why}${text ? ` [${text.length} chars]` : ""}`);
  }
  return kept;
}

const isHomepage = (url: string) => {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") === "";
  } catch {
    return false;
  }
};

const isEstimator = (site: string) => ESTIMATORS.some((e) => site === e || site.endsWith(`.${e}`));
const REDIRECT = /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//;

/** The figure at another address, with its site and estimator label recomputed. */
function withUrl(f: Figure, url: string): Figure {
  const site = domainOf(url) ?? f.site;
  return { ...f, url, site, estimate: isEstimator(site) };
}

/**
 * Google's sources are the pages Search really used; Gemini's written URLs are often reconstructed from a
 * headline and 404 (9 Oct: Elite Daily, Advertising Week, Nieman Lab). So each source's redirect link is
 * followed to its real address, a figure cited as a redirect link takes that address, and every figure gets the
 * real pages on its site (and pages URL context opened) as alternatives to check.
 */
export async function resolveCitations(
  candidates: Figure[],
  retrievedUrls: string[],
  sources: { uri?: string; title?: string }[],
  follow: (uri: string) => Promise<string | undefined> = finalUrl,
): Promise<Figure[]> {
  const followed = new Map<string, Promise<string | undefined>>();
  const go = (u: string) => {
    if (!followed.has(u)) followed.set(u, follow(u));
    return followed.get(u)!;
  };
  const real = (await Promise.all(sources.slice(0, 10).flatMap((x) => (x.uri ? [go(x.uri)] : [])))).filter((u): u is string => !!u);
  const out: Figure[] = [];
  for (const c of candidates) {
    let f = c;
    if (REDIRECT.test(f.url)) {
      const u = await go(f.url);
      if (!u) continue;
      f = withUrl(f, u);
    }
    const alts = [...new Set([...real, ...retrievedUrls])].filter((u) => domainOf(u) === f.site && u !== f.url && !isHomepage(u)).slice(0, 3);
    out.push(alts.length ? { ...f, alts } : f);
  }
  return out;
}

async function finalUrl(uri: string): Promise<string | undefined> {
  const res = await safeFetch(uri, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Athena/0.1)" } });
  await res?.body?.cancel().catch(() => undefined);
  return res?.ok ? res.url : undefined;
}

/** Server log of what Gemini answered and what the page check made of it (§9.6), to see why a show gets nothing. */
const debugLog = (line: string) => console.info(`[podcast-numbers] ${line}`);

let usedToday = { day: "", count: 0 };

export async function getCachedNumbers(id: string): Promise<PodcastNumbers | undefined> {
  return (await getStore().get<PodcastNumbers>(NS, id))?.value;
}

/**
 * Never throws. Without `fresh`, kept figures are returned as they are. With `fresh` ("Search again"), a new
 * search runs; newly confirmed figures replace kept ones of the same kind, and if it confirms nothing the kept
 * figures stay. Returns undefined when the daily budget is used up and nothing is kept (the caller says so).
 */
export async function findPodcastNumbers(p: PodcastInput, onStep: (step: string) => void, opts: { fresh?: boolean } = {}): Promise<PodcastNumbers | undefined> {
  const cached = await getCachedNumbers(p.id).catch(() => undefined);
  if (cached && !opts.fresh) return { ...cached, unchanged: undefined };
  const day = new Date().toISOString().slice(0, 10);
  if (usedToday.day !== day) usedToday = { day, count: 0 };
  if (usedToday.count >= DAILY_CAP) {
    if (cached) onStep("Today's web lookups are used up; showing the figures confirmed earlier.");
    return cached;
  }
  let value: PodcastNumbers | undefined;
  let complete = false;
  // Searches vary between runs, so an empty first answer gets one more try (each counts against the daily cap).
  // Searching again over kept figures runs once: there's already something to show. Pro, not Flash: Flash
  // returned Google's sources on 9 Oct but took 140-250 s with Search; Pro took 15-40 s.
  for (let attempt = 0; attempt < (cached ? 1 : 2) && usedToday.count < DAILY_CAP; attempt++) {
    usedToday.count++;
    onStep(attempt === 0 ? `Searching the web for ${p.name}'s public numbers` : "Nothing confirmed yet; searching once more");
    const r = await generateStream(
      { model: "pro", prompt: PROMPT(p), grounding: true, urlContext: true, thinking: "LOW", temperature: 1.0, maxOutputTokens: 8192, timeoutMs: TIMEOUT_MS },
      (t) => onStep(t),
    );
    const candidates = await resolveCitations(parseFigures(r.text, runNow().getUTCFullYear()), r.retrievedUrls, r.sources);
    debugLog(`${p.name}, search ${attempt + 1}: ${r.model}, complete=${r.complete}, finish=${r.finishReason}, tokens (${r.usage}), ${r.sources.length} grounding sources (${r.sources.map((s) => s.title).join(", ")}), ${r.retrievedUrls.length} pages opened (${r.retrievedUrls.join(", ")}), ${r.queries.length} searches (${r.queries.join(" / ")}), ${candidates.length} figures parsed. Raw answer (${r.text.length} chars):\n${r.text.slice(0, 4000)}`);
    if (candidates.length) onStep(`Opening ${new Set(candidates.map((f) => f.url)).size} cited pages to confirm each figure`);
    const figures = await checkFigures(candidates, { name: p.name, website: p.website }, undefined, debugLog);
    value = { figures, searchEntryPoint: r.searchEntryPoint, ranAt: Date.now(), model: r.model };
    complete = r.complete;
    if (figures.length) break;
  }
  const now = Date.now();
  if (value?.figures.length) {
    const kept: PodcastNumbers = cached ? { ...value, figures: mergeFigures(cached.figures, value.figures), checkedAt: now } : { ...value, checkedAt: now };
    // Only complete answers are kept; no expiry, so the figures stay until a later search confirms newer ones.
    if (complete) await getStore().set(NS, p.id, kept);
    return kept;
  }
  if (cached) {
    onStep("Nothing new confirmed; keeping the figures confirmed earlier");
    const kept: PodcastNumbers = { ...cached, checkedAt: now };
    await getStore().set(NS, p.id, kept);
    return { ...kept, unchanged: true };
  }
  // Nothing confirmed and nothing kept: not saved, so the next click searches again.
  return value;
}
