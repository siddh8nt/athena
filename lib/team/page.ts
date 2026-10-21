// One page shape for every subagent (PRD §23.5 b): a tab per crowd (Win first, Win next, Watch) with the same
// sections in the same order, then Across all three. Each name cites the call it came from; each actionable row is
// a WorkItem, so outcome marks and handoffs work as they do in the results list. Pure types, client-safe.

export type CrowdTier = "win_first" | "win_next" | "watch";

export const TIER_LABEL: Record<CrowdTier, string> = { win_first: "Win first", win_next: "Win next", watch: "Watch" };

/** Where a name came from: a Qloo call, the founder's Brand Graph, or another subagent's work. */
export type PageSource = { id: string; label: string; callId?: string };

/** A name on the page, with what it is and the source it links to. `item` is its WorkItem, when it can be marked or handed off. */
export type Named = { name: string; kind?: string; ref?: string; src?: string; note?: string; item?: string };

/** A line of copy ("lead with…", a hook), with the evidence it came from and, for an angle, why. */
export type Line = { text: string; from?: string[]; tag?: string; reason?: string; item?: string };

export type Block =
  | { type: "facts"; rows: { label: string; value: string; src?: string }[] }
  | { type: "names"; label?: string; groups: { label: string; names: Named[] }[] }
  /** `rewrite`: the hooks, rewritten in place by the tone buttons. */
  | { type: "lines"; label?: string; lines: Line[]; rewrite?: boolean }
  | { type: "images"; label?: string; images: { name: string; url: string; kind: string; src?: string }[] }
  | { type: "swatches"; label?: string; swatches: { name: string; hex: string; from: string[] }[] }
  /** A small graph: the crowds, and what each pair shares. */
  | { type: "paths"; nodes: { id: string; name: string; tier: CrowdTier }[]; edges: { a: string; b: string; strength: "strong" | "thin" | "leap"; shared: string[] }[] }
  /** A sequence, never a schedule: each step names the signal for moving on. */
  | { type: "steps"; steps: { text: string; signal?: string; crowd?: string }[] }
  | { type: "note"; text: string }
  /** Rows a founder scans; a row opens its detail sheet, or `goto` opens that section (a city's own page). */
  /** `facets`: the filters above it (crowd, city, wholesale…); each row says which values it has. */
  | { type: "table"; label?: string; columns: string[]; rows: Row[]; facets?: string[] }
  /** A city's taste heat, one layer per crowd, each toggled. Cells are [lat, lon, heat 0–1]. `pins`: places on it
   * (shops), coloured by the tier of the crowd they fit best, grey for ones the brand is already in. */
  | { type: "heat"; city: { name: string; center: [number, number]; bbox?: [number, number, number, number] }; layers: { crowd: string; name: string; tier: CrowdTier; cells: [number, number, number][] }[]; pins?: Pin[] }
  /** Outreach as a board: To pitch, then a column per mark. The columns come from the founder's marks, live. */
  | { type: "pipeline"; label?: string; items: { item: string; name: string; kind: string; group?: string; facets?: Record<string, string[]> }[]; facets?: string[] }
  /** Yes rates from the founder's marks, by each of `by` (shop type, tier, neighbourhood), computed live. */
  | { type: "working"; label?: string; items: { item: string; facets: Record<string, string> }[]; by: string[] }
  /** Next steps: ticked when done, then marked for whether they worked, so the subagent re-ranks from them. */
  | { type: "checks"; label?: string; checks: { text: string; item: string; detail?: string; group?: string }[] }
  /** A suggested split of the founder's budget, edited in place and kept per viewer. Shares sum to 100; never a schedule. */
  /** Shares of the partner budget, in percent, for the founder to change. */
  | { type: "budget"; label?: string; rows: { label: string; share: number; note?: string }[]; note?: string }
  /** Dated things on a calendar, filtered by city (All, each city, Online) and viewed by range or as a list. */
  | { type: "calendar"; label?: string; items: CalItem[]; cities: string[]; today: string }
  /** The year ahead as a strip: how many dated things fall in each month. */
  | { type: "months"; label?: string; months: { month: string; label: string; n: number; names: string[] }[] };

/** A calendar entry: ● an event in a city, ◆ the founder's own moment, ○ online. An undated one (an online place) lists only. */
export type CalItem = { item?: string; name: string; date?: string; mark: "event" | "own" | "moment" | "online"; city: string; crowds: string[]; note?: string; kind?: string; group?: string; detail?: Detail };

/** A table row's detail: what opens when the founder taps it. */
export type Detail = {
  title: string;
  facts: { label: string; value: string }[];
  lines?: string[];
  item?: string;
  kind?: string;
  /** The outcome group its mark files under (the shop type, so "what's working" can read it). */
  group?: string;
  /** A draft to copy or open in the mail app; never sent. `to` only when a public email was found, with its source.
   * `names`: the names the draft may use, so a tone rewrite can be checked against them. */
  draft?: { subject?: string; body: string; to?: string; toSrc?: string; names?: string[] };
  links?: { label: string; url: string }[];
  /** A dated item the founder can add to their calendar (.ics, made in the browser). */
  ics?: { name: string; date: string; url?: string; location?: string };
};

export type Row = { cells: string[]; goto?: string; detail?: Detail; facets?: Record<string, string[]> };

export type Pin = { name: string; lat: number; lon: number; tier?: CrowdTier; grey?: boolean };

export type Section = { id: string; title: string; summary?: string; blocks: Block[] };

export type PageTab = {
  crowd: { id: string; name: string; tier: CrowdTier; nearMiss?: boolean };
  sections: Section[];
  sources: PageSource[];
  /** The quiet method line at the foot ("Read from 48 Qloo signals · 3 crowds"). */
  method: string;
  /** What the hook rewrite reads, kept so a tone button needs no new Qloo calls. */
  evidence?: unknown;
};

export type CrowdPage = { tabs: PageTab[]; across?: { sections: Section[]; sources: PageSource[]; method: string }; at: number };

/** The tab order: Win first, Win next, Watch. */
export const TIER_ORDER: CrowdTier[] = ["win_first", "win_next", "watch"];

/** A fresh read of some crowds merged into the page before it: the crowds read now replace theirs, the rest stay. */
export function mergePage(prev: CrowdPage | undefined, next: CrowdPage): CrowdPage {
  if (!prev) return next;
  const read = new Set(next.tabs.map((x) => x.crowd.id));
  const tabs = [...next.tabs, ...prev.tabs.filter((x) => !read.has(x.crowd.id))];
  tabs.sort((a, b) => TIER_ORDER.indexOf(a.crowd.tier) - TIER_ORDER.indexOf(b.crowd.tier));
  return { tabs, across: next.across ?? prev.across, at: next.at };
}

/** One tab's hooks swapped for rewritten ones, in place; nothing else on the page changes. */
export function withHooks(page: CrowdPage, crowdId: string, lines: Line[]): CrowdPage {
  return {
    ...page,
    tabs: page.tabs.map((tab) =>
      tab.crowd.id !== crowdId ? tab : { ...tab, sections: tab.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.type === "lines" && b.rewrite ? { ...b, lines } : b)) })) },
    ),
  };
}
