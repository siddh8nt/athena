import { describe, expect, it } from "vitest";
import { asOfFrom, dated, parseAsOf, runAt, seasonOf, timeContext, timePrompt, timeSummary, today } from "@/lib/time/now";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const dateOf = (iso: string, name: string) => timeContext(at(iso), 20).moments.find((m) => m.name === name)?.date;

describe("retail moments", () => {
  it("computes rule-based dates", () => {
    expect(dateOf("2026-01-02", "Easter")).toBe("2026-04-05");
    expect(dateOf("2026-01-02", "Mother's Day")).toBe("2026-05-10");
    expect(dateOf("2026-01-02", "Memorial Day")).toBe("2026-05-25");
    expect(dateOf("2026-01-02", "Labor Day")).toBe("2026-09-07");
    expect(dateOf("2026-10-14", "Thanksgiving")).toBe("2026-11-26");
    expect(dateOf("2026-10-14", "Black Friday")).toBe("2026-11-27");
    expect(dateOf("2026-10-14", "Cyber Monday")).toBe("2026-11-30");
    expect(dateOf("2027-01-02", "Easter")).toBe("2027-03-28");
  });

  it("lists only coming moments, soonest first, rolling into next year", () => {
    const t = timeContext(at("2026-12-26"));
    expect(t.moments[0]).toEqual({ name: "New Year's Day", date: "2027-01-01", days: 6 });
    expect(t.moments.every((m, i, a) => m.days >= 0 && (i === 0 || a[i - 1].days <= m.days))).toBe(true);
  });

  it("counts a moment that is today", () => {
    expect(timeContext(at("2026-10-31")).moments[0]).toEqual({ name: "Halloween", date: "2026-10-31", days: 0 });
  });
});

describe("the run date", () => {
  it("gives a different timing for a different date", () => {
    const oct = timePrompt(timeContext(at("2026-10-14")));
    const apr = timePrompt(timeContext(at("2027-04-20")));
    expect(oct).toContain("Today is Wednesday, 2026-10-14. It is autumn");
    expect(oct).toContain("Halloween 2026-10-31 (17 days)");
    expect(apr).toContain("It is spring");
    expect(apr).toContain("Mother's Day 2027-05-09");
    expect(timeSummary(timeContext(at("2026-10-14")))).toBe("Wednesday 14 Oct 2026, autumn. Next: Halloween in 17 days, Thanksgiving in 43 days, Black Friday in 44 days");
  });

  it("seasons", () => {
    expect(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10", "2026-12-10"].map((d) => seasonOf(at(d)))).toEqual(["winter", "spring", "summer", "autumn", "winter"]);
  });

  it("accepts only real dates near today", () => {
    expect(parseAsOf("2026-02-30")).toBeUndefined();
    expect(parseAsOf("1999-01-01")).toBeUndefined();
    expect(parseAsOf("tomorrow")).toBeUndefined();
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(parseAsOf(soon)?.toISOString().slice(0, 10)).toBe(soon);
  });

  it("pins the date for everything a run awaits, streams included", async () => {
    const pinned = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const handler = dated(async () => {
      await new Promise((r) => setTimeout(r, 5));
      const stream = new ReadableStream<string>({
        async start(c) {
          await new Promise((r) => setTimeout(r, 5));
          c.enqueue(today());
          c.close();
        },
      });
      return stream.getReader().read();
    });
    const read = await handler(new Request(`http://x/api/plan?asOf=${pinned}`));
    expect(read.value).toBe(pinned);
    expect(asOfFrom(new Request("http://x/", { headers: { "x-athena-as-of": pinned } }))?.toISOString().slice(0, 10)).toBe(pinned);
    expect(runAt(undefined, () => today())).toBe(new Date().toISOString().slice(0, 10));
  });
});
