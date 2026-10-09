import type { Motion } from "@/lib/playbook/config";

// Growth types (PRD §7.8): the founder's choice of how to grow, up to 3. Motions stay inside the code; each growth
// type maps onto motions and onto the journey's stops. Pure code, shared by the client and the tests.

export type Channel = "online" | "offline" | "both";
export type GrowthType = "deepen" | "new_city" | "new_crowd" | "borrow" | "show_up" | "online" | "own_location";
export type StopId = "product" | "growth" | "crowd" | "where" | "places" | "retailers" | "partners" | "online" | "message" | "moments" | "go";

export const MAX_PICKS = 3;

type Def = {
  label: string;
  /** The label an online brand sees, where it differs. */
  onlineLabel?: string;
  question: string;
  motions: Motion[];
  stops: StopId[];
  /** ⭐ for these channels. */
  suggestedFor: Channel[];
  beta?: boolean;
};

export const GROWTH: Record<GrowthType, Def> = {
  deepen: { label: "Deepen", onlineLabel: "Get into stores", question: "Get into more places in my city, and into bigger retailers", motions: ["venue", "retail"], stops: ["where", "places", "retailers"], suggestedFor: ["offline"] },
  new_city: { label: "New city", question: "Where should I expand next?", motions: ["city_launch"], stops: ["where", "places"], suggestedFor: ["offline"] },
  new_crowd: { label: "New crowd", question: "Who else would love this?", motions: ["partnership"], stops: ["message"], suggestedFor: [] },
  borrow: { label: "Borrow a crowd", question: "Who should I collab with?", motions: ["partnership"], stops: ["partners"], suggestedFor: ["online"] },
  show_up: { label: "Show up", question: "Which events and moments?", motions: [], stops: ["moments"], suggestedFor: [] },
  online: { label: "Online", question: "Who do I target online, and with what?", motions: ["online"], stops: ["online", "message"], suggestedFor: ["online"] },
  own_location: { label: "Own location", question: "Where do I open a store?", motions: ["location_opening"], stops: ["where", "places"], suggestedFor: [], beta: true },
};

export const GROWTH_ORDER: GrowthType[] = ["deepen", "new_city", "new_crowd", "borrow", "show_up", "online", "own_location"];

export function labelFor(g: GrowthType, channel?: Channel): string {
  return channel === "online" && GROWTH[g].onlineLabel ? GROWTH[g].onlineLabel! : GROWTH[g].label;
}

/** Cards in the order the founder sees them: suggested for their channel first, nothing hidden (§7.8). */
export function orderFor(channel: Channel | undefined): GrowthType[] {
  const starred = (g: GrowthType) => !!channel && (GROWTH[g].suggestedFor.includes(channel) || (channel === "both" && GROWTH[g].suggestedFor.length > 0));
  return [...GROWTH_ORDER].sort((a, b) => Number(starred(b)) - Number(starred(a)));
}

export type Facts = {
  channel?: Channel;
  /** Stockists or a home city: something to deepen. */
  hasPresence: boolean;
  /** A physical product or service: something a store could sell or a site could host. */
  physical: boolean;
};

/** Why an option is greyed out, or undefined when it's open (§7.8 prerequisites). */
export function blockedReason(g: GrowthType, f: Facts): string | undefined {
  if (g === "deepen" && !f.hasPresence) return f.channel === "online" ? undefined : "Pick New city first: there's nowhere to deepen yet.";
  if (g === "own_location" && !f.physical) return "Needs a physical product or service.";
  return undefined;
}

/** Athena's pre-selection: 1–2 suggested types that are open (§6.2.1 step 5). */
export function suggest(f: Facts): GrowthType[] {
  const open = orderFor(f.channel).filter((g) => !blockedReason(g, f));
  const starred = open.filter((g) => f.channel && (GROWTH[g].suggestedFor.includes(f.channel) || (f.channel === "both" && GROWTH[g].suggestedFor.length > 0)));
  return (starred.length ? starred : open).slice(0, 2);
}

/** The one decision a combination needs (§7.8), or none. */
export type Decision = { id: "first_city" | "which_crowd"; text: string; for?: GrowthType[] };
export function decisionsFor(picks: GrowthType[]): Decision[] {
  const out: Decision[] = [];
  if (picks.includes("deepen") && picks.includes("new_city")) out.push({ id: "first_city", text: "Which city comes first: your home city, or the new one?" });
  if (picks.includes("new_crowd")) {
    const others = picks.filter((g) => g !== "new_crowd");
    if (others.length) out.push({ id: "which_crowd", text: "Should these target your current crowd or the new one?", for: others });
  }
  return out;
}

/** Plain-words note when the founder picks more than 3; it never blocks (§7.8). */
export function spreadNote(picks: GrowthType[]): string | undefined {
  return picks.length > MAX_PICKS ? `That's ${picks.length} directions at once. For a young brand, ${MAX_PICKS} is plenty: the plan gets thin past that. You can still go ahead.` : undefined;
}

const STOP_ORDER: StopId[] = ["where", "places", "retailers", "partners", "online", "message", "moments"];

/**
 * The journey's stops (§6.2.2): product and growth first, then the crowd, then each pick's stops merged in pick
 * order (the first pick leads), each once, then Go.
 */
export function stopsFor(picks: GrowthType[]): StopId[] {
  const out: StopId[] = ["product", "growth", "crowd"];
  for (const g of picks) for (const s of GROWTH[g].stops) if (!out.includes(s)) out.push(s);
  if (picks.length === 0) for (const s of STOP_ORDER) if (!out.includes(s)) out.push(s);
  return [...out, "go"];
}

/** Motions for the plan engine, first pick leading. */
export function motionsFor(picks: GrowthType[]): Motion[] {
  return [...new Set(picks.flatMap((g) => GROWTH[g].motions))];
}

export const STOP_LABELS: Record<StopId, string> = {
  product: "Product",
  growth: "How to grow",
  crowd: "Crowd",
  where: "Where",
  places: "Places",
  retailers: "Next retailers",
  partners: "Partners",
  online: "Online",
  message: "Message",
  moments: "Moments",
  go: "Go",
};
