import type { CategoryId } from "./config";

// Brands confirmed to exist in Qloo on 8 Oct, per category. When a brand isn't in Qloo and the LLM's
// suggested comparables aren't either (Graza, Fly By Jing, Omsom and Fishwife all aren't), these and
// their Qloo peers form the pool the agent chooses comparables from, so a plan always has a taste signal.
export const CATEGORY_ANCHORS: Record<CategoryId, string[]> = {
  G1: ["Brightland", "Siete Family Foods", "Primal Kitchen"],
  G2: ["MUD\WTR", "Ghia", "Liquid Death"],
  G3: ["Juniper Ridge", "Glossier", "Saie"],
  G4: ["Great Jones", "Material", "Our Place", "Parachute"],
  G5: ["Mara Hoffman", "Everlane"],
  G6: ["WTHN", "Hims", "Ritual"],
  G7: ["BarkBox", "Wild One"],
  G8: ["Lovevery", "Hatch"],
  T1: ["Master & Dynamic", "Sonos", "Marshall Headphones"],
  T2: ["Peak Design", "Nomad"],
  T3: ["Peloton"], // no personal-mobility brand found in Qloo on 8 Oct (VanMoof, Lime missing)
  A1: ["Timeleft", "Meetup", "Bumble"],
  A2: ["ClassPass", "Peloton"],
  A3: ["Spotify", "Calm"],
  A4: [],
  L1: ["Blue Bottle Coffee", "Sweetgreen"],
};
