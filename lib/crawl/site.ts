import "server-only";
import { safeFetch, fetchedUrl, type SafeInit } from "@/lib/enrich/safe-fetch";
import { parseRobots, AGENT, type Robots } from "./robots";
import { readHtml, decodeEntities, type ReadPage } from "./html";

// Athena's own crawl of a brand's site (PRD §23.2 step 4a). Same site only: robots.txt first, then the sitemap and
// the home page's links; Shopify stores also give their whole catalogue at /products.json. Which pages to read
// (products, collections, About, FAQ, stockists, press, blog) is the model's call over the list, passed in as
// `pick`; without it, the shallowest pages go first. Caps on pages, bytes and time; every page keeps its URL.

export type CrawlPage = { url: string } & Omit<ReadPage, "links">;
/** price is in `currency` when the store names it, else in the store's own unnamed currency; options counts priced variants when more than one. */
export type ShopifyProduct = { title: string; url: string; type?: string; vendor?: string; tags: string[]; price?: string; currency?: string; options?: number; available?: boolean; description?: string };
export type Crawl = {
  site: string;
  pages: CrawlPage[];
  products: ShopifyProduct[];
  /** Pages robots.txt asked us not to read, and pages that wouldn't load. */
  skipped: { url: string; why: "robots" | "unreadable" }[];
  candidates: number;
  /** Too little text to work from (often a site drawn by scripts): the caller falls back to URL context and search. */
  thin: boolean;
  ms: number;
};

export type CrawlOptions = {
  maxPages?: number;
  ms?: number;
  pick?: (urls: string[], n: number, site: string) => Promise<string[]>;
  status?: (s: string) => void;
  fetcher?: (url: string, init?: SafeInit) => Promise<Response | undefined>;
};

const UA = `Mozilla/5.0 (compatible; ${AGENT}/0.2)`;
const NOT_PAGES = /\.(jpe?g|png|gif|webp|svg|avif|ico|css|js|mjs|json|xml|pdf|zip|mp4|mov|webm|mp3|woff2?|ttf|eot)(\?|$)/i;
const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
const norm = (u: string) => {
  const x = new URL(u);
  x.hash = "";
  x.search = "";
  return x.toString().replace(/\/$/, "");
};

/** Shallow pages first, then sitemap order. */
export const shallowFirst = (urls: string[], n: number) => [...urls].sort((a, b) => depth(a) - depth(b)).slice(0, n);

export async function crawlSite(start: string, opts: CrawlOptions = {}): Promise<Crawl> {
  const t0 = Date.now();
  const maxPages = opts.maxPages ?? 20;
  const end = t0 + (opts.ms ?? 25_000);
  const left = () => Math.max(500, end - Date.now());
  const get = opts.fetcher ?? safeFetch;
  const fetchText = async (url: string, accept: string, maxBytes = 2 * 1024 * 1024) => {
    const res = await get(url, { headers: { "User-Agent": UA, Accept: accept }, timeoutMs: Math.min(8_000, left()), maxBytes });
    if (!res || !res.ok) return undefined;
    return { url: fetchedUrl(res, url), type: res.headers.get("content-type") ?? "", text: await res.text() };
  };
  const skipped: Crawl["skipped"] = [];
  const out = (pages: CrawlPage[], products: ShopifyProduct[], site: string, candidates: number): Crawl => {
    const chars = pages.reduce((n, p) => n + p.text.length, 0);
    return { site, pages, products, skipped, candidates, thin: !products.length && chars < 1_500, ms: Date.now() - t0 };
  };

  const robotsFor = async (origin: string): Promise<Robots> => {
    const r = await fetchText(`${origin}/robots.txt`, "text/plain", 500_000);
    return parseRobots(r && !/html/i.test(r.type) ? r.text : "");
  };

  let origin: string;
  try {
    origin = new URL(/^https?:\/\//i.test(start) ? start : `https://${start}`).origin;
  } catch {
    return out([], [], start, 0);
  }
  opts.status?.(`Reading ${new URL(origin).hostname}`);
  let robots = await robotsFor(origin);
  const homeUrl = /^https?:\/\//i.test(start) ? start : `https://${start}`;
  if (!robots.allowed(new URL(homeUrl).pathname || "/")) {
    skipped.push({ url: homeUrl, why: "robots" });
    return out([], [], origin, 0);
  }
  const home = await fetchText(homeUrl, "text/html,application/xhtml+xml");
  if (!home || !/html/i.test(home.type)) {
    skipped.push({ url: homeUrl, why: "unreadable" });
    return out([], [], origin, 0);
  }
  // The site is wherever the home page ended up (apex → www, a new domain).
  if (new URL(home.url).origin !== origin) {
    origin = new URL(home.url).origin;
    robots = await robotsFor(origin);
  }
  const host = bare(new URL(origin).hostname);
  const same = (u: string) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && bare(x.hostname) === host;
    } catch {
      return false;
    }
  };
  const homePage = readHtml(home.text, home.url);
  const pages: CrawlPage[] = [{ url: home.url, ...strip(homePage) }];

  // The catalogue, when the store is on Shopify [VERIFY: checked live on a Shopify store, 14 Oct].
  let products: ShopifyProduct[] = [];
  if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(home.text) && robots.allowed("/products.json")) {
    opts.status?.("Reading the product catalogue");
    const p = await fetchText(`${origin}/products.json?limit=250`, "application/json", 5 * 1024 * 1024);
    if (p) products = shopifyProducts(p.text, origin, home.text.match(/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/)?.[1]);
  }

  // Candidate pages: the sitemap (following an index a little way) and the home page's links.
  const locs: string[] = [];
  const maps = (robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`]).filter(same).slice(0, 3);
  for (let i = 0; i < maps.length && i < 8 && locs.length < 2_000 && Date.now() < end - 8_000; i++) {
    const m = await fetchText(maps[i], "application/xml,text/xml", 3 * 1024 * 1024);
    if (!m) continue;
    const found = [...m.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map((x) => decodeEntities(x[1].trim()));
    if (/<sitemapindex/i.test(m.text)) maps.push(...found.filter(same).filter((u) => !maps.includes(u)).slice(0, 8 - maps.length));
    else locs.push(...found);
  }
  const seen = new Set([norm(home.url)]);
  const candidates: string[] = [];
  for (const u of [...homePage.links, ...locs]) {
    if (!same(u) || NOT_PAGES.test(u)) continue;
    const k = norm(u);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!robots.allowed(new URL(u).pathname)) {
      skipped.push({ url: u, why: "robots" });
      continue;
    }
    candidates.push(k);
  }

  const n = maxPages - 1;
  let chosen = candidates.length <= n ? candidates : [];
  if (!chosen.length && candidates.length) {
    opts.status?.(`Choosing ${n} of ${candidates.length} pages to read`);
    const picked = opts.pick ? await opts.pick(candidates.slice(0, 600), n, origin).catch(() => []) : [];
    const ok = picked.map((u) => candidates.find((c) => norm(c) === norm(u))).filter((u): u is string => !!u);
    chosen = [...new Set([...ok, ...shallowFirst(candidates.filter((c) => !ok.includes(c)), n)])].slice(0, n);
  }

  opts.status?.(`Reading ${chosen.length + 1} pages`);
  for (let i = 0; i < chosen.length && Date.now() < end - 1_000; i += 5) {
    const batch = await Promise.all(chosen.slice(i, i + 5).map((u) => fetchText(u, "text/html,application/xhtml+xml").then((r) => [u, r] as const)));
    for (const [u, r] of batch) {
      if (!r || !/html/i.test(r.type) || !same(r.url)) skipped.push({ url: u, why: "unreadable" });
      else pages.push({ url: r.url, ...strip(readHtml(r.text, r.url)) });
    }
  }
  return out(pages, products, origin, candidates.length);
}

const strip = ({ links: _links, ...p }: ReadPage) => ({ ...p, text: p.text.slice(0, 30_000) });

const htmlText = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** 49 → "$49" in USD, 268.5 → "$268.50"; without a currency, the bare number the same way. */
function money(n: number, currency?: string): string {
  const digits = Number.isInteger(n) ? 0 : 2;
  if (currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
    } catch {
      // an unknown code falls through to the bare number
    }
  }
  return n.toFixed(digits);
}

export function shopifyProducts(json: string, origin: string, currency?: string): ShopifyProduct[] {
  try {
    const j = JSON.parse(json) as { products?: unknown };
    if (!Array.isArray(j.products)) return [];
    return j.products.slice(0, 250).flatMap((raw): ShopifyProduct[] => {
      const p = raw as { title?: unknown; handle?: unknown; product_type?: unknown; vendor?: unknown; tags?: unknown; body_html?: unknown; variants?: { price?: unknown; available?: unknown }[] };
      if (typeof p.title !== "string" || typeof p.handle !== "string") return [];
      const prices = (p.variants ?? []).map((v) => Number(v.price)).filter((x) => Number.isFinite(x) && x > 0);
      const lo = prices.length ? Math.min(...prices) : undefined;
      const hi = prices.length ? Math.max(...prices) : undefined;
      return [
        {
          title: p.title,
          url: `${origin}/products/${p.handle}`,
          type: typeof p.product_type === "string" && p.product_type ? p.product_type : undefined,
          vendor: typeof p.vendor === "string" ? p.vendor : undefined,
          tags: (Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? p.tags.split(",") : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12),
          price: lo === undefined ? undefined : lo === hi ? money(lo, currency) : `${money(lo, currency)}–${money(hi!, currency)}`,
          currency: lo === undefined ? undefined : currency,
          options: prices.length > 1 ? prices.length : undefined,
          available: (p.variants ?? []).some((v) => v.available === true) || undefined,
          description: typeof p.body_html === "string" ? htmlText(p.body_html).slice(0, 400) || undefined : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}
