import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import type { BlockContext, TagChip } from "@/lib/blocks/types";
import { message, type MessageData, type PositionCard } from "@/lib/blocks/message";
import { leans } from "@/lib/blocks/partners";
import { onlineStop, type OnlineData } from "@/lib/stops/online";
import { isAllowedTag } from "@/lib/methods/allowlist";
import type { CrowdCard, CrowdMeeting, Love } from "@/lib/journey/types";
import type { HookEvidence, Hooks } from "./hooks";
import type { Look, LookEvidence } from "./looks";
import { itemId } from "./outcomes";
import { TIER_ORDER, type Block, type CrowdPage, type CrowdTier, type Line, type Named, type PageSource, type PageTab, type Section } from "@/lib/team/page";

// The Scout's page (PRD §23.5 d): each crowd read on its own (who they are, its words, its look, the products to lead
// with, where its attention goes, the rivals already there), then what runs across all three (the paths between them,
// the order to win them, the one message). Reading is Qloo; building the tabs is pure, so it can be tested.

/** The keyword tags a crowd uses: its own phrases. */
const PHRASE_TYPES = ["urn:tag:keyword:qloo"] as const;
/** At this many shared loves a path between two crowds is strong; fewer is thin; none is a leap. */
export const STRONG_PATH = 3;

export type CrowdInput = { crowd: CrowdCard; tier: CrowdTier };

/** What one crowd's read returned from Qloo, before it becomes a tab. */
export type CrowdRead = CrowdInput & {
  message: MessageData;
  online: OnlineData;
  phrases: TagChip[];
  /** This crowd's ranking of the brand and its rivals (Qloo ids, strongest first), when the brand has rivals. */
  standing?: { ids: string[]; callId: string };
  look?: Look;
  calls: number;
  callIds: string[];
};

export type ReadDeps = {
  brand: { name: string; product: string; ownId?: string; competitors: { id: string; name: string }[] };
  fingerprint: TagChip[];
  /** What the Knowledge Base says, one line each: the products come from here. */
  knowledge: string[];
  writeHooks?: (ev: HookEvidence) => Promise<Hooks | undefined>;
  writeLooks?: (ev: LookEvidence) => Promise<Look | undefined>;
  tone?: string;
  avoid?: string[];
  /** When the writing must be back (epoch ms): a write still running then is left out, and finishes into the cache. */
  until?: number;
};

/** p, or undefined once `until` passes. */
export function by<T>(p: Promise<T>, until?: number): Promise<T | undefined> {
  if (!until) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), Math.max(0, until - Date.now()))));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * One crowd's Qloo read, in parallel: its words (the message block), its online attention, its phrases and its
 * standing with the rivals. About 14 Qloo calls. The writing (hooks and look) is `writeCrowd`, run once every crowd is
 * read so all of Gemini's writing happens in one parallel pass.
 */
export async function readCrowd(ctx: BlockContext, input: CrowdInput, deps: ReadDeps): Promise<CrowdRead> {
  const calls: string[] = [];
  const qloo: QlooClient = ctx.qloo.withLog((c) => calls.push(c.id));
  const scoped = { ...ctx, qloo };
  const signal = input.crowd.signal.map((s) => s.id).slice(0, 10);
  const rivals = deps.brand.competitors.slice(0, 5);
  const [msg, online, phraseRes, standRes] = await Promise.all([
    message(scoped, { fingerprint: deps.fingerprint, product: deps.brand.product }),
    onlineStop(qloo, signal),
    qloo.insights({ "filter.type": "urn:tag", "filter.tag.types": PHRASE_TYPES[0], "signal.interests.entities": signal, take: 15 }).catch(() => undefined),
    rivals.length
      ? qloo
          .insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": signal, "filter.results.entities": [...(deps.brand.ownId ? [deps.brand.ownId] : []), ...rivals.map((r) => r.id)], take: rivals.length + 1 })
          .catch(() => undefined)
      : undefined,
  ]);
  const phrases: TagChip[] = phraseRes
    ? (results(phraseRes).tags ?? [])
        .filter((t) => isAllowedTag(t, PHRASE_TYPES))
        .slice(0, 8)
        .map((t, i) => ({ id: t.id ?? t.tag_id ?? t.name, name: t.name, type: PHRASE_TYPES[0], rank: i + 1, callId: phraseRes.call.id }))
    : [];
  return {
    ...input,
    message: msg.data,
    online,
    phrases,
    ...(standRes ? { standing: { ids: (results(standRes).entities ?? []).map((e) => e.entity_id), callId: standRes.call.id } } : {}),
    calls: calls.length,
    callIds: calls,
  };
}

/** A read crowd's hooks and look, written side by side from its evidence (no Qloo calls). */
export async function writeCrowd(r: CrowdRead, deps: ReadDeps): Promise<CrowdRead> {
  const m = r.message;
  const any = m.themes.length > 0 || m.references.length > 0;
  const [hooks, look] = await Promise.all([
    deps.writeHooks && any ? by(deps.writeHooks({ ...hookEvidence(r, deps.brand), ...(deps.tone ? { tone: deps.tone } : {}), ...(deps.avoid?.length ? { avoid: deps.avoid } : {}) }).catch(() => undefined), deps.until) : undefined,
    deps.writeLooks && any
      ? by(
          deps.writeLooks({
            brand: deps.brand.name,
            crowd: r.crowd.name,
            themes: m.themes.map((x) => x.name),
            styleTags: m.styleTags.map((x) => x.name),
            references: m.references.map((x) => x.name),
            phrases: r.phrases.map((x) => x.name),
            knowledge: deps.knowledge,
            product: deps.brand.product,
          }).catch(() => undefined),
          deps.until,
        )
      : undefined,
  ]);
  return { ...r, message: hooks ? { ...m, hooks } : m, ...(look ? { look } : {}) };
}

// ---- The tabs (pure) ---------------------------------------------------------------------------------------------

const KIND_GROUP: Record<Love["kind"], string> = { artist: "Music", TV: "TV", film: "Film", podcast: "Podcasts", book: "Books", brand: "Brands" };
const REF_GROUP: Record<string, string> = { artist: "Music", tv_show: "TV", movie: "Film", book: "Books" };
const GROUP_ORDER = ["Music", "TV", "Film", "Podcasts", "Books", "Brands"];
const ANALYST = "analyst";
const lc = (s: string) => s.toLowerCase().trim();
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export type TabCtx = {
  brand: ReadDeps["brand"];
  /** The other crowds' phrases, for the words to avoid. */
  others: { crowd: string; phrases: string[] }[];
  /** The Analyst's rival map, linked: built once there, never rebuilt here. */
  rivals?: PositionCard[];
};

/** A crowd's tab: the six sections in the same order for every crowd (§23.5 b). */
export function crowdTab(r: CrowdRead, c: TabCtx): PageTab {
  const m = r.message;
  const crowd = r.crowd;
  const sources = new Map<string, PageSource>();
  const src = (callId: string, label: string) => {
    if (callId && !sources.has(callId)) sources.set(callId, { id: callId, label, callId });
    return callId || undefined;
  };
  sources.set(ANALYST, { id: ANALYST, label: "The Analyst's measured crowds" });

  // 1. Who they are.
  const lean = leans(m.skew ?? crowd.skew);
  const skewSrc = m.skew ? src(m.skew.callId, `Qloo: who loves ${crowd.name}'s taste`) : ANALYST;
  const facts: { label: string; value: string; src?: string }[] = [
    { label: "Leans", value: [lean.age && `ages ${lean.age.label}`, lean.gender && lean.gender.label].filter(Boolean).join(", ") || "no clear age or gender lean", src: skewSrc },
  ];
  if (crowd.cities.length) facts.push({ label: "Top cities", value: crowd.cities.slice(0, 4).map((x) => x.name).join(", "), src: ANALYST });
  const loves = new Map<string, Named[]>();
  // Shows, podcasts and creators are listed once, under where their attention goes.
  const seen = new Set([...m.references.filter((x) => x.kind === "tv_show"), ...r.online.podcasts, ...r.online.creators].map((x) => lc(x.name)));
  const add = (group: string, n: Named) => {
    if (seen.has(lc(n.name))) return;
    seen.add(lc(n.name));
    loves.set(group, [...(loves.get(group) ?? []), n]);
  };
  for (const ref of m.references) add(REF_GROUP[ref.kind], { name: ref.name, kind: ref.kind, ref: ref.id, src: src(ref.callId, `Qloo: what ${crowd.name} loves`) });
  for (const l of crowd.loves) if ((loves.get(KIND_GROUP[l.kind])?.length ?? 0) < 4) add(KIND_GROUP[l.kind], { name: l.name, kind: l.kind, src: ANALYST });
  const who: Section = {
    id: "who",
    title: "Who they are",
    blocks: [
      { type: "facts", rows: facts },
      { type: "names", groups: GROUP_ORDER.filter((g) => loves.has(g)).map((g) => ({ label: g, names: loves.get(g)!.slice(0, 5) })) },
      ...(m.interests.length ? [{ type: "names", groups: [{ label: "Into", names: m.interests.slice(0, 5).map((i) => ({ name: i.name, src: src(i.callId, `Qloo: ${crowd.name}'s interests`) })) }] } as Block] : []),
    ],
  };

  // 2. Words.
  const mine = new Set(r.phrases.map((p) => lc(p.name)));
  const themeNames = new Set(m.themes.map((t) => lc(t.name)));
  // A phrase that is already a theme is listed once, as the theme.
  const phrases = r.phrases.filter((p) => !themeNames.has(lc(p.name)));
  const avoid: Named[] = [];
  for (const o of c.others)
    for (const p of o.phrases.slice(0, 4))
      if (!mine.has(lc(p)) && !themeNames.has(lc(p)) && !avoid.some((a) => lc(a.name) === lc(p))) avoid.push({ name: p, note: `${o.crowd}${/s$/i.test(o.crowd) ? "'" : "'s"} word, not this crowd's`, src: ANALYST });
  for (const rv of c.rivals ?? [])
    for (const p of rv.onlyThem.slice(0, 2))
      if (!mine.has(lc(p)) && !avoid.some((a) => lc(a.name) === lc(p))) avoid.push({ name: p, note: `${rv.competitorName}'s ground`, src: ANALYST });
  const hooks: Line[] = (m.hooks?.hooks ?? []).map((h) => ({ text: h.text, from: (h.claims ?? []).map((x) => x.ref), item: itemId("message", h.text) }));
  const words: Section = {
    id: "words",
    title: "Words",
    ...(m.hooks?.tone ? { summary: m.hooks.tone.text } : {}),
    blocks: [
      { type: "names", groups: [{ label: "Themes", names: m.themes.map((t) => ({ name: t.name, src: src(t.callId, `Qloo: ${crowd.name}'s themes`) })) }] },
      ...(hooks.length ? [{ type: "lines", label: "Hooks", lines: hooks, rewrite: true } as Block] : []),
      {
        type: "names" as const,
        groups: [
          ...(phrases.length ? [{ label: "Their own phrases", names: phrases.map((p) => ({ name: p.name, src: src(p.callId, `Qloo: ${crowd.name}'s phrases`) })) }] : []),
          ...(avoid.length ? [{ label: "Words to avoid", names: avoid.slice(0, 6) }] : []),
        ],
      },
    ].filter((b): b is Block => b.type !== "names" || b.groups.length > 0),
  };

  // 3. Mood board.
  const look = r.look;
  const images = m.references.filter((x) => x.image).map((x) => ({ name: x.name, url: x.image!, kind: REF_GROUP[x.kind], src: x.callId }));
  const drawn = [...new Set([...(look?.palette ?? []).flatMap((s) => s.from), ...(look?.textures ?? []).flatMap((x) => x.from), ...images.map((i) => i.name)])];
  const mood: Section = {
    id: "mood",
    title: "Mood board",
    summary: `Drawn from: ${listOf(drawn.slice(0, 5)) || listOf(m.styleTags.map((x) => x.name).slice(0, 4)) || crowd.name}`,
    blocks: [
      ...(look?.palette.length ? [{ type: "swatches", label: "Palette", swatches: look.palette } as Block] : []),
      ...(look?.textures.length ? [{ type: "lines", label: "Textures", lines: look.textures.map((x) => ({ text: x.text, from: x.from })) } as Block] : []),
      ...(m.styleTags.length ? [{ type: "names", groups: [{ label: "Style", names: m.styleTags.map((x) => ({ name: x.name, src: x.callId })) }] } as Block] : []),
      ...(images.length ? [{ type: "images", label: "References", images } as Block] : []),
    ],
  };

  // 4. Product angle.
  const angles = ([
    look?.lead && { text: look.lead.product, tag: "Lead with", reason: look.lead.reason, from: look.lead.from },
    look?.then && { text: look.then.product, tag: "Then", reason: look.then.reason, from: look.then.from },
    look?.skip && { text: look.skip.product, tag: "Skip", reason: look.skip.reason, from: look.skip.from },
  ] as (Line | undefined)[]).filter((x): x is Line => !!x);
  const product: Section = {
    id: "product",
    title: "Product angle",
    blocks: angles.length
      ? [{ type: "lines", lines: angles }]
      : [{ type: "lines", lines: [{ text: c.brand.product, tag: "Lead with", reason: m.themes.length ? `Read against what this crowd over-indexes on: ${listOf(m.themes.slice(0, 3).map((t) => t.name))}` : "What you sell, as the Knowledge Base says", from: m.themes.slice(0, 3).map((t) => t.name) }] }],
  };

  // 5. Where their attention goes: shows and moments to the Promoter, podcasts and creators to the Matchmaker.
  const shows = m.references.filter((x) => x.kind === "tv_show").map((x) => ({ name: x.name, kind: "show", ref: x.id, src: x.callId, item: itemId("show", x.name) }));
  const pods = r.online.podcasts.map((p) => ({ name: p.name, kind: "podcast", ref: p.id, src: src(p.callId, `Qloo: podcasts ${crowd.name} loves`), item: itemId("podcast", p.name) }));
  const creators = r.online.creators.map((p) => ({ name: p.name, kind: "creator", ref: p.id, note: p.role, src: src(p.callId, `Qloo: people ${crowd.name} follows`), item: itemId("creator", p.name) }));
  const attention: Section = {
    id: "attention",
    title: "Where their attention goes",
    blocks: [{ type: "names", groups: [...(shows.length ? [{ label: "Shows", names: shows }] : []), ...(pods.length ? [{ label: "Podcasts", names: pods }] : []), ...(creators.length ? [{ label: "Creators", names: creators }] : [])] }],
  };
  if (!shows.length && !pods.length && !creators.length) attention.blocks = [{ type: "note", text: `${crowd.name} spreads its attention wide; the Matchmaker and Promoter read it partner by partner.` }];

  // 6. Rivals already there.
  const names = new Map(c.brand.competitors.map((x) => [x.id, x.name]));
  const order = r.standing?.ids ?? [];
  const you = c.brand.ownId ? order.indexOf(c.brand.ownId) : -1;
  const there = order.filter((id) => names.has(id));
  const rivalLines: Line[] = (there.length ? there : c.brand.competitors.map((x) => x.id)).map((id) => {
    const name = names.get(id)!;
    const map = c.rivals?.find((x) => x.competitorId === id);
    const above = you >= 0 && order.indexOf(id) >= 0 && order.indexOf(id) < you;
    const parts = [map?.onlyThem.length ? `Their ground: ${map.onlyThem.slice(0, 3).join(", ")}` : "", map?.onlyYou.length ? `Your opening: ${map.onlyYou.slice(0, 3).join(", ")}` : ""].filter(Boolean);
    return { text: name, tag: you < 0 || order.indexOf(id) < 0 ? undefined : above ? "This crowd ranks them above you" : "This crowd ranks you above them", reason: parts.join(" · ") || map?.note || "Close to you on taste", item: itemId("rival", name) };
  });
  if (r.standing) src(r.standing.callId, `Qloo: how ${crowd.name} ranks you and your rivals`);
  const rivals: Section = {
    id: "rivals",
    title: "Rivals already there",
    ...(c.rivals?.length ? { summary: "From the Analyst's rival map" } : {}),
    blocks: rivalLines.length ? [{ type: "lines", lines: rivalLines }] : [{ type: "note", text: "No rivals named yet. Name them in the Brand Knowledge Base and this fills in." }],
  };

  return {
    crowd: { id: crowd.id, name: crowd.name, tier: r.tier, ...(crowd.nearMiss ? { nearMiss: true } : {}) },
    sections: [who, words, mood, product, attention, rivals],
    sources: [...sources.values()],
    method: `Read from ${r.calls} Qloo signals`,
    evidence: hookEvidence(r, c.brand),
  };
}

/** What a tone rewrite reads: the same evidence the hooks were written from, so a button needs no Qloo call. */
export function hookEvidence(r: CrowdRead, brand: ReadDeps["brand"]): HookEvidence {
  const m = r.message;
  return { brand: brand.name, themes: m.themes.map((t) => t.name), styleTags: m.styleTags.map((t) => t.name), references: m.references.map((x) => x.name), interests: m.interests.length >= 3 ? m.interests.map((i) => i.name) : [], positioning: [], product: brand.product };
}

// ---- Across all three (pure, 0 Qloo calls) ---------------------------------------------------------------------

export function pathStrength(shared: number): "strong" | "thin" | "leap" {
  return shared >= STRONG_PATH ? "strong" : shared > 0 ? "thin" : "leap";
}

/** The signal that a crowd holds, by how the brand sells. */
export function holdSignal(channel?: "online" | "offline" | "both"): string {
  return channel === "online" ? "repeat buyers" : channel === "offline" ? "stockist reorders" : "repeat buyers and stockist reorders";
}

export function across(reads: CrowdRead[], meetings: CrowdMeeting[], opts: { channel?: "online" | "offline" | "both"; oneLine?: Hooks }): NonNullable<CrowdPage["across"]> {
  const sorted = [...reads].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  const meet = (a: string, b: string) => meetings.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  const edges = sorted.flatMap((x, i) =>
    sorted.slice(i + 1).map((y) => {
      const shared = (meet(x.crowd.id, y.crowd.id)?.items ?? []).map((s) => s.name);
      return { a: x.crowd.id, b: y.crowd.id, strength: pathStrength(shared.length), shared: shared.slice(0, 4) };
    }),
  );
  const signal = holdSignal(opts.channel);
  const steps = sorted.map((x, i) => {
    if (!i) return { text: `Win ${x.crowd.name} first`, signal: `It holds when you see ${signal}`, crowd: x.crowd.id };
    const prev = sorted[i - 1];
    const e = edges.find((d) => (d.a === prev.crowd.id && d.b === x.crowd.id) || (d.b === prev.crowd.id && d.a === x.crowd.id));
    const via = e && e.strength !== "leap" ? `, through ${listOf(e.shared.slice(0, 3))}` : ", a leap: nothing shared";
    const verb = x.crowd.nearMiss ? "test" : "win";
    return { text: `Once ${prev.crowd.name} holds, ${verb} ${x.crowd.name}${via}`, signal: `Move on when ${prev.crowd.name} shows ${signal}`, crowd: x.crowd.id };
  });
  const one = (opts.oneLine?.hooks ?? []).slice(0, 2).map((h) => ({ text: h.text, from: (h.claims ?? []).map((c) => c.ref), tag: "All three" }));
  const fallback = sharedThemes(reads);
  // Each crowd's own hooks stay on its tab; here only the line that works for all three.
  const calls = reads.reduce((n, x) => n + x.calls, 0);
  const sections: Section[] = [
    { id: "paths", title: "Paths between crowds", blocks: [{ type: "paths", nodes: sorted.map((x) => ({ id: x.crowd.id, name: x.crowd.name, tier: x.tier })), edges }] },
    { id: "order", title: "Order to win them", summary: "A sequence, not a schedule", blocks: [{ type: "steps", steps }] },
    {
      id: "message",
      title: "One message",
      blocks: [
        one.length ? { type: "lines", label: "Works for all three", lines: one } : { type: "names", groups: [{ label: "What all three share", names: fallback.map((name) => ({ name })) }] },
      ],
    },
  ];
  return { sections, sources: [{ id: ANALYST, label: "The Analyst's measured crowds and where they meet" }], method: `Read from ${calls} Qloo signals · ${reads.length} crowds` };
}

/** Themes more than one crowd over-indexes on, most crowds first. */
export function sharedThemes(reads: CrowdRead[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const r of reads) for (const t of new Set(r.message.themes.map((x) => x.name))) count.set(lc(t), { name: t, n: (count.get(lc(t))?.n ?? 0) + 1 });
  return [...count.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n).map((x) => x.name).slice(0, 5);
}

/** The evidence for the line that works for all three: their shared themes and the loves that bridge them. */
export function oneLineEvidence(reads: CrowdRead[], meetings: CrowdMeeting[], brand: ReadDeps["brand"], fingerprint: TagChip[]): HookEvidence | undefined {
  const themes = sharedThemes(reads);
  const ids = new Set(reads.map((r) => r.crowd.id));
  const bridges = [...new Set(meetings.filter((m) => ids.has(m.a) && ids.has(m.b)).flatMap((m) => m.items.slice(0, 3).map((i) => i.name)))];
  if (!themes.length && !bridges.length) return undefined;
  return { brand: brand.name, themes, styleTags: fingerprint.filter((t) => /aesthetic|emotional_tone|personal_style|design/.test(t.type)).slice(0, 4).map((t) => t.name), references: bridges.slice(0, 8), interests: [], positioning: [], product: brand.product };
}

/** The whole page from the reads. */
export function scoutPage(reads: CrowdRead[], c: Omit<TabCtx, "others"> & { meetings: CrowdMeeting[]; channel?: "online" | "offline" | "both"; oneLine?: Hooks }): CrowdPage {
  const tabs = reads.map((r) => crowdTab(r, { ...c, others: reads.filter((o) => o !== r).map((o) => ({ crowd: o.crowd.name, phrases: o.phrases.map((p) => p.name) })) }));
  tabs.sort((a, b) => TIER_ORDER.indexOf(a.crowd.tier) - TIER_ORDER.indexOf(b.crowd.tier));
  return { tabs, ...(reads.length > 1 ? { across: across(reads, c.meetings, c) } : {}), at: Date.now() };
}
