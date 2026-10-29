import "server-only";
import type { BrandBrief } from "@/lib/brief/types";
import type { Journey } from "@/lib/journey/types";
import type { TeamState } from "@/lib/team/types";
import { resolveLink } from "./links";
import { readSnapshot } from "./server";
import { DEMO_WS, readDemo } from "./demo";

// Share with your team (PRD §23.6 k): a link to a view-only Execute Plan for co-founders or advisors. The link is its
// own scope ("share"), so it opens this page and nothing else: never the MCP server, never the calendar feed. It reads
// the workspace the browser mirrors (§23.6 a), so the page follows the plan as it changes. New link revokes the old
// one. The Fishwife demo's fixed link opens the seeded sample here too, so a judge can see the team's view.

export type Shared =
  | { kind: "plan"; brand: string; budget?: string; team: TeamState; sample?: boolean }
  | { kind: "waiting"; brand: string }
  | { kind: "replaced" };

type Saved = { brief?: BrandBrief; journey?: Journey };

export async function sharedPlan(secret: string): Promise<Shared> {
  const meta = await resolveLink(secret);
  if (!meta || !(meta.scope === "share" || meta.ws === DEMO_WS)) return { kind: "replaced" };
  const saved = (await (meta.ws === DEMO_WS ? readDemo() : readSnapshot(meta.ws)))?.saved as Saved | undefined;
  const team = saved?.journey?.team;
  const brand = saved?.brief?.name?.value || team?.works.promoter?.shared?.promo?.brand.name || "Your brand";
  if (!team?.plan) return { kind: "waiting", brand };
  // The undo copy is the founder's own, and each subagent's `shared` is what it hands the next one (the brand name above
  // is read from it): nothing on the team's page reads either, and together they're a fifth of what the page would send.
  const { previous: _undo, ...kept } = team;
  const works = Object.fromEntries(Object.entries(kept.works).map(([k, w]) => {
    if (!w) return [k, w];
    const { shared: _handoff, ...own } = w;
    return [k, own];
  })) as TeamState["works"];
  const rest = { ...kept, works };
  const budget = saved?.journey?.inputs?.input_budget || undefined;
  return { kind: "plan", brand, ...(budget ? { budget } : {}), team: rest, ...(meta.ws === DEMO_WS ? { sample: true } : {}) };
}
