import { describe, expect, it } from "vitest";
import { addEvent, lineDetail, lineText, settleRun, type Line } from "@/lib/agent/transcript";
import type { AgentEvent } from "@/lib/blocks/types";

// Onboarding's live transcript (PRD §23.2 step 7.2d): a step updates its own line, pages nest under their site, the
// bookkeeping stays out, and a run that ends leaves nothing spinning.

const ev = (tool: string, why: string, status: AgentEvent["status"], more: Partial<AgentEvent> = {}): AgentEvent => ({ t: 0, tool, why, status, callIds: [], summary: "", ...more });
const feed = (events: AgentEvent[], run = 1, lines: Line[] = []) => events.reduce((l, e) => addEvent(l, e, run), lines);

describe("the transcript", () => {
  it("a step's later events update its line in place, and bookkeeping never shows", () => {
    const lines = feed([
      ev("today", "Checking the date", "ok"),
      ev("update_plan", "Planning", "ok"),
      ev("think", "Thinking about the site", "running"),
      ev("quick_brief", "Writing a first brief", "running"),
      ev("quick_brief", "Writing a first brief", "ok", { line: "Wrote a first brief from the home and About pages" }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lineText(lines[0].ev)).toBe("Wrote a first brief from the home and About pages");
  });

  it("the same step run again later is a new line", () => {
    const lines = feed([ev("qloo_search", "Finding you in Qloo", "running"), ev("qloo_search", "Finding you in Qloo", "ok"), ev("qloo_search", "Finding you in Qloo", "running")]);
    expect(lines.map((l) => l.ev.status)).toEqual(["ok", "running"]);
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
  });

  it("each page nests under its site, updated by its address, and the site folds to one line", () => {
    const site = "Reading tidepooltins.example";
    const page = (url: string, status: AgentEvent["status"], line?: string) => ev("read_page", `Reading ${url}`, status, { under: site, source: { label: url, url }, line });
    const lines = feed([
      ev("read_website", site, "running"),
      page("https://tidepooltins.example/", "running"),
      page("https://tidepooltins.example/about", "running"),
      page("https://tidepooltins.example/", "ok", "Read the home page: tinned fish from Maine"),
      ev("read_file", "Reading line-sheet.xlsx", "running"),
      ev("read_website", site, "ok", { line: "Read 2 pages of tidepooltins.example" }),
    ]);
    expect(lines.map((l) => l.ev.tool)).toEqual(["read_website", "read_file"]);
    expect(lines[0].pages.map((p) => [p.ev.source?.url, p.ev.status])).toEqual([
      ["https://tidepooltins.example/", "ok"],
      ["https://tidepooltins.example/about", "running"],
    ]);
    // A page whose site isn't in this run stands on its own rather than vanishing.
    expect(feed([page("https://tidepooltins.example/faq", "ok")], 2, lines)).toHaveLength(3);
  });

  it("a finished run drops what never finished, its own lines only", () => {
    const one = feed([ev("web_search", "Looking you up on the web", "running"), ev("read_website", "Reading a.example", "running"), ev("read_page", "Reading a.example/x", "running", { under: "Reading a.example" })]);
    const both = feed([ev("check", "Checking the brief", "running")], 2, one);
    const settled = settleRun(both, 1);
    expect(settled.map((l) => l.ev.tool)).toEqual(["check"]);
    const kept = settleRun(feed([ev("read_page", "Reading a.example/y", "ok", { under: "Reading a.example" })], 1, feed([ev("read_website", "Reading a.example", "ok")], 1)), 1);
    expect(kept[0].pages).toHaveLength(1);
  });

  it("the detail under a line is its summary, unless the line already says it", () => {
    expect(lineDetail(ev("compare", "x", "ok", { summary: "2 disagreements", line: "Compared everything: 2 disagreements" }))).toBe("");
    expect(lineDetail(ev("compare", "x", "ok", { summary: "Price and city", line: "Compared everything" }))).toBe("Price and city");
    expect(lineDetail(ev("compare", "x", "error", { summary: "boom" }))).toBe("");
    expect(lineText(ev("compare", "Putting it all together", "running", { line: "done" }))).toBe("Putting it all together");
  });
});
