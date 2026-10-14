import "server-only";
import { createHash } from "node:crypto";
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

class FirestoreStore implements Store {
  private db: Promise<import("@google-cloud/firestore").Firestore>;
  constructor(projectId: string) {
    this.db = import("@google-cloud/firestore").then(({ Firestore }) => new Firestore({ projectId, ignoreUndefinedProperties: true }));
  }
  async get<T>(ns: string, key: string): Promise<Stored<T> | undefined> {
    try {
      const doc = await (await this.db).collection(ns).doc(id(key)).get();
      if (!doc.exists) return undefined;
      const d = doc.data() as { json: string; at: number; expires: number | null };
      if (d.expires !== null && d.expires < Date.now()) return undefined;
      return { value: JSON.parse(d.json) as T, at: d.at, expires: d.expires };
    } catch {
      return undefined;
    }
  }
  async set<T>(ns: string, key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const json = JSON.stringify(value);
      if (json.length > MAX_DOC_BYTES) return;
      const expires = ttlMs && Number.isFinite(ttlMs) ? Date.now() + ttlMs : null;
      // `expireAt` is a Date so a Firestore TTL policy can delete old documents.
      await (await this.db).collection(ns).doc(id(key)).set({ json, at: Date.now(), expires, expireAt: expires ? new Date(expires) : null });
    } catch {
      // Best effort.
    }
  }
  async delete(ns: string, key: string): Promise<void> {
    await (await this.db).collection(ns).doc(id(key)).delete();
  }
}

let shared: Store | undefined;

/** Firestore in production on Google Cloud; files everywhere else. */
export function getStore(): Store {
  if (shared) return shared;
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  shared = process.env.NODE_ENV === "production" && project && process.env.ATHENA_STORE !== "file" ? new FirestoreStore(project) : new FileStore();
  return shared;
}
