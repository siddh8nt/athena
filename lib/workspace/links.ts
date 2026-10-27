import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getStore } from "@/lib/store";
import { DEMO_LINK, DEMO_SECRET, reserved } from "./demo";

// Connect links (PRD §23.6 c): a founder connects Athena to their own AI tool with a link and no OAuth. The link
// carries an opaque secret; the server maps it to the founder's workspace and what the link may do. The secret is
// shown once and never stored — only its SHA-256 hash is kept, so a leaked store can't reconstruct a working link.
// "New link" mints a fresh secret and drops the old one for that workspace and scope, so the previous URL stops
// resolving (the founder sees "replaced"). A read-only link (the judges' demo, §23.6 e) may read but never write.

const LINK = "ws-link"; // hash -> the workspace and scope the secret opens
const CUR = "ws-link-cur"; // `${ws}:${scope}` -> the hash of the current link, so a new one revokes it

/** What a connect link may do. "full": read and write and ask Athena (the founder's own). "read": read only (demo). */
export type Scope = "full" | "read";

/** What a secret opens, as stored under its hash. Never includes the secret itself. */
export type LinkMeta = { ws: string; scope: Scope; at: number; label?: string };

const hashOf = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** A URL-safe secret with plenty of entropy; base64url of 24 random bytes (~32 chars), no padding. */
const newSecret = () => randomBytes(24).toString("base64url");

/**
 * Mint a connect link for a workspace. Stores only the hash; returns the secret once, for the connect URL. A new
 * link for the same workspace and scope revokes the previous one (its hash is deleted, so its URL stops resolving).
 */
export async function mintLink(ws: string, scope: Scope, label?: string): Promise<{ secret: string } | undefined> {
  if (!ws || reserved(ws)) return undefined;
  const store = getStore();
  const prev = (await store.get<string>(CUR, `${ws}:${scope}`))?.value;
  const secret = newSecret();
  const hash = hashOf(secret);
  await store.set<LinkMeta>(LINK, hash, { ws, scope, at: Date.now(), ...(label ? { label } : {}) });
  await store.set<string>(CUR, `${ws}:${scope}`, hash);
  if (prev && prev !== hash) await store.delete(LINK, prev); // replace the old link, so only the newest URL works
  return { secret };
}

/** Resolve a secret to what it opens, or undefined if it was never minted or has been replaced. The demo's fixed
 *  secret (§23.6 e) always opens the demo workspace, read only. */
export async function resolveLink(secret: string | undefined | null): Promise<LinkMeta | undefined> {
  if (!secret || !/^[A-Za-z0-9_-]{16,128}$/.test(secret)) return undefined;
  if (secret === DEMO_SECRET) return DEMO_LINK;
  return (await getStore().get<LinkMeta>(LINK, hashOf(secret)))?.value;
}

/** Revoke the current link for a workspace and scope, so its URL stops resolving. */
export async function revokeLink(ws: string, scope: Scope): Promise<void> {
  if (!ws || reserved(ws)) return;
  const store = getStore();
  const hash = (await store.get<string>(CUR, `${ws}:${scope}`))?.value;
  if (hash) await store.delete(LINK, hash);
  await store.delete(CUR, `${ws}:${scope}`);
}
