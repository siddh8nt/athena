"use client";

import { useEffect, useState } from "react";

// Developer mode (dev server only; the layout leaves it out of production builds). It wraps the browser's fetch for
// /api/*: in Record it saves every response to /.cache/dev with a snapshot of the app after it; in Replay it serves
// the recorded response (the exact request, else the closest from the same brand's run) and turns the server offline,
// so a request with no recording (a brand never recorded) gets fixtures and no Gemini, and nothing reaches Qloo or Google.

export type DevMode = "live" | "record" | "replay";
const MODE = "athena:dev:mode";
const COUNT = "athena:dev:count";

export function devMode(): DevMode {
  try {
    const m = localStorage.getItem(MODE);
    return m === "record" || m === "replay" ? m : "live";
  } catch {
    return "live";
  }
}

/** Every athena:* key except developer mode's own, which a snapshot leaves alone. */
export function appStore(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith("athena:") && !k.startsWith("athena:dev:")) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}

export async function saveSnapshot(label: string, auto = false, route?: string) {
  const at = Date.now();
  const snapshot = { name: `${auto ? "auto" : "saved"}-${at}`, label, url: location.pathname + location.search, at, store: appStore(), auto, route };
  await devPost({ op: "save", snapshot });
}

export const devPost = (body: unknown) =>
  realFetch()("/api/dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const w = () => window as Window & { __athenaRealFetch?: typeof fetch; __athenaSynced?: Promise<unknown> };
const realFetch = () => w().__athenaRealFetch ?? window.fetch.bind(window);

function hash(s: string, seed: number) {
  let h = seed;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A request body as text: JSON and form fields as sent, files by name and size. */
function bodyText(b: BodyInit | null | undefined): string {
  if (b == null) return "";
  if (typeof b === "string") return b;
  if (b instanceof URLSearchParams) return b.toString();
  if (b instanceof FormData) return [...b.entries()].map(([k, v]) => `${k}=${typeof v === "string" ? v : `file:${v.name}:${v.size}`}`).join("&");
  return "";
}

/** A recorded body as a response; an event stream is paced out so the page moves as it did, only faster. */
function replayed(t: { status: number; type: string; body: string; ms: number }): Response {
  const headers = { "content-type": t.type || "application/json" };
  if (!t.type.includes("event-stream")) return new Response(t.body, { status: t.status, headers });
  const events = t.body.split("\n\n").filter((e) => e.trim());
  const gap = Math.min(80, 4000 / Math.max(1, events.length));
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      for (const e of events) {
        c.enqueue(enc.encode(`${e}\n\n`));
        await new Promise((r) => setTimeout(r, gap));
      }
      c.close();
    },
  });
  return new Response(stream, { status: t.status, headers });
}

/** The journey's brand as the page saved it, empty before onboarding names one: Replay keeps to that brand's run. */
function journeyBrand(): string {
  try {
    return (JSON.parse(localStorage.getItem("athena:journey:v1") ?? "null") as { brief?: { name?: { value?: string } } } | null)?.brief?.name?.value ?? "";
  } catch {
    return "";
  }
}

function bump(kind: "recorded" | "replayed" | "nearest" | "not recorded") {
  try {
    const c = JSON.parse(sessionStorage.getItem(COUNT) ?? "{}") as Record<string, number>;
    c[kind] = (c[kind] ?? 0) + 1;
    sessionStorage.setItem(COUNT, JSON.stringify(c));
    window.dispatchEvent(new Event("athena:dev"));
  } catch {}
}

function install() {
  const win = w();
  if (win.__athenaRealFetch) return;
  const real = (win.__athenaRealFetch = window.fetch.bind(window));
  const mode = devMode();
  win.__athenaSynced = devPost({ op: "mode", offline: mode === "replay" }).catch(() => undefined);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    const m = devMode();
    if (m === "live" || url.origin !== location.origin || !url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/dev")) return real(input, init);
    await win.__athenaSynced;
    const path = url.pathname;
    const req = `${url.search}|${bodyText(init?.body)}`;
    const key = `${hash(`${init?.method ?? "GET"} ${path} ${req}`, 2166136261)}${hash(req, 374761393)}`;
    if (m === "replay") {
      const hit = (await devPost({ op: "replay", path, key, req: bodyText(init?.body), brand: journeyBrand() }).catch(() => null)) as { tape: Parameters<typeof replayed>[0]; exact: boolean } | null;
      // The founder's files always reach the server: a recording would show another run's list, or drop a file added or
      // removed now. Offline mode keeps the server from paid calls, so keeping them costs nothing.
      if (hit && path !== "/api/uploads") {
        bump(hit.exact ? "replayed" : "nearest");
        return replayed(hit.tape);
      }
      bump("not recorded");
      return real(input, init);
    }
    const t0 = Date.now();
    const res = await real(input, init);
    if (!res.body) return res;
    const [mine, theirs] = res.body.tee();
    const recorded = new Response(mine)
      .text()
      .then(async (body) => {
        const tape = { path, key, req: bodyText(init?.body), status: res.status, type: res.headers.get("content-type") ?? "", body, at: Date.now(), ms: Date.now() - t0 };
        await devPost({ op: "record", tape });
        bump("recorded");
      })
      .catch(() => undefined);
    // The page plays a stream's events out paced, so it can still be applying them after the network stream ends. The
    // snapshot waits for the page itself to read the end, then a moment for it to store what changed.
    return new Response(endsAt(theirs, () => void recorded.then(() => setTimeout(() => void saveSnapshot(path.replace("/api/", ""), true, path), 1500))), { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

/** The same body, calling `onEnd` when its reader reaches the end: read on demand, so the reader's pace is kept. */
function endsAt(body: ReadableStream<Uint8Array>, onEnd: () => void): ReadableStream<Uint8Array> {
  const src = body.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(c) {
        const { done, value } = await src.read();
        if (done) {
          c.close();
          onEnd();
        } else c.enqueue(value);
      },
      cancel: (why) => src.cancel(why),
    },
    { highWaterMark: 0 },
  );
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") install();

const THEN = "athena:dev:then";

/** A step map card's clicks after its page loads, for a feature behind a click (a theme of the Brand Graph, a tab).
 *  Each is a CSS selector, with `::text` to take the first match whose text or label starts with it. */
export function setThen(clicks: string[] | undefined) {
  if (clicks?.length) localStorage.setItem(THEN, JSON.stringify(clicks));
  else localStorage.removeItem(THEN);
}

async function runThen() {
  let clicks: string[];
  try {
    clicks = JSON.parse(localStorage.getItem(THEN) ?? "[]");
  } catch {
    clicks = [];
  }
  localStorage.removeItem(THEN);
  for (const c of clicks) {
    const [sel, text] = c.split("::");
    // A server-rendered page (the share page) shows its buttons before React hydrates them: a click then is lost, so
    // an element counts only once React has attached to it.
    const live = (el: HTMLElement) => Object.keys(el).some((k) => k.startsWith("__reactProps"));
    const find = () =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((el) => live(el) && (!text || (el.textContent ?? "").trim().startsWith(text) || (el.getAttribute("aria-label") ?? "").startsWith(text)));
    let el = find();
    // The page restores its state and draws in its own time: wait for the element, up to ten seconds.
    for (let i = 0; !el && i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      el = find();
    }
    if (!el) return;
    // Hydration attaches props before it commits, and a page that restores its state draws again after: a click in
    // between is dropped, so let the page settle first. A name or a source opens a card, so try again until one shows.
    const card = el.getAttribute("aria-haspopup") === "dialog";
    for (let i = 0; i < (card ? 5 : 1); i++) {
      await new Promise((r) => setTimeout(r, 400));
      el = find() ?? el;
      el.scrollIntoView({ block: "center" });
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
      if (!card || document.querySelector("[role=dialog]")) break;
    }
  }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  if (document.readyState === "complete") void runThen();
  else window.addEventListener("load", () => void runThen());
}

/** A small pill in the corner while Record or Replay is on, linking to the step map. */
export function DevTape() {
  const [mode, setMode] = useState<DevMode>("live");
  const [count, setCount] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => {
      setMode(devMode());
      try {
        setCount(JSON.parse(sessionStorage.getItem(COUNT) ?? "{}"));
      } catch {}
    };
    read();
    window.addEventListener("athena:dev", read);
    return () => window.removeEventListener("athena:dev", read);
  }, []);
  const [saved, setSaved] = useState(false);
  // On a phone the pills shrink to a word each, so they cover as little of the composer as they can.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 760px)");
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  if (mode === "live") return null;
  const parts = Object.entries(count).map(([k, n]) => `${n} ${k}`);
  const pill = { font: "600 11px/1.2 var(--font-label), sans-serif", padding: "6px 10px", borderRadius: 999, background: mode === "record" ? "#b42318" : "#1d4ed8", color: "#fff", textDecoration: "none", border: 0, cursor: "pointer" } as const;
  const save = async () => {
    const label = window.prompt("Name this snapshot", document.title);
    if (label === null) return;
    await saveSnapshot(label || "Snapshot");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  // Above Next's own dev pill, which sits in the bottom-left corner.
  return (
    <div style={{ position: "fixed", left: 12, bottom: 64, zIndex: 9999, display: "flex", gap: 6, opacity: 0.88 }}>
      <a href="/dev" style={pill} title={`DEV · ${mode}${parts.length ? ` · ${parts.join(", ")}` : ""}`}>
        {narrow ? (mode === "record" ? "Rec" : "Play") : `DEV · ${mode}${parts.length ? ` · ${parts.join(", ")}` : ""}`}
      </a>
      <button type="button" onClick={save} style={pill}>
        {saved ? "Saved" : narrow ? "Snap" : "Save snapshot"}
      </button>
    </div>
  );
}
