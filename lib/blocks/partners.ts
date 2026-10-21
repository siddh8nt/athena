import { results, type QlooClient } from "@/lib/qloo/client";
import type { QlooEntity, QlooTag } from "@/lib/qloo/types";
import { bridges, mutualFit, percentiles } from "@/lib/methods/rank";
import { blockSignal } from "@/lib/playbook/config";
import { withCalls } from "./run";
import type { BlockContext, Enriched, Evidence, TagChip } from "./types";

export type PartnerCard = {
  rank: number;
  id: string;
  name: string;
  kind: "brand" | "podcast";
  priceTier?: number;
  popularity?: number;
  pForward: number;
  pReverse?: number;
  mutual?: number;
  reverseRank?: { rank: number; of: number; callId: string };
  reasons: Evidence[];
  wikidataId?: string;
  itunesId?: string;
  contact: { website?: Enriched<string>; site?: Enriched<string>; email?: Enriched<string>; instagram?: Enriched<string>; x?: Enriched<string>; episodes?: Enriched<number>; lastEpisode?: Enriched<string> };
  /** True when the last episode is more than 60 days old (Apple Podcasts). */
  inactive?: boolean;
  genre?: string;
  /** Qloo's description of a podcast, used to identify it when searching for public figures. */
  description?: string;
  /** Podcasts only: Qloo insights with the show itself as the signal (§9.6, "Who listens"). */
  listeners?: Listeners;
};

/** A podcast's audience as Qloo sees it. Aggregate skew, never a head count. */
export type Listeners = {
  /** Leans worth naming: |value| >= 0.3 on Qloo's -1 to 1 scale. */
  gender?: { label: "female" | "male"; value: number };
  age?: { label: string; value: number };
  brands: string[];
  tv: string[];
  /** Brands both your crowd and this show's listeners rank highly (min of both percentiles >= 0.70). */
  shared: { name: string; pYou: number; pThem: number }[];
  /** Your rank among brands like you, with this show's listeners as the signal. */
  likesYou?: { rank: number; of: number };
  callIds: string[];
};

export const AGE_LABELS: Record<string, string> = { "24_and_younger": "24 and under", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };
const LEAN = 0.3;
// 8 Oct: Fat Mascara scored 0.86 for "24 and under" and 0.78 for "55+". Naming one bucket would mislead, so an
// age is named only when it clearly leads the next one.
const AGE_LEAD = 0.15;

/** The leans worth naming from one Qloo demographics result. */
export function leans(d: { age?: Record<string, number>; gender?: Record<string, number> } | undefined): Pick<Listeners, "gender" | "age"> {
  const out: Pick<Listeners, "gender" | "age"> = {};
  const female = d?.gender?.female;
  if (female !== undefined && Math.abs(female) >= LEAN) out.gender = { label: female > 0 ? "female" : "male", value: Math.abs(female) };
  const [top, next] = Object.entries(d?.age ?? {}).sort((a, b) => b[1] - a[1]);
  if (top && top[1] >= LEAN && AGE_LABELS[top[0]] && (!next || top[1] - next[1] >= AGE_LEAD)) out.age = { label: AGE_LABELS[top[0]], value: top[1] };
  return out;
}

/**
 * "Who listens" for one podcast: three Qloo calls with the show as the signal, one with your crowd over the
 * show's top brands (shared loves, the same bridge rule as venue pitches, §9.8), and one for the reverse side
 * over the mutual-fit peer set. Brands exclude you and your competitors.
 */
export async function listenersOf(qloo: QlooClient, podcastId: string, opts: { signal: string[]; ownBrand?: string; exclude: string[]; peerSet: string[] }): Promise<Listeners> {
  const skip = new Set([...(opts.ownBrand ? [opts.ownBrand] : []), ...opts.exclude]);
  const [demo, brandRes, tvRes] = await Promise.all([
    qloo.insights({ "filter.type": "urn:demographics", "signal.interests.entities": podcastId }),
    qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": podcastId, take: 50 }),
    qloo.insights({ "filter.type": "urn:entity:tv_show", "signal.interests.entities": podcastId, take: 4 }),
  ]);
  const theirBrands = (results(brandRes).entities ?? []).filter((e) => !skip.has(e.entity_id));
  const names = new Map(theirBrands.map((e) => [e.entity_id, e.name]));
  const pThem = percentiles(theirBrands.map((e) => e.entity_id));
  const [youRes, reverse] = await Promise.all([
    theirBrands.length >= 5
      ? qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": opts.signal, "filter.results.entities": theirBrands.map((e) => e.entity_id), take: theirBrands.length })
      : Promise.resolve(undefined),
    opts.ownBrand && opts.peerSet.length >= 5
      ? qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": podcastId, "filter.results.entities": opts.peerSet, take: opts.peerSet.length })
      : Promise.resolve(undefined),
  ]);
  const pYou = percentiles((youRes ? results(youRes).entities ?? [] : []).map((e) => e.entity_id));
  const order = reverse ? (results(reverse).entities ?? []).map((e) => e.entity_id) : [];
  const idx = opts.ownBrand ? order.indexOf(opts.ownBrand) : -1;
  return {
    ...leans(results(demo).demographics?.[0]?.query),
    brands: theirBrands.slice(0, 4).map((e) => e.name),
    tv: (results(tvRes).entities ?? []).slice(0, 3).map((e) => e.name),
    shared: bridges(pYou, pThem).map((b) => ({ name: names.get(b.id) ?? b.id, pYou: b.pAccounts, pThem: b.pVenue })),
    likesYou: idx >= 0 ? { rank: idx + 1, of: order.length } : undefined,
    callIds: [demo.call.id, brandRes.call.id, tvRes.call.id, ...(youRes ? [youRes.call.id] : []), ...(reverse ? [reverse.call.id] : [])],
  };
}

export type PartnersData = { brands: PartnerCard[]; podcasts: PartnerCard[]; peerSet: string[]; peers: { id: string; name: string }[]; ownBrand?: { id: string; priceTier?: number; narrowGenre?: string } };

export async function lookupEntity(qloo: QlooClient, id: string): Promise<QlooEntity | undefined> {
  const res = await qloo.get("/entities", { entity_ids: id });
  const r = res.body?.results;
  const list = Array.isArray(r) ? r : (r?.entities ?? []);
  return list[0];
}

/** The brand's narrowest genre tag: the urn:tag:genre:brand tag with the deepest path (§9.6). */
export function narrowestGenre(tags: QlooTag[] | undefined): string | undefined {
  return (tags ?? [])
    .map((t) => t.id ?? t.tag_id ?? "")
    .filter((id) => id.startsWith("urn:tag:genre:brand:"))
    .sort((a, b) => b.split(":").length - a.split(":").length)[0];
}

export function externalId(e: QlooEntity, key: string): string | undefined {
  const w = e.external?.[key] as { id?: string }[] | { id?: string } | undefined;
  const id = Array.isArray(w) ? w[0]?.id : w?.id;
  return typeof id === "string" && id ? id : undefined;
}

export function wikidataId(e: QlooEntity): string | undefined {
  const id = externalId(e, "wikidata");
  return id && /^Q\d+$/.test(id) ? id : undefined;
}

/** Socials straight from Qloo's `external` (8 Oct: Instagram on 97% of brands, X on 66%). Wikidata fills websites. */
export function qlooContact(e: QlooEntity, callId: string): PartnerCard["contact"] {
  const ig = externalId(e, "instagram");
  const x = externalId(e, "twitter");
  const itunes = externalId(e, "itunes");
  return {
    instagram: ig ? { value: `https://www.instagram.com/${ig}`, source: "Qloo", callId } : undefined,
    x: x ? { value: `https://x.com/${x}`, source: "Qloo", callId } : undefined,
    website: itunes ? { value: `https://podcasts.apple.com/podcast/id${itunes}`, source: "Qloo", callId } : undefined,
  };
}

export function reasonChips(e: QlooEntity, callId: string, names: Map<string, string>, fingerprint: TagChip[]): Evidence[] {
  const out: Evidence[] = [];
  const contrib = (e.query?.explainability?.["signal.interests.entities"] ?? []).filter((c) => names.has(c.entity_id)).slice(0, 2);
  if (contrib.length) out.push({ kind: "contribution", label: `Loved by fans of ${contrib.map((c) => names.get(c.entity_id)).join(" and ")}`, callId });
  const fp = new Set(fingerprint.map((t) => t.id));
  const shared = (e.tags ?? []).filter((t) => fp.has(t.id ?? t.tag_id ?? "")).slice(0, 2);
  if (shared.length) out.push({ kind: "tag", label: `Shared: ${shared.map((t) => t.name).join(", ")}`, callId });
  return out;
}

/** Partners (§9.6): collab brands and podcasts, with mutual fit for the top brands and "Who listens" for the top podcasts. */
/** Podcasts that get "Who listens" (5 Qloo calls each). 10 Oct: 3, down from 5, to keep Partners fast. */
export const WHO_LISTENS_TOP = 3;

/**
 * Partners (§9.6): collab brands and podcasts, with mutual fit for the top brands and "Who listens" for the top podcasts.
 * `early` gets the lists as soon as the first three calls return, then again as each slower part lands (v3.0 speed).
 */
export function partners(ctx: BlockContext, opts: { fingerprint: TagChip[]; websites?: (cards: PartnerCard[]) => Promise<void>; podcastDetails?: (cards: PartnerCard[]) => Promise<void>; early?: (data: PartnersData) => void } = { fingerprint: [] }) {
  return withCalls(ctx, "partners", async ({ pb, qloo, names, emit }) => {
    const signal = blockSignal(pb, "partners");
    const own = pb.signal.brand ? await lookupEntity(qloo, pb.signal.brand) : undefined;
    const ownTier = own?.properties?.price_tier;
    const narrow = narrowestGenre(own?.tags);

    const [brandRes, podRes, peerRes] = await Promise.all([
      // Explainability (§9.28) fills each pick's "Loved by fans of" line; it rides on the ranking call, no extra call.
      qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": signal, "filter.exclude.entities": pb.exclude.slice(0, 50), "feature.explainability": true, take: 50, ...pb.partnerParams }),
      pb.partnerTypes.includes("podcast")
        ? qloo.insights({ "filter.type": "urn:entity:podcast", "signal.interests.entities": signal, "feature.explainability": true, take: 20, ...pb.partnerParams })
        : Promise.resolve(undefined),
      pb.signal.brand && narrow
        ? qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": pb.signal.brand, "filter.tags": narrow, "filter.exclude.entities": pb.signal.brand, take: 14 })
        : Promise.resolve(undefined),
    ]);

    const rawBrands = results(brandRes).entities ?? [];
    const pFwd = percentiles(rawBrands.map((e) => e.entity_id));
    const competitors = new Set(pb.competitors);
    const brands: PartnerCard[] = rawBrands
      .filter((e) => !competitors.has(e.entity_id))
      .filter((e) => !narrow || !(e.tags ?? []).some((t) => (t.id ?? t.tag_id) === narrow)) // direct competitors share the narrowest genre
      .filter((e) => ownTier === undefined || e.properties?.price_tier === undefined || Math.abs(e.properties.price_tier - ownTier) <= 1)
      .slice(0, 12)
      .map((e, i) => ({
        rank: i + 1,
        id: e.entity_id,
        name: e.name,
        kind: "brand" as const,
        priceTier: e.properties?.price_tier,
        popularity: e.popularity,
        pForward: pFwd.get(e.entity_id) ?? 0,
        reasons: reasonChips(e, brandRes.call.id, names, opts.fingerprint),
        wikidataId: wikidataId(e),
        contact: qlooContact(e, brandRes.call.id),
      }));

    const rawPods = podRes ? (results(podRes).entities ?? []) : [];
    const pPod = percentiles(rawPods.map((e) => e.entity_id));
    const podcasts: PartnerCard[] = rawPods.slice(0, 8).map((e, i) => ({
      rank: i + 1,
      id: e.entity_id,
      name: e.name,
      kind: "podcast" as const,
      popularity: e.popularity,
      pForward: pPod.get(e.entity_id) ?? 0,
      reasons: reasonChips(e, podRes!.call.id, names, opts.fingerprint),
      // Qloo's episode_count was "15" for every podcast on 8 Oct, so episodes come from Apple instead.
      contact: qlooContact(e, podRes!.call.id),
      itunesId: externalId(e, "itunes"),
      description: typeof e.properties?.description === "string" ? e.properties.description.slice(0, 300) : undefined,
    }));

    const peers = peerRes ? (results(peerRes).entities ?? []).slice(0, 14).map((e) => ({ id: e.entity_id, name: e.name })) : [];
    const peerSet = pb.signal.brand ? [pb.signal.brand, ...peers.map((p) => p.id)] : [];
    const ownBrand = own ? { id: own.entity_id, priceTier: ownTier, narrowGenre: narrow } : undefined;
    const snapshot = (): PartnersData => ({ brands: [...brands], podcasts: [...podcasts], peerSet, peers, ownBrand });
    opts.early?.(snapshot());
    emit({
      tool: "rank_partners",
      why: "Finding brands and podcasts your crowd over-indexes on, within reach",
      status: brands.length + podcasts.length >= 8 ? "ok" : "thin",
      callIds: [brandRes.call.id, ...(podRes ? [podRes.call.id] : []), ...(peerRes ? [peerRes.call.id] : [])],
      summary: `${brands.length} brands, ${podcasts.length} podcasts`,
    });
    // The slower parts run side by side, and each one updates the lists as it lands (v3.0 speed).
    const mutualFit = async () => {
      // Mutual fit (§9.6) for the top 6 brands: one reverse call each, in parallel. Needs the brand in Qloo.
      if (!(pb.signal.brand && peerSet.length >= 5 && brands.length)) return;
      emit({ tool: "mutual_fit", why: "Checking the other side: how much each partner's crowd likes you", status: "running", callIds: [], summary: `top ${Math.min(6, brands.length)} brands` });
      const scored = await Promise.all(brands.slice(0, 6).map((c) => reverseFit(qloo, c, pb.signal.brand!, peerSet).catch(() => c)));
      scored.forEach((c, i) => (brands[i] = { ...brands[i], pReverse: c.pReverse, mutual: c.mutual, reverseRank: c.reverseRank }));
      const both = scored.filter((c) => c.mutual !== undefined && c.mutual >= 0.7).length;
      emit({ tool: "mutual_fit", why: "Scored partners from both sides", status: "ok", callIds: scored.flatMap((c) => (c.reverseRank ? [c.reverseRank.callId] : [])), summary: `${both} of ${scored.length} fit strongly both ways` });
      opts.early?.(snapshot());
    };
    const whoListens = async () => {
      // Who listens (top podcasts): Qloo insights with each show as the signal, in parallel.
      if (!podcasts.length) return;
      const top = podcasts.slice(0, WHO_LISTENS_TOP);
      emit({ tool: "who_listens", why: "Reading each podcast's audience: who listens and what they love", status: "running", callIds: [], summary: `top ${top.length} podcasts` });
      const heard = await Promise.all(top.map((c) => listenersOf(qloo, c.id, { signal, ownBrand: pb.signal.brand, exclude: pb.competitors, peerSet }).catch(() => undefined)));
      heard.forEach((l, i) => l && (podcasts[i].listeners = l));
      const ok = heard.filter(Boolean).length;
      emit({ tool: "who_listens", why: "Read each podcast's audience", status: ok ? "ok" : "thin", callIds: heard.flatMap((l) => l?.callIds ?? []), summary: `${ok} of ${top.length} podcasts profiled` });
      opts.early?.(snapshot());
    };
    // Official websites from Wikidata and podcast details from Apple (§9.19); enrichments never change the order.
    const enrich = async () => {
      await Promise.all([opts.websites ? opts.websites(brands).catch(() => undefined) : undefined, opts.podcastDetails ? opts.podcastDetails(podcasts).catch(() => undefined) : undefined]);
      opts.early?.(snapshot());
    };
    await Promise.all([mutualFit(), whoListens(), enrich()]);
    const total = brands.length + podcasts.length;
    return {
      data: snapshot(),
      status: total === 0 ? "empty" : total < 8 ? "thin" : "ok",
      thinReason: total < 8 ? `only ${total} partners matched` : undefined,
    };
  });
}

/** The reverse side of mutual fit for one partner (§9.6): your rank among the peer set under the partner's signal. */
export async function reverseFit(qloo: QlooClient, card: PartnerCard, ownBrand: string, peerSet: string[]): Promise<PartnerCard> {
  if (!peerSet.includes(ownBrand) || peerSet.length < 2) return card;
  const res = await qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": card.id, "filter.results.entities": peerSet, take: peerSet.length });
  const order = (results(res).entities ?? []).map((e) => e.entity_id);
  const p = percentiles(order).get(ownBrand);
  const idx = order.indexOf(ownBrand);
  return {
    ...card,
    pReverse: p,
    mutual: mutualFit(card.pForward, p),
    reverseRank: idx >= 0 ? { rank: idx + 1, of: order.length, callId: res.call.id } : undefined,
  };
}
