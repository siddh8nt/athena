import "server-only";

// Spend caps (§14.5). In memory per Cloud Run instance (max 3 instances, so the real ceiling is at most 3×);
// good enough to bound spend during judging. Past a cap, the visitor gets a friendly note, never an error.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

function take(key: string, limit: number, windowMs: number): { ok: boolean; retryInMin: number } {
  // Local development only (set in .env.local, never in production): testing shouldn't use up the caps.
  if (process.env.ATHENA_NO_LIMITS === "1" && process.env.NODE_ENV !== "production") return { ok: true, retryInMin: 0 };
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return { ok: false, retryInMin: Math.max(1, Math.ceil((b.hits[0] + windowMs - now) / 60_000)) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  return { ok: true, retryInMin: 0 };
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export const LIMITS = {
  /** 5 own-brand plans per IP per hour, 60 a day in total. */
  ownBrand(ip: string) {
    const perIp = take(`own:${ip}`, 5, HOUR);
    if (!perIp.ok) return { ok: false as const, message: `You've planned 5 brands in the last hour. Try again in about ${perIp.retryInMin} minutes, or explore the demo brands meanwhile.` };
    const total = take("own:all", 60, DAY);
    if (!total.ok) return { ok: false as const, message: "Athena has planned its 60 live brands for today. The demo brands are ready to explore, and live plans reopen tomorrow." };
    return { ok: true as const };
  },
  /** Brief canvas turns (§14.5): 30 per IP per hour, so one founder can finish several briefs. */
  brief(ip: string) {
    const t = take(`brief:${ip}`, 30, HOUR);
    return t.ok ? { ok: true as const } : { ok: false as const, message: `That's a lot of messages in an hour. Try again in about ${t.retryInMin} minutes, or explore the demo brands meanwhile.` };
  },
  /** Re-runs after an inline answer (§6.2.2): 20 per IP per hour, separate from new plans. */
  rerun(ip: string) {
    const t = take(`rerun:${ip}`, 20, HOUR);
    return t.ok ? { ok: true as const } : { ok: false as const, message: "I'll keep your answer and use it on your next plan." };
  },
  /** Click to probe (§13.11): 12 probes per IP per hour, about 6 Qloo calls each. */
  probe(ip: string) {
    const t = take(`probe:${ip}`, 12, HOUR);
    return t.ok ? { ok: true as const } : { ok: false as const, message: `That's 12 probes in an hour, so the map stays as it is for now. More open in about ${t.retryInMin} minutes.` };
  },
  /** 10 new Without Qloo runs a day in total (cached comparisons don't count). */
  comparison() {
    const t = take("compare:all", 10, DAY);
    return t.ok ? { ok: true as const } : { ok: false as const, message: "Today's live comparisons are used up; the demo brands' comparisons are ready to view." };
  },
};
