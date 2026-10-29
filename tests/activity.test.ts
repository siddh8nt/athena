import { describe, expect, it } from "vitest";
import { moments, pillLine, pops } from "@/lib/team/activity";

const working = (step = "Measuring") => ({ state: "working" as const, step });

describe("the status pill (§23.10 a)", () => {
  it("puts a waiting question first", () => {
    expect(pillLine({ analyst: working() }, { asking: true, exec: false })).toEqual({ tone: "ask", text: "Athena needs you" });
  });

  it("names the one working, counts several, and says when the team is idle", () => {
    expect(pillLine({ analyst: working() }, { asking: false, exec: false }).text).toBe("The Analyst is working");
    expect(pillLine({ athena: working() }, { asking: false, exec: false }).text).toBe("Athena is working");
    expect(pillLine({}, { asking: false, exec: true }).text).toBe("The Executive is working");
    expect(pillLine({ athena: working(), analyst: working(), navigator: { state: "done", last: "x" } }, { asking: false, exec: true }).text).toBe("3 working");
    expect(pillLine({ analyst: { state: "done", last: "Ranked 3 crowds" } }, { asking: false, exec: false })).toEqual({ tone: "idle", text: "Team idle" });
  });
});

describe("what pops up (§23.10 b)", () => {
  it("finds a start and a finish, and not a resume after waiting", () => {
    expect(moments({}, { analyst: working() })).toEqual([{ kind: "start", id: "analyst" }]);
    expect(moments({ analyst: { state: "done", last: "x" } }, { analyst: working("Updating: the crowds changed") })).toEqual([{ kind: "start", id: "analyst" }]);
    expect(moments({ analyst: working() }, { analyst: { state: "done", last: "Ranked 3 crowds" } })).toEqual([{ kind: "done", id: "analyst" }]);
    expect(moments({ analyst: { state: "waiting", reason: "your answer" } }, { analyst: working() })).toEqual([]);
    expect(moments({ analyst: working("a") }, { analyst: working("b") })).toEqual([]);
    expect(moments({ athena: working() }, { athena: { state: "done", last: "Answered" } })).toEqual([]);
  });

  it("never pops on the page it concerns, and a start never on the dashboard", () => {
    expect(pops({ kind: "start", id: "navigator" }, "dashboard")).toBe(false);
    expect(pops({ kind: "start", id: "navigator" }, "navigator")).toBe(false);
    expect(pops({ kind: "start", id: "navigator" }, "analyst")).toBe(true);
    expect(pops({ kind: "done", id: "analyst" }, "dashboard")).toBe(true);
    expect(pops({ kind: "done", id: "analyst" }, "analyst")).toBe(false);
  });
});
