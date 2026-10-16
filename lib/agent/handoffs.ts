import type { SpecialistId } from "./specialists";
import type { Work } from "@/lib/team/types";

// Handoffs between the specialists (PRD §23.2 step 8.3b): each result offers the next agent's work, started with
// what it came from. One owner per feature; a handoff passes the crowd or the city on, never a copy of the work.

export type Focus = { crowd?: string; next?: string; city?: string };
export type Handoff = { to: SpecialistId; label: string; focus: Focus };

type Ref = { id: string; name: string };

/** On a crowd the Analyst ranked: where it lives (Navigator), and winning it next (Scout). */
export function fromCrowd(crowd: Ref, winFirst: boolean): Handoff[] {
  return [
    { to: "navigator", label: `Find where ${crowd.name} lives`, focus: { crowd: crowd.id } },
    winFirst
      ? { to: "scout", label: `Find the crowd to win after ${crowd.name}`, focus: { crowd: crowd.id } }
      : { to: "scout", label: `Win ${crowd.name} next`, focus: { next: crowd.id } },
  ];
}

/** On a city the Navigator chose: its shops (Rep) and its events (Promoter). */
export function fromCity(city: Ref): Handoff[] {
  return [
    { to: "rep", label: `Find shops in ${city.name}`, focus: { city: city.id } },
    { to: "promoter", label: `Find events in ${city.name}`, focus: { city: city.id } },
  ];
}

/** What each finished run hands on, for its buttons and for Athena's suggestion in the chat. */
export function fromWork(work: Work, crowdId: (name: string) => string | undefined): Handoff[] {
  if (work.agent === "navigator") {
    const city = work.shared?.city ?? work.results.filter((r) => r.kind === "city" && r.ref).map((r) => ({ id: r.ref!, name: r.name }))[0];
    return city ? fromCity(city) : [];
  }
  if (work.agent === "scout") {
    const name = work.shared?.crowd;
    const id = name ? crowdId(name) : undefined;
    if (!name) return [];
    // A crowd measured since (its id unknown here) still hands on; the next run reads the team's current crowd.
    const focus = id ? { crowd: id } : {};
    return [
      { to: "matchmaker", label: `Find partners who reach ${name}`, focus },
      { to: "promoter", label: `Find where ${name} gathers`, focus },
    ];
  }
  if (work.agent === "matchmaker" && work.results.some((r) => r.kind === "partner")) return [{ to: "promoter", label: "Find an event to co-host with a partner", focus: {} }];
  return [];
}
