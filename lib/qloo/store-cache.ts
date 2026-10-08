import "server-only";
import type { RawResult, ResponseCache } from "./client";
import type { Store } from "@/lib/store";

/** Qloo responses in the shared store (Firestore in production), with a small in-memory layer in front. */
export class StoreCache implements ResponseCache {
  private memory = new Map<string, { value: RawResult; expires: number }>();
  constructor(private readonly store: Store, private readonly ns = "qloo") {}

  async get(key: string): Promise<RawResult | undefined> {
    const m = this.memory.get(key);
    if (m && m.expires > Date.now()) return m.value;
    const s = await this.store.get<RawResult>(this.ns, key);
    if (!s) return undefined;
    this.remember(key, s.value, s.expires);
    return s.value;
  }

  async set(key: string, value: RawResult, ttlMs: number): Promise<void> {
    const expires = Number.isFinite(ttlMs) ? Date.now() + ttlMs : null;
    this.remember(key, value, expires);
    await this.store.set(this.ns, key, value, ttlMs);
  }

  private remember(key: string, value: RawResult, expires: number | null) {
    if (this.memory.size > 2000) this.memory.delete(this.memory.keys().next().value!);
    this.memory.set(key, { value, expires: Math.min(expires ?? Infinity, Date.now() + 10 * 60 * 1000) });
  }
}
