// Developer mode (dev server only, never in production): while "offline" is on, nothing leaves this machine.
// Qloo answers from fixtures, Gemini reads as not configured, and any other outside request fails like a dropped
// connection, which every caller already handles. The flag lives on globalThis so hot reloads keep it.

const g = globalThis as typeof globalThis & { __athenaOffline?: boolean; __athenaFetch?: typeof fetch };

export const devAllowed = () => process.env.NODE_ENV !== "production";

export function isOffline(): boolean {
  return devAllowed() && !!g.__athenaOffline;
}

export function setOffline(on: boolean) {
  if (!devAllowed()) return;
  g.__athenaOffline = on;
  if (!g.__athenaFetch) {
    const real = (g.__athenaFetch = globalThis.fetch);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (g.__athenaOffline) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const host = /^https?:\/\/([^/:]+)/.exec(url)?.[1];
        if (host && host !== "localhost" && host !== "127.0.0.1") return Promise.reject(new TypeError(`offline (dev): ${host}`));
      }
      return real(input, init);
    }) as typeof fetch;
  }
}
