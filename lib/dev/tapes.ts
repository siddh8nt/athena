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

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  const files = await readdir(SNAPS).catch(() => [] as string[]);
  const all = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(SNAPS, f), "utf8")) as Snapshot));
  return all.sort((a, b) => a.at - b.at).map(({ store, ...rest }) => ({ ...rest, journey: store["athena:journey:v1"] ? summarize(store["athena:journey:v1"]) : undefined }));
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
};

function summarize(raw: string): JourneySummary | undefined {
  try {
    const s = JSON.parse(raw) as { brief?: { name?: { value?: string } }; journey?: { crowds?: unknown; team?: { proposed?: unknown[]; goals?: unknown[]; workflow?: { steps?: { id: string; state: string }[] }; works?: Record<string, unknown>; plan?: unknown; tasks?: Record<string, unknown> } } };
    const team = s.journey?.team;
    const steps = team?.workflow?.steps ?? [];
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
    };
  } catch {
    return undefined;
  }
}
