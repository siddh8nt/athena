import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// `pnpm seed:demo`: seed the judges' demo workspace (§23.6 e) from a recorded dev run of the Fishwife sample.
// Reads one dev snapshot (gitignored, under .cache/dev) and writes the brief and journey to the store under the demo
// workspace id; it makes no Qloo or Gemini call. Locally it writes the file store; for Cloud Run, run it with
// ATHENA_STORE=firestore to write Firestore in GOOGLE_CLOUD_PROJECT (needs `gcloud auth application-default login`).
// SNAP=<name> picks a snapshot; by default, the newest named save of Fishwife with Execute Plan, else the newest auto one.
for (const l of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}

type Entry = { name: string; at: number; auto?: boolean; journey?: { brand?: string; plan?: boolean; exec?: boolean } };

it("seed the Fishwife demo workspace", async () => {
  const { DEMO_WS, compactSaved, demoReady } = await import("@/lib/workspace/demo");
  const { saveSnapshot } = await import("@/lib/workspace/server");
  const dev = join(process.cwd(), ".cache", "dev");
  const index = JSON.parse(readFileSync(join(dev, "snapshot-index.json"), "utf-8")) as { items: Record<string, Entry> };
  const fishwife = Object.values(index.items)
    .filter((e) => /fishwife/i.test(e.journey?.brand ?? "") && e.journey?.plan && e.journey?.exec)
    .sort((a, b) => Number(!!a.auto) - Number(!!b.auto) || b.at - a.at);
  const name = process.env.SNAP ?? fishwife[0]?.name;
  expect(name, "no recorded Fishwife run with Execute Plan under .cache/dev").toBeTruthy();

  const snap = JSON.parse(readFileSync(join(dev, "snapshots", `${name}.json`), "utf-8")) as { store: Record<string, string> };
  const saved = compactSaved(JSON.parse(snap.store["athena:journey:v1"] ?? "null"));
  expect(saved, `${name} holds no journey`).toBeTruthy();
  await saveSnapshot(DEMO_WS, saved);

  const store = process.env.ATHENA_STORE === "firestore" ? `Firestore (${process.env.GOOGLE_CLOUD_PROJECT})` : "the local file store";
  process.stdout.write(`Seeded ${DEMO_WS} from ${name} (${(JSON.stringify(saved).length / 1e6).toFixed(2)} MB) into ${store}.\n`);
  expect(await demoReady()).toBe(true);
});
