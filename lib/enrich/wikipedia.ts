import "server-only";
import { now } from "@/lib/time/now";

// Cultural momentum from Wikipedia pageviews (PRD §23.2 steps 2 and 5): monthly views of an article from the
// Wikimedia REST API, human traffic only. Free; Wikimedia asks for a User-Agent that names the tool and a contact.
// A title is looked up exactly (following redirects); when there's no such article, the nearest titles come back
// so the agent can choose, never a guess. Cached for a day.

const UA = "Athena/1.0 (https://github.com/siddh8nt/athena; Qloo hackathon)";
const DAY = 86_400_000;
const cache = new Map<string, { at: number; body: unknown }>();

export type Momentum = {
  title: string;
  url: string;
  /** Views per month, oldest first, for the 25 complete months up to the run date: ["2025-09", 457983]. */
  months: [string, number][];
  /** The last 3 complete months against the same 3 months a year earlier (seasonality cancels), e.g. 0.18 = +18%. */
  yoy?: number;
  /** The last 3 complete months against the 3 before them. */
  recent?: number;
  /** Average monthly views over the last 3 complete months. */
  monthly: number;
};

export type MomentumLookup = { found: Momentum } | { missing: string; nearest: string[] };

async function getJson(url: string): Promise<unknown> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < DAY) return hit.body;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  if (!res) return undefined;
  // 404 is an answer (no views recorded), so it's cached like a hit.
  const body = res.ok ? await res.json().catch(() => undefined) : res.status === 404 ? null : undefined;
  if (body !== undefined) {
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    cache.set(url, { at: Date.now(), body });
  }
  return body ?? undefined;
}

/** The article a title names, following redirects; or, when there's none, up to 5 nearest titles. */
async function resolveTitle(title: string): Promise<{ title: string } | { nearest: string[] }> {
  const q = new URLSearchParams({ action: "query", titles: title, redirects: "1", format: "json", formatversion: "2" });
  const j = (await getJson(`https://en.wikipedia.org/w/api.php?${q}`)) as { query?: { pages?: { title: string; missing?: boolean }[] } } | undefined;
  const page = j?.query?.pages?.[0];
  if (page && !page.missing) return { title: page.title };
  const s = new URLSearchParams({ action: "opensearch", search: title, limit: "5", namespace: "0", format: "json" });
  const o = (await getJson(`https://en.wikipedia.org/w/api.php?${s}`)) as [string, string[]] | undefined;
  return { nearest: o?.[1] ?? [] };
}

const ym = (d: Date) => d.toISOString().slice(0, 7);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 1000) / 1000 : undefined);

/** Monthly pageviews and momentum for one article. Never throws. */
export async function wikipediaMomentum(title: string): Promise<MomentumLookup> {
  const r = await resolveTitle(title.trim()).catch(() => ({ nearest: [] as string[] }));
  if (!("title" in r)) return { missing: title, nearest: r.nearest };
  // Complete months only, up to the run date (never past the real one: views don't exist yet).
  const at = new Date(Math.min(Date.now(), now().getTime()));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 2, end.getUTCMonth(), 1));
  const stamp = (d: Date) => `${d.toISOString().slice(0, 10).replace(/-/g, "")}00`;
  const article = encodeURIComponent(r.title.replace(/ /g, "_"));
  const j = (await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${article}/monthly/${stamp(start)}/${stamp(end)}`)) as
    | { items?: { timestamp: string; views: number }[] }
    | null
    | undefined;
  const byMonth = new Map((j?.items ?? []).map((i) => [`${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}`, i.views]));
  // Months with no row had no recorded views.
  const months: [string, number][] = [];
  for (let d = new Date(start); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push([ym(d), byMonth.get(ym(d)) ?? 0]);
  const v = months.map((m) => m[1]);
  const last3 = sum(v.slice(-3));
  return {
    found: {
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${article}`,
      months,
      yoy: v.length >= 15 ? ratio(last3, sum(v.slice(-15, -12))) : undefined,
      recent: v.length >= 6 ? ratio(last3, sum(v.slice(-6, -3))) : undefined,
      monthly: Math.round(last3 / 3),
    },
  };
}
