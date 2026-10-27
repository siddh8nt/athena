"use client";

import { ExecutivePlan } from "./Executive";
import type { TeamLive } from "./Team";
import type { TeamState } from "@/lib/team/types";

// The team's view-only Execute Plan (PRD §23.6 k): the founder's page in the same design, with nothing to start, edit
// or ask. Nothing runs here, so the live state is always idle.

const idle: TeamLive = { status: {}, lines: {}, replies: {}, asks: [], answers: {}, asked: {}, running: 0, held: {}, blocking: {} };
const none = () => {};

export function ShareView({ team, brand, budget }: { team: TeamState; brand: string; budget?: string }) {
  return (
    <ExecutivePlan
      readOnly
      team={team}
      live={idle}
      brand={brand}
      budget={budget}
      running={false}
      onStart={none}
      onOpened={none}
      onStartAnyway={none}
      onAsk={none}
      onOpen={none}
      onUpdatePlan={none}
      onRewritePlan={none}
      onBringBack={none}
    />
  );
}
