import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, readOrders, salesByCrowd, salesByPlace, salesLine, zip5, type Sales } from "@/lib/sales/orders";
import { placeZips } from "@/lib/sales/places";
import { readSales } from "@/lib/team/read";
import { staleRuns } from "@/lib/agent/outcomes";
import type { TeamState } from "@/lib/team/types";

// Sales from an orders export (PRD §23.6 i): only each order's date, total and ZIP are kept.

const HEADER = ["Name", "Email", "Created at", "Total", "Shipping Name", "Shipping Street", "Shipping Zip", "Shipping Phone"];
const COLS = { id: 0, date: 2, total: 3, zip: 6 };

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });
});

describe("zip5", () => {
  it("reads spreadsheet and ZIP+4 forms as five digits", () => {
    expect(zip5("'02139")).toBe("02139");
    expect(zip5("02139-4307")).toBe("02139");
    expect(zip5("2139")).toBe("02139");
    expect(zip5("")).toBeUndefined();
    expect(zip5("SW1A 1AA")).toBeUndefined();
  });
});

describe("readOrders", () => {
  const rows = [
    HEADER,
    ["#1001", "ada@example.com", "2026-03-02 10:00:00 -0500", "$58.00", "Ada Lovelace", "12 Main St", "'11211", "555-0101"],
    ["#1001", "", "2026-03-02 10:00:00 -0500", "", "", "", "", ""],
    ["#1002", "bo@example.com", "2026-04-11 09:30:00 -0400", "24.5", "Bo Diddley", "9 Elm Ave", "90026-1234", "555-0102"],
    ["#1003", "cy@example.com", "", "30", "Cy Young", "1 Oak Rd", "60622", "555-0103"],
  ];

  it("keeps only each order's date, total and ZIP", () => {
    const { orders } = readOrders(rows, COLS);
    expect(orders).toEqual([
      ["2026-03-02", 58, "11211"],
      ["2026-04-11", 24.5, "90026"],
    ]);
    const kept = JSON.stringify(orders);
    for (const gone of ["ada@example.com", "Ada Lovelace", "12 Main St", "555-0101", "#1001", "Bo Diddley"]) expect(kept).not.toContain(gone);
  });

  it("counts a multi-line order once and skips a row missing a field", () => {
    const { orders, skipped } = readOrders(rows, COLS);
    expect(orders).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(readOrders(rows, { date: 2, total: 3, zip: 6 }).skipped).toBe(2);
  });
});

const sales = (orders: Sales["orders"], places: Sales["places"], sample = false): Sales => ({ file: "orders.csv", at: 10, ...(sample ? { sample } : {}), orders, places });

describe("sales by place and by crowd", () => {
  const s = sales(
    [
      ["2026-01-01", 100, "11211"],
      ["2026-01-02", 50, "11222"],
      ["2026-01-03", 40, "90026"],
      ["2026-01-04", 30, "59715"],
      ["2026-01-05", 20, "00000"],
    ],
    { "11211": { metro: "nyc", name: "New York" }, "11222": { metro: "nyc", name: "New York" }, "90026": { metro: "la", name: "Los Angeles" }, "59715": { name: "Bozeman, MT" } },
  );

  it("sums by place, biggest first, with unplaced ZIPs together", () => {
    expect(salesByPlace(s).map((p) => [p.name, p.orders, p.revenue])).toEqual([
      ["New York", 2, 150],
      ["Los Angeles", 1, 40],
      ["Bozeman, MT", 1, 30],
      ["Other ZIPs", 1, 20],
    ]);
  });

  it("matches a crowd's Qloo metro names to the places, a shared city counting for both, near misses left out", () => {
    const crowds = [
      { id: "a", name: "A", cities: [{ metro: "New York City", name: "New York" }, { metro: "Bozeman Metro Area", name: "Bozeman" }] },
      { id: "b", name: "B", cities: [{ metro: "New York City", name: "New York" }, { metro: "Los Angeles", name: "Los Angeles" }] },
      { id: "c", name: "C", nearMiss: true, cities: [{ metro: "Los Angeles", name: "Los Angeles" }] },
    ];
    expect(salesByCrowd(s, crowds).map((c) => [c.crowd, c.orders, c.revenue])).toEqual([
      ["b", 3, 190],
      ["a", 3, 180],
    ]);
  });

  it("says in the prompt line when the file is sample data", () => {
    expect(salesLine(sales(s.orders, s.places, true))).toMatch(/^A sample orders file \(made-up data/);
    expect(salesLine(s)).toMatch(/^The founder's own orders export, 5 orders worth \$240 from 2026-01-01 to 2026-01-05\. By city: New York \$150/);
    expect(salesLine(sales([], {}))).toBeUndefined();
  });
});

describe("readSales", () => {
  it("keeps valid orders, only their three fields, and drops anything else", () => {
    const r = readSales({ file: "o.csv", at: 5, sample: true, orders: [["2026-01-01", 10, "11211"], ["Jan 1", 10, "11211"], ["2026-01-01", "10", "11211"], ["2026-01-01", 10, "1121"], ["2026-01-01", 10, "11211", "ada@example.com"]], places: { "11211": { metro: "nyc", name: "New York" }, x: 3 }, email: "ada@example.com" });
    expect(r).toEqual({ file: "o.csv", at: 5, sample: true, orders: [["2026-01-01", 10, "11211"], ["2026-01-01", 10, "11211"]], places: { "11211": { metro: "nyc", name: "New York" } } });
    expect(JSON.stringify(r)).not.toContain("ada@example.com");
    expect(readSales({ file: "o.csv", at: 5, orders: [] })).toBeUndefined();
    expect(readSales("nope")).toBeUndefined();
  });
});

describe("placeZips", () => {
  it("puts a ZIP in its metro, a crowd's own city by id, and else its own town", async () => {
    const p = await placeZips(["11211", "02139", "59715", "99999"], ["q~Bozeman~45.680,-111.040"]);
    expect(p["11211"]).toEqual({ metro: "nyc", name: "New York" });
    expect(p["02139"]).toEqual({ metro: "boston", name: "Boston" });
    expect(p["59715"]?.metro).toBe("q~Bozeman~45.680,-111.040");
    expect(p["99999"]).toBeUndefined();
    expect((await placeZips(["59715"], ["q~Bozeman"]))["59715"]).toEqual({ name: "Bozeman, MT" });
  }, 60_000);
});

describe("the sample orders file", () => {
  it("is made-up data that reads as orders, with no real customer in it", () => {
    const rows = parseCsv(readFileSync(join(process.cwd(), "public", "demo", "fishwife-sample-orders.csv"), "utf-8"));
    const h = rows[0];
    const { orders } = readOrders(rows, { date: h.indexOf("Created at"), total: h.indexOf("Total"), zip: h.indexOf("Shipping Zip"), id: h.indexOf("Name") });
    expect(orders.length).toBe(420);
    expect(rows.slice(1).every((r) => !r[1] || r[1].endsWith("@example.com"))).toBe(true);
  });
});

describe("staleness", () => {
  it("marks the Navigator and the Rep stale when sales arrive after their run", () => {
    const work = (agent: string) => ({ agent, at: 5, summary: "", items: [], calls: 0, ms: 0 });
    const team = { works: { navigator: work("navigator"), rep: work("rep"), scout: work("scout") }, outcomes: [], sales: sales([["2026-01-01", 10, "11211"]], {}) } as unknown as TeamState;
    const stale = staleRuns(team, 0).map((s) => s.agent);
    expect(stale).toContain("navigator");
    expect(stale).toContain("rep");
    expect(stale).not.toContain("scout");
  });
});
