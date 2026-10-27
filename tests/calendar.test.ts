import { describe, expect, it } from "vitest";
import { emptyJourney, type Journey } from "@/lib/journey/types";
import type { CrowdPage } from "@/lib/team/page";
import type { GrowthPlan, TeamState, Work } from "@/lib/team/types";
import type { PromoRead } from "@/lib/agent/promoter";
import { calendarEntries, calendarFile, icsOf } from "@/lib/workspace/calendar";
import { execPlan, rowTarget } from "@/lib/exec/plan";

// §23.6 g: the plan's dated things as an .ics. Only what the plan already dates goes in (events, their apply-by
// deadlines, moments, follow-ups when a pitch's wait runs out, a launch given as an exact date); the file is valid
// iCalendar, and rows link back to Execute Plan only where the feed is the founder's own.

const DAY = 24 * 60 * 60 * 1000;
const PITCHED = Date.UTC(2026, 9, 20, 15);

const event = (id: string, name: string, date: string, more: Partial<PromoRead["events"][number]> = {}) =>
  ({ id, name, kind: "festival", date, url: `https://example.com/${id}`, site: "example.com", metroId: "la", city: "Los Angeles", crowds: ["c1"], why: "Its crowd, in one place.", formats: ["booth"], ...more }) as PromoRead["events"][number];

const promo = {
  crowds: [{ id: "c1", name: "Coastal cooks" }],
  events: [
    event("event:smorgasburg", "Smorgasburg LA", "2026-11-15", { venue: "ROW DTLA", applyBy: "2026-11-01", applyUrl: "https://example.com/apply", fee: { text: "$150 a day", url: "https://example.com/fee", site: "example.com" } }),
    event("event:dropped", "Dropped fair", "2026-12-01"),
    event("event:undated", "Someday fair", "soon"),
  ],
  moments: [
    { id: "moment:tinned", name: "Tinned Fish Day", date: "2026-11-20", kind: "cultural", site: "nationaltoday.com", url: "https://example.com/tinned", why: "The day its crowd talks about it.", crowds: ["c1"] },
  ],
  brand: { name: "Brightland", product: "olive oil" },
  launch: { window: [30, 90], text: "in one to three months" },
} as unknown as PromoRead;

const pageOf = (names: [string, string][]): CrowdPage =>
  ({ at: 1, tabs: [], across: { sources: [], method: "", sections: [{ id: "list", title: "List", blocks: [{ type: "names", label: "", groups: [{ label: "", names: names.map(([item, name]) => ({ item, name, note: `${name}: loved by Coastal cooks` })) }] }] }] } }) as unknown as CrowdPage;

const plan = { headline: "Win Los Angeles first.", steps: [], disagreements: [], open: [], from: {}, at: 1 } as unknown as GrowthPlan;

const team = {
  goals: [],
  works: {
    rep: { page: pageOf([["venue:fig larder", "Fig Larder"]]) } as unknown as Work,
    promoter: { page: pageOf([["event:smorgasburg", "Smorgasburg LA"]]), shared: { promo } } as unknown as Work,
  },
  outcomes: [
    { item: "venue:fig larder", agent: "rep", kind: "venue", name: "Fig Larder", mark: "pitched", at: PITCHED },
    { item: "event:dropped", agent: "promoter", kind: "event", name: "Dropped fair", mark: "no", at: PITCHED },
  ],
  plan,
} as unknown as TeamState;

const saved = { journey: { ...emptyJourney(), team } as Journey };
const NOW = Date.UTC(2026, 9, 27);

describe("the founder's calendar (§23.6 g)", () => {
  const entries = calendarEntries(saved);

  it("holds only what the plan dates, earliest first", () => {
    expect(entries.map((e) => [e.date, e.title])).toEqual([
      ["2026-10-27", "Follow up: Fig Larder"],
      ["2026-11-01", "Apply by today: Smorgasburg LA"],
      ["2026-11-15", "Smorgasburg LA (Los Angeles)"],
      ["2026-11-20", "Tinned Fish Day (a moment for Brightland)"],
    ]);
  });

  it("leaves out a launch given as a window, an event marked no, and anything undated", () => {
    expect(entries.some((e) => /launch|Dropped|Someday/.test(e.title))).toBe(false);
    const dated = { ...promo, launch: { date: "2027-01-10", text: "January 10th" } } as PromoRead;
    const withLaunch = calendarEntries({ journey: { ...saved.journey, team: { ...team, works: { ...team.works, promoter: { ...team.works.promoter, shared: { promo: dated } } as unknown as Work } } } });
    expect(withLaunch.at(-1)).toMatchObject({ date: "2027-01-10", title: "Brightland launch", alarm: 14 });
  });

  it("puts a follow-up on the day the pitch's wait runs out", () => {
    const f = entries.find((e) => e.title.startsWith("Follow up"))!;
    expect(f.date).toBe(new Date(PITCHED + 7 * DAY).toISOString().slice(0, 10));
    expect(f.row).toBe("venue:fig larder");
  });

  it("gives each event its source and an apply-by reminder a week ahead", () => {
    const ev = entries.find((e) => e.title.startsWith("Smorgasburg"))!;
    expect(ev.lines).toContain("Where: ROW DTLA, Los Angeles");
    expect(ev.lines).toContain("Date from example.com: https://example.com/event:smorgasburg");
    const ap = entries.find((e) => e.title.startsWith("Apply by"))!;
    expect(ap).toMatchObject({ url: "https://example.com/apply", alarm: 7, row: "event:smorgasburg" });
    expect(ap.lines[0]).toBe("Applications close 14 days before Smorgasburg LA on November 15, 2026 in Los Angeles.");
  });

  it("writes valid iCalendar: CRLF, folded at 75 octets, escaped text, all-day dates", () => {
    const ics = calendarFile(saved, { base: "https://athena.example", now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = ics.split("\r\n");
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.filter((l) => l === "BEGIN:VEVENT").length).toBe(4);
    expect(lines.filter((l) => l === "END:VEVENT").length).toBe(4);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261115\r\nDTEND;VALUE=DATE:20261116");
    expect(unfolded).toContain("Fee: $150 a day (https://example.com/fee)");
    expect(unfolded).toContain("Where: ROW DTLA\\, Los Angeles");
    expect(unfolded).toContain("TRIGGER:-P7D");
    expect(unfolded).toContain("Open in Athena: https://athena.example/plan?tab=executive&item=event%3Asmorgasburg");
    expect(unfolded).toContain("X-WR-CALNAME:Brightland · Athena");
  });

  it("links no rows where the feed isn't the founder's own, and is valid when empty", () => {
    expect(calendarFile(saved, { now: NOW })).not.toContain("Open in Athena");
    const empty = icsOf([], { name: "Your brand", now: NOW });
    expect(empty).toContain("BEGIN:VCALENDAR");
    expect(empty).not.toContain("BEGIN:VEVENT");
    expect(calendarFile({})).toContain("X-WR-CALNAME:Your brand · Athena");
  });
});

describe("calendar entry ids and replaced links", () => {
  it("keeps one kind prefix in each UID, so an app updates the entry in place", () => {
    const uids = calendarEntries(saved).map((e) => e.uid);
    expect(uids).toContain("event-smorgasburg@athena");
    expect(uids).toContain("moment-tinned@athena");
    expect(uids).toContain("apply-event-smorgasburg@athena");
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("names a replaced link's calendar so the founder knows where the current one is", () => {
    const ics = icsOf([], { name: "Your brand", replaced: true, now: NOW });
    expect(ics).toContain("X-WR-CALNAME:Athena: this link was replaced");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("Open in Athena (§23.6 g)", () => {
  const plan = execPlan(team);

  it("opens a row on its owner's tab", () => {
    expect(rowTarget(plan, "venue:fig larder")).toEqual({ tab: "rep", id: "venue:fig larder" });
    expect(rowTarget(plan, "event:smorgasburg")).toEqual({ tab: "promoter", id: "event:smorgasburg" });
  });

  it("opens nothing for an id the plan doesn't hold", () => {
    expect(rowTarget(plan, "venue:gone")).toBeUndefined();
  });
});
