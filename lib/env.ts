import "server-only";

// Server-side configuration. The Qloo key never leaves the server (kit rules, PRD §11).
export type Env = {
  qlooApiKey: string | undefined;
  /** Every Qloo key (QLOO_API_KEY, QLOO_API_KEY_2, …); calls rotate across them, each paced at its own 5 a second. */
  qlooApiKeys: string[];
  qlooBaseUrl: string;
  fixtures: boolean;
  ticketmasterKey: string | undefined;
  censusKey: string | undefined;
  /** Optional (§23.5 g): real subscriber counts for YouTube creators. Off when absent. */
  youtubeKey: string | undefined;
  /** Optional (§23.5 g): a podcast's owner, feed and episode count from Podcast Index. Off unless both are set. */
  podcastIndexKey: string | undefined;
  podcastIndexSecret: string | undefined;
};

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return {
    qlooApiKey: source.QLOO_API_KEY || undefined,
    qlooApiKeys: [source.QLOO_API_KEY, ...[2, 3, 4].map((n) => source[`QLOO_API_KEY_${n}`])].filter((k): k is string => !!k),
    qlooBaseUrl: source.QLOO_BASE_URL || "https://hackathon.api.qloo.com",
    fixtures: source.ATHENA_FIXTURES === "1" || !source.QLOO_API_KEY,
    ticketmasterKey: source.TICKETMASTER_API_KEY || undefined,
    censusKey: source.CENSUS_API_KEY || undefined,
    youtubeKey: source.YOUTUBE_API_KEY || undefined,
    podcastIndexKey: source.PODCASTINDEX_API_KEY || undefined,
    podcastIndexSecret: source.PODCASTINDEX_API_SECRET || undefined,
  };
}
