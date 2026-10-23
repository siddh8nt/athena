import "server-only";
import { readEnv } from "@/lib/env";
import { getStore } from "@/lib/store";
import { HttpTransport, MemoryCache, QlooClient } from "./client";
import { FixtureTransport } from "./fixture";
import { StoreCache } from "./store-cache";
import { isOffline } from "@/lib/dev/offline";

let shared: QlooClient | undefined;
let offline: QlooClient | undefined;

/** The server's Qloo client: live when a key is configured, fixtures otherwise (§14.3). Responses persist in the store. */
export function getQloo(): QlooClient {
  // Developer mode's offline switch: fixtures, so nothing reaches Qloo.
  if (isOffline()) return (offline ??= new QlooClient({ transport: new FixtureTransport(), cache: new MemoryCache() }));
  if (shared) return shared;
  const env = readEnv();
  shared = env.fixtures || !env.qlooApiKey
    ? new QlooClient({ transport: new FixtureTransport(), cache: new MemoryCache() })
    : new QlooClient({ transport: new HttpTransport(env.qlooBaseUrl, env.qlooApiKeys), cache: new StoreCache(getStore()) });
  return shared;
}
