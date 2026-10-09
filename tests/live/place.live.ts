import { describe, it } from "vitest";
import { generate } from "@/lib/llm/vertex";
import { interpretPlace } from "@/lib/places/location";
import fs from "node:fs";

// Live: how the model reads informal places (§9.3), raw output and timing.
for (const l of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

describe("place reading", () => {
  it("prints raw readings", async () => {
    for (const t of ["Pacific Northwest", "the Midwest"]) {
      for (const thinking of [undefined, "MINIMAL", "LOW"] as const) {
        const t0 = Date.now();
        const res = await generate({ model: "lite", json: true, thinking, temperature: 0, maxOutputTokens: 800, budgetMs: 20_000, system: "Return JSON only: {\"parts\":[{\"name\",\"kind\",\"state\"}]}. List the US states or counties in the place.", prompt: `Location: ${t}` }).catch((e) => ({ text: `ERR ${e}` }));
        fs.appendFileSync(process.env.TEMP + "/place-live.txt", `${t} ${thinking} ${Date.now() - t0}ms ${res.text.slice(0, 300)}
`);
      }
      const t0 = Date.now();
      const read = JSON.stringify(await interpretPlace(t).catch((e) => `ERR ${e}`)).slice(0, 400);
      fs.appendFileSync(process.env.TEMP + "/place-live.txt", `interpretPlace ${t} ${Date.now() - t0}ms ${read}
`);
    }
  });
});
