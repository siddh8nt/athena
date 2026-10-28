// Sources named, not numbered (PRD §23.8 d): every source a sentence cites shows as a chip in the founder's words
// ("Qloo · 20 calls", "Census", "the web"), never an id or a tool name. Pure and client-safe.

import type { SourceRef } from "@/lib/fits/types";
import type { Source as BriefSource } from "@/lib/brief/types";

type Family = "qloo" | "qloo_census" | "census" | "wikipedia" | "ticketmaster" | "ticketmaster_web" | "web" | "qloo_web" | "site" | "files" | "graph" | "today" | "calendar" | "outcomes" | "founder" | "drafts";

/** Which data each tool reads. A tool not listed here is the team's own work. */
const FAMILY: Record<string, Family> = {
  qloo_search: "qloo", qloo_insights: "qloo", qloo_demographics: "qloo", build_taste_graph: "qloo", probe_entity: "qloo", taste_axes: "qloo", crowd_bridges: "qloo",
  rank_fits: "qloo", crowds: "qloo", fits: "qloo", picks: "qloo", taste_fingerprint: "qloo", position_rivals: "qloo", place_entity: "qloo", next_crowd: "qloo",
  read_crowds: "qloo", neighbourhoods: "qloo", fingerprint: "qloo", map_taste: "qloo", compare_group: "qloo", rank_venues: "qloo", rank_partners: "qloo",
  who_listens: "qloo", mutual_fit: "qloo", resolve: "qloo",
  crowd_geography: "qloo_census", read_cities: "qloo_census", rank_metros: "qloo_census",
  census_market: "census",
  wikipedia_momentum: "wikipedia",
  ticketmaster_events: "ticketmaster",
  read_events: "ticketmaster_web", find_moments: "ticketmaster_web",
  web_search: "web", read_page: "web",
  read_shops: "qloo_web", read_partners: "qloo_web",
  read_website: "site",
  knowledge: "files",
  brief: "graph", brand_graph: "graph",
  today: "today",
  brand_calendar: "calendar",
  read_outcomes: "outcomes", log_outcome: "outcomes",
  ask_founder: "founder",
  draft_pitch: "drafts", draft_ask: "drafts", draft_inquiry: "drafts", build_message: "drafts",
};

const CHIP: Record<Family, string> = {
  qloo: "Qloo",
  qloo_census: "Qloo and Census",
  census: "Census",
  wikipedia: "Wikipedia",
  ticketmaster: "Ticketmaster",
  ticketmaster_web: "Ticketmaster and the web",
  web: "the web",
  qloo_web: "Qloo and the web",
  site: "your site",
  files: "your file",
  graph: "the Brand Graph",
  today: "today's date",
  calendar: "the calendar",
  outcomes: "your outcomes",
  founder: "you said",
  drafts: "the team's drafts",
};

/** Longer, for a card's "where it came from" line. */
const WORDS: Record<Family, string> = {
  ...CHIP,
  qloo: "Qloo's taste graph",
  qloo_census: "Qloo's taste graph and the U.S. Census",
  census: "the U.S. Census",
  wikipedia: "Wikipedia page views",
  qloo_web: "Qloo's taste graph and the web",
  graph: "your Brand Graph",
};

const familyOf = (tool: string): Family | undefined => FAMILY[tool];
const calls = (n: number) => `${n} call${n === 1 ? "" : "s"}`;

/** A web page as the founder reads it: its host, without "www.". */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The chip: "Qloo · 20 calls", "Census", "the web". */
export function sourceName(s: Pick<SourceRef, "tool" | "callIds">): string {
  const f = familyOf(s.tool);
  if (!f) return "the team's work";
  return f.startsWith("qloo") && s.callIds.length ? `${CHIP[f]} · ${calls(s.callIds.length)}` : CHIP[f];
}

/** The card's line: "Qloo's taste graph, 20 calls", "the web: graza.co". */
export function sourceWords(s: Pick<SourceRef, "tool" | "callIds" | "pages">): string {
  const f = familyOf(s.tool);
  if (!f) return "the team's own work";
  const page = s.pages?.[0];
  if (page && (f === "web" || f === "site")) return `${WORDS[f]}: ${page.title && !/^https?:/.test(page.title) ? page.title : hostOf(page.url)}`;
  return f.startsWith("qloo") && s.callIds.length ? `${WORDS[f]}, ${calls(s.callIds.length)}` : WORDS[f];
}

/** The pages a tool read, kept with its source so the chip opens them (§23.8 d). Server-side, from a tool's args and data. */
export function pagesOf(tool: string, args: Record<string, unknown>, data: unknown): { title?: string; url: string }[] | undefined {
  const http = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u);
  if (tool === "read_website" || tool === "read_page") {
    const urls = (Array.isArray(args.urls) ? args.urls : [args.url]).filter(http).slice(0, 3);
    return urls.length ? urls.map((url) => ({ url })) : undefined;
  }
  if (tool === "web_search" && data && typeof data === "object") {
    const found = (data as { sources?: { title?: unknown; uri?: unknown }[] }).sources ?? [];
    const pages = found.filter((x) => http(x.uri)).slice(0, 3).map((x) => ({ ...(typeof x.title === "string" ? { title: x.title } : {}), url: x.uri as string }));
    return pages.length ? pages : undefined;
  }
  return undefined;
}

/** Where a Brand Graph fact came from, in the founder's words: "you said", "your file deck.pdf", "your site". */
export function briefSourceWords(s: BriefSource | undefined): { from: string; url?: string } {
  const url = s?.ref && /^https?:\/\//.test(s.ref) ? s.ref : undefined;
  switch (s?.kind) {
    case "message":
      return { from: "you said" };
    case "file":
      return { from: s.ref ? `your file ${s.ref}${s.at ? `, ${s.at}` : ""}` : "your file" };
    case "pasted":
      return { from: "the summary you pasted from your AI assistant" };
    case "website":
      return { from: url ? `your site: ${hostOf(url)}` : "your site", url };
    case "web":
      return { from: url ? `the web: ${hostOf(url)}` : "the web", url };
    case "qloo":
      return { from: "Qloo's taste graph" };
    default:
      return { from: "my read of your brand" };
  }
}
