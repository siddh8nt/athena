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
  | { type: "table"; label?: string; columns: string[]; rows: Row[] }
  /** A city's taste heat, one layer per crowd, each toggled. Cells are [lat, lon, heat 0–1]. */
  | { type: "heat"; city: { name: string; center: [number, number]; bbox?: [number, number, number, number] }; layers: { crowd: string; name: string; tier: CrowdTier; cells: [number, number, number][] }[] }
  /** Next steps: ticked when done, then marked for whether they worked, so the subagent re-ranks from them. */
  | { type: "checks"; label?: string; checks: { text: string; item: string; detail?: string; group?: string }[] };

/** A table row's detail: what opens when the founder taps it. */
export type Detail = { title: string; facts: { label: string; value: string }[]; lines?: string[]; item?: string; kind?: string };

export type Row = { cells: string[]; goto?: string; detail?: Detail };

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
