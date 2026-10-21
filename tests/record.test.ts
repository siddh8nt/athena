import { describe, expect, it } from "vitest";
import { buildRecord, duration, recordLine } from "@/lib/agent/record";
import type { Line } from "@/lib/agent/transcript";
import type { AgentEvent } from "@/lib/blocks/types";

const ev = (tool: string, why: string, more: Partial<AgentEvent> = {}): AgentEvent => ({ t: 0, tool, why, status: "ok", callIds: [], summary: "", ...more });
const line = (key: string, e: AgentEvent, pages: Line[] = []): Line => ({ key, run: 1, ev: e, pages });

describe("onboarding's record for the team chat", () => {
  const lines: Line[] = [
    line("you", ev("you", "We make tinned fish", { found: ["deck.pdf"] })),
    line("a", ev("read_site", "Reading fishwife.com", { line: "Read fishwife.com" }), [
      line("a1", ev("read_page", "Home", { source: { label: "Home", url: "https://fishwife.com/" } })),
      line("a2", ev("read_page", "About", { source: { label: "About", url: "https://fishwife.com/about" } })),
      line("a3", ev("read_page", "Home again", { source: { label: "Home", url: "https://fishwife.com/" } })),
    ]),
    line("later", ev("you", "Focus on the US")),
    line("b", ev("brief", "Wrote your brief")),
  ];

  it("keeps what the founder gave, every step with its pages, and each source once", () => {
    const r = buildRecord(lines, { facts: 42, conflicts: 2 }, 100.4)!;
    expect(r.intake).toEqual({ text: "We make tinned fish", files: ["deck.pdf"] });
    expect(r.steps.map((s) => s.text)).toEqual(["Read fishwife.com", "You added: Focus on the US", "Wrote your brief"]);
    expect(r.steps[0].subs).toHaveLength(3);
    expect(r.sources.map((s) => s.url)).toEqual(["https://fishwife.com/", "https://fishwife.com/about"]);
    // A page read twice counts once.
    expect(r.pages).toBe(2);
    expect(recordLine(r)).toBe("2 pages read · 1 file · 42 facts · 2 disagreements settled · 1m 40s");
  });

  it("keeps a step a re-run says again once, at its latest, with the pages the first read", () => {
    const again: Line[] = [...lines, line("a-2", ev("read_site", "Reading fishwife.com", { line: "Read fishwife.com" }), [line("a1-2", ev("read_page", "Home", { source: { label: "Home", url: "https://fishwife.com/" } }))])];
    const r = buildRecord(again, { facts: 1, conflicts: 0 }, 5)!;
    expect(r.steps.map((s) => s.text)).toEqual(["You added: Focus on the US", "Wrote your brief", "Read fishwife.com"]);
    expect(r.steps.at(-1)!.subs).toHaveLength(3);
    expect(r.pages).toBe(2);
  });

  it("is nothing when nothing ran", () => {
    expect(buildRecord([lines[0]], { facts: 0, conflicts: 0 }, 0)).toBeUndefined();
  });

  it("says durations plainly", () => {
    expect(duration(48)).toBe("48s");
    expect(duration(120)).toBe("2m");
  });
});
