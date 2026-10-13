import { describe, expect, it } from "vitest";
import { benchLine, benchPrimaries, benchTable } from "@/lib/bench/lines";

// The Bench line under each measured stop (§10.6, §13.2) must always carry Gemini's number.

describe("Bench lines", () => {
  it("carries every arm, Gemini alone included, for each task", () => {
    for (const t of ["t1", "t2", "t3"] as const) {
      const line = benchLine(t)!;
      expect(line.text).toContain("Gemini alone");
      expect(line.text).toContain("popularity");
      expect(line.text).toContain(line.gemini.toFixed(2));
    }
    expect(benchLine("t1")!.text).toContain("one raw Qloo call");
    expect(benchLine("t3")!.text).not.toContain("one raw Qloo call");
  });

  it("reads the five registered primaries with their verdicts", () => {
    const p = benchPrimaries();
    expect(p).toHaveLength(5);
    expect(p.filter((x) => x.pass)).toHaveLength(4);
    expect(benchTable()).toHaveLength(3);
  });
});
