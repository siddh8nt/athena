import { results, type QlooClient } from "@/lib/qloo/client";
import { ALLOWED_AUDIENCE_TYPES, AUDIENCE_LABEL, isAllowedAudienceName, POSITIONING_TYPES, isAllowedTag, tagType } from "@/lib/methods/allowlist";
import { percentiles, positioning } from "@/lib/methods/rank";
import { blockSignal } from "@/lib/playbook/config";
import { withCalls } from "./run";
import type { BlockContext, TagChip } from "./types";
import type { HookEvidence, Hooks } from "@/lib/agent/hooks";

export type Reference = { kind: "tv_show" | "movie" | "artist" | "book"; id: string; name: string; rank: number; callId: string };
export type PositionCard = { competitorId: string; competitorName: string; shared: string[]; onlyYou: string[]; onlyThem: string[]; callIds: string[]; note?: string };
export type Skew = { age: Record<string, number>; gender: Record<string, number>; weak: boolean; callId: string };
export type Interest = { id: string; name: string; type: string; rank: number; callId: string };

export type MessageData = {
  themes: TagChip[];
  styleTags: TagChip[];
  references: Reference[];
  positioning: PositionCard[];
  skew: Skew | null;
  interests: Interest[];
  label: string;
  /** Agent-written hooks, content ideas and tone line, each checked against this evidence (§9.10). */
  hooks?: Hooks;
};

const REF_KINDS: Reference["kind"][] = ["tv_show", "movie", "artist", "book"];

/** Audience id → type, from the four allow-listed types only (cached forever by the client). */
async function allowedAudienceIndex(qloo: QlooClient): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  await Promise.all(
    ALLOWED_AUDIENCE_TYPES.map(async (type) => {
      const res = await qloo.get("/v2/audiences", { "filter.audience.types": type, take: 50 });
      const r = res.body?.results;
      const list = Array.isArray(r) ? r : (r?.audiences ?? []);
      for (const a of list) index.set(a.entity_id, type);
    }),
  );
  return index;
}

async function topTags(qloo: QlooClient, signal: string | string[]) {
  const res = await qloo.insights({ "filter.type": "urn:tag", "signal.interests.entities": signal, "filter.tag.types": [...POSITIONING_TYPES], take: 15 });
  return { ids: (results(res).tags ?? []).filter((t) => isAllowedTag(t, POSITIONING_TYPES)).map((t) => ({ id: t.id ?? t.tag_id ?? "", name: t.name })), callId: res.call.id };
}

async function scorePool(qloo: QlooClient, signal: string | string[], pool: string[]) {
  const res = await qloo.insights({ "filter.type": "urn:tag", "signal.interests.entities": signal, "filter.results.tags": pool, take: pool.length });
  return { p: percentiles((results(res).tags ?? []).map((t) => t.id ?? t.tag_id ?? "")), callId: res.call.id };
}

/** Shared-pool positioning (§9.16): candidate tags per brand → one pool ≤ 50 → one scoring call per brand. */
export async function positionAgainst(qloo: QlooClient, you: string, competitors: { id: string; name: string }[]): Promise<PositionCard[]> {
  if (!competitors.length) return [];
  const sides = [{ id: you, name: "you" }, ...competitors];
  const candidates = await Promise.all(sides.map((s) => topTags(qloo, s.id)));
  const names = new Map<string, string>();
  const pool: string[] = [];
  // Interleave by rank so the highest-ranked tags of every side get in before the cap.
  for (let i = 0; i < 15 && pool.length < 50; i++)
    for (const c of candidates) {
      const t = c.ids[i];
      if (t && !pool.includes(t.id) && pool.length < 50) {
        pool.push(t.id);
        names.set(t.id, t.name);
      }
    }
  const scored = await Promise.all(sides.map((s) => scorePool(qloo, s.id, pool)));
  const label = (ids: string[]) => ids.map((id) => names.get(id) ?? id);
  return competitors.map((c, i) => {
    const pos = positioning(pool, scored[0].p, scored[i + 1].p);
    return {
      competitorId: c.id,
      competitorName: c.name,
      shared: label(pos.shared),
      onlyYou: label(pos.onlyYou),
      onlyThem: label(pos.onlyThem),
      callIds: [...candidates.map((x) => x.callId), scored[0].callId, scored[i + 1].callId],
      note: pos.shared.length + pos.onlyYou.length + pos.onlyThem.length === 0 ? "No clear differences in the shared tag pool" : undefined,
    };
  });
}

/** Message (§9.15–9.17). Hooks and content ideas are written by the agent from this evidence. */
export function message(
  ctx: BlockContext,
  opts: { fingerprint: TagChip[]; competitors?: { id: string; name: string }[]; writeHooks?: (ev: HookEvidence) => Promise<Hooks | undefined>; product?: string } = { fingerprint: [] },
) {
  return withCalls(ctx, "message", async ({ pb, qloo, emit }) => {
    const signal = blockSignal(pb, "message");
    const [themeRes, demoRes, audRes, audIndex, ...refRes] = await Promise.all([
      qloo.insights({ "filter.type": "urn:tag", "signal.interests.entities": signal, "filter.tag.types": "urn:tag:theme:qloo", take: 10 }),
      qloo.insights({ "filter.type": "urn:demographics", "signal.interests.entities": signal }),
      qloo.insights({ "filter.type": "urn:audience", "signal.interests.entities": signal, take: 50 }),
      allowedAudienceIndex(qloo),
      ...REF_KINDS.map((k) => qloo.insights({ "filter.type": `urn:entity:${k}`, "signal.interests.entities": signal, "filter.popularity.max": 0.99, take: 5 })),
    ]);

    const themes: TagChip[] = (results(themeRes).tags ?? []).slice(0, 6).map((t, i) => ({ id: t.id ?? t.tag_id ?? t.name, name: t.name, type: tagType(t), rank: i + 1, callId: themeRes.call.id }));
    const styleTags = opts.fingerprint.filter((t) => /aesthetic|emotional_tone|personal_style|design/.test(t.type)).slice(0, 4);
    const references: Reference[] = refRes.flatMap((res, k) =>
      (results(res).entities ?? []).slice(0, 3).map((e, i) => ({ kind: REF_KINDS[k], id: e.entity_id, name: e.name, rank: i + 1, callId: res.call.id })),
    );

    const d = results(demoRes).demographics?.[0]?.query;
    const skewValues = [...Object.values(d?.age ?? {}), ...Object.values(d?.gender ?? {})];
    const skew: Skew | null = d ? { age: d.age ?? {}, gender: d.gender ?? {}, weak: skewValues.every((v) => Math.abs(v) < 0.1), callId: demoRes.call.id } : null;

    // Interests: keep only audiences whose type is one of the four allowed (§9.17); everything else is dropped unseen.
    const interests: Interest[] = (results(audRes).entities ?? [])
      .filter((a) => audIndex.has(a.entity_id) && isAllowedAudienceName(a.name))
      .slice(0, 6)
      .map((a, i) => ({ id: a.entity_id, name: a.name, type: audIndex.get(a.entity_id)!, rank: i + 1, callId: audRes.call.id }));

    const competitors = opts.competitors ?? [];
    let positions: PositionCard[] = [];
    if (pb.signal.brand && competitors.length) positions = await positionAgainst(qloo, pb.signal.brand, competitors.slice(0, 3));

    emit({
      tool: "build_message",
      why: "Reading what your crowd's taste says about tone, references and positioning",
      status: themes.length >= 4 && references.length >= 6 ? "ok" : "thin",
      callIds: [themeRes.call.id, demoRes.call.id, audRes.call.id, ...refRes.map((r) => r.call.id)],
      summary: `${themes.length} themes, ${references.length} references, ${interests.length} interests, ${positions.length} positioning cards`,
    });
    let hooks: Hooks | undefined;
    if (opts.writeHooks && (themes.length || references.length)) {
      emit({ tool: "build_message", why: "Writing hooks and content ideas from this evidence", status: "running", callIds: [], summary: "every claim is checked against Qloo's results" });
      hooks = await opts
        .writeHooks({
          brand: pb.brandName,
          themes: themes.map((t) => t.name),
          styleTags: styleTags.map((t) => t.name),
          references: references.map((r) => r.name),
          interests: interests.length >= 3 ? interests.map((i) => i.name) : [],
          positioning: positions.flatMap((p) => p.onlyYou),
          product: opts.product,
        })
        .catch(() => undefined);
      if (hooks) emit({ tool: "build_message", why: "Hooks written and checked", status: "ok", callIds: [], summary: `${hooks.hooks.length} hooks, ${hooks.ideas.length} content ideas${hooks.removed ? `; ${hooks.removed} unsupported sentence${hooks.removed === 1 ? "" : "s"} removed` : ""}` });
    }
    const thin = themes.length < 4 || references.length < 6;
    return {
      data: { themes, styleTags, references, positioning: positions, skew, interests: interests.length >= 3 ? interests : [], label: AUDIENCE_LABEL, hooks } satisfies MessageData,
      status: themes.length === 0 && references.length === 0 ? "empty" : thin ? "thin" : "ok",
      thinReason: thin ? "few themes or references for this signal" : undefined,
    };
  });
}
