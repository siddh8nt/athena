import "server-only";

// Server-side configuration. The Qloo key never leaves the server (kit rules, PRD §11).
export type Env = {
  qlooApiKey: string | undefined;
  qlooBaseUrl: string;
  fixtures: boolean;
  ticketmasterKey: string | undefined;
  censusKey: string | undefined;
};

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return {
    qlooApiKey: source.QLOO_API_KEY || undefined,
    qlooBaseUrl: source.QLOO_BASE_URL || "https://hackathon.api.qloo.com",
    fixtures: source.ATHENA_FIXTURES === "1" || !source.QLOO_API_KEY,
    ticketmasterKey: source.TICKETMASTER_API_KEY || undefined,
    censusKey: source.CENSUS_API_KEY || undefined,
  };
}
