import { describe, expect, it } from "vitest";
import { nameNeighbourhoods } from "@/lib/enrich/neighbourhoods";
import type { HeatmapCell } from "@/lib/qloo/types";

const cell = (lat: number, lon: number, rank: number): HeatmapCell => ({ location: { latitude: lat, longitude: lon, geohash: "" }, query: { affinity: 0.5, affinity_rank: rank, popularity: 0.5 } });

describe("neighbourhood names (§9.4, Overture)", () => {
  const rows: [string, number, number, 0 | 1][] = [
    ["Silver Lake", 34.087, -118.27, 1],
    ["Echo Park", 34.078, -118.26, 1],
    ["Sunset Villas Apartments", 34.2, -118.4, 0],
    ["Sun Valley", 34.2, -118.39, 0],
  ];
  it("scores by mean affinity rank, needs ≥ 3 cells, and prefers linked names", () => {
    const cells = [cell(34.087, -118.271, 0.9), cell(34.088, -118.27, 0.8), cell(34.086, -118.27, 0.9), cell(34.078, -118.26, 0.5), cell(34.079, -118.26, 0.5), cell(34.077, -118.26, 0.5), cell(34.2, -118.4, 0.99), cell(34.2, -118.4, 0.99), cell(34.2, -118.4, 0.99)];
    const out = nameNeighbourhoods(rows, cells)!;
    expect(out.map((n) => n.name)).toEqual(["Sun Valley", "Silver Lake", "Echo Park"]);
    expect(out.every((n) => n.source === "Overture")).toBe(true);
  });
  it("returns null with no cells or nothing nearby", () => {
    expect(nameNeighbourhoods(rows, [])).toBeNull();
    expect(nameNeighbourhoods(rows, [cell(40, -74, 1), cell(40, -74, 1), cell(40, -74, 1)])).toBeNull();
  });
});
