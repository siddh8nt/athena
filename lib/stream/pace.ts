// The pace of the work the founder watches. A stream served from the cache (a sample brand, a repeat run) arrives all
// at once; read without a pace, every step, line and choice would land in the same instant. Each event is let through
// only once a short, slightly varied gap has passed since the one before it, the time that kind of step takes to show.
// A live run's events already arrive further apart than these gaps, so they pass straight through. Client-safe.

type Paced = { type: string; event?: { status?: string }; status?: unknown };

/** Milliseconds an event of this kind waits after the previous one, before the jitter. */
export function gapFor(e: Paced): number {
  switch (e.type) {
    case "delta":
      return 20;
    case "event":
    case "step":
      // A call starting shows quickly; its result takes a moment longer, as the call would.
      return e.event?.status === "running" ? 420 : 640;
    case "status":
      return 360;
    case "ask":
    case "question":
      return 900;
    case "reply":
    case "answer":
    case "result":
    case "work":
    case "brief":
    case "block":
    case "card":
    case "checklist":
    case "assign":
    case "goals":
    case "custom":
    case "galaxy":
      return 700;
    case "done":
      return 0;
    default:
      return 260;
  }
}

/** A gate for one stream: await it with each event before handling that event. */
export function pacer(gap: (e: Paced) => number = gapFor) {
  let last = 0;
  return async (e: Paced) => {
    const base = gap(e);
    const wait = last + base * (0.7 + Math.random() * 0.6) - Date.now();
    if (base > 0 && wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  };
}
