import type { QlooClient } from "@/lib/qloo/client";
import type { QlooEntity } from "@/lib/qloo/types";
import { resolveAll, resolveBrand } from "@/lib/methods/resolve";
import { chainNames, nameSim, norm } from "@/lib/methods/names";
import { CATEGORIES, VENUE_LABELS, VENUE_TAGS, buildPlaybook, type Block, type CategoryId, type Motion, type PlaybookConfig, type Tier, type VenueType } from "@/lib/playbook/config";
import { US_CENTER, isMetroId, metroById, metroIdFor } from "@/lib/playbook/metros";
import type { DemoBrand } from "@/lib/playbook/demo";
import type { Row } from "@/lib/methods/names";
import { fingerprint } from "@/lib/blocks/fingerprint";
import { markets, type MarketsEnrichers } from "@/lib/blocks/markets";
import { places } from "@/lib/blocks/places";
import { partners } from "@/lib/blocks/partners";
import { message } from "@/lib/blocks/message";
import { moments, type DateLookup, type ShowLookup } from "@/lib/blocks/moments";
import type { AgentEvent, BlockContext, BlockMeta, TagChip } from "@/lib/blocks/types";
import type { BrandInput, Classification, WebsiteRead } from "./intake";
import { results } from "@/lib/qloo/client";
import { CATEGORY_ANCHORS } from "@/lib/playbook/anchors";

export type ReadCard = {
  brand: string;
  status: "tuned" | "beta";
  lines: { label: string; value: string; evidence?: string }[];
  recipe: PlaybookConfig["recipe"];
  blocks: Block[];
  fingerprint: TagChip[];
  pipelineStages: string[];
};

/** An inline question during the run (§6.2.2): asked only when the brief left the gap, never awaited. */
export type InlineQuestion = {
  id: "where_sold" | "is_this_you" | "swap_comparables";
  text: string;
  why: string;
  /** What Athena assumed and kept going with. */
  assumed: string;
  options?: { id: string; label: string; hint?: string }[];
  /** What an answer re-runs: blocks, plus the Read card. */
  reruns: (Block | "card")[];
};

export type PlanEvent =
  | { type: "question"; question: InlineQuestion }
  | { type: "event"; event: AgentEvent }
  | { type: "card"; card: ReadCard; meta: BlockMeta }
  | { type: "block"; block: Block; meta: BlockMeta; data: unknown }
  | { type: "done"; qlooCalls: number; ms: number }
  | { type: "error"; message: string };

export type PlanDeps = {
  qloo: QlooClient;
  signalPolicy?: import("@/lib/playbook/config").SignalPolicy;
  send: (e: PlanEvent) => void;
  loadStockists?: (file: string, metro: string) => Promise<Row[]>;
  enrich?: { markets?: MarketsEnrichers; shows?: ShowLookup; festivalDate?: DateLookup; websites?: (cards: import("@/lib/blocks/partners").PartnerCard[]) => Promise<void>; podcastDetails?: (cards: import("@/lib/blocks/partners").PartnerCard[]) => Promise<void> };
  /** The last good result per block, for the labelled fallback (§14.2). */
  lastRun?: { save(slug: string, block: Block, result: { meta: BlockMeta; data: unknown }): Promise<void>; load(slug: string, block: Block): Promise<{ at: number; result: { meta: BlockMeta; data: unknown } } | undefined> };
  /** The agent's LLM steps for brands that aren't pre-configured (§6.2). Absent in fixture mode. */
  intake?: {
    readWebsite: (urls: string[]) => Promise<WebsiteRead | undefined>;
    classify: (input: Parameters<typeof import("./intake").classifyBusiness>[0]) => Promise<Classification | undefined>;
    parseAccounts: (text: string) => Promise<Row[]>;
    chooseComparables: (business: { name: string; description?: string; tier: Tier; category: string }, pool: string[]) => Promise<string[]>;
    writeHooks?: (ev: import("./hooks").HookEvidence) => Promise<import("./hooks").Hooks | undefined>;
  };
};

/** Everything the blocks need, however the business was read. */
type PlanSpec = {
  slug: string;
  brandName: string;
  whatYouSell: string;
  category: CategoryId;
  tier: Tier;
  tierEvidence?: string;
  motions: Motion[];
  motionsEvidence?: string;
  own?: QlooEntity;
  comparables: QlooEntity[];
  competitors: QlooEntity[];
  accounts: string[];
  rows: Row[];
  accountsLabel?: string;
  homeMetro?: string;
  targetMetro?: string;
  names: Map<string, string>;
};

/** Which blocks, and whether the card, a run sends; absent means everything (§6.2.2 re-runs). */
export type RunScope = (Block | "card")[] | undefined;

const channelLabels = (pb: PlaybookConfig) =>
  pb.placeChannels.map((urn) => VENUE_LABELS[(Object.keys(VENUE_TAGS) as VenueType[]).find((k) => VENUE_TAGS[k] === urn)!]).filter(Boolean);

type Emit = (e: Omit<AgentEvent, "t">) => void;

async function resolveNames(qloo: QlooClient, names: string[], emit: Emit, why: string): Promise<QlooEntity[]> {
  const found = (await Promise.all(names.map((n) => resolveBrand(qloo, n).catch(() => undefined)))).flatMap((r) => (r?.entity ? [r.entity] : []));
  if (names.length) emit({ tool: "resolve", why, status: found.length ? "ok" : "empty", callIds: [], summary: found.length ? found.map((c) => c.name).join(", ") : "none found in Qloo" });
  return found;
}

/** Matches stockist rows to Qloo venues and works out the home metro from where they are (§9.1). */
async function resolveAccounts(qloo: QlooClient, rows: Row[], emit: Emit, label: string) {
  if (!rows.length) return { accounts: [] as string[], matched: [] as QlooEntity[], home: undefined as string | undefined };
  emit({ tool: "resolve", why: `Matching ${rows.length} ${label} to Qloo venues`, status: "running", callIds: [], summary: "searching by name and address" });
  const resolved = await resolveAll(qloo, rows);
  const matched = resolved.flatMap((r) => (r.status === "matched" && !r.entity.properties?.is_closed ? [r.entity] : []));
  const counts = new Map<string, number>();
  for (const e of matched) {
    const raw = e.properties?.geocode?.metro;
    const m = raw ? metroIdFor(raw, e.location ? [e.location.lat, e.location.lon] : undefined) : undefined;
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const home = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  emit({ tool: "resolve", why: `Matched your ${label}`, status: matched.length ? "ok" : "empty", callIds: [], summary: `${matched.length} of ${rows.length} found in Qloo${home ? `, mostly in ${metroById(home).name}` : ""}` });
  return { accounts: [...new Set(matched.map((e) => e.entity_id))].slice(0, 50), matched, home };
}

/** A demo brand: fixed category, tier and motions; accounts from its public stockist file (§7.7). */
async function prepareDemo(brand: DemoBrand, qloo: QlooClient, deps: PlanDeps, emit: Emit): Promise<PlanSpec> {
  const own = await resolveBrand(qloo, brand.name);
  emit({ tool: "resolve", why: `Finding ${brand.name} in Qloo`, status: own.entity ? "ok" : "needs_input", callIds: [own.callId], summary: own.entity ? `${own.entity.name}` : "not found" });
  const comparables = await resolveNames(qloo, brand.comparables, emit, "Adding comparable brands to the taste signal");
  const rows = brand.stockists && deps.loadStockists ? await deps.loadStockists(brand.stockists.file, brand.stockists.metro) : [];
  const acc = await resolveAccounts(qloo, rows, emit, `${brand.stockists?.metro ?? ""} stockists`);
  const names = new Map<string, string>();
  for (const e of [...acc.matched, ...(own.entity ? [own.entity] : []), ...comparables]) names.set(e.entity_id, e.name);
  const prices = acc.matched.map((e) => e.properties?.price_level ?? 0).filter((p) => p > 0);
  return {
    slug: brand.slug,
    brandName: brand.name,
    whatYouSell: brand.description.split(",")[0],
    category: brand.category,
    tier: brand.tier,
    tierEvidence: prices.length ? `Your accounts average price level ${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(1)} of 4` : undefined,
    motions: brand.motions,
    own: own.entity,
    comparables,
    competitors: [],
    accounts: acc.accounts,
    rows,
    accountsLabel: brand.stockists?.metro,
    homeMetro: brand.homeMetro,
    targetMetro: brand.targetMetro,
    names,
  };
}

/** Any brand: the agent reads the website, classifies the business and resolves what it's given (§6.2, §7.2). */
async function prepareCustom(input: BrandInput, qloo: QlooClient, deps: PlanDeps, emit: Emit): Promise<PlanSpec | { outOfScope: string }> {
  const intake = deps.intake;
  emit({ tool: "resolve", why: `Finding ${input.name} in Qloo`, status: "running", callIds: [], summary: "searching brands" });
  let [own, site] = await Promise.all([
    resolveBrand(qloo, input.name).catch(() => undefined),
    input.websites?.length && intake
      ? (emit({ tool: "read_website", why: `Reading ${input.websites.join(", ")}`, status: "running", callIds: [], summary: "Gemini is reading the pages" }), intake.readWebsite(input.websites))
      : Promise.resolve(undefined),
  ]);
  // "Is this you?" (§6.2.2): the founder's answer wins; else an exact match; else, when several Qloo brands are
  // plausible, the best one is assumed and the question goes to the rail.
  const plausible = (own?.options ?? []).filter((e) => nameSim(e.name, input.name) >= 0.8);
  const answered = input.answers?.brandId;
  let ownEntity: QlooEntity | undefined = answered === null ? undefined : answered ? (own?.options.find((e) => e.entity_id === answered) ?? own?.entity) : own?.entity;
  if (answered === undefined && plausible.length > 1) {
    ownEntity ??= plausible[0];
    const hint = (e: QlooEntity) => (typeof e.disambiguation === "string" ? e.disambiguation : typeof e.properties?.short_description === "string" ? e.properties.short_description : undefined)?.slice(0, 80);
    deps.send({
      type: "question",
      question: {
        id: "is_this_you",
        text: "Is this you?",
        why: `Qloo has ${plausible.length} brands that could be ${input.name}`,
        assumed: ownEntity.name,
        options: [...plausible.map((e) => ({ id: e.entity_id, label: e.name, hint: hint(e) })), { id: "none", label: "None of these" }],
        reruns: ["card", "markets", "partners", "message", "moments"],
      },
    });
  }
  if (own) own = { ...own, entity: ownEntity };
  emit({ tool: "resolve", why: `Finding ${input.name} in Qloo`, status: own?.entity ? "ok" : "empty", callIds: own ? [own.callId] : [], summary: own?.entity ? `found: ${own.entity.name}` : "not in Qloo yet, which is normal for a young brand; I'll use brands like you" });
  if (site) emit({ tool: "read_website", why: "Read the website", status: "ok", callIds: [], summary: [site.description, site.products.length ? `products: ${site.products.join(", ")}` : "", site.stockists.length ? `${site.stockists.length} stockists listed` : ""].filter(Boolean).join(" · ") });

  // Accounts: pasted list first, then any the website lists.
  // Rows already read from the brief's files come first; pasted text (or a "Where are you sold?" answer) is parsed.
  let rows: Row[] = (input.rows ?? []).filter((r) => r.name).slice(0, 200);
  const pasted = [input.accountsText, input.answers?.whereSold].filter((t) => t?.trim()).join("\n");
  if (pasted && intake) {
    emit({ tool: "parse_accounts", why: "Reading your list of accounts", status: "running", callIds: [], summary: "turning it into rows" });
    rows = [...rows, ...(await intake.parseAccounts(pasted).catch(() => []))].slice(0, 200);
    emit({ tool: "parse_accounts", why: "Read your list", status: rows.length ? "ok" : "empty", callIds: [], summary: `${rows.length} venues` });
  }
  if (!rows.length && site?.stockists.length) rows = site.stockists;
  const acc = await resolveAccounts(qloo, rows, emit, "accounts");

  // Classify (LLM), with Qloo's tags and the accounts' venue types as evidence.
  const ownTags = (own?.entity?.tags ?? []).map((t) => t.name).filter(Boolean);
  const accountTypes = [...new Set(acc.matched.flatMap((e) => (e.tags ?? []).filter((t) => (t.id ?? "").startsWith("urn:tag:genre:place:")).map((t) => t.name)))].slice(0, 8);
  emit({ tool: "classify_business", why: "Working out what you sell, your price tier and how you grow", status: "running", callIds: [], summary: "Gemini is reading the evidence" });
  const cls = intake
    ? await intake.classify({ name: input.name, description: input.description, website: site, qlooTags: ownTags, accountTypes, needComparables: !own?.entity && !input.comparables?.length })
    : undefined;
  const category = cls?.category ?? (site?.category && site.category in CATEGORIES ? (site.category as CategoryId) : "G1");
  if (category === "out_of_scope" || CATEGORIES[category as CategoryId]?.status === "out_of_scope") {
    return { outOfScope: cls?.why || "This business doesn't grow through venues, partners or city launches, so Athena can't plan for it yet." };
  }
  const cat = CATEGORIES[category as CategoryId];
  // Tier: evidence beats the LLM (§7.2): Qloo's price tier for the brand, then accounts' price levels.
  const prices = acc.matched.map((e) => e.properties?.price_level ?? 0).filter((p) => p > 0);
  const meanPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : undefined;
  const qlooTier = own?.entity?.properties?.price_tier;
  const evidenceTier: Tier | undefined = qlooTier ? (["mass", "mainstream", "premium", "luxury"] as Tier[])[Math.min(3, Math.max(0, qlooTier - 1))] : meanPrice ? (meanPrice < 1.75 ? "mass" : meanPrice < 2.4 ? "mainstream" : meanPrice < 3.2 ? "premium" : "luxury") : undefined;
  const tier = evidenceTier ?? input.tierHint ?? cls?.tier ?? site?.tier ?? "mainstream";
  // Motions: the founder's answer from the brief, else the classifier's, else the category's.
  const motions = input.motions?.length ? input.motions : cls?.motions.length ? cls.motions : cat.motions;
  // "Where are you sold?" (§6.2.2): no stockists from the brief or the site, and the brand grows through venues or shops.
  if (!rows.length && input.answers?.whereSold === undefined && motions.some((m) => m === "venue" || m === "retail")) {
    deps.send({
      type: "question",
      question: {
        id: "where_sold",
        text: "Where are you sold? Paste anything.",
        why: "Your stockists are the strongest signal of who buys you",
        assumed: "No accounts yet; planning from your brand and brands like you",
        reruns: ["card", "places"],
      },
    });
  }
  emit({ tool: "classify_business", why: "Read the business", status: "ok", callIds: [], summary: `${cat.name}, ${tier}; grows through ${motions.join(" and ").replace(/_/g, " ")}${cls?.why ? ` (${cls.why})` : ""}` });

  // Comparables: the user's; else, when Qloo lacks the brand, the LLM's suggestions that exist in Qloo; else the
  // agent picks from a pool of Qloo brands in the category (anchors and their peers), so there's always a signal.
  const given = input.answers?.comparables ?? input.answers?.pinnedComparables ?? input.comparables ?? [];
  let comparables = await resolveNames(qloo, (given.length ? given : own?.entity ? [] : (cls?.comparables ?? [])).slice(0, 6), emit, given.length ? "Adding your comparable brands" : "Checking which suggested comparable brands Qloo knows");
  // When Qloo lacks the brand, always let the agent choose the closest 3 from the full pool (8 Oct, Graza: the
  // LLM's two resolvable suggestions were drinks brands; the pool also held Brightland, a closer match).
  if (!given.length && !own?.entity) {
    emit({ tool: "resolve", why: "Building a pool of Qloo brands in your category", status: "running", callIds: [], summary: CATEGORY_ANCHORS[category as CategoryId].join(", ") });
    const anchors = await resolveNames(qloo, CATEGORY_ANCHORS[category as CategoryId], () => undefined, "");
    const peers = anchors.length
      ? (results(await qloo.insights({ "filter.type": "urn:entity:brand", "signal.interests.entities": anchors.map((a) => a.entity_id), "filter.popularity.max": 0.97, take: 30 })).entities ?? [])
      : [];
    const pool = [...new Map([...comparables, ...anchors, ...peers].map((e) => [e.name, e])).values()].slice(0, 40);
    const picked = intake ? await intake.chooseComparables({ name: input.name, description: site?.description ?? input.description, tier, category: cat.name }, pool.map((e) => e.name)) : pool.slice(0, 3).map((e) => e.name);
    const chosen = pool.filter((e) => picked.includes(e.name));
    comparables = (chosen.length ? chosen : [...comparables, ...anchors]).slice(0, 3);
    emit({ tool: "resolve", why: "Chose comparable brands from Qloo for the taste signal", status: comparables.length ? "ok" : "empty", callIds: [], summary: comparables.map((c) => c.name).join(", ") || "none" });
    // "Swap any comparable brands?" (§6.2.2): Athena chose them, so the founder can change them.
    if (comparables.length) {
      const chosen = new Set(comparables.map((c) => c.name));
      deps.send({
        type: "question",
        question: {
          id: "swap_comparables",
          text: "Swap any comparable brands?",
          why: "I picked brands whose customers look like yours",
          assumed: comparables.map((c) => c.name).join(", "),
          options: [...comparables.map((c) => ({ id: c.name, label: c.name, hint: "chosen" })), ...pool.filter((e) => !chosen.has(e.name)).slice(0, 6).map((e) => ({ id: e.name, label: e.name }))],
          reruns: ["card", "markets", "places", "partners", "message", "moments"],
        },
      });
    }
  }
  const competitors = await resolveNames(qloo, (input.competitors?.length ? input.competitors : (site?.competitors ?? [])).slice(0, 3), emit, "Finding your competitors in Qloo");

  const names = new Map<string, string>();
  for (const e of [...acc.matched, ...(own?.entity ? [own.entity] : []), ...comparables, ...competitors]) names.set(e.entity_id, e.name);
  const city = input.city ? (isMetroId(input.city) ? input.city : metroIdFor(input.city)) : undefined;
  return {
    slug: `custom-${norm(input.name).replace(/ /g, "-").slice(0, 40)}`,
    brandName: own?.entity?.name ?? input.name,
    whatYouSell: site?.products.length ? site.products.slice(0, 3).join(", ") : input.description?.split(". ")[0].slice(0, 80) || cat.name,
    category: category as CategoryId,
    tier,
    tierEvidence: qlooTier ? `Qloo price tier ${qlooTier} of 4` : meanPrice ? `Your accounts average price level ${meanPrice.toFixed(1)} of 4` : undefined,
    motions,
    motionsEvidence: cls?.why,
    own: own?.entity,
    comparables,
    competitors,
    accounts: acc.accounts,
    rows,
    accountsLabel: acc.home ? metroById(acc.home).name : undefined,
    homeMetro: acc.home,
    targetMetro: city,
    names,
  };
}

/** Runs the plan for a prepared business: the Read card, then every block, streamed and isolated. */
async function runPlan(spec: PlanSpec, deps: PlanDeps, qloo: QlooClient, emit: Emit, started: number, count: () => number, scope?: RunScope, crowd?: BrandInput["crowd"]): Promise<void> {
  const signal = { accounts: spec.accounts, wins: [], declines: [], brand: spec.own?.entity_id, comparables: spec.comparables.map((c) => c.entity_id), tags: [], crowd: crowd?.signal.map((s) => s.id) };
  for (const s of crowd?.signal ?? []) spec.names.set(s.id, s.name);
  if (!signal.accounts.length && !signal.brand && !signal.comparables.length) {
    emit({ tool: "plan", why: `I need a little more about ${spec.brandName} to read its taste`, status: "needs_input", callIds: [], summary: "add a website, a few accounts or two brands like yours" });
    deps.send({ type: "done", qlooCalls: count(), ms: Date.now() - started });
    return;
  }
  const build = (targetMetro: string) =>
    buildPlaybook({ brandName: spec.brandName, category: spec.category, tier: spec.tier, motions: spec.motions, signal, competitors: spec.competitors.map((c) => c.entity_id), homeMetro: spec.homeMetro, targetMetro, signalPolicy: deps.signalPolicy });
  let pb = build(spec.targetMetro ?? (spec.homeMetro && spec.homeMetro !== "la" ? "la" : "nyc"));
  let ctx: BlockContext = { pb, qloo, names: spec.names, emit };

  // The Read card (M1).
  const fp = await fingerprint(ctx);

  // No city given: rank metros first and plan for the top one (§12.3, "which metro to open first").
  let marketsFirst: Awaited<ReturnType<typeof markets>> | undefined;
  if (!spec.targetMetro) {
    marketsFirst = await markets(ctx, deps.enrich?.markets).catch(() => undefined);
    const top = marketsFirst?.data.metros[0]?.metroId;
    if (top && top !== pb.targetMetro) {
      pb = build(top);
      ctx = { ...ctx, pb };
      marketsFirst = undefined; // re-run so the heatmap is for the chosen city (the metro call is cached)
    }
    emit({ tool: "plan", why: "Choosing the city to plan for", status: "ok", callIds: [], summary: `${metroById(pb.targetMetro).name}, your crowd's strongest match` });
  }

  const cat = CATEGORIES[pb.category];
  const card: ReadCard = {
    brand: spec.brandName,
    status: pb.status,
    recipe: pb.recipe,
    blocks: pb.blocks,
    fingerprint: fp.data,
    pipelineStages: pb.pipelineStages,
    lines: [
      { label: "What you sell", value: `${spec.whatYouSell}, ${pb.tier}`, evidence: spec.tierEvidence },
      { label: "How you grow", value: pb.motions.map((m) => m.replace("_", " ")).join(" and "), evidence: spec.motionsEvidence ?? cat.name },
      { label: "Channels I'll look at", value: channelLabels(pb).join(", ") },
      {
        label: "Taste signal",
        value: crowd
          ? `${crowd.name}: ${crowd.signal.slice(0, 4).map((s) => s.name).join(", ")}`
          : spec.accounts.length ? `Your ${spec.accounts.length} ${spec.accountsLabel ?? ""} accounts in Qloo`.replace("  ", " ") : [spec.own?.name, ...spec.comparables.map((c) => c.name)].filter(Boolean).join(" + "),
        evidence: spec.rows.length ? `${spec.accounts.length} of ${spec.rows.length} accounts matched` : undefined,
      },
      ...(spec.competitors.length ? [{ label: "Competitors", value: spec.competitors.map((c) => c.name).join(", ") }] : []),
      spec.accounts.length || !pb.motions.some((m) => m === "venue" || m === "retail")
        ? { label: "Stage", value: pb.stage, evidence: spec.accounts.length ? `${spec.accounts.length} accounts` : undefined }
        : { label: "Stage", value: "not known yet", evidence: "add your stockists to plan from where you already sell" },
      { label: "Target city", value: metroById(pb.targetMetro).name },
    ],
  };
  if (!scope || scope.includes("card")) deps.send({ type: "card", card, meta: fp.meta });

  // Blocks run concurrently and stream as soon as their own calls return (§14.9). Message waits for
  // Partners, because its default competitors come from the mutual-fit peer set (§9.16).
  // Partners streams its lists as soon as the first calls return, then updates as mutual fit and "Who listens" land.
  const partnersCalls: BlockMeta["calls"] = [];
  const partnersEarly = !scope || scope.includes("partners")
    ? (data: unknown) => deps.send({ type: "block", block: "partners", meta: { block: "partners", status: "ok", calls: [...partnersCalls], ms: Date.now() - started }, data })
    : undefined;
  const partnersRun = pb.blocks.includes("partners")
    ? partners({ ...ctx, qloo: ctx.qloo.withLog((c) => partnersCalls.push(c)) }, { fingerprint: fp.data, websites: deps.enrich?.websites, podcastDetails: deps.enrich?.podcastDetails, early: partnersEarly })
    : undefined;
  partnersRun?.catch(() => undefined); // handled where it's awaited; avoids an unhandled rejection
  const runBlock = async (b: Block, attempt: number): Promise<{ meta: BlockMeta; data: unknown } | undefined> => {
    switch (b) {
      case "markets":
        return attempt === 0 && marketsFirst ? marketsFirst : markets(ctx, deps.enrich?.markets);
      case "places":
        return places(ctx, { fingerprint: fp.data, chainNames: chainNames(spec.rows.map((r) => r.name)) });
      case "partners":
        // The first attempt is the run Message also waits on; a retry starts fresh.
        return attempt === 0 ? partnersRun! : partners(ctx, { fingerprint: fp.data, websites: deps.enrich?.websites, podcastDetails: deps.enrich?.podcastDetails });
      case "message": {
        // Competitors: the user's, else the top 2 peers from the mutual-fit peer set (§9.16).
        const competitors = spec.competitors.length
          ? spec.competitors.map((c) => ({ id: c.entity_id, name: c.name }))
          : partnersRun ? ((await partnersRun.catch(() => undefined))?.data.peers.slice(0, 2) ?? []) : [];
        return message(ctx, { fingerprint: fp.data, competitors, writeHooks: deps.intake?.writeHooks, product: spec.whatYouSell });
      }
      case "moments": {
        // Stream the Qloo-ranked list first; shows and dated festivals fill in as their lookups finish (§14.9).
        const calls: BlockMeta["calls"] = [];
        const early = (data: unknown) => deps.send({ type: "block", block: b, meta: { block: b, status: "ok", calls, ms: Date.now() - started }, data });
        return moments({ ...ctx, qloo: ctx.qloo.withLog((c) => calls.push(c)) }, { shows: deps.enrich?.shows, festivalDate: deps.enrich?.festivalDate }, early);
      }
      case "act":
        return undefined; // Act is driven by the user (drafts, route, pipeline).
    }
  };
  // Every block gets one retry; if it still fails, its last good result is shown under a dated label (§14.2).
  // Nothing reaches the screen as an error, and the plan always finishes.
  const runs = pb.blocks.filter((b) => !scope || scope.includes(b)).map(async (b) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await runBlock(b, attempt);
        if (!r) return;
        deps.send({ type: "block", block: b, meta: r.meta, data: r.data });
        await deps.lastRun?.save(spec.slug, b, r);
        return;
      } catch {
        if (attempt === 0) emit({ tool: b, why: `Retrying ${b}`, status: "running", callIds: [], summary: "one more try" });
      }
    }
    const last = await deps.lastRun?.load(spec.slug, b).catch(() => undefined);
    if (last) {
      deps.send({ type: "block", block: b, meta: { ...last.result.meta, fallbackFrom: last.at }, data: last.result.data });
      emit({ tool: b, why: `Showing the last live ${b} results`, status: "ok", callIds: [], summary: `from ${new Date(last.at).toLocaleString()}` });
    } else {
      emit({ tool: b, why: `${b} will be ready on the next run`, status: "ok", callIds: [], summary: "skipped for now" });
    }
  });
  await Promise.all(runs);
  deps.send({ type: "done", qlooCalls: count(), ms: Date.now() - started });
}

function harness(deps: PlanDeps) {
  const started = Date.now();
  let qlooCalls = 0;
  const qloo = deps.qloo.withLog(() => qlooCalls++);
  const emit: Emit = (e) => deps.send({ type: "event", event: { ...e, t: Date.now() - started } });
  return { started, qloo, emit, count: () => qlooCalls };
}

/** A demo brand's plan (§7.7). */
export async function runDemoPlan(brand: DemoBrand, deps: PlanDeps): Promise<void> {
  const h = harness(deps);
  const spec = await prepareDemo(brand, h.qloo, deps, h.emit);
  await runPlan(spec, deps, h.qloo, h.emit, h.started, h.count);
}

/**
 * A typed city outside the named metros has no known centre; one place lookup in Qloo gives it one, so maps and
 * Ticketmaster (which searches by coordinates) land in the right place (§9.3, v3.0). Never throws.
 */
async function placeCity(qloo: QlooClient, id: string): Promise<string> {
  const m = metroById(id);
  if (m.center !== US_CENTER) return id;
  const r = await qloo.insights({ "filter.type": "urn:entity:place", "filter.location.query": m.query, "filter.geocode.country_code": "US", take: 1 }).catch(() => undefined);
  const e = r?.results.entities?.[0];
  return e?.location ? metroIdFor(m.name, [e.location.lat, e.location.lon]) : id;
}

/**
 * The journey runs one stop at a time (§6.2.2), so the business read (website, classification, resolution) is kept
 * for an hour per brand input and reused by each stop's run. Per instance; another instance just reads it again.
 */
const PREPARED_TTL = 60 * 60 * 1000;
const prepared = new Map<string, { at: number; spec: PlanSpec | { outOfScope: string } }>();
const preparedKey = (input: BrandInput) => JSON.stringify({ ...input, crowd: undefined, city: undefined });

/** Any brand (M10, §6.2): the agent reads the business first, then runs the same blocks. */
export async function runCustomPlan(input: BrandInput, deps: PlanDeps, scope?: RunScope): Promise<void> {
  const h = harness(deps);
  const key = preparedKey(input);
  const hit = prepared.get(key);
  let ready = hit && Date.now() - hit.at < PREPARED_TTL ? hit.spec : undefined;
  if (ready) h.emit({ tool: "plan", why: `Picking up ${input.name} where we left off`, status: "ok", callIds: [], summary: "the business read is ready" });
  ready ??= await prepareCustom(input, h.qloo, deps, h.emit).catch((err) => {
    console.error("prepareCustom failed", err);
    return undefined;
  });
  if (ready) {
    if (prepared.size > 200) prepared.delete(prepared.keys().next().value!);
    prepared.set(key, { at: Date.now(), spec: ready });
  }
  const prepared_ = ready && !("outOfScope" in ready) && input.city ? { ...ready, names: new Map(ready.names), targetMetro: await placeCity(h.qloo, isMetroId(input.city) ? input.city : metroIdFor(input.city)) } : ready && !("outOfScope" in ready) ? { ...ready, names: new Map(ready.names) } : ready;
  if (!prepared_) {
    h.emit({ tool: "plan", why: `I couldn't read ${input.name} this time`, status: "needs_input", callIds: [], summary: "add a website or two brands like yours and try again" });
    deps.send({ type: "done", qlooCalls: h.count(), ms: Date.now() - h.started });
    return;
  }
  if ("outOfScope" in prepared_) {
    h.emit({ tool: "classify_business", why: "Out of scope", status: "needs_input", callIds: [], summary: prepared_.outOfScope });
    deps.send({ type: "done", qlooCalls: h.count(), ms: Date.now() - h.started });
    return;
  }
  await runPlan(prepared_, deps, h.qloo, h.emit, h.started, h.count, scope, input.crowd);
}
