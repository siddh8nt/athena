import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import { results } from "@/lib/qloo/client";
import type { BlockContext, TagChip } from "@/lib/blocks/types";
import { fingerprint } from "@/lib/blocks/fingerprint";
import { markets, type MarketRow, type MarketsEnrichers, type Neighbourhood } from "@/lib/blocks/markets";
import { places, type VenuePick } from "@/lib/blocks/places";
import { partners, type PartnerCard, type PartnersData } from "@/lib/blocks/partners";
import { message, positionAgainst, type MessageData, type PositionCard } from "@/lib/blocks/message";
import { moments, type DateLookup, type Moment, type ShowLookup } from "@/lib/blocks/moments";
import type { HookEvidence, Hooks } from "./hooks";
import { onlineStop, type OnlineData } from "@/lib/stops/online";
import { alreadyIn, nextRetailers, type RetailCategory, type RetailerPick } from "@/lib/stops/retailers";
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
};

/**
 * The team's shared memory (§23.2 step 8b): the Brand Graph's brand, what each specialist has found, the outcomes.
 * Every specialist's run holds it by reference, so what one finds the next one reads.
 */
export type TeamCtx = {
  brand: TeamBrand;
  /** The ids of the goals this run works for ("deepen_home", "step_up"…), so the evidence rules can read them. */
  goals: string[];
  enrich: TeamEnrich;
  /** Whether the drafts may use the model. */
  llm: boolean;
  seed?: SeedInput;
  crowds?: CrowdsResult;
  fits?: FitsResult;
  probes: string[];
  /** What the founder asked about from the Galaxy ("Ask the Analyst about this"), and their words. */
  asked?: { id?: string; name: string };
  question?: string;
  /** The founder's answers to the team's earlier questions (ask_founder), read as facts. */
  answers?: { question: string; answer: string }[];
  /** Win first, and the crowd to win next (set by the Scout, or from the ranking). */
  crowd?: CrowdCard;
  next?: CrowdCard;
  city?: { id: string; name: string };
  cities?: MarketRow[];
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
  };
  outcomes: Outcome[];
  /** Probes the Analyst ran this session, and whether the last one changed the crowds. */
  probe: { ran: number; unchanged?: boolean };
};

const ALL: SpecialistId[] = [...SPECIALIST_IDS];
/** Fewer venues than this after stockists and heard-back ones leave, and the Rep widens. */
export const FEW_VENUES = 8;
/** Two cities this close on taste are a tie, broken on reach and income. */
export const CLOSE_CITIES = 0.02;
/** A partner whose crowd ranks the brand below this percentile is one-way. */
export const ONE_WAY = 0.5;

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const item = (kind: string, name: string, why: string, extra: Partial<Omit<WorkItem, "id" | "kind" | "name" | "why" | "sources" | "callIds">> = {}) => ({ id: itemId(kind, name), kind, name, why, ...extra });
const none = (summary: string): ToolResult => ({ summary, data: {}, status: "empty" });

/** Runs once per specialist run: undefined once it has run (the step is done), else the rule. */
const once = (name: string, f: (t: TeamCtx, s: AgentState) => Decision | undefined) => (s: AgentState) => (!s.team || s.ran?.includes(name) ? undefined : f(s.team, s));

/** Going deeper at home, not launching elsewhere: the Navigator works the home city instead of ranking new ones. */
const homeGoal = (t: TeamCtx) => (t.goals.includes("deepen_home") && !t.goals.includes("launch_city") && t.brand.homeMetro ? metroById(t.brand.homeMetro) : undefined);

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

/** A venue's kind for outcomes ("café", "wine store"): its first channel tag, else its first tag. */
function venueGroup(v: VenuePick, channels: string[]): string {
  const tag = v.tags.find((x) => channels.includes(x.id)) ?? v.tags[0];
  return (tag?.name ?? "venue").toLowerCase();
}

const CHANNEL_IDS = Object.values(VENUE_TAGS) as string[];

/** Narrated why for a skip: the reason, and when another specialist can fill the need, what's needed. */
const skip = (reason: string, need?: string): Decision => ({ skip: reason, ...(need ? { need } : {}) }) as Decision;

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
      const next = asked ?? others.find((c) => c.id === winNext?.crowd) ?? strongest;
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
    name: "write_message",
    for: ["scout"],
    description: "The words for a crowd: the themes it over-indexes on, its references (shows, films, music, books), its age and gender lean, and hooks written from that evidence. Aims at the next crowd when there is one. About 8 Qloo calls.",
    properties: {},
    qloo: () => 9,
    maxMs: 45_000,
    when: once("write_message", (t, s) => ((s.crowds ?? t.crowds)?.crowds.length ? { args: {}, why: t.next ? `Finding the words for ${t.next.name}` : "Finding the words your crowd responds to" } : undefined)),
    async run(_a, { qloo, state, status }) {
      const t = state.team;
      if (!t) return none("needs the team's brand");
      const crowd = t.next ?? aimed(t, state);
      const chips = await fp(t, qloo, status);
      const r = await message(blockCtx(t, qloo, status, { crowd }), { fingerprint: chips, writeHooks: t.enrich.writeHooks, product: t.brand.product });
      t.found.message = r.data;
      const d = r.data;
      return {
        summary: `${crowd ? `For ${crowd.name}: ` : ""}${d.themes.slice(0, 4).map((x) => x.name).join(", ") || "no clear themes"}`,
        data: { crowd: crowd?.name, themes: d.themes.map((x) => x.name), references: d.references.map((x) => `${x.name} (${x.kind})`), label: d.label, hooks: d.hooks?.hooks, ideas: d.hooks?.ideas, tone: d.hooks?.tone },
        status: d.themes.length ? "ok" : "thin",
        items: [
          ...(d.hooks?.hooks ?? []).slice(0, 3).map((h) => item("message", h.text, `A hook built on what ${crowd?.name ?? "your crowd"} loves`, { group: "hook" })),
          ...d.themes.slice(0, 4).map((x) => item("message", x.name, `A theme ${crowd?.name ?? "your crowd"} over-indexes on`, { group: "theme" })),
        ],
      };
    },
  },
  {
    name: "mood_board",
    for: ["scout"],
    description: "A mood board of the crowd's taste: the shows, films, music and books it loves, with the style tags of the fingerprint. Reads write_message's evidence; 0 Qloo calls after it.",
    properties: {},
    qloo: (_a, s) => (s.team?.found.message ? 0 : 9),
    when: once("mood_board", (t) => (t.found.message ? { args: {}, why: "Setting the mood board from the crowd's references" } : undefined)),
    async run(_a, { qloo, state, status }) {
      const t = state.team;
      if (!t) return none("needs the team's brand");
      if (!t.found.message) t.found.message = (await message(blockCtx(t, qloo, status, { crowd: t.next ?? aimed(t, state) }), { fingerprint: await fp(t, qloo, status), product: t.brand.product })).data;
      const d = t.found.message;
      const KIND: Record<string, string> = { tv_show: "TV", movie: "film", artist: "music", book: "books" };
      const refs = d.references.slice(0, 10);
      return {
        summary: refs.slice(0, 4).map((r) => r.name).join(", ") || "too little to set a mood",
        data: { references: refs.map((r) => ({ name: r.name, kind: KIND[r.kind] })), style: d.styleTags.map((x) => x.name), themes: d.themes.map((x) => x.name) },
        status: refs.length ? "ok" : "thin",
        items: [...refs.map((r) => item("mood", r.name, `On the mood board: ${KIND[r.kind]} the crowd loves`, { group: KIND[r.kind], ref: r.id })), ...d.styleTags.map((x) => item("mood", x.name, "A style the brand's taste carries", { group: "style" }))],
      };
    },
  },

  // ---- Navigator -------------------------------------------------------------------------------------------------
  {
    name: "city_markets",
    for: ["navigator"],
    description:
      "Ranks US cities by how strongly the crowd's brands score there (one Qloo call per city), leaving out cities the brand already sells in. When the top two are close it breaks the tie on residents and median income (Census), and sizes the list to the team's capacity (2 unless the founder said). " +
      `Not for going deeper in the home city: that goal works the city the brand already sells in. About ${METROS.length + 1} Qloo calls the first time.`,
    properties: { capacity: { type: "integer", description: "How many cities to work at once, when the founder said; else leave it out." } },
    qloo: () => METROS.length + 1,
    maxMs: 45_000,
    when: once("city_markets", (t) =>
      homeGoal(t) ? skip(`you're going deeper in ${homeGoal(t)!.name}, so there's no new city to rank`) : t.city ? skip(`the city is already set: ${t.city.name}`) : { args: {}, why: `Ranking cities for ${aimed(t)?.name ?? "your crowd"}${t.brand.soldIn.length ? `, leaving out where you already sell` : ""}` },
    ),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      if (!t || !aimed(t, state)) return none("needs the crowds first");
      const r = await shared(t, "markets", () => markets(blockCtx(t, qloo, status), { census: t.enrich.markets?.census }));
      const sold = new Set(t.brand.soldIn);
      const rows = r.data.metros.filter((m) => !sold.has(m.metroId));
      if (!rows.length) return { summary: "no city scored for this crowd", data: {}, status: "empty" };
      // A close tie on taste is broken on reach, then income, and the trace says so.
      let ranked = rows;
      let tie: string | undefined;
      const [x, y] = rows;
      if (x && y && x.score !== undefined && y.score !== undefined && Math.abs(x.score - y.score) <= CLOSE_CITIES) {
        const pop = (m: MarketRow) => m.census?.population?.value;
        const inc = (m: MarketRow) => m.census?.medianIncome?.value;
        const by = pop(x) && pop(y) && pop(x) !== pop(y) ? "residents" : inc(x) && inc(y) && inc(x) !== inc(y) ? "median income" : undefined;
        const yWins = by === "residents" ? pop(y)! > pop(x)! : by === "median income" ? inc(y)! > inc(x)! : false;
        if (yWins) ranked = [y, x, ...rows.slice(2)];
        tie = by ? `${x.name} and ${y.name} were close on taste; ${(yWins ? y : x).name} has more ${by}` : `${x.name} and ${y.name} were close on taste, with no Census figures to break the tie; kept the taste order`;
      }
      const cap = Math.max(1, Math.min(10, typeof a.capacity === "number" ? Math.round(a.capacity) : (t.brand.capacity ?? 2)));
      const pick = ranked.slice(0, cap);
      t.cities = pick;
      t.city = { id: pick[0].metroId, name: pick[0].name };
      t.hoods = undefined;
      const census = (m: MarketRow) => (m.census?.population?.value ? { residents: m.census.population.value, median_income: m.census.medianIncome?.value } : undefined);
      return {
        summary: `${pick.map((m) => m.name).join(", ")}${tie ? `. ${tie}` : ""}${cap !== 2 && !a.capacity && t.brand.capacity ? ` (${cap}, as you can work)` : ""}`,
        data: { cities: pick.map((m) => ({ name: m.name, score: m.score, why: m.reason, leans: m.leans, ...census(m) })), tie, capacity: cap, left_out_as_already_sold: t.brand.soldIn.map((id) => metroById(id).name) },
        items: pick.map((m, i) => item("city", m.name, i === 0 && tie ? `${m.reason}. ${tie}` : m.reason, { group: "city", ref: m.metroId })),
      };
    },
  },
  {
    name: "neighbourhoods",
    for: ["navigator"],
    description: "Maps where the crowd's taste concentrates inside the chosen city (a Qloo heatmap) and names the neighbourhoods, strongest first; for going deeper at home, the home city, which it sets as the city the Rep works in. 1 Qloo call. Needs a city or a home city.",
    properties: { city: { type: "string", description: "A US city; the chosen one when empty." } },
    qloo: () => 1,
    when: once("neighbourhoods", (t) => {
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
    name: "find_places",
    for: ["rep"],
    description:
      "Independent shops and venues in the city whose regulars match the crowd, starting in the top neighbourhood. Leaves out every stockist and every venue the founder already heard back from, moves venue kinds that said yes up and kinds that said no down, " +
      `and widens to the next neighbourhood (then the whole city, then a second page) while fewer than ${FEW_VENUES} remain. 1 Qloo call per area searched, at most 5. Needs a city.`,
    properties: { neighbourhood: { type: "string", description: "Start in this neighbourhood instead of the top one." } },
    qloo: () => 5,
    maxMs: 45_000,
    when: once("find_places", (t) => (t.city ? { args: {}, why: `Finding shops in ${t.hoods?.[0] ? `${t.hoods[0]}, ` : ""}${t.city.name} whose regulars match your crowd` } : skip("shops need a city first", "a city"))),
    async run(a, { qloo, state, status }) {
      const t = state.team;
      if (!t?.city) return none("needs a city first");
      const city = t.city;
      const chips = await fp(t, qloo, status);
      const start = str(a.neighbourhood, 80);
      const areas = [...new Set([...(start ? [start] : []), ...(t.hoods ?? []).slice(0, 3)])];
      const seen = new Map<string, VenuePick & { area: string }>();
      const tried: string[] = [];
      const widened: string[] = [];
      const kept = () => {
        const fresh = [...seen.values()].filter((v) => !alreadyIn(v.name, t.brand.stockists));
        return applyOutcomes(fresh.map((v) => ({ ...v, qid: v.id, id: itemId("venue", v.name), kind: "venue", group: venueGroup(v, CHANNEL_IDS) })), t.outcomes, "rep");
      };
      const search = async (label: string, target: string, page = 1) => {
        tried.push(label);
        const r = await places(blockCtx(t, qloo, status, { target }), { fingerprint: chips, page }).catch(() => undefined);
        for (const v of r?.data.picks ?? []) if (!seen.has(v.id)) seen.set(v.id, { ...v, area: label });
        return r?.data.hasMore ?? false;
      };
      for (const hood of areas) {
        const where = await resolveTyped(`${hood}, ${city.name}`).catch(() => undefined);
        if (where?.status !== "ok") continue;
        if (tried.length) widened.push(`only ${kept().items.length} after ${tried.at(-1)}, so widened to ${hood}`);
        await search(hood, where.id);
        if (kept().items.length >= FEW_VENUES) break;
      }
      let more = false;
      if (kept().items.length < FEW_VENUES) {
        if (tried.length) widened.push(`only ${kept().items.length} in ${list(tried)}, so widened to all of ${city.name}`);
        more = await search(city.name, city.id);
      }
      if (kept().items.length < FEW_VENUES && more) {
        widened.push(`still only ${kept().items.length}, so read a second page`);
        await search(`${city.name} (more)`, city.id, 2);
      }
      // An empty city isn't the end: the Navigator ranked a next city, so the shops come from there instead.
      const next = t.cities?.find((c) => c.metroId !== city.id);
      let movedTo: string | undefined;
      if (!kept().items.length && next) {
        widened.push(`nothing in ${city.name} yet, so widened to ${next.name}, the Navigator's next city`);
        await search(next.name, next.metroId);
        if (kept().items.length) movedTo = next.name;
      }
      const { items: ranked, moved, dropped } = kept();
      const stocked = [...seen.values()].filter((v) => alreadyIn(v.name, t.brand.stockists)).map((v) => v.name);
      t.found.places = ranked.slice(0, 20).map((v) => ({ ...v, id: v.qid }));
      if (!ranked.length) return { summary: `no independent venues matched in ${list([city.name, ...(next ? [next.name] : [])])} yet`, data: { searched: tried, widened }, status: "empty" };
      const read = outcomeLine(t.outcomes, "rep");
      return {
        summary: `${ranked.length} venues in ${movedTo ?? list(tried)}${widened.length ? ` (${widened.at(-1)})` : ""}${stocked.length ? `; left out ${stocked.length} you're already in` : ""}${read && (moved || dropped) ? `; re-ordered on your outcomes` : ""}`,
        data: {
          city: movedTo ?? city.name,
          moved_from: movedTo ? city.name : undefined,
          searched: tried,
          widened,
          left_out_as_stockists: stocked,
          outcomes_read: read || undefined,
          heard_back_left_out: dropped,
          venues: ranked.slice(0, 15).map((v) => ({ name: v.name, kind: v.group, area: v.area, neighbourhood: v.neighbourhood, why: v.reasons.slice(0, 2).map((x) => x.label) })),
        },
        status: ranked.length < FEW_VENUES ? "thin" : "ok",
        items: ranked.slice(0, 15).map((v) => item("venue", v.name, v.reasons[0]?.label ?? `Its regulars match ${aimed(t, state)?.name ?? "your crowd"}`, { group: v.group, detail: [v.neighbourhood, v.address].filter(Boolean).join(" · ") || undefined, ref: v.qid })),
      };
    },
  },
  {
    name: "next_retailers",
    for: ["rep"],
    description: "The bigger retailers whose shoppers match the crowd, for a brand ready to step up from independent shops; leaves out retailers it's already in. About 15 Qloo calls the first time.",
    properties: {},
    qloo: () => 15,
    maxMs: 40_000,
    when: once("next_retailers", (t) =>
      t.goals.includes("step_up") || t.brand.stockists.length >= 3 ? { args: {}, why: "Finding the bigger retailers whose shoppers match your crowd" } : skip(`not stepping up yet: ${t.brand.stockists.length ? `${t.brand.stockists.length} ${t.brand.stockists.length === 1 ? "shop" : "shops"} so far` : "no shops yet"}, so independents come first`),
    ),
    async run(_a, { qloo, state }) {
      const t = state.team;
      const crowd = t && aimed(t, state);
      if (!t || !crowd) return none("needs the crowds first");
      const r = await nextRetailers(qloo, crowd.signal.map((s) => s.id).slice(0, 10), t.brand.stockists, t.brand.product, { category: t.brand.retail });
      const fresh = applyOutcomes(r.picks.map((p) => ({ ...p, qid: p.id, id: itemId("retailer", p.name), kind: "retailer", group: p.ownLabel ? "own-label retailer" : "retailer" })), t.outcomes, "rep").items;
      t.found.retailers = fresh.map((p) => ({ ...p, id: p.qid }));
      return {
        summary: fresh.length ? `${fresh.slice(0, 4).map((p) => p.name).join(", ")}${r.already.length ? `; left out ${list(r.already)}, where you already are` : ""}` : "no retailer matched yet",
        data: { retailers: fresh.slice(0, 8).map((p) => ({ name: p.name, rank: p.rank, own_label: p.ownLabel })), already_in: r.already, category: r.category },
        status: fresh.length ? "ok" : "empty",
        items: fresh.slice(0, 8).map((p) => item("retailer", p.name, p.ownLabel ? "Its shoppers match your crowd; it sells mostly its own label, so pitch a co-branded line" : "Its shoppers match your crowd", { group: p.group, ref: p.qid })),
      };
    },
  },
  {
    name: "draft_pitch",
    for: ["rep"],
    description: "A short first-contact pitch to one venue, opening on what both crowds love; every name in it is checked against the evidence. Nothing is sent. 1 Qloo call.",
    properties: { venue: { type: "string", description: "The venue's name, from find_places; the top one when empty." } },
    qloo: () => 1,
    when: once("draft_pitch", (t) => (t.found.places?.length ? { args: {}, why: `Writing the pitch to ${t.found.places[0].name}` } : undefined)),
    async run(a, { qloo, state }) {
      const t = state.team;
      const v = t?.found.places?.find((x) => x.name === str(a.venue, 120)) ?? t?.found.places?.[0];
      if (!t || !v) return none("needs a venue first");
      return drafted(t, qloo, { kind: "venue", id: v.id, name: v.name, neighbourhood: v.neighbourhood, tags: v.tags.map((x) => x.name), reasons: v.reasons.map((x) => x.label) });
    },
  },

  // ---- Matchmaker ------------------------------------------------------------------------------------------------
  {
    name: "partner_brands",
    for: ["matchmaker"],
    description:
      "Brands whose fans over-index on the crowd, each checked from the other side: how much the partner's own crowd ranks the brand among brands like it. Drops one-way partners (the other side ranks the brand in its bottom half). " +
      "Needs the brand in Qloo for the other side; without it, says so. About 25 Qloo calls with partner_podcasts (one shared run).",
    properties: {},
    qloo: (_a, s) => (s.team?.found.partners ? 0 : 25),
    maxMs: 60_000,
    when: once("partner_brands", () => ({ args: {}, why: "Finding brands whose fans would love you, and checking they'd love you back" })),
    async run(_a, { qloo, state, status }) {
      const t = state.team;
      if (!t || !aimed(t, state)) return none("needs the crowds first");
      const d = await partnersOf(t, qloo, status);
      const oneWay = d.brands.filter((b) => b.pReverse !== undefined && b.pReverse < ONE_WAY);
      const kept = applyOutcomes(
        d.brands.filter((b) => !oneWay.includes(b)).map((b) => ({ ...b, qid: b.id, id: itemId("partner", b.name), kind: "partner", group: "brand" })),
        t.outcomes,
        "matchmaker",
      ).items;
      const checked = d.brands.some((b) => b.pReverse !== undefined);
      return {
        summary: `${kept.slice(0, 4).map((b) => b.name).join(", ") || "no two-way partner yet"}${oneWay.length ? `; dropped ${list(oneWay.map((b) => b.name))}: their fans wouldn't love you back` : ""}${checked ? "" : t.brand.ownId ? `; the other side can't be checked yet: Qloo lists no brands like ${t.brand.name} to rank it against` : `; the other side can't be checked while ${t.brand.name} isn't in Qloo`}`,
        data: {
          partners: kept.slice(0, 10).map((b) => ({ name: b.name, your_crowd_percentile: b.pForward, their_crowd_percentile: b.pReverse, fits_both_ways: b.mutual !== undefined ? b.mutual >= 0.7 : undefined })),
          dropped_one_way: oneWay.map((b) => ({ name: b.name, their_crowd_percentile: b.pReverse })),
          other_side_checked: checked,
        },
        status: kept.length ? "ok" : "empty",
        items: kept.slice(0, 10).map((b) =>
          item("partner", b.name, b.mutual !== undefined && b.mutual >= 0.7 ? "Fits both ways: your crowd loves them and theirs ranks you high" : b.pReverse !== undefined ? "Your crowd loves them, and theirs ranks you in its top half" : "Your crowd loves them", { group: "brand", ref: b.qid }),
        ),
      };
    },
  },
  {
    name: "partner_podcasts",
    for: ["matchmaker"],
    description: "Podcasts the crowd over-indexes on, with who listens; drops shows whose listeners rank the brand in their bottom half among brands like it. Shares partner_brands' run (0 Qloo calls after it).",
    properties: {},
    qloo: (_a, s) => (s.team?.found.partners ? 0 : 25),
    maxMs: 60_000,
    when: once("partner_podcasts", () => ({ args: {}, why: "Finding podcasts your crowd listens to whose listeners would like you back" })),
    async run(_a, { qloo, state, status }) {
      const t = state.team;
      if (!t || !aimed(t, state)) return none("needs the crowds first");
      const d = await partnersOf(t, qloo, status);
      const oneWay = d.podcasts.filter((p) => p.listeners?.likesYou && p.listeners.likesYou.rank / p.listeners.likesYou.of > ONE_WAY);
      const kept = applyOutcomes(
        d.podcasts.filter((p) => !oneWay.includes(p)).map((p) => ({ ...p, id: itemId("podcast", p.name), kind: "podcast", group: "podcast" })),
        t.outcomes,
        "matchmaker",
      ).items;
      return {
        summary: `${kept.slice(0, 4).map((p) => p.name).join(", ") || "no podcast matched yet"}${oneWay.length ? `; dropped ${list(oneWay.map((p) => p.name))}: their listeners rank you low` : ""}`,
        data: {
          podcasts: kept.slice(0, 8).map((p) => ({ name: p.name, your_crowd_percentile: p.pForward, listeners_rank_you: p.listeners?.likesYou, listeners_love: p.listeners?.brands.slice(0, 3) })),
          dropped_one_way: oneWay.map((p) => ({ name: p.name, listeners_rank_you: p.listeners?.likesYou })),
        },
        status: kept.length ? "ok" : "empty",
        items: kept.slice(0, 8).map((p) => item("podcast", p.name, p.listeners?.shared.length ? `Its listeners and your crowd both love ${list(p.listeners.shared.slice(0, 2).map((x) => x.name))}` : "Your crowd over-indexes on it", { group: "podcast", ref: p.id })),
      };
    },
  },
  {
    name: "draft_ask",
    for: ["matchmaker"],
    description: "A short first-contact ask to one partner brand or podcast, opening on what both crowds love; every name checked against the evidence. Nothing is sent. 1 Qloo call.",
    properties: { partner: { type: "string", description: "The partner's name; the top two-way partner when empty." } },
    qloo: () => 1,
    when: once("draft_ask", (t) => {
      const top = topPartner(t);
      return top ? { args: {}, why: `Writing the ask to ${top.name}` } : undefined;
    }),
    async run(a, { qloo, state }) {
      const t = state.team;
      const all = [...(t?.found.partners?.brands ?? []), ...(t?.found.partners?.podcasts ?? [])];
      const p = all.find((x) => x.name === str(a.partner, 120)) ?? (t && topPartner(t));
      if (!t || !p) return none("needs a partner first");
      return drafted(t, qloo, { kind: "partner", id: p.id, name: p.name, tags: [], reasons: p.reasons.map((x) => x.label) });
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
        items: events.slice(0, 8).map((x) => item("event", x.name, `${x.kind === "show" ? `${x.qlooName}, an artist your crowd loves` : "A festival your crowd loves"}, on ${x.date}${x.site ? ` (${x.site})` : ""}`, { group: x.kind, detail: x.venue, ref: x.qlooId })),
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

function partnersOf(t: TeamCtx, qloo: QlooClient, status: (s: string) => void): Promise<PartnersData> {
  return shared(t, "partners", async () => {
    const r = await partners(blockCtx(t, qloo, status), { fingerprint: await fp(t, qloo, status), websites: t.enrich.websites, podcastDetails: t.enrich.podcastDetails });
    t.found.partners = r.data;
    return r.data;
  });
}

/** The partner to ask first: a two-way brand, else the top kept podcast. */
function topPartner(t: TeamCtx): PartnerCard | undefined {
  const d = t.found.partners;
  if (!d) return undefined;
  const two = d.brands.filter((b) => b.pReverse === undefined || b.pReverse >= ONE_WAY);
  return two.find((b) => (b.mutual ?? 0) >= 0.7) ?? two[0] ?? d.podcasts[0];
}

async function drafted(t: TeamCtx, qloo: QlooClient, to: DraftTo): Promise<ToolResult> {
  const partnerList = (t.found.partners?.brands ?? []).map((b) => ({ id: b.id, name: b.name, pForward: b.pForward }));
  const d = await writeDraft({ qloo, brand: t.brand.name, product: t.brand.product, to, partners: partnerList, llm: t.llm });
  const text = d.sentences.map((s) => s.text).join(" ");
  const what = to.kind === "venue" ? "Pitch" : to.kind === "partner" ? "Ask" : "Inquiry";
  return {
    summary: `${what} to ${to.name}: "${d.subject}"`,
    data: { to: to.name, subject: d.subject, body: text, shared_loves: d.bridges.map((b) => b.name) },
    items: [item("draft", `${what} to ${to.name}`, d.bridges.length ? `Opens on what both crowds love: ${list(d.bridges.map((b) => b.name))}` : "Opens on why the brand fits", { group: "draft", detail: `${d.subject}\n\n${text}` })],
  };
}
