import type { QlooTransport, RawResult } from "./client";
import type { HeatmapCell, QlooEntity, QlooTag } from "./types";
import { METROS, metroFor } from "@/lib/playbook/metros";

// Fixture transport (PRD §14.3): synthetic data shaped like Qloo's, labelled FIXTURE.
// Deterministic: the same request always returns the same data. Never ships as real data.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let x = hash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const ADJ = ["Golden", "Little", "Copper", "Juniper", "Marigold", "Saltwater", "Linden", "Harbor", "Fig", "Ember", "Wren", "Alder", "Clover", "Quince", "Basil", "Hazel", "Sorrel", "Maple", "Tidal", "Larkspur"];
const NOUN: Record<string, string[]> = {
  place: ["Pantry", "Provisions", "Table", "Mercantile", "Larder", "Kitchen", "General", "Supply", "Corner", "Commons"],
  brand: ["Goods", "Studio", "& Co.", "Supply", "Works", "Atelier", "Collective", "House", "Lab", "Club"],
  podcast: ["Hour", "Radio", "Table Talk", "Dispatch", "Show", "Notes", "Weekly", "Conversations"],
  artist: ["Lakes", "Harbors", "Ellis", "Moon Trio", "Parade", "Avenue", "Brothers", "& The Hours"],
  tv_show: ["Kitchen Stories", "Road Trip", "Makers", "Table for Two", "Weekend"],
  movie: ["Summer", "Harvest", "Long Table", "Morning", "Kitchen"],
  book: ["Notes", "Almanac", "Field Guide", "Letters", "Seasons"],
  festival: ["Street Fest", "Night Market", "Summer Fair", "Midsommar", "Block Party"],
};
const THEMES = ["Connection", "Authenticity", "Curiosity", "Craft", "Ritual", "Simplicity", "Nostalgia", "Discovery", "Generosity", "Wellbeing", "Play", "Heritage"];
const STYLE = ["Minimalist", "Warm", "Design-led", "Playful", "Earthy", "Modern", "Artisanal", "Bold", "Refined", "Cozy"];
const PLACE_TAGS: [string, string][] = [
  ["urn:tag:ambience:qloo:cozy", "Cozy"], ["urn:tag:ambience:qloo:trendy", "Trendy"], ["urn:tag:setting:qloo:neighborhood_gem", "Neighborhood gem"],
  ["urn:tag:decor:qloo:minimalist", "Minimalist"], ["urn:tag:good_for:qloo:groups", "Good for groups"], ["urn:tag:menu_highlight:qloo:natural_wine", "Natural wine"],
  ["urn:tag:service_options:place:takeout", "Takeout"], ["urn:tag:specialty_dish:place:sourdough", "Sourdough"], ["urn:tag:amenity:qloo:outdoor_seating", "Outdoor seating"],
];
const AUDIENCES: [string, string][] = [
  ["Cooking", "urn:audience:hobbies_and_interests"], ["Arts Crafts", "urn:audience:hobbies_and_interests"], ["Travel", "urn:audience:leisure"],
  ["Organic Ingredients", "urn:audience:spending_habits"], ["Design Professional", "urn:audience:professional_area"], ["Gardening", "urn:audience:hobbies_and_interests"],
  ["Community Group", "urn:audience:communities"], ["Political Group", "urn:audience:political_preferences"],
];

const uuid = (seed: string) => {
  const h = (n: number) => hash(seed + n).toString(16).padStart(8, "0").toUpperCase();
  return `F1X7${h(1).slice(0, 4)}-${h(2).slice(0, 4)}-${h(3).slice(0, 4)}-${h(4).slice(0, 4)}-${h(5)}${h(6).slice(0, 4)}`;
};

function name(kind: string, r: () => number): string {
  const nouns = NOUN[kind] ?? NOUN.brand;
  return `${ADJ[Math.floor(r() * ADJ.length)]} ${nouns[Math.floor(r() * nouns.length)]}`;
}

function signalOf(q: Record<string, string>): string[] {
  return (q["signal.interests.entities"] ?? "").split(",").filter(Boolean);
}

function makePlace(seed: string, i: number, metroName: string | undefined, genre: string | undefined, signal: string[], affinity: number): QlooEntity {
  const r = rng(`${seed}:${i}`);
  const metro = metroFor(metroName) ?? METROS[Math.floor(r() * METROS.length)];
  const [lat, lon] = metro.center;
  const tags: QlooTag[] = [
    ...(genre ? [{ id: genre, name: genre.split(":").pop()!.replace(/_/g, " "), type: "urn:tag:genre:place" }] : []),
    ...PLACE_TAGS.filter(() => r() < 0.4).map(([id, n]) => ({ id, name: n, type: id.split(":").slice(0, 4).join(":") })),
  ];
  const contributors = signal.slice(0, 6).map((id, k) => ({ entity_id: id, score: 0.12 - k * 0.015 - r() * 0.01 }));
  return {
    entity_id: uuid(`place:${seed}:${i}`),
    name: `${name("place", r)} (FIXTURE)`,
    type: "urn:entity",
    subtype: "urn:entity:place",
    popularity: Math.round(r() * 1000) / 1000,
    location: { lat: lat + (r() - 0.5) * 0.18, lon: lon + (r() - 0.5) * 0.24 },
    tags,
    properties: {
      address: `${100 + Math.floor(r() * 3800)} ${["Main", "Oak", "Division", "Elm", "Market", "Grand"][Math.floor(r() * 6)]} St`,
      phone: r() < 0.7 ? "+1 555 0100" : undefined,
      website: r() < 0.6 ? "https://example.com" : undefined,
      price_level: 1 + Math.floor(r() * 4),
      business_rating: Math.round((3.8 + r()) * 10) / 10,
      is_closed: r() < 0.03,
      neighborhood: ["Logan Square", "Wicker Park", "Andersonville", "Pilsen", "West Loop", "Silver Lake", "Echo Park", "Williamsburg", "Park Slope"][Math.floor(r() * 9)],
      geocode: { metro: metro.query, city: metro.name, country_code: "US" },
    },
    query: {
      affinity,
      measurements: { audience_growth: r() < 0.3 ? Math.round(r() * 100) / 1000 : 0 },
      explainability: contributors.length ? { "signal.interests.entities": contributors } : undefined,
    },
  };
}

function makeEntity(kind: string, seed: string, i: number, affinity: number): QlooEntity {
  const r = rng(`${kind}:${seed}:${i}`);
  return {
    entity_id: uuid(`${kind}:${seed}:${i}`),
    name: `${name(kind, r)} (FIXTURE)`,
    type: "urn:entity",
    subtype: `urn:entity:${kind}`,
    popularity: Math.round((0.5 + r() * 0.49) * 1000) / 1000,
    tags: [{ id: `urn:tag:genre:${kind}:fixture`, name: "Fixture genre", type: `urn:tag:genre:${kind}` }],
    properties: { price_tier: 1 + Math.floor(r() * 4), episode_count: kind === "podcast" ? String(20 + Math.floor(r() * 300)) : undefined },
    query: { affinity },
  };
}

/** Reorders a fixed pool deterministically under a signal; about a third come back unscored, as on 8 Oct. */
function scorePool(ids: string[], signal: string): QlooEntity[] {
  return ids
    .map((id) => ({ id, s: rng(`${signal}|${id}`)() }))
    .filter(({ s }) => s > 0.33)
    .sort((a, b) => b.s - a.s)
    .map(({ id, s }, i) => ({ entity_id: id, name: `Pool item ${i + 1} (FIXTURE)`, query: { affinity: s } }));
}

export class FixtureTransport implements QlooTransport {
  readonly mode = "fixture" as const;

  async send(path: string, q: Record<string, string>): Promise<RawResult> {
    await new Promise((r) => setTimeout(r, 40 + (hash(JSON.stringify(q)) % 160)));
    const ok = (results: unknown): RawResult => ({ status: 200, body: { success: true, results: results as never } });
    if (path === "/") return { status: 200, body: { success: true } };
    if (path === "/search") {
      const query = q.query ?? "Unknown";
      const kind = (q.types ?? "urn:entity:brand").split(":").pop()!;
      return ok([{ ...makeEntity(kind, query, 0, 1), name: `${query} (FIXTURE)`, entity_id: uuid(`search:${query}`) }]);
    }
    if (path === "/v2/audiences") {
      const t = q["filter.audience.types"];
      return ok({ audiences: AUDIENCES.filter(([, type]) => !t || t.split(",").includes(type)).map(([n, type]) => ({ entity_id: uuid(`aud:${n}`), name: n, type, id: `${type}:${n.toLowerCase().replace(/ /g, "_")}` })) });
    }
    if (path !== "/v2/insights") return { status: 404, body: { errors: [{ message: `fixture has no ${path}` }] } };

    const type = q["filter.type"];
    const signal = signalOf(q);
    const seed = `${signal.join(",")}|${q["filter.tags"] ?? ""}|${q["filter.location.query"] ?? ""}|${q.page ?? 1}`;
    const take = Math.min(Number(q.take ?? 20), 50);
    const pool = q["filter.results.entities"]?.split(",").filter(Boolean);
    const tagPool = q["filter.results.tags"]?.split(",").filter(Boolean);
    const aff = (i: number) => Math.round((0.95 - i * 0.008) * 1000) / 1000;

    if (pool) return ok({ entities: scorePool(pool, signal.join(",")).slice(0, take) });

    switch (type) {
      case "urn:entity:place": {
        const genres = (q["filter.tags"] ?? "").split(",").filter(Boolean);
        if (q["diversify.by"]) {
          const metros = METROS.slice(0, 16).sort((a, b) => rng(`${seed}${a.id}`)() - rng(`${seed}${b.id}`)());
          return ok({ entities: metros.flatMap((m, mi) => [0, 1, 2].map((k) => makePlace(`${seed}${m.id}`, k, m.query, genres[k % Math.max(genres.length, 1)], signal, aff(mi * 3 + k)))).slice(0, take) });
        }
        const isFestival = genres.length === 1 && genres[0].endsWith(":festival");
        return ok({
          entities: Array.from({ length: isFestival ? Math.min(take, 4) : take }, (_, i) => {
            const p = makePlace(seed, i, q["filter.location.query"], genres[i % Math.max(genres.length, 1)], signal, aff(i));
            return isFestival ? { ...p, name: `${name("festival", rng(`${seed}${i}`))} (FIXTURE)` } : p;
          }),
        });
      }
      case "urn:heatmap": {
        const metro = metroFor(q["filter.location.query"]) ?? METROS[0];
        const r = rng(seed);
        const cells: HeatmapCell[] = [];
        const hot: [number, number][] = [0, 1, 2].map(() => [metro.center[0] + (r() - 0.5) * 0.2, metro.center[1] + (r() - 0.5) * 0.3]);
        for (let a = -10; a <= 10; a++)
          for (let b = -10; b <= 10; b++) {
            const lat = metro.center[0] + a * 0.012;
            const lon = metro.center[1] + b * 0.016;
            const d = Math.min(...hot.map(([hl, ho]) => Math.hypot(lat - hl, (lon - ho) * 0.75)));
            const rank = Math.max(0, Math.min(1, 1 - d * 9 + (r() - 0.5) * 0.15));
            cells.push({ location: { latitude: lat, longitude: lon, geohash: `fx${a + 10}_${b + 10}` }, query: { affinity: rank, affinity_rank: rank, popularity: 0.3 + r() * 0.7 } });
          }
        return ok({ heatmap: cells });
      }
      case "urn:tag": {
        const types = (q["filter.tag.types"] ?? "").split(",");
        if (tagPool) {
          const r = rng(signal.join(","));
          return ok({ tags: tagPool.filter(() => r() > 0.15).map((id) => ({ id, name: id.split(":").pop()!.replace(/_/g, " "), subtype: id.split(":").slice(0, 4).join(":"), query: { affinity: r() } })).sort((a, b) => b.query.affinity - a.query.affinity) });
        }
        const r = rng(seed);
        const out: QlooTag[] = [];
        for (const t of types.length && types[0] ? types : ["urn:tag:theme:qloo"]) {
          const words = t.includes("theme") ? THEMES : t.includes("place") || t.includes("ambience") || t.includes("decor") ? PLACE_TAGS.map((x) => x[1]) : STYLE;
          for (const w of [...words].sort(() => r() - 0.5).slice(0, 8)) out.push({ id: `${t}:${w.toLowerCase().replace(/[^a-z]+/g, "_")}`, name: w, subtype: t, query: { affinity: 0.99 - out.length * 0.01 } });
        }
        return ok({ tags: out.slice(0, take) });
      }
      case "urn:demographics": {
        const r = rng(seed);
        const v = () => Math.round((r() - 0.5) * 60) / 100;
        return ok({ demographics: [{ entity_id: signal[0], query: { age: { "24_and_younger": v(), "25_to_29": v(), "30_to_34": v(), "35_to_44": v(), "45_to_54": v(), "55_and_older": v() }, gender: { male: v(), female: v() } } }] });
      }
      case "urn:audience":
        return ok({ entities: AUDIENCES.map(([n], i) => ({ entity_id: uuid(`aud:${n}`), name: n, types: "urn:audience", query: { affinity: aff(i) } })) });
      default: {
        const kind = (type ?? "urn:entity:brand").split(":").pop()!;
        return ok({ entities: Array.from({ length: take }, (_, i) => makeEntity(kind, seed, i, aff(i))) });
      }
    }
  }
}
