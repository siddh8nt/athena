import { describe, expect, it, vi, beforeEach } from "vitest";

// The grounded-search helper (PRD §23.5 r): a field from a search stands only where a page shows it.
const generate = vi.fn();
vi.mock("@/lib/llm/vertex", async (orig) => ({ ...(await orig<typeof import("@/lib/llm/vertex")>()), generate: (...a: unknown[]) => generate(...a) }));

const { byCitation, byOpened, domainsOf, proven, readPages } = await import("@/lib/enrich/pages");
const { verifyAnswer } = await import("@/lib/enrich/festival-dates");

type Ev = { events?: { name?: string; page?: string }[] };
const search = (j: unknown, sources: { title?: string; uri?: string }[] = []) => ({ text: JSON.stringify(j), sources });

beforeEach(() => generate.mockReset());

describe("byOpened", () => {
  it("matches a page however its URL is written, and nothing else", () => {
    const proof = byOpened(["https://www.example.org/events/2027/"]);
    expect(proof("https://example.org/events/2027")).toBe("https://example.org/events/2027");
    expect(proof("http://example.org/events/2027")).toBeUndefined(); // plain http is never kept
    expect(proof("https://example.org/events/2027?ref=x#top")).toBeTruthy();
    expect(proof("https://example.org/events/2026")).toBeUndefined();
    expect(proof("https://other.org/events/2027")).toBeUndefined();
    expect(proof(undefined)).toBeUndefined();
    expect(proof("javascript:alert(1)")).toBeUndefined();
  });
});

describe("byCitation", () => {
  it("keeps a page whose site the search cited, subdomains included", () => {
    const proof = byCitation(domainsOf([{ title: "example.org" }]));
    expect(proof("https://events.example.org/a")).toBeTruthy();
    expect(proof("https://elsewhere.com/a")).toBeUndefined();
  });
});

describe("readPages", () => {
  it("gives no answer when no page opened, so nothing is kept from memory", async () => {
    generate.mockResolvedValue({ text: '{"date":"May 3, 2027"}', sources: [], retrievedUrls: [] });
    const r = await readPages<{ date?: string }>(["https://example.org/a"], "the date");
    expect(r).toEqual({ j: undefined, opened: [] });
  });
  it("answers from the pages that opened", async () => {
    generate.mockResolvedValue({ text: '{"date":"May 3, 2027"}', sources: [], retrievedUrls: ["https://example.org/a"] });
    const r = await readPages<{ date?: string }>(["https://example.org/a"], "the date");
    expect(r.j?.date).toBe("May 3, 2027");
    expect(r.opened).toEqual(["https://example.org/a"]);
    expect(generate.mock.calls[0][0]).toMatchObject({ urlContext: true });
  });
});

describe("proven", () => {
  it("uses the search's citations when it has them, without reading again", async () => {
    const res = search({ events: [{ name: "A", page: "https://a.org/x" }] }, [{ title: "a.org", uri: "https://vertex/redirect" }]);
    const p = await proven<Ev>(res, (j) => (j.events ?? []).map((e) => e.page), "again");
    expect(generate).not.toHaveBeenCalled();
    expect(p.read).toBeUndefined();
    expect(p.proof("https://a.org/x")).toBeTruthy();
    expect(p.proof("https://b.org/x")).toBeUndefined();
  });

  it("reads the named pages when the search cites nothing, and keeps only the ones that opened", async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ events: [{ name: "A", page: "https://a.org/x" }] }), sources: [], retrievedUrls: ["https://a.org/x"] });
    const res = search({ events: [{ name: "A", page: "https://a.org/x" }, { name: "B", page: "https://b.org/y" }] });
    const p = await proven<Ev>(res, (j) => (j.events ?? []).map((e) => e.page), "again");
    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = String(generate.mock.calls[0][0].prompt);
    expect(prompt).toContain("https://a.org/x");
    expect(prompt).toContain("https://b.org/y");
    expect(p.read?.events?.map((e) => e.name)).toEqual(["A"]);
    expect(p.proof("https://a.org/x")).toBeTruthy();
    expect(p.proof("https://b.org/y")).toBeUndefined();
  });

  it("proves nothing when the search named no page or the read fails", async () => {
    const none = await proven<Ev>(search({ events: [{ name: "A" }] }), (j) => (j.events ?? []).map((e) => e.page), "again");
    expect(generate).not.toHaveBeenCalled();
    expect(none.proof("https://a.org/x")).toBeUndefined();
    // A read that breaks (vitest fails any test whose vi.fn throws, even when caught, so it breaks after the call).
    generate.mockResolvedValue(undefined);
    const failed = await proven<Ev>(search({ events: [{ name: "A", page: "https://a.org/x" }] }), (j) => (j.events ?? []).map((e) => e.page), "again");
    expect(failed.j?.events?.[0].name).toBe("A");
    expect(failed.proof("https://a.org/x")).toBeUndefined();
  });
});

describe("festival dates without citations", () => {
  it("accepts a date whose page opened, and still refuses one nothing shows", () => {
    const line = "DATE: May 3, 2027 | URL: https://fest.org/2027";
    expect(verifyAnswer(line, [], "2026-10-26")).toBeUndefined();
    expect(verifyAnswer(line, [], "2026-10-26", ["https://fest.org/2027/"])?.date).toBe("2027-05-03");
    expect(verifyAnswer(line, [], "2026-10-26", ["https://fest.org/2026"])).toBeUndefined();
  });
});
