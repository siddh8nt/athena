import type { StopId } from "./growth";
import type { CrowdCard } from "./types";
import type { MarketsData } from "@/lib/blocks/markets";
import type { PlacesData } from "@/lib/blocks/places";
import type { PartnersData } from "@/lib/blocks/partners";
import type { MessageData } from "@/lib/blocks/message";
import type { MomentsData } from "@/lib/blocks/moments";

// What Athena's take on a stop may draw on (§6.2.2 step 3): a compact summary of that stop's data, and a plain
// fallback line written from the same data, used whenever the model's take can't be grounded. Pure, for the client.

type Retailers = { picks: { name: string; affinity: number }[]; already: string[] };
type Online = { creators: { name: string; role: string }[]; podcasts: { name: string }[]; interests: { name: string }[] };

export type Take = { data: unknown; fallback: string };

const list = (xs: string[], n = 3) => xs.slice(0, n).join(", ");

export function takeFor(stop: StopId, raw: unknown, crowds?: CrowdCard[]): Take | undefined {
  switch (stop) {
    case "crowd": {
      if (!crowds?.length) return undefined;
      const main = crowds.find((c) => c.main) ?? crowds[0];
      return {
        data: crowds.map((c) => ({ crowd: c.name, closest: c.main, loves: c.loves.slice(0, 6).map((l) => l.name), cities: c.cities.slice(0, 3).map((x) => x.name) })),
        fallback: `The closest crowd is ${main.name}: they love ${list(main.loves.map((l) => l.name))}.${crowds.length > 1 ? ` ${crowds.length - 1} more sit next door.` : ""}`,
      };
    }
    case "where": {
      const m = raw as MarketsData;
      if (!m?.metros?.length) return undefined;
      return {
        data: { cities: m.metros.slice(0, 5).map((r) => ({ city: r.name, ...(r.leans?.length ? { leansTo: r.leans } : r.topVenue ? { strongestVenue: r.topVenue.name } : {}) })), planningFor: m.target.name },
        fallback: `Your crowd's taste is strongest in ${list(m.metros.map((r) => r.name))}.`,
      };
    }
    case "places": {
      const p = raw as PlacesData;
      if (!p?.picks?.length) return undefined;
      return {
        data: { venues: p.picks.slice(0, 6).map((v) => ({ venue: v.name, neighbourhood: v.neighbourhood, why: v.reasons.map((r) => r.label) })) },
        fallback: `Start with ${list(p.picks.map((v) => v.name))}: their crowds match yours most closely.`,
      };
    }
    case "retailers": {
      const r = raw as Retailers;
      if (!r?.picks?.length) return undefined;
      return {
        data: { nextRetailers: r.picks.slice(0, 5).map((x) => x.name), alreadyIn: r.already },
        fallback: `Beyond the shops you're in, your crowd loves ${list(r.picks.map((x) => x.name))} most.`,
      };
    }
    case "online": {
      const o = raw as Online;
      if (!o?.podcasts?.length && !o?.creators?.length) return undefined;
      return {
        data: { creators: o.creators.map((c) => `${c.name} (${c.role})`), podcasts: o.podcasts.map((p) => p.name), interestsToTest: o.interests.map((i) => i.name) },
        fallback: o.creators.length ? `Your crowd follows ${list(o.creators.map((c) => c.name), 2)}, and listens to ${list(o.podcasts.map((p) => p.name), 2)}.` : `Your crowd listens to ${list(o.podcasts.map((p) => p.name))}.`,
      };
    }
    case "partners": {
      const p = raw as PartnersData;
      if (!p?.brands?.length) return undefined;
      return {
        data: { brands: p.brands.slice(0, 5).map((b) => b.name), podcasts: p.podcasts.slice(0, 3).map((b) => b.name) },
        fallback: `The strongest collab fits are ${list(p.brands.map((b) => b.name))}.`,
      };
    }
    case "message": {
      const m = raw as MessageData;
      if (!m?.themes?.length && !m?.references?.length) return undefined;
      return {
        data: { themes: m.themes.map((t) => t.name), references: m.references.slice(0, 6).map((r) => r.name) },
        fallback: `Talk in the language of ${list(m.themes.map((t) => t.name.toLowerCase()), 2)}; your crowd's references include ${list(m.references.map((r) => r.name), 2)}.`,
      };
    }
    case "moments": {
      const m = raw as MomentsData;
      if (!m?.moments?.length) return undefined;
      return {
        data: { moments: m.moments.slice(0, 5).map((x) => ({ name: x.name, date: x.date, venue: x.venue })) },
        fallback: `The next moment worth showing up for is ${m.moments[0].name}${m.moments[0].date ? ` on ${m.moments[0].date}` : ""}.`,
      };
    }
    default:
      return undefined;
  }
}
