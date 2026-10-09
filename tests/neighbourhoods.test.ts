import { describe, expect, it } from "vitest";
import { nameNeighbourhoods } from "@/lib/enrich/neighbourhoods";
import type { HeatmapCell } from "@/lib/qloo/types";
import type { PlaceRow } from "@/lib/places/data";

const cell = (lat: number, lon: number, rank: number): HeatmapCell => ({ location: { latitude: lat, longitude: lon, geohash: "" }, query: { affinity: 0.5, affinity_rank: rank, popularity: 0.5 } });

describe("neighbourhood names (§9.4, Overture)", () => {
  const row = (name: string, lat: number, lon: number, wd: 0 | 1): PlaceRow => [name, "n", "CA", 0, wd, "Los Angeles", "", lat, lon, 0];
  const rows: PlaceRow[] = [row("Silver Lake", 34.087, -118.27, 1), row("Echo Park", 34.078, -118.26, 1), row("Sunset Villas Apartments", 34.2, -118.4, 0), row("Sun Valley", 34.2, -118.39, 0)];
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
  it("a state-wide heatmap names towns, not neighbourhoods", () => {
    const towns: PlaceRow[] = [["Columbus", "l", "OH", 905748, 1, "", "Franklin County", 39.96, -83.0, 0], ["Cleveland", "l", "OH", 372624, 1, "", "Cuyahoga County", 41.5, -81.69, 0], ["Tiny", "l", "OH", 300, 0, "", "", 40.5, -82.0, 0]];
    const cells = [cell(39.96, -83.0, 0.9), cell(39.97, -83.01, 0.9), cell(41.5, -81.69, 0.4), cell(41.51, -81.7, 0.4), cell(40.5, -82.0, 0.99), cell(40.5, -82.0, 0.99)];
    expect(nameNeighbourhoods(towns, cells)!.map((n) => n.name)).toEqual(["Columbus", "Cleveland"]);
  });
});
