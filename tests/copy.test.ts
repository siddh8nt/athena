import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "@/lib/methods/allowlist";

// Banned words in product copy (§13.9). Scans the text the UI shows: JSX text and string literals in
// app/ and components/. Endpoint names in code (e.g. /v2/insights), Qloo's product name "Qloo Insights"
// (the API the numbers come from) and comments are exempt.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !p.includes(`${path.sep}api${path.sep}`) ? [p] : [];
  });
}

function visibleText(src: string): string {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const jsxText = [...noComments.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  const quoted = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
  const strings = [...noComments.matchAll(quoted)].map((m) => m[1] ?? m[2] ?? "").filter((s) => !s.startsWith("/") && !s.includes("urn:"));
  return [...jsxText, ...strings].join("\n").replace(/Qloo Insights/g, "Qloo");
}

describe("banned words in product copy (§13.9)", () => {
  for (const f of [...files("app"), ...files("components")]) {
    it(path.relative(process.cwd(), f), () => {
      const text = visibleText(readFileSync(f, "utf-8")).toLowerCase();
      for (const w of BANNED_WORDS) expect(text, `"${w}" in ${f}`).not.toContain(w.toLowerCase());
    });
  }
});
