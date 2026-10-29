import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// One key-value store for everything Athena caches (§14.4): Qloo responses, festival dates, comparisons,
// last good results. Locally: JSON files under .cache/store (git-ignored). On Cloud Run: Firestore, because
// the container's disk is wiped on restart. Every call but delete is best-effort: a store failure never fails a plan, but a delete the founder asked for must say if it didn't happen.

export type Stored<T> = { value: T; at: number; expires: number | null };

export interface Store {
  get<T>(ns: string, key: string): Promise<Stored<T> | undefined>;
  set<T>(ns: string, key: string, value: T, ttlMs?: number): Promise<void>;
  delete(ns: string, key: string): Promise<void>;
}

const id = (key: string) => createHash("sha1").update(key).digest("hex");
const MAX_DOC_BYTES = 900_000; // Firestore's limit is 1 MiB per document
const partId = (key: string, stamp: string, i: number) => `${id(key)}~${stamp}~${i}`;

/** Split a string into pieces of at most `max` UTF-8 bytes each, never between the two halves of a surrogate pair. */
export function splitBytes(s: string, max: number): string[] {
  if (Buffer.byteLength(s) <= max) return [s];
  const out: string[] = [];
  let at = 0;
  while (at < s.length) {
    let n = Math.min(max, s.length - at);
    while (Buffer.byteLength(s.slice(at, at + n)) > max) n = Math.floor(n * 0.9);
    const last = s.charCodeAt(at + n - 1);
    if (at + n < s.length && last >= 0xd800 && last <= 0xdbff) n--;
    out.push(s.slice(at, at + n));
    at += n;
  }
  return out;
}

class FileStore implements Store {
  constructor(private readonly root = path.join(process.cwd(), ".cache", "store")) {}
  async get<T>(ns: string, key: string): Promise<Stored<T> | undefined> {
    try {
      const s = JSON.parse(await readFile(path.join(this.root, ns, `${id(key)}.json`), "utf-8")) as Stored<T>;
      return s.expires !== null && s.expires < Date.now() ? undefined : s;
    } catch {
      return undefined;
    }
  }
  async set<T>(ns: string, key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      await mkdir(path.join(this.root, ns), { recursive: true });
      const s: Stored<T> = { value, at: Date.now(), expires: ttlMs && Number.isFinite(ttlMs) ? Date.now() + ttlMs : null };
      await writeFile(path.join(this.root, ns, `${id(key)}.json`), JSON.stringify(s));
    } catch {
      // Best effort.
    }
  }
  async delete(ns: string, key: string): Promise<void> {
    await rm(path.join(this.root, ns, `${id(key)}.json`), { force: true });
  }
}

export class FirestoreStore implements Store {
  private db: Promise<import("@google-cloud/firestore").Firestore>;
  /** `db`: a client to use instead (tests pass an in-memory one). */
  constructor(projectId: string, db?: Promise<import("@google-cloud/firestore").Firestore>) {
    this.db = db ?? import("@google-cloud/firestore").then(({ Firestore }) => new Firestore({ projectId, ignoreUndefinedProperties: true }));
  }
  async get<T>(ns: string, key: string): Promise<Stored<T> | undefined> {
    try {
      const doc = await (await this.db).collection(ns).doc(id(key)).get();
      if (!doc.exists) return undefined;
      const d = doc.data() as { json?: string; parts?: number; stamp?: string; at: number; expires: number | null };
      if (d.expires !== null && d.expires < Date.now()) return undefined;
      let json = d.json ?? "";
      if (d.parts) {
        const db = await this.db;
        const refs = Array.from({ length: d.parts }, (_, i) => db.collection(ns).doc(partId(key, d.stamp ?? "", i)));
        const parts = await db.getAll(...refs);
        if (parts.some((p) => !p.exists)) return undefined;
        json = parts.map((p) => (p.data() as { json: string }).json).join("");
      }
      return { value: JSON.parse(json) as T, at: d.at, expires: d.expires };
    } catch {
      return undefined;
    }
  }
  async set<T>(ns: string, key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const json = JSON.stringify(value);
      const expires = ttlMs && Number.isFinite(ttlMs) ? Date.now() + ttlMs : null;
      // `expireAt` is a Date so a Firestore TTL policy can delete old documents.
      const expireAt = expires ? new Date(expires) : null;
      const db = await this.db;
      const main = db.collection(ns).doc(id(key));
      const prev = (await main.get()).data() as { parts?: number; stamp?: string } | undefined;
      const chunks = splitBytes(json, MAX_DOC_BYTES);
      if (chunks.length === 1) {
        await main.set({ json, at: Date.now(), expires, expireAt });
      } else {
        // Too big for one document (a long journey's mirror): the parts go first under a fresh stamp, then the main
        // document points at them, so a reader sees either the old value or the new one, never a mix.
        const stamp = randomBytes(6).toString("hex");
        await Promise.all(chunks.map((c, i) => db.collection(ns).doc(partId(key, stamp, i)).set({ json: c, expireAt })));
        await main.set({ parts: chunks.length, stamp, at: Date.now(), expires, expireAt });
      }
      if (prev?.parts) await Promise.all(Array.from({ length: prev.parts }, (_, i) => db.collection(ns).doc(partId(key, prev.stamp ?? "", i)).delete()));
    } catch {
      // Best effort.
    }
  }
  async delete(ns: string, key: string): Promise<void> {
    const db = await this.db;
    const main = db.collection(ns).doc(id(key));
    const d = (await main.get()).data() as { parts?: number; stamp?: string } | undefined;
    if (d?.parts) await Promise.all(Array.from({ length: d.parts }, (_, i) => db.collection(ns).doc(partId(key, d.stamp ?? "", i)).delete()));
    await main.delete();
  }
}

let shared: Store | undefined;

/** Firestore in production on Google Cloud (or when ATHENA_STORE=firestore); files everywhere else. */
export function getStore(): Store {
  if (shared) return shared;
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  // ATHENA_STORE=firestore points a local job (the demo seed, §23.6 e) at the production store.
  const fire = process.env.ATHENA_STORE === "firestore" || (process.env.NODE_ENV === "production" && process.env.ATHENA_STORE !== "file");
  shared = fire && project ? new FirestoreStore(project) : new FileStore(process.env.ATHENA_STORE_DIR || undefined);
  return shared;
}
