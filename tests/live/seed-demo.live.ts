import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// `pnpm seed:demo`: seed the judges' demo workspace (§23.6 e) from a recorded dev run of the Fishwife sample.
// Reads one dev snapshot (gitignored, under .cache/dev) and writes the brief and journey to the store under the demo
// workspace id. It makes no Qloo call. The plan is checked for brand fit (§23.6 n) first: one Flash call the first time,
// whose verdicts are kept in .cache/dev/demo-fit.json, so seeding again (or into Firestore) makes no Gemini call. Locally it writes the file store; for Cloud Run, run it with
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

  // The brand-fit check, then Athena's plan written again without what it left out (code only, as after a mark).
  const { brandFit } = await import("@/lib/agent/brand-fit");
  const { athenaPlan } = await import("@/lib/agent/athena-plan");
  const { leftOutOf } = await import("@/lib/exec/plan");
  type V = { value?: string };
  const brief = saved!.brief as { name?: V; sells?: V; channel?: V; tierHint?: V; traits?: string[] };
  const j = saved!.journey as { facts?: { text: string }[]; fits?: { fits?: { fits?: { crowd: string; name: string; tier: string; reasons: string[] }[] } }; team: import("@/lib/team/types").TeamState };
  const t = j.team;
  const cache = join(dev, "demo-fit.json");
  const seen = existsSync(cache) ? (JSON.parse(readFileSync(cache, "utf-8")) as { snap: string; fit: Record<string, never> }) : undefined;
  const brand = { name: brief.name?.value ?? "Fishwife", product: brief.sells?.value ?? "tinned seafood", category: "G1" as const, tier: (brief.tierHint?.value ?? "premium") as "premium", traits: brief.traits ?? [], channel: brief.channel?.value as "both" | undefined };
  const fit = await brandFit(brand, (j.facts ?? []).map((f) => f.text), t.works, seen?.snap === name ? seen.fit : {});
  writeFileSync(cache, JSON.stringify({ snap: name, fit }));
  const out = leftOutOf(fit, t.exec?.kept);
  const crowds = (j.fits?.fits?.fits ?? []).map((f) => ({ id: f.crowd, name: f.name, tier: f.tier as "win_first", ...(f.reasons?.[0] ? { why: f.reasons[0] } : {}) }));
  t.plan = { ...athenaPlan({ works: t.works, crowds, outcomes: t.outcomes, disagreements: t.plan?.disagreements, answers: t.answered, out }), fit };
  const outs = Object.values(fit).filter((v) => v.fit === "out");
  process.stdout.write(`Brand fit: ${Object.keys(fit).length} checked, ${outs.length} left out, ${Object.values(fit).filter((v) => v.fit === "note").length} with a note.
`);
  for (const v of outs) process.stdout.write(`  out: ${v.name} (${v.kind}): ${v.why}
`);
  for (const v of Object.values(fit).filter((v) => v.fit === "note")) process.stdout.write(`  note: ${v.name} (${v.kind}): ${v.why}
`);

  await saveSnapshot(DEMO_WS, saved);

  const store = process.env.ATHENA_STORE === "firestore" ? `Firestore (${process.env.GOOGLE_CLOUD_PROJECT})` : "the local file store";
  process.stdout.write(`Seeded ${DEMO_WS} from ${name} (${(JSON.stringify(saved).length / 1e6).toFixed(2)} MB) into ${store}.\n`);
  expect(await demoReady()).toBe(true);
});
