import { describe, expect, it, vi } from "vitest";
import type { Lookup, Social } from "@/lib/exec/plan";

// Profiles for creators and shows (PRD §23.5 r): the lookup reads a show's RSS feed and a creator's YouTube channel,
// and a profile becomes an "Open on …" button only once a page the server fetched shows it. Every name here is made up.

vi.mock("server-only", () => ({}));
const store = new Map<string, unknown>();
vi.mock("@/lib/store", () => ({
  getStore: () => ({ get: async (ns: string, k: string) => (store.has(`${ns}:${k}`) ? { value: store.get(`${ns}:${k}`), at: Date.now() } : undefined), set: async (ns: string, k: string, v: unknown) => void store.set(`${ns}:${k}`, v) }),
}));
const generate = vi.fn(async (..._a: unknown[]) => ({ text: "{}", sources: [], retrievedUrls: [] }));
vi.mock("@/lib/llm/vertex", async (orig) => ({ ...(await orig<typeof import("@/lib/llm/vertex")>()), generate: (...a: unknown[]) => generate(...a) }));

// The pages the server fetches, by address.
const pages = new Map<string, { status: number; body: string; at?: string }>();
vi.mock("@/lib/enrich/safe-fetch", () => ({
  safeFetch: async (url: string) => {
    const p = pages.get(url);
    return p ? new Response(p.status === 404 ? "" : p.body, { status: p.status, headers: { "x-athena-url": p.at ?? url } }) : undefined;
  },
  fetchedUrl: (res: Response, asked: string) => res.headers.get("x-athena-url") ?? asked,
}));
const apple = vi.fn(async (_url: string) => new Response(JSON.stringify({ results: [] })));
vi.stubGlobal("fetch", (url: string) => apple(url));

const { emailsIn, profilesIn, showFeed, youtubeChannel } = await import("@/lib/exec/profiles");
const { findContact } = await import("@/lib/exec/contacts");
const { profileButtons, profileOf } = await import("@/lib/exec/plan");

const channelPage = (desc: string, links: string) =>
  `<html><head><meta property="og:url" content="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"><meta property="og:description" content="${desc}"></head><body>${links}</body></html>`;
const igRedirect = (h: string) => `<a href="https://www.youtube.com/redirect?event=channel_header&amp;q=https%3A%2F%2Fwww.instagram.com%2F${h}%2F&amp;v=1">ig</a>`;

pages.set("https://www.youtube.com/@tinclub", { status: 200, body: channelPage("Tins every week. For business: hello [at] tinclub [dot] com", igRedirect("tinclub")) });
pages.set("https://www.youtube.com/@nochannelhere", { status: 404, body: "" });
pages.set("https://www.youtube.com/@consentwall", { status: 200, body: "<html>Before you continue</html>", at: "https://consent.youtube.com/m?continue=x" });
pages.set("https://feeds.example.com/tfh", {
  status: 200,
  body:
    `<?xml version="1.0"?><rss><channel><title>The Tinned Fish Hour</title><link>https://tfh.example.com</link>` +
    `<description>Talk about tins. Follow us: https:\\/\\/www.instagram.com\\/tinnedfishhour</description>` +
    `<itunes:owner><itunes:name>TFH</itunes:name><itunes:email>booking@tfh.example.com</itunes:email></itunes:owner>` +
    `<item><title>Ep 1</title><description>Guest: https://www.instagram.com/someguest</description></item></channel></rss>`,
});

const lookup = (kind: string, name: string, social: Social[] = []): Lookup => ({ key: `${kind === "podcast" ? "show" : "person"}:${name.toLowerCase()}`, name, kind, items: [], seed: social.length ? { social } : {}, hints: {} });
const scout = (label: string, value: string): Social => ({ label, value, src: { label: "Found by the Scout" } });

describe("profileOf", () => {
  it("reads a profile link however it's written, and nothing that isn't one", () => {
    expect(profileOf("instagram.com/TinClub")).toEqual({ site: "Instagram", handle: "tinclub", url: "https://www.instagram.com/TinClub/" });
    expect(profileOf("https://m.youtube.com/@Tin.Club/videos")?.handle).toBe("tin.club");
    expect(profileOf("https://www.tiktok.com/@chef_x?lang=en")).toMatchObject({ site: "TikTok", handle: "chef_x" });
    expect(profileOf("https://www.instagram.com/p/Cabc123/")).toBeUndefined();
    expect(profileOf("https://www.youtube.com/redirect?q=x")).toBeUndefined();
    expect(profileOf("https://x.com/tinclub")).toBeUndefined();
  });
});

describe("what a page gives", () => {
  it("finds emails written to dodge scrapers, and profiles inside YouTube's redirect links", () => {
    expect(emailsIn("Business: business [at] tinclub [dot] com, or Press@TinClub.com")).toEqual(["business@tinclub.com", "press@tinclub.com"]);
    expect(profilesIn(igRedirect("tinclub") + ' "https:\\u002F\\u002Fwww.tiktok.com\\u002F@tinclub"')).toEqual(["https://www.instagram.com/tinclub/", "https://www.tiktok.com/@tinclub"]);
  });
});

describe("youtubeChannel", () => {
  it("reads a channel's business email and the profiles it links", async () => {
    const ch = await youtubeChannel("https://youtube.com/@tinclub");
    expect(ch).toMatchObject({ url: "https://www.youtube.com/@tinclub", same: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", emails: ["hello@tinclub.com"], profiles: ["https://www.instagram.com/tinclub/"] });
  });
  it("says there's no such channel on a 404, and confirms nothing from a page that isn't the channel", async () => {
    expect(await youtubeChannel("https://www.youtube.com/@nochannelhere")).toBeNull();
    expect(await youtubeChannel("https://www.youtube.com/@consentwall")).toBeUndefined();
    expect(await youtubeChannel("https://www.youtube.com/@neverfetched")).toBeUndefined();
  });
});

describe("showFeed", () => {
  it("finds the show's own feed by its exact name and reads its head", async () => {
    // Apple gives some feeds as plain http: the server asks for https.
    apple.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ collectionName: "Tinned Fish Hour Live", feedUrl: "https://feeds.example.com/other" }, { collectionName: "The Tinned Fish Hour", feedUrl: "http://feeds.example.com/tfh" }] })));
    const feed = await showFeed("Tinned Fish Hour");
    expect(apple.mock.calls[0][0]).toContain("itunes.apple.com/search");
    // The episode's guest isn't the show's.
    expect(feed).toMatchObject({ url: "https://feeds.example.com/tfh", website: "https://tfh.example.com", owner: "booking@tfh.example.com", emails: [], profiles: ["https://www.instagram.com/tinnedfishhour/"] });
  });
  it("takes no near match", { timeout: 15_000 }, async () => {
    apple.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ collectionName: "Fish Hour Daily", feedUrl: "https://feeds.example.com/fhd" }] })));
    expect(await showFeed("Fish Hour")).toBeUndefined();
  });
});

describe("findContact for creators and shows", () => {
  it("confirms a creator's channel by its page and an Instagram the channel links; a TikTok nothing shows stays unconfirmed", async () => {
    const seed = [scout("YouTube", "https://www.youtube.com/@tinclub"), scout("Instagram", "https://www.instagram.com/tinclub/"), scout("TikTok", "https://www.tiktok.com/@tinclubfans")];
    const c = await findContact(lookup("creator", "Tin Club", seed), () => {}, true);
    expect(c.email).toEqual({ value: "hello@tinclub.com", src: { label: "Their YouTube channel", url: "https://www.youtube.com/@tinclub" } });
    expect(c.checked).toContain("Their YouTube channel");
    const ok = Object.fromEntries((c.social ?? []).filter((s) => s.ok).map((s) => [s.label, s.ok?.label]));
    expect(ok).toEqual({ YouTube: "Their YouTube channel", Instagram: "Their YouTube channel" });
    // The plan merges the seed's TikTok in as a plain link: it gets no button.
    const buttons = profileButtons({ social: [...(c.social ?? []), seed[2]] });
    expect(buttons.map((b) => b.site).sort()).toEqual(["Instagram", "YouTube"]);
  });

  it("drops a channel YouTube says isn't there", async () => {
    const c = await findContact(lookup("creator", "Nobody Here", [scout("YouTube", "https://www.youtube.com/@nochannelhere")]), () => {}, true);
    expect(c.checked).toContain("Their YouTube channel");
    expect((c.social ?? []).some((s) => s.label === "YouTube")).toBe(false);
  });

  it("reads a show's RSS feed for its booking email, site and Instagram", async () => {
    const c = await findContact(lookup("podcast", "The Tinned Fish Hour"), () => {}, true);
    const feed = { label: "The show's RSS feed", url: "https://feeds.example.com/tfh" };
    expect(c.email).toEqual({ value: "booking@tfh.example.com", src: feed });
    expect(c.website).toEqual({ value: "https://tfh.example.com/", src: feed });
    expect(c.social).toEqual([{ label: "Instagram", value: "https://www.instagram.com/tinnedfishhour/", src: feed, ok: feed }]);
    expect(c.checked).toContain("The show's RSS feed");
  });

  it("keeps no owner address that isn't a booking or the show's own", { timeout: 15_000 }, async () => {
    apple.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ collectionName: "Lab Talk", feedUrl: "https://feeds.example.com/lab" }] })));
    pages.set("https://feeds.example.com/lab", { status: 200, body: "<rss><channel><link>https://labtalk.example.com</link><itunes:email>podcast-verification@network.example.com</itunes:email></channel></rss>" });
    const c = await findContact(lookup("podcast", "Lab Talk"), () => {}, true);
    expect(c.website?.value).toBe("https://labtalk.example.com/");
    expect(c.email).toBeUndefined();
  });
});

describe("profileButtons", () => {
  it("gives a button only for a profile the server saw or the founder gave, each with its source", () => {
    const seen = { label: "Their YouTube channel", url: "https://www.youtube.com/@tinclub" };
    const buttons = profileButtons({
      social: [
        { label: "Instagram", value: "https://www.instagram.com/tinclub/", src: { label: "A web search" }, ok: seen },
        { label: "TikTok", value: "https://www.tiktok.com/@tinclub", src: { label: "A web search" } },
        { label: "YouTube", value: "https://www.youtube.com/@tinclub", src: { label: "From you" } },
        { label: "X", value: "https://x.com/tinclub", src: { label: "A web search" }, ok: seen },
      ],
    });
    expect(buttons.map((b) => b.site)).toEqual(["Instagram", "YouTube"]);
    for (const b of buttons) expect(b.src.label).toBeTruthy();
  });
});
