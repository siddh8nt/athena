import "server-only";
import { safeUrl } from "@/lib/agent/intake";

/**
 * Fetches a URL that came from outside Athena (a model's citation, a podcast feed): https and public hostnames
 * only, and every redirect is checked the same way, so a link can't reach Cloud Run's metadata server or any
 * other internal address. Returns undefined instead of throwing.
 */
export async function safeFetch(url: string, init: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response | undefined> {
  let next = safeUrl(url);
  const signal = AbortSignal.timeout(init.timeoutMs ?? 10_000);
  for (let hop = 0; next && hop < 4; hop++) {
    try {
      const res = await fetch(next, { headers: init.headers, signal, redirect: "manual" });
      if (res.status < 300 || res.status >= 400) return res;
      const to = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      next = to ? safeUrl(new URL(to, next).toString()) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
