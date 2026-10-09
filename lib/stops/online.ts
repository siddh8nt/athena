import type { Priority, QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { allowedAudienceIndex } from "@/lib/methods/audiences";
import { isAllowedAudienceName } from "@/lib/methods/allowlist";

// The Online stop (PRD §9.24): for online brands and the Online growth type, with the chosen crowd as the signal.
// Creators are partners in their professional role, like podcasts; interests are ad ideas to test, from the four
// allowed audience types only. Never anything about an individual consumer, and no request is built from audiences.

export type Creator = { id: string; name: string; role: string; affinity: number; callId: string };
export type Podcast = { id: string; name: string; affinity: number; callId: string };
export type Interest = { id: string; name: string; type: string; rank: number; callId: string };
export type OnlineData = { creators: Creator[]; podcasts: Podcast[]; interests: Interest[]; calls: number; callIds: string[] };

/** Qloo tags that say a person makes things people follow (§9.24). */
const CREATOR = /influencer|youtuber|tiktok|instagram|chef|cook|baker|food stylist|author|writer|presenter|podcast|model|musician|singer|songwriter|designer|comedian|blogger/i;
/** Tags that tie a person to another country (10 Oct: Liquid Death's person results were mostly from abroad). */
const ABROAD = /\b(india|indian|thai|pakistan|brazil|nigeria|philippin|korean|japanese|mexican|assam|lahore|bangladesh|egypt|turkish|indonesian)/i;

export function creatorRole(e: QlooEntity): string | undefined {
  const tags = (e.tags ?? []).map((t) => t.name);
  if (tags.some((t) => ABROAD.test(t))) return undefined;
  return tags.find((t) => CREATOR.test(t));
}

/** At least this many creators must pass, or the stop shows podcasts only and says nothing about creators (§9.24). */
export const MIN_CREATORS = 3;

/** Never throws. Calls: 3, plus the cached audience-type index. */
export async function onlineStop(qloo: QlooClient, signal: string[], opts: { priority?: Priority } = {}): Promise<OnlineData> {
  const callIds: string[] = [];
  const settle = async <T extends { call: { id: string } }>(p: Promise<T>) => {
    const r = await p.catch(() => undefined);
    if (r) callIds.push(r.call.id);
    return r;
  };
  const [people, pods, aud, index] = await Promise.all([
    settle(qloo.insights({ "filter.type": "urn:entity:person", "signal.interests.entities": signal, "filter.popularity.max": 0.9, take: 30 }, opts)),
    settle(qloo.insights({ "filter.type": "urn:entity:podcast", "signal.interests.entities": signal, "filter.popularity.max": 0.97, take: 8 }, opts)),
    settle(qloo.insights({ "filter.type": "urn:audience", "signal.interests.entities": signal, take: 50 }, opts)),
    allowedAudienceIndex(qloo).catch(() => new Map<string, string>()),
  ]);
  const found = (people?.results.entities ?? []).flatMap((e) => {
    const role = creatorRole(e);
    return role ? [{ id: e.entity_id, name: e.name, role, affinity: Math.round((e.query?.affinity ?? 0) * 1000) / 1000, callId: people!.call.id }] : [];
  });
  return {
    creators: found.length >= MIN_CREATORS ? found.slice(0, 5) : [],
    podcasts: (pods?.results.entities ?? []).slice(0, 5).map((e) => ({ id: e.entity_id, name: e.name, affinity: Math.round((e.query?.affinity ?? 0) * 1000) / 1000, callId: pods!.call.id })),
    // Only the four allowed audience types, and no political, religious or identity names (§9.17).
    interests: (aud?.results.entities ?? [])
      .filter((a) => index.has(a.entity_id) && isAllowedAudienceName(a.name))
      .slice(0, 8)
      .map((a, i) => ({ id: a.entity_id, name: a.name, type: index.get(a.entity_id)!, rank: i + 1, callId: aud!.call.id })),
    calls: callIds.length,
    callIds,
  };
}
