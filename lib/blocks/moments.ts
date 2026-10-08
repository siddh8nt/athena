import { results } from "@/lib/qloo/client";
import { percentiles } from "@/lib/methods/rank";
import { metroById, type Metro } from "@/lib/playbook/metros";
import { blockSignal } from "@/lib/playbook/config";
import { withCalls } from "./run";
import type { BlockContext } from "./types";

export type Moment = {
  kind: "show" | "festival";
  name: string;
  /** The Qloo entity this moment comes from: an artist for shows, a festival place for festivals. */
  qlooId: string;
  qlooName: string;
  tasteRank: number;
  tastePercentile: number;
  date: string | null;
  venue?: string;
  url?: string;
  source: "Ticketmaster" | "Web" | null;
  /** For Web dates: the site that states the date, and Google's Search Suggestions chip (required by the grounding terms). */
  site?: string;
  searchEntryPoint?: string;
  soon: boolean;
  callIds: string[];
};

export type MomentsData = {
  metroId: string;
  /** Only confirmed, dated moments are ever shown (8 Oct decision: no "date unknown" or "not found" rows). */
  moments: Moment[];
  /** Festivals whose dates are still being looked up, with the latest step of the search. */
  checking: { name: string; step: string }[];
  artists: { id: string; name: string; rank: number }[];
};

export type ShowLookup = (artist: string, metro: Metro) => Promise<{ name: string; date: string; venue?: string; url: string }[]>;
export type DateLookup = (
  festival: string,
  metro: Metro,
  onThought?: (title: string) => void,
) => Promise<{ date: string | null; url: string | null; site?: string; searchEntryPoint?: string }>;

const DAY = 86_400_000;
const LOOKUP_CONCURRENCY = 4;
const ENOUGH_FESTIVALS = 5;

/**
 * Moments (§9.18): Qloo ranks the artists and festivals; Ticketmaster and grounded web search only supply dates.
 * Festivals are checked in Qloo rank order, a few at a time, until enough are dated; each step is narrated.
 * Nothing here throws: a lookup that can't confirm a date just leaves that festival out.
 */
export function moments(
  ctx: BlockContext,
  enrich: { shows?: ShowLookup; festivalDate?: DateLookup } = {},
  /** Called with partial results as shows and dates arrive, so the block streams. */
  onProgress?: (data: MomentsData) => void,
) {
  return withCalls(ctx, "moments", async ({ pb, qloo, emit }) => {
    const metro = metroById(pb.targetMetro);
    const signal = blockSignal(pb, "moments");
    const [artistRes, festRes] = await Promise.all([
      qloo.insights({ "filter.type": "urn:entity:artist", "signal.interests.entities": signal, take: 15 }),
      qloo.insights({ "filter.type": "urn:entity:place", "signal.interests.entities": signal, "filter.tags": "urn:tag:genre:place:festival", "filter.location.query": metro.query, take: 10 }),
    ]);
    const artists = (results(artistRes).entities ?? []).slice(0, 10);
    const festivals = results(festRes).entities ?? [];
    const pArtist = percentiles(artists.map((a) => a.entity_id));
    const pFest = percentiles(festivals.map((f) => f.entity_id));
    const soon = (d: string | null) => !!d && new Date(d).getTime() - Date.now() < 30 * DAY;
    const artistList = artists.map((a, i) => ({ id: a.entity_id, name: a.name, rank: i + 1 }));
    emit({ tool: "find_moments", why: `Ranking the artists and festivals your crowd loves in ${metro.name}`, status: "ok", callIds: [artistRes.call.id, festRes.call.id], summary: `${artists.length} artists, ${festivals.length} festivals` });

    const shows: Moment[] = [];
    const dated: Moment[] = [];
    const checking = new Map<string, string>();
    const snapshot = (): MomentsData => ({
      metroId: metro.id,
      // Default order: Qloo taste rank (shows by artist rank, then festivals by festival rank). The UI can re-sort by date.
      moments: [...[...shows].sort((a, b) => a.tasteRank - b.tasteRank || (a.date ?? "").localeCompare(b.date ?? "")).slice(0, 6), ...[...dated].sort((a, b) => a.tasteRank - b.tasteRank)],
      checking: [...checking].map(([name, step]) => ({ name, step })),
      artists: artistList,
    });

    const showsDone = (async () => {
      if (!enrich.shows || !artists.length) return;
      emit({ tool: "find_moments", why: `Checking Ticketmaster for shows by your crowd's top ${artists.length} artists`, status: "running", callIds: [], summary: "next 120 days" });
      const found = await Promise.all(artists.map((a) => enrich.shows!(a.name, metro).catch(() => [])));
      artists.forEach((a, i) =>
        found[i].forEach((ev) =>
          shows.push({ kind: "show", name: ev.name, qlooId: a.entity_id, qlooName: a.name, tasteRank: i + 1, tastePercentile: pArtist.get(a.entity_id) ?? 0, date: ev.date, venue: ev.venue, url: ev.url, source: "Ticketmaster", soon: soon(ev.date), callIds: [artistRes.call.id] }),
        ),
      );
      emit({ tool: "find_moments", why: "Ticketmaster shows", status: "ok", callIds: [], summary: shows.length ? `${shows.length} upcoming shows by your crowd's artists` : `none in ${metro.name} in the next 120 days; moving on to festivals` });
      onProgress?.(snapshot());
    })();

    const datesDone = (async () => {
      if (!enrich.festivalDate || !festivals.length) return;
      let next = 0;
      const worker = async () => {
        while (next < festivals.length && dated.length < ENOUGH_FESTIVALS) {
          const i = next++;
          const f = festivals[i];
          checking.set(f.name, "Searching the web for dates");
          emit({ tool: "find_moments", why: `Looking up the next date for ${f.name}`, status: "running", callIds: [], summary: "searching the web" });
          onProgress?.(snapshot());
          const d = await enrich.festivalDate!(f.name, metro, (title) => {
            checking.set(f.name, title);
            onProgress?.(snapshot());
          }).catch(() => ({ date: null, url: null }));
          checking.delete(f.name);
          if (d.date && d.url) {
            dated.push({ kind: "festival", name: f.name, qlooId: f.entity_id, qlooName: f.name, tasteRank: i + 1, tastePercentile: pFest.get(f.entity_id) ?? 0, date: d.date, url: d.url, source: "Web", site: d.site, searchEntryPoint: d.searchEntryPoint, soon: soon(d.date), callIds: [festRes.call.id] });
            emit({ tool: "find_moments", why: f.name, status: "ok", callIds: [], summary: `${d.date} on ${d.site}` });
          } else {
            emit({ tool: "find_moments", why: f.name, status: "ok", callIds: [], summary: "no confirmed date yet; checking the next festival" });
          }
          onProgress?.(snapshot());
        }
      };
      await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, festivals.length) }, worker));
    })();

    onProgress?.(snapshot());
    await Promise.all([showsDone, datesDone]);
    const final = snapshot();
    emit({ tool: "find_moments", why: `Moments for ${metro.name}`, status: "ok", callIds: [artistRes.call.id, festRes.call.id], summary: `${final.moments.length} dated moments` });
    return { data: final, status: "ok" as const };
  });
}
