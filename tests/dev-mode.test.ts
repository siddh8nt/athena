import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Dev mode stays out of the founder's UI (PRD §23.7 a): no founder page links to /dev or says "dev mode", and /dev is
// not found in production. Developers reach it by typing /dev on the dev server. (ChatGPT's own "developer mode", in the
// Athena MCP panel's steps, is a setting the founder turns on there, not ours.)

const ROOT = process.cwd();
// Dev mode's own files: the step map, and the DevTape pills that show only on the dev server while Record or Replay is on.
const DEV_ONLY = new Set(["app/dev/page.tsx", "app/dev/DevMap.tsx", "components/DevTape.tsx"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "api" || n === "node_modules" ? [] : sources(p);
    return /\.tsx$/.test(n) ? [p] : [];
  });
}

describe("dev mode out of the founder's UI", () => {
  const files = [...sources(join(ROOT, "app")), ...sources(join(ROOT, "components"))].filter((p) => !DEV_ONLY.has(relative(ROOT, p).split(sep).join("/")));

  it("reads the founder's pages", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no link to /dev and no words 'dev mode' on any founder page", () => {
    const hits = files.filter((p) => {
      const s = readFileSync(p, "utf-8");
      return /href=\{?["'`]\/dev["'`/?]/.test(s) || /["'`>][^"'`<]*\bdev mode\b/i.test(s.replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, ""));
    });
    expect(hits.map((p) => relative(ROOT, p))).toEqual([]);
  });
});

describe("/dev in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("next/navigation");
  });

  it("is not found", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("next/navigation", () => ({
      notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
      },
    }));
    vi.doMock("@/app/dev/DevMap", () => ({ DevMap: () => null }));
    const { default: DevPage } = await import("@/app/dev/page");
    expect(() => DevPage()).toThrow("NEXT_NOT_FOUND");
  });
});

describe("Replay keeps to one brand's run", () => {
  const tape = (req: string, at: number) => ({ path: "/api/onboard", key: String(at), req, status: 200, type: "text/event-stream", body: "", at, ms: 1 });
  const spoon = tape("websites=&said=magicspoon.com&ws=a&hashes=[]&struck=[]&settled={}", 10_000_000);
  const fish = tape("websites=&said=Fishwife: tinned seafood. eatfishwife.com&ws=b&hashes=[]&struck=[]&settled={}", 1_000_000);
  const later = tape("websites=https://magicspoon.com/&ws=a&hashes=[]&struck=[]&settled={}", 10_060_000);
  const snaps = [
    { at: 1_002_000, journey: { brand: "Fishwife" } },
    { at: 10_002_000, journey: { brand: "Magic Spoon" } },
  ];

  it("names each tape's brand from the snapshot saved after it", async () => {
    const { brandsOf } = await import("@/lib/dev/tapes");
    const brandOf = brandsOf(snaps);
    expect([brandOf(spoon), brandOf(fish), brandOf(later)]).toEqual(["Magic Spoon", "Fishwife", "Magic Spoon"]);
    expect(brandOf(tape("x", 50_000_000))).toBeUndefined();
  });

  it("never plays another brand's run for a brand never recorded", async () => {
    const { brandsOf, nearest } = await import("@/lib/dev/tapes");
    const starface = "websites=&said=Starface: playful pimple patches. starface.world&ws=c&hashes=[]&struck=[]&settled={}";
    expect(nearest([spoon, fish, later], starface, "", brandsOf(snaps))).toBeUndefined();
    expect(nearest([spoon, fish, later], "websites=https://starface.world/&ws=c", "Starface", brandsOf(snaps))).toBeUndefined();
  });

  it("plays the same brand's closest recording", async () => {
    const { brandsOf, nearest } = await import("@/lib/dev/tapes");
    const fishSample = "websites=&said=Fishwife: tinned seafood. eatfishwife.com&ws=new&hashes=[]&struck=[]&settled={}";
    expect(nearest([spoon, fish, later], fishSample, "", brandsOf(snaps))).toBe(fish);
    expect(nearest([spoon, fish, later], "websites=https://magicspoon.com/&ws=new&hashes=[]&struck=[]&settled={}", "Magic Spoon", brandsOf(snaps))).toBe(later);
  });
});
