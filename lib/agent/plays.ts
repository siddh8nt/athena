import type { LiveFact } from "@/lib/knowledge/types";
import type { Galaxy } from "@/lib/taste/galaxy";
import type { FitsRun } from "@/lib/journey/types";
import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import type { BlockContext, TagChip } from "@/lib/blocks/types";
import { fingerprint } from "@/lib/blocks/fingerprint";
import type { MarketsEnrichers, Neighbourhood } from "@/lib/blocks/markets";
import type { VenuePick } from "@/lib/blocks/places";
import type { PartnerCard, PartnersData } from "@/lib/blocks/partners";
import { message, positionAgainst, type MessageData, type PositionCard } from "@/lib/blocks/message";
import { moments, type DateLookup, type Moment, type ShowLookup } from "@/lib/blocks/moments";
import type { HookEvidence, Hooks } from "./hooks";
import type { Look, LookEvidence } from "./looks";
import { by, oneLineEvidence, readCrowd, scoutPage, writeCrowd, type CrowdInput } from "./scout";
import { mergePage, type CrowdPage, type CrowdTier } from "@/lib/team/page";
import { isStrong, readCities, roles, verdict, VERDICT_LABEL, type NavRead } from "./navigator";
import { budgetOf, contactOf, entryRoute, FEW_IN_HOOD, FITS, offerFor, readShops, shopCities, wholesaleOf, type RepRead, type Shop, type ShopSite } from "./rep";
import { onlineStop, type OnlineData } from "@/lib/stops/online";
import { contactLine, fitOf, matchCrowds, offerOf, ONE_WAY, readMatches, topMatch, type Creator, type FoundCreator, type MatchCrowd, type MatchRead, type Partner, type PartnerSite, type Rate, type YouTubeChannel, type BrandJudgement } from "./matchmaker";
import { nameSim } from "@/lib/methods/names";
import type { RetailCategory, RetailerPick } from "@/lib/stops/retailers";
import { buildPlaybook, VENUE_TAGS, type CategoryId, type Motion, type Tier } from "@/lib/playbook/config";
import { METROS, metroById } from "@/lib/playbook/metros";
import { locationParams, resolveTyped } from "@/lib/places/location";
import type { CrowdCard, CrowdsResult } from "@/lib/journey/types";
import { whyOf } from "@/lib/taste/galaxy";
import type { FitsResult } from "@/lib/fits/types";
import type { SeedInput } from "@/lib/taste/seed";
import type { Mark, Outcome, WorkItem } from "@/lib/team/types";
import { MARKS } from "@/lib/team/types";
import { applyOutcomes, itemId, latest, outcomeLine } from "./outcomes";
import { SPECIALIST_IDS, isSpecialist, type SpecialistId } from "./specialists";
import { writeDraft, type DraftTo } from "./draft";
import type { AgentState, Decision, Tool, ToolResult } from "./tools";

// The plays (PRD §23.2 step 8e): the fixed stops the journey had (Markets, neighbourhoods, Places, the retailer step-up,
// partner brands and podcasts, online audiences, messages, the mood board, the drafts, outcome logging), each wrapped
// as a tool its specialist chooses. A play is one entry: `for` names its specialist, `when` is the evidence rule code
// decides by when the model isn't there. The blocks still do the measuring; the specialist decides which, with what,
// and when to widen, drop or move on.

/** The brand as the team reads it from the Brand Graph. */
export type TeamBrand = {
  name: string;
  product: string;
  category: CategoryId;
  tier: Tier;
  motions: Motion[];
  channel?: "online" | "offline" | "both";
  /** Its own Qloo id, when Qloo knows it. */
  ownId?: string;
  comparables: { id: string; name: string }[];
  competitors: { id: string; name: string }[];
  /** Shops and retailers it's already in, by name: never suggested again. */
  stockists: string[];
  /** Metro ids it already sells in: never a new city. */
  soldIn: string[];
  homeMetro?: string;
  /** How many regions the team can work at once, when the founder said. */
  capacity?: number;
  retail?: RetailCategory;
  lookalikes: string[];
  traits: string[];
};

/** Enrichers from the server (live only); empty in fixture mode. */
export type TeamEnrich = {
  markets?: MarketsEnrichers;
  shows?: ShowLookup;
  festivalDate?: DateLookup;
  websites?: (cards: PartnerCard[]) => Promise<void>;
  podcastDetails?: (cards: PartnerCard[]) => Promise<void>;
  writeHooks?: (ev: HookEvidence) => Promise<Hooks | undefined>;
  writeLooks?: (ev: LookEvidence) => Promise<Look | undefined>;
  /** Reads shops' own sites for brands carried, a wholesale page and a public buyer email (§23.5 f, l). */
  shopSites?: (shops: Shop[], brand: { name: string; product: string }) => Promise<Map<string, ShopSite>>;
  /** The shop names a web search finds on Faire, labelled as found by search. */
  faire?: (city: string, names: string[]) => Promise<Set<string>>;
  /** The Matchmaker's web reads (§23.5 g): creators and their sizes, values, podcast details, partner sites, public rates. */
  match?: {
    youtube?: (creators: { name: string; handle?: string; url?: string }[]) => Promise<Map<string, YouTubeChannel>>;
    findCreators?: (crowd: MatchCrowd, brand: { name: string; product: string }, known: string[]) => Promise<FoundCreator[]>;
    judgeValues?: (brand: { name: string; product: string; traits: string[] }, names: string[]) => Promise<BrandJudgement>;
    podcasts?: (pods: Partner[]) => Promise<void>;
    sites?: (brands: Partner[]) => Promise<Map<string, PartnerSite>>;
    rates?: (bands: { kind: Rate["kind"]; band: string }[]) => Promise<Rate[]>;
  };
};

/**
 * The team's shared memory (§23.2 step 8b): the Brand Graph's brand, what each specialist has found, the outcomes.
 * Every specialist's run holds it by reference, so what one finds the next one reads.
 */
export type TeamCtx = {
  brand: TeamBrand;
  /** What the Brand Graph says, one line each: read before anyone asks the founder, so nothing it says is asked. */
  facts?: string[];
  /** The ids of the goals this run works for ("deepen_home", "step_up"…), so the evidence rules can read them. */
  goals: string[];
  enrich: TeamEnrich;
  /** Whether the drafts may use the model. */
  llm: boolean;
  seed?: SeedInput;
  crowds?: CrowdsResult;
  fits?: FitsResult;
  probes: string[];
  /** The Taste Galaxy as it forms while the Analyst measures, for the client to draw live (PRD §23.2 step 8.1b). */
  onGalaxy?: (g: Galaxy) => void;
  /** What the Analyst's last run produced beyond the ranking, for the journey to show as its results (step 8.1). */
  ranked?: Pick<FitsRun, "calendar" | "reach" | "answer" | "sources">;
  /** What the founder asked about from the Galaxy ("Ask the Analyst about this"), and their words. */
  asked?: { id?: string; name: string };
  question?: string;
  /** The founder's answers to the team's earlier questions (ask_founder), read as facts. */
  answers?: { question: string; answer: string }[];
  /** The founder's knowledge as derived notes, by theme, each with its source ids (§23.2 step 8.2e). */
  notes?: LiveFact[];
  /** Win first, and the crowd to win next (set by the Scout, or from the ranking). */
  crowd?: CrowdCard;
  next?: CrowdCard;
  /** The crowd the founder handed to the Scout to win next (§23.2 step 8.3b). */
  focusNext?: CrowdCard;
  city?: { id: string; name: string };
  cities?: { metroId: string; name: string }[];
  hoods?: string[];
  found: {
    fingerprint?: TagChip[];
    places?: VenuePick[];
    partners?: PartnersData;
    message?: MessageData;
    moments?: Moment[];
    online?: OnlineData;
    retailers?: RetailerPick[];
    rivals?: PositionCard[];
    /** The Scout's page (§23.5 d): its last one when it starts, merged with what it reads now. */
    scout?: CrowdPage;
    /** The Navigator's read (§23.5 e): its page is built from it, with what the Rep and the Promoter found filled in. */
    navigator?: NavRead;
    /** The Rep's read (§23.5 f): shops per crowd, city and neighbourhood, and national retailers per crowd. */
    rep?: RepRead;
    /** Pitches written this session, by shop id, shown in the shop's detail. */
    pitch?: Record<string, { subject: string; body: string }>;
    /** Shops that host events, for the Promoter. */
    hosts?: Shop[];
    /** The Matchmaker's read (§23.5 g): creators, brands and podcasts for every crowd. */
    match?: MatchRead;
    /** Asks written this session, by partner item id, shown in the partner's detail. */
    ask?: Record<string, { subject: string; body: string }>;
  };
  outcomes: Outcome[];
  /** Probes the Analyst ran this session, whether the last one changed the crowds, and whether one ran with fewer than three crowds (§23.5 c). */
  probe: { ran: number; unchanged?: boolean; wider?: boolean };
};

const ALL: SpecialistId[] = [...SPECIALIST_IDS];
/** Fewer venues than this after stockists and heard-back ones leave, and the Rep widens. */
export const FEW_VENUES = 8;
export { ONE_WAY };

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const item = (kind: string, name: string, why: string, extra: Partial<Omit<WorkItem, "id" | "kind" | "name" | "why" | "sources" | "callIds">> = {}) => ({ id: itemId(kind, name), kind, name, why, ...extra });
const none = (summary: string): ToolResult => ({ summary, data: {}, status: "empty" });
const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;

/** Runs once per specialist run: undefined once it has run (the step is done), else the rule. */
/** The Rep's lists from its read: shops that fit a crowd (stockists left out) re-ordered on what the founder heard
 * back, hosts for the Promoter, and national retailers once each. Run after a read and when a kept read is restored. */
export function repLists(t: TeamCtx) {
  const read = t.found.rep!;
  const fitting = read.shops.filter((s) => !s.stocked && Object.values(s.crowds).some((x) => x >= FITS));
  const { items: ranked, moved, dropped } = applyOutcomes(fitting.map((s) => ({ s, id: itemId("venue", s.name), kind: "venue", group: s.kind })), t.outcomes, "rep");
  t.found.places = ranked.map((x) => x.s);
  t.found.hosts = read.shops.filter((s) => s.events && !s.stocked);
  const retail = [...new Map(read.crowds.flatMap((c) => read.retailers[c.id] ?? []).map((r) => [r.name, r])).values()];
  t.found.retailers = applyOutcomes(retail.map((r) => ({ r, id: itemId("retailer", r.name), kind: "retailer", group: r.ownLabel ? "own-label retailer" : "retailer" })), t.outcomes, "rep").items.map((x) => x.r);
  return { fitting, ranked, moved, dropped };
}

/** The shops read earlier this session, when they still cover the Navigator's cities and no fresh read was asked for. */
const kept = (t: TeamCtx, a: Record<string, unknown>) => {
  const read = t.found.rep;
  const nav = t.found.navigator;
  return read && a.fresh !== true && (!nav || shopCities(nav).every((c) => read.cities.some((x) => x.metroId === c.metroId))) ? read : undefined;
};

const once =(name: string, f: (t: TeamCtx, s: AgentState) => Decision | undefined) => (s: AgentState) => (!s.team || s.ran?.includes(name) ? undefined : f(s.team, s));

/** Going deeper at home, not launching elsewhere: the Navigator works the home city instead of ranking new ones. */
const homeGoal = (t: TeamCtx) => (t.goals.includes("deepen_home") && !t.goals.includes("launch_city") && t.brand.homeMetro ? metroById(t.brand.homeMetro) : undefined);

/** The cities the brand already has: where it sells and its home. Home base, never counted as new. */
export const yoursOf = (t: TeamCtx) => [...new Set([...t.brand.soldIn, ...(t.brand.homeMetro ? [t.brand.homeMetro] : [])])];

/** The crowd a play aims at: Win first, else the main crowd. */
export const aimed = (t: TeamCtx, s?: AgentState): CrowdCard | undefined => t.crowd ?? (s?.crowds ?? t.crowds)?.crowds.find((c) => c.main) ?? (s?.crowds ?? t.crowds)?.crowds[0];

/** A block's context for the team: the aimed crowd as the signal, the city as the target, progress to the step line. */
export function blockCtx(t: TeamCtx, qloo: QlooClient, status: (text: string) => void, opts: { crowd?: CrowdCard; target?: string } = {}): BlockContext {
  const crowd = opts.crowd ?? aimed(t);
  const b = t.brand;
  const signal = { accounts: [], wins: [], declines: [], brand: b.ownId, comparables: b.comparables.map((c) => c.id), tags: [], crowd: crowd?.signal.map((s) => s.id), crowdBrands: crowd?.brands?.map((x) => x.id) };
  const pb = buildPlaybook({ brandName: b.name, category: b.category, tier: b.tier, motions: b.motions, signal, competitors: b.competitors.map((c) => c.id), homeMetro: b.homeMetro, targetMetro: opts.target ?? t.city?.id ?? b.homeMetro ?? "nyc" });
  const names = new Map([...(crowd?.signal ?? []), ...(crowd?.brands ?? []), ...b.comparables].map((r) => [r.id, r.name]));
  return { pb, qloo, names, emit: (e) => status(e.summary ? `${e.why}: ${e.summary}` : e.why) };
}

// One run of a block shared by the tools that read it (partner brands and podcasts come from one Partners run).
const pending = new WeakMap<TeamCtx, Map<string, Promise<unknown>>>();
function shared<T>(t: TeamCtx, key: string, f: () => Promise<T>): Promise<T> {
  const m = pending.get(t) ?? new Map<string, Promise<unknown>>();
  pending.set(t, m);
  if (!m.has(key)) m.set(key, f().catch((err) => (m.delete(key), Promise.reject(err))));
  return m.get(key) as Promise<T>;
}

async function fp(t: TeamCtx, qloo: QlooClient, status: (s: string) => void): Promise<TagChip[]> {
  if (!t.found.fingerprint) t.found.fingerprint = (await shared(t, "fingerprint", () => fingerprint(blockCtx(t, qloo, status)))).data;
  return t.found.fingerprint;
}

/** A venue's kind for outcomes ("café", "wine store"): its first channel tag. Its other tags ("credit cards", "resy") say nothing of what it is. */
function venueGroup(v: VenuePick, channels: string[]): string {
  const tag = v.tags.find((x) => channels.includes(x.id));
  return (tag?.name ?? "venue").toLowerCase();
}

const CHANNEL_IDS = Object.values(VENUE_TAGS) as string[];

/** "2026-12-15" as the founder reads it, "Dec 15, 2026"; anything else as it came. */
const dayOf = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : d);

/** Narrated why for a skip: the reason, and when another specialist can fill the need, what's needed. */
const skip = (reason: string, need?: string): Decision => ({ skip: reason, ...(need ? { need } : {}) }) as Decision;

/** The crowds the Scout reads, in tab order: the ranked tiers, else the main crowd first. */
export function scoutCrowds(t: TeamCtx, s?: AgentState): CrowdInput[] {
  const crowds = (s?.crowds ?? t.crowds)?.crowds ?? [];
  const fits = (s?.fits ?? t.fits)?.fits ?? [];
  const ranked = fits.flatMap((f) => {
    const crowd = crowds.find((c) => c.id === f.crowd);
    return crowd ? [{ crowd, tier: f.tier as CrowdTier }] : [];
  });
  if (ranked.length) return ranked.slice(0, 3);
  const order: CrowdTier[] = ["win_first", "win_next", "watch"];
  return [...crowds].sort((a, b) => Number(!!a.nearMiss) - Number(!!b.nearMiss) || Number(b.main) - Number(a.main)).slice(0, 3).map((crowd, i) => ({ crowd, tier: crowd.nearMiss ? "watch" : order[i] }));
}

/** The Navigator's read of where every crowd lives, held for the run. */
async function mapCities(t: TeamCtx, s: AgentState, qloo: QlooClient, status: (text: string) => void, cap = t.brand.capacity ?? 2) {
  const read = await readCities(qloo, scoutCrowds(t, s), {
    rivals: t.brand.competitors.slice(0, 5),
    ownId: t.brand.ownId,
    comparables: t.brand.comparables,
    yours: yoursOf(t),
    cap,
    must: homeGoal(t)?.id,
    census: t.enrich.markets?.census,
    names: t.enrich.markets?.neighbourhoods,
    areas: t.enrich.markets?.areas,
    status,
  });
  t.found.navigator = read;
  return read;
}

export const PLAYS: Tool[] = [
  // ---- Analyst ---------------------------------------------------------------------------------------------------
  {
    name: "taste_fingerprint",
    for: ["analyst"],
    description: "The brand's taste fingerprint: the tags its crowd over-indexes on (style, tone, aesthetics), from Qloo. 1 Qloo call.",
    properties: {},
    qloo: () => 1,
    when: once("taste_fingerprint", (t) => (t.found.fingerprint ? undefined : aimed(t) || t.brand.ownId ? { args: {}, why: `Reading ${t.brand.name}'s taste fingerprint` } : undefined)),
    async run(_a, { qloo, state, status }) {
      if (!state.team) return none("needs the team's brand");
      const chips = await fp(state.team, qloo, status);
      return { summary: chips.length ? chips.map((c) => c.name).join(", ") : "no clear tags", data: chips.map((c) => ({ name: c.name, type: c.type, rank: c.rank })), status: chips.length ? "ok" : "thin" };
    },
  },
  {
    name: "position_rivals",
    for: ["analyst"],
    description: "Where the brand stands against its rivals: the taste tags both share, the ones only the brand has, and the ones only the rival has. Needs the brand and its rivals in Qloo. 2 Qloo calls per side.",
    properties: {},
    qloo: (_a, s) => 2 * ((s.team?.brand.competitors.length ?? 0) + 1),
    when: once("position_rivals", (t) =>
      !t.brand.competitors.length ? skip("no rivals named, so nothing to place against") : !t.brand.ownId ? skip(`${t.brand.name} isn't in Qloo, so its taste can't be placed against rivals; the crowds stand in for it`) : { args: {}, why: `Placing ${t.brand.name} against ${list(t.brand.competitors.map((c) => c.name))}` },
    ),
    async run(_a, { qloo, state }) {
      const t = state.team;
      if (!t?.brand.ownId || !t.brand.competitors.length) return none("needs the brand and a rival in Qloo");
      const cards = await positionAgainst(qloo, t.brand.ownId, t.brand.competitors.slice(0, 3));
      t.found.rivals = cards;
      return {
        summary: cards.map((c) => `${c.competitorName}: ${c.onlyYou.slice(0, 2).join(", ") || "no clear edge"} only you`).join("; "),
        data: cards.map(({ callIds: _c, ...c }) => c),
        items: cards.map((c) => item("rival", c.competitorName, c.onlyYou.length ? `Only you: ${c.onlyYou.slice(0, 3).join(", ")}` : c.note ?? "close to you on taste", { group: "rival", detail: c.shared.length ? `Both: ${c.shared.slice(0, 3).join(", ")}` : undefined, ref: c.competitorId })),
      };
    },
  },

  {
    name: "place_entity",
    for: ["analyst"],
    description:
      "Where one entity sits in the measured taste graph, from what's already measured: its crowd, how certain that is (the share of resamples that put it there), whether it's core, and the probed landmarks that rank it highest. 0 Qloo calls. The way to answer a question about one Galaxy node before deciding whether a probe would change anything.",
    properties: { entity_id: { type: "string", description: "The Qloo id; the one the founder asked about when empty." } },
    qloo: () => 0,
    when: once("place_entity", (t, s) => (t.asked && s.crowds ? { args: {}, why: `Reading where ${t.asked.name} sits in what's measured` } : undefined)),
    async run(a, { state }) {
      const t = state.team;
      const g = state.crowds?.galaxy;
      const id = str(a.entity_id, 80) || t?.asked?.id || "";
      const i = g?.nodes.findIndex((n) => n.id === id || (!id && n.name === t?.asked?.name)) ?? -1;
      const name = t?.asked?.name ?? id;
      if (!g || i < 0) return { summary: `${name} isn't on the measured map yet`, data: { name, on_map: false }, status: "thin" };
      const n = g.nodes[i];
      const crowd = n.crowd >= 0 ? state.crowds!.crowds[n.crowd] : undefined;
      const near = whyOf(g, i).map((x) => x.landmark).filter(Boolean);
      const sure = n.certainty >= 0.6;
      return {
        summary: crowd ? `${n.name} sits in ${crowd.name}${sure ? "" : ", though not firmly"}${near.length ? `; nearest ${near.slice(0, 2).join(" and ")}` : ""}` : `${n.name} sits between crowds`,
        data: { name: n.name, crowd: crowd?.name, certainty: Math.round(n.certainty * 100) / 100, core: n.core, near, crowd_stability: crowd?.stability },
        status: sure ? "ok" : "thin",
        items: crowd ? [item("crowd", crowd.name, `${n.name} sits in this crowd${sure ? "" : ", though not firmly"}`, { group: "crowd", ref: crowd.id })] : [],
      };
    },
  },

  // ---- Scout -----------------------------------------------------------------------------------------------------
  {
    name: "next_crowd",
    for: ["scout"],
    description: "The crowd to win after the current one: the Win next fit, else the crowd that meets the main one most strongly, with the bridges (what both love) that lead to it. A crowd with no bridges is a leap. 0 Qloo calls.",
    properties: { crowd_id: { type: "string", description: "A crowd id to look at instead; empty for the evidence's pick." } },
    qloo: () => 0,
    when: once("next_crowd", (t, s) => ((s.crowds ?? t.crowds)?.crowds.length ? { args: {}, why: "Finding the crowd to win next and the path to it" } : undefined)),
    async run(a, { state }) {
      const t = state.team;
      const crowds = state.crowds ?? t?.crowds;
      if (!t || !crowds?.crowds.length) return none("needs the crowds first");
      const main = aimed(t, state)!;
      const fits = state.fits ?? t.fits;
      const meet = (id: string) => crowds.meetings?.find((m) => (m.a === main.id && m.b === id) || (m.b === main.id && m.a === id));
      const others = crowds.crowds.filter((c) => c.id !== main.id);
      const asked = others.find((c) => c.id === str(a.crowd_id, 40));
      const winNext = fits?.fits.find((f) => f.tier === "win_next" && f.crowd !== main.id);
      const strongest = [...others].sort((x, y) => (meet(y.id)?.items.length ?? 0) - (meet(x.id)?.items.length ?? 0))[0];
      const next = asked ?? others.find((c) => c.id === t.focusNext?.id) ?? others.find((c) => c.id === winNext?.crowd) ?? strongest;
      if (!next) return { summary: "one crowd only: no next crowd yet", data: { main: main.name }, status: "thin" };
      t.next = next;
      const bridges = (meet(next.id)?.items ?? []).slice(0, 5);
      const how = asked ? "the crowd asked about" : winNext && next.id === winNext.crowd ? "ranked Win next" : "meets your crowd most strongly";
      const leap = !bridges.length;
      return {
        summary: `${next.name} (${how})${leap ? "; no shared loves, so it's a leap" : `, through ${bridges.slice(0, 3).map((b) => b.name).join(", ")}`}`,
        data: { from: main.name, next: next.name, why: how, leap, bridges: bridges.map((b) => b.name), loves: next.loves.slice(0, 6).map((l) => l.name) },
        status: leap ? "thin" : "ok",
        items: [item("crowd", next.name, leap ? `The crowd to win next (${how}); nothing both crowds love, so reaching it is a leap` : `The crowd to win next (${how}), through ${list(bridges.slice(0, 3).map((b) => b.name))}`, { group: "crowd" })],
      };
    },
  },
  {
    name: "read_crowds",
    for: ["scout"],
    description:
      "Reads every crowd the Analyst ranked (Win first, Win next, Watch) on its own: who they are, the words (themes, hooks, their own phrases, words to avoid), a mood board, the products to lead with, where their attention goes (shows, podcasts, creators) and the rivals already there; then what runs across all three (the paths between them, the order to win them, one message). " +
      "tone rewrites the hooks (\"more playful\", \"shorter\"); crowd_ids reads only those crowds and keeps the rest of the page. About 14 Qloo calls per crowd.",
    properties: {
      crowd_ids: { type: "array", items: { type: "string" }, description: "Only these crowds; empty for all three." },
      tone: { type: "string", description: "How the founder wants the hooks this time, when they said." },
    },
    qloo: (a, s) => 14 * Math.min(3, Array.isArray(a.crowd_ids) && a.crowd_ids.length ? a.crowd_ids.length : (s.crowds ?? s.team?.crowds)?.crowds.length ?? 3),
    maxMs: 140_000,
    when: once("read_crowds", (t, s) => ((s.crowds ?? t.crowds)?.crowds.length ? { args: {}, why: "Reading each crowd: who they are, their words, their look and where their attention goes" } : undefined)),
    async run(a, { qloo, state, status }) {
      const started = Date.now();
      const t = state.team;
      const crowds = state.crowds ?? t?.crowds;
      if (!t || !crowds?.crowds.length) return none("needs the crowds first");
      const ids = Array.isArray(a.crowd_ids) ? a.crowd_ids.map((x) => str(x, 40)).filter(Boolean) : [];
      const inputs = scoutCrowds(t, state).filter((x) => !ids.length || ids.includes(x.crowd.id));
      if (!inputs.length) return none("none of those crowds is measured");
      const tone = str(a.tone, 80) || undefined;
      const avoid = latest(t.outcomes).filter((o) => o.agent === "scout" && o.kind === "message" && o.mark === "no").map((o) => o.name);
      const knowledge = [...(t.facts ?? []), ...(t.notes ?? []).map((n) => n.text)];
      const chips = await fp(t, qloo, status);
      const brand = { name: t.brand.name, product: t.brand.product, ownId: t.brand.ownId, competitors: t.brand.competitors };
      status(`Reading ${list(inputs.map((x) => x.crowd.name))}`);
      // The writing gets until 20 s before the tool's cap, so the page always lands; a slow write drops out of it.
      const deps = { brand, fingerprint: chips, knowledge, writeHooks: t.enrich.writeHooks, writeLooks: t.enrich.writeLooks, tone, avoid, until: started + 120_000 };
      // The rival map is the Analyst's: linked here, and only built when the Analyst hasn't yet (its calls are cached).
      const [read, rivals] = await Promise.all([
        Promise.all(inputs.map((x) => readCrowd(blockCtx(t, qloo, () => {}, { crowd: x.crowd }), x, deps))),
        t.found.rivals ?? (t.brand.ownId && t.brand.competitors.length ? positionAgainst(qloo, t.brand.ownId, t.brand.competitors.slice(0, 3)).catch(() => undefined) : undefined),
      ]);
      t.found.rivals = rivals;
      // All the writing at once: each crowd's hooks and look, and the line that works for all three.
      status("Writing each crowd's hooks and look, and the line for all three");
      const ev = read.length > 1 ? oneLineEvidence(read, crowds.meetings ?? [], brand, chips) : undefined;
      const [reads, oneLine] = await Promise.all([Promise.all(read.map((r) => writeCrowd(r, deps))), ev && t.enrich.writeHooks ? by(t.enrich.writeHooks(ev).catch(() => undefined), deps.until) : undefined]);
      const page = scoutPage(reads, { brand, rivals: t.found.rivals, meetings: crowds.meetings ?? [], channel: t.brand.channel, oneLine });
      t.found.scout = mergePage(t.found.scout, page);
      const next = reads.find((r) => r.crowd.id === t.next?.id) ?? reads.find((r) => r.tier === "win_next") ?? reads[0];
      t.found.message = next.message;
      return {
        summary: reads.map((r) => `${r.crowd.name}: ${r.message.themes.slice(0, 3).map((x) => x.name).join(", ") || "few clear themes"}`).join("; "),
        data: reads.map((r) => ({
          crowd: r.crowd.name,
          tier: r.tier,
          themes: r.message.themes.map((x) => x.name),
          hooks: r.message.hooks?.hooks.map((h) => h.text),
          phrases: r.phrases.map((p) => p.name),
          lead_with: r.look?.lead?.product,
          podcasts: r.online.podcasts.map((p) => p.name),
          creators: r.online.creators.map((p) => p.name),
        })),
        status: reads.every((r) => r.message.themes.length) ? "ok" : "thin",
        items: reads.flatMap((r) => [
          ...(r.message.hooks?.hooks ?? []).slice(0, 3).map((h) => item("message", h.text, `A hook for ${r.crowd.name}, built on what it loves`, { group: "hook", detail: r.crowd.name })),
          ...r.message.themes.slice(0, 2).map((x) => item("message", x.name, `A theme ${r.crowd.name} over-indexes on`, { group: "theme", detail: r.crowd.name })),
          ...r.message.references.slice(0, 3).map((x) => item("mood", x.name, `On ${r.crowd.name}'s mood board`, { group: "mood", ref: x.id, detail: r.crowd.name })),
          ...r.online.podcasts.slice(0, 2).map((p) => item("podcast", p.name, `A podcast ${r.crowd.name} loves`, { group: "podcast", ref: p.id, detail: r.crowd.name })),
          ...r.online.creators.slice(0, 2).map((p) => item("creator", p.name, `${p.role}, followed by ${r.crowd.name}`, { group: "creator", ref: p.id, detail: r.crowd.name })),
        ]),
      };
    },
  },

  // ---- Navigator -------------------------------------------------------------------------------------------------
  {
    name: "read_cities",
    for: ["navigator"],
    description:
      "Reads where all three crowds live, at three levels. Level 1: every US city scored for each crowd at once (their brands and your rivals, one Qloo call per city), each crowd's top new cities, and the overlap cities where two or three crowds are strong. " +
      "Level 2: each worked city's fit per crowd, residents and income (Census), the rivals strong there and a verdict (Launch here, Test here, Later). Level 3: a heatmap per crowd in each worked city, every hot neighbourhood named, with its Census tract and ZIP and a role (anchor, spillover, pop-up spot, online-target zip). " +
      "Cities the brand already sells in are kept as home base, never counted as new; when the goal is to go deeper at home, the home city is worked first. Sizes each crowd's list to the team's capacity (2 unless the founder said). " +
      `About ${METROS.length} Qloo calls plus 3 per worked city.`,
    properties: { capacity: { type: "integer", description: "How many new cities each crowd gets, when the founder said; else leave it out." } },
    qloo: () => METROS.length + 15,
    maxMs: 90_000,
    when: once("read_cities", (t, s) => ((s.crowds ?? t.crowds)?.crowds.length ? { args: {}, why: homeGoal(t) ? `Mapping your crowds in ${homeGoal(t)!.name}, and the cities each one ranks next` : "Finding the cities each crowd ranks, and where two or three are strong at once" } : undefined)),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      if (!t || !(state.crowds ?? t.crowds)?.crowds.length) return none("needs the crowds first");
      const cap = Math.max(1, Math.min(5, typeof a.capacity === "number" ? Math.round(a.capacity) : (t.brand.capacity ?? 2)));
      const yours = yoursOf(t);
      const home = homeGoal(t);
      const read = await mapCities(t, state, qloo, status, cap);
      const outcomes = latest(t.outcomes);
      const v = (id: string) => verdict(read, id, yours, outcomes);
      // The Rep and the Promoter work the first city: home when going deeper there, else the best launch.
      const order = ["launch", "test", "later", "home"];
      const ranked = read.cities.filter((c) => !c.yours).sort((x, y) => order.indexOf(v(x.metroId)) - order.indexOf(v(y.metroId)));
      const first = (home && read.cities.find((c) => c.metroId === home.id)) || ranked[0];
      const winFirst = read.crowds.find((c) => c.tier === "win_first") ?? read.crowds[0];
      t.cities = winFirst.cities.filter((f) => !yours.includes(f.metroId)).slice(0, cap).map((f) => ({ metroId: f.metroId, name: f.name }));
      if (first) {
        t.city = { id: first.metroId, name: first.name };
        const role = roles(first);
        t.hoods = [...first.hoods].sort((x, y) => Number(role.get(y.name) === "anchor") - Number(role.get(x.name) === "anchor")).slice(0, 5).map((h) => h.name);
      }
      const strong = (id: string) => read.crowds.filter((c) => isStrong(c.cities.find((f) => f.metroId === id))).map((c) => c.crowd.name);
      const overlap = read.cities.filter((c) => !c.yours && strong(c.metroId).length >= 2).map((c) => c.name);
      return {
        summary: `${read.cities.map((c) => `${c.name}: ${VERDICT_LABEL[v(c.metroId)]}`).join("; ")}${overlap.length ? `. Overlap: ${list(overlap)}` : ""}`,
        data: {
          crowds: read.crowds.map((c) => ({ crowd: c.crowd.name, tier: c.tier, top_new_cities: c.cities.filter((f) => !yours.includes(f.metroId)).slice(0, cap).map((f) => ({ city: f.name, why: f.reason, sd: f.z })) })),
          cities: read.cities.map((c) => ({ city: c.name, verdict: VERDICT_LABEL[v(c.metroId)], strong_for: strong(c.metroId), residents: c.census?.residents, median_income: c.census?.income, rivals_strong: c.rivals, neighbourhoods: c.hoods.slice(0, 6).map((h) => h.name) })),
          overlap,
          capacity: cap,
          already_yours: yours.map((id) => metroById(id).name),
        },
        status: read.cities.length ? "ok" : "thin",
        items: read.cities.filter((c) => !c.yours || c.metroId === home?.id).map((c) => item("city", c.name, `${VERDICT_LABEL[v(c.metroId)]}: ${strong(c.metroId).length ? `strong for ${list(strong(c.metroId))}` : "no crowd strong yet"}`, { group: c.metroId, ref: c.metroId })),
      };
    },
  },
  {
    name: "neighbourhoods",
    for: ["navigator"],
    description:
      "Maps where the crowd's taste concentrates inside one city (a Qloo heatmap) and names the neighbourhoods, strongest first, and sets it as the city the Rep works in. read_cities already maps every city it worked, for all three crowds: use this for a city the founder names that it didn't work. " +
      "For a city read_cities worked, it returns those neighbourhoods again at no cost. 1 Qloo call otherwise. Needs a city or a home city.",
    properties: { city: { type: "string", description: "A US city; the chosen one when empty." } },
    qloo: () => 1,
    when: once("neighbourhoods", (t, s) => {
      // The cities read sets the city and its neighbourhoods for all three crowds; until it has run, this waits for it.
      if (!t.found.navigator && (s.crowds ?? t.crowds)?.crowds.length) return undefined;
      const home = homeGoal(t);
      if (home && (t.city?.id !== home.id || !t.hoods)) return { args: {}, why: `Finding the neighbourhoods in ${home.name}, where you already sell, that your crowd concentrates in` };
      return t.city && !t.hoods ? { args: {}, why: `Finding the neighbourhoods in ${t.city.name} where the taste concentrates` } : undefined;
    }),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      if (!t) return none("needs the team's brand");
      const typed = str(a.city, 80);
      const r = typed ? await resolveTyped(typed).catch(() => undefined) : undefined;
      const metro = metroById(r?.status === "ok" ? r.id : (homeGoal(t)?.id ?? t.city?.id ?? t.brand.homeMetro ?? "nyc"));
      // The neighbourhoods set the city the Rep and the Promoter work in.
      if (t.city?.id !== metro.id) t.city = { id: metro.id, name: metro.name };
      // A city the Navigator's read already worked: its neighbourhoods across all three crowds, anchors first, no new call.
      const worked = t.found.navigator?.cities.find((c) => c.metroId === metro.id);
      if (worked?.hoods.length) {
        const role = roles(worked);
        const kept = [...worked.hoods].sort((x, y) => Number(role.get(y.name) === "anchor") - Number(role.get(x.name) === "anchor")).slice(0, 5);
        t.hoods = kept.map((h) => h.name);
        return {
          summary: `${metro.name}: ${t.hoods.slice(0, 3).join(", ")}, from the cities already mapped`,
          data: { city: metro.name, neighbourhoods: kept.map((h) => ({ name: h.name, role: role.get(h.name) })) },
          items: kept.map((h) => item("neighbourhood", h.name, `Where your crowds' taste runs hot in ${metro.name}`, { group: "neighbourhood" })),
        };
      }
      const ctx = blockCtx(t, qloo, status, { target: metro.id });
      const heat = await qloo.insights({ "filter.type": "urn:heatmap", ...(await locationParams(metro)), "signal.interests.entities": ctx.pb.signal.crowd ?? [] });
      const cells = results(heat).heatmap ?? [];
      const named: Neighbourhood[] = (t.enrich.markets?.neighbourhoods ? await t.enrich.markets.neighbourhoods(metro, cells).catch(() => null) : null) ?? [];
      t.hoods = named.slice(0, 5).map((n) => n.name);
      if (!named.length)
        return { summary: `${cells.length ? "mapped the taste" : "little taste signal"} in ${metro.name}; neighbourhood names aren't to hand, so the Rep searches the whole city`, data: { city: metro.name, cells: cells.length }, status: "thin" };
      return {
        summary: `${metro.name}: ${t.hoods.slice(0, 3).join(", ")}`,
        data: { city: metro.name, neighbourhoods: named.slice(0, 5).map((n) => ({ name: n.name, score: n.score })) },
        items: named.slice(0, 5).map((n) => item("neighbourhood", n.name, `Where ${aimed(t, state)?.name ?? "your crowd"}'s taste concentrates in ${metro.name}`, { group: "neighbourhood" })),
      };
    },
  },

  // ---- Rep -------------------------------------------------------------------------------------------------------
  {
    name: "read_shops",
    for: ["rep"],
    description:
      "Reads the shops for all three crowds, crowd → city → neighbourhood → shop. Each crowd's cities come from the Navigator; per city one read per crowd, then one read around each anchor neighbourhood for every crowd at once, " +
      `widening to the nearest neighbourhood when an anchor has fewer than ${FEW_IN_HOOD}. A shop that fits two or three crowds is found once, tagged with each and ranked higher. Every matching shop is kept, with its basics from Qloo, ` +
      "and the top shops' own sites are read for the brands they carry, a wholesale page and a public buyer email. National retailers are ranked per crowd, with which of the cities have their stores. " +
      "Leaves out every stockist; shop types that said no move down, those that said yes move up. The offer is sized to the founder's budget. About 60–120 Qloo calls. " +
      "Shops read earlier this session come back at once with no Qloo calls, re-ordered on any new outcomes; fresh: true reads them again, only when the founder wants more or different shops.",
    properties: { fresh: { type: "boolean", description: "Read the shops again instead of using the ones read earlier this session." } },
    qloo: (a, s) => (s.team && kept(s.team, a) ? 0 : 120),
    maxMs: 120_000,
    when: once("read_shops", (t) =>
      kept(t, {})
        ? { args: {}, why: `Using the ${t.found.rep!.shops.length} shops read earlier this session` }
        : t.found.navigator?.cities.length
        ? { args: {}, why: `Finding the shops for each crowd in ${list(shopCities(t.found.navigator).map((c) => c.name))}` }
        : skip("shops need the cities first", "a city"),
    ),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      const nav = t?.found.navigator;
      const again = t ? kept(t, a) : undefined;
      if (!t || (!again && !nav?.cities.length)) return none("needs the cities first");
      const fresh = async (nav: NavRead) => {
        const ctx = blockCtx(t, qloo, status);
        const chips = await fp(t, qloo, status);
        const names = new Map([...nav.crowds.flatMap((c) => c.crowd.signal), ...t.brand.comparables].map((r) => [r.id, r.name]));
        const b = t.brand;
        return readShops(qloo, nav, {
          brand: { name: b.name, product: b.product, stockists: b.stockists, competitors: b.competitors, tier: b.tier },
          channels: ctx.pb.placeChannels,
          tierParams: ctx.pb.tierParams,
          exclude: ctx.pb.exclude,
          names,
          fingerprint: chips,
          kindOf: (v) => venueGroup(v, CHANNEL_IDS),
          retail: b.retail,
          budget: budgetOf(t.answers),
          status,
          sites: t.enrich.shopSites,
          faire: t.enrich.faire,
        });
      };
      const read = again ?? (await fresh(nav!));
      t.found.rep = read;
      const { fitting, ranked, moved, dropped } = repLists(t);
      const crowdName = (id: string) => read.crowds.find((c) => c.id === id)?.name ?? id;
      const multi = fitting.filter((s) => Object.values(s.crowds).filter((x) => x >= FITS).length > 1);
      const empty = read.cities.filter((c) => !fitting.some((s) => s.metroId === c.metroId));
      const full = read.cities.filter((c) => !empty.includes(c));
      const stocked = read.shops.filter((s) => s.stocked).map((s) => s.name);
      const widened = read.cities.flatMap((c) => c.notes);
      if (!fitting.length) return { summary: `no independent shops matched in ${list(read.cities.map((c) => c.name))} yet`, data: { cities: read.cities.map((c) => c.name), widened }, status: "empty" };
      return {
        summary:
          `${again ? "From the shops read earlier this session: " : ""}${fitting.length} shops in ${list(full.map((c) => c.name))}${multi.length ? `, ${multi.length} for two or three crowds` : ""}` +
          `${empty.length ? `; nothing in ${list(empty.map((c) => c.name))} yet` : ""}` +
          `${widened.length ? ` (${widened.at(-1)})` : ""}${stocked.length ? `; left out ${stocked.length} you're already in` : ""}${moved || dropped ? "; re-ordered on your outcomes" : ""}`,
        data: {
          cities: read.cities.map((c) => ({ city: c.name, shops: fitting.filter((s) => s.metroId === c.metroId).length, entry_route: entryRoute(read, c.metroId).route })),
          crowds: read.crowds.map((c) => ({
            crowd: c.name,
            tier: c.tier,
            cities: c.cities.map((id) => read.cities.find((x) => x.metroId === id)?.name ?? id),
            shops: fitting.filter((s) => (s.crowds[c.id] ?? 0) >= FITS).length,
            top_retailers: (read.retailers[c.id] ?? []).slice(0, 3).map((r) => r.name),
          })),
          widened,
          left_out_as_stockists: stocked,
          heard_back_left_out: dropped,
          budget: read.budget,
          offer: offerFor(read.budget),
          shops: ranked.slice(0, 15).map(({ s }) => ({
            name: s.name,
            city: s.city,
            neighbourhood: s.hood ?? s.neighbourhood,
            kind: s.kind,
            crowds: Object.keys(s.crowds).filter((k) => s.crowds[k] >= FITS).map(crowdName),
            wholesale: wholesaleOf(s),
            contact: contactOf(s),
          })),
        },
        status: "ok",
        items: [
          ...ranked.slice(0, 15).map(({ s }) =>
            item("venue", s.name, s.reasons[0]?.label ?? `Its regulars match ${crowdName(Object.keys(s.crowds)[0])}`, {
              group: s.kind,
              detail: [s.city, s.hood ?? s.neighbourhood, s.address].filter(Boolean).join(" · ") || undefined,
              ref: s.id,
            }),
          ),
          ...(t.found.retailers ?? []).slice(0, 5).map((p) =>
            item("retailer", p.name, p.ownLabel ? "Its shoppers match your crowds; it sells mostly its own label, so pitch a co-branded line" : "Its shoppers match your crowds", {
              group: p.ownLabel ? "own-label retailer" : "retailer",
              ref: p.id,
            }),
          ),
        ],
      };
    },
  },
  {
    name: "draft_pitch",
    for: ["rep"],
    description: "A short first-contact pitch to one venue, opening on what both crowds love; every name in it is checked against the evidence. Nothing is sent. 1 Qloo call.",
    properties: { venue: { type: "string", description: "The shop's name, from read_shops; the top one when empty." } },
    qloo: () => 1,
    when: once("draft_pitch", (t) => (t.found.places?.length ? { args: {}, why: `Writing the pitch to ${t.found.places[0].name}` } : undefined)),
    async run(a, { qloo, state }) {
      const t = state.team;
      const v = t?.found.places?.find((x) => x.name === str(a.venue, 120)) ?? t?.found.places?.[0];
      if (!t || !v) return none("needs a venue first");
      const r = await drafted(t, qloo, { kind: "venue", id: v.id, name: v.name, neighbourhood: v.neighbourhood, tags: v.tags.map((x) => x.name), reasons: v.reasons.map((x) => x.label) });
      const d = r.data as { subject?: string; body?: string } | undefined;
      if (d?.body) t.found.pitch = { ...t.found.pitch, [v.id]: { subject: d.subject ?? "", body: d.body } };
      return r;
    },
  },

  // ---- Matchmaker ------------------------------------------------------------------------------------------------
  {
    name: "read_partners",
    for: ["matchmaker"],
    description:
      "Reads the partners for all three crowds: creators (the people Qloo says the crowd over-indexes on, then a web search for more and for their sizes, YouTube's real subscriber counts when its key is set), " +
      "and the brands and podcasts the crowd over-indexes on. Each brand and podcast is checked from the other side: how its own crowd ranks the brand among brands like it; one-way partners leave, with the reason. " +
      "Leaves out rivals, brands in the founder's own category, brands priced far away and brands whose values clash. A creator counts as a match only when Qloo's read of who follows them looks like the crowd. " +
      "Every partner gets a band (creators Micro 10k–100k, Mid 100k–1M, Large 1M+; brands and podcasts Small, Mid, Large), a fit against the founder's budget, and public contacts only, each with its source. About 80–150 Qloo calls. " +
      "Partners read earlier this session come back at once with no Qloo calls, re-ordered on any new outcomes; fresh: true reads them again, only when the founder wants more or different partners.",
    properties: { fresh: { type: "boolean", description: "Read the partners again instead of using the ones read earlier this session." } },
    qloo: (a, s) => (s.team && keptMatch(s.team, a, s) ? 0 : 150),
    maxMs: 170_000,
    when: once("read_partners", (t, s) =>
      keptMatch(t, {}, s)
        ? { args: {}, why: "Using the partners found earlier this session" }
        : scoutCrowds(t, s).length
          ? { args: {}, why: "Finding creators, brands and podcasts whose fans would love you, and checking they'd love you back" }
          : skip("partners need the crowds first", "the crowds"),
    ),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      const crowds = t ? scoutCrowds(t, state) : [];
      if (!t || !crowds.length) return none("needs the crowds first");
      const again = keptMatch(t, a, state);
      const fresh = async () => {
        const ctx = blockCtx(t, qloo, status);
        const chips = await fp(t, qloo, status);
        const names = new Map([...crowds.flatMap(({ crowd }) => [...crowd.signal, ...(crowd.brands ?? [])]), ...t.brand.comparables].map((r) => [r.id, r.name]));
        const b = t.brand;
        return readMatches(qloo, matchCrowds(crowds), {
          brand: { name: b.name, product: b.product, ownId: b.ownId, competitors: b.competitors, traits: b.traits },
          exclude: ctx.pb.exclude,
          partnerParams: ctx.pb.partnerParams,
          names,
          fingerprint: chips,
          budget: budgetOf(t.answers),
          status,
          websites: t.enrich.websites,
          ...(t.enrich.match ?? {}),
        });
      };
      const read = again ?? (await fresh());
      t.found.match = read;
      const { creators, brands, podcasts, dropped } = matchLists(t);
      const crowdName = (id: string) => read.crowds.find((c) => c.id === id)?.name ?? id;
      const fitsIn = (x: { crowds: Record<string, number> }) => Object.keys(x.crowds).filter((k) => x.crowds[k] >= FITS).map(crowdName);
      const oneWay = read.left.filter((l) => l.kind === "brand" && /^Their fans wouldn't love you back/.test(l.reason)).map((l) => l.name);
      const shared2 = [...creators, ...brands, ...podcasts].filter((x) => fitsIn(x).length > 1);
      const total = creators.length + brands.length + podcasts.length;
      const unchecked = read.checked ? "" : t.brand.ownId ? `; the other side can't be checked yet: Qloo lists no brands like ${t.brand.name} to rank it against` : `; the other side can't be checked while ${t.brand.name} isn't in Qloo`;
      const matched = creators.filter((c) => c.audience === "matches").length;
      const counts = [`${plural(creators.length, "creator")}${creators.length ? ` (${matched ? `${matched} whose own followers look like your crowd` : "none yet whose own followers are shown to look like your crowd"})` : ""}`, plural(brands.length, "brand"), plural(podcasts.length, "podcast")].filter((x) => !x.startsWith("0 "));
      return {
        summary:
          `${again ? "From the partners found earlier this session: " : ""}` +
          `${total ? `${list(counts)}${shared2.length ? `, ${shared2.length} for two or three crowds` : ""}` : "no two-way partner yet"}` +
          `${oneWay.length ? `; dropped ${list(oneWay.slice(0, 4))}: their fans wouldn't love you back` : ""}${unchecked}${dropped ? "; re-ordered on your outcomes" : ""}`,
        data: {
          budget: read.budget,
          other_side_checked: read.checked,
          crowds: read.crowds.map((c) => ({
            crowd: c.name,
            tier: c.tier,
            creators: creators.filter((x) => (x.crowds[c.id] ?? 0) >= FITS).length,
            brands: brands.filter((x) => (x.crowds[c.id] ?? 0) >= FITS).length,
            podcasts: podcasts.filter((x) => (x.crowds[c.id] ?? 0) >= FITS).length,
          })),
          audience_means:
            "A creator's audience is a read of their own followers, not of your crowd: matches = their followers' age and gender lean like your crowd's; broad = your crowd follows them but their following is general; unchecked = no read of their followers yet. Only matches is evidence their audience fits.",
          creators: creators.slice(0, 10).map((c) => ({
            name: c.name,
            platform: c.platform,
            followers: c.followers ? `${c.followers.value}${c.followers.approx ? " approx." : ""}` : undefined,
            band: c.band,
            budget_fit: fitOf(c.band, read.budget),
            audience: c.audience,
            crowds: fitsIn(c),
            contact: contactLine(c),
          })),
          brands: brands.slice(0, 10).map((p) => ({ name: p.name, size: p.size, crowds: fitsIn(p), their_crowd_percentile: p.pReverse, fits_both_ways: p.mutual !== undefined ? p.mutual >= 0.7 : undefined, contact: contactLine(p) })),
          podcasts: podcasts.slice(0, 8).map((p) => ({ name: p.name, size: p.size, apple_chart: p.chart, crowds: fitsIn(p), their_listeners_percentile: p.pReverse, posts: p.frequency?.value, contact: contactLine(p) })),
          left_out: read.left.slice(0, 15),
          not_read: read.limits,
        },
        status: total ? "ok" : "empty",
        items: [
          ...brands.slice(0, 10).map((p) =>
            item("partner", p.name, p.mutual !== undefined && p.mutual >= 0.7 ? "Fits both ways: your crowd loves them and theirs ranks you high" : p.pReverse !== undefined ? "Your crowd loves them, and theirs ranks you in its top half" : "Your crowd loves them", { group: "brand", ref: p.id }),
          ),
          ...creators.slice(0, 8).map((c) => item("creator", c.name, c.audience === "matches" ? c.audienceWhy : `Your crowd follows them${c.role ? ` (${c.role})` : ""}`, { group: "creator", ...(c.qlooId ? { ref: c.qlooId } : {}) })),
          ...podcasts.slice(0, 8).map((p) => item("podcast", p.name, p.reasons[0]?.label ?? "Your crowd over-indexes on it", { group: "podcast", ref: p.id })),
        ],
      };
    },
  },
  {
    name: "draft_ask",
    for: ["matchmaker"],
    description:
      "A short first-contact note to one creator, brand or podcast from read_partners, opening on something real from their work, with the offer sized to their band and the founder's budget; every name is checked against the evidence. " +
      "Nothing is sent: the founder copies it or opens it in their mail app. 1 Qloo call.",
    properties: { partner: { type: "string", description: "The partner's name, from read_partners; the top one when empty." } },
    qloo: () => 1,
    when: once("draft_ask", (t) => {
      if (!t.found.match) return undefined;
      const top = topMatch({ ...matchLists(t), budget: t.found.match.budget });
      return top ? { args: {}, why: `Writing the ask to ${top.name}` } : undefined;
    }),
    async run(a, { qloo, state }) {
      const t = state.team;
      const read = t?.found.match;
      if (!t || !read) return none("needs the partners first");
      const lists = matchLists(t);
      const all: (Creator | Partner)[] = [...lists.brands, ...lists.creators, ...lists.podcasts];
      const want = str(a.partner, 120).toLowerCase();
      const named = want ? all.find((x) => x.name.toLowerCase() === want) ?? all.find((x) => nameSim(x.name, want) >= 0.85) : undefined;
      const p = named ?? topMatch({ ...lists, budget: read.budget });
      if (!p) return none("needs a partner first");
      const isCreator = "platform" in p;
      const kind = isCreator ? "creator" : p.kind === "brand" ? "partner" : "podcast";
      const work = isCreator ? p.work : p.latestTitle?.value;
      const r = await drafted(t, qloo, {
        kind,
        id: isCreator ? p.qlooId : p.id,
        name: p.name,
        tags: [],
        reasons: isCreator ? [p.audienceWhy, ...(p.role ? [p.role] : [])].filter(Boolean) : p.reasons.map((x) => x.label),
        ...(work ? { work } : {}),
        offer: offerOf(isCreator ? "creator" : p.kind, isCreator ? p.band : p.size, read.budget),
      });
      const d = r.data as { subject?: string; body?: string } | undefined;
      if (d?.body) t.found.ask = { ...t.found.ask, [isCreator ? p.id : itemId(kind, p.name)]: { subject: d.subject ?? "", body: d.body } };
      return { ...r, data: { ...(r.data as object), contact: contactLine(p) } };
    },
  },

  // ---- Promoter --------------------------------------------------------------------------------------------------
  {
    name: "find_moments",
    for: ["promoter"],
    description:
      "Dated events the crowd turns up for in the city: its artists' shows (Ticketmaster) and its festivals (dates from the web, each with the page that states it). An event under 30 days away is too close to prepare for: it moves to the same act's next date, else the next event. Never estimates a date. 2 Qloo calls. Needs a city.",
    properties: { city: { type: "string", description: "A US city; the chosen one when empty." } },
    qloo: () => 2,
    maxMs: 60_000,
    when: once("find_moments", (t) => {
      const c = t.city ?? (t.brand.homeMetro ? { name: metroById(t.brand.homeMetro).name } : undefined);
      return c ? { args: {}, why: `Finding the events your crowd turns up for in ${c.name}` } : skip("events need a city first", "a city");
    }),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      if (!t) return none("needs the team's brand");
      const typed = str(a.city, 80);
      const r = typed ? await resolveTyped(typed).catch(() => undefined) : undefined;
      const target = r?.status === "ok" ? r.id : (t.city?.id ?? t.brand.homeMetro);
      if (!target) return none("events need a city first");
      const m = await moments(blockCtx(t, qloo, status, { target }), { shows: t.enrich.shows, festivalDate: t.enrich.festivalDate });
      const all = m.data.moments.filter((x) => x.date);
      // The lead time has passed: the same act's later date, else the next event takes its place.
      const moved: string[] = [];
      const kept: Moment[] = [];
      for (const x of all) {
        if (!x.soon) {
          if (!kept.includes(x)) kept.push(x);
          continue;
        }
        const later = all.find((y) => y !== x && !y.soon && y.qlooId === x.qlooId);
        moved.push(later ? `${x.name} is too close to prepare for; moved to its ${later.date} date` : `${x.name} is too close to prepare for; moved on to the next event`);
        if (later && !kept.includes(later)) kept.push(later);
      }
      const events = applyOutcomes(kept.map((x) => ({ m: x, id: itemId("event", x.name), kind: "event", group: x.kind })), t.outcomes, "promoter").items.map((x) => x.m);
      t.found.moments = events;
      const city = metroById(target).name;
      if (!events.length)
        return { summary: `no dated events ahead in ${city} yet${moved.length ? `; ${moved.length} too close to prepare for` : ""}`, data: { city, artists: m.data.artists.slice(0, 5).map((x) => x.name), moved }, status: "empty" };
      return {
        summary: `${events.length} dated events in ${city}${moved.length ? `; ${moved[0]}` : ""}`,
        data: { city, events: events.slice(0, 8).map((x) => ({ name: x.name, kind: x.kind, date: x.date, venue: x.venue, source: x.source, site: x.site, act: x.qlooName })), moved },
        items: events.slice(0, 8).map((x) => item("event", x.name, `${x.kind === "show" ? `${x.qlooName}, an artist your crowd loves` : "A festival your crowd loves"}${x.date ? `, on ${dayOf(x.date)}` : ""}${x.site ? ` (${x.site})` : ""}`, { group: x.kind, detail: x.venue, ref: x.qlooId })),
      };
    },
  },
  {
    name: "online_audiences",
    for: ["promoter"],
    description: "The online audiences and creators the crowd follows: creators (with their role) and the audience groups it over-indexes on. Needs no city. About 4 Qloo calls.",
    properties: {},
    qloo: () => 4,
    when: once("online_audiences", () => ({ args: {}, why: "Finding the creators and online audiences your crowd follows" })),
    async run(_a, { qloo, state }) {
      const t = state.team;
      const crowd = t && aimed(t, state);
      if (!t || !crowd) return none("needs the crowds first");
      const o = await onlineStop(qloo, crowd.signal.map((s) => s.id).slice(0, 10));
      t.found.online = o;
      const creators = applyOutcomes(o.creators.map((c) => ({ ...c, id: itemId("creator", c.name), kind: "creator", group: c.role })), t.outcomes, "promoter").items;
      return {
        summary: `${creators.slice(0, 3).map((c) => c.name).join(", ") || "no creators yet"}${o.interests.length ? `; audiences: ${o.interests.slice(0, 2).map((i) => i.name).join(", ")}` : ""}`,
        data: { creators: creators.slice(0, 8).map((c) => ({ name: c.name, role: c.role })), audiences: o.interests.slice(0, 6).map((i) => i.name) },
        status: creators.length || o.interests.length ? "ok" : "empty",
        items: [
          ...creators.slice(0, 6).map((c) => item("creator", c.name, `A ${c.role} your crowd follows`, { group: c.role, ref: c.id })),
          ...o.interests.slice(0, 4).map((i) => item("audience", i.name, "An online audience your crowd over-indexes on", { group: "audience", ref: i.id })),
        ],
      };
    },
  },
  {
    name: "draft_inquiry",
    for: ["promoter"],
    description: "A short first inquiry to one event's organisers about a stand or a tasting, opening on what both crowds love; every name checked against the evidence. Nothing is sent. 0 Qloo calls.",
    properties: { event: { type: "string", description: "The event's name; the top one when empty." } },
    qloo: () => 0,
    when: once("draft_inquiry", (t) => (t.found.moments?.length ? { args: {}, why: `Writing the inquiry to ${t.found.moments[0].name}` } : undefined)),
    async run(a, { qloo, state }) {
      const t = state.team;
      const e = t?.found.moments?.find((x) => x.name === str(a.event, 120)) ?? t?.found.moments?.[0];
      if (!t || !e) return none("needs an event first");
      return drafted(t, qloo, { kind: "event", name: e.name, tags: [], reasons: [e.kind === "show" ? `${e.qlooName} is an artist your crowd loves` : "a festival your crowd loves"] });
    },
  },

  // ---- Everyone --------------------------------------------------------------------------------------------------
  {
    name: "read_outcomes",
    for: ALL,
    description: "What the founder heard back on this specialist's earlier results (pitched, yes, no, no reply), grouped by kind, before deciding again. 0 Qloo calls.",
    properties: {},
    qloo: () => 0,
    when: once("read_outcomes", (t, s) => (s.agent && t.outcomes.some((o) => o.agent === s.agent) ? { args: {}, why: "Reading what you heard back before deciding again" } : undefined)),
    async run(_a, { state }) {
      const t = state.team;
      const mine = latest((t?.outcomes ?? []).filter((o) => !state.agent || o.agent === state.agent));
      if (!mine.length) return { summary: "nothing heard back yet", data: {}, status: "empty" };
      return { summary: outcomeLine(mine), data: { outcomes: mine.map((o) => ({ name: o.name, kind: o.group ?? o.kind, mark: o.mark })) } };
    },
  },
  {
    name: "log_outcome",
    description: "Records what the founder heard back from one result: pitched, yes, no or no reply. The specialist that found it reads it before its next run. 0 Qloo calls.",
    properties: {
      name: { type: "string", description: "The result's name, as the team listed it." },
      kind: { type: "string", description: "venue, retailer, partner, podcast, event, creator…" },
      mark: { type: "string", enum: [...MARKS] },
      agent: { type: "string", enum: [...SPECIALIST_IDS], description: "The specialist that found it." },
    },
    required: ["name", "kind", "mark", "agent"],
    qloo: () => 0,
    async run(a, { state }) {
      const t = state.team;
      const name = str(a.name, 120);
      const kind = str(a.kind, 30);
      const mark = str(a.mark, 12) as Mark;
      if (!t || !name || !kind || !MARKS.includes(mark) || !isSpecialist(a.agent)) return none("needs a result's name, its kind, a mark and the specialist");
      const known = Object.values(t.found).flat().find((x) => x && typeof x === "object" && "name" in x && x.name === name) as { group?: string } | undefined;
      t.outcomes.push({ item: itemId(kind, name), agent: a.agent, kind, name, group: known?.group ?? kind, mark, at: Date.now() });
      return { summary: `${name}: ${mark.replace("_", " ")}`, data: { logged: { name, kind, mark } } };
    },
  },
];

/** The partners read earlier this session, when they cover the same crowds and no fresh read was asked for. */
function keptMatch(t: TeamCtx, a: Record<string, unknown>, s?: AgentState): MatchRead | undefined {
  const read = t.found.match;
  if (!read || a.fresh === true) return undefined;
  return scoutCrowds(t, s).every(({ crowd }) => read.crowds.some((c) => c.id === crowd.id)) ? read : undefined;
}

/** The Matchmaker's lists from its read, re-ordered on what the founder heard back; heard-back partners leave. */
export function matchLists(t: TeamCtx): { creators: Creator[]; brands: Partner[]; podcasts: Partner[]; dropped: number } {
  const read = t.found.match!;
  const c = applyOutcomes(read.creators.map((x) => ({ x, id: x.id, kind: "creator", group: "creator" })), t.outcomes, "matchmaker");
  const b = applyOutcomes(read.brands.map((x) => ({ x, id: itemId("partner", x.name), kind: "partner", group: "brand" })), t.outcomes, "matchmaker");
  const p = applyOutcomes(read.podcasts.map((x) => ({ x, id: itemId("podcast", x.name), kind: "podcast", group: "podcast" })), t.outcomes, "matchmaker");
  return {
    creators: c.items.map((i) => i.x),
    brands: b.items.map((i) => i.x),
    podcasts: p.items.map((i) => i.x),
    dropped: c.dropped + b.dropped + p.dropped + Number(c.moved || b.moved || p.moved),
  };
}

async function drafted(t: TeamCtx, qloo: QlooClient, to: DraftTo): Promise<ToolResult> {
  const partnerList = (t.found.match?.brands ?? t.found.partners?.brands ?? []).map((b) => ({ id: b.id, name: b.name, pForward: b.pForward }));
  const d = await writeDraft({ qloo, brand: t.brand.name, product: t.brand.product, to, partners: partnerList, llm: t.llm });
  // The greeting on its own line, then the body as one paragraph: the detail reads as an email, subject first.
  const [first, ...rest] = d.sentences.map((s) => s.text.trim()).filter(Boolean);
  const text = first && /,$/.test(first) && rest.length ? `${first}\n\n${rest.join(" ")}` : [first, ...rest].filter(Boolean).join(" ");
  const what = to.kind === "venue" ? "Pitch" : to.kind === "event" ? "Inquiry" : "Ask";
  return {
    summary: `${what} to ${to.name}: "${d.subject}"`,
    data: { to: to.name, subject: d.subject, body: text, shared_loves: d.bridges.map((b) => b.name) },
    items: [item("draft", `${what} to ${to.name}`, d.bridges.length ? `Opens on what both crowds love: ${list(d.bridges.map((b) => b.name))}` : "Opens on why the brand fits", { group: "draft", detail: `${d.subject}\n\n${text}` })],
  };
}
