"use client";

import { useMemo } from "react";
import { ExecutivePlan } from "./Executive";
import { RefsProvider } from "./Refs";
import { refsFor } from "@/lib/refs";
import type { TeamLive } from "./Team";
import type { TeamState } from "@/lib/team/types";

// The team's view-only Execute Plan (PRD §23.6 k): the founder's page in the same design, with nothing to start, edit
// or ask. Nothing runs here, so the live state is always idle.

const idle: TeamLive = { status: {}, lines: {}, replies: {}, asks: [], answers: {}, asked: {}, running: 0, held: {}, blocking: {} };
const none = () => {};

export function ShareView({ team, brand, budget }: { team: TeamState; brand: string; budget?: string }) {
  // Names link to where they came from here too (§23.8 c), from what the team found; nothing opens a subagent.
  const refs = useMemo(() => refsFor({ team }), [team]);
  return (
    <RefsProvider refs={refs}>
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
    </RefsProvider>
  );
}
