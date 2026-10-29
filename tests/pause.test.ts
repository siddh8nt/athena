import { describe, expect, it } from "vitest";
import { installPause } from "@/lib/pause";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function host(fetch: typeof globalThis.fetch = async () => new Response("ok")) {
  return { setTimeout, clearTimeout, setInterval, clearInterval, fetch };
}

/** A response streamed in the given chunks, one every `gap` ms. */
function streamed(chunks: string[], gap: number) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(c) {
        for (const s of chunks) {
          await sleep(gap);
          c.enqueue(enc.encode(s));
        }
        c.close();
      },
    }),
  );
}

describe("the developer's pause", () => {
  it("stops a timer with its time left and carries it on at play", async () => {
    const h = host();
    const p = installPause(h, () => true);
    let fired = 0;
    h.setTimeout(() => fired++, 60);
    await sleep(30);
    p.pause();
    await sleep(80);
    expect(fired).toBe(0);
    p.play();
    await sleep(10);
    expect(fired).toBe(0); // about 30 ms still to go
    await sleep(40);
    expect(fired).toBe(1);
  });

  it("holds intervals while paused and lets clearTimeout cancel a paused timer", async () => {
    const h = host();
    const p = installPause(h, () => true);
    let ticks = 0;
    let late = 0;
    const id = h.setInterval(() => ticks++, 15);
    const t = h.setTimeout(() => late++, 100);
    await sleep(40);
    p.pause();
    const at = ticks;
    h.clearTimeout(t);
    await sleep(60);
    expect(ticks).toBe(at);
    p.play();
    await sleep(40);
    expect(ticks).toBeGreaterThan(at);
    expect(late).toBe(0);
    h.clearInterval(id);
  });

  it("starts no held request while paused, and lets others through", async () => {
    const sent: string[] = [];
    const h = host(async (u) => (sent.push(String(u)), new Response("ok")));
    const p = installPause(h, (u) => u.startsWith("/api/"));
    p.pause();
    const held = h.fetch("/api/fits");
    await h.fetch("https://example.com/x");
    await sleep(20);
    expect(sent).toEqual(["https://example.com/x"]);
    p.play();
    expect(await (await held).text()).toBe("ok");
    expect(sent).toEqual(["https://example.com/x", "/api/fits"]);
  });

  it("holds a stream at its next chunk and hands it on at play", async () => {
    const h = host(async () => streamed(["a", "b", "c"], 15));
    const p = installPause(h, () => true);
    const reader = (await h.fetch("/api/agent")).body!.getReader();
    const dec = new TextDecoder();
    expect(dec.decode((await reader.read()).value)).toBe("a");
    p.pause();
    let got = "";
    const next = reader.read().then((r) => (got = dec.decode(r.value)));
    await sleep(80); // b and c have arrived by now, and wait
    expect(got).toBe("");
    p.play();
    await next;
    expect(got).toBe("b");
    expect(dec.decode((await reader.read()).value)).toBe("c");
    expect((await reader.read()).done).toBe(true);
  });

  it("drops a caller's timeout that ran during a pause, but not a plain abort", async () => {
    const h = host(
      (_u, init) =>
        new Promise((ok, no) => {
          if (init?.signal?.aborted) return no(init.signal.reason);
          const t = setTimeout(() => ok(new Response("late")), 80);
          init?.signal?.addEventListener("abort", () => (clearTimeout(t), no(init.signal!.reason)));
        }),
    );
    const p = installPause(h, () => true);
    const timedOut = h.fetch("/api/synthesize", { signal: AbortSignal.timeout(30) });
    p.pause();
    await sleep(50);
    p.play();
    expect(await (await timedOut).text()).toBe("late");

    const ctl = new AbortController();
    const cancelled = h.fetch("/api/graph", { signal: ctl.signal });
    p.pause();
    ctl.abort();
    p.play();
    await expect(cancelled).rejects.toBeDefined();
  });
});
