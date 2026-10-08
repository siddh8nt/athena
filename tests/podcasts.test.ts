import { describe, expect, it } from "vitest";
import { parseFeedHead } from "@/lib/enrich/apple-podcasts";
import { checkFigures, mergeFigures, numberForms, pageText, parseFigures, resolveCitations } from "@/lib/enrich/podcast-numbers";
import { leans } from "@/lib/blocks/partners";

describe("parseFeedHead", () => {
  it("reads the channel's website and contact email, not an episode's", () => {
    const xml = `<rss><channel><title>Show</title><link>https://show.example.com</link>
      <itunes:owner><itunes:name>Host</itunes:name><itunes:email><![CDATA[Hello@Show.example.com]]></itunes:email></itunes:owner>
      <item><link>https://episode.example.com/1</link></item></channel></rss>`;
    expect(parseFeedHead(xml)).toEqual({ website: "https://show.example.com", email: "hello@show.example.com" });
  });
  it("drops hosting relay addresses", () => {
    const xml = `<channel><link>https://a.example.com</link><itunes:email>info+07ce3a4e-2327-4692-be49-74ad7628c0a0@mg-eu.acast.com</itunes:email></channel>`;
    expect(parseFeedHead(xml).email).toBeUndefined();
  });
  it("returns nothing for a feed without them", () => {
    expect(parseFeedHead("<rss><channel><title>x</title></channel></rss>")).toEqual({ website: undefined, email: undefined });
  });
});

describe("leans", () => {
  it("names a gender and the strongest age bucket at |0.3| or more", () => {
    expect(leans({ gender: { female: 0.84, male: -0.84 }, age: { "35_to_44": 0.64, "24_and_younger": 0.14 } })).toEqual({
      gender: { label: "female", value: 0.84 },
      age: { label: "35–44", value: 0.64 },
    });
  });
  it("leaves the age out when two buckets are close (Fat Mascara, 8 Oct)", () => {
    expect(leans({ gender: { female: 0.84 }, age: { "24_and_younger": 0.86, "55_and_older": 0.78, "25_to_29": -0.69 } })).toEqual({ gender: { label: "female", value: 0.84 } });
  });
  it("names nothing when every value is weak", () => {
    expect(leans({ gender: { female: 0.1 }, age: { "25_to_29": 0.2 } })).toEqual({});
  });
});

describe("public figures", () => {
  const text = [
    "FIGURE: 10K-100K monthly listeners | AS OF: undated | URL: https://muckrack.com/podcast/fat-mascara",
    "FIGURE: over 13 million downloads to date | AS OF: March 12, 2026 | URL: https://www.glossy.co/beauty/exclusive-fat-mascara-is-back/",
    "FIGURE: 125,000 downloads per week | AS OF: August 20, 2019 | URL: https://www.niemanlab.org/2019/08/x/",
    "FIGURE: Sponsors page | AS OF: undated | URL: https://fatmascara.com/sponsors",
    "FIGURE: 33K Instagram followers | AS OF: undated | URL: https://podcasts.feedspot.com/beauty_podcasts/",
  ].join("\n");
  const candidates = parseFigures(text, 2026);
  // Pages as found on 9 Oct: Muck Rack blocks bots, the sponsors URL was invented (404).
  const pages: Record<string, string> = {
    "https://www.glossy.co/beauty/exclusive-fat-mascara-is-back/": pageText("<p>Fat Mascara has over 13 million downloads.</p>"),
    "https://www.niemanlab.org/2019/08/x/": pageText("<p>Fat Mascara gets 125,000 downloads a week.</p>"),
    "https://podcasts.feedspot.com/beauty_podcasts/": pageText("<li>Fat Mascara · Instagram 33K followers</li>"),
  };

  it("parses candidates, labels estimators and flags old figures, sponsor pages first", () => {
    expect(candidates).toHaveLength(5);
    expect(candidates[0].kind).toBe("sponsor");
    expect(candidates.find((f) => f.site === "muckrack.com")).toMatchObject({ estimate: true, asOf: undefined });
    expect(candidates.find((f) => f.site === "niemanlab.org")).toMatchObject({ estimate: false, old: true });
  });
  it("keeps only figures whose page loads, names the show and shows the number", async () => {
    const kept = await checkFigures(candidates, "Fat Mascara", async (u) => pages[u] ?? "");
    expect(kept.map((f) => f.site).sort()).toEqual(["glossy.co", "niemanlab.org", "podcasts.feedspot.com"]);
  });
  it("drops a page that doesn't show the number", async () => {
    const kept = await checkFigures(candidates.filter((f) => f.site === "glossy.co"), "Fat Mascara", async () => pageText("<p>Fat Mascara is back.</p>"));
    expect(kept).toEqual([]);
  });
  it("drops a number that is far from the show's name (a list page naming many shows)", async () => {
    const list = pageText(`<li>Fat Mascara</li>${"<li>Another show about beauty and skincare</li>".repeat(30)}<li>Other Show · 33K followers</li>`);
    const kept = await checkFigures(candidates.filter((f) => f.site === "podcasts.feedspot.com"), "Fat Mascara", async () => list);
    expect(kept).toEqual([]);
  });
  it("keeps a sponsor page only if it is the show's own", async () => {
    const page = pageText("<p>Sponsor Fat Mascara: advertise with us.</p>");
    const sponsor = (url: string) => parseFigures(`FIGURE: Sponsorship page | AS OF: undated | URL: ${url}`, 2026);
    expect(await checkFigures(sponsor("https://fatmascara.com/sponsors"), "Fat Mascara", async () => page)).toHaveLength(1);
    expect(await checkFigures(sponsor("https://www.example-network.com/shows/fat-mascara"), "Fat Mascara", async () => page)).toHaveLength(1);
    expect(await checkFigures(sponsor("https://ads.example.com/beauty"), { name: "Fat Mascara", website: "https://ads.example.com" }, async () => page)).toHaveLength(1);
    expect(await checkFigures(sponsor("https://www.podcastlist.com/beauty"), "Fat Mascara", async () => page)).toEqual([]);
  });
  it("lets newer figures replace kept ones of the same kind and keeps the other kinds", () => {
    const kept = parseFigures(["FIGURE: 10 million downloads | AS OF: 2024 | URL: https://a.example.com/x", "FIGURE: Sponsorship page | AS OF: undated | URL: https://fatmascara.com/sponsors"].join("\n"), 2026);
    const found = parseFigures("FIGURE: 13 million downloads | AS OF: March 2026 | URL: https://b.example.com/y", 2026);
    expect(mergeFigures(kept, found).map((f) => f.text)).toEqual(["Sponsorship page", "13 million downloads"]);
  });
  it("keeps a number that follows the name in a card layout (Feedspot, 9 Oct: 738 characters apart)", async () => {
    const card = pageText(`<h3>Fat Mascara</h3><p>${"Beauty talk with editors. ".repeat(28)}</p><span>Instagram 38.5K</span>`);
    const f = parseFigures("FIGURE: 38.5K Instagram followers | AS OF: undated | URL: https://podcasts.feedspot.com/beauty_podcasts/", 2026);
    expect(await checkFigures(f, "Fat Mascara", async () => card)).toHaveLength(1);
  });
  it("checks a figure on the real pages of its site from Google's sources", async () => {
    const f = parseFigures(
      [
        "FIGURE: over 13 million downloads | AS OF: March 2026 | URL: https://www.glossy.co",
        "FIGURE: 4 million downloads | AS OF: 2019 | URL: https://vertexaisearch.cloud.google.com/grounding-api-redirect/nl",
      ].join("\n"),
      2026,
    );
    const real: Record<string, string> = {
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/g": "https://www.glossy.co/beauty/exclusive-fat-mascara-is-back/",
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/nl": "https://www.niemanlab.org/2019/01/forever35/",
    };
    const resolved = await resolveCitations(f, [], [{ uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/g", title: "glossy.co" }], async (u) => real[u]);
    expect(resolved.map((x) => [x.url, x.site, x.alts])).toEqual([
      ["https://www.glossy.co", "glossy.co", ["https://www.glossy.co/beauty/exclusive-fat-mascara-is-back/"]],
      ["https://www.niemanlab.org/2019/01/forever35/", "niemanlab.org", undefined],
    ]);
    const pages: Record<string, string> = {
      "https://www.glossy.co/beauty/exclusive-fat-mascara-is-back/": pageText("<p>Fat Mascara has over 13 million downloads.</p>"),
    };
    const kept = await checkFigures(resolved.slice(0, 1), "Fat Mascara", async (u) => pages[u] ?? "");
    expect(kept).toEqual([expect.objectContaining({ url: "https://www.glossy.co/beauty/exclusive-fat-mascara-is-back/", site: "glossy.co" })]);
    expect(kept[0].alts).toBeUndefined();
  });
  it("parses lines whose labels Gemini formatted in markdown", () => {
    const f = parseFigures("- **FIGURE:** 13 million downloads | **AS OF:** March 2026 | **URL:** https://www.glossy.co/x", 2026);
    expect(f.map((x) => [x.text, x.asOf, x.url])).toEqual([["13 million downloads", "March 2026", "https://www.glossy.co/x"]]);
  });
  it("drops a bare number that doesn't say what it counts", () => {
    expect(parseFigures("FIGURE: 282 | AS OF: undated | URL: https://www.podcastrepublic.net/podcast/1087614779", 2026)).toEqual([]);
  });
  it("reads the forms a page may write a number in", () => {
    expect(numberForms("33K Instagram followers")).toEqual(expect.arrayContaining(["33k", "33 thousand", "33000"]));
    expect(numberForms("over 13 million downloads")).toEqual(expect.arrayContaining(["13 million", "13m", "13000000"]));
    expect(numberForms("125,000 downloads per week")).toEqual(["125000"]);
  });
});

describe("safeFetch", () => {
  it("refuses internal and non-https addresses without fetching", async () => {
    const { safeFetch } = await import("@/lib/enrich/safe-fetch");
    for (const u of ["http://169.254.169.254/computeMetadata/v1/", "https://169.254.169.254/", "https://localhost/x", "https://metadata.google.internal/", "http://example.com/"]) {
      expect(await safeFetch(u)).toBeUndefined();
    }
  });
});
