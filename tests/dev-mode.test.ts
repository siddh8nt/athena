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
