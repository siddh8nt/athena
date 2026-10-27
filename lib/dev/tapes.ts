import "server-only";
import { mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

// Developer mode's local files, under /.cache/dev (gitignored: recorded runs hold Qloo data, never committed).
// A tape is one API response recorded during a real run; a snapshot is the app's browser state at one point.

const ROOT = join(process.cwd(), ".cache", "dev");
const TAPES = join(ROOT, "tapes");
const SNAPS = join(ROOT, "snapshots");

export type Tape = { path: string; key: string; req: string; status: number; type: string; body: string; at: number; ms: number };
export type Snapshot = { name: string; label: string; url: string; at: number; store: Record<string, string>; auto?: boolean; route?: string };

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);

export async function saveTape(t: Tape) {
  const dir = join(TAPES, safe(t.path));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${safe(t.key)}.json`), JSON.stringify(t));
}

async function tapesOf(path: string): Promise<Tape[]> {
  const dir = join(TAPES, safe(path));
  const files = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as Tape));
}

/** Top-level fields of a request body, for matching a request that differs a little from the recorded one. */
function fields(req: string): Map<string, string> {
  try {
    const v = JSON.parse(req) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return new Map(Object.entries(v).map(([k, x]) => [k, JSON.stringify(x)]));
  } catch {}
  return new Map(req.split("&").map((p) => [p.split("=")[0], p] as [string, string]));
}

/** The exact recording for this request, else the closest one for the same route (most equal fields, then newest). */
export async function findTape(path: string, key: string, req: string): Promise<{ tape: Tape; exact: boolean } | undefined> {
  const all = await tapesOf(path);
  const exact = all.find((t) => t.key === key);
  if (exact) return { tape: exact, exact: true };
  if (!all.length) return undefined;
  const want = fields(req);
  const score = (t: Tape) => {
    let n = 0;
    for (const [k, v] of fields(t.req)) if (want.get(k) === v) n++;
    return n;
  };
  const best = all.sort((a, b) => score(b) - score(a) || b.at - a.at)[0];
  return { tape: best, exact: false };
}

export async function tapeCounts(): Promise<Record<string, number>> {
  const dirs = await readdir(TAPES).catch(() => [] as string[]);
  const out: Record<string, number> = {};
  for (const d of dirs) out[d] = (await readdir(join(TAPES, d)).catch(() => [])).length;
  return out;
}

export async function saveSnapshot(s: Snapshot) {
  await mkdir(SNAPS, { recursive: true });
  await writeFile(join(SNAPS, `${safe(s.name)}.json`), JSON.stringify(s));
}

export type SnapshotInfo = Omit<Snapshot, "store"> & { journey?: JourneySummary };

/** Each snapshot's summary, kept beside them: snapshots never change once saved, and reading every one again for the
 *  step map takes most of a minute once there are hundreds. A new summary shape (INDEX_V) reads them all once more. */
const INDEX = join(ROOT, "snapshot-index.json");
const INDEX_V = 3;

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  const files = await readdir(SNAPS).catch(() => [] as string[]);
  const kept = JSON.parse(await readFile(INDEX, "utf8").catch(() => "null")) as { v: number; items: Record<string, SnapshotInfo> } | null;
  const items = kept?.v === INDEX_V ? kept.items : {};
  const missing = files.filter((f) => !items[f]);
  await Promise.all(
    missing.map(async (f) => {
      const { store, ...rest } = JSON.parse(await readFile(join(SNAPS, f), "utf8")) as Snapshot;
      items[f] = { ...rest, journey: store["athena:journey:v1"] ? summarize(store["athena:journey:v1"]) : undefined };
    }),
  );
  const live = new Set(files);
  const gone = Object.keys(items).filter((f) => !live.has(f));
  for (const f of gone) delete items[f];
  if (missing.length || gone.length) await writeFile(INDEX, JSON.stringify({ v: INDEX_V, items }));
  return Object.values(items).sort((a, b) => a.at - b.at);
}

export async function getSnapshot(name: string): Promise<Snapshot | undefined> {
  return JSON.parse(await readFile(join(SNAPS, `${safe(name)}.json`), "utf8").catch(() => "null")) ?? undefined;
}

export async function deleteSnapshot(name: string) {
  await unlink(join(SNAPS, `${safe(name)}.json`)).catch(() => undefined);
}

/** What a saved journey has reached, for the step map. */
export type JourneySummary = {
  brand?: string;
  analyst: boolean;
  proposed: number;
  goals: number;
  workflow: { id: string; state: string }[];
  works: string[];
  questions: number;
  plan: boolean;
  tasks: number;
  /** Execute Plan (§23.5 q): started, and how many items the founder has marked. */
  exec: boolean;
  marks: number;
  /** Source conflicts the founder settled in onboarding, from its record. */
  settled: number;
  /** The Executive's mid-run questions asked, its "Did these go out?" (drafts opened), a follow-up wait set, contacts
   *  with two or more profiles to choose from, and Later. */
  asked: number;
  opened: boolean;
  wait: boolean;
  profiles: number;
  later: boolean;
  /** An orders export read (§23.6 i). */
  sales: boolean;
};

function summarize(raw: string): JourneySummary | undefined {
  try {
    type Exec = { started?: number; later?: number; asked?: string[]; opened?: Record<string, number>; wait?: unknown; contacts?: Record<string, { ask?: unknown }> };
    const s = JSON.parse(raw) as {
      brief?: { name?: { value?: string } };
      msgs?: { record?: { settled?: unknown[] } }[];
      journey?: { crowds?: unknown; team?: { proposed?: unknown[]; goals?: unknown[]; workflow?: { steps?: { id: string; state: string }[] }; works?: Record<string, unknown>; plan?: unknown; tasks?: Record<string, unknown>; exec?: Exec; outcomes?: unknown[]; sales?: { orders?: unknown[] } } };
    };
    const team = s.journey?.team;
    const steps = team?.workflow?.steps ?? [];
    const exec = team?.exec;
    return {
      brand: s.brief?.name?.value,
      analyst: !!s.journey?.crowds,
      proposed: team?.proposed?.length ?? 0,
      goals: team?.goals?.length ?? 0,
      workflow: steps.map((x) => ({ id: x.id, state: x.state })),
      works: Object.keys(team?.works ?? {}),
      questions: steps.filter((x) => x.state === "paused").length,
      plan: !!team?.plan,
      tasks: Object.keys(team?.tasks ?? {}).length,
      exec: !!exec?.started,
      marks: team?.outcomes?.length ?? 0,
      settled: Math.max(0, ...(s.msgs ?? []).map((m) => m.record?.settled?.length ?? 0)),
      asked: exec?.asked?.length ?? 0,
      opened: !!exec?.opened && Object.keys(exec.opened).length > 0,
      wait: !!exec?.wait,
      profiles: Object.values(exec?.contacts ?? {}).filter((c) => c.ask).length,
      later: !!exec?.later && !exec.started,
      sales: !!team?.sales?.orders?.length,
    };
  } catch {
    return undefined;
  }
}
