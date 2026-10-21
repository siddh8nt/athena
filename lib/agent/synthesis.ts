import type { SpecialistId } from "./specialists";
import type { GrowthPlan, PlanLine, Work } from "@/lib/team/types";

// What the view of Athena's plan needs (§23.5 m), kept client-safe: the plan itself is written server-side, in
// athena-plan.ts, from the subagents' saved results.

export const KIND_LABEL: Record<PlanLine["kind"], string> = { who: "Who", where: "Where", through: "Through", words: "The words", when: "When", cost: "Cost" };

/** The plan is out of date when a subagent it read has run again since. */
export const planStale = (plan: GrowthPlan, works: Partial<Record<SpecialistId, Work>>) => Object.entries(works).some(([id, w]) => w && plan.from[id as SpecialistId] !== undefined && w.at > (plan.from[id as SpecialistId] ?? 0));
