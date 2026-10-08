import "server-only";
import { MemoryCache, type ResponseCache } from "@/lib/qloo/client";
import { norm, seqRatio } from "@/lib/methods/names";
import type { Metro } from "@/lib/playbook/metros";
import type { ShowLookup } from "@/lib/blocks/moments";

// Ticketmaster Discovery API v2 (§9.18, §11.2). Called only when Moments runs; cached 24 h.
// Terms: no revenue from the API; link out for tickets; remove content within 24 h on request.
// Location uses latlong + 50-mile radius (tested 8 Oct) rather than DMA IDs, so no DMA table is needed.

const DAY = 24 * 60 * 60 * 1000;
const cache: ResponseCache = new MemoryCache();

type TmEvent = {
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string } };
  _embedded?: { venues?: { name?: string }[]; attractions?: { name?: string }[] };
};

export function ticketmasterShows(apiKey: string | undefined): ShowLookup | undefined {
  if (!apiKey) return undefined;
  return async (artist: string, metro: Metro) => {
    const now = new Date();
    const end = new Date(now.getTime() + 120 * DAY);
    const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
    const params = new URLSearchParams({
      keyword: artist,
      classificationName: "music",
      latlong: `${metro.center[0]},${metro.center[1]}`,
      radius: "50",
      unit: "miles",
      startDateTime: iso(now),
      endDateTime: iso(end),
      size: "5",
    });
    const key = `tm:${params.toString().replace(/startDateTime=[^&]+&endDateTime=[^&]+/, now.toISOString().slice(0, 10))}`;
    let hit = await cache.get(key);
    if (!hit) {
      params.set("apikey", apiKey);
      const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, { headers: { "User-Agent": "Athena/1.0" }, signal: AbortSignal.timeout(20_000) });
      hit = { status: res.status, body: res.ok ? await res.json() : null };
      if (res.ok) await cache.set(key, hit, DAY);
    }
    const events = ((hit.body as { _embedded?: { events?: TmEvent[] } } | null)?._embedded?.events ?? []);
    // Keep an event only when one of its attractions is this artist (similarity ≥ 0.95 after normalising).
    return events
      .filter((e) => (e._embedded?.attractions ?? []).some((a) => seqRatio(norm(a.name), norm(artist)) >= 0.95))
      .filter((e) => e.dates?.start?.localDate && e.url)
      .map((e) => ({ name: e.name.trim(), date: e.dates!.start!.localDate!, venue: e._embedded?.venues?.[0]?.name, url: e.url! }));
  };
}
