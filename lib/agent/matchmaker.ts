import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { percentiles } from "@/lib/methods/rank";
import { nameSim } from "@/lib/methods/names";
import { externalId, lookupEntity, narrowestGenre, qlooContact, reasonChips, reverseFit, wikidataId, type PartnerCard } from "@/lib/blocks/partners";
import type { TagChip } from "@/lib/blocks/types";
import { creatorRole } from "@/lib/stops/online";
import type { CrowdCard } from "@/lib/journey/types";
import type { Outcome } from "@/lib/team/types";
import { TIER_LABEL, TIER_ORDER, type Block, type CrowdPage, type CrowdTier, type Detail, type PageTab, type Row, type Section } from "@/lib/team/page";
import { applyOutcomes, itemId, latest } from "./outcomes";
import { FITS, founderLine, type Budget } from "./rep";

// The Matchmaker (PRD §23.5 g): creators, brands and podcasts for all three crowds, each checked from both sides where
// Qloo can, sized into bands, and sized against the founder's budget. Contacts come only from public pages, each with
// its source; drafts are copied or opened in the mail app, never sent. What it leaves out is listed with the reason.

/** A partner whose crowd ranks the brand below this percentile is one-way. */
export const ONE_WAY = 0.5;
/** A creator's audience matches a crowd above this (cosine of the two age and gender leans), differs below DIFFERS. */
export const MATCHES = 0.3;
export const DIFFERS = -0.2;
// [VERIFY] live: the brand cut-offs on Qloo's popularity (0–1, a percentile across all brands) need calibrating.
const BRAND_LARGE = 0.995;
const BRAND_MID = 0.95;
const POD_MID = 0.9;
const REVERSE_BRANDS = 10;
const REVERSE_PODS = 6;
const MAX_BRANDS = 12;
const MAX_PODS = 8;
const DEMO_CAP = 25;
const SEARCH_CAP = 15;

export type Band = "micro" | "mid" | "large";
export type Size = "small" | "mid" | "large";
export type Fit = "fits" | "stretch" | "beyond";
export type Audience = "matches" | "broad" | "differs" | "unchecked";
export type Src = { value: string; src: string };
type Skew = NonNullable<CrowdCard["skew"]>;

export const BAND_LABEL: Record<Band, string> = { micro: "Micro (10k–100k)", mid: "Mid (100k–1M)", large: "Large (1M+)" };
export const SIZE_LABEL: Record<Size, string> = { small: "Small (indie)", mid: "Mid (regional)", large: "Large (national)" };
export const FIT_LABEL: Record<Fit, string> = { fits: "Fits your budget", stretch: "A stretch", beyond: "Beyond budget, gifting only" };
const AUDIENCE_LABEL: Record<Audience, string> = { matches: "Matches your crowd", broad: "Broad audience", differs: "Differs", unchecked: "Not checked" };

/** A grounded read of the candidate brands: which clash with the founder's values, and how big each is with why.
 * Qloo popularity can't size a brand on its own (21 Oct: LaCroix 0.90 sat below Allbirds 0.93, both "indie"). */
export type BrandJudgement = { clashes: Map<string, string>; sizes: Map<string, { size: Size; why: string }> };

export type MatchCrowd = { id: string; name: string; tier: CrowdTier; nearMiss?: boolean; signal: string[]; brands: { id: string; name: string }[]; skew?: Skew; cities: string[]; loves: string[] };

export type Creator = {
  id: string;
  name: string;
  qlooId?: string;
  role?: string;
  platform: "youtube" | "instagram" | "tiktok" | "other";
  handle?: string;
  url?: string;
  found: "Qloo" | "web search";
  callId?: string;
  followers?: { value: number; src: string; approx: boolean };
  band?: Band;
  /** Strength per crowd id, 0–1. */
  crowds: Record<string, number>;
  audience: Audience;
  audienceWhy: string;
  /** Something real from their work (the latest video), with where it came from. */
  work?: string;
  workSrc?: string;
  email?: Src;
  links: { label: string; url: string }[];
};

export type Partner = PartnerCard & {
  crowds: Record<string, number>;
  size?: Size;
  sizeWhy: string;
  /** Podcasts: its place in Apple's US top 100, its feed's owner, how often it posts, its latest episode. */
  chart?: number;
  owner?: Src;
  rss?: Src;
  frequency?: Src;
  latestTitle?: Src;
  /** Brands: emails and pages from its own contact, press or partnership pages. */
  site?: PartnerSite;
};

export type LeftOut = { name: string; kind: "brand" | "podcast" | "creator"; reason: string };
export type Rate = { kind: "creator" | "brand" | "podcast"; band: string; text: string; src?: { title: string; url: string }; estimate: boolean };

export type MatchRead = {
  crowds: MatchCrowd[];
  creators: Creator[];
  brands: Partner[];
  podcasts: Partner[];
  left: LeftOut[];
  rates: Rate[];
  budget: Budget;
  brand: { name: string; product: string };
  ownInQloo: boolean;
  /** Whether the other side could be checked (the brand is in Qloo with enough brands like it). */
  checked: boolean;
  calls: number;
  callIds: string[];
  /** What couldn't be read this time, said plainly on the page. */
  limits: string[];
};

/** A creator a web search found, or sized: every number is approximate and carries its page. */
export type FoundCreator = {
  name: string;
  platform: Creator["platform"];
  handle?: string;
  url?: string;
  followers?: number;
  followersSrc?: string;
  why?: string;
  links?: { label: string; url: string }[];
};
export type YouTubeChannel = { title: string; url: string; subscribers?: number; latest?: string; latestUrl?: string; email?: string };
export type PartnerSite = { emails: Src[]; form?: string; partnerships?: string; src: string };

export type MatchDeps = {
  brand: { name: string; product: string; ownId?: string; competitors: { id: string; name: string }[]; traits: string[] };
  exclude: string[];
  partnerParams: Record<string, unknown>;
  names: Map<string, string>;
  fingerprint: TagChip[];
  budget: Budget;
  status?: (s: string) => void;
  /** Real subscriber counts and the latest video, by creator name (optional: YOUTUBE_API_KEY). */
  youtube?: (creators: { name: string; handle?: string; url?: string }[]) => Promise<Map<string, YouTubeChannel>>;
  /** Creators a web search finds for a crowd, with approximate sizes; `known` are sized too. */
  findCreators?: (crowd: MatchCrowd, brand: { name: string; product: string }, known: string[]) => Promise<FoundCreator[]>;
  /** Brands whose values conflict with the brand's, each with the reason. */
  judgeValues?: (brand: { name: string; product: string; traits: string[] }, names: string[]) => Promise<BrandJudgement>;
  /** Fills podcasts' Apple, RSS, chart and Podcast Index details in place. */
  podcasts?: (pods: Partner[]) => Promise<void>;
  /** Fills brands' official websites (Wikidata) in place. */
  websites?: (cards: PartnerCard[]) => Promise<void>;
  /** Reads brands' own contact, press and partnership pages. */
  sites?: (brands: Partner[]) => Promise<Map<string, PartnerSite>>;
  /** Public rates per band, each with its page, or nothing. */
  rates?: (bands: { kind: Rate["kind"]; band: string }[]) => Promise<Rate[]>;
};

/** The crowds as the Matchmaker reads them, from the Scout's tiers. */
export function matchCrowds(crowds: { crowd: CrowdCard; tier: CrowdTier }[]): MatchCrowd[] {
  return crowds.map(({ crowd, tier }) => ({
    id: crowd.id,
    name: crowd.name,
    tier,
    ...(crowd.nearMiss ? { nearMiss: true } : {}),
    signal: crowd.signal.map((x) => x.id).slice(0, 50),
    brands: (crowd.brands ?? []).slice(0, 8).map((b) => ({ id: b.id, name: b.name })),
    skew: crowd.skew,
    cities: crowd.cities.slice(0, 4).map((c) => c.name),
    loves: crowd.loves.slice(0, 8).map((l) => l.name),
  }));
}

const round = (x: number) => Math.round(x * 100) / 100;
const AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
const vec = (d: { age?: Record<string, number>; gender?: Record<string, number> }) => [...AGES.map((k) => d.age?.[k] ?? 0), d.gender?.female ?? (d.gender?.male !== undefined ? -d.gender.male : 0)];

/** How alike two leans are, -1 to 1. */
export function audienceMatch(crowd: { age?: Record<string, number>; gender?: Record<string, number> }, them: { age?: Record<string, number>; gender?: Record<string, number> }): number {
  const a = vec(crowd);
  const b = vec(them);
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? round(dot / n) : 0;
}

/** A crowd's lean in words: "25–34, mostly women". */
export function leanOf(skew?: Skew): string {
  if (!skew?.clear) return "No clear age or gender lean";
  const LABEL: Record<string, string> = { "24_and_younger": "24 and under", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };
  const top = Object.entries(skew.age).filter(([k]) => LABEL[k]).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.1).slice(0, 2).map(([k]) => LABEL[k]);
  const f = skew.gender.female ?? (skew.gender.male !== undefined ? -skew.gender.male : 0);
  const g = f >= 0.1 ? "leans women" : f <= -0.1 ? "leans men" : "";
  return [top.length ? `Leans ${top.join(" and ")}` : "", g].filter(Boolean).join(", ") || "No clear age or gender lean";
}

export function bandOf(followers?: number): Band | undefined {
  if (followers === undefined) return undefined;
  return followers >= 1_000_000 ? "large" : followers >= 100_000 ? "mid" : "micro";
}

/** A creator band or a partner size against the budget. */
export function fitOf(b: Band | Size | undefined, budget: Budget): Fit | undefined {
  if (!b) return undefined;
  const level = b === "large" ? 2 : b === "mid" ? 1 : 0;
  const reach = budget === "high" ? 1 : budget === "mid" ? 0.5 : 0;
  return level <= reach ? "fits" : level - reach <= 1 ? "stretch" : "beyond";
}

/** What to offer, by kind and band. Shapes only, never a price. */
export function offerOf(kind: "creator" | "brand" | "podcast", b: Band | Size | undefined, budget: Budget): string {
  const fit = fitOf(b, budget);
  if (kind === "creator") {
    if (fit === "beyond") return "Gifting only: send the product with a note, no ask";
    if (b === "large") return "A one-off paid post, once they've tried the product";
    if (b === "mid") return "A paid post or a short series";
    return "Gifting first, then a paid post if it lands";
  }
  if (kind === "brand") {
    if (b === "large") return budget === "high" ? "A co-branded drop" : "A shared giveaway";
    if (b === "mid") return "A shared giveaway or a shared pop-up";
    return "A bundle or a shared giveaway";
  }
  if (b === "large") return fit === "beyond" ? "A guest spot" : "A sponsored episode";
  if (b === "mid") return fit === "fits" ? "A host-read ad" : "A guest spot";
  return "A guest spot, or a host-read ad";
}

export const BRAND_FORMATS = ["Co-branded drop", "Bundle", "Giveaway", "Shared pop-up"];
export const POD_FORMATS = ["Guest spot", "Host-read ad", "Sponsored episode"];

const brandSize = (p?: number): { size?: Size; why: string } =>
  !p ? { why: "Qloo gives no popularity for it" } : p >= BRAND_LARGE ? { size: "large", why: `Qloo popularity ${round(p)}: known nationally` } : p >= BRAND_MID ? { size: "mid", why: `Qloo popularity ${round(p)}: known regionally` } : { size: "small", why: `Qloo popularity ${round(p)}: an indie name` };

/** Reads creators, brands and podcasts for every crowd. Never throws; a call that fails leaves its slot empty. */
export async function readMatches(qloo: QlooClient, crowds: MatchCrowd[], deps: MatchDeps): Promise<MatchRead> {
  const callIds: string[] = [];
  let calls = 0;
  const limits: string[] = [];
  const left: LeftOut[] = [];
  const insights = async (params: Record<string, unknown>) => {
    calls++;
    try {
      const res = await qloo.insights(params as never);
      callIds.push(res.call.id);
      return { entities: results(res).entities ?? [], demographics: results(res).demographics, callId: res.call.id };
    } catch {
      return { entities: [] as QlooEntity[], demographics: undefined, callId: "" };
    }
  };
  const b = deps.brand;

  // The brand itself and the brands like it: the other side is ranked among them.
  deps.status?.("Reading the brands, podcasts and creators each crowd over-indexes on");
  const own = b.ownId ? (calls++, await lookupEntity(qloo, b.ownId).catch(() => undefined)) : undefined;
  const narrow = narrowestGenre(own?.tags);
  const peers = b.ownId && narrow ? await insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": b.ownId, "filter.tags": narrow, "filter.exclude.entities": b.ownId, take: 14 }) : undefined;
  const peerSet = b.ownId ? [b.ownId, ...(peers?.entities ?? []).map((e) => e.entity_id)] : [];
  const canCheck = !!b.ownId && peerSet.length >= 2;
  const ownTier = own?.properties?.price_tier;

  const per = await Promise.all(
    crowds.map(async (c) => {
      const signal = c.signal.length ? c.signal : c.brands.map((x) => x.id);
      if (!signal.length) return { brands: { entities: [] as QlooEntity[], callId: "" }, pods: { entities: [] as QlooEntity[], callId: "" }, people: { entities: [] as QlooEntity[], callId: "" } };
      const [brands, pods, people] = await Promise.all([
        insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": signal, "filter.exclude.entities": deps.exclude.slice(0, 50), "feature.explainability": true, take: 50, ...deps.partnerParams }),
        insights({ "filter.type": "urn:entity:podcast", "signal.interests.entities": signal, "feature.explainability": true, take: 20, ...deps.partnerParams }),
        insights({ "filter.type": "urn:entity:person", "signal.interests.entities": signal, "filter.popularity.max": 0.9, take: 30 }),
      ]);
      return { brands, pods, people };
    }),
  );

  // ---- Brands: merged across crowds, rivals and the brand's own category left out with the reason.
  const rivals = new Set(b.competitors.map((x) => x.id));
  const brandMap = new Map<string, Partner>();
  crowds.forEach((c, k) => {
    const got = per[k].brands;
    const pFwd = percentiles(got.entities.map((e) => e.entity_id));
    got.entities.forEach((e, i) => {
      const s = round(1 - i / Math.max(1, got.entities.length));
      const prev = brandMap.get(e.entity_id);
      if (prev) return void (prev.crowds[c.id] = Math.max(prev.crowds[c.id] ?? 0, s));
      if (e.entity_id === b.ownId) return;
      if (rivals.has(e.entity_id)) return void left.push({ name: e.name, kind: "brand", reason: "A rival of yours" });
      if (narrow && (e.tags ?? []).some((t) => (t.id ?? t.tag_id) === narrow)) return void left.push({ name: e.name, kind: "brand", reason: `Sells in your own category (${(e.tags ?? []).find((t) => (t.id ?? t.tag_id) === narrow)?.name ?? "the same niche"})` });
      if (ownTier !== undefined && e.properties?.price_tier !== undefined && Math.abs(e.properties.price_tier - ownTier) > 1) return void left.push({ name: e.name, kind: "brand", reason: "Priced too far from you for a shared offer" });
      const sz = brandSize(e.popularity);
      brandMap.set(e.entity_id, {
        rank: 0,
        id: e.entity_id,
        name: e.name,
        kind: "brand",
        priceTier: e.properties?.price_tier,
        popularity: e.popularity,
        pForward: pFwd.get(e.entity_id) ?? 0,
        reasons: reasonChips(e, got.callId, deps.names, deps.fingerprint),
        wikidataId: wikidataId(e),
        contact: qlooContact(e, got.callId),
        crowds: { [c.id]: s },
        size: sz.size,
        sizeWhy: sz.why,
      });
    });
  });
  const n = (p: { crowds: Record<string, number> }) => Object.values(p.crowds).filter((x) => x >= FITS).length;
  const sum = (p: { crowds: Record<string, number> }) => Object.values(p.crowds).reduce((a, x) => a + x, 0);
  const byFit = <T extends { crowds: Record<string, number> }>(xs: T[]) => [...xs].sort((a, c) => n(c) - n(a) || sum(c) - sum(a));
  let brands = byFit([...brandMap.values()]).slice(0, MAX_BRANDS);

  // ---- Podcasts, merged the same way.
  const podMap = new Map<string, Partner>();
  crowds.forEach((c, k) => {
    const got = per[k].pods;
    const pFwd = percentiles(got.entities.map((e) => e.entity_id));
    got.entities.forEach((e, i) => {
      const s = round(1 - i / Math.max(1, got.entities.length));
      const prev = podMap.get(e.entity_id);
      if (prev) return void (prev.crowds[c.id] = Math.max(prev.crowds[c.id] ?? 0, s));
      podMap.set(e.entity_id, {
        rank: 0,
        id: e.entity_id,
        name: e.name,
        kind: "podcast",
        popularity: e.popularity,
        pForward: pFwd.get(e.entity_id) ?? 0,
        reasons: reasonChips(e, got.callId, deps.names, deps.fingerprint),
        contact: qlooContact(e, got.callId),
        itunesId: externalId(e, "itunes"),
        description: typeof e.properties?.description === "string" ? e.properties.description.slice(0, 300) : undefined,
        crowds: { [c.id]: s },
        sizeWhy: "",
      });
    });
  });
  let podcasts = byFit([...podMap.values()]).slice(0, MAX_PODS);

  // ---- Creators: Qloo's people who make things people follow, then a web search for more and for sizes.
  const creatorMap = new Map<string, Creator>();
  crowds.forEach((c, k) => {
    const got = per[k].people;
    const kept = got.entities.filter((e) => creatorRole(e));
    kept.forEach((e, i) => {
      const s = round(1 - i / Math.max(1, kept.length));
      const prev = creatorMap.get(e.entity_id);
      if (prev) return void (prev.crowds[c.id] = Math.max(prev.crowds[c.id] ?? 0, s));
      const ig = externalId(e, "instagram");
      const yt = externalId(e, "youtube");
      creatorMap.set(e.entity_id, {
        id: itemId("creator", e.name),
        name: e.name,
        qlooId: e.entity_id,
        role: creatorRole(e),
        platform: yt ? "youtube" : ig ? "instagram" : "other",
        handle: ig ?? undefined,
        url: ig ? `https://www.instagram.com/${ig}` : undefined,
        found: "Qloo",
        callId: got.callId,
        crowds: { [c.id]: s },
        audience: "unchecked",
        audienceWhy: "",
        links: [...(ig ? [{ label: "Instagram", url: `https://www.instagram.com/${ig}` }] : [])],
      });
    });
  });

  // The slower parts run side by side; each fills its own lists.
  const reverse = async () => {
    if (!canCheck) return;
    deps.status?.("Checking the other side: how much each partner's crowd likes you back");
    const top = brands.slice(0, REVERSE_BRANDS);
    const pods = podcasts.slice(0, REVERSE_PODS);
    calls += top.length + pods.length;
    const [rb, rp] = await Promise.all([
      Promise.all(top.map((c) => reverseFit(qloo, c, b.ownId!, peerSet).catch(() => c))),
      Promise.all(pods.map((c) => reverseFit(qloo, c, b.ownId!, peerSet).catch(() => c))),
    ]);
    for (const r of [...rb, ...rp]) if (r.reverseRank) callIds.push(r.reverseRank.callId);
    const merge = (xs: Partner[], got: PartnerCard[]) => xs.map((x) => ({ ...x, ...(got.find((g) => g.id === x.id) ? { pReverse: got.find((g) => g.id === x.id)!.pReverse, mutual: got.find((g) => g.id === x.id)!.mutual, reverseRank: got.find((g) => g.id === x.id)!.reverseRank } : {}) }));
    brands = merge(brands, rb);
    podcasts = merge(podcasts, rp);
  };
  const people = async () => {
    if (deps.findCreators) {
      deps.status?.("Searching the web for the creators each crowd follows, and how big they are");
      const known = [...creatorMap.values()].map((c) => c.name);
      const found = await Promise.all(crowds.map((c) => deps.findCreators!(c, b, known).catch(() => [] as FoundCreator[])));
      crowds.forEach((c, k) => {
        found[k].forEach((f, i) => {
          const s = round(1 - i / Math.max(1, found[k].length));
          const same = [...creatorMap.values()].find((x) => nameSim(x.name, f.name) >= 0.9);
          const followers = f.followers && f.followers > 0 ? { value: Math.round(f.followers), src: f.followersSrc ?? "web search", approx: true } : undefined;
          if (same) {
            same.crowds[c.id] = Math.max(same.crowds[c.id] ?? 0, s);
            if (same.platform === "other" || same.platform === f.platform) {
              same.platform = f.platform;
              same.handle = f.handle ?? same.handle;
              same.url = f.url ?? same.url;
            }
            same.followers ??= followers;
            for (const l of f.links ?? []) if (!same.links.some((x) => x.url === l.url)) same.links.push(l);
            return;
          }
          creatorMap.set(`web:${f.name.toLowerCase()}`, {
            id: itemId("creator", f.name),
            name: f.name,
            platform: f.platform,
            handle: f.handle,
            url: f.url,
            found: "web search",
            followers,
            crowds: { [c.id]: s },
            audience: "unchecked",
            audienceWhy: "",
            links: [...(f.url ? [{ label: f.platform === "other" ? "Profile" : f.platform[0].toUpperCase() + f.platform.slice(1), url: f.url }] : []), ...(f.links ?? []).filter((l) => l.url !== f.url)],
          });
        });
      });
      // Web-found names in Qloo, so their audience can be read.
      const unknown = [...creatorMap.values()].filter((c) => !c.qlooId).slice(0, SEARCH_CAP);
      await Promise.all(
        unknown.map(async (c) => {
          calls++;
          const res = await qloo.search({ query: c.name, types: "urn:entity:person", take: 3 }).catch(() => undefined);
          if (!res) return;
          callIds.push(res.call.id);
          const hit = res.entities.find((e) => nameSim(e.name, c.name) >= 0.9);
          if (hit) c.qlooId = hit.entity_id;
        }),
      );
    } else limits.push("Creator sizes need a web search, which is off here; Qloo's creators are shown without sizes");
    // Who follows them, as Qloo reads it, against each crowd they fit.
    const withId = [...creatorMap.values()].filter((c) => c.qlooId).slice(0, DEMO_CAP);
    await Promise.all(
      withId.map(async (c) => {
        const got = await insights({ "filter.type": "urn:demographics", "signal.interests.entities": c.qlooId });
        const d = got.demographics?.[0]?.query;
        if (!d) return;
        const theirs = crowds.filter((x) => c.crowds[x.id] !== undefined);
        if (theirs.every((x) => !x.skew?.clear)) {
          c.audience = "matches";
          c.audienceWhy = "Your crowd has no clear age or gender lean, so their audience can't differ from it";
          return;
        }
        const scored = theirs.filter((x) => x.skew?.clear).map((x) => ({ x, m: audienceMatch(x.skew!, d) })).sort((a, z) => z.m - a.m)[0];
        c.audience = scored.m > MATCHES ? "matches" : scored.m < DIFFERS ? "differs" : "broad";
        c.audienceWhy =
          c.audience === "matches"
            ? `Their followers lean like ${scored.x.name} (${leanOf(scored.x.skew)})`
            : c.audience === "differs"
              ? `Their followers lean away from ${scored.x.name} (${leanOf(scored.x.skew)})`
              : "Their followers are broad: some of your crowd, many others";
      }),
    );
    for (const c of creatorMap.values()) if (c.audience === "unchecked") c.audienceWhy = "Qloo has no audience read for them; check their audience before you pay";
    if (deps.youtube) {
      const yt = [...creatorMap.values()].filter((c) => c.platform === "youtube" && (c.handle || c.url));
      if (yt.length) {
        deps.status?.("Reading the creators' YouTube channels for real subscriber counts");
        const got = await deps.youtube(yt.map((c) => ({ name: c.name, handle: c.handle, url: c.url }))).catch(() => new Map<string, YouTubeChannel>());
        for (const c of yt) {
          const ch = got.get(c.name);
          if (!ch) continue;
          if (ch.subscribers !== undefined) c.followers = { value: ch.subscribers, src: "YouTube Data API", approx: false };
          c.url = ch.url;
          if (ch.latest) ((c.work = ch.latest), (c.workSrc = ch.latestUrl ?? ch.url));
          if (ch.email) c.email = { value: ch.email, src: "channel description" };
          if (!c.links.some((l) => l.url === ch.url)) c.links.unshift({ label: "YouTube", url: ch.url });
        }
      }
    } else limits.push("YouTube subscriber counts are off until a YouTube key is added; sizes there are approximate");
  };
  const values = async () => {
    if (!deps.judgeValues || !brands.length) return;
    const got = await deps.judgeValues({ name: b.name, product: b.product, traits: b.traits }, brands.map((x) => x.name)).catch((): BrandJudgement => ({ clashes: new Map(), sizes: new Map() }));
    for (const [name, reason] of got.clashes) left.push({ name, kind: "brand", reason: `Values clash: ${reason}` });
    brands = brands.filter((x) => !got.clashes.has(x.name)).map((x) => (got.sizes.has(x.name) ? { ...x, size: got.sizes.get(x.name)!.size, sizeWhy: got.sizes.get(x.name)!.why } : x));
  };
  const details = async () => {
    await Promise.all([
      deps.websites ? deps.websites(brands).catch(() => undefined) : undefined,
      deps.podcasts ? deps.podcasts(podcasts).catch(() => undefined) : undefined,
    ]);
    if (deps.sites) {
      deps.status?.("Reading partners' contact, press and partnership pages for a public email");
      const got = await deps.sites(brands.filter((x) => x.contact.website?.value)).catch(() => new Map<string, PartnerSite>());
      brands = brands.map((x) => (got.has(x.id) ? { ...x, site: got.get(x.id) } : x));
    }
  };
  await Promise.all([reverse(), people(), values()]);
  await details();

  // One-way partners leave, with the reason.
  const oneWay = (p: Partner) => p.pReverse !== undefined && p.pReverse < ONE_WAY;
  for (const p of [...brands, ...podcasts].filter(oneWay)) left.push({ name: p.name, kind: p.kind, reason: p.kind === "brand" ? "Their fans wouldn't love you back: they rank you in the bottom half of brands like you" : "Their listeners rank you in the bottom half of brands like you" });
  brands = brands.filter((p) => !oneWay(p)).map((p, i) => ({ ...p, rank: i + 1 }));
  podcasts = podcasts
    .filter((p) => !oneWay(p))
    .map((p, i) => {
      const size: Size = p.chart ? "large" : (p.popularity ?? 0) >= POD_MID ? "mid" : "small";
      const sizeWhy = p.chart ? `#${p.chart} in Apple's US top 100 podcasts` : `Qloo popularity ${round(p.popularity ?? 0)}${size === "mid" ? ": widely heard" : ": a niche show"}`;
      return { ...p, rank: i + 1, size, sizeWhy };
    });
  const creators = [...creatorMap.values()].map((c) => ({ ...c, band: bandOf(c.followers?.value) }));
  for (const c of creators.filter((x) => x.audience === "differs")) left.push({ name: c.name, kind: "creator", reason: c.audienceWhy });
  const kept = byFit(creators.filter((c) => c.audience !== "differs")).sort((a, z) => Number(z.audience === "matches") - Number(a.audience === "matches"));

  if (!b.ownId) limits.push(`The other side can't be checked while ${b.name} isn't in Qloo`);
  else if (!canCheck) limits.push(`The other side can't be checked yet: Qloo lists no brands like ${b.name} to rank it against`);
  limits.push("Creators can't be matched to cities: Qloo reads who follows them, not where");

  // Public rates per band, when a page states them.
  const bands = [
    ...[...new Set(kept.map((c) => c.band).filter((x): x is Band => !!x))].map((x) => ({ kind: "creator" as const, band: x })),
    ...[...new Set(podcasts.map((p) => p.size!))].map((x) => ({ kind: "podcast" as const, band: x })),
  ];
  const rates = deps.rates && bands.length ? await deps.rates(bands).catch(() => [] as Rate[]) : [];

  return {
    crowds,
    creators: kept,
    brands,
    podcasts,
    left: [...new Map(left.map((l) => [`${l.kind}:${l.name.toLowerCase()}`, l])).values()],
    rates,
    budget: deps.budget,
    brand: { name: b.name, product: b.product },
    ownInQloo: !!b.ownId,
    checked: canCheck,
    calls,
    callIds,
    limits,
  };
}

// ---- The page ------------------------------------------------------------------------------------------------------

const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const fitsOf = (p: { crowds: Record<string, number> }) => Object.entries(p.crowds).filter(([, v]) => v >= FITS).map(([k]) => k);
const count = (v: number) => (v >= 1_000_000 ? `${round(v / 1_000_000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
const PLATFORM: Record<Creator["platform"], string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", other: "Web" };
const YT_EMAIL = "Open the channel's About tab and select View email address; if it isn't there, the creator hasn't published one";

export type Ask = { subject: string; body: string };
type PageOpts = { outcomes: Outcome[]; asks?: Record<string, Ask>; at?: number };

const sizeOf = (c: Creator) => (c.followers ? `${count(c.followers.value)}${c.followers.approx ? " approx." : ""}` : "On their profile");
const emailOf = (x: Creator | Partner): Src | undefined =>
  "platform" in x ? x.email : x.contact.email ? { value: x.contact.email.value, src: x.kind === "podcast" ? "the show's RSS feed" : x.contact.email.source } : x.site?.emails[0];

/** How to reach them: a public email with its source, else where to write. */
export function contactLine(x: Creator | Partner): string {
  const e = emailOf(x);
  if (e) return `${e.value} (from ${e.src})`;
  if ("platform" in x) return x.platform === "youtube" ? `No email found: ${YT_EMAIL}` : x.links.length ? `No public email: message them on ${x.links[0].label} (draft below)` : "No public email: find their profile before you write";
  if (x.site?.form) return "No public email: use the contact form (draft below)";
  if (x.site?.partnerships) return "No public email: use their partnerships page";
  return x.contact.instagram ? "No public email: message them on Instagram (draft below)" : "No public email found yet";
}

/** The rate line for a kind and band: the public one with its page, else ask. */
function rateOf(read: MatchRead, kind: Rate["kind"], band?: string): { text: string; src?: { title: string; url: string } } {
  const r = band ? read.rates.find((x) => x.kind === kind && x.band === band) : undefined;
  if (!r?.src) return { text: "Ask for their rate card" };
  return { text: `${r.text}${r.estimate ? " (estimate)" : ""}`, src: r.src };
}

/** The first-contact note: it opens on something real from their work, then the band's offer. Never sent. */
export function askFor(read: MatchRead, x: Creator | Partner, ask?: Ask): NonNullable<Detail["draft"]> {
  const e = emailOf(x);
  const to = e ? { to: e.value, toSrc: e.src } : {};
  const brand = read.brand.name;
  const isCreator = "platform" in x;
  const kind = isCreator ? "creator" : x.kind;
  const band = isCreator ? x.band : x.size;
  const offer = offerOf(kind, band, read.budget);
  const loves = !isCreator ? x.reasons.map((r) => r.label).filter((l) => /^Loved by fans of /.test(l)).map((l) => l.replace(/^Loved by fans of /, "")) : [];
  const names = [brand, x.name, ...(isCreator && x.work ? [x.work] : []), ...(!isCreator && x.latestTitle ? [x.latestTitle.value] : []), ...loves];
  if (ask) return { subject: ask.subject, body: ask.body, ...to, names };
  const opener = isCreator
    ? x.work
      ? `I loved your recent video, "${x.work}".`
      : `People who love ${brand} follow what you make.`
    : x.kind === "podcast"
      ? x.latestTitle
        ? `I enjoyed your latest episode, "${x.latestTitle.value}".`
        : "Our customers listen to your show."
      : loves.length
        ? `Your fans and ours both love ${loves[0]}.`
        : "Your fans and ours love a lot of the same things.";
  const close = isCreator ? (fitOf(band, read.budget) === "beyond" ? "Could I send you some to try, with no ask attached?" : "Would you be open to it?") : "Would you be open to a short call?";
  const offerLine = `I'd love to explore ${offer.toLowerCase().replace(/^gifting only: /, "")}.`;
  if (!e && (isCreator || !(x as Partner).site?.form)) return { body: `Hi ${x.name}, ${opener} ${founderLine(brand, read.brand.product)} ${offerLine} ${close}`, names };
  return { subject: `${brand} × ${x.name}`, body: `Hi ${x.name},\n\n${opener} ${founderLine(brand, read.brand.product)} ${offerLine} ${close}\n\nThanks,\n${brand}`, ...to, names };
}

const crowdNames = (read: MatchRead, x: { crowds: Record<string, number> }) => fitsOf(x).map((id) => read.crowds.find((c) => c.id === id)?.name ?? id);
const hasEmail = (x: Creator | Partner) => (emailOf(x) ? "Has email" : "No email");

function creatorDetail(read: MatchRead, c: Creator, ask?: Ask): Detail {
  const fit = fitOf(c.band, read.budget);
  const rate = rateOf(read, "creator", c.band);
  return {
    title: c.name,
    item: c.id,
    kind: "creator",
    group: "creator",
    facts: [
      { label: "Platform", value: PLATFORM[c.platform] },
      ...(c.role ? [{ label: "What they do", value: c.role }] : []),
      { label: "Size", value: c.followers ? `${count(c.followers.value)} followers${c.followers.approx ? " approx." : ""} (from ${c.followers.src})` : "On their profile: open it to check" },
      { label: "Band", value: c.band ? BAND_LABEL[c.band] : "Unknown until their size is found" },
      { label: "Budget fit", value: fit ? FIT_LABEL[fit] : "Unknown until their size is found" },
      { label: "Audience", value: `${AUDIENCE_LABEL[c.audience]}: ${c.audienceWhy}` },
      ...read.crowds.map((x) => ({ label: `Fit for ${x.name}`, value: (c.crowds[x.id] ?? 0) >= FITS ? String(c.crowds[x.id]) : "Not a fit" })),
      { label: "Offer", value: offerOf("creator", c.band, read.budget) },
      { label: "Rate", value: rate.src ? `${rate.text} (from ${rate.src.title})` : rate.text },
      { label: "Contact", value: contactLine(c) },
      { label: "Found by", value: c.found === "Qloo" ? "Qloo: your crowd over-indexes on them" : "Web search, checked against Qloo's read of who follows them" },
    ],
    lines: [...(c.work ? [`Latest: "${c.work}"`] : []), ...(c.platform === "youtube" && !c.email ? [YT_EMAIL] : [])],
    draft: askFor(read, c, ask),
    links: [...c.links, ...(rate.src ? [{ label: "Rate source", url: rate.src.url }] : [])],
  };
}

function partnerDetail(read: MatchRead, p: Partner, ask?: Ask): Detail {
  const isBrand = p.kind === "brand";
  const rate = isBrand ? undefined : rateOf(read, "podcast", p.size);
  const fit = fitOf(p.size, read.budget);
  return {
    title: p.name,
    item: itemId(isBrand ? "partner" : "podcast", p.name),
    kind: isBrand ? "partner" : "podcast",
    group: isBrand ? "brand" : "podcast",
    facts: [
      { label: "Size", value: p.size ? `${SIZE_LABEL[p.size]}: ${p.sizeWhy}` : p.sizeWhy },
      ...(fit ? [{ label: "Budget fit", value: FIT_LABEL[fit].replace(", gifting only", isBrand ? ", a swap only" : ", a guest spot only") }] : []),
      {
        label: "Both ways",
        value:
          p.pReverse === undefined
            ? read.checked
              ? "Not checked: outside the top partners"
              : "Can't be checked yet"
            : `Their ${isBrand ? "fans" : "listeners"} rank you #${p.reverseRank?.rank ?? "?"} of ${p.reverseRank?.of ?? "?"} brands like you${(p.mutual ?? 0) >= 0.7 ? ": a strong fit both ways" : ""}`,
      },
      ...read.crowds.map((x) => ({ label: `Fit for ${x.name}`, value: (p.crowds[x.id] ?? 0) >= FITS ? String(p.crowds[x.id]) : "Not a fit" })),
      { label: "Format", value: `${offerOf(isBrand ? "brand" : "podcast", p.size, read.budget)} (also: ${(isBrand ? BRAND_FORMATS : POD_FORMATS).join(", ")})` },
      ...(p.owner ? [{ label: "Owner", value: `${p.owner.value} (from ${p.owner.src})` }] : []),
      ...(p.frequency ? [{ label: "Posts", value: `${p.frequency.value} (from ${p.frequency.src})` }] : []),
      ...(p.contact.episodes ? [{ label: "Episodes", value: `${p.contact.episodes.value} (from ${p.contact.episodes.source})` }] : []),
      ...(p.inactive ? [{ label: "Activity", value: "No new episode for over 60 days" }] : []),
      ...(rate ? [{ label: "Rate", value: rate.src ? `${rate.text} (from ${rate.src.title})` : rate.text }] : []),
      { label: "Contact", value: contactLine(p) },
    ],
    lines: [...p.reasons.map((r) => r.label), ...(p.latestTitle ? [`Latest episode: "${p.latestTitle.value}"`] : [])],
    draft: askFor(read, p, ask),
    links: [
      ...(p.contact.site?.value ? [{ label: "Website", url: p.contact.site.value }] : []),
      ...(p.contact.website?.value ? [{ label: isBrand ? "Website" : "Apple Podcasts", url: p.contact.website.value }] : []),
      ...(p.contact.instagram?.value ? [{ label: "Instagram", url: p.contact.instagram.value }] : []),
      ...(p.contact.x?.value ? [{ label: "X", url: p.contact.x.value }] : []),
      ...(p.rss ? [{ label: "RSS feed", url: p.rss.value }] : []),
      ...(p.site?.partnerships ? [{ label: "Partnerships page", url: p.site.partnerships }] : []),
      ...(p.site?.form ? [{ label: "Contact form", url: p.site.form }] : []),
      ...(rate?.src ? [{ label: "Rate source", url: rate.src.url }] : []),
    ],
  };
}

const FACETS = ["Group", "Band", "Budget fit", "Has email"];
const facetsOf = (read: MatchRead, x: Creator | Partner): Record<string, string[]> => {
  const isCreator = "platform" in x;
  const band = isCreator ? x.band : x.size;
  const fit = fitOf(band, read.budget);
  return {
    Group: [isCreator ? "Creator" : x.kind === "brand" ? "Brand" : "Podcast"],
    Band: [band ? (isCreator ? BAND_LABEL[band as Band] : SIZE_LABEL[band as Size]) : "Size unknown"],
    "Budget fit": [fit ? FIT_LABEL[fit] : "Unknown"],
    "Has email": [hasEmail(x)],
    Crowd: crowdNames(read, x),
  };
};

const creatorRow = (read: MatchRead, c: Creator, opts: PageOpts): Row => {
  const fit = fitOf(c.band, read.budget);
  return { cells: [c.name, PLATFORM[c.platform], sizeOf(c), c.band ? BAND_LABEL[c.band].split(" ")[0] : "—", fit ? FIT_LABEL[fit] : "—", AUDIENCE_LABEL[c.audience], emailOf(c) ? "Email" : "DM"], detail: creatorDetail(read, c, opts.asks?.[c.id]), facets: facetsOf(read, c) };
};
const CREATOR_COLUMNS = ["Creator", "Platform", "Size", "Band", "Budget fit", "Audience", "Contact"];

const partnerRow = (read: MatchRead, p: Partner, opts: PageOpts): Row => {
  const isBrand = p.kind === "brand";
  const both = p.pReverse === undefined ? "Not checked" : (p.mutual ?? 0) >= 0.7 ? "Strong" : "Yes";
  const id = itemId(isBrand ? "partner" : "podcast", p.name);
  return {
    cells: isBrand
      ? [p.name, p.size ? SIZE_LABEL[p.size].split(" ")[0] : "—", both, offerOf("brand", p.size, read.budget), emailOf(p) ? "Email" : p.site?.form ? "Form" : "DM"]
      : [p.name, p.size ? SIZE_LABEL[p.size].split(" ")[0] : "—", both, offerOf("podcast", p.size, read.budget), p.frequency?.value ?? "—", emailOf(p) ? "Email" : "DM"],
    detail: partnerDetail(read, p, opts.asks?.[id]),
    facets: facetsOf(read, p),
  };
};
const BRAND_COLUMNS = ["Brand", "Size", "Both ways", "Format", "Contact"];
const POD_COLUMNS = ["Podcast", "Size", "Both ways", "Format", "Posts", "Contact"];

/** In the order to reach out: by fit, then what the founder's marks say works; heard-back ones leave. */
function ordered<T extends Creator | Partner>(xs: T[], outcomes: Outcome[]): T[] {
  const items = xs.map((x) => ({ x, id: "platform" in x ? x.id : itemId(x.kind === "brand" ? "partner" : "podcast", x.name), kind: "platform" in x ? "creator" : x.kind === "brand" ? "partner" : "podcast", group: "platform" in x ? "creator" : x.kind }));
  return applyOutcomes(items, outcomes, "matchmaker").items.map((i) => i.x);
}

const bandFits = (read: MatchRead) => (["micro", "mid", "large"] as Band[]).map((x) => `${BAND_LABEL[x].split(" ")[0]}: ${FIT_LABEL[fitOf(x, read.budget)!].toLowerCase()}`).join(" · ");

function crowdTab(read: MatchRead, c: MatchCrowd, opts: PageOpts): PageTab {
  const mine = <T extends { crowds: Record<string, number> }>(xs: T[]) => xs.filter((x) => (x.crowds[c.id] ?? 0) >= FITS);
  const creators = ordered(mine(read.creators), opts.outcomes);
  const brands = ordered(mine(read.brands), opts.outcomes);
  const podcasts = ordered(mine(read.podcasts), opts.outcomes);
  const sections: Section[] = [
    {
      id: "profile",
      title: "Who to match",
      summary: `Partners whose audience looks like ${c.name}`,
      blocks: [
        {
          type: "facts",
          rows: [
            { label: "The audience to match", value: leanOf(c.skew) },
            { label: "Where they are", value: and(c.cities) || "—" },
            { label: "What they love", value: c.loves.slice(0, 6).join(", ") || "—" },
          ],
        },
      ],
    },
    {
      id: "creators",
      title: "Creators",
      summary: creators.length ? `${plural(creators.length, "creator")}, ${creators.filter((x) => x.audience === "matches").length} whose audience matches` : "Reached through brands and podcasts first",
      blocks: creators.length
        ? [{ type: "table", columns: CREATOR_COLUMNS, rows: creators.map((x) => creatorRow(read, x, opts)), facets: FACETS }]
        : [{ type: "note", text: `The creators ${c.name} follows overlap with the other crowds; their brands and podcasts come first here` }],
    },
    {
      id: "brands",
      title: "Brands",
      summary: read.checked ? "The top ones checked both ways: their fans rank you in their top half" : "Their fans love what your crowd loves",
      blocks: brands.length ? [{ type: "table", columns: BRAND_COLUMNS, rows: brands.map((x) => partnerRow(read, x, opts)), facets: FACETS }] : [{ type: "note", text: "The brands this crowd loves are rivals or in your own category; creators and podcasts come first" }],
    },
    {
      id: "podcasts",
      title: "Podcasts",
      summary: plural(podcasts.length, "show"),
      blocks: podcasts.length ? [{ type: "table", columns: POD_COLUMNS, rows: podcasts.map((x) => partnerRow(read, x, opts)), facets: FACETS }] : [{ type: "note", text: "This crowd's shows overlap with the other crowds'; see Across all three" }],
    },
  ];
  return {
    crowd: { id: c.id, name: c.name, tier: c.tier, ...(c.nearMiss ? { nearMiss: true } : {}) },
    sections,
    sources: [{ id: "qloo-insights", label: "Qloo insights" }],
    method: `Read from ${read.calls} Qloo signals · ${plural(creators.length + brands.length + podcasts.length, "partner")} for this crowd`,
  };
}

/** A suggested split of whatever the founder spends: an editable start, never a schedule. */
export function budgetPlan(budget: Budget): Extract<Block, { type: "budget" }> {
  const rows =
    budget === "high"
      ? [
          { label: "Micro and mid creators: paid posts", share: 45 },
          { label: "A co-branded drop with a brand partner", share: 25 },
          { label: "Host-read ads or a sponsored episode", share: 30 },
        ]
      : budget === "mid"
        ? [
            { label: "Micro creators: paid posts", share: 40 },
            { label: "One mid creator (a stretch)", share: 20 },
            { label: "A bundle or giveaway with a brand", share: 20 },
            { label: "Host-read ads on small podcasts", share: 20 },
          ]
        : [
            { label: "Gifting micro creators: product and postage", share: 50, note: "No paid posts yet" },
            { label: "A shared giveaway with a small brand", share: 30 },
            { label: "Podcast guest spots: samples for the hosts", share: 20, note: "Guest spots are usually free" },
          ];
  return { type: "budget", label: "Budget plan", rows, note: "A suggestion to edit: shares of whatever you spend on partners, never a schedule" };
}

function across(read: MatchRead, opts: PageOpts): NonNullable<CrowdPage["across"]> {
  const all: (Creator | Partner)[] = [...ordered(read.creators, opts.outcomes), ...ordered(read.brands, opts.outcomes), ...ordered(read.podcasts, opts.outcomes)].filter((x) => fitsOf(x).length);
  const shared = all.filter((x) => fitsOf(x).length >= 2);
  const heard = latest(opts.outcomes.filter((o) => o.agent === "matchmaker"));
  const idOf = (x: Creator | Partner) => ("platform" in x ? x.id : itemId(x.kind === "brand" ? "partner" : "podcast", x.name));
  const kindOf = (x: Creator | Partner) => ("platform" in x ? "creator" : x.kind === "brand" ? "partner" : "podcast");
  const groupOf = (x: Creator | Partner) => ("platform" in x ? "creator" : x.kind);
  const sections: Section[] = [
    {
      id: "shared",
      title: "Shared partners",
      summary: shared.length ? `${plural(shared.length, "partner")} for two or three crowds: one ask, several crowds` : "Each crowd has its own partners",
      blocks: [
        ...(shared.length
          ? [{ type: "lines" as const, label: "One ask, several crowds", lines: shared.slice(0, 10).map((x) => ({ text: x.name, reason: `${facetsOf(read, x).Group[0]}: fits ${and(crowdNames(read, x))}`, item: idOf(x) })) }]
          : [{ type: "note" as const, text: "No partner fits two crowds at once yet, so each crowd has its own" }]),
      ],
    },
    {
      id: "pipeline",
      title: "Pipeline",
      summary: heard.length ? `${plural(heard.length, "partner")} marked` : "Mark a partner when you reach out",
      blocks: [{ type: "pipeline", items: all.map((x) => ({ item: idOf(x), name: x.name, kind: kindOf(x), group: groupOf(x), facets: { Group: facetsOf(read, x).Group, Band: facetsOf(read, x).Band, Crowd: crowdNames(read, x) } })), facets: ["Group", "Band", "Crowd"] }],
    },
    { id: "budget", title: "Budget plan", summary: "An editable split, never a schedule", blocks: [budgetPlan(read.budget), { type: "facts", rows: [{ label: "Budget fit by band", value: bandFits(read) }] }] },
    {
      id: "working",
      title: "What's working",
      summary: "Yes rates from your marks, by group and band",
      blocks: [{ type: "working", items: all.map((x) => ({ item: idOf(x), facets: { Group: facetsOf(read, x).Group[0], Band: facetsOf(read, x).Band[0] } })), by: ["Group", "Band"] }],
    },
    {
      id: "left",
      title: "Left out",
      summary: read.left.length ? plural(read.left.length, "name") : "Nothing left out",
      blocks: [
        ...(read.left.length ? [{ type: "lines" as const, lines: read.left.map((l) => ({ text: l.name, reason: l.reason })) }] : [{ type: "note" as const, text: "Nothing was left out this time" }]),
        ...(read.limits.length ? [{ type: "lines" as const, label: "Not read this time", lines: read.limits.map((t) => ({ text: t })) }] : []),
      ],
    },
  ];
  return { sections, sources: [{ id: "qloo-insights", label: "Qloo insights" }], method: `Read from ${read.calls} Qloo signals · ${read.crowds.length} crowds · ${plural(all.length, "partner")}` };
}


/** The Matchmaker's page: a tab per crowd in tier order, then Across all three. */
export function matchPage(read: MatchRead, opts: Partial<PageOpts> = {}): CrowdPage {
  const o: PageOpts = { outcomes: opts.outcomes ?? [], asks: opts.asks, at: opts.at };
  const tabs = [...read.crowds].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)).map((c) => crowdTab(read, c, o));
  return { tabs, across: across(read, o), at: o.at ?? Date.now() };
}

/** The partner to ask first: a brand that fits both ways, else the top brand, else a creator whose audience matches and fits the budget, else a podcast. */
export function topMatch(read: Pick<MatchRead, "creators" | "brands" | "podcasts" | "budget">): Creator | Partner | undefined {
  const c = read.creators.find((x) => x.audience === "matches" && fitOf(x.band, read.budget) === "fits");
  return read.brands.find((b) => (b.mutual ?? 0) >= 0.7) ?? read.brands[0] ?? c ?? read.podcasts[0] ?? read.creators[0];
}

export { TIER_LABEL };
