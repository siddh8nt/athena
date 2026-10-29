// The developer's pause (dev server only). Paused, the page stands still: no /api request starts, a response or stream
// already arriving is held at its next chunk, and every timer the page sets stops with its time left, so a paced
// stream, a typing line or a narrated wait picks up where it was. The server keeps working; what it sends waits in the
// stream until play. A deadline the caller set with AbortSignal.timeout ran while paused, so after a pause it no longer
// cancels that request; any other abort still does. Client-safe; installed once per page, never removed.

type Host = Pick<typeof globalThis, "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval" | "fetch">;

export type Pause = {
  readonly paused: boolean;
  pause(): void;
  play(): void;
  /** Called with the new state on every change. */
  subscribe(fn: (paused: boolean) => void): () => void;
};

type Timer = { fn: () => void; ms: number; every: boolean; due: number; real?: ReturnType<typeof setTimeout> };

export function installPause(host: Host, isHeld: (url: string) => boolean, now: () => number = Date.now): Pause {
  const real = { setTimeout: host.setTimeout.bind(host), clearTimeout: host.clearTimeout.bind(host), fetch: host.fetch.bind(host) };
  const timers = new Map<number, Timer>();
  const listeners = new Set<(p: boolean) => void>();
  let seq = 1e9; // clear of the host's own ids
  let paused = false;
  let epoch = 0; // counts pauses, so a request can tell one happened while it ran
  let resume: { promise: Promise<void>; done: () => void } | undefined;

  const arm = (id: number, t: Timer, wait: number) => {
    t.due = now() + wait;
    t.real = real.setTimeout(() => {
      if (t.every) arm(id, t, t.ms);
      else timers.delete(id);
      t.fn();
    }, wait);
  };
  const add = (every: boolean) => (fn: unknown, ms?: number, ...args: unknown[]) => {
    if (typeof fn !== "function") return real.setTimeout(fn as never, ms);
    const id = ++seq;
    const t: Timer = { fn: () => fn(...args), ms: Math.max(0, Number(ms) || 0), every, due: 0 };
    timers.set(id, t);
    if (!paused) arm(id, t, t.ms);
    else t.due = t.ms; // while paused, `due` holds the time left
    return id;
  };
  const clear = (id: unknown) => {
    const t = timers.get(id as number);
    if (!t) return real.clearTimeout(id as never);
    if (t.real !== undefined) real.clearTimeout(t.real);
    timers.delete(id as number);
  };
  host.setTimeout = add(false) as never;
  host.setInterval = add(true) as never;
  host.clearTimeout = clear as never;
  host.clearInterval = clear as never;

  const gate = () => (paused && resume ? resume.promise : undefined);

  host.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isHeld(url)) return real.fetch(input, init);
    await gate();
    const theirs = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const own = new AbortController();
    const started = epoch;
    const forward = () => {
      const r = theirs?.reason as { name?: string } | undefined;
      if (r?.name === "TimeoutError" && (paused || epoch !== started)) return;
      own.abort(theirs?.reason);
    };
    if (theirs?.aborted) forward();
    else theirs?.addEventListener("abort", forward, { once: true });
    const res = await real.fetch(input, { ...init, signal: own.signal });
    await gate();
    if (!res.body) return res;
    const reader = res.body.getReader();
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(c) {
          const r = await reader.read();
          await gate();
          if (r.done) c.close();
          else c.enqueue(r.value);
        },
        cancel: (reason) => reader.cancel(reason),
      },
      { highWaterMark: 0 },
    );
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  }) as typeof fetch;

  const tell = () => listeners.forEach((fn) => fn(paused));
  return {
    get paused() {
      return paused;
    },
    pause() {
      if (paused) return;
      paused = true;
      epoch++;
      let done!: () => void;
      resume = { promise: new Promise<void>((r) => (done = r)), done };
      const t0 = now();
      for (const t of timers.values()) {
        if (t.real !== undefined) real.clearTimeout(t.real);
        t.real = undefined;
        t.due = Math.max(0, t.due - t0);
      }
      tell();
    },
    play() {
      if (!paused) return;
      paused = false;
      for (const [id, t] of timers) arm(id, t, t.due);
      resume?.done();
      resume = undefined;
      tell();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
